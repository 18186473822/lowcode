/**
 * 主题变量派生（Phase 3 批 3 / D-P3-8）—— 纯函数，无 DOM（副作用由宿主 apply 层完成）。
 *
 * 设计令牌以 `--lc-brand-50..900` 十档为根（`@lc/tokens`），action / focus / link /
 * gradient 等语义变量均从档位派生 —— 因此运行时主题化只需覆盖**档位变量**，
 * 语义层自动跟随，无需逐个改写。
 *
 * 档位亮度采用**固定目标 L 映射**（保持 primary 的 H/S）：与 tokens.css 原生梯度吻合，
 * 且在浅色 / 深色 primary 下都不会失真（相对偏移会在极端值溢出）。
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** 解析 `#RGB` / `#RRGGBBB`（大小写不敏感，允许首尾空白）；非法返回 null */
export function parseHex(hex: string): Rgb | null {
  const s = hex.trim()
  const m6 = /^#([0-9a-f]{6})$/i.exec(s)
  if (m6) {
    const n = parseInt(m6[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const m3 = /^#([0-9a-f]{3})$/i.exec(s)
  if (m3) {
    const [r, g, b] = m3[1].split('').map((c) => parseInt(c + c, 16))
    return { r, g, b }
  }
  return null
}

/** `#rrggbb` 规范化输出（小写、补零） */
function toHex({ r, g, b }: Rgb): string {
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.round(n).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** RGB(0..255) → HSL(h:0..360, s:0..100, l:0..100) */
export function rgbToHsl({ r, g, b }: Rgb): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/** HSL(h:0..360, s:0..100, l:0..100) → `#rrggbb` */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let rgb: Rgb
  if (h < 60) rgb = { r: c, g: x, b: 0 }
  else if (h < 120) rgb = { r: x, g: c, b: 0 }
  else if (h < 180) rgb = { r: 0, g: c, b: x }
  else if (h < 240) rgb = { r: 0, g: x, b: c }
  else if (h < 300) rgb = { r: x, g: 0, b: c }
  else rgb = { r: c, g: 0, b: x }
  return toHex({ r: (rgb.r + m) * 255, g: (rgb.g + m) * 255, b: (rgb.b + m) * 255 })
}

/** 档位 → 目标亮度（保持 primary 的 H/S；与 tokens.css 原生梯度吻合，500 档 = primary 本体） */
const BRAND_LIGHTNESS: Record<string, number> = {
  '--lc-brand-50': 96,
  '--lc-brand-100': 92,
  '--lc-brand-200': 85,
  '--lc-brand-300': 74,
  '--lc-brand-400': 63,
  '--lc-brand-600': 43,
  '--lc-brand-700': 35,
  '--lc-brand-800': 28,
  '--lc-brand-900': 20,
}

/**
 * primary 单色 → brand 档位变量表（`--lc-brand-50` .. `--lc-brand-900` 共十档）。
 * 调用方逐项 `style.setProperty` 即全站生效（语义变量皆派生自档位）。非法色返回 null。
 */
export function deriveBrandPalette(primary: string): Record<string, string> | null {
  const rgb = parseHex(primary)
  if (!rgb) return null
  const [h, s] = rgbToHsl(rgb)
  const out: Record<string, string> = { '--lc-brand-500': toHex(rgb) }
  for (const [name, target] of Object.entries(BRAND_LIGHTNESS)) {
    out[name] = hslToHex(h, s, target)
  }
  return out
}
