/**
 * 远程物料 / 物料市场最小闭环（安全边界优先）。
 *
 * 本模块只处理 **受信元数据**：
 * - 市场清单是一个 JSON 信封 `{ alg: 'ES256', signature, manifest }`，用 ECDSA P-256 公钥验签；
 * - 清单 URL 必须命中 allowlist 的 origin（且默认只允许 https，localhost 用于开发）；
 * - 清单/安装状态只进 Web Storage 缓存，**不下载、不 eval、不动态 import 任何远程 JS**；
 * - `kind: 'component'` 的条目必须引用宿主内置、已注册的组件 id；否则标记不可安装。
 *
 * 运行时如需加载远程组件，应改为「服务端构建产物 + 固定版本 + CSP/SRI」的受控发布流程，
 * 而不是在浏览器里执行市场返回的代码。
 */
import type { MaterialSchema } from '@lc/schema'

export const REMOTE_MATERIAL_CACHE_KEY = 'lc.remote-materials.cache.v1'
export const REMOTE_MATERIAL_INSTALLED_KEY = 'lc.remote-materials.installed.v1'

/** 宿主已注册的 schema `componentName` 白名单（与 material-map / META_MAP 保持同步）。 */
export const TRUSTED_COMPONENT_IDS: ReadonlySet<string> = new Set([
  'Text',
  'Input',
  'Textarea',
  'NumberInput',
  'Radio',
  'Select',
  'Switch',
  'Upload',
  'Image',
  'Divider',
  'Button',
  'DatePicker',
  'DateTimePicker',
  'MoneyInput',
  'Checkbox',
  'Picker',
  'UserPicker',
  'DeptPicker',
  'Cascader',
  'FileUpload',
  'Rate',
  'SearchBar',
  'Detail',
  'Cell',
  'List',
  'Tabs',
  'Tag',
  'Icon',
  'Progress',
  'ApprovalBar',
  'Timeline',
  'Chart',
  'Statistic',
])

export interface RemoteMaterialEntry {
  id: string
  name: string
  version: string
  description?: string
  category?: string
  kind: 'meta' | 'component'
  /** kind=component 时必须是 TRUSTED_COMPONENT_IDS 中的内置组件 */
  component?: string
  meta: MaterialSchema
}

export interface RemoteMaterialManifest {
  schemaVersion: 1
  name: string
  generatedAt: string
  materials: RemoteMaterialEntry[]
}

export interface SignedManifestEnvelope {
  alg: 'ES256'
  /** WebCrypto ECDSA P-256 原始签名的 base64 */
  signature: string
  manifest: RemoteMaterialManifest
}

export interface RemoteMaterialCache {
  source: string
  fetchedAt: string
  manifest: RemoteMaterialManifest
}

export interface RemoteMaterialInstall {
  id: string
  version: string
  installedAt: string
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface RemoteMaterialRegistryOptions {
  /** 允许拉取清单的 origin 列表，例如 ['https://materials.example.com'] */
  allowlist: string[]
  /** 默认 localStorage；SSR/测试可注入内存实现 */
  storage?: StorageLike
  fetchImpl?: typeof fetch
  /** 拉取超时，默认 10s */
  timeoutMs?: number
  /** 清单最大字节数，默认 1MB */
  maxBytes?: number
}

const ID_RE = /^[a-z][a-z0-9-]{2,63}$/
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

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

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function pemToBytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '')
  return base64ToBytes(body)
}

