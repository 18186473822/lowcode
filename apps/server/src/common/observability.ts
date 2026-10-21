/**
 * 可观测性基础：请求 ID + 结构化访问日志。
 *
 * 设计取舍：
 * - 不引入日志框架/APM：当前单实例 + JSON 文件存储，先把「每条请求可追踪」做扎实；
 * - 请求 ID 优先复用客户端 `X-Request-Id`（合法才复用），否则生成 UUID；
 * - 访问日志只记 method/path/status/耗时/IP/UA，**不记 query、body、Authorization**，
 *   避免把令牌或表单敏感字段写进日志；
 * - 默认只在 production 输出访问日志，本地/测试用 `LC_ACCESS_LOG=1` 显式开启。
 */
import { Injectable, type NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,128}$/
const USER_AGENT_MAX = 200

export interface AccessLogEntry {
  level: 'info'
  type: 'access'
  at: string
  requestId: string
  method: string
  path: string
  status: number
  durationMs: number
  ip: string
  userAgent?: string
}

/** 只接受安全字符与 8..128 长度；其余（含换行/超长/数组）一律重新生成。 */
export function normalizeRequestId(raw: unknown): string {
  if (typeof raw === 'string') {
    const value = raw.trim()
    if (REQUEST_ID_RE.test(value)) return value
  }
  return randomUUID()
}

/** 默认 production 开启；`LC_ACCESS_LOG=1/0` 可覆盖，非法值启动即失败。 */
export function shouldLogAccess(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.LC_ACCESS_LOG?.trim().toLowerCase()
  if (!raw) return env.NODE_ENV === 'production'
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  throw new Error(`LC_ACCESS_LOG 只接受 true/false/1/0/yes/no/on/off（当前：${raw}）`)
}

/** 单行 JSON，便于被 Docker/systemd/云日志按行采集。 */
export function formatAccessLog(entry: AccessLogEntry): string {
  return JSON.stringify(entry)
}

interface ObservedRequest {
  headers?: Record<string, string | string[] | undefined>
  method?: string
  originalUrl?: string
  url?: string
  ip?: string
  socket?: { remoteAddress?: string }
  requestId?: string
}

interface ObservedResponse {
  statusCode?: number
  setHeader(name: string, value: string): unknown
  once(event: 'finish', listener: () => void): unknown
}

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  private readonly logAccess: boolean = shouldLogAccess()

  use(
    req: ObservedRequest,
    res: ObservedResponse,
    next: (err?: unknown) => void,
  ): void {
    const requestId = normalizeRequestId(req.headers?.['x-request-id'])
    req.requestId = requestId
    res.setHeader('X-Request-Id', requestId)

    if (this.logAccess) {
      const startedAt = Date.now()
      res.once('finish', () => {
        const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? ''
        const entry: AccessLogEntry = {
          level: 'info',
          type: 'access',
          at: new Date().toISOString(),
          requestId,
          method: req.method ?? 'UNKNOWN',
          path,
          status: res.statusCode ?? 0,
          durationMs: Date.now() - startedAt,
          ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
        }

        const userAgent = req.headers?.['user-agent']
        if (typeof userAgent === 'string' && userAgent) {
          entry.userAgent = userAgent.slice(0, USER_AGENT_MAX)
        }

        process.stdout.write(`${formatAccessLog(entry)}\n`)
      })
    }

    next()
  }
}
