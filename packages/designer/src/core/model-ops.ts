/**
 * 模型编辑纯函数（Phase 2 批 1 / D-P2-1）。
 *
 * 与 schema-ops 同纪律：**视图只发意图，本模块是唯一执行者** ——
 * 字段行的增删改/排序全部在这里完成，返回新对象（结构共享，Vue 响应式生效）。
 *
 * 保存门禁直接复用协议 `validateModel`（与服务端**同一个校验器** —— 单一事实源，
 * 前端拦下的与服务端会拒的严格一致）；另补模型 id 格式检查（对齐服务端
 * `MODEL_ID_RE`，validateModel 不查 id 格式）。
 */
import type { EnumOption, FieldSchema, FieldType, ModelSchema } from '@lc/schema'
import { validateModel } from '@lc/schema'

/** 可选字段类型（协议 FieldType 全集；面板下拉渲染源。`id` 主键由平台自动补充，不给手选） */
export const FIELD_TYPES: readonly FieldType[] = [
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

/** 模型 id 白名单（与服务端 `MODEL_ID_RE` 对齐：字母/下划线开头，字母数字下划线连字符，≤64） */
export const MODEL_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

/** 生成不重复字段 key：f1 / f2 / …（扫现有 keys，取最小可用序号） */
export function nextFieldKey(fields: FieldSchema[]): string {
  const used = new Set(fields.map((f) => f.key))
  for (let i = 1; ; i += 1) {
    const k = `f${i}`
    if (!used.has(k)) return k
  }
}

/** 空白字段行（新增一行的初始态；key 由 nextFieldKey 生成） */
export function blankField(key: string): FieldSchema {
  return { key, name: '', type: 'string' }
}

/** 新模型骨架（id 即物理表名 code；保存时服务端 upsert 建档） */
export function blankModel(id: string): ModelSchema {
  return {
    schemaVersion: '1.0.0',
    id,
    name: '',
    code: id,
    fields: [blankField('f1')],
  }
}

/** 追加字段行（末尾）；返回新 model 与新 key（调用方可用作聚焦提示） */
export function addField(m: ModelSchema): { model: ModelSchema; key: string } {
  const key = nextFieldKey(m.fields)
  return { model: { ...m, fields: [...m.fields, blankField(key)] }, key }
}

/** 删除字段行（按 key；key 不存在 = 原样返回） */
export function removeField(m: ModelSchema, key: string): ModelSchema {
  const i = m.fields.findIndex((f) => f.key === key)
  if (i < 0) return m
  return { ...m, fields: m.fields.filter((f) => f.key !== key) }
}

/** 字段行上下移（首行上移 / 末行下移 / key 不存在 = no-op 原样返回） */
export function moveField(m: ModelSchema, key: string, dir: -1 | 1): ModelSchema {
  const i = m.fields.findIndex((f) => f.key === key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= m.fields.length) return m
  const fields = [...m.fields]
  const tmp = fields[i]!
  fields[i] = fields[j]!
  fields[j] = tmp
  return { ...m, fields }
}

/**
 * 更新字段行（key 为**定位键**（编辑前的旧 key），patch 应用到该行 —— 支持改 key 本身）。
 * type 切到 enum 且尚无 options → 初始化一个占位选项（校验器要求 enum 必须有 options）。
 */
export function updateField(m: ModelSchema, key: string, patch: Partial<FieldSchema>): ModelSchema {
  const fields = m.fields.map((f) => {
    if (f.key !== key) return f
    const next: FieldSchema = { ...f, ...patch }
    if (patch.type === 'enum' && (!next.options || next.options.length === 0)) {
      next.options = [{ label: '选项1', value: 'option1' }]
    }
    return next
  })
  return { ...m, fields }
}

/**
 * 解析枚举选项编辑串：`标签|值,标签|值` → EnumOption[]。
 * 每段 trim，空段跳过；无 `|` 时 label = value = 原文。
 */
export function parseOptions(text: string): EnumOption[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const i = seg.indexOf('|')
      if (i < 0) return { label: seg, value: seg }
      const label = seg.slice(0, i).trim()
      const value = seg.slice(i + 1).trim()
      return { label: label || value, value: value || label }
    })
    .filter((o) => o.value !== '')
}

/** 反序列化 options → 编辑串（label = value 时只输出 value；空 options → ''） */
export function formatOptions(options: EnumOption[] | undefined): string {
  return (options ?? [])
    .map((o) => (String(o.label) === String(o.value) ? String(o.value) : `${o.label}|${o.value}`))
    .join(',')
}

/**
 * 保存门禁：返回错误文案列表（空 = 可保存）。
 * ① 模型 id 格式（对齐服务端 MODEL_ID_RE —— validateModel 不查，提前拦避免 PUT 被 400 拒）；
 * ② 协议 validateModel 的 **errors**（warnings 不拦：缺展示名 / 缺主键字段是提示级）。
 */
export function modelErrors(m: ModelSchema): string[] {
  const out: string[] = []
  if (!MODEL_ID_RE.test(m.id)) out.push(`非法的模型 id：${m.id}`)
  out.push(...validateModel(m).errors.map((e) => e.message))
  return out
}
