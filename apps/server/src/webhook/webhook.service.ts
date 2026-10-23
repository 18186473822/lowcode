/**
 * Webhook 服务（Phase 4 开放集成第二批）。
 *
 * 生命周期：
 *  1. 业务写操作成功后调用 `emit()`；服务按 active + events 匹配订阅，落「事件 × 订阅」投递记录；
 *  2. `emit()` **只入队不发送**，HTTP 投递由后台 worker（默认每 5s）或管理端测试/重投触发；
 *  3. 成功（2xx）→ success；可重试失败（网络/超时/408/425/429/5xx）→ pending + 指数退避；
 *     不可重试失败或达到 maxAttempts → failed；
 *  4. 每次尝试写入 `attempts`，保留 HTTP 状态、耗时、响应摘要与错误，管理端可分页查询。
 *
 * 关键约束：
 * - **弱依赖**：`emit()` 内部全量 try-catch，任何 Webhook 故障只记日志，不影响记录/流程主链路；
 * - **至少一次**：先落投递记录再发送；worker 崩溃后重启会继续 pending；接收方必须用事件 id 幂等；
 * - **签名**：`X-LC-Signature: t=<unix>,v1=<hex hmac>`，签名内容为 `<t>.<原始 JSON body>`；
 * - **多副本**：投递行带 `leaseOwner/leaseExpiresAt`，MySQL 用 `FOR UPDATE SKIP LOCKED`、
 *   JSON 用文件锁原子领取；副本崩溃后租约到期自动可重领；
 * - **弱依赖**：清理/指标/限流/SSRF 校验失败都不影响业务主链路。
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import type { AuthUser } from '../common/jwt.service.js'
import { parseIfMatch } from '../common/etag.js'
import { RbacService } from '../rbac/rbac.service.js'
import {
  WEBHOOK_REPOSITORY,
  WEBHOOK_TEST_EVENT,
  WEBHOOK_WILDCARD,
  WEBHOOK_DELIVERY_STATUSES,
  isWebhookDeliveryEventType,
  isWebhookEventType,
  subscriptionMatches,
  type WebhookDelivery,
  type WebhookDeliveryEventType,
  type WebhookDeliveryPage,
  type WebhookDeliveryStats,
  type WebhookDeliveryStatus,
  type WebhookEventEnvelope,
  type WebhookEventType,
  type WebhookRepository,
  type WebhookSubscription,
  type WebhookSubscriptionView,
} from './webhook.types.js'

export const WEBHOOK_DEFAULT_MAX_ATTEMPTS = 5
export const WEBHOOK_DEFAULT_TIMEOUT_MS = 10_000
export const WEBHOOK_MAX_ATTEMPTS = 10
export const WEBHOOK_MIN_TIMEOUT_MS = 1_000
export const WEBHOOK_MAX_TIMEOUT_MS = 30_000
export const WEBHOOK_MAX_RESPONSE_BODY = 2_048
export const WEBHOOK_DEFAULT_WORKER_INTERVAL_MS = 5_000
export const WEBHOOK_DEFAULT_PAGE_SIZE = 20
export const WEBHOOK_MAX_PAGE_SIZE = 100
export const WEBHOOK_DEFAULT_LEASE_MS = 90_000
export const WEBHOOK_DEFAULT_RETENTION_DAYS = 30
export const WEBHOOK_DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000
export const WEBHOOK_DEFAULT_SECRET_GRACE_SECONDS = 24 * 60 * 60
export const WEBHOOK_MAX_SECRET_GRACE_SECONDS = 7 * 24 * 60 * 60
export const WEBHOOK_RATE_LIMIT_MAX = 6_000

/** 首次失败后依次等待 5s / 30s / 2min / 10min；超过数组长度按 10min。 */
export const WEBHOOK_RETRY_DELAYS_MS = [0, 5_000, 30_000, 120_000, 600_000] as const

const WEBHOOK_NAME_MAX = 64
const WEBHOOK_DESCRIPTION_MAX = 500
const WEBHOOK_URL_MAX = 2_048
const WEBHOOK_EVENTS_MAX = 20
const WEBHOOK_SECRET_MIN = 16
const WEBHOOK_SECRET_MAX = 128
const WEBHOOK_HEADERS_MAX = 20
const WEBHOOK_HEADER_NAME_MAX = 128
const WEBHOOK_HEADER_VALUE_MAX = 1_024
const WEBHOOK_SSRF_LOOKUP_TIMEOUT_MS = 3_000

/** HMAC-SHA256 签名；接收方用同一 secret 重算并做常量时间比较。 */
export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

/** 已失败 attemptCount 次后的下次重试间隔。 */
export function retryDelayMs(attemptCount: number): number {
  const index = Math.min(Math.max(attemptCount, 0), WEBHOOK_RETRY_DELAYS_MS.length - 1)
  return WEBHOOK_RETRY_DELAYS_MS[index] ?? 600_000
}

/** 这些状态码视为临时故障，可重试；其余 4xx 直接失败。 */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true
  return status === 408 || status === 425 || status === 429 || status >= 500
}

/** IPv4 私有/保留地址判断（SSRF 防护；仅判断字面量，不处理 DNS 解析）。 */
function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const [a, b, c] = parts.map(Number)
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0 && c === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === '::1' || h === '::') return true
  if (h.startsWith('fc') || h.startsWith('fd')) return true
  if (/^fe[89ab]/.test(h)) return true
  // IPv4-mapped：::ffff:127.0.0.1
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h)
  return mapped ? isPrivateIpv4(mapped[1]) : false
}

