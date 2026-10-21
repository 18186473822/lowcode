/**
 * 可观测性回归：
 * - 请求 ID 透传/生成与访问日志字段（不落 query/token）；
 * - `/health`、`/ready` 探针；
 * - 探针不计入限流。
 */
import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ServiceUnavailableException, type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module.js'
import { HealthController, checkDataDirWritable } from '../src/common/health.controller.js'
import { JsonStorageHealth } from '../src/persistence/storage-health.js'
import {
  RequestObservabilityMiddleware,
  formatAccessLog,
  normalizeRequestId,
  shouldLogAccess,
  type AccessLogEntry,
} from '../src/common/observability.js'

const ENV_KEYS = [
  'LC_DATA_DIR',
  'LC_JWT_SECRET',
  'LC_ACCESS_LOG',
  'LC_APP_VERSION',
  'LC_RATE_LIMIT_MAX',
  'LC_LOGIN_RATE_LIMIT_MAX',
  'LC_RATE_LIMIT_WINDOW_MS',
] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  vi.restoreAllMocks()
})

describe('请求 ID 与访问日志', () => {
  it('合法客户端 ID 原样复用，非法/超长重新生成 UUID', () => {
    expect(normalizeRequestId('test-request-id-001')).toBe('test-request-id-001')
    expect(normalizeRequestId('bad id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(normalizeRequestId('a'.repeat(129))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('访问日志默认 production 开启，可用环境变量覆盖', () => {
    expect(shouldLogAccess({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true)
    expect(shouldLogAccess({} as NodeJS.ProcessEnv)).toBe(false)
    expect(shouldLogAccess({ LC_ACCESS_LOG: '1' } as NodeJS.ProcessEnv)).toBe(true)
    expect(shouldLogAccess({ NODE_ENV: 'production', LC_ACCESS_LOG: '0' } as NodeJS.ProcessEnv)).toBe(false)
    expect(() =>
      shouldLogAccess({ LC_ACCESS_LOG: 'maybe' } as NodeJS.ProcessEnv),
    ).toThrow(/LC_ACCESS_LOG/)
  })

  it('日志只包含安全字段，不落 query', () => {
    const entry: AccessLogEntry = {
      level: 'info',
      type: 'access',
      at: '2026-10-21T00:00:00.000Z',
      requestId: 'test-request-id-001',
      method: 'GET',
      path: '/api/v1/pages',
      status: 200,
      durationMs: 12,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    }
    const parsed = JSON.parse(formatAccessLog(entry))
    expect(parsed).toMatchObject({ type: 'access', path: '/api/v1/pages', status: 200 })
    expect(parsed).not.toHaveProperty('authorization')
  })

  it('中间件设置并回写请求 ID，finish 后输出单行 JSON', () => {
    process.env.LC_ACCESS_LOG = '1'
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const finishListeners: Array<() => void> = []
    const headers: Record<string, string> = {}

    const middleware = new RequestObservabilityMiddleware()
    const req = {
      headers: {
        'x-request-id': 'test-request-id-001',
        'user-agent': 'vitest',
      },
      method: 'GET',
      originalUrl: '/api/v1/pages?token=should-not-be-logged',
      ip: '127.0.0.1',
    }
    const res = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value
      },
      once(_event: 'finish', listener: () => void) {
        finishListeners.push(listener)
      },
    }

    let nextCalls = 0
    middleware.use(req, res, () => {
      nextCalls += 1
    })

    expect(nextCalls).toBe(1)
    expect(headers['X-Request-Id']).toBe('test-request-id-001')
    expect(finishListeners).toHaveLength(1)

    finishListeners[0]!()
    const logged = JSON.parse(String(spy.mock.calls[0]?.[0]).trim())
    expect(logged).toMatchObject({
      type: 'access',
      requestId: 'test-request-id-001',
      method: 'GET',
      path: '/api/v1/pages',
      status: 200,
      userAgent: 'vitest',
    })
    expect(JSON.stringify(logged)).not.toContain('should-not-be-logged')

    spy.mockRestore()
  })
})

describe('数据目录 readiness', () => {
  it('目录可创建/可写返回 true，文件路径返回 false', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lc-ready-unit-'))
    try {
      expect(await checkDataDirWritable(dir)).toBe(true)
      const file = path.join(dir, 'not-a-dir')
      await writeFile(file, 'x')
      expect(await checkDataDirWritable(file)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('不可写时 /ready 抛 503 NOT_READY', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lc-ready-fail-'))
    try {
      const file = path.join(dir, 'not-a-dir')
      await writeFile(file, 'x')
      const controller = new HealthController(new JsonStorageHealth(file))
      try {
        await controller.ready()
        expect.unreachable('ready() 应抛 503')
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException)
        expect((error as ServiceUnavailableException).getStatus()).toBe(503)
        expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
          code: 'NOT_READY',
          checks: { dataDir: 'unavailable' },
        })
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('健康检查接入真实 Nest 应用', () => {
  let app: INestApplication
  let base: string
  let dataDir: string

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'lc-health-test-'))
    process.env.LC_DATA_DIR = dataDir
    process.env.LC_JWT_SECRET = 'test-secret-0123456789-abcdefghij'
    process.env.LC_ACCESS_LOG = '0'
    process.env.LC_RATE_LIMIT_MAX = '1'
    process.env.LC_LOGIN_RATE_LIMIT_MAX = '10'

    app = await NestFactory.create(AppModule, { logger: false })
    app.setGlobalPrefix('api/v1')
    await app.listen(0, '127.0.0.1')
    base = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
    await rm(dataDir, { recursive: true, force: true })
  })

  it('GET /health 无需登录，回写合法 X-Request-Id', async () => {
    const res = await fetch(`${base}/api/v1/health`, {
      headers: { 'x-request-id': 'test-request-id-001' },
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ status: 'ok' })
    expect(typeof body.uptimeSeconds).toBe('number')
    expect(res.headers.get('x-request-id')).toBe('test-request-id-001')
  })

  it('非法 X-Request-Id 被替换为 UUID', async () => {
    const res = await fetch(`${base}/api/v1/health`, {
      headers: { 'x-request-id': 'bad id' },
    })
    const id = res.headers.get('x-request-id') ?? ''
    expect(id).not.toBe('bad id')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('GET /ready 返回数据目录可写', async () => {
    const res = await fetch(`${base}/api/v1/ready`)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ status: 'ok', checks: { dataDir: 'ok' } })
  })

  it('探针不计入限流（全局上限设为 1 仍可连续访问）', async () => {
    const first = await fetch(`${base}/api/v1/health`)
    const second = await fetch(`${base}/api/v1/health`)
    const ready = await fetch(`${base}/api/v1/ready`)
    expect([first.status, second.status, ready.status]).toEqual([200, 200, 200])
  })

  it('LC_APP_VERSION 反映到 health 响应', async () => {
    process.env.LC_APP_VERSION = '9.9.9-test'
    const res = await fetch(`${base}/api/v1/health`)
    const body = await res.json()
    expect(body.version).toBe('9.9.9-test')
  })
})
