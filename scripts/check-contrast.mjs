#!/usr/bin/env node
/**
 * check-contrast.mjs —— WCAG 2.1 对比度审计（design-system.md §2.2 无障碍）
 *
 * 为什么需要：令牌层有 133 个值、双模式共 300+ 组合，但**从未验过对比度**。
 *   设计系统里最典型的隐性缺陷就是「颜色改了、可读性掉了」而没人发现 ——
 *   颜色值本身不报错，只有眼睛（或这条门禁）能发现。
 *
 * 判定策略（基线回归，而不是一上来就全量卡 4.5）：
 *   ① 每条「前景/背景」组合算出实际比值；
 *   ② 与 `docs/contrast.json` 的基线比对，**掉超过 0.05 判退化并失败**；
 *   ③ 高于阈值 → ✔；低于阈值但没退化 → ⚠ 记为**既有缺口**（如实列出，不阻断）；
 *   ④ 基线里没有的新组合 → 必须直接达标，否则失败（新增的不许带病进场）。
 *
 * 这样既能锁住不退化，又不会让既有缺口把门禁变成红灯常亮而被人忽略。
 *
 * 用法：
 *   node scripts/check-contrast.mjs            # 校验（CI）
 *   node scripts/check-contrast.mjs --update   # 重建基线（修改配色后手动跑）
 *   node scripts/check-contrast.mjs --strict   # 既有缺口也判失败（配色修好后切到这条）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSS_PATH = resolve(ROOT, 'packages/tokens/src/tokens.css')
const BASE_PATH = resolve(ROOT, 'docs/contrast.json')

const UPDATE = process.argv.includes('--update')
const STRICT = process.argv.includes('--strict')
/** 退化容差：小于此差值的波动视为浮点噪声 */
const DRIFT_TOLERANCE = 0.05

/**
 * 需要审计的语义组合。
 * 阈值口径（WCAG 2.1）：正文 4.5:1；大字号（≥24px 或粗体 ≥18.66px）与非文本 UI 边界 3:1。
 */
const PAIRS = [
  ['--lc-text-primary', '--lc-bg-surface', '正文 / 卡片', 4.5],
  ['--lc-text-primary', '--lc-bg-canvas', '正文 / 页面底', 4.5],
  ['--lc-text-label', '--lc-bg-surface', '表单标签', 4.5],
  ['--lc-text-label', '--lc-bg-subtle', '表单标签 / 次级底', 4.5],
  ['--lc-text-secondary', '--lc-bg-surface', '次要说明', 4.5],
  ['--lc-text-tertiary', '--lc-bg-surface', '占位 / 辅助文字', 4.5],
  ['--lc-text-inverse', '--lc-bg-inverse', '反色区块', 4.5],
  ['--lc-action-primary', '--lc-bg-surface', '主色文字 / 链接', 4.5],
  ['--lc-action-primary-text', '--lc-action-primary', '主按钮文字', 4.5],
  ['--lc-action-primary-text', '--lc-action-primary-active', '主按钮按下文字', 4.5],
  ['--lc-text-on-brand', '--lc-action-primary', '品牌底白字', 4.5],
  ['--lc-text-on-brand-muted', '--lc-action-primary', '品牌底次级白字', 4.5],
  ['--lc-status-danger', '--lc-bg-surface', '错误文字', 4.5],
  ['--lc-status-danger', '--lc-status-danger-bg', '错误块内文字', 4.5],
  ['--lc-status-success', '--lc-status-success-bg', '成功块内文字', 4.5],
  ['--lc-status-warning', '--lc-status-warning-bg', '警示块内文字', 4.5],
  ['--lc-status-danger-active', '--lc-bg-surface', '危险按下态文字', 4.5],
  // 非文本（控件边界 / 焦点环）：3:1
  ['--lc-border-strong', '--lc-bg-surface', '控件边框（非文本）', 3],
  ['--lc-action-primary', '--lc-bg-canvas', '焦点环 / 主色块（非文本）', 3],
]

/* ---------------- 读令牌并解析 var 链 ---------------- */

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
const grabBlock = (t, re) => t.match(re)?.[1] ?? ''
const parseDecls = (blockText) => {
  const out = new Map()
  const re = /(--lc-[a-z0-9-]+)\s*:\s*([^;]+);/g
  let m
  while ((m = re.exec(blockText))) out.set(m[1], m[2].trim())
  return out
}

const cssRaw = stripComments(readFileSync(CSS_PATH, 'utf8'))
const lightDecls = parseDecls(grabBlock(cssRaw, /:root\s*\{([\s\S]*?)\n\}/))
const darkDecls = parseDecls(grabBlock(cssRaw, /\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/))

function resolveValue(name, table, seen = new Set()) {
  if (seen.has(name)) return undefined
  seen.add(name)
  const raw = table.get(name) ?? lightDecls.get(name)
  if (raw === undefined) return undefined
  const m = raw.match(/^var\((--lc-[a-z0-9-]+)\)$/)
  return m ? resolveValue(m[1], table, seen) : raw
}

/* ---------------- 颜色工具 ---------------- */

function expandHex(h) {
  let s = h.slice(1)
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join('')
  if (s.length === 6) s += 'ff'
  if (s.length !== 8) return null
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
    a: parseInt(s.slice(6, 8), 16) / 255,
  }
}

function toRgba(value) {
  const v = String(value ?? '').trim()
  const hex = v.match(/^#([0-9a-fA-F]+)$/)
  if (hex) return expandHex(`#${hex[1]}`)
  const fn = v.match(/^rgba?\(([^)]+)\)$/i)
  if (!fn) return null
  const parts = fn[1].split(/[,/]/).map((p) => p.trim())
  if (parts.length < 3) return null
  const num = (p, max) => (p.endsWith('%') ? (parseFloat(p) / 100) * max : parseFloat(p))
  return {
    r: num(parts[0], 255),
    g: num(parts[1], 255),
    b: num(parts[2], 255),
    a: parts.length > 3 ? num(parts[3], 1) : 1,
  }
}

