/**
 * 生命周期调度 + 受信任副作用 API（`app.*`）。
 *
 * 页面三钩子（见《落地方案》3.1）：
 *  - `onInit`  构造完成后立即执行（设置默认值、读路由参数）
 *  - `onMount` 首次渲染前执行（发起 trigger=init 的数据源）
 *  - `onSubmit` 提交校验通过后、写库前执行（补默认值、计算字段）
 *
 * 钩子体是**表达式**，由 @lc/expression 执行。表达式本身**禁止赋值**（3.4），
 * 因此「设置默认值」通过调用**受信任的 `app` 方法**完成（3.4 作用域表中的「方法对象」）：
 *
 * ```jsonc
 * "lifecycle": {
 *   "onInit":  "app.setFormData({ applicant: user.name })",
 *   "onMount": ["app.loadDs('ds_dept')", "app.toast('已就绪')"],
 *   "onSubmit": null
 * }
 * ```
 *
 * 安全边界（这是 D-7 选型 C 的核心理由）：
 *  - `app` 被 `markTrusted`，绕过方法白名单 —— 但 `FORBIDDEN_KEYS` 19 项原型攻击拦截**依然生效**；
 *  - `app` **只注入生命周期求值上下文**，`props` / `condition` 等渲染期表达式拿不到它，
 *    因此渲染期表达式保持 100% 纯净，不会出现「一个条件表达式弹 N 次 toast」的渲染风暴。
 *
 * 钩子出错只记录并继续 —— 绝不因业务配置错误导致页面无法打开。
 */
import { evalExpr, markTrusted, type Scope } from '@lc/expression'
import type { PageContext } from './context.js'
import type { RuntimeHost, NavigateTarget, ToastOptions } from './types.js'

/* ------------------------------------------------------------------ */
/* app.* API                                                            */
/* ------------------------------------------------------------------ */

/** 生命周期内可用的取数能力（由 DataSourceRunner 结构性满足，避免循环依赖） */
export interface DsLoader {
  load(id: string, params?: Record<string, unknown>): Promise<unknown>
}

export interface LifecycleDeps {
  ctx: PageContext
  host: Pick<RuntimeHost, 'toast' | 'navigate' | 'back' | 'confirm'>
  ds: DsLoader
}

/**
 * 生命周期表达式中可调用的宿主 API（`app.xxx`）。
 * **清单即白名单**：新增能力必须在此显式声明，不得暴露任意宿主句柄。
 */
export interface AppApi {
  /** 写表单字段：`app.setFormData({ a: 1, b: 2 })` 或 `app.setFormData('a', 1)`（方案 3.1 两种写法都支持） */
  setFormData(values: Record<string, unknown>): void
  setFormData(key: string, value: unknown): void
  /** 读表单字段（支持 a.b / a[0]） */
  getFormData(path: string): unknown
  /** 写应用级共享数据：`app.setAppData({ k: v })` 或 `app.setAppData('k', v)` */
  setAppData(values: Record<string, unknown>): void
  setAppData(key: string, value: unknown): void
  /** 触发数据源取数（返回 Promise；作为钩子顶层调用时会被 await） */
  loadDs(id: string, params?: Record<string, unknown>): Promise<unknown>
  /** 轻提示 */
  toast(text: string, icon?: ToastOptions['icon']): Promise<void>
  /** 页面跳转 */
  navigate(pageId: string, params?: Record<string, unknown>, mode?: NavigateTarget['mode']): Promise<void>
  /** 返回上一页 */
  back(): Promise<void>
  /** 模态确认 */
  confirm(text: string): Promise<boolean>
}

/** 创建 `app` API 实例（未 markTrusted —— 请用 createLifecycleScope 注入） */
export function createAppApi(deps: LifecycleDeps): AppApi {
  const { ctx, host, ds } = deps

  /** 双参 / 对象参两种写法归一到 patch */
  function write(target: 'formData' | 'appData', a: unknown, b?: unknown): void {
    if (typeof a === 'string') {
      if (a) {
        if (target === 'formData') ctx.set(a, b)
        else ctx.data.appData[a] = b
      }
      return
    }
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      const values = a as Record<string, unknown>
      if (target === 'formData') ctx.patch(values)
      else Object.assign(ctx.data.appData, values)
    }
  }

  return {
    setFormData: (a: unknown, b?: unknown) => write('formData', a, b),
    getFormData: (path) => ctx.get(path),
    setAppData: (a: unknown, b?: unknown) => write('appData', a, b),
    loadDs: (id, params) => ds.load(id, params),
    toast: (text, icon) => Promise.resolve(host.toast({ text, icon: icon ?? 'none' })),
    navigate: (pageId, params, mode) =>
      Promise.resolve(host.navigate({ pageId, params: params ?? {}, mode: mode ?? 'push' })),
    back: () => Promise.resolve(host.back()),
    confirm: (text) => host.confirm({ text }),
  }
}

/**
 * 构造生命周期求值作用域：在页面作用域之上注入受信任的 `app`。
 * **只有生命周期钩子应当使用本作用域**（渲染期表达式请继续用 `ctx.scope`）。
 */
export function createLifecycleScope(scope: Scope, deps: LifecycleDeps): Scope {
  return Object.assign(Object.create(null), scope, { app: markTrusted(createAppApi(deps)) })
}

/* ------------------------------------------------------------------ */
/* 钩子执行                                                            */
/* ------------------------------------------------------------------ */

export type HookName = 'onInit' | 'onMount' | 'onSubmit'

/** 钩子体：单表达式，或按序执行的表达式数组（协议 PageLifecycle 支持两者） */
export type HookBody = string | string[] | undefined | null

export interface HookResult {
  hook: HookName
  ok: boolean
  /** 数组形式时为第几步（从 0 起），单表达式时省略 */
  step?: number
  error?: string
}

export type HookReporter = (r: HookResult) => void

/** 执行单个生命周期表达式（空则跳过） */
export async function runHook(
  hook: HookName,
  expr: HookBody,
  scope: Scope,
  report?: HookReporter,
): Promise<HookResult[]> {
  const list = normalizeHook(expr)
  if (list.length === 0) {
    const skipped: HookResult = { hook, ok: true }
    report?.(skipped)
    return [skipped]
  }

  const results: HookResult[] = []
  for (let i = 0; i < list.length; i++) {
    const body = list[i]
    const step = list.length > 1 ? i : undefined
    try {
      // await 顶层结果：`app.loadDs(...)` 等异步副作用会在钩子里被等待
      await evalExpr(body, scope)
      const ok: HookResult = { hook, ok: true, step }
      results.push(ok)
      report?.(ok)
    } catch (error) {
      const failed: HookResult = {
        hook,
        ok: false,
        step,
        error: error instanceof Error ? error.message : String(error),
      }
      results.push(failed)
      report?.(failed)
      // 单步失败不中断后续步骤：各步多为独立初始化，宁可部分成功也不整体不可用
    }
  }
  return results
}

/** 按顺序执行多组钩子（如先 onInit 再 onMount） */
export async function runHooks(
  hooks: Array<[HookName, HookBody]>,
  scope: Scope,
  report?: HookReporter,
): Promise<HookResult[]> {
  const out: HookResult[] = []
  for (const [name, body] of hooks) {
    out.push(...(await runHook(name, body, scope, report)))
  }
  return out
}

/** 归一化钩子体为空数组 / 空串时返回 []（不执行） */
export function normalizeHook(expr: HookBody): string[] {
  if (!expr) return []
  const list = Array.isArray(expr) ? expr : [expr]
  return list.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
}
