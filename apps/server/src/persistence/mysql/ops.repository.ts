/**
 * 运维事件 MySQL 仓储（Phase 4 数据库第二批；追加写入改造）。
 *
 * 写入不再整表 delete + create：事务内先插入本批事件，再按自增 `seq`
 * 淘汰超出上限的最旧行。这样并发上报不会因为「后写整表」覆盖先写；
 * 多实例同时裁剪时仍可能在极短时间内略超上限，下一次上报会继续收敛。
 * 查询仍按 `seq` 正序，保证同毫秒事件顺序稳定。
 */
import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type PrismaClient } from '@prisma/client'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type { OpsAppendResult, OpsEvent, OpsRepository } from '../../ops/ops.types.js'

function date(value: string, fallback = new Date()): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function fromPageVersion(value: string | null): OpsEvent['pageVersion'] | undefined {
  if (value === null) return undefined
  if (value === 'draft') return 'draft'
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function toPageVersion(value: OpsEvent['pageVersion']): string | null {
  if (value === undefined) return null
  return value === 'draft' ? 'draft' : String(value)
}

function asDetail(value: Prisma.JsonValue): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function toRow(event: OpsEvent) {
  return {
    id: event.id,
    type: event.type,
    name: event.name,
    pageId: event.pageId ?? null,
    pageVersion: toPageVersion(event.pageVersion),
    source: event.source,
    userId: event.userId ?? null,
    message: event.message ?? null,
    durationMs: event.durationMs ?? null,
    detailJson:
      event.detail === undefined
        ? Prisma.DbNull
        : (event.detail as Prisma.InputJsonValue),
    at: date(event.at),
  }
}

@Injectable()
export class MysqlOpsRepository implements OpsRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async list(): Promise<OpsEvent[]> {
    const rows = await this.prisma.opsEvent.findMany({ orderBy: { seq: 'asc' } })
    return rows.map((row) => {
      const pageVersion = fromPageVersion(row.pageVersion)
      const detail = asDetail(row.detailJson)
      return {
        id: row.id,
        type: row.type as OpsEvent['type'],
        name: row.name,
        ...(row.pageId ? { pageId: row.pageId } : {}),
        ...(pageVersion !== undefined ? { pageVersion } : {}),
        source: row.source as OpsEvent['source'],
        ...(row.userId ? { userId: row.userId } : {}),
        ...(row.message !== null ? { message: row.message } : {}),
        ...(row.durationMs !== null ? { durationMs: row.durationMs } : {}),
        ...(detail ? { detail } : {}),
        at: row.at.toISOString(),
      }
    })
  }

  async append(events: OpsEvent[], limit: number): Promise<OpsAppendResult> {
    return this.prisma.$transaction(async (tx) => {
      if (events.length > 0) {
        await tx.opsEvent.createMany({ data: events.map(toRow) })
      }
      const rows = await tx.opsEvent.findMany({
        orderBy: { seq: 'asc' },
        select: { seq: true },
      })
      const max = Math.max(0, Math.floor(limit))
      const overflow = Math.max(0, rows.length - max)
      let dropped = 0
      if (overflow > 0) {
        const doomed = rows.slice(0, overflow).map((row) => row.seq)
        const result = await tx.opsEvent.deleteMany({ where: { seq: { in: doomed } } })
        dropped = result.count
      }
      return { total: rows.length - dropped, dropped }
    })
  }
}
