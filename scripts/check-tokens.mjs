#!/usr/bin/env node
/**
 * check-tokens.mjs —— 设计令牌漂移校验（design-system.md §9 P2）
 *
 * 目的：设计稿里的令牌变量集是**设计侧唯一真相源**，`packages/designer/src/styles/tokens.css`
 * 是**实现侧唯一真相源**。两者靠手抄同步 → 迟早漂移。本脚本把漂移变成 CI 可见的失败。
 *
 * 用法：
 *   pnpm tokens:check          # 校验，有漂移则 exit 1
 *   pnpm tokens:check --verbose  # 额外打印全部逐项结果
 *
 * 基准：docs/tokens.w3c.json —— 由设计稿导出（Ardot `export_variables`，W3C DTCG 格式）。
 *       导出命令见 docs/design-system.md §9「重新导出」。
 *
 * 判定：
 *   exact      完全一致
 *   rounding   单通道差 ≤ 1 —— 设计稿变量以 0~1 浮点存储，1/255 取整误差无法避免，视为等价
 *   DRIFT      单通道差 ≥ 2，或数值不一致 —— **失败**
 *
 * 只报「设计稿有、CSS 没有」与「CSS 有、设计稿没有」为信息（两侧都有刻意的扩展：
 * CSS 侧多了设计器 chrome 令牌，设计稿侧多了尚未接入的表格类组件令牌）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DTCG_PATH = resolve(ROOT, 'docs/tokens.w3c.json')
const CSS_PATH = resolve(ROOT, 'packages/tokens/src/tokens.css')
const VERBOSE = process.argv.includes('--verbose')
const ROUNDING_TOLERANCE = 1

/* ---------------- 解析 ---------------- */

/** 去掉 /* ... *\/ 注释，避免注释里的 `--lc-x: y` 被误当声明 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

function grabBlock(css, re) {
  const m = css.match(re)
  return m ? m[1] : ''
}

/** 块文本 → Map<变量名, 原始值> */
function parseDecls(blockText) {
  const out = new Map()
  const re = /(--lc-[a-z0-9-]+)\s*:\s*([^;]+);/g
  let m
  while ((m = re.exec(blockText))) out.set(m[1], m[2].trim())
  return out
}

const cssRaw = stripComments(readFileSync(CSS_PATH, 'utf8'))
const lightDecls = parseDecls(grabBlock(cssRaw, /:root\s*\{([\s\S]*?)\n\}/))
const darkDecls = parseDecls(grabBlock(cssRaw, /\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/))

/** 解析 var() 链：本表缺失时回退到另一表（暗色块常引用只在 :root 定义的原始层） */
function resolveValue(name, table, seen = new Set()) {
  if (seen.has(name)) return undefined // 循环引用
  seen.add(name)
  const raw = table.get(name) ?? lightDecls.get(name)
  if (raw === undefined) return undefined
  const varMatch = raw.match(/^var\((--lc-[a-z0-9-]+)\)$/)
  if (varMatch) return resolveValue(varMatch[1], table, seen)
  return raw
}

/* ---------------- 值归一化与比较 ---------------- */

function expandHex(hex) {
  let h = hex.slice(1)
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
  if (h.length === 6) h += 'ff'
  if (h.length !== 8) return null
  return [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16))
}

/** 任意 CSS 颜色 → [r,g,b,a] */
function toRgba(value) {
  const v = value.trim()
  if (v.startsWith('#')) return expandHex(v)
  const m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (!m) return null
  return [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Math.round((m[4] === undefined ? 1 : Number(m[4])) * 255),
  ]
}

/** 带单位数值 → number（px / ms / 无单位） */
function toNumber(value) {
  const m = value.trim().match(/^(-?[\d.]+)(px|ms)?$/)
  return m ? Number(m[1]) : null
}

/** 字符串型令牌归一化（字族 / 阴影 / 缓动）：去引号、折叠空白、去逗号后空格 */
function normalizeString(value) {
  return value
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .trim()
}

/**
 * 比较两个已解析的值。
 * @returns {{kind:'exact'|'rounding'|'drift'|'type-mismatch', detail:string}}
 */
function compare(designValue, cssValue) {
  const dColor = toRgba(designValue)
  const cColor = toRgba(cssValue)
  if (dColor && cColor) {
    const deltas = dColor.map((d, i) => Math.abs(d - cColor[i]))
    const max = Math.max(...deltas)
    const detail = `${designValue} vs ${cssValue}（Δ ${deltas.join('/')}）`
    if (max === 0) return { kind: 'exact', detail }
    if (max <= ROUNDING_TOLERANCE) return { kind: 'rounding', detail }
    return { kind: 'drift', detail }
  }

  const dNum = toNumber(designValue)
  const cNum = toNumber(cssValue)
  if (dNum !== null && cNum !== null) {
    const detail = `${designValue} vs ${cssValue}`
    return dNum === cNum ? { kind: 'exact', detail } : { kind: 'drift', detail }
  }

  // 字符串型令牌：字族 / 阴影 / 缓动。归一化引号与空白后逐字比较，
  // 使 "0 1px 3px rgba(16, 24, 40, 0.08)" ≡ "0 1px 3px rgba(16,24,40,0.08)"
  const ds = normalizeString(designValue)
  const cs = normalizeString(cssValue)
  return ds === cs
    ? { kind: 'exact', detail: ds }
    : { kind: 'drift', detail: `${ds}  ≠  ${cs}` }
}

