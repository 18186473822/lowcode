import { tokenize, type Token } from './tokenizer.js'
import { syntaxError, ExpressionError } from './errors.js'
import type {
  Node,
  BinaryNode,
} from './ast.js'

const EQUALITY_OPS = new Set(['==', '!=', '===', '!=='])
const RELATIONAL_OPS = new Set(['<', '<=', '>', '>='])
const ADDITIVE_OPS = new Set(['+', '-'])
const MULTIPLICATIVE_OPS = new Set(['*', '/', '%'])

/**
 * 递归下降解析器。
 *
 * 优先级（低 → 高）：
 *   ternary → coalesce(??) → or(||) → and(&&) → equality → relational
 *   → additive → multiplicative → unary → postfix(成员/调用) → primary
 */
export class Parser {
  private readonly tokens: Token[]
  private pos = 0
  private readonly src: string

  constructor(src: string) {
    this.src = src
    this.tokens = tokenize(src)
  }

  parse(): Node {
    if (this.peek().t === 'eof') throw syntaxError('表达式为空', 0, this.src)
    const node = this.parseExpression()
    const t = this.peek()
    if (t.t !== 'eof') {
      throw syntaxError(`表达式在「${t.v}」处意外结束（可能存在未闭合的括号或多余字符）`, t.pos, this.src)
    }
    return node
  }

