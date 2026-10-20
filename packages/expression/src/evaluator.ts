import { ExpressionError } from './errors.js'
import { parse } from './parser.js'
import { BUILTINS, FORBIDDEN_KEYS, methodWhitelistFor, isBuiltin } from './builtin.js'
import type { Node, IdentifierNode, MemberNode } from './ast.js'

/** 受信对象标记：运行时把 app / ds 等 API 对象标记后，允许其方法被调用。 */
export const TRUSTED = Symbol.for('lc.trusted')

/** 将对象标记为受信（允许调用其上任意非禁用方法）。 */
export function markTrusted<T extends object>(obj: T): T {
  Object.defineProperty(obj, TRUSTED, { value: true, enumerable: false, configurable: false })
  return obj
}

/** 该对象是否受信。 */
export function isTrusted(obj: unknown): boolean {
  return !!obj && (obj as any)[TRUSTED] === true
}

export interface EvalOptions {
  /** 原始表达式，用于错误定位 */
  expr?: string
  /** 读取到未定义变量时回调（埋点用） */
  onUnknownVar?: (name: string) => void
  /** 成员访问异常回调（埋点用） */
  onMemberError?: (path: string, err: unknown) => void
  /** 调用了白名单外函数时回调 */
  onForbidden?: (name: string) => void
}

export type Scope = Record<string, unknown>

/* ------------------------------------------------------------------ */
/* 类型转换                                                            */
/* ------------------------------------------------------------------ */

/** 是否可以安全地按数值处理（用于 `+` 与比较运算的语义决策）。 */
function numeric(v: unknown): v is number | string {
  if (typeof v === 'number') return !Number.isNaN(v)
  if (typeof v === 'string') return v.trim() !== '' && !Number.isNaN(Number(v))
  return false
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return true // 空数组视为真：与 JS 一致
  return !!v
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  if (numeric(a) && numeric(b)) return Number(a) === Number(b)
  if (typeof a === 'object' || typeof b === 'object') return false
  return String(a) === String(b)
}

/* ------------------------------------------------------------------ */
/* 求值                                                                */
/* ------------------------------------------------------------------ */

export function evaluate(node: Node, scope: Scope, options: EvalOptions = {}): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value

    case 'Identifier':
      return readIdentifier(node, scope, options)

    case 'Member':
      return readMember(node, scope, options)

    case 'Unary': {
      const op: string = node.operator
      const v = evaluate(node.argument, scope, options)
      switch (op) {
        case '!':
          return !truthy(v)
        case '-':
          return -toNumber(v)
        case '+':
          return toNumber(v)
        default:
          throw new ExpressionError(`不支持的一元运算符 ${op}`, 'E_EXPR_SYNTAX')
      }
    }

    case 'Logical': {
      const op: string = node.operator
      const left = evaluate(node.left, scope, options)
      switch (op) {
        case '&&':
          return truthy(left) ? evaluate(node.right, scope, options) : left
        case '||':
          return truthy(left) ? left : evaluate(node.right, scope, options)
        case '??':
          return left === null || left === undefined ? evaluate(node.right, scope, options) : left
        default:
          throw new ExpressionError(`不支持的逻辑运算符 ${op}`, 'E_EXPR_SYNTAX')
      }
    }

    case 'Conditional':
      return truthy(evaluate(node.test, scope, options))
        ? evaluate(node.consequent, scope, options)
        : evaluate(node.alternate, scope, options)

    case 'Binary': {
      const l = evaluate(node.left, scope, options)
      const r = evaluate(node.right, scope, options)
      return applyBinary(node.operator, l, r)
    }

    case 'Call':
      return applyCall(node, scope, options)

    case 'Arrow': {
      const fn = (...args: unknown[]) => {
        const child: Scope = Object.create(null)
        // 继承父作用域（原型链查找），仅覆盖参数
        Object.assign(child, scope)
        node.params.forEach((p, i) => {
          child[p] = args[i]
        })
        return evaluate(node.body, child, options)
      }
      return fn
    }

    case 'Array':
      return node.elements.map((e) => evaluate(e, scope, options))

    case 'Object': {
      const out: Record<string, unknown> = Object.create(null)
      for (const p of node.properties) {
        if (FORBIDDEN_KEYS.has(p.key)) {
          throw new ExpressionError(`禁止在对象字面量中使用属性名「${p.key}」`, 'E_EXPR_SECURITY')
        }
        out[p.key] = evaluate(p.value, scope, options)
      }
      return { ...out }
    }

    default:
      throw new ExpressionError(`未知的 AST 节点类型`, 'E_EXPR_SYNTAX')
  }
}

