/**
 * 业务记录服务：动态 CRUD（方案 8.3 四个 records 接口 + 12.5 服务端再校验）。
 *
 * 写入链路（「不信任前端」三步，见方案 12.5）：
 *  1. **sanitize** —— 只保留模型声明且非 readonly 的字段（未知键丢弃，系统键不可伪造）；
 *  2. **类型校验** —— 按 FieldSchema.type 逐字段检查（含 length / date 格式 / enum 选项）；
 *  3. **规则校验** —— `checkRule`（@lc/renderer 纯逻辑层，**与前端同一实现**）跑
 *     required / pattern / range / maxLength / expression 规则，语义与页面内校验完全一致。
 *
 * 查询（filter/sort/page）：方案 B 为文件存储，采用「全量读出 → 内存过滤/排序/分页」，
 * Phase 2 升方案 A 后换成自动 SQL，接口形状不变。
 *
 * 已知边界（台账「未实现」同步登记）：expression 规则服务端作用域仅 `formData` +
 * 空的 `appData/params`（协议约定规则只引用 formData）；async 规则仅前端执行。
 */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { evalExpr, type Scope } from '@lc/expression'
import { checkRule, isEmpty } from '@lc/renderer'
import type { FieldSchema, Issue, ModelSchema } from '@lc/schema'
import { randomUUID } from 'node:crypto'
import type { AuthUser } from '../common/jwt.service.js'
import { RbacService, rowVisible } from '../rbac/rbac.service.js'
import { FlowService } from '../flow/flow.service.js'
import { assertModelId, isPlainObject } from './model.service.js'
import {
  MODEL_REPOSITORY,
  RECORD_REPOSITORY,
  type DataRecordEntity,
  type ModelRepository,
  type RecordRepository,
} from './model.types.js'

/** 记录 id 白名单：字母/数字开头（uuid 允许数字开头），仅限 [A-Za-z0-9_-] */
const RECORD_ID_RE = /^[A-Za-z0-9][\w-]{0,63}$/

/** 系统字段（记录元信息；可参与 filter/sort，但不可出现在 payload） */
const SYSTEM_FIELDS = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const

/** 分页默认值与上限 */
const DEFAULT_SIZE = 20
const MAX_SIZE = 100

/* ------------------------------------------------------------------ */
/* 请求 / 响应形状                                                     */
/* ------------------------------------------------------------------ */

export interface ListQuery {
  filter?: unknown
  sort?: unknown
  page?: unknown
  size?: unknown
}

export interface RecordListResult {
  items: Array<Record<string, unknown>>
  total: number
  page: number
  size: number
}

interface ParsedQuery {
  filter: Record<string, unknown>
  sort: { field: string; dir: 'asc' | 'desc' }
  page: number
  size: number
}

/* ------------------------------------------------------------------ */
/* 校验（导出便于单测/复用）                                            */
/* ------------------------------------------------------------------ */

/** 字段类型检查：返回错误消息或 null（空值由调用方先行处理） */
export function checkFieldType(field: FieldSchema, value: unknown): string | null {
  switch (field.type) {
    case 'number':
    case 'money':
      return typeof value === 'number' && Number.isFinite(value) ? null : '必须是数字'
    case 'boolean':
      return typeof value === 'boolean' ? null: '必须是布尔值'
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : '必须是 YYYY-MM-DD 格式日期'
    case 'datetime':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? null : '必须是可解析的日期时间'
    case 'enum':
      return field.options?.some((o) => o.value === value) ? null : '值不在枚举选项内'
    case 'file':
      return Array.isArray(value) && value.every((v) => typeof v === 'string')
        ? null
        : '必须是字符串数组'
    case 'json':
    case 'location':
      return null // 任意 JSON 值
    default:
      // string / text / id / relation / user / dept：字符串 + 可选长度上限
      if (typeof value !== 'string') return '必须是字符串'
      if (field.length !== undefined && value.length > field.length) {
        return `长度不能超过 ${field.length} 个字符`
      }
      return null
  }
}

