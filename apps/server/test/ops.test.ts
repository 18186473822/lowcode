/**
 * 批 5 D-P3-12 —— 运维事件接口：`POST /ops/events` + `GET /ops/events` + `GET /ops/summary`。
 * 真实 Nest 启动 + HTTP 全链路（沿 app-config.test.ts 模式）。
 *
 * 覆盖：鉴权（写=登录、读=管理员）、结构校验、截断策略（message/detail）、
 * 服务端补字段（id/at/userId 防伪造）、倒序与过滤、汇总分位、环形上限、文件落盘形状。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module.js'

let app: INestApplication
let base: string
let dataDir: string
let adminToken: string
let designerToken: string

async function call(method: string, apiPath: string, opts: { body?: unknown; token?: string } = {}) {
  const res = await fetch(`${base}${apiPath}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, body }
}

async function login(username: string, password: string): Promise<string> {
  const r = await call('POST', '/api/v1/auth/login', { body: { username, password } })
  return r.body.accessToken as string
}

/** 一条合法 error 事件（可覆盖字段） */
function errorEvent(over: Record<string, unknown> = {}) {
  const pageId = typeof over.pageId === 'string' ? over.pageId : undefined
  return {
    type: 'error',
    name: 'expr',
    message: 'Unexpected token +',
    ...(pageId ? { pageId } : {}),
    ...over,
  }
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-ops-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret'
  app = await NestFactory.create(AppModule, { logger: false })
  app.setGlobalPrefix('api/v1')
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()
  adminToken = await login('admin', 'admin123')
  designerToken = await login('designer', 'designer123')
})

afterAll(async () => {
  await app?.close()
  await rm(dataDir, { recursive: true, force: true })
})

describe('POST /ops/events —— 鉴权与结构校验', () => {
  it('未登录 → 401', async () => {
    const r = await call('POST', '/api/v1/ops/events', { body: { events: [errorEvent()] } })
    expect(r.status).toBe(401)
  })

  it('events 非数组 / 空数组 / 超 50 条 → 400 OPS_INVALID', async () => {
    for (const events of ['x', [], Array.from({ length: 51 }, () => errorEvent())]) {
      const r = await call('POST', '/api/v1/ops/events', { token: designerToken, body: { events } })
      expect(r.status).toBe(400)
      expect(r.body.code).toBe('OPS_INVALID')
    }
  })

  it('type 非法 / name 空 / perf 缺 durationMs / error 缺 message → 400', async () => {
    const bad = [
      { type: 'log', name: 'x' },
      { type: 'event', name: '   ' },
      { type: 'perf', name: 'render' },
      { type: 'error', name: 'expr' },
      { type: 'event', name: 'x', pageId: '../etc/passwd' },
      { type: 'event', name: 'x', pageVersion: -1 },
      { type: 'event', name: 'x', detail: [1, 2] },
    ]
    for (const ev of bad) {
      const r = await call('POST', '/api/v1/ops/events', { token: designerToken, body: { events: [ev] } })
      expect(r.status).toBe(400)
      expect(r.body.code).toBe('OPS_INVALID')
    }
  })

  it('错误信息里能定位到 events[i] 下标', async () => {
    const r = await call('POST', '/api/v1/ops/events', {
      token: designerToken,
      body: { events: [errorEvent(), { type: 'nope', name: 'x' }] },
    })
    expect(r.status).toBe(400)
    expect(r.body.message).toContain('events[1]')
  })
})

