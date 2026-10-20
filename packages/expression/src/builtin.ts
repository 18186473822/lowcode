/**
 * 内置函数白名单。
 *
 * 安全原则：
 *  1. 只有这里注册的函数可被表达式调用；
 *  2. 函数本身不得访问 globalThis / 构造器；
 *  3. 全部为纯函数或确定性函数（不提供 random / Date.now 直通）。
 */
export type BuiltinFn = (...args: any[]) => unknown

/* ------------------------------ 基础工具 ------------------------------ */

function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return NaN
}

function toList(v: unknown): any[] {
  if (Array.isArray(v)) return v
  if (v === null || v === undefined) return []
  return [v]
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v
  if (typeof v === 'number') return new Date(v)
  if (typeof v === 'string' && v.trim() !== '') {
    // 支持 'YYYY-MM-DD' 与 ISO 字符串
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.replace(/-/g, '/') : v
    const d = new Date(normalized)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date(NaN)
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

function formatDateInternal(d: Date, fmt: string): string {
  if (Number.isNaN(d.getTime())) return ''
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad2(d.getMonth() + 1),
    DD: pad2(d.getDate()),
    HH: pad2(d.getHours()),
    mm: pad2(d.getMinutes()),
    ss: pad2(d.getSeconds()),
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k])
}

/* ------------------------------ 函数表 ------------------------------ */

export const BUILTINS: Record<string, BuiltinFn> = {
  /* 字符串 */
  len: (v) => {
    if (Array.isArray(v)) return v.length
    return toStr(v).length
  },
  upper: (v) => toStr(v).toUpperCase(),
  lower: (v) => toStr(v).toLowerCase(),
  trim: (v) => toStr(v).trim(),
  contains: (v, sub) => (Array.isArray(v) ? v.includes(sub) : toStr(v).includes(toStr(sub))),
  startsWith: (v, sub) => toStr(v).startsWith(toStr(sub)),
  endsWith: (v, sub) => toStr(v).endsWith(toStr(sub)),
  indexOf: (v, sub) => (Array.isArray(v) ? v.indexOf(sub) : toStr(v).indexOf(toStr(sub))),
  split: (v, sep) => toStr(v).split(toStr(sep)),
  replace: (v, a, b) => toStr(v).split(toStr(a)).join(toStr(b)),
  str: (v) => toStr(v),

  /* 数值 */
  num: (v) => {
    const n = toNum(v)
    return Number.isNaN(n) ? 0 : n
  },
  abs: (v) => Math.abs(toNum(v)),
  ceil: (v) => Math.ceil(toNum(v)),
  floor: (v) => Math.floor(toNum(v)),
  round: (v, p = 0) => {
    const pow = Math.pow(10, Math.max(0, Math.trunc(toNum(p))))
    return Math.round(toNum(v) * pow) / pow
  },
  fixed: (v, p = 2) => {
    const n = toNum(v)
    return Number.isNaN(n) ? '0' : n.toFixed(Math.max(0, Math.trunc(toNum(p))))
  },

  /* 日期时间 */
  now: () => Date.now(),
  today: () => formatDateInternal(new Date(), 'YYYY-MM-DD'),
  formatDate: (t, fmt = 'YYYY-MM-DD') => formatDateInternal(toDate(t), toStr(fmt)),
  dateDiff: (a, b, unit = 'day') => {
    const da = toDate(a).getTime()
    const db = toDate(b).getTime()
    if (Number.isNaN(da) || Number.isNaN(db)) return 0
    const diff = db - da
    const div: Record<string, number> = {
      ms: 1,
      second: 1000,
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      month: 2_592_000_000,
      year: 31_536_000_000,
    }
    return diff / (div[toStr(unit)] ?? 86_400_000)
  },

  /* 聚合 */
  sum: (list, key?) => toList(list).reduce((s, it) => s + (toNum(key ? it?.[toStr(key)] : it) || 0), 0),
  avg: (list, key?) => {
    const arr = toList(list)
    if (arr.length === 0) return 0
    const s = arr.reduce((acc, it) => acc + (toNum(key ? it?.[toStr(key)] : it) || 0), 0)
    return s / arr.length
  },
  count: (list) => toList(list).length,
  min: (list, key?) => {
    const arr = toList(list).map((it) => toNum(key ? it?.[toStr(key)] : it)).filter((n) => !Number.isNaN(n))
    return arr.length ? Math.min(...arr) : 0
  },
  max: (list, key?) => {
    const arr = toList(list).map((it) => toNum(key ? it?.[toStr(key)] : it)).filter((n) => !Number.isNaN(n))
    return arr.length ? Math.max(...arr) : 0
  },

  /* 格式化 */
  fmtMoney: (v, unit = '') => {
    const n = toNum(v)
    if (Number.isNaN(n)) return '0' + unit
    const [i, d] = n.toFixed(2).split('.')
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '') + unit
  },
  fmtPercent: (v, p = 1) => {
    const n = toNum(v)
    if (Number.isNaN(n)) return '0%'
    const digits = Math.max(0, Math.trunc(toNum(p)))
    const val = n <= 1 ? n * 100 : n
    return val.toFixed(digits) + '%'
  },

  /* 结构 */
  jsonParse: (s) => {
    try {
      return JSON.parse(toStr(s))
    } catch {
      return null
    }
  },
  jsonStringify: (v) => {
    try {
      return JSON.stringify(v ?? null)
    } catch {
      return ''
    }
  },
  keys: (o) => (o && typeof o === 'object' ? Object.keys(o) : []),
  values: (o) => (o && typeof o === 'object' ? Object.values(o) : []),

  /* 逻辑 */
  ifNull: (a, b) => (a === null || a === undefined || a === '' ? b : a),
  coalesce: (...args) => args.find((a) => a !== null && a !== undefined && a !== '') ?? null,
  in: (v, list) => toList(list).includes(v),
  notIn: (v, list) => !toList(list).includes(v),
  between: (v, a, b) => {
    const n = toNum(v)
    return n >= toNum(a) && n <= toNum(b)
  },
}

