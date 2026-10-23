/**
 * 远程物料市场：验签、allowlist、缓存、安装状态与受控组件白名单。
 * 仅使用 WebCrypto + 内存 Storage，不访问网络。
 */
import { describe, expect, it } from 'vitest'
import {
  RemoteMaterialRegistry,
  canonicalJson,
  type RemoteMaterialManifest,
  type SignedManifestEnvelope,
  type StorageLike,
} from '@lc/materials'

function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function pem(bytes: ArrayBuffer): string {
  const lines = b64(new Uint8Array(bytes)).match(/.{1,64}/g) ?? []
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

async function signed(manifest: RemoteMaterialManifest, tamper = false) {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const data = new TextEncoder().encode(canonicalJson(manifest))
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, data)
  const envelope: SignedManifestEnvelope = {
    alg: 'ES256',
    signature: b64(new Uint8Array(tamper ? signature.slice(0, -1) : signature)),
    manifest,
  }
  const publicKey = pem(await crypto.subtle.exportKey('spki', pair.publicKey))
  return { envelope, publicKey }
}

const meta = {
  name: 'LcRemoteHello',
  title: '远程卡片',
  version: '1.0.0',
  category: 'basic' as const,
  defaultProps: {},
  settings: [],
}

function manifest(material: RemoteMaterialManifest['materials'][number]): RemoteMaterialManifest {
  return {
    schemaVersion: 1,
    name: '官方物料市场',
    generatedAt: '2026-10-23T00:00:00.000Z',
    materials: [material],
  }
}

const metaEntry = {
  id: 'remote-hello',
  name: '远程卡片',
  version: '1.0.0',
  kind: 'meta' as const,
  meta,
}

const trustedComponentEntry = {
  id: 'remote-button',
  name: '品牌按钮',
  version: '1.0.1',
  kind: 'component' as const,
  component: 'Button',
  meta: { ...meta, name: 'LcRemoteButton' },
}

const untrustedComponentEntry = {
  ...trustedComponentEntry,
  id: 'remote-evil',
  component: 'remote-eval-js',
}

function registry(fetchImpl: typeof fetch) {
  return new RemoteMaterialRegistry({
    allowlist: ['https://market.example.com'],
    storage: memoryStorage(),
    fetchImpl,
  })
}

describe('远程物料市场', () => {
  it('验签通过后缓存；只安装元数据/受控组件', async () => {
    const { envelope, publicKey } = await signed(
      manifest(metaEntry),
    )
    const registryUnderTest = registry(
      (async () => new Response(JSON.stringify(envelope), { status: 200 })) as typeof fetch,
    )
    expect(await registryUnderTest.refresh('https://market.example.com/manifest.json', publicKey)).toBeTruthy()
    expect(registryUnderTest.list()).toHaveLength(1)
    expect(registryUnderTest.installed()).toHaveLength(0)

    const install = registryUnderTest.install('remote-hello')
    expect(install.version).toBe('1.0.0')
    expect(registryUnderTest.installed()).toHaveLength(1)
    expect(registryUnderTest.resolveMeta('remote-hello')?.title).toBe('远程卡片')
    expect(registryUnderTest.resolveMeta('missing')).toBeNull()

    registryUnderTest.uninstall('remote-hello')
    expect(registryUnderTest.installed()).toHaveLength(0)
    expect(registryUnderTest.resolveMeta('remote-hello')).toBeNull()
  })

  it('受控组件必须命中宿主白名单；未知组件整份清单拒绝', async () => {
    const trusted = await signed(manifest(trustedComponentEntry))
    const okRegistry = registry(
      (async () => new Response(JSON.stringify(trusted.envelope), { status: 200 })) as typeof fetch,
    )
    await okRegistry.refresh('https://market.example.com/manifest.json', trusted.publicKey)
    expect(okRegistry.install('remote-button').version).toBe('1.0.1')

    const untrusted = await signed(manifest(untrustedComponentEntry))
    const badRegistry = registry(
      (async () => new Response(JSON.stringify(untrusted.envelope), { status: 200 })) as typeof fetch,
    )
    await expect(
      badRegistry.refresh('https://market.example.com/manifest.json', untrusted.publicKey),
    ).rejects.toThrow('component 不在宿主白名单')
  })

  it('拒绝未授权 origin、非 https（localhost 除外）与错误签名', async () => {
    const { envelope, publicKey } = await signed(manifest(metaEntry))
    const fakeFetch = (async () => new Response(JSON.stringify(envelope), { status: 200 })) as typeof fetch
    const r = registry(fakeFetch)
    await expect(r.refresh('https://evil.example.com/manifest.json', publicKey)).rejects.toThrow('allowlist')
    await expect(r.refresh('http://market.example.com/manifest.json', publicKey)).rejects.toThrow('https')
    await expect(r.refresh('https://user:pass@market.example.com/manifest.json', publicKey)).rejects.toThrow(
      '账号密码',
    )

    const tampered = await signed(manifest(metaEntry), true)
    const bad = registry(
      (async () => new Response(JSON.stringify(tampered.envelope), { status: 200 })) as typeof fetch,
    )
    await expect(
      bad.refresh('https://market.example.com/manifest.json', tampered.publicKey),
    ).rejects.toThrow('签名无效')
  })

  it('清单 schema 校验：重复 id / 非法版本 / 缺失 meta 都拒绝', async () => {
    const { validateManifest } = await import('@lc/materials')
    expect(() =>
      validateManifest({
        schemaVersion: 1,
        name: 'x',
        generatedAt: '2026-10-23T00:00:00.000Z',
        materials: [metaEntry, metaEntry],
      }),
    ).toThrow('id 重复')
    expect(() =>
      validateManifest({
        schemaVersion: 1,
        name: 'x',
        generatedAt: 'not-a-date',
        materials: [],
      }),
    ).toThrow('generatedAt')
    expect(() =>
      validateManifest(manifest({ ...metaEntry, version: 'latest' })),
    ).toThrow('semver')
    expect(() =>
      validateManifest(manifest({ ...metaEntry, meta: {} as never })),
    ).toThrow('meta.name')
  })

  it('缓存损坏自动清理；安装版本与清单不一致时不返回元数据', async () => {
    const { envelope, publicKey } = await signed(manifest(metaEntry))
    const storage = memoryStorage()
    const r = new RemoteMaterialRegistry({
      allowlist: ['https://market.example.com'],
      storage,
      fetchImpl: (async () => new Response(JSON.stringify(envelope), { status: 200 })) as typeof fetch,
    })
    await r.refresh('https://market.example.com/manifest.json', publicKey)
    storage.setItem('lc.remote-materials.cache.v1', '{bad json')
    expect(r.list()).toEqual([])
    expect(storage.getItem('lc.remote-materials.cache.v1')).toBeNull()

    await r.refresh('https://market.example.com/manifest.json', publicKey)
    r.install('remote-hello')
    const installed = JSON.parse(storage.getItem('lc.remote-materials.installed.v1')!)
    installed[0].version = '9.9.9'
    storage.setItem('lc.remote-materials.installed.v1', JSON.stringify(installed))
    expect(r.resolveMeta('remote-hello')).toBeNull()
  })
})
