/**
 * 物料市场单元测试：输入校验、签名、文件仓储 CAS。
 *
 * 端到端状态机/权限/租户隔离见 `market.test.ts`；本文件保证纯函数与
 * JSON 仓储的边界分支也进入覆盖率统计。
 */
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, verify, createPublicKey } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FileMarketRepository } from '../src/market/file-market.repository.js'
import {
  parseInstallInput,
  parseMaterialInput,
  parseReviewInput,
  parseTenantId,
  type MarketInstall,
  type MarketMaterial,
  type MarketMaterialVersion,
} from '../src/market/market.types.js'
import {
  canonicalJson,
  loadMarketSigner,
  manifestEtag,
  manifestKey,
  signManifest,
} from '../src/market/market.signing.js'

const META = {
  name: 'BrandButton',
  title: '品牌按钮',
  version: '1.0.0',
  category: 'basic',
  defaultProps: { text: '提交' },
  settings: [],
} as const

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'brand-button-2026',
    name: '品牌按钮',
    version: '1.0.0',
    category: 'basic',
    kind: 'component',
    component: 'Button',
    meta: { ...META },
    ...overrides,
  }
}

function material(overrides: Partial<MarketMaterial> = {}): MarketMaterial {
  return {
    id: 'm1',
    name: '物料',
    version: '1.0.0',
    category: 'basic',
    kind: 'meta',
    meta: { ...META } as any,
    status: 'draft',
    revision: 1,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    ...overrides,
  }
}

function version(overrides: Partial<MarketMaterialVersion> = {}): MarketMaterialVersion {
  return {
    materialId: 'm1',
    version: '1.0.0',
    entry: { id: 'm1', name: '物料', version: '1.0.0', category: 'basic', kind: 'meta', meta: META as any },
    publishedBy: 'admin',
    publishedAt: '2026-10-27T00:00:00.000Z',
    ...overrides,
  }
}

