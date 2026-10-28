import type { NodeSchema, Action } from './node.js'

/** 页面类型。form/list/detail 为配置化标准页，portal 门户，custom 自由拖拽页。 */
export type PageType = 'form' | 'list' | 'detail' | 'portal' | 'custom'

/** 数据源类型。 */
export type DataSourceType = 'http' | 'model' | 'static' | 'formula'

/** 页面数据源配置。 */
export interface DataSourceSchema {
  id: string
  name: string
  type: DataSourceType
  /** type=http 时有效 */
  method?: 'GET' | 'POST'
  url?: string
  /** type=model 时有效：对哪个数据模型操作 */
  modelId?: string
  /** type=static 时有效 */
  data?: unknown
  /** 参数（值可为 $expr: 前缀表达式） */
  params?: Record<string, unknown>
  /** 取数后的转换表达式 */
  transform?: string
  /** 取哪段数据作为结果，如 data.list */
  resultPath?: string
  cache?: { enable: boolean; ttl: number }
  trigger?: 'init' | 'manual' | `watch:${string}`
}

/** 生命周期钩子（值为表达式；数组表示按序多步执行） */
export type LifecycleHook = string | string[]

/** 生命周期钩子（值均为表达式） */
export interface PageLifecycle {
  onInit?: LifecycleHook
  onMount?: LifecycleHook
  onSubmit?: LifecycleHook
}

/** 提交配置。 */
export interface PageSubmit {
  dataSourceId: string
  successToast?: string
  successAction?: Action
}

/** type=list 的标准化列表页配置（企业级最高频页面，无需拖拽）。 */
export interface ListPageConfig {
  modelId: string
  /** 过滤条件：字段 → 表达式 */
  filter?: Record<string, string>
  sort?: Array<{ field: string; order: 'asc' | 'desc' }>
  /** 展示字段（对应模型字段 key） */
  columns?: string[]
  /** 卡片子树 */
  cardTemplate?: NodeSchema
  pagination?: { mode: 'scroll' | 'page'; size: number }
  pullDown?: boolean
  search?: { fields: string[]; placeholder?: string }
  detailPageId?: string
  /**
   * 允许列表行内编辑（缺省 false）。编辑器只覆盖 `columns`（缺省模型全部字段），
   * 保存走 PUT + If-Match；409 不覆盖他人修改。
   */
  editable?: boolean
  /** 允许勾选批量删除（缺省 false）。每行 DELETE 均带该行 revision 构造的 If-Match。 */
  deletable?: boolean
}

/** type=detail 的标准化详情页配置（由路由参数 rid 定位单条记录，Phase 2 批 2）。 */
export interface DetailPageConfig {
  modelId: string
  /** 展示字段（缺省 = 模型全部字段） */
  fields?: string[]
  /** 点击行进入详情后，返回按钮的目标列表页（缺省 = 历史栈返回） */
  backPageId?: string
  /**
   * 允许在详情页内编辑记录（缺省 false，存量详情页保持只读）。
   * 编辑只覆盖展示字段中非 readonly / auto 的项；保存走 PUT + If-Match。
   */
  editable?: boolean
  /** 允许在详情页内删除记录（缺省 false）。删除为服务端软删，走 DELETE + If-Match。 */
  deletable?: boolean
}

/** 门户页导航卡片（Phase 3 批 4）。 */
export interface PortalCard {
  /** 卡片标题（必填） */
  title: string
  /** 副标题 / 说明 */
  desc?: string
  /** 内置图标名（Icon 物料同款字符集） */
  icon?: string
  /** 点击跳转的低代码页面 id（与 url 二选一） */
  pageId?: string
  /** 点击打开的外部地址（与 pageId 二选一；仅 H5 生效） */
  url?: string
  /** 角标文案（如「3」/「新」） */
  badge?: string
}

/** type=portal 的门户页配置（卡片导航；与自由拖拽区 NodeSchema 树共存，Phase 3 批 4）。 */
export interface PortalPageConfig {
  /** 门户标题（缺省用页面 name） */
  title?: string
  /** 卡片列数（缺省 2；门户清单新建的页面默认 4 列宫格） */
  columns?: number
  /** 导航卡片（可空 = 纯拖拽门户） */
  cards: PortalCard[]
  /**
   * 门户清单排序（2026-10-28）：小的在前，缺省排在已设置之后。
   * 只是运营元数据，运行时不读。
   */
  order?: number
  /** 门户清单备注（运营说明，运行时不读） */
  remark?: string
}

/** 路由参数声明。 */
export interface PageParam {
  name: string
  required?: boolean
  default?: string
}

/** 页面协议。 */
export interface PageSchema {
  schemaVersion: string
  id: string
  name: string
  type: PageType
  meta?: {
    icon?: string
    theme?: string
    pullDownRefresh?: boolean
    navigationBar?: { display?: boolean; title?: string; style?: 'default' | 'custom' }
  }
  /** 组件树根节点 */
  root: NodeSchema
  dataSources?: DataSourceSchema[]
  lifecycle?: PageLifecycle
  submit?: PageSubmit
  list?: ListPageConfig
  params?: PageParam[]
  /** 初始表单数据 */
  defaultFormData?: Record<string, unknown>
  /** type=detail 的详情配置（批 2，与 list 对称） */
  detail?: DetailPageConfig
  /** type=portal 的门户配置（批 4；卡片导航 + 拖拽区共存） */
  portal?: PortalPageConfig
}
