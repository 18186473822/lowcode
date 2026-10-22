/**
 * 数据模型与业务记录的存储模型 / 仓储契约（方案 8.5-B「JSON 通用表」起步）：
 *
 * ```
 * models/<modelId>.json            模型定义（ModelSchema + 审计字段）
 * data/<modelId>/<recordId>.json   业务记录（id + payload + 审计字段 + 软删标记）
 *       ↑ 对应方案 B 的 `data_{modelId}(id, payload, tenant_id...)`：
 *         Phase 2 升方案 A（动态建表）时只换这两个仓储实现（D-9 同款路线），service 层不动。
 * ```
 *
 * 软删：记录带 `deletedAt` 即视为删除，列表默认排除 —— 对应方案 8.3 `DELETE …（软删）`。
 */
import type { ModelSchema } from '@lc/schema'

/** 模型定义记录（models 表的一行：协议体 + 审计信息） */
export interface ModelEntity {
  schema: ModelSchema
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

/** 业务记录（data_<modelId> 表的一行） */
export interface DataRecordEntity {
  id: string
  /** 仅含模型声明字段的载荷（服务端 sanitize 后） */
  payload: Record<string, unknown>
  /** 记录行版本（乐观锁）；旧 JSON 文件缺失时按 0 处理 */
  revision?: number
  createdBy: string
  createdAt: string
  updatedBy?: string
  updatedAt: string
  /** 软删标记；存在即视为已删除 */
  deletedAt?: string
}

/** 模型仓储契约：骨架阶段为 JSON 文件实现，Phase 1 换数据库实现 */
export interface ModelRepository {
  find(id: string): Promise<ModelEntity | null>
  save(id: string, entity: ModelEntity): Promise<void>
  /** 列出全部模型定义（目录扫描；目录不存在返回空数组） */
  list(): Promise<ModelEntity[]>
}

/** 记录仓储契约：按模型分目录存放，一文件一行 */
export interface RecordRepository {
  find(modelId: string, recordId: string): Promise<DataRecordEntity | null>
  save(modelId: string, record: DataRecordEntity): Promise<void>
  /**
   * 乐观写：仅当当前 revision === expectedRevision 时写入。
   * 返回 false 表示版本已被推进（service 转 409 VERSION_CONFLICT）。
   */
  saveIfRevision(modelId: string, record: DataRecordEntity, expectedRevision: number): Promise<boolean>
  /** 列出某模型全部记录（含已软删，由 service 过滤） */
  list(modelId: string): Promise<DataRecordEntity[]>
}

/** DI token：模型仓储 */
export const MODEL_REPOSITORY = 'LC:MODEL_REPOSITORY'
/** DI token：记录仓储 */
export const RECORD_REPOSITORY = 'LC:RECORD_REPOSITORY'