/* ---------------- 主流程 ---------------- */

const dtcg = JSON.parse(readFileSync(DTCG_PATH, 'utf8'))

/** 设计稿令牌 → [{ name, light, dark|null }]（无 modes 的集合只有 light） */
const designTokens = []
for (const [setName, set] of Object.entries(dtcg)) {
  for (const [tokenName, token] of Object.entries(set)) {
    const modes = token.$extensions?.modes
    designTokens.push({
      set: setName,
      name: tokenName,
      cssVar: `--lc-${tokenName}`,
      light: modes?.Light ?? token.$value,
      dark: modes?.Dark ?? null,
    })
  }
}

const exact = []
const rounding = []
const drift = []
const missingInCss = []
const coveredByCss = new Set()

for (const t of designTokens) {
  const cssLight = resolveValue(t.cssVar, lightDecls)
  if (cssLight === undefined) {
    missingInCss.push(t)
    continue
  }
  coveredByCss.add(t.cssVar)

  const lightResult = compare(String(t.light), cssLight)
  if (lightResult.kind === 'drift' || lightResult.kind === 'type-mismatch') {
    drift.push({ ...t, mode: 'Light', ...lightResult })
  } else {
    ;(lightResult.kind === 'exact' ? exact : rounding).push({
      ...t,
      mode: 'Light',
      ...lightResult,
    })
  }

  if (t.dark !== null) {
    const cssDark = resolveValue(t.cssVar, darkDecls)
    if (cssDark === undefined) {
      drift.push({
        ...t,
        mode: 'Dark',
        kind: 'drift',
        detail: `设计稿 Dark=${t.dark}，但 tokens.css 的 [data-theme='dark'] 未覆盖该令牌`,
      })
    } else {
      const darkResult = compare(String(t.dark), cssDark)
      if (darkResult.kind === 'drift' || darkResult.kind === 'type-mismatch') {
        drift.push({ ...t, mode: 'Dark', ...darkResult })
      } else {
        ;(darkResult.kind === 'exact' ? exact : rounding).push({
          ...t,
          mode: 'Dark',
          ...darkResult,
        })
      }
    }
  }
}

/** CSS 侧多出来的（设计器 chrome 令牌等），属刻意扩展，仅信息展示 */
const cssOnly = [...new Set([...lightDecls.keys(), ...darkDecls.keys()])]
  .filter((v) => !coveredByCss.has(v) && !designTokens.some((t) => t.cssVar === v))
  .sort()

/* ---------------- 报告 ---------------- */

const line = '─'.repeat(64)
console.log(`设计令牌漂移校验  @lc/tokens/tokens.css  ←  docs/tokens.w3c.json`)
console.log(line)
console.log(`设计稿令牌 ${designTokens.length} 项 | 逐项比对 ${exact.length + rounding.length + drift.length} 处`)
console.log(`  ✔ 完全一致   ${exact.length}`)
console.log(`  ≈ 取整误差   ${rounding.length}   （单通道 ≤ ${ROUNDING_TOLERANCE}/255）`)
console.log(`  ✘ 漂移       ${drift.length}`)

if (VERBOSE && rounding.length) {
  console.log(`\n取整误差明细：`)
  for (const r of rounding) console.log(`  ≈ ${r.cssVar} [${r.mode}]  ${r.detail}`)
}

if (drift.length) {
  console.log(`\n${line}\n✘ 漂移明细（需修正，改 tokens.css 或回设计稿改变量）：`)
  for (const d of drift) console.log(`  ${d.set}/${d.name} [${d.mode}]  ${d.detail}`)
}

if (missingInCss.length) {
  console.log(`\n设计稿有、tokens.css 未定义 ${missingInCss.length} 项（信息，可能由语义层别名覆盖）：`)
  console.log('  ' + missingInCss.map((t) => `${t.set}/${t.name}`).join('  '))
}

if (cssOnly.length) {
  console.log(`\ntokens.css 有、设计稿未定义 ${cssOnly.length} 项（信息，设计器 chrome 扩展）：`)
  console.log('  ' + cssOnly.join('  '))
}

console.log(`\n${line}`)
if (drift.length) {
  console.error(
    `FAIL：${drift.length} 处令牌漂移。请修正让两侧一致（设计稿改变变量后需重新导出 docs/tokens.w3c.json）。`,
  )
  process.exit(1)
}
console.log('PASS：实现侧与设计侧令牌一致（取整误差在容差内）。')