/** 长度超限单独出码（E_FIELD_LENGTH），其余类型问题统一 E_FIELD_TYPE */
export function fieldTypeIssue(field: FieldSchema, value: unknown): Issue | null {
  const msg = checkFieldType(field, value)
  if (!msg) return null
  return {
    // 长度超限单独出码（仅 string 系默认分支会产生该消息），其余统一 E_FIELD_TYPE
    code: msg.startsWith('长度') ? 'E_FIELD_LENGTH' : 'E_FIELD_TYPE',
    severity: 'error',
    path: field.key,
    message: `${field.name || field.key}${msg}`,
  }
}

/**
 * 记录载荷校验：类型 → 规则（单字段只报首个错误，与前端 validateAll 一致）。
 * `scope` 只含 formData + 空 appData/params —— expression 规则应只引用 formData（协议约定）。
 */
export function validatePayload(model: ModelSchema, payload: Record<string, unknown>): Issue[] {
  const issues: Issue[] = []
  const scope: Scope = { formData: payload, appData: {}, params: {} }

  for (const field of model.fields ?? []) {
    if (!field || field.readonly) continue
    const value = payload[field.key]
    const empty = isEmpty(value)
    const label = field.name || field.key

    // ① 模型级必填（FieldSchema.required，前端页面层不感知，服务端兜底）
    if (field.required === true && empty) {
      issues.push({
        code: 'E_REQUIRED',
        severity: 'error',
        path: field.key,
        message: `请填写${label}`,
      })
      continue
    }

    // ② 类型（空值跳过 —— 与前端「非必填时空值不校验格式」一致）
    if (!empty) {
      const typeIssue = fieldTypeIssue(field, value)
      if (typeIssue) {
        issues.push(typeIssue)
        continue
      }
    }

    // ③ 规则（required/pattern/range/maxLength/expression 走同一 checkRule；async 仅前端执行）
    for (const rule of field.rules ?? []) {
      if (rule.type === 'async') continue
      const msg = checkRule(rule, value, label, scope)
      if (msg) {
        issues.push({
          code: rule.type === 'required' ? 'E_REQUIRED' : 'E_RULE_FAILED',
          severity: 'error',
          path: field.key,
          message: msg,
        })
        break
      }
    }
  }

  return issues
}

/** 过滤/排序可用键 = 声明字段 ∪ 系统字段 */
function allowedQueryKeys(model: ModelSchema): Set<string> {
  const keys = new Set<string>(SYSTEM_FIELDS)
  for (const f of model.fields ?? []) if (f?.key) keys.add(f.key)
  return keys
}

/** 解析查询串参数；任何不合法输入 → 400 INVALID_QUERY（带具体 message） */
export function parseListQuery(query: ListQuery, model: ModelSchema): ParsedQuery {
  const allowed = allowedQueryKeys(model)

  /* filter：JSON 对象，键必须命中 allowed，值只能是标量/null */
  let filter: Record<string, unknown> = {}
  if (query.filter !== undefined) {
    if (typeof query.filter !== 'string') {
      throw badQuery('filter 只接受一个 JSON 字符串')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(query.filter)
    } catch {
      throw badQuery('filter 必须是合法 JSON 对象')
    }
    if (!isPlainObject(parsed)) {
      throw badQuery('filter 必须是 JSON 对象')
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (!allowed.has(k)) throw badQuery(`filter 含未知字段：${k}`)
      if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
        throw badQuery(`filter 值只支持标量/null：${k}`)
      }
    }
    filter = parsed
  }

  /* sort：field[:asc|desc]，缺省方向为 asc；不给 sort → createdAt:desc */
  let sort: ParsedQuery['sort'] = { field: 'createdAt', dir: 'desc' }
  if (query.sort !== undefined) {
    if (typeof query.sort !== 'string') {
      throw badQuery('sort 只接受一个值')
    }
    const [field, dir = 'asc', ...rest] = query.sort.split(':')
    if (rest.length > 0 || (dir !== 'asc' && dir !== 'desc')) {
      throw badQuery(`sort 格式应为 field:asc|desc：${query.sort}`)
    }
    if (!allowed.has(field)) throw badQuery(`sort 含未知字段：${field}`)
    sort = { field, dir }
  }

  /* page / size：正整数，size ≤ 100 */
  const page = parsePositiveInt(query.page, 1, 'page')
  const size = parsePositiveInt(query.size, DEFAULT_SIZE, 'size', MAX_SIZE)

  return { filter, sort, page, size }
}