/** 内网/本机主机名与字面量地址判断（生产默认拒绝）。 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true
  }
  if (host.startsWith('[') || host.includes(':')) return isPrivateIpv6(host)
  return isPrivateIpv4(host)
}

/**
 * 校验并规范化 Webhook URL。
 * - 只允许 http/https；不允许 URL 内嵌账号口令；
 * - `blockPrivate=true` 时拒绝本机/内网字面量地址（生产默认开启，内部集成可设
 *   `LC_WEBHOOK_ALLOW_PRIVATE=1` 放行；DNS 解析后的地址仍需网关/出口策略兜底）。
 */
export function normalizeWebhookUrl(value: string, blockPrivate: boolean): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('url 必填')
  const raw = value.trim()
  if (raw.length > WEBHOOK_URL_MAX) throw new Error(`url 不能超过 ${WEBHOOK_URL_MAX} 个字符`)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('url 必须是合法的 http(s) 地址')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('url 只允许 http/https')
  if (url.username || url.password) throw new Error('url 不允许内嵌账号口令')
  if (blockPrivate && isPrivateHost(url.hostname)) {
    throw new Error('url 指向本机/内网地址，生产环境默认禁止（可设置 LC_WEBHOOK_ALLOW_PRIVATE=1）')
  }
  return url.toString()
}

/** DNS 解析到内网/保留地址时抛出；用于把 SSRF 拦截和普通网络错误区分开。 */
export class WebhookSsrfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookSsrfError'
  }
}

async function lookupWithTimeout(hostname: string): Promise<Array<{ address: string }>> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`DNS 解析超时（>${WEBHOOK_SSRF_LOOKUP_TIMEOUT_MS}ms）`)),
          WEBHOOK_SSRF_LOOKUP_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * DNS 级 SSRF 校验：字面量地址在同步解析阶段已拦截，这里补域名解析后的全部 A/AAAA。
 * 发送前会再次校验，降低「创建时 DNS 正常、执行时切到内网」的 DNS rebinding 风险。
 * 注：Node 原生 fetch 无法固定解析结果；生产仍应在出口网关限制 RFC1918 访问。
 */
export async function assertWebhookDestination(url: string, blockPrivate: boolean): Promise<void> {
  if (!blockPrivate) return
  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  if (isPrivateHost(host)) throw new WebhookSsrfError('url 指向本机/内网地址，生产环境默认禁止')
  // 公网字面量地址无需再解析；域名必须解析并逐个校验。
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return
  const addresses = await lookupWithTimeout(host)
  if (addresses.length === 0) throw new Error(`DNS 解析为空：${host}`)
  const blocked = addresses.find((item) => isPrivateHost(item.address))
  if (blocked) {
    throw new WebhookSsrfError(`url 域名解析到内网/保留地址（${blocked.address}），生产环境默认禁止`)
  }
}

const FORBIDDEN_HEADER_NAMES = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-authenticate',
])

/** 自定义请求头校验：禁止 CRLF、系统保留头与 X-LC-*，避免伪造签名/事件头。 */
export function validateWebhookHeaders(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {}
  if (!isPlainObject(value)) throw new Error('headers 必须是 JSON 对象')
  const entries = Object.entries(value)
  if (entries.length > WEBHOOK_HEADERS_MAX) throw new Error(`headers 最多 ${WEBHOOK_HEADERS_MAX} 项`)
  const headers: Record<string, string> = {}
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim().toLowerCase()
    if (!name || name.length > WEBHOOK_HEADER_NAME_MAX || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) {
      throw new Error(`headers 键名非法：${rawName}`)
    }
    if (FORBIDDEN_HEADER_NAMES.has(name) || name.startsWith('x-lc-')) {
      throw new Error(`headers 不允许覆盖系统保留头：${name}`)
    }
    if (typeof rawValue !== 'string') throw new Error(`headers.${name} 必须是字符串`)
    if (rawValue.length > WEBHOOK_HEADER_VALUE_MAX) {
      throw new Error(`headers.${name} 不能超过 ${WEBHOOK_HEADER_VALUE_MAX} 个字符`)
    }
    if (/[\r\n\0]/.test(rawValue)) throw new Error(`headers.${name} 不允许包含换行或 NUL`)
    headers[name] = rawValue
  }
  return headers
}

/** 订阅事件校验：`'*'` 必须单独使用；其余必须是已知事件。 */
export function validateWebhookEvents(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('events 必须是非空数组')
  if (value.length > WEBHOOK_EVENTS_MAX) throw new Error(`events 最多 ${WEBHOOK_EVENTS_MAX} 项`)
  const events: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('events 每项必须是字符串')
    if (item === WEBHOOK_WILDCARD) {
      if (value.length !== 1) throw new Error('events 使用 "*" 时不能与其他事件混用')
      return [WEBHOOK_WILDCARD]
    }
    if (!isWebhookEventType(item)) throw new Error(`未知事件类型：${item}`)
    if (!events.includes(item)) events.push(item)
  }
  return events
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function webhookInvalid(errors: string[]): BadRequestException {
  return new BadRequestException({
    code: 'WEBHOOK_INVALID',
    message: 'Webhook 配置校验失败',
    errors,
  })
}

function badQuery(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_QUERY', message })
}

export interface WebhookCreateInput {
  name: string
  description?: string
  url: string
  events: string[]
  secret?: string
  headers: Record<string, string>
  rateLimitPerMinute: number
  active: boolean
  maxAttempts: number
  timeoutMs: number
}

export interface WebhookPatch {
  name?: string
  description?: string | null
  url?: string
  events?: string[]
  headers?: Record<string, string>
  rateLimitPerMinute?: number
  active?: boolean
  maxAttempts?: number
  timeoutMs?: number
}

