/**
 * 安全审计事件类型与仓储契约（Phase 4 · 安全审计，2026-10-27）。
 *
 * 记录**服务端判定为拒绝**的安全事件，用于发现撞库、越权探测与限流触发：
 * - `login_failed`：登录口令错误 / 用户不存在 / 账号禁用；
 * - `unauthorized`：缺少/非法令牌导致 401（登录接口除外，避免与 login_failed 重复）；
 * - `forbidden`：权限判定 403（RBAC、创建者归属、页面可见性等）；
 * - `rate_limited`：触发限流 429。
 *
 * 设计取舍：
 * - **只记拒绝，不记成功**，避免把审计表变成访问日志（成功的访问已有结构化日志）；
 * - 写入是旁路：任何存储失败只告警，绝不影响原请求；
 * - JSON 模式环形保留 2000 条；MySQL 模式持久保留，由运维按需归档。
 */

export type AuditEventType = 'login_failed' | 'unauthorized' | 'forbidden' | 'rate_limited'

/** 落库形状（`id` / `at` 由服务端生成） */
export interface AuditEvent {
  id: string
  /** 服务端时间（ISO） */
  at: string
  type: AuditEventType
  /** 登录失败时为尝试的用户名；其余为当前登录用户 */
  username?: string
  /** 客户端 IP（信任代理时取 X-Forwarded-For 首跳） */
  ip: string
  method: string
  /** 不含查询串，便于聚合 */
  path: string
  status: number
  /** 业务错误码，如 INVALID_CREDENTIALS / PERMISSION_DENIED / RATE_LIMITED */
  code?: string
  /** UA 截断后留存，辅助识别脚本 */
  userAgent?: string
}

/** 记录入参（id/at 由服务层补） */
export type AuditEventInput = Omit<AuditEvent, 'id' | 'at'>

export interface AuditListQuery {
  type?: string
  username?: string
  since?: string
  limit?: string | number
}

export interface AuditListResult {
  items: AuditEvent[]
  total: number
}

/** 仓储：JSON 实现按环形上限裁剪；MySQL 实现持久保留 */
export interface AuditRepository {
  append(event: AuditEvent): Promise<void>
  list(): Promise<AuditEvent[]>
}

/** JSON 模式最多保留条数（超出丢最旧） */
export const AUDIT_EVENT_LIMIT = 2000
/** 单次查询默认 / 最大条数 */
export const AUDIT_LIST_DEFAULT = 100
export const AUDIT_LIST_MAX = 500

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY')
