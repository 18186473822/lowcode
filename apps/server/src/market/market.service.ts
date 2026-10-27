/**
 * 物料市场服务（Phase 4 开放集成第三批）。
 *
 * 生命周期（单向状态机）：
 * ```
 * create → draft ──submit──→ pending ──review──→ approved ──publish──→ published
 *              ↑                  │                    │                   │
 *              └────── rejected ←──┘                    └──（不可编辑）     │
 *              ↑                                                             │
 *              └──────────────────────── unpublish ←────────────────────────┘
 * ```
 * - `draft / rejected / unpublished` 可编辑、可重新提交；编辑后状态回到 `draft`；
 * - `pending` 只读，等待审核；`approved` 只读，等待发布；
 * - 发布把当前条目固化为不可变版本快照，同一 `materialId + version` 只能发布一次；
 * - 所有写操作带 `revision` 乐观锁，`If-Match` 不匹配返回 409，不自动覆盖。
 *
 * 清单：只输出 `published` 物料，按 id 排序；`generatedAt` 取最近更新时间，
 * 因此清单内容不变时 ETag 与签名都保持稳定，可安全缓存。
 *
 * 租户安装状态：`X-LC-Tenant` 由网关注入（缺省 default），安装仅允许「当前已发布版本」，
 * 防止静默降级；版本不一致需先升级物料再安装。
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { AuthUser } from '../common/jwt.service.js'
import { makeEtag, parseIfMatch } from '../common/etag.js'
import { RbacService } from '../rbac/rbac.service.js'
import {
  MARKET_DEFAULT_NAME,
  MARKET_REPOSITORY,
  MARKET_SCHEMA_VERSION,
  MATERIAL_CATEGORIES,
  MATERIAL_STATUSES,
  isEditable,
  parseInstallInput,
  parseMaterialInput,
  parseReviewInput,
  toManifestEntry,
  type InstallInput,
  type MarketInstall,
  type MarketManifest,
  type MarketManifestKey,
  type MarketManifestResult,
  type MarketMaterial,
  type MarketMaterialEntry,
  type MarketMaterialVersion,
  type MarketRepository,
  type MaterialStatus,
  type ReviewInput,
} from './market.types.js'
import {
  canonicalJson,
  loadMarketSigner,
  manifestEtag,
  manifestKey,
  signManifest,
  type MarketSigner,
} from './market.signing.js'

export interface MarketListQuery {
  status?: unknown
  category?: unknown
  kind?: unknown
  q?: unknown
}

/** 非管理员视图：去掉审核/审计字段，避免内部备注外泄。 */
function publicView(item: MarketMaterial): MarketMaterialEntry {
  return toManifestEntry(item)
}

@Injectable()
export class MarketService {
  private readonly signer: MarketSigner

  constructor(
    @Inject(MARKET_REPOSITORY) private readonly repo: MarketRepository,
    @Inject(RbacService) private readonly rbac: RbacService,
  ) {
    this.signer = loadMarketSigner()
  }

  /* ------------------------------ 目录 ------------------------------ */