const CREATE_KEYS = [
  'name',
  'description',
  'url',
  'events',
  'secret',
  'headers',
  'rateLimitPerMinute',
  'active',
  'maxAttempts',
  'timeoutMs',
] as const

const PATCH_KEYS = [
  'name',
  'description',
  'url',
  'events',
  'headers',
  'rateLimitPerMinute',
  'active',
  'maxAttempts',
  'timeoutMs',
] as const

function validateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('name 必填')
  const name = value.trim()
  if (name.length > WEBHOOK_NAME_MAX) throw new Error(`name 不能超过 ${WEBHOOK_NAME_MAX} 个字符`)
  return name
}

function validateDescription(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error('description 必须是字符串')
  if (value.length > WEBHOOK_DESCRIPTION_MAX) throw new Error(`description 不能超过 ${WEBHOOK_DESCRIPTION_MAX} 个字符`)
  return value
}

function validateSecret(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length < WEBHOOK_SECRET_MIN || value.length > WEBHOOK_SECRET_MAX) {
    throw new Error(`secret 长度必须在 ${WEBHOOK_SECRET_MIN}~${WEBHOOK_SECRET_MAX} 个字符之间`)
  }
  return value
}

function validateBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} 必须是布尔值`)
  return value
}

function validateInteger(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} 必须是 ${min}~${max} 的整数`)
  }
  return value
}

/** 创建订阅入参校验（导出便于单测）。 */
export function parseCreateWebhookInput(body: unknown, blockPrivate: boolean): WebhookCreateInput {
  if (!isPlainObject(body)) throw webhookInvalid(['请求体必须是 JSON 对象'])
  const errors: string[] = []
  for (const key of Object.keys(body)) {
    if (!(CREATE_KEYS as readonly string[]).includes(key)) errors.push(`未知字段：${key}`)
  }

  let name = ''
  let url = ''
  let events: string[] = []
  let description: string | undefined
  let secret: string | undefined
  let headers: Record<string, string> = {}

  try {
    name = validateName(body.name)
  } catch (error) {
    errors.push((error as Error).message)
  }
  try {
    if (typeof body.url !== 'string') throw new Error('url 必填')
    url = normalizeWebhookUrl(body.url, blockPrivate)
  } catch (error) {
    errors.push((error as Error).message)
  }
  try {
    events = validateWebhookEvents(body.events)
  } catch (error) {
    errors.push((error as Error).message)
  }
  try {
    description = validateDescription(body.description)
  } catch (error) {
    errors.push((error as Error).message)
  }
  try {
    secret = validateSecret(body.secret)
  } catch (error) {
    errors.push((error as Error).message)
  }
  try {
    headers = validateWebhookHeaders(body.headers)
  } catch (error) {
    errors.push((error as Error).message)
  }

  let active = true
  let maxAttempts = WEBHOOK_DEFAULT_MAX_ATTEMPTS
  let timeoutMs = WEBHOOK_DEFAULT_TIMEOUT_MS
  let rateLimitPerMinute = 0
  try {
    if (hasOwn(body, 'rateLimitPerMinute')) {
      rateLimitPerMinute = validateInteger(body.rateLimitPerMinute, 'rateLimitPerMinute', 0, WEBHOOK_RATE_LIMIT_MAX)
    }
  } catch (error) {
    errors.push((error as Error).message)
  }
  try {
    if (hasOwn(body, 'active')) active = validateBoolean(body.active, 'active')
  } catch (error) {
    errors.push((error as Error).message)
  }
  try {
    if (hasOwn(body, 'maxAttempts')) {
      maxAttempts = validateInteger(body.maxAttempts, 'maxAttempts', 1, WEBHOOK_MAX_ATTEMPTS)
    }
  } catch (error) {
    errors.push((error as Error).message)
  }
  try {
    if (hasOwn(body, 'timeoutMs')) {
      timeoutMs = validateInteger(body.timeoutMs, 'timeoutMs', WEBHOOK_MIN_TIMEOUT_MS, WEBHOOK_MAX_TIMEOUT_MS)
    }
  } catch (error) {
    errors.push((error as Error).message)
  }

  if (errors.length > 0) throw webhookInvalid(errors)
  return {
    name,
    ...(description === undefined ? {} : { description }),
    url,
    events,
    ...(secret === undefined ? {} : { secret }),
    headers,
    rateLimitPerMinute,
    active,
    maxAttempts,
    timeoutMs,
  }
}

