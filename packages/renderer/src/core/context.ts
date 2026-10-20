/**
 * 页面数据上下文（运行时的"单一数据源"）。
 *
 * 所有表达式求值都以本 context 作为 scope（顶层键：formData/appData/globalData/
 * user/urlParams/ds），因此 `formData.amount`、`user.name`、`ds.dsList.data` 可直接引用。
 *
 * 写入统一走 setField —— 它会触发 ① 联动脏检查 ② 单字段即时校验。
 */
import type { Scope } from '@lc/expression'
import type { DataSourceState } from './types.js'
import { getByPath, setByPath, rootOf } from './path.js'

export interface PageContextData {
  formData: Record<string, unknown>
  appData: Record<string, unknown>
  globalData: Record<string, unknown>
  user: Record<string, unknown>
  urlParams: Record<string, unknown>
  ds: Record<string, DataSourceState>
}

export interface SetFieldInfo {
  /** 完整字段路径，如 `amount` 或 `items[0].name` */
  name: string
  /** 影响的根作用域，如 `formData` */
  root: string
  value: unknown
}

export interface PageContext {
  /** 直接暴露的数据（作为表达式 scope 的组成部分） */
  readonly data: PageContextData
  /** 表达式求值作用域 */
  readonly scope: Scope
  /** 读取 formData 字段（支持 a.b / a[0]） */
  get(name: string): unknown
  /** 写入 formData 字段并触发联动 + 校验 */
  set(name: string, value: unknown): void
  /** 批量写入（只触发一次联动与校验） */
  patch(values: Record<string, unknown>): void
  /** 重置表单数据 */
  reset(values?: Record<string, unknown>): void
  /** 订阅字段变更，返回取消订阅函数 */
  onFieldChange(fn: (info: SetFieldInfo) => void): () => void
  /** 为 loop 迭代构造局部作用域（注入 item / index），不修改原 scope */
  withLocals(locals: Record<string, unknown>): Scope
}

export interface CreateContextOptions {
  /** 页面 defaultFormData */
  defaultFormData?: Record<string, unknown>
  appData?: Record<string, unknown>
  globalData?: Record<string, unknown>
  user?: Record<string, unknown>
  urlParams?: Record<string, unknown>
}

export function createPageContext(opts: CreateContextOptions = {}): PageContext {
  const data: PageContextData = {
    formData: { ...(opts.defaultFormData ?? {}) },
    appData: opts.appData ?? {},
    globalData: opts.globalData ?? {},
    user: opts.user ?? {},
    urlParams: opts.urlParams ?? {},
    ds: {},
  }

  const listeners = new Set<(info: SetFieldInfo) => void>()

  // scope 与 data 分离：scope 是稳定的引用，loop 局部作用域在其上派生
  const scope: Scope = data as unknown as Scope

  function emit(info: SetFieldInfo): void {
    for (const fn of listeners) {
      try {
        fn(info)
      } catch {
        // 单个订阅者出错不应中断其他订阅者
      }
    }
  }

  function set(name: string, value: unknown): void {
    if (!name) return
    setByPath(data.formData, name, value)
    // root 固定为数据域 formData —— 与表达式 refs() 返回的根变量对齐，联动才能匹配
    emit({ name, root: 'formData', value })
  }

  return {
    data,
    scope,
    get: (name) => getByPath(data.formData, name),
    set,
    patch(values) {
      const touched: SetFieldInfo[] = []
      for (const [name, value] of Object.entries(values)) {
        setByPath(data.formData, name, value)
        touched.push({ name, root: rootOf(name), value })
      }
      // 批量：合并成一次域级通知，避免一次输入触发 N 次联动
      const merged: SetFieldInfo = { name: '', root: 'formData', value: undefined }
      for (const t of touched) {
        merged.name = merged.name ? `${merged.name},${t.name}` : t.name
        merged.value = t.value
      }
      if (touched.length > 0) emit(merged)
    },
    reset(values) {
      for (const k of Object.keys(data.formData)) delete data.formData[k]
      Object.assign(data.formData, values ?? opts.defaultFormData ?? {})
      emit({ name: '*', root: 'formData', value: data.formData })
    },
    onFieldChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    withLocals(locals) {
      return Object.assign(Object.create(null), scope, locals) as Scope
    },
  }
}
