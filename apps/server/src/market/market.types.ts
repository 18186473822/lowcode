/**
 * 服务端物料市场：存储模型、输入校验与清单类型（Phase 4 开放集成第三批）。
 *
 * 设计要点：
 * - **清单托管**：服务端保存物料草稿/发布快照，`GET /materials/manifest` 输出与
 *   `@lc/materials` 客户端完全一致的 ES256 签名信封（`canonicalJson(manifest)` 原文）；
 * - **发布审核**：`draft → pending → approved/rejected → published → unpublished`
 *   单向状态机，所有写操作带 `revision` 乐观锁；发布时固化不可变版本快照；
 * - **租户级安装状态**：安装记录以 `(tenantId, materialId)` 为主键，租户来自网关注入的
 *   `X-LC-Tenant`（缺省 `default`），服务端只校验格式，成员关系由网关/身份提供方保证；
 * - **不托管远程 JS**：清单只描述元数据与宿主内置组件预设，客户端依旧不下载/执行代码。
 *
 * JSON / MySQL 仓储只实现本文件契约；服务层不感知存储差异。
 */
import { BadRequestException } from '@nestjs/common'
import { BUILTIN_COMPONENT_IDS, type MaterialSchema } from '@lc/schema'

export const MATERIAL_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'published',
  'unpublished',
] as const
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number]

export const MATERIAL_KINDS = ['meta', 'component'] as const
export type MaterialKind = (typeof MATERIAL_KINDS)[number]

export const MATERIAL_CATEGORIES = ['basic', 'layout', 'form', 'data', 'nav', 'feedback', 'biz'] as const
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]

export const MARKET_SCHEMA_VERSION = 1
export const MARKET_DEFAULT_NAME = '低代码物料市场'
export const MATERIAL_ID_RE = /^[a-z][a-z0-9-]{2,63}$/
export const MATERIAL_VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
export const MARKET_TENANT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
export const MARKET_DEFAULT_TENANT = 'default'
export const MARKET_MAX_NAME = 64
export const MARKET_MAX_DESCRIPTION = 500
export const MARKET_MAX_NOTE = 500
export const MARKET_MAX_META_BYTES = 64 * 1024

/** 物料条目（清单内的形状，也是安装/版本快照的最小单元）。 */
export interface MarketMaterialEntry {
  id: string
  name: string
  version: string
  description?: string
  category: MaterialCategory
  kind: MaterialKind
  component?: string
  meta: MaterialSchema
}

/** 市场物料（服务端管理视图）。 */
export interface MarketMaterial extends MarketMaterialEntry {
  status: MaterialStatus
  /** 乐观锁版本：每次写操作 +1 */
  revision: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewDecision?: 'approved' | 'rejected'
  reviewNote?: string
  publishedAt?: string
  publishedBy?: string
  /** 最近一次发布的版本号（unpublish 后仍保留，便于审计） */
  publishedVersion?: string
}

/** 发布时固化的不可变版本快照。 */
export interface MarketMaterialVersion {
  materialId: string
  version: string
  entry: MarketMaterialEntry
  note?: string
  publishedBy: string
  publishedAt: string
}

/** 租户级安装状态。 */
export interface MarketInstall {
  tenantId: string
  materialId: string
  version: string
  installedBy: string
  installedAt: string
  updatedAt: string
  revision: number
}

/** 清单信封（与 `@lc/materials` 的 `SignedManifestEnvelope` 同形）。 */
export interface MarketManifest {
  schemaVersion: typeof MARKET_SCHEMA_VERSION
  name: string
  generatedAt: string
  materials: MarketMaterialEntry[]
}

export interface SignedMarketManifest {
  alg: 'ES256'
  signature: string
  manifest: MarketManifest
}

export interface MarketManifestResult {
  body: SignedMarketManifest
  etag: string
}

export interface MarketManifestKey {
  alg: 'ES256'
  publicKey: string
  fingerprint: string
  kid: string
}

export type MarketPublishResult = 'ok' | 'conflict' | 'version-exists'

/**
 * 物料市场仓储契约。
 *
 * - `update` / `submit` / `review` / `unpublish` 等状态更新都走 `update`（CAS，失败返回 false）；
 * - `publish` 必须在同一事务/文件锁内完成「revision CAS + 版本快照去重 + 状态更新」；
 * - 安装记录以 `(tenantId, materialId)` 唯一，`create` 遇到已存在返回 false，
 *   `update` / `remove` 按 `revision` CAS。
 */
export interface MarketRepository {
  listMaterials(): Promise<MarketMaterial[]>
  findMaterial(id: string): Promise<MarketMaterial | null>
  createMaterial(material: MarketMaterial): Promise<boolean>
  updateMaterial(material: MarketMaterial, expectedRevision: number): Promise<boolean>
  publishMaterial(
    material: MarketMaterial,
    version: MarketMaterialVersion,
    expectedRevision: number,
  ): Promise<MarketPublishResult>
  listVersions(materialId: string): Promise<MarketMaterialVersion[]>
  findVersion(materialId: string, version: string): Promise<MarketMaterialVersion | null>