function badQuery(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_QUERY', message })
}

function parsePositiveInt(raw: unknown, fallback: number, name: string, max?: number): number {
  if (raw === undefined) return fallback
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw badQuery(`${name} 必须是正整数`)
  }
  const n = Number(raw)
  if (n < 1 || (max !== undefined && n > max)) {
    throw badQuery(max !== undefined ? `${name} 取值 1~${max}` : `${name} 必须 ≥ 1`)
  }
  return n
}

/** 相等匹配（严格类型；null 匹配 null/缺省） */
function matchValue(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined
  return actual === expected
}

/** 空值排后（升序）；同类型数值/字符串按常规比较，其余 String() 兜底 */
function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? -1 : 1
}

function toItem(entity: DataRecordEntity): Record<string, unknown> {
  // payload 在前、系统字段在后：即使模型侧漏拦保留键，审计字段也不可被覆盖
  return {
    ...entity.payload,
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
  }
}

function recordInvalid(issues: Issue[]): BadRequestException {
  return new BadRequestException({
    code: 'RECORD_INVALID',
    message: '记录校验未通过',
    errors: issues,
    warnings: [],
  })
}

/* ------------------------------------------------------------------ */
/* 服务                                                                */
/* ------------------------------------------------------------------ */

@Injectable()
export class RecordService {
  constructor(
    @Inject(MODEL_REPOSITORY) private readonly models: ModelRepository,
    @Inject(RECORD_REPOSITORY) private readonly records: RecordRepository,
    @Inject(RbacService) private readonly rbac: RbacService,
    @Inject(FlowService) private readonly flows: FlowService,
  ) {}

