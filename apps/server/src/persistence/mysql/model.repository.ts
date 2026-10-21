/**
 * 模型定义仓储的 MySQL 实现（Phase 4 数据库第一批）。
 *
 * 模型 Schema 是动态结构，整段保存在 `models.schema_json`；审计字段独立成列，
 * 便于后续按时间/创建人查询。上层 `ModelRepository` 契约不变。
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import type { ModelSchema } from '@lc/schema'
import type { ModelEntity, ModelRepository } from '../../model/model.types.js'

const SAFE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

function mapModel(row: {
  id: string
  schemaJson: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy: string
}): ModelEntity {
  return {
    schema: row.schemaJson as unknown as ModelSchema,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  }
}

export class MysqlModelRepository implements ModelRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(id: string): Promise<ModelEntity | null> {
    if (!SAFE_ID_RE.test(id)) return null
    const row = await this.prisma.modelDef.findUnique({ where: { id } })
    return row ? mapModel(row) : null
  }

  async save(id: string, entity: ModelEntity): Promise<void> {
    if (!SAFE_ID_RE.test(id)) {
      throw new Error(`非法模型 id：${id}`)
    }

    const data = {
      schemaJson: entity.schema as unknown as Prisma.InputJsonValue,
      createdAt: new Date(entity.createdAt),
      updatedAt: new Date(entity.updatedAt),
      createdBy: entity.createdBy,
      updatedBy: entity.updatedBy,
    }
    await this.prisma.modelDef.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }

  async list(): Promise<ModelEntity[]> {
    const rows = await this.prisma.modelDef.findMany({ orderBy: { id: 'asc' } })
    return rows.map(mapModel)
  }
}