/** 半透明前景叠到背景上的实际颜色 */
function composite(fg, bg) {
  const a = fg.a ?? 1
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 }
  const mix = (f, b) => f * a + b * (1 - a)
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 }
}

function relLuminance({ r, g, b }) {
  const ch = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

function contrastRatio(fgRaw, bgRaw) {
  const bg = toRgba(bgRaw)
  let fg = toRgba(fgRaw)
  if (!fg || !bg) return null
  fg = composite(fg, bg)
  const l1 = relLuminance(fg)
  const l2 = relLuminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/* ---------------- 计算 ---------------- */

const keyOf = (fg, bg) => `${fg} on ${bg}`

function audit(mode, table) {
  const rows = []
  for (const [fg, bg, use, threshold] of PAIRS) {
    const fgVal = resolveValue(fg, table)
    const bgVal = resolveValue(bg, table)
    const ratio = fgVal && bgVal ? contrastRatio(fgVal, bgVal) : null
    rows.push({ fg, bg, use, threshold, fgVal, bgVal, ratio })
  }
  return rows
}

const light = audit('light', lightDecls)
const dark = audit('dark', darkDecls)

/* ---------------- 基线读写 ---------------- */

function snapshot(rows) {
  const out = {}
  for (const r of rows) if (r.ratio !== null) out[keyOf(r.fg, r.bg)] = Number(r.ratio.toFixed(2))
  return out
}

if (UPDATE) {
  const data = {
    note: 'WCAG 对比度基线。由 `node scripts/check-contrast.mjs --update` 生成；改了配色就重建一次。',
    tolerance: DRIFT_TOLERANCE,
    light: snapshot(light),
    dark: snapshot(dark),
  }
  writeFileSync(BASE_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log(`已重建基线 docs/contrast.json（亮色 ${Object.keys(data.light).length} 组 / 暗色 ${Object.keys(data.dark).length} 组）`)
  process.exit(0)
}

const baseline = existsSync(BASE_PATH) ? JSON.parse(readFileSync(BASE_PATH, 'utf8')) : { light: {}, dark: {} }

/* ---------------- 判定 ---------------- */

const failures = []
const gaps = []

function judge(rows, mode) {
  const base = baseline[mode] ?? {}
  for (const r of rows) {
    if (r.ratio === null) {
      failures.push(`${mode} · ${r.use}：无法解析 ${r.fg} / ${r.bg} 的颜色值`)
      continue
    }
    const k = keyOf(r.fg, r.bg)
    const baseRatio = base[k]
    r.base = baseRatio ?? null

    if (baseRatio === undefined) {
      // 新组合：必须直接达标
      if (r.ratio + 1e-9 < r.threshold) {
        r.status = 'new-fail'
        failures.push(
          `${mode} · ${r.use}：新增组合 ${r.ratio.toFixed(2)}:1 低于 ${r.threshold}:1`,
        )
      } else r.status = 'ok'
      continue
    }
    if (r.ratio < baseRatio - DRIFT_TOLERANCE) {
      r.status = 'regressed'
      failures.push(
        `${mode} · ${r.use}：对比度从 ${baseRatio.toFixed(2)} 退化到 ${r.ratio.toFixed(2)}（容差 ${DRIFT_TOLERANCE}）`,
      )
    } else if (r.ratio + 1e-9 < r.threshold) {
      r.status = 'gap'
      gaps.push({ mode, ...r })
      if (STRICT) failures.push(`${mode} · ${r.use}：${r.ratio.toFixed(2)}:1 低于 ${r.threshold}:1（--strict）`)
    } else r.status = 'ok'
  }
}

judge(light, 'light')
judge(dark, 'dark')

/* ---------------- 报告 ---------------- */

const ICON = { ok: '✔', gap: '⚠', regressed: '✘', 'new-fail': '✘' }
const fmt = (n) => `${n.toFixed(2)}:1`.padStart(8)

console.log('WCAG 对比度审计  （packages/tokens/src/tokens.css）')
console.log('─'.repeat(76))
for (const [mode, rows] of [
  ['亮色', light],
  ['暗色', dark],
]) {
  console.log(`\n${mode}`)
  for (const r of rows) {
    const target = `需 ${r.threshold}:1`
    console.log(`  ${ICON[r.status]} ${fmt(r.ratio)}  ${target.padEnd(8)} ${r.use}`)
  }
}

const okCount = [...light, ...dark].filter((r) => r.status === 'ok').length
console.log('\n' + '─'.repeat(76))
console.log(`达标 ${okCount} 组 | 既有缺口 ${gaps.length} 组 | 退化/新增不达标 ${failures.length} 组`)

if (gaps.length) {
  console.log('\n既有缺口（本轮不阻断；配色调整时优先处理）：')
  for (const g of gaps) {
    const fix = g.threshold >= 4.5 ? '正文级要求，需加深前景或提亮背景' : '非文本要求，需加强对比'
    console.log(`  · ${g.mode === 'light' ? '亮色' : '暗色'} ${g.use}：${g.ratio.toFixed(2)}:1（需 ${g.threshold}:1）— ${fix}`)
  }
}

if (failures.length) {
  console.log('\n' + '─'.repeat(76))
  for (const f of failures) console.error(`FAIL：${f}`)
  console.error('\n提示：若这是有意的配色调整，跑 `node scripts/check-contrast.mjs --update` 重建基线并提交。')
  process.exit(1)
}

console.log('\nPASS：无对比度退化，也无新增不达标组合。')
