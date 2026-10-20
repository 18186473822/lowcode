/**
 * 校验引擎：6 种规则（required / pattern / range / maxLength / expression / async）。
 *
 * 时机（见《落地方案》5.5）：
 *  - `blur`：validateField(name) 单字段即时反馈
 *  - `submit`：validateAll() 全量阻断，并给出 firstError 供自动滚动定位
 *
 * 同步规则在本模块内完成；`async` 规则通过 `asyncRuleValidator` 注入（数据源引擎提供），
 * 因此本模块保持纯函数、可单测。
 */
import { evalExpr, type Scope } from '@lc/expression'
import type { PageSchema, NodeSchema, Rule } from '@lc/schema'
import type { FieldError, ValidateResult } from './types.js'
import { getByPath } from './path.js'

export interface FieldRuleBinding {
  /** formData 字段名 */
  name: string
  /** 所属节点 id */
  nodeId: string
  /** 展示用标签 */
  label: string
  rules: Rule[]
}

/** 异步规则校验器：返回错误消息或 null */
export type AsyncRuleValidator = (
  rule: Extract<Rule, { type: 'async' }>,
  ctx: { name: string; value: unknown; scope: Scope },
) => Promise<string | null>

/* ------------------------------------------------------------------ */
/* 规则收集                                                            */
/* ------------------------------------------------------------------ */

/** 从页面 Schema 收集全部字段的校验规则（按出现顺序，字段可重复出现取并集） */
export function collectRules(page: PageSchema): Map<string, FieldRuleBinding> {
  const map = new Map<string, FieldRuleBinding>()

  const walk = (node: NodeSchema): void => {
    const name = node.props?.['name']
    const rules = resolveNodeRules(node)
    if (typeof name === 'string' && name && rules.length > 0) {
      const existing = map.get(name)
      if (existing) {
        existing.rules.push(...rules)
      } else {
        map.set(name, {
          name,
          nodeId: node.id,
          label: String(node.props?.['label'] ?? name),
          rules: [...rules],
        })
      }
    }
    node.children?.forEach(walk)
  }

  if (page.root) walk(page.root)
  return map
}

/** 节点上的规则：props.rules 优先，其次物料默认规则由设计器合并进 props.rules */
function resolveNodeRules(node: NodeSchema): Rule[] {
  const raw = node.props?.['rules']
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is Rule => !!r && typeof r === 'object' && typeof (r as Rule).type === 'string')
}

/* ------------------------------------------------------------------ */
/* 判定                                                                */
/* ------------------------------------------------------------------ */

/** 空值判定：undefined / null / 空串（去空白）/ 空数组 */
export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function defaultMessage(rule: Rule, label: string, value: unknown): string {
  switch (rule.type) {
    case 'required':
      return label && label !== 'undefined' ? `请填写${label}` : '此项为必填'
    case 'pattern':
      return `${label || '该项'}格式不正确`
    case 'range':
      return `${label || '数值'}需在 ${rule.min ?? '-∞'} ~ ${rule.max ?? '+∞'} 之间`
    case 'maxLength':
      return `${label || '内容'}不能超过 ${rule.value} 个字符`
    case 'expression':
      return rule.message || `${label || '该项'}校验不通过`
    case 'async':
      return rule.message || `${label || '该项'}校验不通过`
    default:
      return '校验不通过'
  }
}

/** 校验单条规则，返回错误消息或 null（async 不在此处理） */
export function checkRule(rule: Rule, value: unknown, label: string, scope: Scope): string | null {
  switch (rule.type) {
    case 'required':
      return isEmpty(value) ? (rule.message ?? defaultMessage(rule, label, value)) : null

    case 'pattern': {
      if (isEmpty(value)) return null // 非必填时，空值跳过格式校验
      let re: RegExp
      try {
        re = new RegExp(rule.value)
      } catch {
        return `校验规则配置错误：${rule.value}`
      }
      return re.test(String(value)) ? null : (rule.message ?? defaultMessage(rule, label, value))
    }

    case 'range': {
      if (isEmpty(value)) return null
      const n = Number(value)
      if (Number.isNaN(n)) return rule.message ?? `${label || '该项'}必须是数字`
      if (rule.min !== undefined && n < rule.min) return rule.message ?? defaultMessage(rule, label, value)
      if (rule.max !== undefined && n > rule.max) return rule.message ?? defaultMessage(rule, label, value)
      return null
    }

    case 'maxLength': {
      if (isEmpty(value)) return null
      const len = typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : String(value).length
      return len > rule.value ? (rule.message ?? defaultMessage(rule, label, value)) : null
    }

    case 'expression': {
      try {
        const ok = evalExpr(rule.value, scope)
        return ok ? null : (rule.message ?? defaultMessage(rule, label, value))
      } catch {
        return '校验表达式配置错误'
      }
    }

    case 'async':
      return null // 异步规则由 validateAll 单独处理

    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/* 对外 API                                                            */
/* ------------------------------------------------------------------ */

/** 校验单个字段，返回错误消息或 null */
export function validateField(
  name: string,
  value: unknown,
  scope: Scope,
  bindings?: ReadonlyMap<string, FieldRuleBinding>,
): string | null {
  const binding = bindings?.get(name)
  if (!binding) return null
  for (const rule of binding.rules) {
    const msg = checkRule(rule, value, binding.label, scope)
    if (msg) return msg
  }
  return null
}

export interface ValidateAllOptions {
  bindings: ReadonlyMap<string, FieldRuleBinding>
  scope: Scope
  /** 读取字段值，默认从 formData 读 */
  getValue?: (name: string) => unknown
  /** 异步规则校验器（提供则一并执行 async 规则） */
  asyncValidator?: AsyncRuleValidator
}

/** 全量校验；async 规则需提供 asyncValidator，否则跳过并记为待办 */
export async function validateAll(opts: ValidateAllOptions): Promise<ValidateResult> {
  const get = opts.getValue ?? ((n: string) => getByPath((opts.scope as any).formData, n))
  const errors: FieldError[] = []
  const asyncJobs: Array<() => Promise<void>> = []

  for (const binding of opts.bindings.values()) {
    const value = get(binding.name)

    let message: string | null = null
    let ruleType: Rule['type'] = 'required'

    for (const rule of binding.rules) {
      if (rule.type === 'async') {
        if (opts.asyncValidator) {
          const job = rule
          asyncJobs.push(async () => {
            const msg = await opts.asyncValidator!(job, {
              name: binding.name,
              value,
              scope: opts.scope,
            })
            if (msg) {
              errors.push({
                nodeId: binding.nodeId,
                name: binding.name,
                message: msg,
                rule: 'async',
              })
            }
          })
        }
        continue
      }
      const msg = checkRule(rule, value, binding.label, opts.scope)
      if (msg) {
        message = msg
        ruleType = rule.type
        break // 单字段只报第一个错误
      }
    }

    if (message) {
      errors.push({ nodeId: binding.nodeId, name: binding.name, message, rule: ruleType })
    }
  }

  // 注意：asyncJobs 存的是**工厂函数**，必须调用后才得到 Promise
  if (asyncJobs.length > 0) await Promise.all(asyncJobs.map((job) => job()))

  return {
    valid: errors.length === 0,
    errors,
    firstError: errors[0],
  }
}

/** 错误列表 → Map<nodeId, message>（供 resolveTree 挂载） */
export function toErrorMap(errors: FieldError[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of errors) map.set(e.nodeId, e.message)
  return map
}
