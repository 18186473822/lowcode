/**
 * page-builder.ts —— 在数据模型基础上生成页面（2026-10-28）
 *
 * 产品口径：**先有模型，再建页面**。新建页面时选定模型与用途（表单 / 列表 / 详情），
 * 由本模块生成可直接编辑的 PageSchema：
 *
 *  - form   ：按模型字段生成输入控件 + 「提交」按钮，并写入 `dataSources` / `submit` 绑定；
 *  - list   ：写入 `list.modelId` 与 `columns`（模型字段）；
 *  - detail ：写入 `detail.modelId` 与 `fields`（模型字段）。
 *
 * 纯函数、无副作用，store 只负责取模型与替换当前 schema —— 生成规则可单测。
 */
import type { FieldSchema, FieldType, ModelSchema, NodeSchema, PageSchema } from '@lc/schema'
import { SUBMIT_DS_ID } from './schema-ops'

/** 允许从模型生成的页面类型（门户 / 自定义页不依赖模型，不在本流程内） */
export const MODEL_PAGE_TYPES = ['form', 'list', 'detail'] as const
export type ModelPageType = (typeof MODEL_PAGE_TYPES)[number]

export const MODEL_PAGE_TYPE_LABEL: Record<ModelPageType, string> = {
  form: '表单页',
  list: '列表页',
  detail: '详情页',
}

export const MODEL_PAGE_TYPE_HINT: Record<ModelPageType, string> = {
  form: '按模型字段生成输入控件与提交按钮，提交时新建一条记录',
  list: '按模型字段生成列表列，运行时查询并分页展示记录',
  detail: '按模型字段生成详情项，运行时用路由参数 rid 定位单条记录',
}

/** 模型字段 → 物料组件（与 packages/materials 的注册名一致） */
const FIELD_COMPONENT: Record<FieldType, string> = {
  id: 'Input',
  string: 'Input',
  text: 'Textarea',
  number: 'NumberInput',
  money: 'MoneyInput',
  boolean: 'Switch',
  date: 'DatePicker',
  datetime: 'DateTimePicker',
  enum: 'Select',
  relation: 'Select',
  file: 'FileUpload',
  user: 'UserPicker',
  dept: 'DeptPicker',
  location: 'Input',
  json: 'Textarea',
}

export interface BuildModelPageInput {
  pageId: string
  type: ModelPageType
  model: ModelSchema
}

/** 表单里可编辑的字段：排除主键与自动生成列（auto 由服务端填） */
function formFields(model: ModelSchema): FieldSchema[] {
  return (model.fields ?? []).filter((f) => f.type !== 'id' && !f.auto)
}

/** 列表 / 详情可展示的字段：保留主键，排除自动生成列 */
function displayFields(model: ModelSchema): FieldSchema[] {
  return (model.fields ?? []).filter((f) => !f.auto)
}

/** 控件属性：绑定 formData.<key>，并带上必填 / 占位 / 枚举选项 */
function fieldProps(field: FieldSchema): Record<string, unknown> {
  const props: Record<string, unknown> = {
    name: field.key,
    label: field.name || field.key,
    value: `$expr: formData.${field.key}`,
  }
  if (field.required) props.required = true
  if (field.placeholder) props.placeholder = field.placeholder
  if (field.type === 'enum' && field.options?.length) {
    props.options = field.options.map((o) => ({ label: o.label, value: o.value }))
  }
  if (field.type === 'relation') {
    props.placeholder = field.placeholder ?? `选择${field.refModel ?? '关联记录'}`
  }
  if (field.type === 'money') props.prefix = '¥'
  if (field.type === 'file' && field.maxCount) props.maxCount = field.maxCount
  return props
}

/** 表单初始值：布尔 false、多值 []，其余用模型默认值或空串 */
function fieldDefault(field: FieldSchema): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.type === 'boolean') return false
  if (field.type === 'file') return []
  return ''
}

/**
 * 生成页面。
 *
 * 注意：节点 id 用 `n_<field.key>`。模型字段 key 在协议里是合法标识符，
 * 与根节点 `root` 不会冲突；重名由模型校验（validateModel）提前拦截。
 */
export function buildModelPage(input: BuildModelPageInput): PageSchema {
  const { pageId, type, model } = input
  const root: NodeSchema = { id: 'root', componentName: 'Page', children: [] }
  const schema: PageSchema = {
    schemaVersion: '1.0.0',
    id: pageId,
    name: pageId,
    type,
    root,
  }

  if (type === 'form') {
    const fields = formFields(model)
    const children: NodeSchema[] = fields.map((field) => ({
      id: `n_${field.key}`,
      componentName: FIELD_COMPONENT[field.type] ?? 'Input',
      props: fieldProps(field),
    }))
    children.push({
      id: 'n_submit',
      componentName: 'Button',
      props: { text: '提交', type: 'primary' },
      actions: [{ event: 'click', type: 'submit' }],
    })
    root.children = children
    schema.dataSources = [
      { id: SUBMIT_DS_ID, name: '提交', type: 'model', method: 'POST', modelId: model.id },
    ]
    schema.submit = { dataSourceId: SUBMIT_DS_ID }
    schema.defaultFormData = Object.fromEntries(fields.map((f) => [f.key, fieldDefault(f)]))
    return schema
  }

  const keys = displayFields(model).map((f) => f.key)
  if (type === 'list') {
    schema.list = { modelId: model.id, columns: keys }
  } else {
    schema.detail = { modelId: model.id, fields: keys }
  }
  return schema
}
