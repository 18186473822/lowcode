/**
 * 页面服务：Schema 草稿存取 + 静态校验 + 发布 / 回滚（方案 8.3 / 8.4）。
 *
 * 状态语义：
 * - `status: 'published'` 草稿已全部发布（无未发布改动）
 * - `status: 'draft'`     存在未发布改动（PUT 草稿 / 回滚后均为此态）
 *
 * 校验链路与设计器**完全同源**：`validatePage`（@lc/schema）+ `checkExpr`（@lc/expression），
 * 设计器保存前调 POST /pages/validate，服务端 PUT 时再兜底一次 —— 同一套规则、两端一致。
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { validatePage, type PageSchema, type ValidationResult } from '@lc/schema'
import { checkExpr } from '@lc/expression'
import { PAGE_REPOSITORY, type PageRecord, type PageRepository, type PageStatus } from './page.types.js'
import type { AuthUser } from '../common/jwt.service.js'

/** 页面 id 白名单：字母/下划线开头，仅限 [A-Za-z0-9_-]，长度 ≤ 64（防路径穿越） */
const PAGE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

/* ------------------------------------------------------------------ */
/* 请求 / 响应形状                                                     */
/* ------------------------------------------------------------------ */

export interface SaveDraftBody {
  schema?: unknown
  appId?: unknown
}

export interface PublishBody {
  note?: unknown
}

export interface RollbackBody {
  version?: unknown
}

export interface PageSaveResponse {
  pageId: string
  status: 'draft'
  currentVersion: number
  updatedAt: string
  validation: { valid: true; warnings: ValidationResult['warnings'] }
}

export interface PagePublishResponse {
  pageId: string
  status: 'published'
  version: number
  publishedAt: string
  createdBy: string
  note?: string
}

export interface PageRollbackResponse {
  pageId: string
  status: 'draft'
  currentVersion: number
  /** 草稿被回退到的历史版本 */
  rolledBackTo: number
  updatedAt: string
}

/** 一条版本元数据（列表视图；不含 schema 全文 —— 查全文走 GET :id/schema?version=vN） */
export interface PageVersionSummary {
  version: number
  createdBy: string
  createdAt: string
  note?: string
}

/** 版本历史列表（Phase 2 批 5 / D-P2-8） */
export interface PageVersionsResponse {
  pageId: string
  status: 'draft' | 'published'
  currentVersion: number
  /** 倒序（vN 最新在前） */
  versions: PageVersionSummary[]
}

/**
 * 页面列表摘要（2026-10-20 补）—— 供设计器换页下拉使用。
 * **刻意不含 `draft` / `versions` 全文**：列表接口会被高频调用，一页 schema 可达数十 KB，
 * 带上就会把「换页」变成「下载全部页面」。
 */
export interface PageSummary {
  id: string
  appId: string
  name: string
  type: string
  status: PageStatus
  currentVersion: number
  /** 从未发布过为 0 */
  versionCount: number
  updatedAt: string
  createdAt: string
}

/** 删除结果（回带被清理的版本数，便于前端提示「已删除 N 个版本」） */
export interface PageDeleteResponse {
  pageId: string
  deleted: true
  removedVersions: number
}

type VersionSelector = { kind: 'draft' } | { kind: 'published' } | { kind: 'number'; value: number }

/* ------------------------------------------------------------------ */
/* 校验（导出以便单测 / 其他模块复用）                                  */
/* ------------------------------------------------------------------ */

/**
 * Schema 静态校验：结构 + 表达式语法，与设计器保存前调用的规则一致。
 * 注意 schemaVersion 必须是三段式（如 `1.0.0`）。
 */
export function validateSchemaInput(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: [{ code: 'E_REQUIRED', severity: 'error', path: '', message: 'schema 必须是对象' }],
      warnings: [],
    }
  }
  return validatePage(input as PageSchema, { checkExpr })
}

/* ------------------------------------------------------------------ */
/* 服务                                                                */
/* ------------------------------------------------------------------ */

@Injectable()
export class PageService {
  constructor(@Inject(PAGE_REPOSITORY) private readonly repo: PageRepository) {}

  /** 保存前静态校验（永远 200，结果在 body 里，便于设计器渲染问题列表） */
  validateOnly(schema: unknown): ValidationResult {
    return validateSchemaInput(schema)
  }