describe('POST /ops/events —— 补字段与截断', () => {
  it('服务端补 id/at/userId；客户端伪造的 userId 被忽略', async () => {
    const r = await call('POST', '/api/v1/ops/events', {
      token: designerToken,
      body: { events: [errorEvent({ userId: 'hacker', detail: { nodeId: 'n1', expr: 'a +' } })] },
    })
    expect(r.status).toBe(200)
    expect(r.body.accepted).toBe(1)
    expect(r.body.total).toBeGreaterThanOrEqual(1)

    const g = await call('GET', '/api/v1/ops/events', { token: adminToken })
    const latest = g.body.items[0]
    expect(latest.id).toMatch(/^evt_/)
    expect(latest.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(latest.userId).not.toBe('hacker')
    expect(latest.detail.nodeId).toBe('n1')
  })

  it('message 超 500 字符 → 截断入库（不 400）', async () => {
    const long = 'x'.repeat(800)
    const r = await call('POST', '/api/v1/ops/events', {
      token: designerToken,
      body: { events: [errorEvent({ message: long })] },
    })
    expect(r.status).toBe(200)
    const g = await call('GET', '/api/v1/ops/events', { token: adminToken, })
    expect(g.body.items[0].message.length).toBeLessThanOrEqual(501)
    expect(g.body.items[0].message.endsWith('…')).toBe(true)
  })

  it('detail 序列化超 2000 字符 → 存截断预览', async () => {
    const r = await call('POST', '/api/v1/ops/events', {
      token: designerToken,
      body: { events: [errorEvent({ detail: { blob: 'y'.repeat(3000) } })] },
    })
    expect(r.status).toBe(200)
    const g = await call('GET', '/api/v1/ops/events', { token: adminToken })
    expect(g.body.items[0].detail.truncated).toBe(true)
    expect(typeof g.body.items[0].detail.preview).toBe('string')
  })
})

describe('GET /ops/events —— 权限、过滤与排序', () => {
  it('designer（无 "*"）→ 403 PERMISSION_DENIED；未登录 → 401', async () => {
    const r1 = await call('GET', '/api/v1/ops/events', { token: designerToken })
    expect(r1.status).toBe(403)
    expect(r1.body.code).toBe('PERMISSION_DENIED')
    const r2 = await call('GET', '/api/v1/ops/events')
    expect(r2.status).toBe(401)
  })

  it('按 type / pageId 过滤，且新 → 旧', async () => {
    await call('POST', '/api/v1/ops/events', {
      token: designerToken,
      body: {
        events: [
          { type: 'perf', name: 'schema-load', durationMs: 12.5, pageId: 'pg_filter', source: 'runtime' },
          { type: 'event', name: 'unsupported-action', pageId: 'pg_filter', source: 'runtime' },
        ],
      },
    })

    const perf = await call('GET', '/api/v1/ops/events?type=perf&pageId=pg_filter', { token: adminToken })
    expect(perf.status).toBe(200)
    expect(perf.body.items.every((e: any) => e.type === 'perf' && e.pageId === 'pg_filter')).toBe(true)
    expect(perf.body.items[0].durationMs).toBe(12.5)

    const all = await call('GET', '/api/v1/ops/events?pageId=pg_filter', { token: adminToken })
    expect(all.body.items[0].name).toBe('unsupported-action') // 后写在前
    expect(all.body.total).toBe(2)
  })

  it('limit 生效且被夹到 [1, 200]', async () => {
    const one = await call('GET', '/api/v1/ops/events?limit=1', { token: adminToken })
    expect(one.body.items).toHaveLength(1)
    const huge = await call('GET', '/api/v1/ops/events?limit=9999', { token: adminToken })
    expect(huge.body.items.length).toBeLessThanOrEqual(200)
  })

  it('非法 type / since → 400 OPS_INVALID', async () => {
    const r1 = await call('GET', '/api/v1/ops/events?type=log', { token: adminToken })
    expect(r1.status).toBe(400)
    const r2 = await call('GET', '/api/v1/ops/events?since=not-a-date', { token: adminToken })
    expect(r2.status).toBe(400)
  })
})

describe('GET /ops/summary —— DoD 接口回读', () => {
  it('按 pageId 汇总：byType / errors.total / perf avg·p95·max', async () => {
    const pageId = 'pg_sum'
    await call('POST', '/api/v1/ops/events', {
      token: designerToken,
      body: {
        events: [
          { type: 'perf', name: 'schema-load', durationMs: 10, pageId },
          { type: 'perf', name: 'render', durationMs: 20, pageId },
          { type: 'perf', name: 'schema-load', durationMs: 30, pageId },
          { type: 'perf', name: 'render', durationMs: 40, pageId },
          { type: 'perf', name: 'render', durationMs: 50, pageId },
          { type: 'error', name: 'expr', message: 'boom', pageId },
        ],
      },
    })

    const r = await call('GET', `/api/v1/ops/summary?pageId=${pageId}`, { token: adminToken })
    expect(r.status).toBe(200)
    expect(r.body.total).toBe(6)
    expect(r.body.byType).toEqual({ error: 1, perf: 5, event: 0 })
    expect(r.body.errors.total).toBe(1)
    expect(r.body.errors.lastAt).toMatch(/^\d{4}-/)
    expect(r.body.perf).toEqual({ count: 5, avgMs: 30, p95Ms: 50, maxMs: 50 })
  })

  it('designer → 403；空页面 → 全 0 且 lastAt 为 null', async () => {
    const denied = await call('GET', '/api/v1/ops/summary', { token: designerToken })
    expect(denied.status).toBe(403)

    const empty = await call('GET', '/api/v1/ops/summary?pageId=pg_none', { token: adminToken })
    expect(empty.status).toBe(200)
    expect(empty.body).toMatchObject({
      total: 0,
      byType: { error: 0, perf: 0, event: 0 },
      errors: { total: 0, lastAt: null },
      perf: { count: 0, avgMs: 0, p95Ms: 0, maxMs: 0 },
      lastAt: null,
    })
  })
})

describe('落盘与环形上限', () => {
  it('events.json 形状 { version: 1, events: [...] }', async () => {
    const raw = JSON.parse(await readFile(path.join(dataDir, 'ops', 'events.json'), 'utf8'))
    expect(raw.version).toBe(1)
    expect(Array.isArray(raw.events)).toBe(true)
    expect(raw.events.length).toBeGreaterThan(0)
    expect(raw.events[0]).toHaveProperty('id')
  })

  it('超过 500 条丢最旧（dropped > 0，总数恒定 500）', async () => {
    const before = await call('GET', '/api/v1/ops/summary', { token: adminToken })
    const current = before.body.total as number
    const need = 501 - current
    let dropped = 0
    // 每批 50 条（接口上限），直到越过 500
    let remaining = need
    while (remaining > 0) {
      const size = Math.min(50, remaining)
      const r = await call('POST', '/api/v1/ops/events', {
        token: designerToken,
        body: {
          events: Array.from({ length: size }, () => ({ type: 'event', name: 'fill', pageId: 'pg_ring' })),
        },
      })
      expect(r.status).toBe(200)
      dropped += r.body.dropped as number
      remaining -= size
    }
    expect(dropped).toBeGreaterThanOrEqual(1)

    const after = await call('GET', '/api/v1/ops/summary', { token: adminToken })
    expect(after.body.total).toBe(500)
  })
})
