/**
 * 渲染引擎的对外接口契约。
 *
 * 关键设计：**纯逻辑层不依赖 uni-app** —— 所有副作用（toast / 路由 / 网络 / 剪贴板…）
 * 都通过 RuntimeHost 注入，因此核心逻辑可以在 Node 下 100% 单测。
 */
import type { PageSchema, NodeSchema, DataSourceSchema, Rule, Action } from '@lc/schema'

/* ------------------------------------------------------------------ */
/* 宿主适配器                                                          */
/* ------------------------------------------------------------------ */

export interface ToastOptions {
  text: string
  icon?: 'success' | 'error' | 'none'
  duration?: number
}

export interface NavigateTarget {
  pageId: string
  params?: Record<string, unknown>
  mode?: 'push' | 'redirect' | 'switchTab'
}

export interface HttpRequest {
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  data?: unknown
  timeout?: number
}

export interface HttpResponse<T = unknown> {
  statusCode: number
  data: T
}

/**
 * 宿主能力接口。uni-app 端由 `uni/*` 组件实现，测试中用 mock 实现。
 * 标 `?` 的方法为可选能力，未实现时对应动作会得到友好的降级提示。
 */
export interface RuntimeHost {
  /** 轻提示 */
  toast(opts: ToastOptions): void | Promise<void>
  /** 模态确认，返回是否确认 */
  confirm(opts: { text: string; confirmText?: string; cancelText?: string }): Promise<boolean>
  /** 页面跳转（pageId 而非硬编码路径，路由由宿主解析） */
  navigate(target: NavigateTarget): void | Promise<void>
  /** 返回上一页 */
  back(): void | Promise<void>
  /** 网络请求 */
  request(req: HttpRequest): Promise<HttpResponse>
  /** 复制到剪贴板 */
  copy?(text: string): void | Promise<void>
  /** 扫码，返回扫码结果或 null */
  scan?(): Promise<string | null>
  /** 拨号 */
  callPhone?(number: string): void | Promise<void>
  /** 获取定位 */
  getLocation?(): Promise<{ latitude: number; longitude: number } | null>
  /** 打开内置对话框（模板 id） */
  openDialog?(template: string): void | Promise<void>
}

/**
 * 表单草稿存储（Phase 3 批 3 / D-P3-7）。
 *
 * 键名与存储介质**归宿主**（uni storage / 内存 / 测试 spy）；controller 只管**时机**：
 * 字段变更 → `save`；`onMount` → `load` + 确认后回填；提交成功 / `reset` → `clear`。
 * 未注入 = 草稿禁用（画布、标准页 list/detail、存量宿主零影响）。
 */
export interface DraftStore {
  load(): Promise<Record<string, unknown> | null> | Record<string, unknown> | null
  save(data: Record<string, unknown>): void | Promise<void>
  clear(): void | Promise<void>
}

/* ------------------------------------------------------------------ */
/* 数据源状态                                                          */
/* ------------------------------------------------------------------ */

export type DataSourceStatus = 'idle' | 'loading' | 'success' | 'error'

export interface DataSourceState<T = unknown> {
  id: string
  status: DataSourceStatus
  loading: boolean
  data: T
  error: string | null
  /** 最近一次成功的取数时间戳 */
  updatedAt: number | null
}

/* ------------------------------------------------------------------ */
/* 校验结果                                                            */
/* ------------------------------------------------------------------ */

export interface FieldError {
  /** 组件节点 id */
  nodeId: string
  /** formData 字段名 */
  name: string
  message: string
  rule: Rule['type']
}

export interface ValidateResult {
  valid: boolean
  errors: FieldError[]
  /** 第一个出错字段（供滚动定位） */
  firstError?: FieldError
}

/* ------------------------------------------------------------------ */
/* 联动                                                                */
/* ------------------------------------------------------------------ */

/** 脏节点：需要重新计算 condition / 表达式 的节点 */
export type DirtySet = Set<string>

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

export type LifecycleHook = 'onInit' | 'onMount' | 'onSubmit'

/* ------------------------------------------------------------------ */
/* 渲染树                                                              */
/* ------------------------------------------------------------------ */

/** 归一化后的渲染节点（buildTree 产物） */
export interface RenderNode {
  id: string
  componentName: string
  /** 原始 props（表达式值在渲染期单独解析） */
  props: Record<string, unknown>
  style?: NodeSchema['style']
  condition?: string | boolean
  loop?: string
  loopArgs?: [string, string]
  actions?: Action[]
  perm?: string
  children: RenderNode[]
  /** 来源：静态节点或 loop 展开项 */
  loopIndex?: number
}

/** 展开后带可见性的节点（供组件模板渲染） */
export interface ResolvedNode {
  node: RenderNode
  /** 已解析的 props（`$expr:` 占位已求值，loop 局部变量已注入） */
  props: Record<string, unknown>
  /** 自身与全部祖先的可见性（父不可见则子必不可见） */
  visible: boolean
  /** condition 求值出错时为 true（页面不白屏，但需埋点） */
  exprError?: boolean
  /** 当前字段校验错误（若有） */
  error?: string
  /** loop 展开时的迭代变量 */
  item?: unknown
  index?: number
  children: ResolvedNode[]
}

export type { PageSchema, NodeSchema, DataSourceSchema, Rule, Action }
