/**
 * 物料市场端到端测试（Phase 4 开放集成第三批）。
 *
 * 真实启动 Nest 应用（JSON 存储），覆盖：
 * - 公开签名清单：ES256 验签、ETag/304、公钥端点；
 * - 管理员发布审核状态机：草稿 → 提交 → 驳回/通过 → 发布 → 下架；
 * - If-Match 乐观锁、版本快照唯一性、字段校验与权限边界；
 * - 租户级安装状态：隔离、幂等、版本一致性、卸载与冲突。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPublicKey, verify } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module.js'
import { canonicalJson } from '../src/market/market.signing.js'

let app: INestApplication
let base: string
let dataDir: string
let admin: string
let designer: string

interface CallOptions {
  body?: unknown
  token?: string
  headers?: Record<string, string>
}

async function call(method: string, apiPath: string, opts: CallOptions = {}) {
  const res = await fetch(`${base}${apiPath}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return {
    status: res.status,
    body,
    headers: Object.fromEntries(res.headers.entries()) as Record<string, string>,
  }
}

function materialBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'brand-button-2026',
    name: '品牌按钮',
    version: '1.0.0',
    description: '品牌主色按钮预设',
    category: 'basic',
    kind: 'component',
    component: 'Button',
    meta: {
      name: 'BrandButton',
      title: '品牌按钮',
      version: '1.0.0',
      category: 'basic',
      defaultProps: { text: '立即提交', type: 'primary' },
      settings: [],
    },
    ...overrides,
  }
}

async function createDraft(body: Record<string, unknown>): Promise<any> {
  const res = await call('POST', '/api/v1/materials', { body, token: admin })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body
}

/** 从草稿一路发布；返回发布后的物料。 */
async function publish(body: Record<string, unknown>): Promise<any> {
  const draft = await createDraft(body)
  const id = draft.id
  let res = await call('POST', `/api/v1/materials/${id}/submit`, { token: admin })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  res = await call('POST', `/api/v1/materials/${id}/review`, {
    body: { decision: 'approve' },
    token: admin,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  res = await call('POST', `/api/v1/materials/${id}/publish`, { token: admin })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body
}

function verifyEnvelope(body: any, publicKeyPem: string): boolean {
  const data = Buffer.from(canonicalJson(body.manifest), 'utf8')
  return verify(
    'sha256',
    data,
    { key: createPublicKey(publicKeyPem), dsaEncoding: 'ieee-p1363' },
    Buffer.from(body.signature, 'base64'),
  )
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-market-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret-0123456789-abcdefghij'
  delete process.env.LC_MATERIAL_MARKET_PRIVATE_KEY
  delete process.env.LC_MATERIAL_MARKET_NAME

  app = await NestFactory.create(AppModule, { logger: ['error'] })
  app.setGlobalPrefix('api/v1')
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()

  const login = await call('POST', '/api/v1/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  })
  expect(login.status).toBe(200)
  admin = login.body.accessToken

  const loginDesigner = await call('POST', '/api/v1/auth/login', {
    body: { username: 'designer', password: 'designer123' },
  })
  expect(loginDesigner.status).toBe(200)
  designer = loginDesigner.body.accessToken
})

afterAll(async () => {
  await app?.close()
  await rm(dataDir, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ */
/* 1. 公开清单                                                         */
/* ------------------------------------------------------------------ */

describe('物料市场 · 公开清单', () => {
  let publicKey: string

  it('公钥端点返回可解析的 SPKI PEM 与指纹', async () => {
    const res = await call('GET', '/api/v1/materials/manifest/key')
    expect(res.status).toBe(200)
    expect(res.body.alg).toBe('ES256')
    expect(res.body.publicKey).toContain('-----BEGIN PUBLIC KEY-----')
    expect(res.body.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(res.body.kid).toBe(res.body.fingerprint)
    publicKey = res.body.publicKey
  })

  it('空市场返回合法签名清单与 ETag，If-None-Match 命中 304', async () => {
    const res = await call('GET', '/api/v1/materials/manifest')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toContain('max-age=60')
    expect(res.body.alg).toBe('ES256')
    expect(res.body.manifest.schemaVersion).toBe(1)
    expect(res.body.manifest.materials).toEqual([])
    expect(verifyEnvelope(res.body, publicKey)).toBe(true)

    const cached = await call('GET', '/api/v1/materials/manifest', {
      headers: { 'if-none-match': res.headers.etag },
    })
    expect(cached.status).toBe(304)
  })

  it('清单无需登录；未配置私钥也不会返回伪造签名（测试环境为临时密钥）', async () => {
    const anonymous = await call('GET', '/api/v1/materials/manifest')
    expect(anonymous.status).toBe(200)
    expect(anonymous.headers.etag).toMatch(/^"market-manifest:[0-9a-f]{16}"$/)
  })
})

/* ------------------------------------------------------------------ */
/* 2. 权限与校验                                                       */
/* ------------------------------------------------------------------ */

describe('物料市场 · 权限与校验', () => {
  it('未登录 401；非管理员写操作 403 ADMIN_REQUIRED', async () => {
    const anonymous = await call('GET', '/api/v1/materials')
    expect(anonymous.status).toBe(401)

    const create = await call('POST', '/api/v1/materials', { body: materialBody(), token: designer })
    expect(create.status).toBe(403)
    expect(create.body.code).toBe('ADMIN_REQUIRED')
  })

  it('非法字段、id、semver、kind、组件白名单均返回 400 并定位', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ extra: true }, 'extra'],
      [{ id: 'Bad_ID' }, 'id'],
      [{ version: '1.0' }, 'version'],
      [{ kind: 'remote-js' }, 'kind'],
      [{ component: 'EvalScript' }, 'component'],
      [{ kind: 'meta', component: 'Button' }, 'component'],
      [{ meta: { ...materialBody().meta, title: '' } }, 'meta.title'],
      [{ meta: { ...materialBody().meta, settings: {} } }, 'meta.settings'],
    ]
    for (const [patch, expectedPath] of cases) {
      const res = await call('POST', '/api/v1/materials', {
        body: materialBody(patch),
        token: admin,
      })
      expect(res.status, JSON.stringify(patch)).toBe(400)
      expect(res.body.code).toBe('MARKET_MATERIAL_INVALID')
      expect(
        res.body.errors.some((item: any) => item.path === expectedPath),
        JSON.stringify(res.body.errors),
      ).toBe(true)
    }
  })

  it('创建草稿返回 ETag，重复 id 409；草稿对普通用户不可见', async () => {
    const created = await call('POST', '/api/v1/materials', { body: materialBody(), token: admin })
    expect(created.status).toBe(200)
    expect(created.body.status).toBe('draft')
    expect(created.body.revision).toBe(1)
    expect(created.headers.etag).toBe('"material:brand-button-2026:1"')

    const duplicate = await call('POST', '/api/v1/materials', { body: materialBody(), token: admin })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.code).toBe('MARKET_MATERIAL_EXISTS')

    const visible = await call('GET', '/api/v1/materials', { token: designer })
    expect(visible.status).toBe(200)
    expect(visible.body.items).toEqual([])

    const hidden = await call('GET', '/api/v1/materials/brand-button-2026', { token: designer })
    expect(hidden.status).toBe(404)

    const own = await call('GET', '/api/v1/materials/brand-button-2026', { token: admin })
    expect(own.status).toBe(200)
    expect(own.headers.etag).toBe('"material:brand-button-2026:1"')
  })

  it('查询参数校验：普通用户按状态筛选 403，非法 category/kind 400', async () => {
    const forbidden = await call('GET', '/api/v1/materials?status=draft', { token: designer })
    expect(forbidden.status).toBe(403)

    for (const query of ['category=nope', 'kind=remote', 'status=unknown']) {
      const res = await call('GET', `/api/v1/materials?${query}`, { token: admin })
      expect(res.status, query).toBe(400)
      expect(res.body.code).toBe('INVALID_QUERY')
    }
  })
})

/* ------------------------------------------------------------------ */
/* 3. 审核与发布状态机                                                 */
/* ------------------------------------------------------------------ */

describe('物料市场 · 发布审核', () => {
  it('未提交不能审核/发布；pending 不能编辑', async () => {
    const beforeSubmit = await call('POST', '/api/v1/materials/brand-button-2026/publish', {
      token: admin,
    })
    expect(beforeSubmit.status).toBe(409)
    expect(beforeSubmit.body.code).toBe('MARKET_STATE_CONFLICT')

    const review = await call('POST', '/api/v1/materials/brand-button-2026/review', {
      body: { decision: 'approve' },
      token: admin,
    })
    expect(review.status).toBe(409)
    expect(review.body.code).toBe('MARKET_STATE_CONFLICT')

    const submitted = await call('POST', '/api/v1/materials/brand-button-2026/submit', {
      token: admin,
      headers: { 'if-match': '"material:brand-button-2026:1"' },
    })
    expect(submitted.status).toBe(200)
    expect(submitted.body.status).toBe('pending')
    expect(submitted.body.revision).toBe(2)

    const editPending = await call('PUT', '/api/v1/materials/brand-button-2026', {
      body: materialBody({ name: '改个名' }),
      token: admin,
    })
    expect(editPending.status).toBe(409)
    expect(editPending.body.code).toBe('MARKET_STATE_CONFLICT')
  })

  it('驳回必须写理由；驳回后可编辑并重新提交', async () => {
    const noReason = await call('POST', '/api/v1/materials/brand-button-2026/review', {
      body: { decision: 'reject' },
      token: admin,
    })
    expect(noReason.status).toBe(400)
    expect(noReason.body.code).toBe('MARKET_MATERIAL_INVALID')

    const rejected = await call('POST', '/api/v1/materials/brand-button-2026/review', {
      body: { decision: 'reject', note: '请补充默认属性' },
      token: admin,
      headers: { 'if-match': '"material:brand-button-2026:2"' },
    })
    expect(rejected.status).toBe(200)
    expect(rejected.body.status).toBe('rejected')
    expect(rejected.body.reviewNote).toBe('请补充默认属性')

    const edited = await call('PUT', '/api/v1/materials/brand-button-2026', {
      body: materialBody({ description: '已补充说明' }),
      token: admin,
      headers: { 'if-match': '"material:brand-button-2026:3"' },
    })
    expect(edited.status).toBe(200)
    expect(edited.body.status).toBe('draft')
    expect(edited.body.reviewNote).toBeUndefined()
    expect(edited.body.revision).toBe(4)
  })

  it('审核通过后发布；清单立即出现且签名可验证', async () => {
    const submitted = await call('POST', '/api/v1/materials/brand-button-2026/submit', {
      token: admin,
    })
    expect(submitted.status).toBe(200)

    const approved = await call('POST', '/api/v1/materials/brand-button-2026/review', {
      body: { decision: 'approve', note: 'OK' },
      token: admin,
    })
    expect(approved.status).toBe(200)
    expect(approved.body.status).toBe('approved')

    const published = await call('POST', '/api/v1/materials/brand-button-2026/publish', {
      token: admin,
    })
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    expect(published.body.status).toBe('published')
    expect(published.body.publishedVersion).toBe('1.0.0')

    const catalog = await call('GET', '/api/v1/materials', { token: designer })
    expect(catalog.status).toBe(200)
    expect(catalog.body.items).toHaveLength(1)
    expect(catalog.body.items[0].id).toBe('brand-button-2026')
    expect(catalog.body.items[0].component).toBe('Button')

    const manifest = await call('GET', '/api/v1/materials/manifest')
    expect(manifest.body.manifest.materials).toHaveLength(1)
    expect(manifest.body.manifest.materials[0].meta.defaultProps.type).toBe('primary')
    const key = await call('GET', '/api/v1/materials/manifest/key')
    expect(verifyEnvelope(manifest.body, key.body.publicKey)).toBe(true)
    expect(manifest.body.manifest.generatedAt).toBe(published.body.updatedAt)

    const versions = await call('GET', '/api/v1/materials/brand-button-2026/versions', {
      token: admin,
    })
    expect(versions.status).toBe(200)
    expect(versions.body.items).toHaveLength(1)
    expect(versions.body.items[0].version).toBe('1.0.0')

    const denied = await call('GET', '/api/v1/materials/brand-button-2026/versions', {
      token: designer,
    })
    expect(denied.status).toBe(403)
  })

  it('下架后从清单移除；同版本不可重复发布', async () => {
    const off = await call('POST', '/api/v1/materials/brand-button-2026/unpublish', {
      token: admin,
      headers: { 'if-match': '"material:brand-button-2026:7"' },
    })
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    expect(off.body.status).toBe('unpublished')

    const manifest = await call('GET', '/api/v1/materials/manifest')
    expect(manifest.body.manifest.materials).toEqual([])

    await call('POST', '/api/v1/materials/brand-button-2026/submit', { token: admin })
    await call('POST', '/api/v1/materials/brand-button-2026/review', {
      body: { decision: 'approve' },
      token: admin,
    })
    const again = await call('POST', '/api/v1/materials/brand-button-2026/publish', {
      token: admin,
    })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('MARKET_VERSION_EXISTS')
  })
})

/* ------------------------------------------------------------------ */
/* 4. 乐观锁                                                           */
/* ------------------------------------------------------------------ */

describe('物料市场 · 乐观锁', () => {
  it('If-Match 格式错 400，过期 409，正确版本可写', async () => {
    const created = await createDraft(
      materialBody({ id: 'conflict-item', name: '冲突物料', kind: 'meta', component: undefined }),
    )
    expect(created.id).toBe('conflict-item')

    const badFormat = await call('PUT', '/api/v1/materials/conflict-item', {
      body: { ...materialBody({ id: 'conflict-item', kind: 'meta', component: undefined }) },
      token: admin,
      headers: { 'if-match': 'not-an-etag' },
    })
    expect(badFormat.status).toBe(400)
    expect(badFormat.body.code).toBe('INVALID_IF_MATCH')

    const stale = await call('PUT', '/api/v1/materials/conflict-item', {
      body: materialBody({ id: 'conflict-item', kind: 'meta', component: undefined, name: '冲突物料 2' }),
      token: admin,
      headers: { 'if-match': '"material:conflict-item:9"' },
    })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('VERSION_CONFLICT')
    expect(stale.body.expectedRevision).toBe(9)
    expect(stale.body.currentRevision).toBe(1)

    const ok = await call('PUT', '/api/v1/materials/conflict-item', {
      body: materialBody({ id: 'conflict-item', kind: 'meta', component: undefined, name: '冲突物料 2' }),
      token: admin,
      headers: { 'if-match': '"material:conflict-item:1"' },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.revision).toBe(2)
    expect(ok.headers.etag).toBe('"material:conflict-item:2"')
  })
})

/* ------------------------------------------------------------------ */
/* 5. 租户安装                                                         */
/* ------------------------------------------------------------------ */

describe('物料市场 · 租户级安装', () => {
  beforeAll(async () => {
    await publish(
      materialBody({
        id: 'tenant-widget',
        name: '租户物料',
        description: '用于安装测试',
        kind: 'meta',
        component: undefined,
      }),
    )
  })

  it('只能安装已发布版本；版本不一致拒绝', async () => {
    const draft = await createDraft(
      materialBody({ id: 'not-live', name: '未发布物料', kind: 'meta', component: undefined }),
    )
    expect(draft.status).toBe('draft')

    const notPublished = await call('PUT', '/api/v1/materials/installs/not-live', {
      body: { version: '1.0.0' },
      token: designer,
    })
    expect(notPublished.status).toBe(409)
    expect(notPublished.body.code).toBe('MARKET_NOT_PUBLISHED')

    const mismatch = await call('PUT', '/api/v1/materials/installs/tenant-widget', {
      body: { version: '2.0.0' },
      token: designer,
    })
    expect(mismatch.status).toBe(409)
    expect(mismatch.body.code).toBe('MARKET_VERSION_MISMATCH')

    const missing = await call('PUT', '/api/v1/materials/installs/no-such-material', {
      body: { version: '1.0.0' },
      token: designer,
    })
    expect(missing.status).toBe(404)
  })

  it('安装幂等、租户隔离、ETag 正确', async () => {
    const installed = await call('PUT', '/api/v1/materials/installs/tenant-widget', {
      body: { version: '1.0.0' },
      token: designer,
    })
    expect(installed.status, JSON.stringify(installed.body)).toBe(200)
    expect(installed.body.tenantId).toBe('default')
    expect(installed.body.installedBy).toBe('designer')
    expect(installed.body.revision).toBe(1)
    expect(installed.headers.etag).toBe('"material-install:default/tenant-widget:1"')

    const again = await call('PUT', '/api/v1/materials/installs/tenant-widget', {
      body: { version: '1.0.0' },
      token: designer,
    })
    expect(again.status).toBe(200)
    expect(again.body.revision).toBe(1)

    const tenantA = await call('PUT', '/api/v1/materials/installs/tenant-widget', {
      body: { version: '1.0.0' },
      token: designer,
      headers: { 'x-lc-tenant': 'tenant-a' },
    })
    expect(tenantA.status).toBe(200)
    expect(tenantA.body.tenantId).toBe('tenant-a')

    const listDefault = await call('GET', '/api/v1/materials/installs', { token: designer })
    expect(listDefault.body.items.map((item: any) => item.tenantId)).toEqual(['default'])

    const listA = await call('GET', '/api/v1/materials/installs', {
      token: designer,
      headers: { 'x-lc-tenant': 'tenant-a' },
    })
    expect(listA.body.items.map((item: any) => item.tenantId)).toEqual(['tenant-a'])

    const invalidTenant = await call('GET', '/api/v1/materials/installs', {
      token: designer,
      headers: { 'x-lc-tenant': 'Bad Tenant!' },
    })
    expect(invalidTenant.status).toBe(400)
    expect(invalidTenant.body.code).toBe('TENANT_INVALID')

    const unauthorized = await call('GET', '/api/v1/materials/installs')
    expect(unauthorized.status).toBe(401)
  })

  it('未安装携带 If-Match → 409；过期 If-Match 卸载 → 409；正确版本卸载成功', async () => {
    const never = await call('PUT', '/api/v1/materials/installs/tenant-widget', {
      body: { version: '1.0.0' },
      token: designer,
      headers: {
        'x-lc-tenant': 'tenant-b',
        'if-match': '"material-install:tenant-b/tenant-widget:1"',
      },
    })
    expect(never.status).toBe(409)
    expect(never.body.code).toBe('VERSION_CONFLICT')

    const stale = await call('DELETE', '/api/v1/materials/installs/tenant-widget', {
      token: designer,
      headers: { 'if-match': '"material-install:default/tenant-widget:9"' },
    })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('VERSION_CONFLICT')

    const removed = await call('DELETE', '/api/v1/materials/installs/tenant-widget', {
      token: designer,
      headers: { 'if-match': '"material-install:default/tenant-widget:1"' },
    })
    expect(removed.status).toBe(200)
    expect(removed.body.removed).toBe(true)

    const again = await call('DELETE', '/api/v1/materials/installs/tenant-widget', {
      token: designer,
    })
    expect(again.status).toBe(404)
    expect(again.body.code).toBe('MARKET_INSTALL_NOT_FOUND')
  })

  it('安装请求校验未知字段/非法版本', async () => {
    const bad = await call('PUT', '/api/v1/materials/installs/tenant-widget', {
      body: { version: '1', extra: true },
      token: designer,
    })
    expect(bad.status).toBe(400)
    expect(bad.body.errors.map((item: any) => item.path).sort()).toEqual(['extra', 'version'])
  })
})
