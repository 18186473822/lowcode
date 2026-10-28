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
 * **模型即模块**（2026-10-28，对齐云程「一个模型 = 一套业务界面」）：
 * 实际使用中三页是一起要的 —— 列表点行进详情、详情返回列表、表单提交成功回列表。
 * 所以除单页 `buildModelPage` 外，还提供 `buildModelModule`：一次生成
 * `p_<base>_list` / `p_<base>_form` / `p_<base>_detail` 并按上述规则把跳转接好；
 * 只生成其中几页时不写悬空跳转。页面落盘与模型 `listPageId` / `formPageId`
 * 回写由 store 的 `createModelModule` 负责。
 *
 * **门户页**不依赖模型：`buildPortalPage` 只生成 `type=portal` 的空骨架
 * （`portal.cards = []` + 排序 / 备注），卡片与拖拽区由设计器里再配。
 *
 * 纯函数、无副作用，store 只负责取模型与替换当前 schema —— 生成规则可单测。
 */
import type {
  FieldSchema,
  FieldType,
  ModelSchema,
  NodeSchema,
  PageSchema,
  PortalPageConfig,
} from '@lc/schema'
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

/* ---------------- 模型即模块：一次生成成组页面（2026-10-28） ---------------- */

/**
 * 模块前缀规范化：`m_leave` / `p_leave_list` / `leave` 都归一成 `leave`。
 *
 * 生成的三张页面 id 统一是 `p_<base>_<type>`，所以输入里常见的 `p_` 前缀与
 * `_list` / `_form` / `_detail` 尾巴要先剥掉，否则会得到 `p_p_leave_list_list`。
 */
export function moduleBase(raw: string): string {
  let s = raw.trim().replace(/^p_/i, '')
  s = s.replace(/_(list|form|detail)$/i, '')
  s = s.replace(/[^\w-]/g, '_')
  if (!s) return ''
  // 与服务端 PAGE_ID_RE 对齐：必须以字母或下划线开头
  if (!/^[A-Za-z_]/.test(s)) s = `p_${s}`
  return s
}

/** 模块三页的页面 id（不校验合法性，调用方保证 base 已规范化） */
export function modulePageIds(base: string): Record<ModelPageType, string> {
  return {
    list: `p_${base}_list`,
    form: `p_${base}_form`,
    detail: `p_${base}_detail`,
  }
}

export interface BuildModelModuleInput {
  model: ModelSchema
  /** 模块前缀（未规范化也可，内部会剥 p_ / _list 等尾巴） */
  base: string
  /** 只生成其中几页；缺省三页全生成 */
  types?: readonly ModelPageType[]
  /** 覆盖页面 id（缺省按 base 推导） */
  ids?: Partial<Record<ModelPageType, string>>
}

export interface ModelModule {
  base: string
  ids: Record<ModelPageType, string>
  /** 固定 list → form → detail 顺序，仅含请求的类型 */
  pages: PageSchema[]
}

/**
 * 「一个模型 = 一套业务界面」：一次生成列表 / 表单 / 详情，并把它们串起来。
 *
 * 串联规则（与云程的模块页一致）：
 *  - 列表点行进详情 → `list.detailPageId`
 *  - 详情返回列表   → `detail.backPageId`
 *  - 表单提交成功回列表 → `submit.successAction = navigate(list, redirect)`
 *
 * 只生成单页时对应跳转不写 —— 悬空指针比没有更糟。
 */
export function buildModelModule(input: BuildModelModuleInput): ModelModule {
  const base = moduleBase(input.base)
  const wanted = new Set<ModelPageType>(input.types ?? MODEL_PAGE_TYPES)
  const ids = { ...modulePageIds(base), ...(input.ids ?? {}) }
  const pages: PageSchema[] = []
  const label = input.model.name || base

  if (wanted.has('list')) {
    const page = buildModelPage({ pageId: ids.list, type: 'list', model: input.model })
    page.name = label
    if (wanted.has('detail')) page.list = { ...page.list!, detailPageId: ids.detail }
    pages.push(page)
  }

  if (wanted.has('form')) {
    const page = buildModelPage({ pageId: ids.form, type: 'form', model: input.model })
    page.name = `新建${label}`
    if (wanted.has('list') && page.submit) {
      page.submit.successAction = {
        event: 'success',
        type: 'navigate',
        value: { pageId: ids.list, mode: 'redirect' },
      }
    }
    pages.push(page)
  }

  if (wanted.has('detail')) {
    const page = buildModelPage({ pageId: ids.detail, type: 'detail', model: input.model })
    page.name = `${label}详情`
    if (wanted.has('list')) page.detail = { ...page.detail!, backPageId: ids.list }
    pages.push(page)
  }

  return { base, ids, pages }
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

/* ---------------- 门户页：清单里新建的 portal 页骨架（2026-10-28） ---------------- */

export interface BuildPortalPageInput {
  pageId: string
  /** 展示名（空则退回 pageId） */
  name?: string
  /** 清单排序（小的在前） */
  order?: number
  /** 清单备注（运营说明） */
  remark?: string
  /** 卡片列数，缺省 4（对齐云程「常用流程」四宫格） */
  columns?: number
}

/**
 * 门户页骨架：只建一份**空门户**（无卡片、无节点），由设计器里再拖 / 配。
 *
 * 为什么不复用 `buildModelPage`：门户不绑定数据模型，卡片是运营配置；
 * 这里只保证 `type=portal` + `portal.cards` 存在，过 `validatePage` 即可保存。
 */
export function buildPortalPage(input: BuildPortalPageInput): PageSchema {
  const name = input.name?.trim() || input.pageId
  const portal: PortalPageConfig = {
    title: name,
    columns: input.columns ?? 4,
    cards: [],
  }
  if (input.order !== undefined) portal.order = input.order
  if (input.remark?.trim()) portal.remark = input.remark.trim()
  return {
    schemaVersion: '1.0.0',
    id: input.pageId,
    name,
    type: 'portal',
    root: { id: 'root', componentName: 'Page', children: [] },
    portal,
  }
}