/* ------------------------------ 标识符 ------------------------------ */

function readIdentifier(node: IdentifierNode, scope: Scope, options: EvalOptions): unknown {
  const name = node.name
  if (FORBIDDEN_KEYS.has(name)) {
    throw new ExpressionError(`禁止访问「${name}」`, 'E_EXPR_SECURITY')
  }
  if (scope && typeof scope === 'object' && Object.prototype.hasOwnProperty.call(scope, name)) {
    return scope[name]
  }
  // 作用域中不存在该变量：返回 undefined 而非抛错（业务表达式需容忍字段未填）
  options.onUnknownVar?.(name)
  return undefined
}

/* ------------------------------ 成员访问 ------------------------------ */

function readMember(node: MemberNode, scope: Scope, options: EvalOptions): unknown {
  const obj = evaluate(node.object, scope, options)

  if (node.optional && (obj === null || obj === undefined)) return undefined
  if (obj === null || obj === undefined) {
    // 链式取值（formData.a.b.c）在中间层为空时不应抛错
    options.onMemberError?.(nodeText(node), 'target is nullish')
    return undefined
  }

  const key = node.computed
    ? evaluate(node.property, scope, options)
    : (node.property as IdentifierNode).name

  const k = typeof key === 'symbol' ? String(key) : key
  if (typeof k === 'string' && FORBIDDEN_KEYS.has(k)) {
    throw new ExpressionError(`禁止访问属性「${k}」`, 'E_EXPR_SECURITY')
  }

  try {
    if (typeof obj === 'string' || typeof obj === 'number') {
      if (k === 'length') return String(obj).length
    }
    if (Array.isArray(obj) && k === 'length') return obj.length
    return (obj as any)[k as any]
  } catch (err) {
    options.onMemberError?.(nodeText(node), err)
    return undefined
  }
}

function nodeText(node: MemberNode): string {
  return node.computed ? 'computed member' : (node.property as IdentifierNode).name
}

/* ------------------------------ 二元运算 ------------------------------ */

function applyBinary(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    // `+`：两侧可数字化则做数值加法（表单 input 常返回字符串），
    // 否则退化为字符串拼接。这是相对 JS 的刻意工程决策。
    case '+':
      if (numeric(l) && numeric(r)) return Number(l) + Number(r)
      return str(l) + str(r)
    case '-':
      return toNumber(l) - toNumber(r)
    case '*':
      return toNumber(l) * toNumber(r)
    case '/': {
      const d = toNumber(r)
      if (d === 0) return Infinity
      return toNumber(l) / d
    }
    case '%': {
      const d = toNumber(r)
      if (d === 0) return NaN
      return toNumber(l) % d
    }
    case '==':
      return looseEqual(l, r)
    case '!=':
      return !looseEqual(l, r)
    case '===':
      return l === r
    case '!==':
      return l !== r
    case '<':
    case '<=':
    case '>':
    case '>=': {
      let a: unknown = l
      let b: unknown = r
      if (numeric(l) && numeric(r)) {
        a = Number(l)
        b = Number(r)
      } else {
        a = str(l)
        b = str(r)
      }
      switch (op) {
        case '<':
          return (a as any) < (b as any)
        case '<=':
          return (a as any) <= (b as any)
        case '>':
          return (a as any) > (b as any)
        default:
          return (a as any) >= (b as any)
      }
    }
    default:
      throw new ExpressionError(`不支持的运算符 ${op}`, 'E_EXPR_SYNTAX')
  }
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/* ------------------------------ 函数调用 ------------------------------ */

