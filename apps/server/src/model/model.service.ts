/**
 * 数据模型（元数据）服务：定义的保存 / 读取 / 列表（方案 8.2 `model/` 模块裁剪）。
 *
 * 校验与前端**同源**：`validateModel`（@lc/schema）跑通用规则；服务端再补三层「不信任前端」的
 * 额外检查 —— ① `schemaVersion` 三段式（validateModel 不查版本，与页面保存对齐）；
 * ② 字段 key 格式与系统保留名（记录级字段不可被模型声明）；③ 字段 type 运行时白名单；
 * ④ `expression` 规则的**保存前语法检查**（checkExpr，与页面保存链路同源 —— validateModel
 * 未注入检查器时该项为空转，见 schema/validate/index.ts `optOf`）。
 *
 * 错误响应形状与页面保存对齐：`{ code: 'MODEL_INVALID', message, errors, warnings }`。
 */
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { isValidVersion, validateModel, type Issue, type ModelSchema } from '@lc/schema'
import { checkExpr } from '@lc/expression'
import type { AuthUser } from '../common/jwt.service.js'
import { RbacService, WILDCARD } from '../rbac/rbac.service.js'
import { MODEL_REPOSITORY, type ModelEntity, type ModelRepository } from './model.types.js'

/** 模型 id 白名单：字母/下划线开头，仅限 [A-Za-z0-9_-]，长度 ≤ 64（防路径穿越，与页面 id 同规则） */
export const MODEL_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

/** 字段 key 白名单：字母/下划线开头，仅限字母数字下划线（作为记录 payload 键与查询键） */
const FIELD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * 系统保留字段名：记录级审计字段，模型不得声明、payload 不得覆盖
 * （与 record.service 的 SYSTEM_FIELDS 对应，此处为保存期拦截）。
 */
export const RESERVED_FIELD_KEYS = [
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'deletedAt',
] as const

/**
 * FieldType 运行时白名单 —— 与 `schema/src/types/model.ts` 的 `FieldType` 联合类型一一对应
 * （15 种；`includes` 的参数类型受联合约束，漏项会在 typecheck 期报错）。
 * 协议层 FieldType 只有类型没有运行时数组，服务端拒收白名单外的值，防脏定义落库。
 */
const FIELD_TYPES = [
  'id',
  'string',
  'text',
  'number',
  'money',
  'boolean',
  'date',
  'datetime',
  'enum',
  'relation',
  'file',
  'user',
  'dept',
  'location',
  'json',
] as const