function install(overrides: Partial<MarketInstall> = {}): MarketInstall {
  return {
    tenantId: 'default',
    materialId: 'm1',
    version: '1.0.0',
    installedBy: 'designer',
    installedAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/* 校验                                                               */
/* ------------------------------------------------------------------ */

describe('物料市场 · 输入校验', () => {
  it('合法请求归一化：category 从 meta 回退、description 空白转 undefined', () => {
    const parsed = parseMaterialInput(
      body({ category: undefined, description: '   ', component: 'Button' }),
    )
    expect(parsed.id).toBe('brand-button-2026')
    expect(parsed.category).toBe('basic')
    expect(parsed.description).toBeUndefined()
    expect(parsed.kind).toBe('component')
    expect(parsed.component).toBe('Button')
    expect(parsed.meta.name).toBe('BrandButton')
  })

  it('meta 物料不允许 component；更新时 body.id 必须与路径一致', () => {
    expect(() => parseMaterialInput(body({ kind: 'meta', component: 'Button' }))).toThrow()
    expect(() => parseMaterialInput(body({ id: 'other' }), 'brand-button-2026')).toThrow()
    const ok = parseMaterialInput(
      { ...body({ kind: 'meta', component: undefined }), name: ' 纯元数据 ' },
      'brand-button-2026',
    )
    expect(ok.id).toBe('brand-button-2026')
    expect(ok.name).toBe('纯元数据')
  })

  it('错误聚合：未知字段、id、长度、meta 子字段、组件白名单、meta 体积', () => {
    const cases: Array<[unknown, string]> = [
      [[], 'E_BODY'],
      [body({ extra: 1 }), 'E_UNKNOWN_FIELD'],
      [body({ id: 'A' }), 'E_ID'],
      [body({ id: 'ab' }), 'E_ID'],
      [body({ name: 'x'.repeat(65) }), 'E_NAME'],
      [body({ description: 'x'.repeat(501) }), 'E_DESCRIPTION'],
      [body({ version: 'v1' }), 'E_VERSION'],
      [body({ kind: 'js' }), 'E_KIND'],
      [body({ meta: null }), 'E_META'],
      [body({ meta: { ...META, name: '' } }), 'E_META_NAME'],
      [body({ meta: { ...META, name: 'x'.repeat(129) } }), 'E_META_NAME'],
      [body({ meta: { ...META, title: ' ' } }), 'E_META_TITLE'],
      [body({ meta: { ...META, version: '' } }), 'E_META_VERSION'],
      [body({ meta: { ...META, category: 'nope' } }), 'E_META_CATEGORY'],
      [body({ meta: { ...META, defaultProps: [] } }), 'E_META_PROPS'],
      [body({ meta: { ...META, settings: {} } }), 'E_META_SETTINGS'],
      [body({ meta: { ...META, category: 'nope' }, category: 'nope' }), 'E_CATEGORY'],
      [body({ component: '' }), 'E_COMPONENT'],
      [body({ component: 'EvalScript' }), 'E_COMPONENT'],
      [body({ meta: { ...META, defaultProps: { text: 'x'.repeat(70_000) } } }), 'E_META_SIZE'],
    ]
    for (const [input, code] of cases) {
      try {
        parseMaterialInput(input)
        throw new Error(`应校验失败：${String(code)}`)
      } catch (error: any) {
        const response = error.getResponse?.() ?? error
        if (typeof response === 'string') expect(response).toContain(code)
        else expect(response.errors.map((item: any) => item.code), code).toContain(code)
      }
    }
  })

  it('审核：approve 可不填理由，reject 必须填；未知字段拒绝', () => {
    expect(parseReviewInput({ decision: 'approve' })).toEqual({ decision: 'approved', note: undefined })
    expect(parseReviewInput({ decision: 'reject', note: '补充说明' })).toEqual({
      decision: 'rejected',
      note: '补充说明',
    })
    expect(parseReviewInput({ decision: 'approve', note: '   ' }).note).toBeUndefined()
    for (const input of [
      null,
      { decision: 'ok' },
      { decision: 'reject' },
      { decision: 'approve', extra: 1 },
      { decision: 'approve', note: 'x'.repeat(501) },
    ]) {
      expect(() => parseReviewInput(input)).toThrow()
    }
  })

  it('安装与租户：未知字段/非法版本拒绝；租户缺省 default、数组取首值', () => {
    expect(parseInstallInput({ version: '1.2.3' })).toEqual({ version: '1.2.3' })
    for (const input of [null, { version: '1.2' }, { version: '1.0.0', extra: true }]) {
      expect(() => parseInstallInput(input)).toThrow()
    }
    expect(parseTenantId(undefined)).toBe('default')
    expect(parseTenantId('  ')).toBe('default')
    expect(parseTenantId(['tenant-a', 'ignored'])).toBe('tenant-a')
    expect(parseTenantId('tenant-01')).toBe('tenant-01')
    for (const bad of ['-abc', 'A BC', 'x'.repeat(65)]) {
      expect(() => parseTenantId(bad)).toThrow()
    }
  })
})

/* ------------------------------------------------------------------ */
/* 签名                                                               */
/* ------------------------------------------------------------------ */

describe('物料市场 · 清单签名', () => {
  it('canonicalJson 递归排序、数组保序、忽略 undefined，与客户端一致', () => {
    expect(canonicalJson({ b: 1, a: { d: [true, null, 'x'], c: undefined } })).toBe(
      '{"a":{"d":[true,null,"x"]},"b":1}',
    )
    expect(canonicalJson([])).toBe('[]')
    expect(canonicalJson('str')).toBe('"str"')
    expect(canonicalJson(null)).toBe('null')
    const etag1 = manifestEtag('{"a":1}')
    expect(etag1).toBe(manifestEtag('{"a":1}'))
    expect(etag1).toMatch(/^"market-manifest:[0-9a-f]{16}"$/)
  })

  it('PKCS#8 私钥可用 \\n 转义传入，签名可由导出的公钥按 P1363 验证', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const signer = loadMarketSigner({
      LC_MATERIAL_MARKET_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
      LC_MATERIAL_MARKET_KID: 'kid-1',
    })
    expect(signer.enabled).toBe(true)
    expect(signer.ephemeral).toBe(false)
    expect(signer.kid).toBe('kid-1')
    expect(signer.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/)

    const manifest = {
      schemaVersion: 1 as const,
      name: '测试市场',
      generatedAt: '2026-10-27T00:00:00.000Z',
      materials: [],
    }
    const envelope = signManifest(manifest, signer)
    expect(envelope.alg).toBe('ES256')
    expect(envelope.signature.length).toBeGreaterThan(0)
    expect(
      verify(
        'sha256',
        Buffer.from(canonicalJson(manifest), 'utf8'),
        { key: createPublicKey(signer.publicKey!), dsaEncoding: 'ieee-p1363' },
        Buffer.from(envelope.signature, 'base64'),
      ),
    ).toBe(true)

    const key = manifestKey(signer)
    expect(key.fingerprint).toBe(signer.fingerprint)
    expect(key.publicKey).toContain('BEGIN PUBLIC KEY')
  })

  it('生产未配置私钥 fail-closed；非法曲线/非 EC 私钥启动即失败', () => {
    const disabled = loadMarketSigner({ NODE_ENV: 'production' })
    expect(disabled.enabled).toBe(false)
    expect(disabled.reason).toContain('LC_MATERIAL_MARKET_PRIVATE_KEY')
    expect(() =>
      signManifest(
        { schemaVersion: 1, name: 'x', generatedAt: '', materials: [] },
        disabled,
      ),
    ).toThrow()
    expect(() => manifestKey(disabled)).toThrow()

    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
    expect(() =>
      loadMarketSigner({
        LC_MATERIAL_MARKET_PRIVATE_KEY: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      }),
    ).toThrow(/EC P-256/)

    const p384 = generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
    expect(() =>
      loadMarketSigner({
        LC_MATERIAL_MARKET_PRIVATE_KEY: p384.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      }),
    ).toThrow(/P-256/)
  })

  it('非生产未配置时生成临时密钥并可用', () => {
    const signer = loadMarketSigner({ NODE_ENV: 'development' })
    expect(signer.enabled).toBe(true)
    expect(signer.ephemeral).toBe(true)
    expect(signer.publicKey).toContain('BEGIN PUBLIC KEY')
  })
})

/* ------------------------------------------------------------------ */
/* JSON 仓储                                                          */
/* ------------------------------------------------------------------ */

describe('物料市场 · JSON 仓储', () => {
  it('物料创建/更新 CAS/发布版本唯一性/安装生命周期', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lc-market-repo-'))
    try {
      const repo = new FileMarketRepository(dir)
      expect(await repo.listMaterials()).toEqual([])

      const draft = material()
      expect(await repo.createMaterial(draft)).toBe(true)
      expect(await repo.createMaterial(draft)).toBe(false)
      expect((await repo.findMaterial('m1'))?.id).toBe('m1')
      expect(await repo.findMaterial('nope')).toBeNull()

      const edited = { ...draft, name: '物料 2', revision: 2 }
      expect(await repo.updateMaterial(edited, 9)).toBe(false)
      expect(await repo.updateMaterial(edited, 1)).toBe(true)

      const published = { ...edited, status: 'published' as const, revision: 3 }
      expect(await repo.publishMaterial(published, version(), 9)).toBe('conflict')
      expect(await repo.publishMaterial(published, version(), 2)).toBe('ok')
      expect(
        await repo.publishMaterial({ ...published, revision: 4 }, version(), 3),
      ).toBe('version-exists')
      expect((await repo.listVersions('m1')).map((item) => item.version)).toEqual(['1.0.0'])
      expect(await repo.findVersion('m1', '1.0.0')).not.toBeNull()
      expect(await repo.findVersion('m1', '2.0.0')).toBeNull()

      expect(await repo.listInstalls('default')).toEqual([])
      expect(await repo.findInstall('default', 'm1')).toBeNull()
      expect(await repo.createInstall(install())).toBe(true)
      expect(await repo.createInstall(install())).toBe(false)
      expect((await repo.listInstalls('default')).length).toBe(1)
      expect((await repo.listInstalls('other')).length).toBe(0)
      expect(
        await repo.updateInstall({ ...install(), version: '1.1.0', revision: 2 }, 9),
      ).toBe(false)
      expect(
        await repo.updateInstall({ ...install(), version: '1.1.0', revision: 2 }, 1),
      ).toBe(true)
      expect(await repo.removeInstall('default', 'm1', 9)).toBe(false)
      expect(await repo.removeInstall('default', 'm1', 2)).toBe(true)
      expect(await repo.findInstall('default', 'm1')).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
