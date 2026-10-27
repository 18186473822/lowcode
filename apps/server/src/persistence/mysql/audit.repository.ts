/**
 * 安全审计 MySQL 仓储。
 *
 * 与 JSON 实现不同：MySQL 侧**不裁剪**，审计事件持久保留（由运维按归档策略处理）。
 * 查询按 `at` 正序返回，服务层再倒序。
 */
import { Inject, Injectable } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type { AuditEvent, AuditRepository } from '../../audit/audit.types.js'

function toRow(event: AuditEvent) {
  return {
    id: event.id,
    at: new Date(event.at),
    type: event.type,
    username: event.username ?? null,
    ip: event.ip,
    method: event.method,
    path: event.path,
    status: event.status,
    code: event.code ?? null,
    userAgent: event.userAgent ?? null,
  }
}

@Injectable()
export class MysqlAuditRepository implements AuditRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async append(event: AuditEvent): Promise<void> {
    await this.prisma.auditEvent.create({ data: toRow(event) })
  }

  async list(): Promise<AuditEvent[]> {
    const rows = await this.prisma.auditEvent.findMany({ orderBy: { at: 'asc' } })
    return rows.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      type: row.type as AuditEvent['type'],
      ...(row.username === null ? {} : { username: row.username }),
      ip: row.ip,
      method: row.method,
      path: row.path,
      status: row.status,
      ...(row.code === null ? {} : { code: row.code }),
      ...(row.userAgent === null ? {} : { userAgent: row.userAgent }),
    }))
  }
}
