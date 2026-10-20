import { syntaxError } from './errors.js'

export type TokenType = 'num' | 'str' | 'id' | 'op' | 'punc' | 'eof'

export interface Token {
  t: TokenType
  /** 原文（num/str 已解码为 value） */
  v: string
  /** 解码后的字面量值 */
  value?: number | string
  /** 起始字符下标 */
  pos: number
}

/** 运算符，按长度降序排列以保证最长匹配 */
const OPS = [
  '===', '!==', '==', '!=', '<=', '>=', '=>', '&&', '||', '??', '?.',
  '+', '-', '*', '/', '%', '<', '>', '!', '?',
]

const PUNC = new Set(['(', ')', '[', ']', '{', '}', ',', ':', '.'])

/** 关键字（作为字面量解析） */
const KEYWORDS = new Set(['true', 'false', 'null', 'undefined'])

export function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length

  while (i < n) {
    const ch = src[i]

    // 空白
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // 字符串（单/双引号）
    if (ch === '"' || ch === "'") {
      const start = i
      i++
      let out = ''
      while (i < n && src[i] !== ch) {
        if (src[i] === '\\') {
          const next = src[i + 1]
          switch (next) {
            case 'n': out += '\n'; break
            case 't': out += '\t'; break
            case 'r': out += '\r'; break
            case '\\': out += '\\'; break
            case "'": out += "'"; break
            case '"': out += '"'; break
            case 'u': {
              const hex = src.slice(i + 2, i + 6)
              if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw syntaxError('非法的 Unicode 转义', i, src)
              out += String.fromCharCode(parseInt(hex, 16))
              i += 4
              break
            }
            default:
              throw syntaxError(`不支持的转义字符 \\${next ?? ''}`, i, src)
          }
          i += 2
        } else {
          out += src[i]
          i++
        }
      }
      if (i >= n) throw syntaxError('字符串未闭合', start, src)
      i++ // 跳过结尾引号
      tokens.push({ t: 'str', v: src.slice(start, i), value: out, pos: start })
      continue
    }

    // 数字
    if (ch >= '0' && ch <= '9') {
      const start = i
      while (i < n && src[i] >= '0' && src[i] <= '9') i++
      if (src[i] === '.') {
        i++
        while (i < n && src[i] >= '0' && src[i] <= '9') i++
      }
      if (src[i] === 'e' || src[i] === 'E') {
        i++
        if (src[i] === '+' || src[i] === '-') i++
        while (i < n && src[i] >= '0' && src[i] <= '9') i++
      }
      const raw = src.slice(start, i)
      // 1abc 这类非法写法
      if (i < n && /[A-Za-z_$]/.test(src[i])) throw syntaxError(`数字后出现了非法字符 ${src[i]}`, i, src)
      tokens.push({ t: 'num', v: raw, value: Number(raw), pos: start })
      continue
    }

    // 标识符 / 关键字
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i
      while (i < n && /[\w$]/.test(src[i])) i++
      const word = src.slice(start, i)
      if (KEYWORDS.has(word)) {
        tokens.push({ t: 'id', v: word, value: word, pos: start })
      } else {
        tokens.push({ t: 'id', v: word, pos: start })
      }
      continue
    }

    // 标点
    if (PUNC.has(ch)) {
      tokens.push({ t: 'punc', v: ch, pos: i })
      i++
      continue
    }

    // 运算符（最长匹配）
    const op = OPS.find((o) => src.startsWith(o, i))
    if (op) {
      tokens.push({ t: 'op', v: op, pos: i })
      i += op.length
      continue
    }

    throw syntaxError(`无法识别的字符「${ch}」`, i, src)
  }

  tokens.push({ t: 'eof', v: '', pos: n })
  return tokens
}
