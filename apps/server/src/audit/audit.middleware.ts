/**
 * 安全审计中间件：在响应结束时记录 401 / 403 / 429。
 *
 * 为什么用中间件而不是异常过滤器：
 * - 限流 429 由 `RateLimitMiddleware` 直接写响应，不经过异常过滤器；
 * - 401/403 由 Guard/Service 抛 `HttpException`，但响应体形状已由控制器统一为 `{ code, message }`；
 * - 中间件挂在响应 `finish` 上，两条路径都能覆盖，且不改变任何错误响应语义。
 *
 * 去重：`POST /auth/login` 的 401 由 `AuthController` 记录（带尝试用户名），
 * 这里跳过，避免同一次失败落两条。
 */
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common'
import { AuditService } from './audit.service.js'

const AUDITED_STATUS = new Set([401, 403, 429])

interface AuditedRequest {
  ip?: string
  socket?: { remoteAddress?: string }
  method?: string
  originalUrl?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  user?: { username?: string }
}

interface AuditedResponse {
  statusCode: number
  json(payload: unknown): unknown
  on(event: 'finish', listener: () => void): unknown
}

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  use(req: AuditedRequest, res: AuditedResponse, next: (err?: unknown) => void): void {
    // 捕获响应体里的业务错误码（RateLimit/异常过滤器都走 res.json）
    let payload: unknown
    const originalJson = res.json.bind(res)
    res.json = (body: unknown) => {
      payload = body
      return originalJson(body)
    }

    res.on('finish', () => {
      const status = res.statusCode
      if (!AUDITED_STATUS.has(status)) return

      const method = (req.method ?? 'GET').toUpperCase()
      const path = stripQuery(req.originalUrl ?? req.url ?? '')
      // 登录失败由 AuthController 记录（含尝试用户名），此处跳过避免重复
      if (status === 401 && /^\/api\/v1\/auth\/login\/?$/.test(path)) return

      const type = status === 429 ? 'rate_limited' : status === 403 ? 'forbidden' : 'unauthorized'
      const code =
        payload && typeof payload === 'object' && typeof (payload as { code?: unknown }).code === 'string'
          ? (payload as { code: string }).code
          : undefined
      const userAgent = readUserAgent(req)

      void this.audit.record({
        type,
        ...(req.user?.username ? { username: req.user.username } : {}),
        ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
        method,
        path,
        status,
        ...(code ? { code } : {}),
        ...(userAgent ? { userAgent } : {}),
      })
    })

    next()
  }
}

function stripQuery(url: string): string {
  return url.split('?')[0] ?? url
}

function readUserAgent(req: AuditedRequest): string | undefined {
  const raw = req.headers?.['user-agent']
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0]
  return undefined
}
