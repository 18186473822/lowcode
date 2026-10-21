/**
 * 运维事件（埋点 / 错误 / 性能）类型与仓储契约（Phase 3 批 5，D-P3-12）。
 *
 * 与方案 8.2 `ops/`（操作审计、埋点上报、日志）对齐的最小实现：
 * **一张事件表**（JSON 文件，环形上限 500 条），三端共用一个上报形状，
 * 查询侧按 `type` / `pageId` / `since` 过滤，汇总侧给错误数与 perf 分位。
 *
 * 为什么不做多表 / 时序库：单机文件仓储（D-9 风格）够用且零依赖；
 * 事件只用于「出问题能查到现场」，不是分析型数仓（后续接 OTel 时替换本模块）。
 */

export type OpsEventType = 'error' | 'perf' | 'event'
export type OpsSource = 'runtime' | 'designer' | 'server'

/** 落库形状（`id` / `at` / `userId` 由服务端补，客户端伪造无效） */
export interface OpsEvent {
  id: string
  type: OpsEventType
  /** 事件名：`expr` / `schema-load` / `render` / `unsupported-action` … */
  name: string
  pageId?: string
  pageVersion?: number | 'draft'
  source: OpsSource
  /** 服务端从登录态取，忽略客户端传值（防冒充） */
  userId?: string
  message?: string
  durationMs?: number
  detail?: Record<string, unknown>
  /** 服务端接收时间（ISO） */
  at: string
}

/** 客户端上报形状 */
export interface OpsEventInput {
  type: OpsEventType
  name: string
  pageId?: string
  pageVersion?: number | 'draft'
  source?: OpsSource
  message?: string
  durationMs?: number
  detail?: Record<string, unknown>
}

/** 追加结果：落库后总条数 + 本次被环形上限淘汰的旧事件数 */
export interface OpsAppendResult {
  total: number
  dropped: number
}

/**
 * 仓储：读正序（旧 → 新）；写入是**追加 + 裁剪**，不再整表覆盖。
 *
 * `append` 必须在实现内完成「插入 → 淘汰最旧 → 返回总数」，避免 service
 * 先读整表再写回时被并发上报后写覆盖先写。JSON 实现用单进程写队列串行化，
 * MySQL 实现用事务插入后按 `seq` 删除超出 `limit` 的最旧行。
 */
export interface OpsRepository {
  list(): Promise<OpsEvent[]>
  append(events: OpsEvent[], limit: number): Promise<OpsAppendResult>
}

/** 内存中最多保留多少条（超出丢最旧，避免文件无限增长） */
export const OPS_EVENT_LIMIT = 500
/** 单次上报最多多少条（防误用把单请求写成全量同步） */
export const OPS_BATCH_MAX = 50
/** `detail` 序列化后的字符上限（超出转为截断标记） */
export const OPS_DETAIL_MAX = 2000

export const OPS_REPOSITORY = Symbol('OPS_REPOSITORY')
