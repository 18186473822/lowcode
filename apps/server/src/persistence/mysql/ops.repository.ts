/**
 * 运维事件 MySQL 仓储（Phase 4 数据库第二批）。
 *
 * `OpsRepository` 仍是「整表读 / 整表写」契约，表上限由 service 控制（500 条）；
 * 写入在事务内 delete + create，保留自增 `seq` 作为同毫秒事件的稳定顺序。
 */
import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type PrismaClient } from '@prisma/client'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type { OpsEvent, OpsRepository } from '../../ops/ops.types.js'

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

  async save(events: OpsEvent[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.opsEvent.deleteMany({})
      if (events.length === 0) return
      await tx.opsEvent.createMany({
        data: events.map((event) => ({
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
        })),
      })
    })
  }
}
