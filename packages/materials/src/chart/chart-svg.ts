/**
 * chart-svg.ts —— 图表纯函数（Phase 3 批 4，D-P3-10）。
 *
 * 为什么是纯函数 + SVG 字符串：uni 三端不支持裸 `<svg>` 标签，物料以
 * `SVG 串 → base64 data URI → <image :src>` 呈现（跨端通用）；把取数聚合与
 * SVG 生成抽成**零 DOM 依赖**的纯函数，可单测、可被 designer 画布复用。
 *
 * 依赖方向：本文件在 @lc/materials 内（物料不反向依赖 @lc/renderer）。
 */

/** 图表形态（R10 风控：首期仅柱/折/饼三种）。 */
export type ChartType = 'bar' | 'line' | 'pie'

/** 聚合方式。 */
export type MetricKind = 'count' | 'sum' | 'avg' | 'max' | 'min'

export interface SeriesPoint {
  label: string
  value: number
}

/**
 * 图表配色组（按主题各一套）。
 *
 * 为什么必须按主题给两套：本文件产出的 SVG 会转成 `data:image/svg+xml;base64` 再渲染，
 * **CSS 变量在 base64 图片里无法解析** —— 颜色只能在生成时定死。若只用一套，
 * 暗色下网格线会亮成 13.81:1（亮色仅 1.24，等于刺眼 11 倍）、轴标签跌到 3.54:1。
 *
 * 取值口径：网格线≈1.3:1（要「有但不抢」）· 轴标签 ≥4.5:1 · 系列色 ≥3:1（WCAG 1.4.11 图形对象）。
 * 系列色两种模式**不是同一组值**：亮色下琥珀 2.03 / 青 2.77 都不到 3:1，必须压深；
 * 暗色下品牌蓝 3.63 偏暗，提亮到 brand-400。同一序列在两模式下色相保持一致，读者不会失步。
 */
export interface ChartTheme {
  /** 网格线 / 基线 */
  grid: string
  /** 轴标签文字 */
  axis: string
  /** 系列色（长度 6，循环使用） */
  palette: readonly string[]
}

/* 说明（豁免理由）：下面两行是**图表配置数据**，不是样式 —— SVG 转 base64 后 CSS 变量无法解析，
 * 颜色只能在生成时定死。每行自带 design-token-exempt，是因为本仓的色值扫描只认「本行或上一行」。 */
export const CHART_THEMES = {
  light: {
    grid: '#e5e7eb', axis: '#6b7280', // design-token-exempt: 图表配置数据（见上）
    palette: ['#2b6de8', '#1fa971', '#e8442e', '#c2820b', '#8b5cf6', '#0b86c4'], // design-token-exempt: 同上
  },
  dark: {
    grid: '#2a313c', axis: '#9aa5b1', // design-token-exempt: 同上
    palette: ['#6096fa', '#1fa971', '#e8442e', '#f2a73b', '#8b5cf6', '#0ea5e9'], // design-token-exempt: 同上
  },
} as const satisfies Record<'light' | 'dark', ChartTheme>

/** 兼容旧引用：等同亮色系列色。新代码请用 `CHART_THEMES[theme].palette`。 */
export const CHART_PALETTE = CHART_THEMES.light.palette

/**
 * 取数样本量上限 = 服务端 records 接口的 `size` 上限（apps/server `record.service.ts` MAX_SIZE）。
 * 二者必须一致：超限服务端直接 400（H5 实测：limit 8 → 取 160 → 400「图表取数失败」）。
 */
export const RECORDS_SIZE_MAX = 100

const EMPTY_LABEL = '（空）'

/**
 * 解析静态 `data`（JSON 文本 → 数据点数组）。
 * 容错：非数组返回 []；逐项要求 `value` 可转数字（无法转则丢弃）；缺 label 用序号。
 */
export function parseSeries(dataText: unknown): SeriesPoint[] {
  if (Array.isArray(dataText)) return normalizePoints(dataText as unknown[])
  if (typeof dataText !== 'string' || !dataText.trim()) return []
  try {
    const parsed: unknown = JSON.parse(dataText)
    return Array.isArray(parsed) ? normalizePoints(parsed) : []
  } catch {
    return []
  }
}

function normalizePoints(list: unknown[]): SeriesPoint[] {
  const out: SeriesPoint[] = []
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') return
    const o = item as Record<string, unknown>
    const value = Number(o['value'])
    if (!Number.isFinite(value)) return
    const rawLabel = o['label'] ?? o['name'] ?? o['key']
    const label = rawLabel == null || rawLabel === '' ? `#${i + 1}` : String(rawLabel)
    out.push({ label, value })
  })
  return out
}