/**
 * 稳定序列化（只用于清单验签）：对象键排序，数组保持原顺序。
 * 市场端签名时必须使用同一规则；真实生产建议直接签原文并保存 raw manifest。
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
  return `{${entries.join(',')}}`
}

/** 校验单个物料条目；返回错误列表（空数组 = 合法）。 */
export function validateRemoteMaterial(entry: unknown): string[] {
  const errors: string[] = []
  if (typeof entry !== 'object' || entry === null) return ['物料条目必须是对象']
  const item = entry as Partial<RemoteMaterialEntry>
  if (typeof item.id !== 'string' || !ID_RE.test(item.id)) errors.push('id 非法（小写字母开头，3~64 位）')
  if (typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.length > 64) {
    errors.push('name 必填且不超过 64 字符')
  }
  if (typeof item.version !== 'string' || !VERSION_RE.test(item.version)) errors.push('version 必须是 semver')
  if (item.kind !== 'meta' && item.kind !== 'component') errors.push('kind 必须是 meta/component')
  if (item.kind === 'component') {
    if (typeof item.component !== 'string' || !TRUSTED_COMPONENT_IDS.has(item.component)) {
      errors.push(`component 不在宿主白名单：${String(item.component)}`)
    }
  }
  if (typeof item.meta !== 'object' || item.meta === null) errors.push('meta 必须是对象')
  else {
    const meta = item.meta as Partial<MaterialSchema>
    if (typeof meta.name !== 'string' || !meta.name) errors.push('meta.name 必填')
    if (typeof meta.title !== 'string' || !meta.title) errors.push('meta.title 必填')
    if (typeof meta.version !== 'string' || !meta.version) errors.push('meta.version 必填')
    if (!['basic', 'layout', 'form', 'data', 'nav', 'feedback', 'biz'].includes(String(meta.category))) {
      errors.push('meta.category 非法')
    }
    if (typeof meta.defaultProps !== 'object' || meta.defaultProps === null) errors.push('meta.defaultProps 必须是对象')
    if (!Array.isArray(meta.settings)) errors.push('meta.settings 必须是数组')
  }
  return errors
}

export function validateManifest(value: unknown): RemoteMaterialManifest {
  if (typeof value !== 'object' || value === null) throw new Error('manifest 必须是对象')
  const manifest = value as Partial<RemoteMaterialManifest>
  if (manifest.schemaVersion !== 1) throw new Error('不支持的 manifest.schemaVersion')
  if (typeof manifest.name !== 'string' || !manifest.name) throw new Error('manifest.name 必填')
  if (typeof manifest.generatedAt !== 'string' || Number.isNaN(Date.parse(manifest.generatedAt))) {
    throw new Error('manifest.generatedAt 必须是 ISO 时间')
  }
  if (!Array.isArray(manifest.materials)) throw new Error('manifest.materials 必须是数组')
  const ids = new Set<string>()
  for (const entry of manifest.materials) {
    const errors = validateRemoteMaterial(entry)
    if (errors.length > 0) throw new Error(`物料 ${String((entry as any)?.id)} 非法：${errors.join('；')}`)
    if (ids.has(entry.id)) throw new Error(`物料 id 重复：${entry.id}`)
    ids.add(entry.id)
  }
  return manifest as RemoteMaterialManifest
}

/** 用 ECDSA P-256 公钥验证清单签名；签名原文为 canonicalJson(manifest)。 */
export async function verifyManifestSignature(
  envelope: SignedManifestEnvelope,
  publicKeyPem: string,
): Promise<boolean> {
  if (envelope.alg !== 'ES256') throw new Error('仅支持 ES256 清单签名')
  const data = new TextEncoder().encode(canonicalJson(envelope.manifest))
  const key = await crypto.subtle.importKey(
    'spki',
    pemToBytes(publicKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64ToBytes(envelope.signature),
    data,
  )
}

function assertAllowedSource(source: string, allowlist: string[]): void {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error('清单 URL 非法')
  }
  if (url.username || url.password) throw new Error('清单 URL 不允许携带账号密码')
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('清单只允许 https（localhost 开发例外）')
  }
  if (!allowlist.includes(url.origin)) {
    throw new Error(`清单 origin 不在 allowlist：${url.origin}`)
  }
}

/**
 * 远程物料注册表：拉取 → 验签 → 校验 → 缓存 → 安装/卸载。
 * 所有方法都只操作元数据，不执行远程代码。
 */
export class RemoteMaterialRegistry {
  private readonly storage: StorageLike
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxBytes: number

