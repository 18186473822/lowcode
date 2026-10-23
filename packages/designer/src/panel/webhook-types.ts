/** Webhook 管理面板的类型契约（与 apps/server/src/webhook 的对外视图保持一致）。 */

export type WebhookEventType =
  | 'record.created'
  | 'record.updated'
  | 'record.deleted'
  | 'flow.started'
  | 'flow.task.approved'
  | 'flow.task.rejected'
  | 'flow.completed'
  | 'flow.rejected'

export const WEBHOOK_EVENT_OPTIONS: Array<{ value: '*' | WebhookEventType; label: string }> = [
  { value: '*', label: '全部事件' },
  { value: 'record.created', label: '记录创建' },
  { value: 'record.updated', label: '记录更新' },
  { value: 'record.deleted', label: '记录删除' },
  { value: 'flow.started', label: '流程发起' },
  { value: 'flow.task.approved', label: '任务通过' },
  { value: 'flow.task.rejected', label: '任务驳回' },
  { value: 'flow.completed', label: '流程完成' },
  { value: 'flow.rejected', label: '流程驳回' },
]

export interface WebhookSubscription {
  id: string
  name: string
  description?: string
  url: string
  events: string[]
  headers: Record<string, string>
  rateLimitPerMinute: number
  previousSecretExpiresAt?: string
  previousSecretPreview?: string
  active: boolean
  maxAttempts: number
  timeoutMs: number
  revision: number
  secretPreview: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface WebhookDeliveryAttempt {
  attempt: number
  at: string
  ok: boolean
  status?: number
  durationMs: number
  responseBody?: string
  error?: string
}

export interface WebhookDelivery {
  id: string
  subscriptionId: string
  eventId: string
  eventType: string
  source: 'event' | 'test'
  status: 'pending' | 'success' | 'failed'
  attempts: WebhookDeliveryAttempt[]
  attemptCount: number
  nextAttemptAt: string
  lastAttemptAt?: string
  responseStatus?: number
  responseBody?: string
  error?: string
  leaseOwner?: string
  leaseExpiresAt?: string
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

export interface WebhookMetrics {
  total: number
  pending: number
  success: number
  failed: number
  oldestPendingAt?: string
  last24hTotal: number
  last24hSuccess: number
  last24hFailed: number
  generatedAt: string
  failureRate: number
  thresholds: { failureRate: number; queueDepth: number; pendingAgeMs: number }
  alerts: string[]
  ok: boolean
}

export interface WebhookListItem {
  items: WebhookSubscription[]
}

export interface WebhookWriteResult {
  data: WebhookSubscription
  etag?: string
}

export interface WebhookApi {
  list(): Promise<WebhookListItem>
  create(body: Record<string, unknown>): Promise<WebhookWriteResult & { secret: string }>
  update(id: string, body: Record<string, unknown>, ifMatch?: string): Promise<WebhookWriteResult>
  remove(id: string, ifMatch?: string): Promise<void>
  rotate(id: string, graceSeconds: number, ifMatch?: string): Promise<WebhookWriteResult & { secret: string }>
  test(id: string): Promise<{ data: WebhookDelivery; etag?: string }>
  deliveries(id: string, query?: { status?: string; page?: number; size?: number }): Promise<WebhookDeliveryPage>
  metrics(): Promise<WebhookMetrics>
  cleanup(): Promise<{ archived: number }>
}
