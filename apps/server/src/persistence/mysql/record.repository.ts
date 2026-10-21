/**
 * 业务记录仓储的 MySQL 实现（Phase 4 数据库第一批）。
 *
 * 所有模型共用 `data_records` 表，主键 `(model_id, id)` 与 JSON 模式
 * 「按模型分目录」的寻址语义一致；payload 为协议字段 JSON，软删保留行。
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import type { DataRecordEntity, RecordRepository } from '../../model/model.types.js'

const SAFE_MODEL_RE = /^[A-Za-z_][\w-]{0,63}$/
const SAFE_RECORD_RE = /^[A-Za-z0-9][\w-]{0,63}$/

function mapRecord(row: {
  id: string
  payload: Prisma.JsonValue
  createdBy: string
  createdAt: Date
  updatedBy: string | null
  updatedAt: Date
  deletedAt: Date | null
}): DataRecordEntity {
  return {
    id: row.id,
    payload: row.payload as unknown as Record<string, unknown>,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    ...(row.updatedBy === null ? {} : { updatedBy: row.updatedBy }),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt.toISOString() }),
  }
}

export class MysqlRecordRepository implements RecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(modelId: string, recordId: string): Promise<DataRecordEntity | null> {
    if (!SAFE_MODEL_RE.test(modelId) || !SAFE_RECORD_RE.test(recordId)) return null
    const row = await this.prisma.dataRecord.findUnique({
      where: { modelId_id: { modelId, id: recordId } },
    })
    return row ? mapRecord(row) : null
  }

  async save(modelId: string, record: DataRecordEntity): Promise<void> {
    if (!SAFE_MODEL_RE.test(modelId)) {
      throw new Error(`非法模型 id：${modelId}`)
    }
    if (!SAFE_RECORD_RE.test(record.id)) {
      throw new Error(`非法记录 id：${record.id}`)
    }

    const data = {
      payload: record.payload as unknown as Prisma.InputJsonValue,
      createdBy: record.createdBy,
      createdAt: new Date(record.createdAt),
      updatedBy: record.updatedBy ?? null,
      updatedAt: new Date(record.updatedAt),
      deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
    }
    await this.prisma.dataRecord.upsert({
      where: { modelId_id: { modelId, id: record.id } },
      create: { modelId, id: record.id, ...data },
      update: data,
    })
  }

  async list(modelId: string): Promise<DataRecordEntity[]> {
    if (!SAFE_MODEL_RE.test(modelId)) return []
    const rows = await this.prisma.dataRecord.findMany({
      where: { modelId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return rows.map(mapRecord)
  }
}