  listInstalls(tenantId: string): Promise<MarketInstall[]>
  findInstall(tenantId: string, materialId: string): Promise<MarketInstall | null>
  createInstall(install: MarketInstall): Promise<boolean>
  updateInstall(install: MarketInstall, expectedRevision: number): Promise<boolean>
  removeInstall(tenantId: string, materialId: string, expectedRevision: number): Promise<boolean>
}

/** DI token：物料市场仓储。 */
export const MARKET_REPOSITORY = 'LC:MARKET_REPOSITORY'

export interface MarketIssue {
  code: string
  path: string
  message: string
}

export interface MaterialInput {
  id: string
  name: string
  description?: string
  version: string
  category: MaterialCategory
  kind: MaterialKind
  component?: string
  meta: MaterialSchema
}

export interface ReviewInput {
  decision: 'approved' | 'rejected'
  note?: string
}

export interface InstallInput {
  version: string
}

function invalid(issues: MarketIssue[]): never {
  throw new BadRequestException({
    code: 'MARKET_MATERIAL_INVALID',
    message: '物料配置校验未通过',
    errors: issues,
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCategory(value: unknown): value is MaterialCategory {
  return typeof value === 'string' && (MATERIAL_CATEGORIES as readonly string[]).includes(value)
}

/** 校验并归一化创建/更新物料的请求体；未知字段直接拒绝，避免拼写错误被静默忽略。 */
export function parseMaterialInput(raw: unknown, expectedId?: string): MaterialInput {
  const issues: MarketIssue[] = []
  if (!isPlainObject(raw)) {
    invalid([{ code: 'E_BODY', path: '', message: '请求体必须是对象' }])
  }

  const allowed = new Set(['id', 'name', 'description', 'version', 'category', 'kind', 'component', 'meta'])
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      issues.push({ code: 'E_UNKNOWN_FIELD', path: key, message: `未知字段：${key}` })
    }
  }

  let id = expectedId
  if (expectedId === undefined) {
    id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!MATERIAL_ID_RE.test(id)) {
      issues.push({
        code: 'E_ID',
        path: 'id',
        message: 'id 必须小写字母开头、3~64 位，仅 a-z0-9-',
      })
    }
  } else if (raw.id !== undefined && raw.id !== expectedId) {
    issues.push({ code: 'E_ID', path: 'id', message: 'body.id 必须与路径 materialId 一致' })
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name || name.length > MARKET_MAX_NAME) {
    issues.push({ code: 'E_NAME', path: 'name', message: `name 必填且不超过 ${MARKET_MAX_NAME} 字符` })
  }

  let description: string | undefined
  if (raw.description !== undefined) {
    if (typeof raw.description !== 'string' || raw.description.length > MARKET_MAX_DESCRIPTION) {
      issues.push({
        code: 'E_DESCRIPTION',
        path: 'description',
        message: `description 必须是不超过 ${MARKET_MAX_DESCRIPTION} 字符的字符串`,
      })
    } else {
      description = raw.description.trim() || undefined
    }
  }

  const version = typeof raw.version === 'string' ? raw.version.trim() : ''
  if (!MATERIAL_VERSION_RE.test(version)) {
    issues.push({ code: 'E_VERSION', path: 'version', message: 'version 必须是 semver（如 1.0.0）' })
  }

  const kind = raw.kind
  if (kind !== 'meta' && kind !== 'component') {
    issues.push({ code: 'E_KIND', path: 'kind', message: 'kind 必须是 meta 或 component' })
  }

  let meta: MaterialSchema | undefined
  if (!isPlainObject(raw.meta)) {
    issues.push({ code: 'E_META', path: 'meta', message: 'meta 必须是对象' })
  } else {
    const candidate = raw.meta
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
      issues.push({ code: 'E_META_NAME', path: 'meta.name', message: 'meta.name 必填' })
    } else if (candidate.name.length > 128) {
      issues.push({ code: 'E_META_NAME', path: 'meta.name', message: 'meta.name 不超过 128 字符' })
    }
    if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
      issues.push({ code: 'E_META_TITLE', path: 'meta.title', message: 'meta.title 必填' })
    }
    if (typeof candidate.version !== 'string' || !candidate.version.trim()) {
      issues.push({ code: 'E_META_VERSION', path: 'meta.version', message: 'meta.version 必填' })
    }
    if (!isCategory(candidate.category)) {
      issues.push({ code: 'E_META_CATEGORY', path: 'meta.category', message: 'meta.category 非法' })
    }
    if (!isPlainObject(candidate.defaultProps)) {
      issues.push({
        code: 'E_META_PROPS',
        path: 'meta.defaultProps',
        message: 'meta.defaultProps 必须是对象',
      })
    }
    if (!Array.isArray(candidate.settings)) {
      issues.push({ code: 'E_META_SETTINGS', path: 'meta.settings', message: 'meta.settings 必须是数组' })
    }
    meta = candidate as unknown as MaterialSchema
  }

  let category: MaterialCategory | undefined
  if (raw.category !== undefined) {
    if (!isCategory(raw.category)) {
      issues.push({ code: 'E_CATEGORY', path: 'category', message: 'category 非法' })
    } else {
      category = raw.category
    }
  } else if (meta && isCategory((meta as { category?: unknown }).category)) {
    category = (meta as { category: MaterialCategory }).category
  }

  let component: string | undefined
  if (kind === 'component') {
    if (typeof raw.component !== 'string' || !raw.component.trim()) {
      issues.push({ code: 'E_COMPONENT', path: 'component', message: 'kind=component 时 component 必填' })
    } else if (!BUILTIN_COMPONENT_IDS.has(raw.component)) {
      issues.push({
        code: 'E_COMPONENT',
        path: 'component',
        message: `component 不在宿主内置白名单：${raw.component}`,
      })
    } else {
      component = raw.component
    }
  } else if (kind === 'meta' && raw.component !== undefined) {
    issues.push({ code: 'E_COMPONENT', path: 'component', message: 'kind=meta 时不允许 component' })
  }

  if (meta) {
    const bytes = Buffer.byteLength(JSON.stringify(meta), 'utf8')
    if (bytes > MARKET_MAX_META_BYTES) {
      issues.push({
        code: 'E_META_SIZE',
        path: 'meta',
        message: `meta 序列化后不得超过 ${MARKET_MAX_META_BYTES} 字节`,
      })
    }
  }

  if (issues.length > 0 || !meta || !category || !id || (kind !== 'meta' && kind !== 'component')) {
    invalid(issues.length > 0 ? issues : [{ code: 'E_BODY', path: '', message: '请求体不完整' }])
  }

  return { id, name, description, version, category, kind, component, meta }
}