  /** 新增记录（POST /models/:modelId/records）—— 批 6：③ 模型 CRUD 权限 create */
  async create(modelId: string, body: unknown, user: AuthUser): Promise<Record<string, unknown>> {
    const model = await this.mustModel(modelId)
    await this.rbac.assertModelAction(user, model, 'create')
    if (!isPlainObject(body)) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: '请求体必须是 JSON 对象' })
    }

    const now = new Date().toISOString()
    const payload = this.sanitize(model, body, now, true)
    const issues = validatePayload(model, payload)
    if (issues.length > 0) throw recordInvalid(issues)

    const entity: DataRecordEntity = {
      id: randomUUID(),
      payload,
      createdBy: user.username,
      createdAt: now,
      updatedAt: now,
    }
    await this.records.save(modelId, entity)
    // Phase 3 批 1：记录提交联动 —— 匹配 modelId 的流程定义自动启动实例。
    // 弱保证（onRecordCreated 内部全量 try-catch）：流程启动失败只记日志，记录提交不回滚。
    await this.flows.onRecordCreated(modelId, entity.id, payload, user)
    return toItem(entity)
  }

  /**
   * 查询（GET /models/:modelId/records）：filter 等值 + sort + 分页，排除软删。
   * 批 6：③ read 权限 + ④ 行级 dataScope 过滤（'*' 豁免 / self=createdBy / dept 系降级 self）。
   */
  async list(modelId: string, query: ListQuery, user: AuthUser): Promise<RecordListResult> {
    const model = await this.mustModel(modelId)
    await this.rbac.assertModelAction(user, model, 'read')
    const q = parseListQuery(query, model)

    const filtered = await this.rbac.scopeFiltered(user, model)
    let items = (await this.records.list(modelId))
      .filter((r) => !r.deletedAt)
      // ④ 行级过滤：self/dept 系（'*' 豁免由 scopeFiltered 判定）
      .filter((r) => !filtered || rowVisible(model.dataScope, user, r.createdBy, false))
      .map(toItem)

    const filterKeys = Object.keys(q.filter)
    if (filterKeys.length > 0) {
      items = items.filter((it) => filterKeys.every((k) => matchValue(it[k], q.filter[k])))
    }

    const sign = q.sort.dir === 'asc' ? 1 : -1
    items.sort((a, b) => cmp(a[q.sort.field], b[q.sort.field]) * sign)

    const total = items.length
    const start = (q.page - 1) * q.size
    return { items: items.slice(start, start + q.size), total, page: q.page, size: q.size }
  }

  /**
   * 更新（PUT）：部分合并 → 对合并结果整体再校验（必填不能被清空）。
   * 批 6：③ update 权限 + ④ 行归属检查（不可见行 403）。
   */
  async update(
    modelId: string,
    recordId: string,
    body: unknown,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const model = await this.mustModel(modelId)
    await this.rbac.assertModelAction(user, model, 'update')
    assertRecordId(recordId)
    const entity = await this.mustRecord(modelId, recordId)
    await this.rbac.assertRowOwned(user, model, entity.createdBy)

    if (!isPlainObject(body)) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: '请求体必须是 JSON 对象' })
    }

    const now = new Date().toISOString()
    const merged = { ...entity.payload, ...this.sanitize(model, body, now, false) }
    const issues = validatePayload(model, merged)
    if (issues.length > 0) throw recordInvalid(issues)

    entity.payload = merged
    entity.updatedAt = now
    entity.updatedBy = user.username
    await this.records.save(modelId, entity)
    return toItem(entity)
  }

  /** 软删（DELETE）：置 deletedAt，列表不再返回。批 6：③ delete 权限 + ④ 行归属检查 */
  async remove(modelId: string, recordId: string, user: AuthUser): Promise<{ id: string; deleted: true; deletedAt: string }> {
    const model = await this.mustModel(modelId)
    await this.rbac.assertModelAction(user, model, 'delete')
    assertRecordId(recordId)
    const entity = await this.mustRecord(modelId, recordId)
    await this.rbac.assertRowOwned(user, model, entity.createdBy)

    const now = new Date().toISOString()
    entity.deletedAt = now
    entity.updatedAt = now
    entity.updatedBy = user.username
    await this.records.save(modelId, entity)
    return { id: entity.id, deleted: true, deletedAt: now }
  }

  /* ------------------------------ 内部 ------------------------------ */

  /**
   * sanitize：只保留模型声明且非 readonly 的字段。
   * `fillAuto`（仅新增）：`auto: 'now' | true` 且值为空时由服务端补当前时间。
   */
  private sanitize(
    model: ModelSchema,
    input: Record<string, unknown>,
    now: string,
    fillAuto: boolean,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    for (const field of model.fields ?? []) {
      if (!field || field.readonly) continue
      if (!Object.prototype.hasOwnProperty.call(input, field.key)) continue
      payload[field.key] = input[field.key]
    }
    if (fillAuto) {
      for (const field of model.fields ?? []) {
        if (!field || field.readonly) continue
        if ((field.auto === 'now' || field.auto === true) && isEmpty(payload[field.key])) {
          payload[field.key] = now
        }
      }
    }
    return payload
  }

  private async mustModel(modelId: string): Promise<ModelSchema> {
    assertModelId(modelId)
    const entity = await this.models.find(modelId)
    if (!entity) {
      throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: `数据模型 ${modelId} 不存在` })
    }
    return entity.schema
  }

  private async mustRecord(modelId: string, recordId: string): Promise<DataRecordEntity> {
    const entity = await this.records.find(modelId, recordId)
    if (!entity || entity.deletedAt) {
      throw new NotFoundException({ code: 'RECORD_NOT_FOUND', message: `记录 ${recordId} 不存在` })
    }
    return entity
  }
}

function assertRecordId(recordId: string): void {
  if (!RECORD_ID_RE.test(recordId)) {
    throw new BadRequestException({ code: 'INVALID_RECORD_ID', message: `非法的记录 id：${recordId}` })
  }
}