/** GET / PUT 响应形状：协议体 + 审计字段 */
export type ModelResponse = ModelSchema & {
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface ModelSummary {
  id: string
  name: string
  code: string
  type?: 'table' | 'view'
  fieldCount: number
  updatedAt: string
}

export interface ModelSaveResponse extends ModelResponse {
  validation: { valid: true; warnings: Issue[] }
}

/** 模型 id 白名单校验（service 与仓储双防线；record.service 复用） */
export function assertModelId(id: string): void {
  if (!MODEL_ID_RE.test(id)) {
    throw new BadRequestException({ code: 'INVALID_MODEL_ID', message: `非法的模型 id：${id}` })
  }
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 服务端额外校验（validateModel 之外的四层检查，见文件头注释） */
export function extraModelIssues(schema: ModelSchema): Issue[] {
  const issues: Issue[] = []

  if (schema.schemaVersion !== undefined && !isValidVersion(schema.schemaVersion)) {
    issues.push({
      code: 'E_SCHEMA_VERSION',
      severity: 'error',
      path: 'schemaVersion',
      message: `schemaVersion 必须是三段式（如 1.0.0）：${String(schema.schemaVersion)}`,
    })
  }

  schema.fields?.forEach((f, i) => {
    if (!f || typeof f.key !== 'string') return // 缺 key 由 validateModel 报 E_REQUIRED

    if (!FIELD_KEY_RE.test(f.key)) {
      issues.push({
        code: 'E_FIELD_KEY',
        severity: 'error',
        path: `fields[${i}].key`,
        message: `字段 key 只能是字母/数字/下划线且以字母开头：${f.key}`,
      })
    } else if ((RESERVED_FIELD_KEYS as readonly string[]).includes(f.key)) {
      issues.push({
        code: 'E_FIELD_KEY',
        severity: 'error',
        path: `fields[${i}].key`,
        message: `字段 key 是系统保留名：${f.key}`,
      })
    }

    if (f.type && !(FIELD_TYPES as readonly string[]).includes(f.type)) {
      issues.push({
        code: 'E_FIELD_TYPE',
        severity: 'error',
        path: `fields[${i}].type`,
        message: `不支持的字段类型：${String(f.type)}`,
      })
    }

    // expression 规则：保存前查语法（记录落库时 evalExpr 不会再遇语法错；与页面保存链路同源）
    f.rules?.forEach((r, ri) => {
      if (r?.type !== 'expression' || typeof r.value !== 'string') return
      const res = checkExpr(r.value)
      if (!res.ok) {
        issues.push({
          code: 'E_EXPR_SYNTAX',
          severity: 'error',
          path: `fields[${i}].rules[${ri}]`,
          message: `校验表达式语法错误：${res.message ?? r.value}`,
        })
      }
    })
  })

  return issues
}

function toResponse(entity: ModelEntity): ModelResponse {
  return {
    ...entity.schema,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
  }
}

@Injectable()
export class ModelService {
  constructor(
    @Inject(MODEL_REPOSITORY) private readonly repo: ModelRepository,
    @Inject(RbacService) private readonly rbac: RbacService,
  ) {}

  /** 模型摘要列表（按更新时间倒序） */
  async listSummaries(): Promise<ModelSummary[]> {
    const all = await this.repo.list()
    return all
      .map((e) => ({
        id: e.schema.id,
        name: e.schema.name,
        code: e.schema.code,
        type: e.schema.type,
        fieldCount: Array.isArray(e.schema.fields) ? e.schema.fields.length : 0,
        updatedAt: e.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** 读取完整定义 */
  async get(id: string): Promise<ModelResponse> {
    return toResponse(await this.mustFind(id))
  }

  /** 保存定义（upsert：不存在即建档，与页面 saveDraft 同语义） */
  async save(id: string, body: unknown, user: AuthUser): Promise<ModelSaveResponse> {
    assertModelId(id)
    if (!isPlainObject(body)) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: '模型定义必须是 JSON 对象' })
    }

    // 剥掉响应侧字段（客户端常把 GET 结果原样 PUT 回来），协议体只留 schema 语义
    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      createdBy: _createdBy,
      updatedBy: _updatedBy,
      validation: _validation,
      ...raw
    } = body
    if (raw.id !== undefined && raw.id !== id) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: `body.id（${String(raw.id)}）与路径 id（${id}）不一致`,
      })
    }

    const schema = { ...raw, id } as ModelSchema
    if (schema.schemaVersion === undefined) schema.schemaVersion = '1.0.0'

    const base = validateModel(schema)
    const errors = [...base.errors, ...extraModelIssues(schema)]
    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'MODEL_INVALID',
        message: '模型定义校验未通过',
        errors,
        warnings: base.warnings,
      })
    }

    const now = new Date().toISOString()
    const prev = await this.repo.find(id)
    // 写权限：新建放行；已存在模型要求创建者本人或 '*' 管理员。
    await this.assertWritable(prev, user, id)
    const entity: ModelEntity = {
      schema,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      createdBy: prev?.createdBy ?? user.username,
      updatedBy: user.username,
    }
    await this.repo.save(id, entity)

    return { ...toResponse(entity), validation: { valid: true, warnings: base.warnings } }
  }

  /* ------------------------------ 内部 ------------------------------ */

  private async mustFind(id: string): Promise<ModelEntity> {
    assertModelId(id)
    const entity = await this.repo.find(id)
    if (!entity) {
      throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: `数据模型 ${id} 不存在` })
    }
    return entity
  }

  /**
   * 模型写权限：新建（prev 为 null）放行；已存在模型要求创建者本人或 '*' 管理员。
   * 口径与页面 `PageService.assertWritable` 一致。
   */
  private async assertWritable(
    prev: ModelEntity | null | undefined,
    user: AuthUser,
    modelId: string,
  ): Promise<void> {
    if (!prev) return
    const perms = await this.rbac.permsOf(user)
    if (perms.includes(WILDCARD)) return
    if (prev.createdBy === user.username) return
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: `仅模型创建者或管理员可编辑模型 ${modelId}`,
    })
  }
}
