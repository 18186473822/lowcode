/**
 * 页面存储模型与仓储契约（对应方案 8.4）：
 *
 * ```
 * pages(id, app_id, name, type, current_version, status)
 * page_versions(id, page_id, version, schema JSON, created_by, created_at, note)
 *       ↑ 发布即插入一条；回滚 = 把某条 version 复制为新的 current draft
 * ```
 *
 * 骨架阶段用单个 JSON 文件承载两张表的合并视图；Phase 1 换 Prisma + PostgreSQL 时
 * 只需另写一个 `PageRepository` 实现（本接口不变）。
 */
import type { PageSchema } from '@lc/schema'

/**
 * 页面状态：
 * - `published` —— 草稿与当前发布版本一致（无未发布改动）
 * - `draft`     —— 存在未发布改动（含从未发布过的页面）
 */
export type PageStatus = 'draft' | 'published'

/** 一条不可变的发布版本（对应 page_versions 表的一行） */
export interface PageVersionRecord {
  version: number
  schema: PageSchema
  createdBy: string
  createdAt: string
  note?: string
}

/** 页面记录（pages 行 + 草稿 + 全部历史版本） */
export interface PageRecord {
  id: string
  appId: string
  name: string
  type: string
  status: PageStatus
  /** 最近一次发布的版本号；0 = 从未发布 */
  currentVersion: number
  /** 当前草稿；null = 尚未保存过 */
  draft: PageSchema | null
  draftUpdatedAt?: string
  draftUpdatedBy?: string
  versions: PageVersionRecord[]
  createdAt: string
  updatedAt: string
}

/** 仓储契约：骨架阶段为 JSON 文件实现，Phase 1 换数据库实现 */
export interface PageRepository {
  find(id: string): Promise<PageRecord | null>
  /** 全量页面记录（应用菜单 `GET /apps/bootstrap` 用）；目录不存在时返回 `[]` */
  list(): Promise<PageRecord[]>
  save(record: PageRecord): Promise<void>
  /**
   * 删除整条页面记录（含全部历史版本，二者同文件故一次删除即无孤儿）。
   * 返回 `false` 表示本来就不存在（由 service 转成 404，避免仓储层抛业务异常）。
   */
  remove(id: string): Promise<boolean>
}

/** DI token：页面仓储 */
export const PAGE_REPOSITORY = 'LC:PAGE_REPOSITORY'