  /** 获取 Schema：?version=draft（默认）| published | vN */
  async getSchema(id: string, version: string | undefined) {
    const record = await this.mustFind(id)
    const selector = parseVersion(version)

    if (selector.kind === 'draft') {
      if (!record.draft) {
        throw new NotFoundException({ code: 'DRAFT_NOT_FOUND', message: '该页面尚无草稿' })
      }
      return {
        pageId: id,
        status: record.status,
        currentVersion: record.currentVersion,
        version: 'draft' as const,
        schema: record.draft,
        updatedAt: record.draftUpdatedAt,
        updatedBy: record.draftUpdatedBy,
      }
    }

    if (selector.kind === 'published') {
      if (record.currentVersion < 1) {
        throw new ConflictException({ code: 'NOT_PUBLISHED', message: '该页面尚未发布任何版本' })
      }
      const published = record.versions.find((v) => v.version === record.currentVersion)
      /* c8 ignore next -- currentVersion 恒指向 versions 中真实存在的一条 */
      if (!published) {
        throw new ConflictException({ code: 'NOT_PUBLISHED', message: '发布版本数据不一致' })
      }
      return {
        pageId: id,
        status: record.status,
        currentVersion: record.currentVersion,
        version: published.version,
        schema: published.schema,
        createdAt: published.createdAt,
        createdBy: published.createdBy,
        note: published.note,
      }
    }

    const found = record.versions.find((v) => v.version === selector.value)
    if (!found) {
      throw new NotFoundException({
        code: 'VERSION_NOT_FOUND',
        message: `版本 ${selector.value} 不存在`,
      })
    }
    return {
      pageId: id,
      status: record.status,
      currentVersion: record.currentVersion,
      version: found.version,
      schema: found.schema,
      createdAt: found.createdAt,
      createdBy: found.createdBy,
      note: found.note,
    }
  }

