/**
 * 单进程固定窗口限流。
 *
 * 为什么不用第三方包：当前存储是 JSON 文件、部署是单实例，固定窗口足够挡住
 * 口令爆破与误用；多实例时把 `FixedWindowRateLimiter` 换成 Redis 实现即可，
 * 中间件契约不变。
 *
 * 口径：
 * - 所有 API 共用普通上限（默认 600 次/分钟/IP）；
 * - `POST /api/v1/auth/login` 额外套一层更严的登录上限（默认 20 次/分钟/IP）；
 * - OPTIONS 预检不计入，避免浏览器预检消耗配额。
 */
import { Injectable, type NestMiddleware } from '@nestjs/common'
import { resolveRateLimitConfig, type RateLimitConfig } from './security.config.js'

export interface RateLimitDecision {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

interface Bucket {
  count: number
  resetAt: number
}

/** 可注入时钟的固定窗口计数器（便于单测，无需真实等待）。 */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  private hits = 0

  constructor(private readonly now: () => number = Date.now) {}

  consume(key: string, limit: number, windowMs: number): RateLimitDecision {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error(`limit 必须是正整数（当前：${limit}）`)
    }
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new Error(`windowMs 必须是正整数（当前：${windowMs}）`)
    }

    const now = this.now()
    let bucket = this.buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      this.buckets.set(key, bucket)
    }

    bucket.count += 1
    this.cleanup(now)

    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  /** 当前保留的 key 数量（测试/诊断用）。 */
  size(): number {
    return this.buckets.size
  }

  /** 每 1000 次访问顺带清理过期桶，避免长期运行内存只增不减。 */
  private cleanup(now: number): void {
    this.hits += 1
    if (this.hits % 1000 !== 0) return
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
  }
}

interface RateLimitedRequest {
  ip?: string
  socket?: { remoteAddress?: string }
  method?: string
  originalUrl?: string
  url?: string
}

interface RateLimitedResponse {
  setHeader(name: string, value: string): unknown
  status(code: number): RateLimitedResponse
  json(body: unknown): unknown
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly config: RateLimitConfig = resolveRateLimitConfig()
  private readonly limiter = new FixedWindowRateLimiter()

  use(
    req: RateLimitedRequest,
    res: RateLimitedResponse,
    next: (err?: unknown) => void,
  ): void {
    if (req.method === 'OPTIONS') {
      next()
      return
    }

    const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? ''

    // 部署探针不计入限流，避免 LB 高频探测把真实用户额度吃掉。
    if (/^\/api\/v1\/(?:health|ready)\/?$/.test(path)) {
      next()
      return
    }

    const isLogin = req.method === 'POST' && /^\/api\/v1\/auth\/login\/?$/.test(path)
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown'
    const limit = isLogin ? this.config.loginMax : this.config.max
    const scope = isLogin ? 'login' : 'global'

    const decision = this.limiter.consume(`${scope}:${ip}`, limit, this.config.windowMs)

    res.setHeader('X-RateLimit-Limit', String(decision.limit))
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(decision.resetAt / 1000)))

    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds))
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: '请求过于频繁，请稍后再试',
      })
      return
    }

    next()
  }
}