function applyCall(node: Extract<Node, { type: 'Call' }>, scope: Scope, options: EvalOptions): unknown {
  const args = node.args.map((a) => evaluate(a, scope, options))

  // 1) 方法调用：obj.method(...)
  if (node.callee.type === 'Member') {
    const m = node.callee
    const obj = evaluate(m.object, scope, options)
    if (node.optional && (obj === null || obj === undefined)) return undefined
    if (obj === null || obj === undefined) {
      options.onMemberError?.(String((m.property as IdentifierNode).name ?? 'method'), 'target is nullish')
      return undefined
    }

    const key = m.computed ? evaluate(m.property, scope, options) : (m.property as IdentifierNode).name
    const k = String(key)
    if (FORBIDDEN_KEYS.has(k)) {
      throw new ExpressionError(`禁止调用「${k}」`, 'E_EXPR_SECURITY')
    }

    const fn = (obj as any)[k]
    if (typeof fn !== 'function') {
      throw new ExpressionError(`「${k}」不是可调用的函数`, 'E_EXPR_UNKNOWN_FN')
    }

    if (!isTrusted(obj)) {
      const wl = methodWhitelistFor(obj)
      if (!wl || !wl.has(k)) {
        options.onForbidden?.(k)
        throw new ExpressionError(
          `不允许调用方法「${k}」（不在白名单内）`,
          'E_EXPR_UNKNOWN_FN',
        )
      }
    }
    return fn.apply(obj, args)
  }

  // 2) 标识符调用：fn(...)
  if (node.callee.type === 'Identifier') {
    const name = node.callee.name
    if (FORBIDDEN_KEYS.has(name)) {
      throw new ExpressionError(`禁止调用「${name}」`, 'E_EXPR_SECURITY')
    }
    // 优先内置白名单
    if (isBuiltin(name)) {
      try {
        return BUILTINS[name](...args)
      } catch (err) {
        throw new ExpressionError(
          `内置函数 ${name} 执行失败：${(err as Error).message}`,
          'E_EXPR_EVAL',
        )
      }
    }
    // 其次作用域注入的函数（由运行时提供，受信）
    if (scope && Object.prototype.hasOwnProperty.call(scope, name)) {
      const fn = scope[name]
      if (typeof fn === 'function') return fn(...args)
      throw new ExpressionError(`「${name}」不是可调用的函数`, 'E_EXPR_UNKNOWN_FN')
    }
    options.onForbidden?.(name)
    throw new ExpressionError(`未定义的函数「${name}」`, 'E_EXPR_UNKNOWN_FN')
  }

  // 3) 其他形式：callee 求值后应为函数（如立即调用箭头函数 ((x) => x)(1)）
  const fn = evaluate(node.callee, scope, options)
  if (typeof fn === 'function') return fn(...args)
  throw new ExpressionError('不支持的调用形式', 'E_EXPR_SYNTAX')
}

/* ------------------------------------------------------------------ */
/* 依赖提取（供联动引擎做依赖收集）                                       */
/* ------------------------------------------------------------------ */

/**
 * 提取表达式引用到的**顶层作用域变量名**。
 * 例：`formData.amount * 1 > 100 ? a.b : c` → ['formData', 'a', 'c']
 *
 * 规则：
 *  - 成员访问 `a.b` 只取根 `a`，不取属性名 `b`；
 *  - 计算成员 `a[k]` 的 `k` 会被收集；
 *  - 箭头函数参数会遮蔽同名外层变量；
 *  - 内置函数名不计入依赖。
 */
export function extractRefs(node: Node): string[] {
  const out = new Set<string>()
  walkRefs(node, out, new Set())
  return [...out]
}

function walkRefs(node: Node, out: Set<string>, shadowed: Set<string>): void {
  switch (node.type) {
    case 'Literal':
      return
    case 'Identifier':
      if (!shadowed.has(node.name) && !isBuiltin(node.name)) out.add(node.name)
      return
    case 'Member':
      walkRefs(node.object, out, shadowed)
      if (node.computed) walkRefs(node.property, out, shadowed)
      return
    case 'Unary':
      walkRefs(node.argument, out, shadowed)
      return
    case 'Logical':
    case 'Binary':
      walkRefs(node.left, out, shadowed)
      walkRefs(node.right, out, shadowed)
      return
    case 'Conditional':
      walkRefs(node.test, out, shadowed)
      walkRefs(node.consequent, out, shadowed)
      walkRefs(node.alternate, out, shadowed)
      return
    case 'Call':
      walkRefs(node.callee, out, shadowed)
      for (const a of node.args) walkRefs(a, out, shadowed)
      return
    case 'Arrow': {
      const inner = new Set(shadowed)
      for (const p of node.params) inner.add(p)
      walkRefs(node.body, out, inner)
      return
    }
    case 'Array':
      for (const e of node.elements) walkRefs(e, out, shadowed)
      return
    case 'Object':
      for (const p of node.properties) walkRefs(p.value, out, shadowed)
      return
    default:
      return
  }
}