/**
 * 按 dimension 分组 + metric 聚合（客户端聚合，纯展示派生，不新增服务端接口）。
 * - `count`：组内行数；其余取 `metricField` 数值列。
 * - `limit`：按数值**降序**取前 N（缺省 8，防分类过多图不可读）。
 * - 非法数值（NaN/Infinity）参与 sum/avg 时按 0/剔除处理（avg 剔除空值）。
 */
export function aggregateSeries(
  rows: Array<Record<string, unknown>>,
  opts: { dimension?: string; metric?: MetricKind; metricField?: string; limit?: number },
): SeriesPoint[] {
  const dim = opts.dimension?.trim()
  if (!dim || !Array.isArray(rows) || rows.length === 0) return []
  const metric: MetricKind = opts.metric ?? 'count'
  const field = opts.metricField?.trim() ?? ''
  const limit = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : 8

  const groups = new Map<string, Array<Record<string, unknown>>>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const raw = row[dim]
    const key = raw == null || raw === '' ? EMPTY_LABEL : String(raw)
    const arr = groups.get(key)
    if (arr) arr.push(row)
    else groups.set(key, [row])
  }

  const points: SeriesPoint[] = []
  for (const [label, list] of groups) {
    points.push({ label, value: metricOf(list, metric, field) })
  }
  points.sort((a, b) => b.value - a.value)
  return points.slice(0, limit)
}

function metricOf(list: Array<Record<string, unknown>>, metric: MetricKind, field: string): number {
  if (metric === 'count') return list.length
  const nums = list
    .map((r) => Number(r[field]))
    .filter((n) => Number.isFinite(n))
  if (nums.length === 0) return 0
  switch (metric) {
    case 'sum':
      return nums.reduce((s, n) => s + n, 0)
    case 'avg':
      return nums.reduce((s, n) => s + n, 0) / nums.length
    case 'max':
      return Math.max(...nums)
    case 'min':
      return Math.min(...nums)
    default:
      return list.length
  }
}

/* ------------------------------------------------------------------ */
/* SVG 构建                                                            */
/* ------------------------------------------------------------------ */

export interface BuildChartOptions {
  type: ChartType
  series: SeriesPoint[]
  /** 画布宽（px） */
  width: number
  /** 画布高（px） */
  height: number
  /** 调色板（缺省取 theme.palette） */
  colors?: readonly string[]
  /** 配色主题（缺省 light）。组件按当前亮暗主题传入 —— 见 ChartTheme 注释。 */
  theme?: ChartTheme
}

const PAD = { top: 12, right: 12, bottom: 26, left: 12 } as const

/** 生成图表 SVG 字符串；空数据返回 ''（组件据此走空态）。 */
export function buildChartSvg(opts: BuildChartOptions): string {
  const { type, series, width, height } = opts
  if (!series.length || width <= 0 || height <= 0) return ''
  const theme = opts.theme ?? CHART_THEMES.light
  const colors = opts.colors ?? theme.palette
  const body =
    type === 'pie'
      ? buildPie(series, width, height, colors, theme)
      : buildAxis(type, series, width, height, colors, theme)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" font-family="sans-serif">` +
    body +
    `</svg>`
  )
}

function buildAxis(
  type: 'bar' | 'line',
  series: SeriesPoint[],
  W: number,
  H: number,
  colors: readonly string[],
  theme: ChartTheme,
): string {
  const max = Math.max(...series.map((p) => p.value), 0)
  const scaleMax = max <= 0 ? 1 : max
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const n = series.length
  const slot = plotW / n
  const baseline = PAD.top + plotH
  let out = ''

  // 基线
  out += `<line x1="${PAD.left}" y1="${baseline}" x2="${W - PAD.right}" y2="${baseline}" stroke="${theme.grid}" stroke-width="1"/>`

  if (type === 'bar') {
    const barW = Math.max(slot * 0.6, 2)
    series.forEach((p, i) => {
      const h = (p.value / scaleMax) * plotH
      const x = PAD.left + i * slot + (slot - barW) / 2
      const y = baseline - h
      out += `<rect x="${round(x)}" y="${round(y)}" width="${round(barW)}" height="${round(h)}" fill="${colors[i % colors.length]}" rx="2"/>`
      out += labelText(p.label, PAD.left + i * slot + slot / 2, H - 8, theme.axis)
    })
    return out
  }

  // 折线
  const pts = series.map((p, i) => ({
    x: PAD.left + i * slot + slot / 2,
    y: baseline - (p.value / scaleMax) * plotH,
  }))
  out += `<polyline fill="none" stroke="${colors[0]}" stroke-width="2" ` +
    `points="${pts.map((q) => `${round(q.x)},${round(q.y)}`).join(' ')}"/>`
  pts.forEach((q, i) => {
    out += `<circle cx="${round(q.x)}" cy="${round(q.y)}" r="3" fill="${colors[0]}"/>`
    out += labelText(series[i]!.label, q.x, H - 8, theme.axis)
  })
  return out
}

