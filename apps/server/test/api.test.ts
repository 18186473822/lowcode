/**
 * 服务端端到端集成测试：真实启动 Nest 应用（临时目录落盘），覆盖
 * 登录 / 鉴权 / Schema 草稿存取 / 静态校验 / 发布 / 版本 / 回滚 全链路。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sign as jwtSign } from 'jsonwebtoken' // vitest/esbuild 互操作下可用；生产代码见 jwt.service.ts 的 CJS 默认导入说明
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { PageSchema } from '@lc/schema'
import { AppModule } from '../src/app.module.js'

/* ------------------------------------------------------------------ */
/* 环境与辅助                                                          */
/* ------------------------------------------------------------------ */

let app: INestApplication
let base: string
let dataDir: string
/** admin 登录拿到的令牌（各分组复用） */
let token: string

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
    /* 非 JSON 响应（理论上不会出现） */
  }
  return { status: res.status, body }
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-server-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret-0123456789-abcdefghij'

  app = await NestFactory.create(AppModule, { logger: false })
  app.setGlobalPrefix('api/v1')
  // 显式绑 127.0.0.1：listen(0) 默认绑 ::，app.getUrl() 会返回 http://[::1]:port ——
  // 本机 IPv6 回环被拦（EACCES）时 34 条测试全红（教训 B-29）
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()
})

afterAll(async () => {
  await app?.close()
  await rm(dataDir, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ */
/* Schema 夹具                                                         */
/* ------------------------------------------------------------------ */

/** 版本 A：两个子节点 */
function schemaA(): PageSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'p_demo',
    name: '演示页面',
    type: 'form',
    root: {
      id: 'root',
      componentName: 'Page',
      children: [{ id: 'n1', componentName: 'Input', props: { name: 'title', label: '标题' } }],
    },
  } as PageSchema
}

/** 版本 B：A 基础上多一个节点（用于验证 v1 与 v2 内容不同） */
function schemaB(): PageSchema {
  const s = schemaA()
  s.root.children!.push({ id: 'n2', componentName: 'Input', props: { name: 'extra', label: '附加' } } as any)
  return s
}

/** 坏表达式 Schema（condition 语法错误） */
function badSchema(): PageSchema {
  const s = schemaA()
  s.root.children!.push({
    id: 'bad',
    componentName: 'Text',
    props: { text: 'x' },
    condition: 'formData.title +',
  } as any)
  return s
}

/* ------------------------------------------------------------------ */
/* 1. 登录与鉴权                                                        */
/* ------------------------------------------------------------------ */

describe('登录与鉴权', () => {
  it('POST /auth/login 成功返回令牌与用户', async () => {
    const r = await call('POST', '/api/v1/auth/login', {
      body: { username: 'admin', password: 'admin123' },
    })
    // 先取出令牌再断言，避免断言失败级联污染后续所有用例
    token = r.body?.accessToken
    expect(r.status).toBe(200)
    expect(token).toBeTruthy()
    expect(r.body.tokenType).toBe('Bearer')
    expect(r.body.expiresIn).toBe(8 * 3600)
    expect(r.body.user).toMatchObject({ id: 'u_admin', username: 'admin', roles: ['admin'] })
  })

  it('口令错误返回 401 INVALID_CREDENTIALS', async () => {
    const r = await call('POST', '/api/v1/auth/login', {
      body: { username: 'admin', password: 'wrong' },
    })
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('INVALID_CREDENTIALS')
  })

  it('用户不存在与口令错误同错误码（防用户名枚举）', async () => {
    const r = await call('POST', '/api/v1/auth/login', {
      body: { username: 'ghost', password: 'x' },
    })
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('INVALID_CREDENTIALS')
  })

  it('缺少字段返回 400 INVALID_REQUEST', async () => {
    const r = await call('POST', '/api/v1/auth/login', { body: { username: 'admin' } })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_REQUEST')
  })

  it('GET /auth/me 携带令牌返回当前登录态', async () => {
    const r = await call('GET', '/api/v1/auth/me', { token })
    expect(r.status).toBe(200)
    expect(r.body.user).toMatchObject({ sub: 'u_admin', username: 'admin' })
  })

  it('无令牌访问受保护接口 401', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema')
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('UNAUTHORIZED')
  })

  it('篡改令牌 401', async () => {
    const r = await call('GET', '/api/v1/auth/me', { token: `${token}tampered` })
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('UNAUTHORIZED')
  })

  it('过期令牌 401', async () => {
    const expired = jwtSign({ username: 'admin', roles: ['admin'] }, 'test-secret', {
      algorithm: 'HS256',
      subject: 'u_admin',
      expiresIn: -10,
    })
    const r = await call('GET', '/api/v1/auth/me', { token: expired })
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('UNAUTHORIZED')
  })

  it('非法 Authorization 头格式 401', async () => {
    const res = await fetch(`${base}/api/v1/auth/me`, {
      headers: { authorization: token /* 缺 Bearer 前缀 */ },
    })
    expect(res.status).toBe(401)
  })
})