/** 更新订阅入参校验（secret 只能走 rotate-secret，避免误把密钥写进普通日志/表单）。 */
export function parsePatchWebhookInput(body: unknown, blockPrivate: boolean): WebhookPatch {
  if (!isPlainObject(body)) throw webhookInvalid(['请求体必须是 JSON 对象'])
  const errors: string[] = []
  for (const key of Object.keys(body)) {
    if (!(PATCH_KEYS as readonly string[]).includes(key)) errors.push(`未知字段：${key}`)
  }
  if (Object.keys(body).filter((key) => (PATCH_KEYS as readonly string[]).includes(key)).length === 0) {
    errors.push('至少提供一个可更新字段')
  }

  const patch: WebhookPatch = {}
  if (hasOwn(body, 'name')) {
    try {
      patch.name = validateName(body.name)
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  if (hasOwn(body, 'description')) {
    try {
      patch.description = body.description === null ? null : validateDescription(body.description)
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  if (hasOwn(body, 'url')) {
    try {
      if (typeof body.url !== 'string') throw new Error('url 必填')
      patch.url = normalizeWebhookUrl(body.url, blockPrivate)
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  if (hasOwn(body, 'events')) {
    try {
      patch.events = validateWebhookEvents(body.events)
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  if (hasOwn(body, 'headers')) {
    try {
      patch.headers = validateWebhookHeaders(body.headers)
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  if (hasOwn(body, 'rateLimitPerMinute')) {
    try {
      patch.rateLimitPerMinute = validateInteger(
        body.rateLimitPerMinute,
        'rateLimitPerMinute',
        0,
        WEBHOOK_RATE_LIMIT_MAX,
      )
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  if (hasOwn(body, 'active')) {
    try {
      patch.active = validateBoolean(body.active, 'active')
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  if (hasOwn(body, 'maxAttempts')) {
    try {
      patch.maxAttempts = validateInteger(body.maxAttempts, 'maxAttempts', 1, WEBHOOK_MAX_ATTEMPTS)
    } catch (error) {
      errors.push((error as Error).message)
    }
  }
  if (hasOwn(body, 'timeoutMs')) {
    try {
      patch.timeoutMs = validateInteger(body.timeoutMs, 'timeoutMs', WEBHOOK_MIN_TIMEOUT_MS, WEBHOOK_MAX_TIMEOUT_MS)
    } catch (error) {
      errors.push((error as Error).message)
    }
  }

  if (errors.length > 0) throw webhookInvalid(errors)
  return patch
}

/** 密钥脱敏：保留前 4 位与后 4 位，便于管理员辨认是哪一把。 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****'
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`
}

function toView(subscription: WebhookSubscription): WebhookSubscriptionView {
  const { secret, previousSecret, ...rest } = subscription
  const previousValid =
    previousSecret !== undefined &&
    subscription.previousSecretExpiresAt !== undefined &&
    subscription.previousSecretExpiresAt > new Date().toISOString()
  return {
    ...rest,
    secretPreview: maskSecret(secret),
    ...(previousValid ? { previousSecretPreview: maskSecret(previousSecret) } : {}),
  }
}

/** 轮换密钥请求体：可选宽限期（秒），0 表示立即失效。 */
export function parseRotateSecretInput(body: unknown): { graceSeconds: number } {
  const fallback = Number(process.env.LC_WEBHOOK_SECRET_GRACE_SECONDS ?? WEBHOOK_DEFAULT_SECRET_GRACE_SECONDS)
  const defaultGrace = Number.isInteger(fallback) && fallback >= 0 ? Math.min(fallback, WEBHOOK_MAX_SECRET_GRACE_SECONDS) : WEBHOOK_DEFAULT_SECRET_GRACE_SECONDS
  if (body === undefined || body === null) return { graceSeconds: defaultGrace }
  if (!isPlainObject(body)) throw webhookInvalid(['请求体必须是 JSON 对象'])
  const unknown = Object.keys(body).filter((key) => key !== 'graceSeconds')
  if (unknown.length > 0) throw webhookInvalid([`未知字段：${unknown.join(', ')}`])
  if (!hasOwn(body, 'graceSeconds')) return { graceSeconds: defaultGrace }
  try {
    return {
      graceSeconds: validateInteger(body.graceSeconds, 'graceSeconds', 0, WEBHOOK_MAX_SECRET_GRACE_SECONDS),
    }
  } catch (error) {
    throw webhookInvalid([(error as Error).message])
  }
}

function parsePositiveInt(raw: unknown, fallback: number, name: string, max?: number): number {
  if (raw === undefined) return fallback
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw badQuery(`${name} 必须是正整数`)
  const value = Number(raw)
  if (value < 1 || (max !== undefined && value > max)) {
    throw badQuery(max === undefined ? `${name} 必须 ≥ 1` : `${name} 取值 1~${max}`)
  }
  return value
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

export interface WebhookMetrics extends WebhookDeliveryStats {
  generatedAt: string
  /** 最近 24 小时失败率（0~1；无样本时为 0） */
  failureRate: number
  /** 告警阈值，便于前端展示/运维核对 */
  thresholds: {
    failureRate: number
    queueDepth: number
    pendingAgeMs: number
  }
  /** 人类可读告警；为空表示健康 */
  alerts: string[]
  ok: boolean
}

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(WebhookService.name)
  private timer?: NodeJS.Timeout
  private dispatching = false
  private readonly inFlight = new Set<string>()
  /** 本副本的租约标识（多副本部署时每个进程不同）。 */
  readonly workerId = randomUUID()
  private lastCleanupAt = 0
  private lastAlertAt = 0
  private lastAlertSignature = ''

  /** 测试可替换；生产使用 Node 原生 fetch。 */
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)

  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repo: WebhookRepository,
    // 显式 @Inject：vitest/esbuild 不 emit decorator metadata
    @Inject(RbacService) private readonly rbac: RbacService,
  ) {}

  /* ------------------------------ 生命周期 ------------------------------ */

  onModuleInit(): void {
    // 测试环境不启动后台定时器；用例通过 dispatchDue()/dispatchDelivery() 驱动，避免随机时序。
    if (process.env.NODE_ENV === 'test' || process.env.LC_WEBHOOK_WORKER === 'off') return
    const raw = Number(process.env.LC_WEBHOOK_WORKER_INTERVAL_MS ?? WEBHOOK_DEFAULT_WORKER_INTERVAL_MS)
    const interval = Number.isFinite(raw) && raw >= 1_000 ? raw : WEBHOOK_DEFAULT_WORKER_INTERVAL_MS
    this.timer = setInterval(() => {
      void this.dispatchDue()
    }, interval)
    // 不让定时器阻止进程退出（容器收到 SIGTERM 后仍能正常 shutdown）
    this.timer.unref()
    void this.dispatchDue()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  /* ------------------------------ 管理 API ------------------------------ */

  async list(user: AuthUser): Promise<{ items: WebhookSubscriptionView[] }> {
    await this.assertAdmin(user)
    const items = (await this.repo.list())
      .map(toView)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    return { items }
  }

  async get(user: AuthUser, id: string): Promise<WebhookSubscriptionView> {
    await this.assertAdmin(user)
    return toView(await this.mustSubscription(id))
  }

  async create(user: AuthUser, body: unknown): Promise<WebhookSubscriptionView & { secret: string }> {
    await this.assertAdmin(user)
    const input = parseCreateWebhookInput(body, this.blockPrivate)
    await this.assertDestination(input.url)
    const now = new Date().toISOString()
    const subscription: WebhookSubscription = {
      id: randomUUID(),
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      url: input.url,
      events: input.events,
      secret: input.secret ?? randomBytes(32).toString('hex'),
      headers: input.headers,
      rateLimitPerMinute: input.rateLimitPerMinute,
      active: input.active,
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
      revision: 0,
      createdBy: user.username,
      updatedBy: user.username,
      createdAt: now,
      updatedAt: now,
    }
    await this.repo.create(subscription)
    return { ...toView(subscription), secret: subscription.secret }
  }

  async update(
    user: AuthUser,
    id: string,
    body: unknown,
    ifMatch?: string,
  ): Promise<WebhookSubscriptionView> {
    await this.assertAdmin(user)
    const current = await this.mustSubscription(id)
    this.assertIfMatch(ifMatch, id, current.revision)
    const patch = parsePatchWebhookInput(body, this.blockPrivate)
    if (patch.url !== undefined) await this.assertDestination(patch.url)
    const now = new Date().toISOString()

    const next: WebhookSubscription = {
      ...current,
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.url === undefined ? {} : { url: patch.url }),
      ...(patch.events === undefined ? {} : { events: patch.events }),
      ...(patch.headers === undefined ? {} : { headers: patch.headers }),
      ...(patch.rateLimitPerMinute === undefined ? {} : { rateLimitPerMinute: patch.rateLimitPerMinute }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      ...(patch.maxAttempts === undefined ? {} : { maxAttempts: patch.maxAttempts }),
      ...(patch.timeoutMs === undefined ? {} : { timeoutMs: patch.timeoutMs }),
      revision: current.revision + 1,
      updatedBy: user.username,
      updatedAt: now,
    }
    if (patch.description === null) delete next.description
    else if (patch.description !== undefined) next.description = patch.description
    if (next.previousSecretExpiresAt !== undefined && next.previousSecretExpiresAt <= now) {
      delete next.previousSecret
      delete next.previousSecretExpiresAt
    }

    const saved = await this.repo.update(next, current.revision)
    if (!saved) {
      const latest = await this.repo.find(id)
      throw this.versionConflict(id, current.revision, latest?.revision ?? current.revision + 1)
    }
    return toView(next)
  }

  async remove(user: AuthUser, id: string, ifMatch?: string): Promise<{ id: string; deleted: true }> {
    await this.assertAdmin(user)
    const current = await this.mustSubscription(id)
    this.assertIfMatch(ifMatch, id, current.revision)
    const removed = await this.repo.remove(id, current.revision)
    if (!removed) {
      const latest = await this.repo.find(id)
      throw this.versionConflict(id, current.revision, latest?.revision ?? current.revision + 1)
    }
    return { id, deleted: true }
  }

  async rotateSecret(
    user: AuthUser,
    id: string,
    ifMatch?: string,
    body?: unknown,
  ): Promise<WebhookSubscriptionView & { secret: string }> {
    await this.assertAdmin(user)
    const current = await this.mustSubscription(id)
    this.assertIfMatch(ifMatch, id, current.revision)
    const { graceSeconds } = parseRotateSecretInput(body)
    const now = new Date().toISOString()
    const next: WebhookSubscription = {
      ...current,
      secret: randomBytes(32).toString('hex'),
      ...(graceSeconds > 0
        ? {
            previousSecret: current.secret,
            previousSecretExpiresAt: new Date(Date.now() + graceSeconds * 1000).toISOString(),
          }
        : {}),
      revision: current.revision + 1,
      updatedBy: user.username,
      updatedAt: now,
    }
    if (graceSeconds === 0) {
      delete next.previousSecret
      delete next.previousSecretExpiresAt
    }
    const saved = await this.repo.update(next, current.revision)
    if (!saved) {
      const latest = await this.repo.find(id)
      throw this.versionConflict(id, current.revision, latest?.revision ?? current.revision + 1)
    }
    return { ...toView(next), secret: next.secret }
  }

  async test(user: AuthUser, id: string): Promise<WebhookDelivery> {
    await this.assertAdmin(user)
    const subscription = await this.mustSubscription(id)
    const now = new Date().toISOString()
    const eventId = randomUUID()
    const delivery: WebhookDelivery = {
      id: randomUUID(),
      subscriptionId: subscription.id,
      eventId,
      eventType: WEBHOOK_TEST_EVENT,
      payload: {
        id: eventId,
        type: WEBHOOK_TEST_EVENT,
        occurredAt: now,
        actor: user.username,
        data: { message: 'Webhook 测试投递', subscriptionId: subscription.id },
      },
      source: 'test',
      status: 'pending',
      attempts: [],
      attemptCount: 0,
      nextAttemptAt: now,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    }
    // 测试投递与事件投递使用同一套落盘/发送逻辑；同步执行一次，便于管理端立即看到结果。
    await this.repo.createDeliveries([delivery])
    return (await this.dispatchDelivery(delivery.id)) ?? delivery
  }

  async listDeliveries(
    user: AuthUser,
    subscriptionId: string,
    query: { status?: unknown; eventType?: unknown; page?: unknown; size?: unknown },
  ): Promise<WebhookDeliveryPage> {
    await this.assertAdmin(user)
    // 不校验订阅是否存在：删除订阅后投递日志仍保留，管理员需要继续排障/审计。

    let status: WebhookDeliveryStatus | undefined
    if (query.status !== undefined) {
      if (typeof query.status !== 'string' || !(WEBHOOK_DELIVERY_STATUSES as readonly string[]).includes(query.status)) {
        throw badQuery(`status 取值 ${WEBHOOK_DELIVERY_STATUSES.join(' / ')}`)
      }
      status = query.status as WebhookDeliveryStatus
    }

    let eventType: WebhookDeliveryEventType | undefined
    if (query.eventType !== undefined) {
      if (!isWebhookDeliveryEventType(query.eventType)) throw badQuery('eventType 不是已知事件类型')
      eventType = query.eventType
    }

    return this.repo.listDeliveries(subscriptionId, {
      ...(status === undefined ? {} : { status }),
      ...(eventType === undefined ? {} : { eventType }),
      page: parsePositiveInt(query.page, 1, 'page'),
      size: parsePositiveInt(query.size, WEBHOOK_DEFAULT_PAGE_SIZE, 'size', WEBHOOK_MAX_PAGE_SIZE),
    })
  }

  /** 管理端指标 + 告警判定（失败率 / 积压深度 / 最老 pending 年龄）。 */
  async metrics(user: AuthUser): Promise<WebhookMetrics> {
    await this.assertAdmin(user)
    return this.buildMetrics()
  }

  /** 管理端手动触发清理（后台 worker 也会按间隔自动执行）。 */
  async cleanupDeliveriesForAdmin(user: AuthUser): Promise<number> {
    await this.assertAdmin(user)
    return this.cleanupDeliveries()
  }

  /** 清理过期投递日志：先归档再删除；返回迁移条数。 */
  async cleanupDeliveries(): Promise<number> {
    const rawDays = Number(process.env.LC_WEBHOOK_RETENTION_DAYS ?? WEBHOOK_DEFAULT_RETENTION_DAYS)
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : WEBHOOK_DEFAULT_RETENTION_DAYS
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1_000).toISOString()
    let archived = 0
    // 单轮最多 5000 条，避免定时任务长时间占用数据库；下一轮继续消化。
    while (archived < 5_000) {
      const moved = await this.repo.archiveDeliveries(before, 500)
      archived += moved
      if (moved < 500) break
    }
    if (archived > 0) this.log.log(`Webhook 投递日志已归档 ${archived} 条（保留 ${days} 天）`)
    this.lastCleanupAt = Date.now()
    return archived
  }

  /** 管理端手动重投：重置尝试计数后同步发送一次（保留历史 attempts 审计）。 */
  async retryDelivery(user: AuthUser, deliveryId: string, ifMatch?: string): Promise<WebhookDelivery> {
    await this.assertAdmin(user)
    const delivery = await this.repo.findDelivery(deliveryId)
    if (!delivery) {
      throw new NotFoundException({ code: 'WEBHOOK_DELIVERY_NOT_FOUND', message: `投递记录 ${deliveryId} 不存在` })
    }
    this.assertIfMatch(ifMatch, deliveryId, delivery.revision, 'webhook-delivery')
    const now = new Date().toISOString()
    if (delivery.status === 'pending' && delivery.nextAttemptAt > now) {
      throw new ConflictException({
        code: 'DELIVERY_PENDING',
        message: '投递仍在等待自动重试，请稍后再试',
        nextAttemptAt: delivery.nextAttemptAt,
      })
    }

    const next: WebhookDelivery = {
      ...delivery,
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: now,
      revision: delivery.revision + 1,
      updatedAt: now,
    }
    delete next.error
    delete next.responseStatus
    delete next.responseBody
    await this.repo.saveDelivery(next)
    return (await this.dispatchDelivery(deliveryId)) ?? next
  }

  /* ------------------------------ 事件入队 ------------------------------ */

  /**
   * 业务事件入队。**永不抛错**：订阅查询/落盘失败只记日志，调用方主链路继续。
   */
  async emit(type: WebhookEventType, actor: string, data: Record<string, unknown>): Promise<void> {
    try {
      if (!isWebhookEventType(type)) {
        this.log.warn(`忽略未知事件类型：${String(type)}`)
        return
      }
      const subscriptions = (await this.repo.list()).filter(
        (subscription) => subscription.active && subscriptionMatches(subscription, type),
      )
      if (subscriptions.length === 0) return

      const now = new Date().toISOString()
      const event: WebhookEventEnvelope = {
        id: randomUUID(),
        type,
        occurredAt: now,
        actor,
        data,
      }
      const deliveries = subscriptions.map<WebhookDelivery>((subscription) => ({
        id: randomUUID(),
        subscriptionId: subscription.id,
        eventId: event.id,
        eventType: type,
        payload: event,
        source: 'event',
        status: 'pending',
        attempts: [],
        attemptCount: 0,
        nextAttemptAt: now,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      }))
      await this.repo.createDeliveries(deliveries)
    } catch (error) {
      this.log.error('Webhook 事件入队失败（不影响主业务）', error instanceof Error ? error.stack : String(error))
    }
  }

  /* ------------------------------ 投递 worker ------------------------------ */

  /** 扫描到期 pending 投递并发送；返回本轮领取数量。 */
  async dispatchDue(): Promise<number> {
    if (this.dispatching) return 0
    this.dispatching = true
    try {
      const due = await this.repo.claimDueDeliveries(
        new Date().toISOString(),
        20,
        this.workerId,
        this.leaseMs,
      )
      await Promise.all(due.map((delivery) => this.dispatchDelivery(delivery.id)))
      void this.runMaintenance()
      return due.length
    } catch (error) {
      this.log.error('Webhook worker 扫描失败', error instanceof Error ? error.stack : String(error))
      return 0
    } finally {
      this.dispatching = false
    }
  }

  /** 发送单条投递；先原子领取租约，并发/多副本调用同一 id 时只有一个执行。 */
  async dispatchDelivery(id: string): Promise<WebhookDelivery | null> {
    if (this.inFlight.has(id)) return null
    this.inFlight.add(id)
    try {
      const claimed = await this.repo.claimDelivery(id, this.workerId, this.leaseMs)
      const delivery = claimed ?? (await this.repo.findDelivery(id))
      if (!delivery) return null
      if (delivery.status !== 'pending') return delivery
      // 已被其它副本持有未过期租约：本轮不发送，等对方完成或租约到期。
      if (!claimed) return delivery

      const owner = delivery.leaseOwner ?? this.workerId
      const subscription = await this.repo.find(delivery.subscriptionId)
      if (!subscription) return this.failDelivery(delivery, '订阅已删除', owner)
      if (!subscription.active && delivery.source !== 'test') {
        return this.failDelivery(delivery, '订阅已停用', owner)
      }

      // DNS 级 SSRF：发送前重新解析；解析到内网直接失败，不再重试。
      try {
        await this.assertDestination(subscription.url)
      } catch (error) {
        if (error instanceof WebhookSsrfError) return this.failDelivery(delivery, error.message, owner)
        throw error
      }

      const now = new Date().toISOString()
      if (delivery.source !== 'test' && subscription.rateLimitPerMinute > 0) {
        const since = new Date(Date.now() - 60_000).toISOString()
        const recent = await this.repo.countRecentDeliveries(subscription.id, since)
        if (recent >= subscription.rateLimitPerMinute) {
          delivery.nextAttemptAt = new Date(Date.now() + 5_000).toISOString()
          delivery.updatedAt = now
          delivery.revision += 1
          const saved = await this.repo.saveDelivery(delivery, owner)
          if (!saved) return this.repo.findDelivery(id)
          this.log.debug(`订阅 ${subscription.id} 触发限流，投递 ${id} 延后 5s`)
          return delivery
        }
      }

      const timestamp = String(Math.floor(Date.now() / 1000))
      const rawBody = JSON.stringify(delivery.payload)
      const signature = signWebhook(subscription.secret, timestamp, rawBody)
      // 自定义头先铺底，系统头随后覆盖，确保 X-LC-* / Content-Type 不可能被订阅配置伪造。
      const headers: Record<string, string> = {
        ...subscription.headers,
        'content-type': 'application/json; charset=utf-8',
        'user-agent': 'lowcode-webhook/1.0',
        'x-lc-event': delivery.eventType,
        'x-lc-delivery': delivery.id,
        'x-lc-subscription': delivery.subscriptionId,
        'x-lc-timestamp': timestamp,
        'x-lc-signature': `t=${timestamp},v1=${signature}`,
      }
      if (
        subscription.previousSecret &&
        subscription.previousSecretExpiresAt &&
        subscription.previousSecretExpiresAt > now
      ) {
        headers['x-lc-signature-previous'] =
          `t=${timestamp},v1=${signWebhook(subscription.previousSecret, timestamp, rawBody)}`
      }

      const started = Date.now()
      let status: number | undefined
      let responseBody = ''
      let error: string | undefined
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), subscription.timeoutMs)
      try {
        const response = await this.fetchImpl(subscription.url, {
          method: 'POST',
          headers,
          body: rawBody,
          signal: controller.signal,
          redirect: 'manual',
        })
        status = response.status
        try {
          responseBody = truncate(await response.text(), WEBHOOK_MAX_RESPONSE_BODY)
        } catch {
          responseBody = ''
        }
        if (status < 200 || status >= 300) error = `HTTP ${status}`
      } catch (caught) {
        error =
          caught instanceof Error && caught.name === 'AbortError'
            ? `请求超时（>${subscription.timeoutMs}ms）`
            : caught instanceof Error
              ? caught.message
              : String(caught)
      } finally {
        clearTimeout(timer)
      }

      const durationMs = Date.now() - started
      const ok = error === undefined
      const attempt = {
        attempt: delivery.attemptCount + 1,
        at: now,
        ok,
        ...(status === undefined ? {} : { status }),
        durationMs,
        ...(responseBody ? { responseBody } : {}),
        ...(error === undefined ? {} : { error }),
      }
      delivery.attempts = [...delivery.attempts, attempt]
      delivery.attemptCount += 1
      delivery.lastAttemptAt = now
      delivery.responseStatus = status
      delivery.responseBody = responseBody || undefined
      delivery.error = error
      delivery.revision += 1
      delivery.updatedAt = now

      if (ok) {
        delivery.status = 'success'
        delivery.nextAttemptAt = now
      } else if (isRetryableStatus(status) && delivery.attemptCount < subscription.maxAttempts) {
        delivery.status = 'pending'
        delivery.nextAttemptAt = new Date(Date.now() + retryDelayMs(delivery.attemptCount)).toISOString()
      } else {
        delivery.status = 'failed'
        delivery.nextAttemptAt = now
      }
      const saved = await this.repo.saveDelivery(delivery, owner)
      if (!saved) {
        this.log.warn(`Webhook 投递 ${id} 的租约已被其它副本接管，丢弃本次结果`)
        return this.repo.findDelivery(id)
      }
      return delivery
    } catch (error) {
      this.log.error(`Webhook 投递失败（保留 pending 待下次重试）：${id}`, error instanceof Error ? error.stack : String(error))
      return null
    } finally {
      this.inFlight.delete(id)
    }
  }

  /* ------------------------------ 内部 ------------------------------ */

  private async assertAdmin(user: AuthUser): Promise<void> {
    const perms = await this.rbac.permsOf(user)
    if (!perms.includes('*')) {
      throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: '仅管理员可管理 Webhook 订阅' })
    }
  }

  private async mustSubscription(id: string): Promise<WebhookSubscription> {
    const subscription = await this.repo.find(id)
    if (!subscription) {
      throw new NotFoundException({ code: 'WEBHOOK_NOT_FOUND', message: `Webhook 订阅 ${id} 不存在` })
    }
    return subscription
  }

  private assertIfMatch(
    ifMatch: string | undefined,
    id: string,
    currentRevision: number,
    kind: 'webhook' | 'webhook-delivery' = 'webhook',
  ): void {
    const expected = parseIfMatch(ifMatch, kind, id)
    if (expected !== undefined && expected !== currentRevision) {
      throw this.versionConflict(id, expected, currentRevision)
    }
  }

  private versionConflict(id: string, expected: number, current: number): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: `Webhook 资源 ${id} 已被其他请求修改，请刷新后重试`,
      expectedRevision: expected,
      currentRevision: current,
    })
  }

  private async failDelivery(
    delivery: WebhookDelivery,
    message: string,
    leaseOwner?: string,
  ): Promise<WebhookDelivery> {
    const now = new Date().toISOString()
    const attempt = {
      attempt: delivery.attemptCount + 1,
      at: now,
      ok: false,
      durationMs: 0,
      error: message,
    }
    const next: WebhookDelivery = {
      ...delivery,
      status: 'failed',
      attempts: [...delivery.attempts, attempt],
      attemptCount: delivery.attemptCount + 1,
      lastAttemptAt: now,
      nextAttemptAt: now,
      error: message,
      revision: delivery.revision + 1,
      updatedAt: now,
    }
    const saved = await this.repo.saveDelivery(next, leaseOwner)
    if (!saved) return (await this.repo.findDelivery(delivery.id)) ?? next
    return next
  }

  private async assertDestination(url: string): Promise<void> {
    await assertWebhookDestination(url, this.blockPrivate)
  }

  /** 生成指标与告警；管理端和后台自检共用。 */
  private async buildMetrics(): Promise<WebhookMetrics> {
    const now = new Date().toISOString()
    const stats = await this.repo.stats(now)
    const failureRate = stats.last24hTotal > 0 ? stats.last24hFailed / stats.last24hTotal : 0
    const thresholds = {
      failureRate: envRatio('LC_WEBHOOK_ALERT_FAILURE_RATE', 0.2),
      queueDepth: envInteger('LC_WEBHOOK_ALERT_QUEUE_DEPTH', 1_000),
      pendingAgeMs: envInteger('LC_WEBHOOK_ALERT_PENDING_AGE_MS', 15 * 60 * 1_000),
    }
    const alerts: string[] = []
    if (stats.last24hTotal > 0 && failureRate >= thresholds.failureRate) {
      alerts.push(`最近 24 小时失败率 ${(failureRate * 100).toFixed(1)}% 超过阈值 ${(thresholds.failureRate * 100).toFixed(1)}%`)
    }
    if (stats.pending >= thresholds.queueDepth) {
      alerts.push(`pending 队列 ${stats.pending} 条达到阈值 ${thresholds.queueDepth}`)
    }
    if (stats.oldestPendingAt) {
      const age = Date.now() - new Date(stats.oldestPendingAt).getTime()
      if (age >= thresholds.pendingAgeMs) {
        alerts.push(`最老 pending 已等待 ${Math.round(age / 60_000)} 分钟，超过阈值 ${Math.round(thresholds.pendingAgeMs / 60_000)} 分钟`)
      }
    }
    return {
      ...stats,
      generatedAt: now,
      failureRate,
      thresholds,
      alerts,
      ok: alerts.length === 0,
    }
  }

  /** 定时清理 + 告警自检；失败只记日志，不影响 worker。 */
  private async runMaintenance(): Promise<void> {
    const interval = envInteger('LC_WEBHOOK_CLEANUP_INTERVAL_MS', WEBHOOK_DEFAULT_CLEANUP_INTERVAL_MS)
    if (Date.now() - this.lastCleanupAt < Math.max(interval, 60_000)) return
    try {
      await this.cleanupDeliveries()
      await this.evaluateAlerts()
    } catch (error) {
      this.log.error('Webhook 维护任务失败', error instanceof Error ? error.stack : String(error))
    }
  }

  private async evaluateAlerts(): Promise<void> {
    if (Date.now() - this.lastAlertAt < 60_000) return
    this.lastAlertAt = Date.now()
    const metrics = await this.buildMetrics()
    const signature = metrics.alerts.join('|')
    if (signature && signature !== this.lastAlertSignature) {
      this.log.warn(`Webhook 投递告警：${metrics.alerts.join('；')}`)
    }
    this.lastAlertSignature = signature
  }

  private get leaseMs(): number {
    return Math.max(envInteger('LC_WEBHOOK_LEASE_MS', WEBHOOK_DEFAULT_LEASE_MS), 30_000)
  }

  private get blockPrivate(): boolean {
    return process.env.NODE_ENV === 'production' && process.env.LC_WEBHOOK_ALLOW_PRIVATE !== '1'
  }
}

function envInteger(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function envRatio(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}