  async list(user: AuthUser, query: MarketListQuery = {}): Promise<{ items: unknown[] }> {
    const admin = await this.isAdmin(user)
    const status = this.parseStatusFilter(query.status)
    const category = this.parseCategoryFilter(query.category)
    const kind = this.parseKindFilter(query.kind)
    const keyword = this.parseKeyword(query.q)

    let items = await this.repo.listMaterials()
    if (!admin) {
      // 普通用户只能看到已发布物料；显式传 status 时按 403 处理，避免误以为能查草稿。
      if (status !== undefined) {
        throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: '仅管理员可按状态筛选物料' })
      }
      items = items.filter((item) => item.status === 'published')
    } else if (status !== undefined) {
      items = items.filter((item) => item.status === status)
    }
    if (category !== undefined) items = items.filter((item) => item.category === category)
    if (kind !== undefined) items = items.filter((item) => item.kind === kind)
    if (keyword !== undefined) {
      const needle = keyword.toLowerCase()
      items = items.filter((item) =>
        [item.id, item.name, item.description ?? ''].some((value) =>
          value.toLowerCase().includes(needle),
        ),
      )
    }

    items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    return { items: admin ? items : items.map(publicView) }
  }

  async get(user: AuthUser, id: string): Promise<unknown> {
    const admin = await this.isAdmin(user)
    const item = await this.mustMaterial(id)
    if (!admin && item.status !== 'published') {
      throw new NotFoundException({ code: 'MARKET_MATERIAL_NOT_FOUND', message: `物料 ${id} 不存在` })
    }
    return admin ? item : publicView(item)
  }

  /* ------------------------------ 草稿 ------------------------------ */

  async create(user: AuthUser, body: unknown): Promise<MarketMaterial> {
    await this.assertAdmin(user)
    const input = parseMaterialInput(body)
    const now = new Date().toISOString()
    const item: MarketMaterial = {
      ...input,
      status: 'draft',
      revision: 1,
      createdBy: user.username,
      updatedBy: user.username,
      createdAt: now,
      updatedAt: now,
    }
    const created = await this.repo.createMaterial(item)
    if (!created) {
      throw new ConflictException({ code: 'MARKET_MATERIAL_EXISTS', message: `物料 ${input.id} 已存在` })
    }
    return item
  }

  async update(
    user: AuthUser,
    id: string,
    body: unknown,
    ifMatch?: string,
  ): Promise<MarketMaterial> {
    await this.assertAdmin(user)
    const current = await this.mustMaterial(id)
    const expected = this.expectedRevision(ifMatch, id, current.revision)
    this.requireStatus(current, ['draft', 'rejected', 'unpublished'], '编辑')
    const input = parseMaterialInput(body, id)
    const updated: MarketMaterial = {
      ...current,
      ...input,
      status: 'draft',
      revision: current.revision + 1,
      updatedBy: user.username,
      updatedAt: new Date().toISOString(),
      // 重新编辑即作废旧审核结论；保留 reviewedBy/At 会误导发布人。
      reviewDecision: undefined,
      reviewNote: undefined,
      reviewedAt: undefined,
      reviewedBy: undefined,
    }
    await this.save(updated, expected)
    return updated
  }

  async submit(user: AuthUser, id: string, ifMatch?: string): Promise<MarketMaterial> {
    await this.assertAdmin(user)
    const current = await this.mustMaterial(id)
    const expected = this.expectedRevision(ifMatch, id, current.revision)
    this.requireStatus(current, ['draft', 'rejected', 'unpublished'], '提交审核')
    const now = new Date().toISOString()
    const updated: MarketMaterial = {
      ...current,
      status: 'pending',
      revision: current.revision + 1,
      updatedBy: user.username,
      updatedAt: now,
      submittedAt: now,
      reviewDecision: undefined,
      reviewNote: undefined,
      reviewedAt: undefined,
      reviewedBy: undefined,
    }
    await this.save(updated, expected)
    return updated
  }

  async review(
    user: AuthUser,
    id: string,
    body: unknown,
    ifMatch?: string,
  ): Promise<MarketMaterial> {
    await this.assertAdmin(user)
    const current = await this.mustMaterial(id)
    const expected = this.expectedRevision(ifMatch, id, current.revision)
    this.requireStatus(current, ['pending'], '审核')
    const input: ReviewInput = parseReviewInput(body)
    const now = new Date().toISOString()
    const updated: MarketMaterial = {
      ...current,
      status: input.decision,
      revision: current.revision + 1,
      updatedBy: user.username,
      updatedAt: now,
      reviewedAt: now,
      reviewedBy: user.username,
      reviewDecision: input.decision,
      reviewNote: input.note,
    }
    await this.save(updated, expected)
    return updated
  }

  async publish(user: AuthUser, id: string, ifMatch?: string): Promise<MarketMaterial> {
    await this.assertAdmin(user)
    const current = await this.mustMaterial(id)
    const expected = this.expectedRevision(ifMatch, id, current.revision)
    this.requireStatus(current, ['approved'], '发布')
    const now = new Date().toISOString()
    const version: MarketMaterialVersion = {
      materialId: id,
      version: current.version,
      entry: toManifestEntry(current),
      publishedBy: user.username,
      publishedAt: now,
    }
    const published: MarketMaterial = {
      ...current,
      status: 'published',
      revision: current.revision + 1,
      updatedBy: user.username,
      updatedAt: now,
      publishedAt: now,
      publishedBy: user.username,
      publishedVersion: current.version,
    }
    const result = await this.repo.publishMaterial(published, version, expected)
    if (result === 'version-exists') {
      throw new ConflictException({
        code: 'MARKET_VERSION_EXISTS',
        message: `物料 ${id} 的版本 ${current.version} 已发布过，请提升 version 后重新审核`,
      })
    }
    if (result === 'conflict') await this.throwConflict(id, expected)
    return published
  }

  async unpublish(user: AuthUser, id: string, ifMatch?: string): Promise<MarketMaterial> {
    await this.assertAdmin(user)
    const current = await this.mustMaterial(id)
    const expected = this.expectedRevision(ifMatch, id, current.revision)
    this.requireStatus(current, ['published'], '下架')
    const updated: MarketMaterial = {
      ...current,
      status: 'unpublished',
      revision: current.revision + 1,
      updatedBy: user.username,
      updatedAt: new Date().toISOString(),
    }
    await this.save(updated, expected)
    return updated
  }

  async versions(user: AuthUser, id: string): Promise<{ items: MarketMaterialVersion[] }> {
    await this.assertAdmin(user)
    await this.mustMaterial(id)
    const items = await this.repo.listVersions(id)
    items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0))
    return { items }
  }

  /* ------------------------------ 清单 ------------------------------ */

  async manifest(): Promise<MarketManifestResult> {
    this.assertSigning()
    const items = (await this.repo.listMaterials())
      .filter((item) => item.status === 'published')
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const generatedAt =
      items.reduce((latest, item) => (item.updatedAt > latest ? item.updatedAt : latest), '') ||
      new Date(0).toISOString()
    const manifest: MarketManifest = {
      schemaVersion: MARKET_SCHEMA_VERSION,
      name: process.env.LC_MATERIAL_MARKET_NAME?.trim() || MARKET_DEFAULT_NAME,
      generatedAt,
      materials: items.map(toManifestEntry),
    }
    const canonical = canonicalJson(manifest)
    return {
      body: signManifest(manifest, this.signer),
      etag: manifestEtag(canonical),
    }
  }

  async key(): Promise<MarketManifestKey> {
    this.assertSigning()
    return manifestKey(this.signer)
  }

  /* ------------------------------ 安装 ------------------------------ */

  async listInstalls(user: AuthUser, tenantId: string): Promise<{ items: MarketInstall[] }> {
    void user
    const items = await this.repo.listInstalls(tenantId)
    items.sort((a, b) => (a.materialId < b.materialId ? -1 : a.materialId > b.materialId ? 1 : 0))
    return { items }
  }

  async install(
    user: AuthUser,
    tenantId: string,
    materialId: string,
    body: unknown,
    ifMatch?: string,
  ): Promise<MarketInstall> {
    const input: InstallInput = parseInstallInput(body)
    const material = await this.mustMaterial(materialId)
    if (material.status !== 'published') {
      throw new ConflictException({
        code: 'MARKET_NOT_PUBLISHED',
        message: `物料 ${materialId} 当前状态为 ${material.status}，不可安装`,
        currentStatus: material.status,
      })
    }
    if (input.version !== material.version) {
      throw new ConflictException({
        code: 'MARKET_VERSION_MISMATCH',
        message: `只能安装当前发布版本 ${material.version}（请求 ${input.version}）`,
        publishedVersion: material.version,
      })
    }

    const installId = `${tenantId}/${materialId}`
    const existing = await this.repo.findInstall(tenantId, materialId)
    if (!existing) {
      const requested = parseIfMatch(ifMatch, 'material-install', installId)
      if (requested !== undefined) {
        // 从未安装却携带 If-Match：按版本冲突处理，要求调用方重新 GET。
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: '版本冲突',
          expectedRevision: requested,
          currentRevision: 0,
        })
      }
      const now = new Date().toISOString()
      const install: MarketInstall = {
        tenantId,
        materialId,
        version: input.version,
        installedBy: user.username,
        installedAt: now,
        updatedAt: now,
        revision: 1,
      }
      if (await this.repo.createInstall(install)) return install
      // 并发创建：另一请求已写入，重新读取后按「已安装」处理。
      const raced = await this.repo.findInstall(tenantId, materialId)
      if (raced) return raced
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: '版本冲突' })
    }

    const expected = this.expectedRevision(ifMatch, installId, existing.revision, 'material-install')
    if (existing.version === input.version) return existing
    const updated: MarketInstall = {
      ...existing,
      version: input.version,
      installedBy: user.username,
      updatedAt: new Date().toISOString(),
      revision: existing.revision + 1,
    }
    if (!(await this.repo.updateInstall(updated, expected))) {
      throw await this.installConflict(tenantId, materialId, expected)
    }
    return updated
  }

  async uninstall(
    user: AuthUser,
    tenantId: string,
    materialId: string,
    ifMatch?: string,
  ): Promise<{ tenantId: string; materialId: string; removed: true }> {
    const existing = await this.repo.findInstall(tenantId, materialId)
    if (!existing) {
      throw new NotFoundException({
        code: 'MARKET_INSTALL_NOT_FOUND',
        message: `租户 ${tenantId} 未安装物料 ${materialId}`,
      })
    }
    const expected = this.expectedRevision(
      ifMatch,
      `${tenantId}/${materialId}`,
      existing.revision,
      'material-install',
    )
    if (!(await this.repo.removeInstall(tenantId, materialId, expected))) {
      throw await this.installConflict(tenantId, materialId, expected)
    }
    return { tenantId, materialId, removed: true }
  }

  /* ------------------------------ 内部 ------------------------------ */

  private async isAdmin(user: AuthUser): Promise<boolean> {
    return (await this.rbac.permsOf(user)).includes('*')
  }

  private async assertAdmin(user: AuthUser): Promise<void> {
    if (!(await this.isAdmin(user))) {
      throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: '仅管理员可维护物料市场' })
    }
  }

  private assertSigning(): void {
    if (!this.signer.enabled) {
      throw new ServiceUnavailableException({
        code: 'MARKET_SIGNING_UNCONFIGURED',
        message: this.signer.reason ?? '物料市场签名未配置',
      })
    }
  }

  private async mustMaterial(id: string): Promise<MarketMaterial> {
    const item = await this.repo.findMaterial(id)
    if (!item) {
      throw new NotFoundException({ code: 'MARKET_MATERIAL_NOT_FOUND', message: `物料 ${id} 不存在` })
    }
    return item
  }

  private requireStatus(item: MarketMaterial, allowed: MaterialStatus[], action: string): void {
    if (!allowed.includes(item.status)) {
      throw new ConflictException({
        code: 'MARKET_STATE_CONFLICT',
        message: `物料 ${item.id} 当前状态为 ${item.status}，不允许${action}`,
        currentStatus: item.status,
      })
    }
    // 防御：状态机外仍可能写入不合法状态（手改文件），编辑入口统一收口。
    if (action === '编辑' && !isEditable(item.status)) {
      throw new ConflictException({ code: 'MARKET_STATE_CONFLICT', message: '物料不可编辑' })
    }
  }

  private expectedRevision(
    ifMatch: string | undefined,
    id: string,
    currentRevision: number,
    kind: 'material' | 'material-install' = 'material',
  ): number {
    const expected = parseIfMatch(ifMatch, kind, id)
    if (expected !== undefined && expected !== currentRevision) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: '版本冲突',
        expectedRevision: expected,
        currentRevision,
      })
    }
    return currentRevision
  }

  private async save(item: MarketMaterial, expected: number): Promise<void> {
    if (await this.repo.updateMaterial(item, expected)) return
    await this.throwConflict(item.id, expected)
  }

  private async throwConflict(id: string, expected: number): Promise<never> {
    const latest = await this.repo.findMaterial(id)
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: '版本冲突',
      expectedRevision: expected,
      currentRevision: latest?.revision ?? expected,
    })
  }

  private async installConflict(
    tenantId: string,
    materialId: string,
    expected: number,
  ): Promise<ConflictException> {
    const latest = await this.repo.findInstall(tenantId, materialId)
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: '版本冲突',
      expectedRevision: expected,
      currentRevision: latest?.revision ?? expected,
    })
  }

  /* ------------------------------ 查询参数 ------------------------------ */

  private parseStatusFilter(value: unknown): MaterialStatus | undefined {
    if (value === undefined || value === '') return undefined
    if (typeof value !== 'string' || !STATUS_SET.has(value)) {
      throw new BadRequestException({ code: 'INVALID_QUERY', message: `status 非法：${String(value)}` })
    }
    return value as MaterialStatus
  }

  private parseCategoryFilter(value: unknown): string | undefined {
    if (value === undefined || value === '') return undefined
    if (typeof value !== 'string' || !CATEGORY_SET.has(value)) {
      throw new BadRequestException({ code: 'INVALID_QUERY', message: `category 非法：${String(value)}` })
    }
    return value
  }

  private parseKindFilter(value: unknown): string | undefined {
    if (value === undefined || value === '') return undefined
    if (value !== 'meta' && value !== 'component') {
      throw new BadRequestException({ code: 'INVALID_QUERY', message: `kind 非法：${String(value)}` })
    }
    return value
  }

  private parseKeyword(value: unknown): string | undefined {
    if (value === undefined || value === '') return undefined
    if (typeof value !== 'string' || value.length > 64) {
      throw new BadRequestException({ code: 'INVALID_QUERY', message: 'q 必须是不超过 64 字符的字符串' })
    }
    return value
  }
}
const STATUS_SET = new Set<string>(MATERIAL_STATUSES)
const CATEGORY_SET = new Set<string>(MATERIAL_CATEGORIES)