/* ------------------------------------------------------------------ */
/* 2. 草稿存取                                                         */
/* ------------------------------------------------------------------ */

describe('Schema 草稿存取', () => {
  it('PUT 保存草稿（首次自动建档）', async () => {
    const r = await call('PUT', '/api/v1/pages/p_demo/schema', { body: { schema: schemaA() }, token })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ pageId: 'p_demo', status: 'draft', currentVersion: 0 })
    expect(r.body.validation.valid).toBe(true)
  })

  it('GET ?version=draft 读回完全相同的 Schema', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=draft', { token })
    expect(r.status).toBe(200)
    expect(r.body.version).toBe('draft')
    expect(r.body.schema).toEqual(schemaA())
  })

  it('PUT 携带坏表达式被 400 拒绝（服务端与设计器同源校验）', async () => {
    const r = await call('PUT', '/api/v1/pages/p_demo/schema', { body: { schema: badSchema() }, token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('SCHEMA_INVALID')
    expect(r.body.errors.some((e: any) => e.code === 'E_EXPR_SYNTAX')).toBe(true)
  })

  it('PUT 非对象 schema 400', async () => {
    const r = await call('PUT', '/api/v1/pages/p_demo/schema', { body: { schema: 'nope' }, token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('SCHEMA_INVALID')
  })

  it('GET 不存在的页面 404 PAGE_NOT_FOUND', async () => {
    const r = await call('GET', '/api/v1/pages/p_nothing/schema', { token })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('PAGE_NOT_FOUND')
  })

  it('非法页面 id（含空格）400 INVALID_PAGE_ID', async () => {
    const id = encodeURIComponent('bad id')
    const r = await call('GET', `/api/v1/pages/${id}/schema`, { token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_PAGE_ID')
  })
})

/* ------------------------------------------------------------------ */
/* 3. 发布、版本与回滚                                                  */
/* ------------------------------------------------------------------ */

describe('发布、版本与回滚', () => {
  it('publish 把草稿固化为 v1 并置为已发布', async () => {
    const r = await call('POST', '/api/v1/pages/p_demo/publish', { body: { note: '首次发布' }, token })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ status: 'published', version: 1, createdBy: 'admin', note: '首次发布' })
  })

  it('GET ?version=published 返回 v1', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=published', { token })
    expect(r.status).toBe(200)
    expect(r.body.version).toBe(1)
    expect(r.body.schema).toEqual(schemaA())
  })

  it('GET ?version=v1 与 published 等价', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=v1', { token })
    expect(r.status).toBe(200)
    expect(r.body.version).toBe(1)
    expect(r.body.schema).toEqual(schemaA())
  })

  it('GET ?version=v99 404 VERSION_NOT_FOUND', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=v99', { token })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('VERSION_NOT_FOUND')
  })

  it('GET ?version=乱填 400 INVALID_VERSION', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=abc', { token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_VERSION')
  })

  it('从未发布的页面取 published 409 NOT_PUBLISHED', async () => {
    const put = await call('PUT', '/api/v1/pages/p_unpub/schema', { body: { schema: schemaA() }, token })
    expect(put.status).toBe(200)
    const r = await call('GET', '/api/v1/pages/p_unpub/schema?version=published', { token })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('NOT_PUBLISHED')
  })

  it('修改草稿后再次发布 → v2', async () => {
    const put = await call('PUT', '/api/v1/pages/p_demo/schema', { body: { schema: schemaB() }, token })
    expect(put.status).toBe(200)
    const r = await call('POST', '/api/v1/pages/p_demo/publish', { body: {}, token })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ status: 'published', version: 2 })
  })

  it('GET ?version=1 仍是旧 Schema（历史不可变）', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=1', { token })
    expect(r.status).toBe(200)
    expect(r.body.schema).toEqual(schemaA())
    expect(r.body.schema.root.children).toHaveLength(1) // v1 只有 1 个子节点，v2 才有 2 个
  })

  it('GET ?version=2 返回新 Schema', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=2', { token })
    expect(r.status).toBe(200)
    expect(r.body.schema).toEqual(schemaB())
  })

  it('rollback 把 v1 复制为新草稿，currentVersion 不回退', async () => {
    const r = await call('POST', '/api/v1/pages/p_demo/rollback', { body: { version: 1 }, token })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ status: 'draft', currentVersion: 2, rolledBackTo: 1 })
  })

  it('回滚后草稿内容 = v1', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=draft', { token })
    expect(r.status).toBe(200)
    expect(r.body.schema).toEqual(schemaA())
  })

  it('回滚不动历史：v2 仍可读', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/schema?version=v2', { token })
    expect(r.status).toBe(200)
    expect(r.body.schema).toEqual(schemaB())
  })

  it('rollback 到不存在的版本 404', async () => {
    const r = await call('POST', '/api/v1/pages/p_demo/rollback', { body: { version: 9 }, token })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('VERSION_NOT_FOUND')
  })

  it('rollback 版本号非法 400', async () => {
    const r = await call('POST', '/api/v1/pages/p_demo/rollback', { body: { version: 0 }, token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_REQUEST')
  })

  it('GET /versions 列表：倒序、字段齐备、不含 schema 全文（批 5 / D-P2-8）', async () => {
    const r = await call('GET', '/api/v1/pages/p_demo/versions', { token })
    expect(r.status).toBe(200)
    // 此时 p_demo：已发 v1、v2 并 rollback 到 v1（status=draft、currentVersion 仍是 2）
    expect(r.body).toMatchObject({ pageId: 'p_demo', status: 'draft', currentVersion: 2 })
    expect(r.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]) // 倒序
    expect(r.body.versions[0].createdBy).toBe('admin')
    expect(r.body.versions[0].createdAt).toBeTruthy()
    expect(r.body.versions[0].schema).toBeUndefined() // 轻量元数据，不带全文
  })

  it('GET /versions 未发布页面 → 空列表 + currentVersion 0', async () => {
    await call('PUT', '/api/v1/pages/p_ver_empty/schema', { body: { schema: schemaA() }, token })
    const r = await call('GET', '/api/v1/pages/p_ver_empty/versions', { token })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ pageId: 'p_ver_empty', currentVersion: 0, versions: [] })
  })

  it('GET /versions 页面不存在 404', async () => {
    const r = await call('GET', '/api/v1/pages/p_not_exists/versions', { token })
    expect(r.status).toBe(404)
  })

  it('落盘文件包含全部历史版本（方案 8.4 双表合并视图）', async () => {
    const raw = await readFile(path.join(dataDir, 'pages', 'p_demo.json'), 'utf8')
    const record = JSON.parse(raw)
    expect(record.currentVersion).toBe(2)
    expect(record.status).toBe('draft')
    expect(record.versions).toHaveLength(2)
    expect(record.versions.map((v: any) => v.version)).toEqual([1, 2])
    expect(record.versions[0].createdBy).toBe('admin')
  })
})

