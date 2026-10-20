/**
 * 安全加固回归：
 * - JWT 生产 fail-closed / 密钥长度；
 * - CORS 白名单解析（拒绝 * 与路径）；
 * - 固定窗口限流（单元 + 真实 Nest 接入）。
 */
import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module.js'
import { FixedWindowRateLimiter, RateLimitMiddleware } from '../src/common/rate-limit.js'
import {
  DEV_JWT_SECRET,
  MIN_JWT_SECRET_LENGTH,
  assertSecurityConfig,
  buildCorsOptions,
  resolveCorsOrigins,
  resolveJwtSecret,
  resolveRateLimitConfig,
} from '../src/common/security.config.js'

const STRONG_SECRET = 'test-secret-0123456789-abcdefghij'

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv
}

const RATE_ENV_KEYS = [
  'LC_RATE_LIMIT_WINDOW_MS',
  'LC_RATE_LIMIT_MAX',
  'LC_LOGIN_RATE_LIMIT_MAX',
  'LC_TRUST_PROXY',
] as const

afterEach(() => {
  for (const key of RATE_ENV_KEYS) delete process.env[key]
})

describe('JWT 密钥 fail-closed', () => {
  it('非生产未设置时回退开发密钥并标记 insecure', () => {
    const result = resolveJwtSecret(env())
    expect(result.secret).toBe(DEV_JWT_SECRET)
    expect(result.insecure).toBe(true)
  })

  it('生产未设置密钥直接拒绝', () => {
    expect(() => resolveJwtSecret(env({ NODE_ENV: 'production' }))).toThrow(/LC_JWT_SECRET/)
  })

  it('生产密钥过短直接拒绝', () => {
    expect(() =>
      resolveJwtSecret(env({ NODE_ENV: 'production', LC_JWT_SECRET: 'short-secret' })),
    ).toThrow(/至少需要/)
  })

  it('禁止把仓库内置开发密钥当显式配置', () => {
    expect(() => resolveJwtSecret(env({ LC_JWT_SECRET: DEV_JWT_SECRET }))).toThrow(/开发默认值/)
  })

  it('非生产显式配置足够长的密钥即可使用', () => {
    const result = resolveJwtSecret(env({ LC_JWT_SECRET: 'x'.repeat(MIN_JWT_SECRET_LENGTH) }))
    expect(result.insecure).toBe(false)
    expect(result.secret).toHaveLength(MIN_JWT_SECRET_LENGTH)
  })

  it('生产配置足够长的密钥可启动', () => {
    const result = resolveJwtSecret(
      env({ NODE_ENV: 'production', LC_JWT_SECRET: 'p'.repeat(MIN_JWT_SECRET_LENGTH) }),
    )
    expect(result.insecure).toBe(false)
  })
})

describe('CORS 白名单', () => {
  it('开发环境默认放行设计器与 H5 的 localhost 源', () => {
    const origins = resolveCorsOrigins(env())
    expect(origins).toContain('http://localhost:5173')
    expect(origins).toContain('http://127.0.0.1:5174')
  })

  it('显式配置去重并归一化尾斜杠', () => {
    const origins = resolveCorsOrigins(
      env({
        LC_CORS_ORIGINS:
          'https://a.example, https://b.example/, https://a.example, http://localhost:5174',
      }),
    )
    expect(origins).toEqual([
      'https://a.example',
      'https://b.example',
      'http://localhost:5174',
    ])
  })

  it('拒绝通配符 *', () => {
    expect(() => resolveCorsOrigins(env({ LC_CORS_ORIGINS: '*' }))).toThrow(/通配符/)
  })

  it('拒绝带路径 / 查询 / 非 http(s) 的源', () => {
    expect(() =>
      resolveCorsOrigins(env({ LC_CORS_ORIGINS: 'https://a.example/app' })),
    ).toThrow(/只接受源/)
    expect(() =>
      resolveCorsOrigins(env({ LC_CORS_ORIGINS: 'https://a.example?x=1' })),
    ).toThrow(/只接受源/)
    expect(() => resolveCorsOrigins(env({ LC_CORS_ORIGINS: 'ftp://a.example' }))).toThrow(
      /http\/https/,
    )
  })

  it('拒绝无法解析的源', () => {
    expect(() => resolveCorsOrigins(env({ LC_CORS_ORIGINS: 'not-a-url' }))).toThrow(/非法源/)
  })

  it('生产未配置白名单时关闭跨域响应头', () => {
    const production = env({ NODE_ENV: 'production' })
    expect(resolveCorsOrigins(production)).toEqual([])
    expect(buildCorsOptions(production)).toMatchObject({ origin: false, credentials: true })
  })

  it('生产显式白名单生效', () => {
    const options = buildCorsOptions(
      env({ NODE_ENV: 'production', LC_CORS_ORIGINS: 'https://lc.example' }),
    )
    expect(options.origin).toEqual(['https://lc.example'])
  })
})