/* ------------------------------ 方法白名单 ------------------------------ */

/** 数组允许调用的方法（this 为原数组） */
export const ARRAY_METHODS = new Set([
  'filter',
  'map',
  'reduce',
  'reduceRight',
  'find',
  'findIndex',
  'some',
  'every',
  'sort',
  'slice',
  'join',
  'includes',
  'indexOf',
  'lastIndexOf',
  'concat',
  'reverse',
  'flat',
  'fill',
])

/** 字符串允许调用的方法 */
export const STRING_METHODS = new Set([
  'includes',
  'indexOf',
  'lastIndexOf',
  'startsWith',
  'endsWith',
  'slice',
  'substring',
  'split',
  'replace',
  'replaceAll',
  'toUpperCase',
  'toLowerCase',
  'trim',
  'trimStart',
  'trimEnd',
  'padStart',
  'padEnd',
  'repeat',
  'charAt',
  'charCodeAt',
])

/** 数值允许调用的方法 */
export const NUMBER_METHODS = new Set(['toFixed', 'toPrecision'])

/** 对象允许调用的方法（安全子集） */
export const OBJECT_METHODS = new Set(['hasOwn'])

/** 全局禁用的属性名（防原型链逃逸），求值器与成员访问都要检查。 */
export const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'valueOf',
  'toString',
  'call',
  'apply',
  'bind',
  'eval',
  'Function',
  'globalThis',
  'window',
  'process',
  'require',
  'import',
])

/** 根据 this 的类型挑出对应的方法白名单；返回 null 表示该类型不允许调用方法。 */
export function methodWhitelistFor(self: unknown): Set<string> | null {
  if (typeof self === 'string') return STRING_METHODS
  if (Array.isArray(self)) return ARRAY_METHODS
  if (typeof self === 'number') return NUMBER_METHODS
  if (self && typeof self === 'object') return OBJECT_METHODS
  return null
}

export function isBuiltin(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTINS, name)
}