/* ------------------------------------------------------------------ */
/* 4. 静态校验接口                                                      */
/* ------------------------------------------------------------------ */

describe('POST /pages/validate', () => {
  it('合法 Schema → valid true', async () => {
    const r = await call('POST', '/api/v1/pages/validate', { body: { schema: schemaA() }, token })
    expect(r.status).toBe(200)
    expect(r.body.valid).toBe(true)
    expect(r.body.errors).toHaveLength(0)
  })

  it('坏表达式 → valid false 且带 E_EXPR_SYNTAX', async () => {
    const r = await call('POST', '/api/v1/pages/validate', { body: { schema: badSchema() }, token })
    expect(r.status).toBe(200)
    expect(r.body.valid).toBe(false)
    expect(r.body.errors.some((e: any) => e.code === 'E_EXPR_SYNTAX')).toBe(true)
  })

  it('非对象 schema → valid false', async () => {
    const r = await call('POST', '/api/v1/pages/validate', { body: { schema: 42 }, token })
    expect(r.status).toBe(200)
    expect(r.body.valid).toBe(false)
  })

  it('无令牌 401', async () => {
    const r = await call('POST', '/api/v1/pages/validate', { body: { schema: schemaA() } })
    expect(r.status).toBe(401)
  })
})

/* ------------------------------------------------------------------ */
/* 6. 应用启动聚合（运行时壳菜单）                                        */
/* ------------------------------------------------------------------ */