describe('限流配置', () => {
  it('默认值：60s / 600 / 20 / 不信任代理', () => {
    expect(resolveRateLimitConfig(env())).toEqual({
      windowMs: 60_000,
      max: 600,
      loginMax: 20,
      trustProxy: false,
    })
  })

  it('环境变量覆盖', () => {
    expect(
      resolveRateLimitConfig(
        env({
          LC_RATE_LIMIT_WINDOW_MS: '1000',
          LC_RATE_LIMIT_MAX: '10',
          LC_LOGIN_RATE_LIMIT_MAX: '3',
          LC_TRUST_PROXY: 'true',
        }),
      ),
    ).toEqual({ windowMs: 1000, max: 10, loginMax: 3, trustProxy: true })
  })

  it('非法参数启动即失败', () => {
    expect(() => resolveRateLimitConfig(env({ LC_RATE_LIMIT_MAX: '0' }))).toThrow(/1\.\./)
    expect(() => resolveRateLimitConfig(env({ LC_RATE_LIMIT_MAX: 'abc' }))).toThrow(/正整数/)
    expect(() => resolveRateLimitConfig(env({ LC_TRUST_PROXY: 'maybe' }))).toThrow(/true\/false/)
  })

  it('启动自检聚合 JWT/CORS/限流校验', () => {
    expect(assertSecurityConfig(env({ LC_JWT_SECRET: 'x'.repeat(MIN_JWT_SECRET_LENGTH) }))).toMatchObject({
      windowMs: 60_000,
      max: 600,
      loginMax: 20,
    })
    expect(() => assertSecurityConfig(env({ NODE_ENV: 'production' }))).toThrow(/LC_JWT_SECRET/)
  })
})

describe('FixedWindowRateLimiter', () => {
  it('允许 N 次、第 N+1 次拒绝，窗口到期后恢复', () => {
    let now = 1_000_000
    const limiter = new FixedWindowRateLimiter(() => now)

    expect(limiter.consume('ip:1', 2, 1000)).toMatchObject({
      allowed: true,
      remaining: 1,
    })
    expect(limiter.consume('ip:1', 2, 1000)).toMatchObject({
      allowed: true,
      remaining: 0,
    })
    expect(limiter.consume('ip:1', 2, 1000)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    })

    now += 1000
    expect(limiter.consume('ip:1', 2, 1000)).toMatchObject({
      allowed: true,
      remaining: 1,
    })
    expect(limiter.size()).toBe(1)
  })

  it('不同 key 互不影响', () => {
    const limiter = new FixedWindowRateLimiter(() => 1_000_000)
    expect(limiter.consume('ip:1', 1, 1000).allowed).toBe(true)
    expect(limiter.consume('ip:2', 1, 1000).allowed).toBe(true)
    expect(limiter.consume('ip:1', 1, 1000).allowed).toBe(false)
    expect(limiter.size()).toBe(2)
  })

  it('拒绝非法 limit / windowMs', () => {
    const limiter = new FixedWindowRateLimiter(() => 1_000_000)
    expect(() => limiter.consume('k', 0, 1000)).toThrow(/limit/)
    expect(() => limiter.consume('k', 1, 0)).toThrow(/windowMs/)
  })

  it('每 1000 次访问清理过期桶', () => {
    let now = 0
    const limiter = new FixedWindowRateLimiter(() => now)
    for (let i = 0; i < 999; i += 1) {
      limiter.consume(`old:${i}`, 1, 1)
    }
    now = 10
    limiter.consume('fresh', 1, 1000)
    expect(limiter.size()).toBe(1)
  })
})

