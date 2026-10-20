/**
 * 动作执行器：把 Action 协议（15 种）变成真实副作用。
 *
 * 副作用全部走 RuntimeHost / DataSourceRunner 注入 —— 纯逻辑层零 uni 依赖，可单测。
 * 任何动作失败都只记录结果并继续（可配置 continueOnError），不抛异常打断事件链。
 */
import { evalExpr, safeEval, type Scope } from '@lc/expression'
import type { Action } from '@lc/schema'
import type { RuntimeHost } from './types.js'
import type { PageContext } from './context.js'
import type { DataSourceRunner } from './datasource.js'
import { resolveParams } from './datasource.js'

export interface ActionResult {
  type: Action['type']
  ok: boolean
  /** expression 动作的返回值 */
  value?: unknown
  error?: string
}

export interface ActionRuntime {
  ctx: PageContext
  host: RuntimeHost
  ds: DataSourceRunner
  /** submit 动作的处理器（由页面注入：校验 + 提交数据源） */
  /** 提交处理器：由 controller 注入 `submit()`；返回结果时透传成败（`ok` 缺省视为成功，兼容不返回结果的实现） */
  onSubmit?: () => Promise<{ ok?: boolean; error?: string } | void>
  /** 环境不支持某能力时的提示（默认用 host.toast） */
  onUnsupported?: (type: Action['type']) => void
}

export interface RunActionOptions {
  /** 节点级局部作用域（loop 展开项的 item/index） */
  scope?: Scope
  /** confirm 的 onOk 是否继续执行 */
  continueOnError?: boolean
}

/** 执行单个动作 */
export async function runAction(
  action: Action,
  rt: ActionRuntime,
  opts: RunActionOptions = {},
): Promise<ActionResult> {
  const scope = opts.scope ?? rt.ctx.scope
  try {
    switch (action.type) {
      case 'expression': {
        const value = evalExpr(String(action.value ?? ''), scope)
        return { type: 'expression', ok: true, value }
      }

      case 'setForm': {
        const values = resolveParams(action.value as Record<string, unknown>, scope)
        rt.ctx.patch(values)
        return { type: 'setForm', ok: true, value: values }
      }

      case 'setApp': {
        const values = resolveParams(action.value as Record<string, unknown>, scope)
        Object.assign(rt.ctx.data.appData, values)
        return { type: 'setApp', ok: true, value: values }
      }

      case 'toast': {
        await rt.host.toast({
          text: resolveTemplate(action.value.text, scope),
          icon: action.value.icon ?? 'none',
        })
        return { type: 'toast', ok: true }
      }

      case 'confirm': {
        const ok = await rt.host.confirm({ text: resolveTemplate(action.value.text, scope) })
        if (ok && action.value.onOk) {
          return runAction(action.value.onOk, rt, opts)
        }
        return { type: 'confirm', ok, value: ok }
      }

      case 'navigate': {
        await rt.host.navigate({
          pageId: action.value.pageId,
          params: resolveParams(action.value.params ?? {}, scope),
          mode: action.value.mode ?? 'push',
        })
        return { type: 'navigate', ok: true }
      }

      case 'back':
        await rt.host.back()
        return { type: 'back', ok: true }

      case 'datasource':
      case 'http': {
        const params = resolveParams(action.value.params ?? {}, scope)
        const data = await rt.ds.load(action.value.dsId, params)
        return { type: action.type, ok: data !== null, value: data, error: data === null ? '取数失败' : undefined }
      }

      case 'submit': {
        if (!rt.onSubmit) return { type: 'submit', ok: false, error: '未配置提交处理器' }
        const res = await rt.onSubmit()
        // 透传提交失败（校验不过 / 数据源报错），不再一律 ok:true —— 否则壳层无法把失败呈现给用户
        return { type: 'submit', ok: res?.ok ?? true, error: res?.error }
      }

      case 'dialog': {
        if (!rt.host.openDialog) return unsupported('dialog', rt)
        rt.host.openDialog(action.value.template)
        return { type: 'dialog', ok: true }
      }

      case 'copy': {
        if (!rt.host.copy) return unsupported('copy', rt)
        await rt.host.copy(resolveTemplate(action.value.expr, scope))
        return { type: 'copy', ok: true }
      }

      case 'scan': {
        if (!rt.host.scan) return unsupported('scan', rt)
        const text = await rt.host.scan()
        return { type: 'scan', ok: true, value: text }
      }

      case 'phone': {
        if (!rt.host.callPhone) return unsupported('phone', rt)
        rt.host.callPhone(resolveTemplate(action.value.expr, scope))
        return { type: 'phone', ok: true }
      }

      case 'location': {
        if (!rt.host.getLocation) return unsupported('location', rt)
        const loc = await rt.host.getLocation()
        return { type: 'location', ok: true, value: loc }
      }

      default: {
        const t = (action as Action).type
        return { type: t as Action['type'], ok: false, error: `不支持的动作类型：${t}` }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (opts.continueOnError) return { type: action.type, ok: false, error: message }
    return { type: action.type, ok: false, error: message }
  }
}

/** 执行同一事件下的全部动作（顺序执行） */
export async function runActions(
  event: string,
  actions: Action[] | undefined,
  rt: ActionRuntime,
  opts: RunActionOptions = {},
): Promise<ActionResult[]> {
  if (!actions?.length) return []
  const results: ActionResult[] = []
  for (const action of actions) {
    if (action.event !== event) continue
    const r = await runAction(action, rt, opts)
    results.push(r)
    if (!r.ok && !opts.continueOnError) break
  }
  return results
}

/** 未实现的宿主能力：提示但不抛错 */
function unsupported(type: Action['type'], rt: ActionRuntime): ActionResult {
  rt.onUnsupported?.(type)
  void rt.host.toast?.({ text: '当前环境不支持该操作', icon: 'none' })
  return { type, ok: false, error: '当前环境不支持该操作' }
}

/** 简易模板：`共 {{formData.count}} 项` → 取 formData.count（不含条件/循环，够用即可） */
function resolveTemplate(text: string, scope: Scope): string {
  if (!text) return ''
  return text.replace(/\{\{\s*([\w$.[\]]+)\s*\}\}/g, (_m, path: string) => {
    const v = safeEval(path, scope, undefined)
    return v === undefined || v === null ? '' : String(v)
  })
}
