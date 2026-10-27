/**
 * 安全审计中间件单测（无 HTTP）：锁定「记什么 / 不记什么」的口径。
 *
 * 真实链路（限流 429、Guard 403、登录 401 去重）由 api.test.ts 端到端覆盖；
 * 这里用假 req/res 精确控制响应状态与响应体，覆盖中间件分支。
 */
import 'reflect-metadata'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { AuditMiddleware } from '../src/audit/audit.middleware.js'
import type { AuditService } from '../src/audit/audit.service.js'
import type { AuditEventInput } from '../src/audit/audit.types.js'

interface FakeRequest {
  ip?: string
  socket?: { remoteAddress?: string }
  method?: string
  originalUrl?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  user?: { username?: string }
}

/** 只实现中间件用到的 res 表面：statusCode / json / on('finish')。 */
class FakeResponse extends EventEmitter {
  statusCode = 200
  body: unknown

  json(body: unknown): this {
    this.body = body
    return this
  }
}

function run(
  req: FakeRequest,
  res: FakeResponse,
): ReturnType<typeof vi.fn> {
  const record = vi.fn(async () => undefined)
  const middleware = new AuditMiddleware({ record } as unknown as AuditService)
  middleware.use(req as any, res as any, () => undefined)
  return record
}

function finish(res: FakeResponse, status: number, body?: unknown): void {
  res.statusCode = status
  if (body !== undefined) res.json(body)
  res.emit('finish')
}

describe('AuditMiddleware', () => {
  it('401 非登录接口记 unauthorized，含 IP / 路径（剥离查询串）/ 业务码', () => {
    const res = new FakeResponse()
    const record = run(
      {
        ip: '10.0.0.7',
        method: 'get',
        originalUrl: '/api/v1/pages/p1/schema?draft=1',
        headers: { 'user-agent': 'probe/1.0' },
      },
      res,
    )

    finish(res, 401, { code: 'UNAUTHORIZED', message: '未登录' })

    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0]![0]).toMatchObject({
      type: 'unauthorized',
      ip: '10.0.0.7',
      method: 'GET',
      path: '/api/v1/pages/p1/schema',
      status: 401,
      code: 'UNAUTHORIZED',
      userAgent: 'probe/1.0',
    })
  })

  it('登录接口的 401 跳过（由 AuthController 记录，含尝试用户名）', () => {
    const res = new FakeResponse()
    const record = run({ method: 'POST', originalUrl: '/api/v1/auth/login' }, res)

    finish(res, 401, { code: 'INVALID_CREDENTIALS' })

    expect(record).not.toHaveBeenCalled()
  })

  it('403 记 forbidden，带登录用户名与 code', () => {
    const res = new FakeResponse()
    const record = run(
      {
        method: 'PUT',
        url: '/api/v1/pages/p2/schema',
        user: { username: 'designer' },
        socket: { remoteAddress: '::ffff:127.0.0.1' },
      },
      res,
    )

    finish(res, 403, { code: 'PERMISSION_DENIED' })

    expect(record.mock.calls[0]![0]).toMatchObject({
      type: 'forbidden',
      username: 'designer',
      ip: '::ffff:127.0.0.1',
      path: '/api/v1/pages/p2/schema',
      status: 403,
      code: 'PERMISSION_DENIED',
    })
    expect('userAgent' in (record.mock.calls[0]![0] as AuditEventInput)).toBe(false)
  })

  it('429 记 rate_limited；UA 为数组时取首项', () => {
    const res = new FakeResponse()
    const record = run(
      {
        method: 'POST',
        originalUrl: '/api/v1/auth/login',
        headers: { 'user-agent': ['brute/2.0', 'ignored'] },
      },
      res,
    )

    finish(res, 429, { code: 'RATE_LIMITED', message: '请求过于频繁' })

    expect(record.mock.calls[0]![0]).toMatchObject({
      type: 'rate_limited',
      status: 429,
      code: 'RATE_LIMITED',
      userAgent: 'brute/2.0',
    })
    expect(record.mock.calls[0]![0].ip).toBe('unknown')
  })

  it('2xx/400/404 不记录（只记拒绝类安全事件）', () => {
    for (const status of [200, 204, 400, 404, 500]) {
      const res = new FakeResponse()
      const record = run({ method: 'GET', originalUrl: '/api/v1/pages' }, res)
      finish(res, status, { code: 'ANY' })
      expect(record).not.toHaveBeenCalled()
    }
  })
})