  /* ------------------------------ token 工具 ------------------------------ */

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]
  }

  private next(): Token {
    const t = this.tokens[this.pos]
    if (this.pos < this.tokens.length - 1) this.pos++
    return t
  }

  private matchOp(op: string): boolean {
    const t = this.peek()
    if (t.t === 'op' && t.v === op) {
      this.next()
      return true
    }
    return false
  }

  private checkOp(op: string): boolean {
    const t = this.peek()
    return t.t === 'op' && t.v === op
  }

  private matchPunc(p: string): boolean {
    const t = this.peek()
    if (t.t === 'punc' && t.v === p) {
      this.next()
      return true
    }
    return false
  }

  private checkPunc(p: string): boolean {
    const t = this.peek()
    return t.t === 'punc' && t.v === p
  }

  private expectPunc(p: string): void {
    if (!this.matchPunc(p)) {
      const t = this.peek()
      throw syntaxError(`期望「${p}」但遇到${describe(t)}`, t.pos, this.src)
    }
  }

  /* ------------------------------ 表达式层级 ------------------------------ */

  parseExpression(): Node {
    return this.parseTernary()
  }

  private parseTernary(): Node {
    const test = this.parseCoalesce()
    if (this.matchOp('?')) {
      const consequent = this.parseTernary()
      if (!this.matchPunc(':')) {
        const t = this.peek()
        throw syntaxError('三元表达式缺少「:」', t.pos, this.src)
      }
      const alternate = this.parseTernary()
      return { type: 'Conditional', test, consequent, alternate }
    }
    return test
  }

  private parseCoalesce(): Node {
    let left = this.parseOr()
    while (this.matchOp('??')) {
      const right = this.parseOr()
      left = { type: 'Logical', operator: '??', left, right }
    }
    return left
  }

  private parseOr(): Node {
    let left = this.parseAnd()
    while (this.matchOp('||')) {
      const right = this.parseAnd()
      left = { type: 'Logical', operator: '||', left, right }
    }
    return left
  }

  private parseAnd(): Node {
    let left = this.parseEquality()
    while (this.matchOp('&&')) {
      const right = this.parseEquality()
      left = { type: 'Logical', operator: '&&', left, right }
    }
    return left
  }

  private parseEquality(): Node {
    let left = this.parseRelational()
    for (;;) {
      const t = this.peek()
      if (t.t === 'op' && EQUALITY_OPS.has(t.v)) {
        this.next()
        const right = this.parseRelational()
        left = { type: 'Binary', operator: t.v as BinaryNode['operator'], left, right }
      } else break
    }
    return left
  }

  private parseRelational(): Node {
    let left = this.parseAdditive()
    for (;;) {
      const t = this.peek()
      if (t.t === 'op' && RELATIONAL_OPS.has(t.v)) {
        this.next()
        const right = this.parseAdditive()
        left = { type: 'Binary', operator: t.v as BinaryNode['operator'], left, right }
      } else break
    }
    return left
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative()
    for (;;) {
      const t = this.peek()
      if (t.t === 'op' && ADDITIVE_OPS.has(t.v)) {
        this.next()
        const right = this.parseMultiplicative()
        left = { type: 'Binary', operator: t.v as BinaryNode['operator'], left, right }
      } else break
    }
    return left
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (t.t === 'op' && MULTIPLICATIVE_OPS.has(t.v)) {
        this.next()
        const right = this.parseUnary()
        left = { type: 'Binary', operator: t.v as BinaryNode['operator'], left, right }
      } else break
    }
    return left
  }

  private parseUnary(): Node {
    const t = this.peek()
    if (t.t === 'op' && (t.v === '!' || t.v === '-' || t.v === '+')) {
      this.next()
      const argument = this.parseUnary()
      return { type: 'Unary', operator: t.v as '!' | '-' | '+', argument }
    }
    return this.parsePostfix()
  }

  /* ------------------------------ 成员 / 调用 ------------------------------ */

  private parsePostfix(): Node {
    let node = this.parsePrimary()
    for (;;) {
      // 可选链 a?.b / a?.()
      if (this.checkOp('?.')) {
        this.next()
        if (this.checkPunc('(')) {
          node = { type: 'Call', callee: node, args: this.parseArgs(), optional: true }
        } else {
          node = this.parseMemberProperty(node, true)
        }
        continue
      }
      // 普通成员 a.b
      if (this.checkPunc('.')) {
        this.next()
        node = this.parseMemberProperty(node, false)
        continue
      }
      // 下标 a[b]
      if (this.checkPunc('[')) {
        this.next()
        const property = this.parseExpression()
        this.expectPunc(']')
        node = { type: 'Member', object: node, property, computed: true, optional: false }
        continue
      }
      // 调用 a(...)
      if (this.checkPunc('(')) {
        node = { type: 'Call', callee: node, args: this.parseArgs(), optional: false }
        continue
      }
      break
    }
    return node
  }

  private parseMemberProperty(object: Node, optional: boolean): Node {
    const t = this.peek()
    if (t.t !== 'id') {
      throw syntaxError(`「.」后应为属性名，但遇到${describe(t)}`, t.pos, this.src)
    }
    this.next()
    return {
      type: 'Member',
      object,
      property: { type: 'Identifier', name: t.v },
      computed: false,
      optional,
    }
  }

  private parseArgs(): Node[] {
    this.expectPunc('(')
    const args: Node[] = []
    if (!this.checkPunc(')')) {
      do {
        args.push(this.parseExpression())
      } while (this.matchPunc(','))
    }
    this.expectPunc(')')
    return args
  }

  /* ------------------------------ primary ------------------------------ */

  private parsePrimary(): Node {
    const t = this.peek()

    if (t.t === 'num' || t.t === 'str') {
      this.next()
      return { type: 'Literal', value: t.value as number | string }
    }

    if (t.t === 'id') {
      // 字面量关键字
      if (t.v === 'true' || t.v === 'false' || t.v === 'null' || t.v === 'undefined') {
        this.next()
        const v =
          t.v === 'true' ? true : t.v === 'false' ? false : t.v === 'null' ? null : undefined
        return { type: 'Literal', value: v }
      }
      // 单参数箭头 x => ...
      if (this.peek(1).t === 'op' && this.peek(1).v === '=>') {
        this.next()
        this.next()
        return { type: 'Arrow', params: [t.v], body: this.parseExpression() }
      }
      this.next()
      return { type: 'Identifier', name: t.v }
    }

    if (t.t === 'punc' && t.v === '(') {
      return this.parseParenOrArrow()
    }

    if (t.t === 'punc' && t.v === '[') {
      this.next()
      const elements: Node[] = []
      if (!this.checkPunc(']')) {
        do {
          if (this.checkPunc(']')) break // 允许尾逗号
          elements.push(this.parseExpression())
        } while (this.matchPunc(','))
      }
      this.expectPunc(']')
      return { type: 'Array', elements }
    }

    if (t.t === 'punc' && t.v === '{') {
      this.next()
      const properties: Array<{ key: string; value: Node }> = []
      if (!this.checkPunc('}')) {
        do {
          if (this.checkPunc('}')) break // 允许尾逗号
          const kt = this.peek()
          let key: string
          if (kt.t === 'id') {
            key = kt.v
            this.next()
          } else if (kt.t === 'str') {
            key = String(kt.value)
            this.next()
          } else {
            throw syntaxError(`对象字面量的键必须是标识符或字符串，但遇到${describe(kt)}`, kt.pos, this.src)
          }
          this.expectPunc(':')
          properties.push({ key, value: this.parseExpression() })
        } while (this.matchPunc(','))
      }
      this.expectPunc('}')
      return { type: 'Object', properties }
    }

    throw syntaxError(`意外的${describe(t)}`, t.pos, this.src)
  }

  /** 括号表达式 或 箭头函数（带回溯） */
  private parseParenOrArrow(): Node {
    const save = this.pos // 指向 '('
    this.next() // 消费 '('

    // 尝试按参数列表解析
    const params: string[] = []
    let ok = true
    if (!this.checkPunc(')')) {
      for (;;) {
        const t = this.peek()
        if (t.t !== 'id') {
          ok = false
          break
        }
        this.next()
        params.push(t.v)
        if (this.matchPunc(',')) continue
        break
      }
    }
    if (ok && this.checkPunc(')')) {
      this.next()
      if (this.checkOp('=>')) {
        this.next()
        return { type: 'Arrow', params, body: this.parseExpression() }
      }
    }

    // 回退为普通括号表达式
    this.pos = save
    this.next()
    const expr = this.parseExpression()
    this.expectPunc(')')
    return expr
  }
}

function describe(t: Token): string {
  switch (t.t) {
    case 'eof':
      return '表达式结束'
    case 'num':
      return `数字「${t.v}」`
    case 'str':
      return `字符串「${t.v}」`
    case 'id':
      return `标识符「${t.v}」`
    default:
      return `「${t.v}」`
  }
}

/** 解析表达式为 AST（不带缓存）。 */
export function parse(src: string): Node {
  if (typeof src !== 'string') {
    throw new ExpressionError('表达式必须是字符串', 'E_EXPR_SYNTAX', -1)
  }
  return new Parser(src).parse()
}