function buildPie(
  series: SeriesPoint[],
  W: number,
  H: number,
  colors: readonly string[],
  theme: ChartTheme,
): string {
  const total = series.reduce((s, p) => s + Math.max(p.value, 0), 0)
  const cx = W / 2
  const cy = H / 2
  const r = Math.max(Math.min(W, H) / 2 - 8, 4)
  if (total <= 0) {
    // 全 0：画一个灰环，避免空图
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${theme.grid}"/>`
  }
  let angle = -Math.PI / 2 // 从 12 点方向起
  let out = ''
  series.forEach((p, i) => {
    const frac = Math.max(p.value, 0) / total
    if (frac <= 0) return
    const start = angle
    const end = angle + frac * Math.PI * 2
    angle = end
    const largeArc = frac > 0.5 ? 1 : 0
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy + r * Math.sin(end)
    out += `<path d="M ${round(cx)} ${round(cy)} L ${round(x1)} ${round(y1)} ` +
      `A ${round(r)} ${round(r)} 0 ${largeArc} 1 ${round(x2)} ${round(y2)} Z" ` +
      `fill="${colors[i % colors.length]}"/>`
  })
  return out
}

/** 单行分类标签（超长截断，居中）。 */
function labelText(label: string, x: number, y: number, axisColor: string): string {
  const short = label.length > 6 ? `${label.slice(0, 5)}…` : label
  return `<text x="${round(x)}" y="${round(y)}" font-size="10" fill="${axisColor}" ` +
    `text-anchor="middle">${escapeXml(short)}</text>`
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** XML 文本转义（label 可能含 & < > " ）。 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------------ */
/* base64 data URI（跨端 <image> 呈现）                                */
/* ------------------------------------------------------------------ */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * UTF-8 → base64（手写编码表，不依赖 btoa/Buffer —— MP 端两者都可能缺失）。
 * 支持 BMP + 补充平面（代理对按 codePoint 重组）。
 */
export function utf8ToBase64(input: string): string {
  const bytes: number[] = []
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64.charAt(b0 >> 2)
    out += B64.charAt(((b0 & 3) << 4) | ((b1 ?? 0) >> 4))
    out += b1 === undefined ? '=' : B64.charAt(((b1 & 15) << 2) | ((b2 ?? 0) >> 6))
    out += b2 === undefined ? '=' : B64.charAt(b2 & 63)
  }
  return out
}

/** SVG 串 → `data:image/svg+xml;base64,...`（空串返回 ''）。 */
export function toDataUri(svg: string): string {
  if (!svg) return ''
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`
}

/* ------------------------------------------------------------------ */
/* Statistic 数值格式化                                                */
/* ------------------------------------------------------------------ */

/** 千分位 + 定点小数（手写，避免 toLocaleString 跨端/环境不一致）。 */
export function formatNumber(value: number, precision = 0): string {
  const p = Math.max(0, Math.min(6, Math.floor(precision)))
  const fixed = value.toFixed(p)
  const neg = fixed.startsWith('-')
  const [intPart = '0', decPart] = (neg ? fixed.slice(1) : fixed).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${grouped}${decPart ? `.${decPart}` : ''}`
}

/**
 * 指标卡数值展示：数值 → 千分位（按 precision）；非数值原样；空 → '—'；末尾可拼单位。
 */
export function formatStatistic(value: unknown, opts: { precision?: number; unit?: string } = {}): string {
  const n = typeof value === 'number' ? value : Number(value)
  let text: string
  if (value === null || value === undefined || value === '') text = '—'
  else if (Number.isFinite(n) && !Number.isNaN(n)) text = formatNumber(n, opts.precision ?? 0)
  else text = String(value)
  return `${text}${opts.unit ?? ''}`
}
