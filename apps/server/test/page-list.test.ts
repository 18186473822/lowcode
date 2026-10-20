/**
 * 页面列表 / 删除接口集成测试（2026-10-20 补）。
 *
 * 覆盖 `GET /api/v1/pages` 与 `DELETE /api/v1/pages/:id`：
 * 鉴权、摘要字段（不含 schema 全文）、`updatedAt` 倒序、RBAC 可见性过滤、
 * 删除权限（仅 `'*'`）、删除后不可再读、重复删除 404、非法 id 400。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { PageSchema } from '@lc/schema'
import { AppModule } from '../src/app.module.js'

let app: INestApplication
let base: string
let dataDir: string
let adminToken: string
let designerToken: string

interface CallOptions {
  body?: unknown
  token?: string
}

async function call(method: string, apiPath: string, opts: CallOptions = {}) {
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
    /* 非 JSON 响应 */
  }
  return { status: res.status, body }
}

/** 最小合法 Schema（与 api.test.ts 同口径） */
function schema(id: string): PageSchema {
  return {
    schemaVersion: '1.0.0',
    id,
    name: `页面 ${id}`,
    type: 'form',
    root: {
      id: 'root',
      componentName: 'Page',
      children: [{ id: 'n1', componentName: 'Input', props: { name: 'title', label: '标题' } }],
    },
  } as PageSchema
}

async function login(username: string, password: string): Promise<string> {
  const r = await call('POST', '/api/v1/auth/login', { body: { username, password } })
  return r.body?.accessToken as string
}

/** 让两次写入的 updatedAt 必然不同（毫秒级时间戳，同毫秒会退化为 id 序） */
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-pagelist-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret'

  app = await NestFactory.create(AppModule, { logger: false })
  app.setGlobalPrefix('api/v1')
  // 显式绑 127.0.0.1（教训 B-29：listen(0) 默认绑 ::，IPv6 回环被拦会全红）
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()

  adminToken = await login('admin', 'admin123')
  designerToken = await login('designer', 'designer123')
})

afterAll(async () => {
  await app?.close()
  await rm(dataDir, { recursive: true, force: true })
})

describe('GET /pages', () => {
  it('未带令牌返回 401', async () => {
    const r = await call('GET', '/api/v1/pages')
    expect(r.status).toBe(401)
  })

  it('空数据目录返回 []', async () => {
    const r = await call('GET', '/api/v1/pages', { token: adminToken })
    expect(r.status).toBe(200)
    expect(r.body).toEqual([])
  })

  it('返回摘要字段，且不含 schema 全文（列表要轻）', async () => {
    await call('PUT', '/api/v1/pages/p_list_a/schema', {
      token: adminToken,
      body: { schema: schema('p_list_a'), appId: 'app_demo' },
    })
    await tick()
    await call('PUT', '/api/v1/pages/p_list_b/schema', {
      token: adminToken,
      body: { schema: schema('p_list_b') },
    })

    const r = await call('GET', '/api/v1/pages', { token: adminToken })
    expect(r.status).toBe(200)

    const a = r.body.find((p: any) => p.id === 'p_list_a')
    expect(a).toMatchObject({
      id: 'p_list_a',
      appId: 'app_demo',
      name: '页面 p_list_a',
      type: 'form',
      status: 'draft',
      currentVersion: 0,
      versionCount: 0,
    })
    expect(typeof a.updatedAt).toBe('string')
    // 关键断言：摘要不含整棵树 / 版本历史
    expect(a.draft).toBeUndefined()
    expect(a.versions).toBeUndefined()
    expect(a.root).toBeUndefined()
  })

  it('按 updatedAt 倒序（最近编辑的在前）', async () => {
    const r = await call('GET', '/api/v1/pages', { token: adminToken })
    const ids = r.body.map((p: any) => p.id)
    // p_list_b 晚于 p_list_a 写入
    expect(ids.indexOf('p_list_b')).toBeLessThan(ids.indexOf('p_list_a'))
  })

  it('发布后 currentVersion / versionCount 同步反映', async () => {
    await call('POST', '/api/v1/pages/p_list_b/publish', { token: adminToken, body: {} })
    const r = await call('GET', '/api/v1/pages', { token: adminToken })
    const b = r.body.find((p: any) => p.id === 'p_list_b')
    expect(b.currentVersion).toBe(1)
    expect(b.versionCount).toBe(1)
    expect(b.status).toBe('published')
  })

  it('按页面可见性过滤：限定角色后该页对 designer 不可见，对 admin 仍可见', async () => {
    await call('PUT', '/api/v1/pages/p_visible_all/schema', {
      token: adminToken,
      body: { schema: schema('p_visible_all') },
    })
    await call('PUT', '/api/v1/pages/p_hidden_for_designer/schema', {
      token: adminToken,
      body: { schema: schema('p_hidden_for_designer') },
    })
    // 只允许 admin 角色可见
    const grant = await call('PUT', '/api/v1/rbac/pages/p_hidden_for_designer', {
      token: adminToken,
      body: { roles: ['admin'] },
    })
    expect(grant.status).toBe(200)

    const asDesigner = await call('GET', '/api/v1/pages', { token: designerToken })
    expect(asDesigner.status).toBe(200)
    const designerIds = asDesigner.body.map((p: any) => p.id)
    expect(designerIds).toContain('p_visible_all')
    expect(designerIds).not.toContain('p_hidden_for_designer')

    const asAdmin = await call('GET', '/api/v1/pages', { token: adminToken })
    expect(asAdmin.body.map((p: any) => p.id)).toContain('p_hidden_for_designer')
  })
})

