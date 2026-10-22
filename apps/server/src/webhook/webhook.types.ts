/**
 * Webhook 订阅 / 投递存储模型与仓储契约（Phase 4 开放集成第二批）。
 *
 * 设计要点：
 * - **订阅与投递日志分表**：订阅是配置，投递日志只追加/更新状态；删除订阅不删日志，保留审计。
 * - **投递日志保存每次尝试**：`attempts` 为数组（时间、HTTP 状态、耗时、响应摘要、错误），
 *   便于外部系统排障；`attemptCount` 是计数器，避免每次重算。
 * - **JSON / MySQL 同构**：服务层只依赖 `WebhookRepository`，`LC_STORAGE=json` 走文件，
 *   `mysql` 走 Prisma；两种实现的字段形状完全一致。
 * - **至少一次投递**：投递记录先落盘再由 worker 发送；worker 崩溃/重启后仍会从 pending 继续。
 *   HTTP 接收方必须用事件 `id` 或 `X-LC-Delivery` 做幂等。
 */

/** 当前支持订阅的业务事件（新增事件时必须同步 protocol.md 与 openapi.ts）。 */
export const WEBHOOK_EVENT_TYPES = [
  'record.created',
  'record.updated',
  'record.deleted',
  'flow.started',
  'flow.task.approved',
  'flow.task.rejected',
  'flow.completed',
  'flow.rejected',
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

/** 订阅全部业务事件。 */
export const WEBHOOK_WILDCARD = '*'

/** 测试投递事件：只能由 `POST /webhooks/:id/test` 产生，不允许直接订阅。 */
export const WEBHOOK_TEST_EVENT = 'webhook.test'

export type WebhookDeliveryEventType = WebhookEventType | typeof WEBHOOK_TEST_EVENT

/** 事件信封（投递 body 的根对象）。 */
export interface WebhookEventEnvelope {
  /** 事件唯一 id；同一事件投递给多个订阅时保持一致，接收方用于幂等 */
  id: string
  type: WebhookDeliveryEventType
  /** 服务端产生事件的时间（ISO 8601） */
  occurredAt: string
  /** 触发人用户名；系统内部补偿等场景可能为 `system` */
  actor: string
  data: Record<string, unknown>
}

export interface WebhookSubscription {
  id: string
  name: string
  description?: string
  /** 只允许 http/https；生产默认拒绝内网地址，见 `LC_WEBHOOK_ALLOW_PRIVATE` */
  url: string
  /** `'*'` 或 `WebhookEventType` 的非空子集 */
  events: string[]
  /** HMAC-SHA256 签名密钥（管理接口默认脱敏，仅创建/轮换时返回明文） */
  secret: string
  active: boolean
  /** 最大投递次数（含首次），1~10 */
  maxAttempts: number
  /** 单次 HTTP 超时（毫秒），1000~30000 */
  timeoutMs: number
  /** 乐观锁版本；每次订阅写操作 +1 */
  revision: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 对外展示的订阅（密钥脱敏）。 */
export type WebhookSubscriptionView = Omit<WebhookSubscription, 'secret'> & {
  /** 形如 `abcd…wxyz`；完整密钥只在创建/轮换响应中出现 */
  secretPreview: string
}

export interface WebhookDeliveryAttempt {
  /** 第几次尝试，从 1 开始 */
  attempt: number
  at: string
  ok: boolean
  /** HTTP 状态码；网络错误/超时为 undefined */
  status?: number
  durationMs: number
  /** 响应体摘要（最多 2KB） */
  responseBody?: string
  /** 网络错误或非 2xx 的简述 */
  error?: string
}

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'success', 'failed'] as const
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number]

export interface WebhookDelivery {
  id: string
  subscriptionId: string
  /** 事件 id；同一事件投递给多个订阅时相同 */
  eventId: string
  eventType: WebhookDeliveryEventType
  /** 事件信封原文（写入时固定，重试不重新序列化，保证签名稳定） */
  payload: WebhookEventEnvelope
  /** event=业务事件；test=管理端测试投递（可绕过 active=false） */
  source: 'event' | 'test'
  status: WebhookDeliveryStatus
  attempts: WebhookDeliveryAttempt[]
  /** 已尝试次数（等于 attempts.length 的冗余列，便于 MySQL 排序/统计） */
  attemptCount: number
  /** 下次尝试时间；成功后不再使用 */
  nextAttemptAt: string
  lastAttemptAt?: string
  responseStatus?: number
  responseBody?: string
  error?: string
  /** 投递记录版本；每次状态变化 +1，用于管理端 ETag */
  revision: number
  createdAt: string
  updatedAt: string
}

export interface WebhookDeliveryPage {
  items: WebhookDelivery[]
  total: number
  page: number
  size: number
}

export interface WebhookDeliveryQuery {
  status?: WebhookDeliveryStatus
  eventType?: WebhookDeliveryEventType
  page: number
  size: number
}

/**
 * Webhook 仓储契约。
 *
 * - 订阅写操作均带 `expectedRevision`，CAS 失败返回 false（服务层转 409）；
 * - 删除订阅不级联删除投递日志；
 * - `dueDeliveries` 只返回 `pending` 且 `nextAttemptAt <= now` 的记录。
 */
export interface WebhookRepository {
  list(): Promise<WebhookSubscription[]>
  find(id: string): Promise<WebhookSubscription | null>
  create(subscription: WebhookSubscription): Promise<void>
  update(subscription: WebhookSubscription, expectedRevision: number): Promise<boolean>
  remove(id: string, expectedRevision: number): Promise<boolean>

  listDeliveries(subscriptionId: string, query: WebhookDeliveryQuery): Promise<WebhookDeliveryPage>
  findDelivery(id: string): Promise<WebhookDelivery | null>
  createDeliveries(deliveries: WebhookDelivery[]): Promise<void>
  /** 投递状态更新；单进程 worker 由服务层 in-flight 集合串行化 */
  saveDelivery(delivery: WebhookDelivery): Promise<void>
  dueDeliveries(now: string, limit: number): Promise<WebhookDelivery[]>
}

/** DI token：Webhook 订阅/投递仓储 */
export const WEBHOOK_REPOSITORY = 'LC:WEBHOOK_REPOSITORY'

/** 判断事件名是否属于可订阅的业务事件。 */
export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === 'string' && (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value)
}

/** 判断事件名是否属于投递事件（业务事件或测试事件）。 */
export function isWebhookDeliveryEventType(value: unknown): value is WebhookDeliveryEventType {
  return value === WEBHOOK_TEST_EVENT || isWebhookEventType(value)
}

/** 订阅是否匹配某事件（`'*'` 命中全部业务事件；测试事件不参与订阅过滤）。 */
export function subscriptionMatches(subscription: WebhookSubscription, type: WebhookEventType): boolean {
  return subscription.events.includes(WEBHOOK_WILDCARD) || subscription.events.includes(type)
}
