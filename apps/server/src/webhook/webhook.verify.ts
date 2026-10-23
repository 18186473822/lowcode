/**
 * Webhook 接收方校验工具（服务端导出，供自建接收器/示例复用）。
 *
 * - 签名格式与发送端一致：`X-LC-Signature: t=<unix>,v1=<hex hmac>`；
 * - 强制时间窗（默认 5 分钟），拒绝过期/未来时间戳；
 * - `WebhookReplayCache` 以事件 id / delivery id 为键做短期去重，防重放；
 * - 常量时间比较，避免签名逐字节猜测。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface ParsedWebhookSignature {
  timestamp: number
  signature: string
}

export interface VerifyWebhookSignatureInput {
  secret: string
  /** 原始请求体（必须是未经二次序列化的字符串） */
  rawBody: string
  /** X-LC-Signature 头 */
  header: string | undefined
  /** 轮换宽限期内的旧密钥；新密钥验签失败时再试 */
  previousSecret?: string
  /** 允许的时钟偏差（秒），默认 300 */
  toleranceSeconds?: number
  /** 当前时间（毫秒），默认 Date.now()，便于测试 */
  now?: number
}

export interface VerifyWebhookSignatureResult {
  ok: boolean
  /** 失败原因；成功时省略 */
  reason?: string
  timestamp?: number
  /** 命中的是旧密钥（轮换宽限期） */
  usedPreviousSecret?: boolean
}

/** 解析签名头；格式错误返回 null。 */
export function parseWebhookSignature(header: string | undefined): ParsedWebhookSignature | null {
  if (!header) return null
  const match = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header.trim())
  if (!match) return null
  const timestamp = Number(match[1])
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null
  return { timestamp, signature: match[2] }
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

function verifyOne(
  secret: string,
  rawBody: string,
  parsed: ParsedWebhookSignature,
): boolean {
  const expected = createHmac('sha256', secret)
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest('hex')
  return safeEqualHex(expected, parsed.signature)
}

/** 验签 + 时间窗；不包含重放缓存（重放需要业务侧键，见 WebhookReplayCache）。 */
export function verifyWebhookSignature(input: VerifyWebhookSignatureInput): VerifyWebhookSignatureResult {
  const parsed = parseWebhookSignature(input.header)
  if (!parsed) return { ok: false, reason: '签名头格式错误' }
  const tolerance = input.toleranceSeconds ?? 300
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000)
  if (Math.abs(nowSeconds - parsed.timestamp) > tolerance) {
    return { ok: false, reason: `时间戳超出 ${tolerance}s 时间窗`, timestamp: parsed.timestamp }
  }
  if (verifyOne(input.secret, input.rawBody, parsed)) {
    return { ok: true, timestamp: parsed.timestamp }
  }
  if (input.previousSecret && verifyOne(input.previousSecret, input.rawBody, parsed)) {
    return { ok: true, timestamp: parsed.timestamp, usedPreviousSecret: true }
  }
  return { ok: false, reason: '签名不匹配', timestamp: parsed.timestamp }
}

/**
 * 进程内重放缓存。多副本部署时应换成 Redis（同一 key 的原子 SET NX EX）。
 * key 建议使用 `event.id` 或 `X-LC-Delivery`；返回 true 表示已见过（拒绝处理）。
 */
export class WebhookReplayCache {
  private readonly entries = new Map<string, number>()

  constructor(
    private readonly ttlMs = 10 * 60 * 1_000,
    private readonly maxEntries = 10_000,
  ) {}

  checkAndRemember(key: string, now = Date.now()): boolean {
    this.prune(now)
    const expiresAt = this.entries.get(key)
    if (expiresAt !== undefined && expiresAt > now) return true
    if (this.entries.size >= this.maxEntries) {
      // 容量满时淘汰最早到期的条目，避免无界增长。
      const oldest = [...this.entries.entries()].sort((a, b) => a[1] - b[1])[0]
      if (oldest) this.entries.delete(oldest[0])
    }
    this.entries.set(key, now + this.ttlMs)
    return false
  }

  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  private prune(now: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(key)
    }
  }
}
