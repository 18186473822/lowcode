/**
 * @lc/expression —— 受限表达式引擎
 *
 * 设计目标（见《落地方案》3.4 / 5.4）：
 *  1. 零 eval / 零 new Function —— 小程序端禁止动态脚本，且需要天然沙箱；
 *  2. 白名单 —— 只有注册过的函数/方法可被调用，原型链访问被拦截；
 *  3. 可解释的错误 —— 报错带列号，便于设计器标红提示；
 *  4. AST 缓存 —— 同一表达式只解析一次（大表单高频联动的关键）。
 */
import { parse as parseRaw } from './parser.js'
import { evaluate, extractRefs, type Scope, type EvalOptions } from './evaluator.js'
import { ExpressionError } from './errors.js'
import type { Node } from './ast.js'

export { Parser, parse } from './parser.js'
export { tokenize } from './tokenizer.js'
export type { Token, TokenType } from './tokenizer.js'
export { evaluate, extractRefs, markTrusted, isTrusted, TRUSTED } from './evaluator.js'
export type { Scope, EvalOptions } from './evaluator.js'
export { ExpressionError } from './errors.js'
export type { ExpressionErrorCode } from './errors.js'
export { BUILTINS, ARRAY_METHODS, STRING_METHODS, NUMBER_METHODS, OBJECT_METHODS, FORBIDDEN_KEYS } from './builtin.js'
export { toString as astToString } from './ast.js'
export type { Node } from './ast.js'

/** AST 缓存容量（超过后淘汰最早插入的条目） */
const MAX_CACHE = 500
const astCache = new Map<string, Node>()

/** 解析表达式（带 LRU 式缓存）。 */
export function parseCached(expr: string): Node {
  const hit = astCache.get(expr)
  if (hit) return hit
  const ast = parseRaw(expr)
  if (astCache.size >= MAX_CACHE) {
    const oldest = astCache.keys().next().value
    if (oldest !== undefined) astCache.delete(oldest)
  }
  astCache.set(expr, ast)
  return ast
}

/** 清空 AST 缓存（测试与热更新用）。 */
export function clearCache(): void {
  astCache.clear()
}

/** 当前缓存条目数（观测用）。 */
export function cacheSize(): number {
  return astCache.size
}

/**
 * 解析并求值表达式。
 *
 * @example
 * evalExpr('formData.amount * 2', { formData: { amount: 10 } })  // 20
 */
export function evalExpr(expr: string, scope: Scope = {}, options: EvalOptions = {}): unknown {
  if (typeof expr !== 'string') {
    throw new ExpressionError('表达式必须是字符串', 'E_EXPR_SYNTAX')
  }
  const trimmed = expr.trim()
  if (trimmed === '') return undefined
  const ast = parseCached(trimmed)
  return evaluate(ast, scope, { ...options, expr })
}

export interface CheckResult {
  ok: boolean
  message?: string
  code?: string
  pos?: number
}

/**
 * 语法检查（不求值）。供 @lc/schema 的校验器与设计器实时提示使用。
 */
export function checkExpr(expr: string): CheckResult {
  if (typeof expr !== 'string') return { ok: false, message: '表达式必须是字符串' }
  if (expr.trim() === '') return { ok: false, message: '表达式为空' }
  try {
    parseRaw(expr)
    return { ok: true }
  } catch (e) {
    if (e instanceof ExpressionError) {
      return { ok: false, message: e.message, code: e.code, pos: e.pos }
    }
    return { ok: false, message: (e as Error).message }
  }
}

/** 提取表达式引用的顶层变量（供联动引擎做依赖收集）。 */
export function refs(expr: string): string[] {
  try {
    return extractRefs(parseCached(expr.trim()))
  } catch {
    return []
  }
}

/**
 * 安全求值：任何错误都不抛出，返回 fallback。
 * 渲染期使用（页面绝不能因为一个表达式写错而白屏）。
 */
export function safeEval(expr: string, scope: Scope = {}, fallback: unknown = undefined): unknown {
  try {
    return evalExpr(expr, scope)
  } catch {
    return fallback
  }
}