describe('GET /apps/bootstrap', () => {
  it('无令牌 401 UNAUTHORIZED', async () => {
    const r = await call('GET', '/api/v1/apps/bootstrap')
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('UNAUTHORIZED')
  })

  it('返回当前用户 + 按 appId 分组的应用菜单（含页面元数据投影）', async () => {
    // 先建档一个专属页面（不依赖前面分组的执行顺序），appId 走默认 app_default
    const put = await call('PUT', '/api/v1/pages/bs_menu/schema', {
      body: { schema: { ...schemaA(), id: 'p_bs_menu', name: '菜单页' } },
      token,
    })
    expect(put.status).toBe(200)

    const r = await call('GET', '/api/v1/apps/bootstrap', { token })
    expect(r.status).toBe(200)
    expect(r.body.user).toMatchObject({ username: 'admin' })
    expect(Array.isArray(r.body.apps)).toBe(true)

    const app = r.body.apps.find((a: any) => a.id === 'app_default')
    expect(app).toBeTruthy()
    expect(typeof app.name).toBe('string')

    const page = app.pages.find((p: any) => p.id === 'bs_menu')
    expect(page).toMatchObject({ name: '菜单页', type: 'form', status: 'draft', currentVersion: 0 })
    expect(typeof page.updatedAt).toBe('string')
    // 菜单投影要轻：不携带 Schema 本体与版本历史
    expect(page.schema).toBeUndefined()
    expect(page.versions).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */
/* 7. 权限 RBAC（Phase 2 批 6 / D-P2-10~12）                            */
/* ------------------------------------------------------------------ */

describe('批 6：RBAC 配置接口 + bootstrap 权限 + 页面可见性守卫', () => {
  /** designer 登录令牌（受限角色，用于双角色对比） */
  let dToken: string

  beforeAll(async () => {
    const login = await call('POST', '/api/v1/auth/login', {
      body: { username: 'designer', password: 'designer123' },
    })
    expect(login.status).toBe(200)
    dToken = login.body.accessToken
    expect(dToken).toBeTruthy()
  })

  it('GET /rbac/roles：首启返回种子配置（admin [*] 通配 + designer 空角色，pages 空）', async () => {
    const r = await call('GET', '/api/v1/rbac/roles', { token })
    expect(r.status).toBe(200)
    const admin = r.body.roles.find((x: any) => x.key === 'admin')
    expect(admin).toMatchObject({ name: '平台管理员', perms: ['*'] })
    const designer = r.body.roles.find((x: any) => x.key === 'designer')
    expect(designer).toBeTruthy()
    expect(designer.perms).toEqual([])
    expect(r.body.pages).toEqual({})
  })

  it('login 响应含 perms：admin 通配 [*] / designer 无权限点', async () => {
    const a = await call('POST', '/api/v1/auth/login', {
      body: { username: 'admin', password: 'admin123' },
    })
    expect(a.body.perms).toEqual(['*'])
    const d = await call('POST', '/api/v1/auth/login', {
      body: { username: 'designer', password: 'designer123' },
    })
    expect(d.body.perms).toEqual([])
  })

  it('PUT /rbac/roles/:key upsert + 回读；GET 回传更新后的配置', async () => {
    const put = await call('PUT', '/api/v1/rbac/roles/designer', {
      body: { name: '设计师权限', perms: ['emp_submit'] },
      token,
    })
    expect(put.status).toBe(200)

    // '*' 通配合法（超级角色；不放行会让种子角色 admin 一编辑就 400）
    const wc = await call('PUT', '/api/v1/rbac/roles/admin', {
      body: { name: '平台管理员', perms: ['*'] },
      token,
    })
    expect(wc.status).toBe(200)

    const r = await call('GET', '/api/v1/rbac/roles', { token })
    const designer = r.body.roles.find((x: any) => x.key === 'designer')
    expect(designer).toMatchObject({ name: '设计师权限', perms: ['emp_submit'] })

    // designer 再登录：权限点即时生效
    const d = await call('POST', '/api/v1/auth/login', {
      body: { username: 'designer', password: 'designer123' },
    })
    expect(d.body.perms).toEqual(['emp_submit'])
  })

  it('PUT /rbac/roles 非法入参 400：坏 key / 坏 perms / 缺 name', async () => {
    const badKey = await call('PUT', '/api/v1/rbac/roles/1bad', {
      body: { name: 'x', perms: [] },
      token,
    })
    expect(badKey.status).toBe(400)

    const badPerm = await call('PUT', '/api/v1/rbac/roles/ok_role', {
      body: { name: 'x', perms: ['has space'] },
      token,
    })
    expect(badPerm.status).toBe(400)

    const noName = await call('PUT', '/api/v1/rbac/roles/ok_role', {
      body: { perms: [] },
      token,
    })
    expect(noName.status).toBe(400)
  })

  it('PUT /rbac/pages/:pageId 页面授权 upsert + 非法 roles 400', async () => {
    const put = await call('PUT', '/api/v1/rbac/pages/bs_menu', {
      body: { roles: ['admin'] },
      token,
    })
    expect(put.status).toBe(200)

    const cfg = await call('GET', '/api/v1/rbac/roles', { token })
    expect(cfg.body.pages.bs_menu).toEqual(['admin'])

    const bad = await call('PUT', '/api/v1/rbac/pages/bs_menu', {
      body: { roles: ['ok', '1bad'] },
      token,
    })
    expect(bad.status).toBe(400)
  })

  it('bootstrap：admin 含受限页且 perms [*]；designer 缺受限页且 perms 带权限点', async () => {
    const a = await call('GET', '/api/v1/apps/bootstrap', { token })
    expect(a.status).toBe(200)
    expect(a.body.perms).toEqual(['*'])
    const aPages = a.body.apps.flatMap((x: any) => x.pages.map((p: any) => p.id))
    expect(aPages).toContain('bs_menu') // 受限页对 '*' 角色恒可见

    const d = await call('GET', '/api/v1/apps/bootstrap', { token: dToken })
    expect(d.status).toBe(200)
    expect(d.body.perms).toEqual(['emp_submit'])
    const dPages = d.body.apps.flatMap((x: any) => x.pages.map((p: any) => p.id))
    expect(dPages).not.toContain('bs_menu') // 菜单差异：designer 无授权 → 不在菜单
    // 无授权条目的页面仍全员可见（向后兼容）
    const someOther = dPages.find((id: string) => id !== 'bs_menu')
    expect(someOther).toBeTruthy()
  })

  it('GET schema 页面守卫：designer 读受限页 403 PAGE_FORBIDDEN；admin 200；未受限页 200', async () => {
    const denied = await call('GET', '/api/v1/pages/bs_menu/schema?version=draft', { token: dToken })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('PAGE_FORBIDDEN')

    const ok = await call('GET', '/api/v1/pages/bs_menu/schema?version=draft', { token })
    expect(ok.status).toBe(200)

    const open = await call('GET', '/api/v1/pages/p_demo/schema?version=draft', { token: dToken })
    expect(open.status).toBe(200) // p_demo 未配页面授权 → 全员可见
  })

  it('页面授权恢复：空数组 = 删条目全员可见（designer 再读 200）', async () => {
    const put = await call('PUT', '/api/v1/rbac/pages/bs_menu', { body: { roles: [] }, token })
    expect(put.status).toBe(200)

    const r = await call('GET', '/api/v1/pages/bs_menu/schema?version=draft', { token: dToken })
    expect(r.status).toBe(200)
  })

  it('RBAC 接口需令牌：无令牌 401', async () => {
    const r = await call('GET', '/api/v1/rbac/roles')
    expect(r.status).toBe(401)
  })
})