/** 校验审核请求；驳回必须写明原因，便于发布人修改。 */
export function parseReviewInput(raw: unknown): ReviewInput {
  const issues: MarketIssue[] = []
  if (!isPlainObject(raw)) invalid([{ code: 'E_BODY', path: '', message: '请求体必须是对象' }])

  for (const key of Object.keys(raw)) {
    if (key !== 'decision' && key !== 'note') {
      issues.push({ code: 'E_UNKNOWN_FIELD', path: key, message: `未知字段：${key}` })
    }
  }

  const decision = raw.decision
  if (decision !== 'approve' && decision !== 'reject') {
    issues.push({ code: 'E_DECISION', path: 'decision', message: 'decision 必须是 approve 或 reject' })
  }

  let note: string | undefined
  if (raw.note !== undefined) {
    if (typeof raw.note !== 'string' || raw.note.length > MARKET_MAX_NOTE) {
      issues.push({
        code: 'E_NOTE',
        path: 'note',
        message: `note 必须是不超过 ${MARKET_MAX_NOTE} 字符的字符串`,
      })
    } else {
      note = raw.note.trim() || undefined
    }
  }
  if (decision === 'reject' && !note) {
    issues.push({ code: 'E_NOTE_REQUIRED', path: 'note', message: '驳回必须填写 note' })
  }

  if (issues.length > 0 || (decision !== 'approve' && decision !== 'reject')) {
    invalid(issues)
  }
  return { decision: decision === 'approve' ? 'approved' : 'rejected', note }
}

/** 校验安装请求。 */
export function parseInstallInput(raw: unknown): InstallInput {
  const issues: MarketIssue[] = []
  if (!isPlainObject(raw)) invalid([{ code: 'E_BODY', path: '', message: '请求体必须是对象' }])
  for (const key of Object.keys(raw)) {
    if (key !== 'version') {
      issues.push({ code: 'E_UNKNOWN_FIELD', path: key, message: `未知字段：${key}` })
    }
  }
  const version = typeof raw.version === 'string' ? raw.version.trim() : ''
  if (!MATERIAL_VERSION_RE.test(version)) {
    issues.push({ code: 'E_VERSION', path: 'version', message: 'version 必须是 semver' })
  }
  if (issues.length > 0) invalid(issues)
  return { version }
}

/** 解析租户标识；缺省为 `default`，仅供网关注入可信值。 */
export function parseTenantId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === undefined || value.trim() === '') return MARKET_DEFAULT_TENANT
  const tenant = value.trim()
  if (!MARKET_TENANT_RE.test(tenant)) {
    throw new BadRequestException({
      code: 'TENANT_INVALID',
      message: 'X-LC-Tenant 必须是 1~64 位小写字母/数字/连字符，且以字母或数字开头',
    })
  }
  return tenant
}

/** 物料条目视图：去掉服务端管理字段，undefined 不进入 JSON。 */
export function toManifestEntry(material: MarketMaterial): MarketMaterialEntry {
  return {
    id: material.id,
    name: material.name,
    version: material.version,
    ...(material.description ? { description: material.description } : {}),
    category: material.category,
    kind: material.kind,
    ...(material.component ? { component: material.component } : {}),
    meta: material.meta,
  }
}

/** 可编辑/可重新提交的状态。 */
export function isEditable(status: MaterialStatus): boolean {
  return status === 'draft' || status === 'rejected' || status === 'unpublished'
}
