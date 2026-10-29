/**
 * 批 3 D-P3-8 —— 应用配置接口：`GET/PUT /apps/config` + bootstrap 下发 theme。
 * 真实 Nest 启动 + HTTP 全链路（沿 api.test.ts 模式）；写权限仅 '*' 通配角色。
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

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-appcfg-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret-0123456789-abcdefghij'
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

describe('GET /apps/config', () => {
  it('未登录 → 401', async () => {
    const r = await call('GET', '/api/v1/apps/config')
    expect(r.status).toBe(401)
  })

  it('初始无配置 → 200 且无 theme 键', async () => {
    const r = await call('GET', '/api/v1/apps/config', { token: designerToken })
    expect(r.status).toBe(200)
    expect('theme' in (r.body ?? {})).toBe(false)
  })
})

describe('PUT /apps/config —— 权限与校验', () => {
  it('designer（无 "*"）→ 403 PERMISSION_DENIED', async () => {
    const r = await call('PUT', '/api/v1/apps/config', {
      token: designerToken,
      body: { theme: { primary: '#ff6600' } },
    })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('PERMISSION_DENIED')
  })

  it('非法 primary → 400 APP_CONFIG_INVALID', async () => {
    const r = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { theme: { primary: 'red' } },
    })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('APP_CONFIG_INVALID')
  })

  it('未知配置项 → 400', async () => {
    const r = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { theme: { logo: 'x.png' } },
    })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('APP_CONFIG_INVALID')
  })

  it('theme 非对象 → 400', async () => {
    const r = await call('PUT', '/api/v1/apps/config', { token: adminToken, body: { theme: 'x' } })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('APP_CONFIG_INVALID')
  })
})

describe('PUT /apps/config —— patch 语义与回读（B-35）', () => {
  it('写 primary → 200 回传 + GET 回读一致 + 文件落盘', async () => {
    const w = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { theme: { primary: '#FF6600' } },
    })
    expect(w.status).toBe(200)
    expect(w.body.theme.primary).toBe('#FF6600')

    const g = await call('GET', '/api/v1/apps/config', { token: adminToken })
    expect(g.body.theme.primary).toBe('#FF6600')

    const raw = JSON.parse(await readFile(path.join(dataDir, 'apps.json'), 'utf8'))
    expect(raw.theme.primary).toBe('#FF6600')
  })

  it('缺键保留（patch）：补 radius 不丢 primary', async () => {
    const w = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { theme: { radius: '12px' } },
    })
    expect(w.status).toBe(200)
    expect(w.body.theme).toEqual({ primary: '#FF6600', radius: '12px' })
  })

  it('显式 null 清除该键', async () => {
    await call('PUT', '/api/v1/apps/config', { token: adminToken, body: { theme: { dark: true } } })
    const w = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { theme: { dark: null } },
    })
    expect(w.body.theme).toEqual({ primary: '#FF6600', radius: '12px' })
    expect('dark' in w.body.theme).toBe(false)
  })
})

describe('bootstrap 下发 theme', () => {
  it('顶层 theme 与 config 一致', async () => {
    const r = await call('GET', '/api/v1/apps/bootstrap', { token: adminToken })
    expect(r.status).toBe(200)
    expect(r.body.theme).toEqual({ primary: '#FF6600', radius: '12px' })
  })
})

describe('PUT /apps/config —— 应用设置（2026-10-29 P1）', () => {
  it('写 name / icon → 200 回传完整配置，且不动 theme', async () => {
    const w = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { name: '请假管理', icon: '假' },
    })
    expect(w.status).toBe(200)
    expect(w.body.name).toBe('请假管理')
    expect(w.body.icon).toBe('假')
    // theme 仍在（两个 patch 互不干扰）
    expect(w.body.theme).toEqual({ primary: '#FF6600', radius: '12px' })

    const g = await call('GET', '/api/v1/apps/config', { token: adminToken })
    expect(g.body.name).toBe('请假管理')
  })

  it('entry 合法 → 落库；非法 type / pageId → 400', async () => {
    const ok = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { entry: { type: 'portal', pageId: 'p_home' } },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.entry).toEqual({ type: 'portal', pageId: 'p_home' })

    const badType = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { entry: { type: 'flow', pageId: 'p_home' } },
    })
    expect(badType.status).toBe(400)
    expect(badType.body.code).toBe('APP_CONFIG_INVALID')

    const badId = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { entry: { type: 'page', pageId: '9-bad' } },
    })
    expect(badId.status).toBe(400)
  })

  it('menus 整组替换（不是合并），并丢弃契约外字段', async () => {
    const two = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: {
        menus: [
          { id: 'm_home', name: '首页', type: 'portal', pageId: 'p_home', children: [] },
          { id: 'm_todo', name: '待办', type: 'builtin', target: 'todoList', badge: 'todo' },
        ],
      },
    })
    expect(two.status).toBe(200)
    expect(two.body.menus).toHaveLength(2)
    expect(two.body.menus[0].children).toBeUndefined()

    const one = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { menus: [{ id: 'm_site', name: '官网', type: 'url', url: 'https://example.com' }] },
    })
    expect(one.status).toBe(200)
    expect(one.body.menus).toEqual([
      { id: 'm_site', name: '官网', type: 'url', url: 'https://example.com' },
    ])
  })

  it('menus 非法：type 未知 / 缺 target / id 重复 → 400', async () => {
    const badType = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { menus: [{ id: 'a', name: 'A', type: 'iframe' }] },
    })
    expect(badType.status).toBe(400)

    const noTarget = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { menus: [{ id: 'a', name: 'A', type: 'builtin' }] },
    })
    expect(noTarget.status).toBe(400)
    expect(noTarget.body.message).toContain('target')

    const dup = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: {
        menus: [
          { id: 'a', name: 'A', type: 'url', url: 'https://a.com' },
          { id: 'a', name: 'B', type: 'url', url: 'https://b.com' },
        ],
      },
    })
    expect(dup.status).toBe(400)
    expect(dup.body.message).toContain('重复')
  })

  it('未知顶层键 → 400（白名单）', async () => {
    const r = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { logo: 'x.png' },
    })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('APP_CONFIG_INVALID')
  })

  it('显式 null 清除应用设置，theme 不受影响', async () => {
    const w = await call('PUT', '/api/v1/apps/config', {
      token: adminToken,
      body: { name: null, icon: null, menus: null },
    })
    expect(w.status).toBe(200)
    expect('name' in w.body).toBe(false)
    expect('menus' in w.body).toBe(false)
    expect(w.body.theme.primary).toBe('#FF6600')
  })
})