  /** 保存草稿（页面不存在时自动建档）；校验不过 400 */
  async saveDraft(id: string, body: SaveDraftBody | undefined, user: AuthUser): Promise<PageSaveResponse> {
    assertPageId(id)

    const result = validateSchemaInput(body?.schema)
    if (!result.valid) {
      throw new BadRequestException({
        code: 'SCHEMA_INVALID',
        message: 'Schema 校验未通过',
        errors: result.errors,
        warnings: result.warnings,
      })
    }
    const schema = body!.schema as PageSchema

    const now = new Date().toISOString()
    const record = (await this.repo.find(id)) ?? this.newRecord(id, body, now)

    if (body?.appId !== undefined) {
      if (typeof body.appId !== 'string' || !body.appId.trim()) {
        throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'appId 必须为非空字符串' })
      }
      record.appId = body.appId.trim()
    }

    record.draft = schema
    record.draftUpdatedAt = now
    record.draftUpdatedBy = user.username
    record.name = schema.name ?? record.name
    record.type = schema.type ?? record.type
    record.status = 'draft' // 有未发布改动
    record.updatedAt = now

    await this.repo.save(record)

    return {
      pageId: id,
      status: 'draft',
      currentVersion: record.currentVersion,
      updatedAt: now,
      validation: { valid: true, warnings: result.warnings },
    }
  }

  /** 发布：把当前草稿固化为新版本（方案 8.4「发布即插入一条」） */
  async publish(id: string, body: PublishBody | undefined, user: AuthUser): Promise<PagePublishResponse> {
    const record = await this.mustFind(id)
    if (!record.draft) {
      throw new ConflictException({ code: 'NO_DRAFT', message: '没有可发布的草稿' })
    }
    const note = parseNote(body?.note)

    const now = new Date().toISOString()
    const version = record.currentVersion + 1

    record.versions.push({ version, schema: record.draft, createdBy: user.username, createdAt: now, note })
    record.currentVersion = version
    record.status = 'published' // 草稿已全部发布
    record.updatedAt = now

    await this.repo.save(record)

    return { pageId: id, status: 'published', version, publishedAt: now, createdBy: user.username, note }
  }

  /** 回滚：把历史版本复制为新的当前草稿（需再次发布才对外生效） */
  async rollback(id: string, body: RollbackBody | undefined, user: AuthUser): Promise<PageRollbackResponse> {
    const record = await this.mustFind(id)

    const { version } = body ?? {}
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'version 必须是 ≥ 1 的整数' })
    }
    const target = record.versions.find((v) => v.version === version)
    if (!target) {
      throw new NotFoundException({ code: 'VERSION_NOT_FOUND', message: `版本 ${version} 不存在` })
    }

    const now = new Date().toISOString()
    record.draft = target.schema
    record.draftUpdatedAt = now
    record.draftUpdatedBy = user.username
    record.status = 'draft' // 回滚产生未发布改动
    record.updatedAt = now

    await this.repo.save(record)

    return { pageId: id, status: 'draft', currentVersion: record.currentVersion, rolledBackTo: version, updatedAt: now }
  }

  /**
   * 版本历史列表（Phase 2 批 5 / D-P2-8）：轻量元数据、倒序，不含 schema 全文 ——
   * 版本数据已在 record.versions（发布即 push，天然升序），这里只做投影 + 倒排。
   */
  async listVersions(id: string): Promise<PageVersionsResponse> {
    const record = await this.mustFind(id)
    return {
      pageId: id,
      status: record.status,
      currentVersion: record.currentVersion,
      versions: record.versions
        .map((v) => ({ version: v.version, createdBy: v.createdBy, createdAt: v.createdAt, note: v.note }))
        .sort((a, b) => b.version - a.version),
    }
  }

  /**
   * 页面列表（2026-10-20 补）：轻量摘要，按 `updatedAt` 倒序（最近编辑的在前），
   * 同刻按 id 升序保证稳定序。**可见性过滤在控制器侧**（需 RbacService，本服务不依赖 RBAC）。
   */
  async listPages(): Promise<PageSummary[]> {
    const records = await this.repo.list()
    return records
      .map((r) => ({
        id: r.id,
        appId: r.appId,
        name: r.name,
        type: r.type,
        status: r.status,
        currentVersion: r.currentVersion,
        versionCount: r.versions.length,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
  }

  /**
   * 删除页面（含全部历史版本 —— 二者同一文件，删除即无孤儿）。
   * 不存在时 404 `PAGE_NOT_FOUND`（与读写路径同一错误码，前端只需处理一种）。
   */
  async removePage(id: string): Promise<PageDeleteResponse> {
    const record = await this.mustFind(id)
    const removed = await this.repo.remove(id)
    /* c8 ignore next -- mustFind 刚确认存在，正常不会被并发删除；防御性 404 */
    if (!removed) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: `页面 ${id} 不存在` })
    }
    return { pageId: id, deleted: true, removedVersions: record.versions.length }
  }

  /* ------------------------------ 内部 ------------------------------ */
  private async mustFind(id: string): Promise<PageRecord> {
    assertPageId(id)
    const record = await this.repo.find(id)
    if (!record) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: `页面 ${id} 不存在` })
    }
    return record
  }

  private newRecord(id: string, body: SaveDraftBody | undefined, now: string): PageRecord {
    return {
      id,
      appId: typeof body?.appId === 'string' && body.appId.trim() ? body.appId.trim() : 'app_default',
      name: id,
      type: 'form',
      status: 'draft',
      currentVersion: 0,
      draft: null,
      versions: [],
      createdAt: now,
      updatedAt: now,
    }
  }
}

/* ------------------------------------------------------------------ */
/* 辅助                                                                */
/* ------------------------------------------------------------------ */

function assertPageId(id: string): void {
  if (!PAGE_ID_RE.test(id)) {
    throw new BadRequestException({ code: 'INVALID_PAGE_ID', message: `非法的页面 id：${id}` })
  }
}

/** 解析 ?version=draft | published | vN | N */
function parseVersion(version: string | undefined): VersionSelector {
  if (version === undefined || version === '' || version === 'draft') return { kind: 'draft' }
  if (version === 'published') return { kind: 'published' }
  if (Array.isArray(version)) {
    throw new BadRequestException({ code: 'INVALID_VERSION', message: 'version 参数只接受一个值' })
  }
  const m = /^v?(\d+)$/.exec(version)
  if (m) return { kind: 'number', value: Number(m[1]) }
  throw new BadRequestException({
    code: 'INVALID_VERSION',
    message: 'version 仅支持 draft / published / vN',
  })
}

function parseNote(note: unknown): string | undefined {
  if (note === undefined || note === null || note === '') return undefined
  if (typeof note !== 'string' || note.length > 500) {
    throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'note 必须是 ≤ 500 字的字符串' })
  }
  return note
}