describe('RateLimitMiddleware', () => {
  function makeResponse() {
    const headers: Record<string, string> = {}
    let statusCode = 200
    let body: unknown
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value
      },
      status(code: number) {
        statusCode = code
        return res
      },
      json(value: unknown) {
        body = value
        return res
      },
    }
    return {
      res,
      headers,
      get statusCode() {
        return statusCode
      },
      get body() {
        return body
      },
    }
  }

  it('登录超过 loginMax 后返回 429，并带 Retry-After', () => {
    process.env.LC_LOGIN_RATE_LIMIT_MAX = '1'
    process.env.LC_RATE_LIMIT_MAX = '10'
    process.env.LC_RATE_LIMIT_WINDOW_MS = '60000'

    const middleware = new RateLimitMiddleware()
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      ip: '203.0.113.10',
    }

    const first = makeResponse()
    let firstNext = 0
    middleware.use(request, first.res, () => {
      firstNext += 1
    })
    expect(firstNext).toBe(1)
    expect(first.headers['X-RateLimit-Remaining']).toBe('0')

    const second = makeResponse()
    let secondNext = 0
    middleware.use(request, second.res, () => {
      secondNext += 1
    })
    expect(secondNext).toBe(0)
    expect(second.statusCode).toBe(429)
    expect(second.headers['Retry-After']).toBeTruthy()
    expect(second.body).toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('OPTIONS 预检直接放行且不消耗配额', () => {
    process.env.LC_LOGIN_RATE_LIMIT_MAX = '1'
    const middleware = new RateLimitMiddleware()
    const request = { method: 'OPTIONS', originalUrl: '/api/v1/auth/login', ip: '203.0.113.11' }
    const response = makeResponse()
    let called = 0
    middleware.use(request, response.res, () => {
      called += 1
    })
    expect(called).toBe(1)
    expect(response.headers['X-RateLimit-Limit']).toBeUndefined()
  })

  it('普通接口使用全局上限，并支持 socket/url 兜底', () => {
    process.env.LC_RATE_LIMIT_MAX = '2'
    const middleware = new RateLimitMiddleware()
    const request = {
      method: 'GET',
      url: '/api/v1/pages?x=1',
      socket: { remoteAddress: '203.0.113.12' },
    }
    const response = makeResponse()
    let called = 0
    middleware.use(request, response.res, () => {
      called += 1
    })
    expect(called).toBe(1)
    expect(response.headers['X-RateLimit-Limit']).toBe('2')
    expect(response.headers['X-RateLimit-Remaining']).toBe('1')
  })
})

describe('限流接入真实 Nest 应用', () => {
  let app: INestApplication
  let base: string
  let dataDir: string

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'lc-security-test-'))
    process.env.LC_DATA_DIR = dataDir
    process.env.LC_JWT_SECRET = STRONG_SECRET
    process.env.LC_LOGIN_RATE_LIMIT_MAX = '2'
    process.env.LC_RATE_LIMIT_MAX = '100'
    process.env.LC_RATE_LIMIT_WINDOW_MS = '60000'

    app = await NestFactory.create(AppModule, { logger: false })
    app.setGlobalPrefix('api/v1')
    await app.listen(0, '127.0.0.1')
    base = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
    await rm(dataDir, { recursive: true, force: true })
    delete process.env.LC_DATA_DIR
    delete process.env.LC_JWT_SECRET
  })

  it('登录接口第 3 次请求被 429 拦截', async () => {
    const statuses: number[] = []
    let retryAfter: string | null = null

    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
      })
      statuses.push(res.status)
      if (i === 2) {
        retryAfter = res.headers.get('retry-after')
        expect(await res.json()).toMatchObject({ code: 'RATE_LIMITED' })
      }
    }

    expect(statuses).toEqual([401, 401, 429])
    expect(retryAfter).toBeTruthy()
  })
})