  constructor(private readonly options: RemoteMaterialRegistryOptions) {
    this.storage = options.storage ?? (typeof localStorage === 'undefined' ? memoryStorage() : localStorage)
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.maxBytes = options.maxBytes ?? 1024 * 1024
  }

  /** 拉取并验签市场清单，成功后原子替换缓存。 */
  async refresh(source: string, publicKeyPem: string): Promise<RemoteMaterialManifest> {
    assertAllowedSource(source, this.options.allowlist)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(source, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
      })
      if (!response.ok) throw new Error(`市场清单请求失败：HTTP ${response.status}`)
      const text = await response.text()
      if (text.length > this.maxBytes) throw new Error(`市场清单超过 ${this.maxBytes} 字节上限`)
      let envelope: SignedManifestEnvelope
      try {
        envelope = JSON.parse(text) as SignedManifestEnvelope
      } catch {
        throw new Error('市场清单不是合法 JSON')
      }
      if (!(await verifyManifestSignature(envelope, publicKeyPem))) throw new Error('市场清单签名无效')
      const manifest = validateManifest(envelope.manifest)
      const cache: RemoteMaterialCache = {
        source,
        fetchedAt: new Date().toISOString(),
        manifest,
      }
      this.storage.setItem(REMOTE_MATERIAL_CACHE_KEY, JSON.stringify(cache))
      return manifest
    } finally {
      clearTimeout(timer)
    }
  }

  /** 读取已验签缓存；缓存损坏时清空并返回 null。 */
  cache(): RemoteMaterialCache | null {
    const raw = this.storage.getItem(REMOTE_MATERIAL_CACHE_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as RemoteMaterialCache
      validateManifest(parsed.manifest)
      if (typeof parsed.source !== 'string' || typeof parsed.fetchedAt !== 'string') throw new Error('cache')
      return parsed
    } catch {
      this.storage.removeItem(REMOTE_MATERIAL_CACHE_KEY)
      return null
    }
  }

  list(): RemoteMaterialEntry[] {
    return this.cache()?.manifest.materials ?? []
  }

  installed(): RemoteMaterialInstall[] {
    const raw = this.storage.getItem(REMOTE_MATERIAL_INSTALLED_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('installed')
      return parsed.filter(
        (item): item is RemoteMaterialInstall =>
          typeof item?.id === 'string' &&
          typeof item?.version === 'string' &&
          typeof item?.installedAt === 'string',
      )
    } catch {
      this.storage.removeItem(REMOTE_MATERIAL_INSTALLED_KEY)
      return []
    }
  }

  /**
   * 安装物料。只允许安装当前验签缓存中、且通过 `validateRemoteMaterial` 的条目；
   * `component` 必须是宿主内置组件，远程代码永远不会被下载。
   */
  install(id: string): RemoteMaterialInstall {
    const entry = this.list().find((item) => item.id === id)
    if (!entry) throw new Error(`物料 ${id} 不在已验签的市场缓存中`)
    const errors = validateRemoteMaterial(entry)
    if (errors.length > 0) throw new Error(`物料 ${id} 不可安装：${errors.join('；')}`)
    const install: RemoteMaterialInstall = {
      id: entry.id,
      version: entry.version,
      installedAt: new Date().toISOString(),
    }
    const rest = this.installed().filter((item) => item.id !== id)
    this.storage.setItem(REMOTE_MATERIAL_INSTALLED_KEY, JSON.stringify([...rest, install]))
    return install
  }

  uninstall(id: string): void {
    const rest = this.installed().filter((item) => item.id !== id)
    this.storage.setItem(REMOTE_MATERIAL_INSTALLED_KEY, JSON.stringify(rest))
  }

  /** 已安装且仍受信的物料元数据；版本不匹配时视为未安装，避免静默降级。 */
  resolveMeta(id: string): MaterialSchema | null {
    const install = this.installed().find((item) => item.id === id)
    if (!install) return null
    const entry = this.list().find((item) => item.id === id)
    if (!entry || entry.version !== install.version) return null
    return validateRemoteMaterial(entry).length === 0 ? entry.meta : null
  }
}