describe('DELETE /pages/:id', () => {
  it('非管理员（designer，无 "*"）返回 403 PERMISSION_DENIED', async () => {
    await call('PUT', '/api/v1/pages/p_del_forbidden/schema', {
      token: adminToken,
      body: { schema: schema('p_del_forbidden') },
    })
    const r = await call('DELETE', '/api/v1/pages/p_del_forbidden', { token: designerToken })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('PERMISSION_DENIED')

    // 403 不得产生副作用
    const still = await call('GET', '/api/v1/pages/p_del_forbidden/schema', { token: adminToken })
    expect(still.status).toBe(200)
  })

  it('管理员删除成功：返回 removedVersions，且随后读到 404', async () => {
    await call('PUT', '/api/v1/pages/p_del_ok/schema', {
      token: adminToken,
      body: { schema: schema('p_del_ok') },
    })
    await call('POST', '/api/v1/pages/p_del_ok/publish', { token: adminToken, body: {} })
    await call('POST', '/api/v1/pages/p_del_ok/publish', { token: adminToken, body: {} })

    const del = await call('DELETE', '/api/v1/pages/p_del_ok', { token: adminToken })
    expect(del.status).toBe(200)
    expect(del.body).toEqual({ pageId: 'p_del_ok', deleted: true, removedVersions: 2 })

    const after = await call('GET', '/api/v1/pages/p_del_ok/schema', { token: adminToken })
    expect(after.status).toBe(404)
    expect(after.body.code).toBe('PAGE_NOT_FOUND')

    // 列表里也不应再出现
    const list = await call('GET', '/api/v1/pages', { token: adminToken })
    expect(list.body.map((p: any) => p.id)).not.toContain('p_del_ok')
  })

  it('重复删除返回 404 PAGE_NOT_FOUND', async () => {
    const r = await call('DELETE', '/api/v1/pages/p_del_ok', { token: adminToken })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('PAGE_NOT_FOUND')
  })

  it('非法 id 返回 400 INVALID_PAGE_ID（service 层白名单先于仓储）', async () => {
    const r = await call('DELETE', '/api/v1/pages/1bad', { token: adminToken })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_PAGE_ID')
  })

  it('删除后再新建同 id 页面，版本号从 0 重新开始（无孤儿版本残留）', async () => {
    await call('PUT', '/api/v1/pages/p_recycle/schema', {
      token: adminToken,
      body: { schema: schema('p_recycle') },
    })
    await call('POST', '/api/v1/pages/p_recycle/publish', { token: adminToken, body: {} })
    await call('DELETE', '/api/v1/pages/p_recycle', { token: adminToken })

    await call('PUT', '/api/v1/pages/p_recycle/schema', {
      token: adminToken,
      body: { schema: schema('p_recycle') },
    })
    const list = await call('GET', '/api/v1/pages', { token: adminToken })
    const recycled = list.body.find((p: any) => p.id === 'p_recycle')
    expect(recycled.currentVersion).toBe(0)
    expect(recycled.versionCount).toBe(0)
    expect(recycled.status).toBe('draft')
  })
})
