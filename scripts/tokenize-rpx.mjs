#!/usr/bin/env node
/**
 * tokenize-rpx.mjs —— 把移动端代码里的 rpx 字面量替换为设计令牌（幂等，可复跑）
 *
 * 前提：`packages/tokens/src/tokens.rpx.css` 已存在（`pnpm tokens:rpx` 生成）。
 *       rpx 变体下 `--lc-space-4` = 32rpx，与代码里的 `32rpx` **像素等价**。
 *
 * 安全边界（关键）：
 *   只替换**落在刻度上的值**（`n rpx` 恰好等于某令牌的 rpx 值，即 n = px×2）。
 *   因为 rpx 变体就是 px×2，命中刻度的替换**渲染结果完全不变**（零视觉风险）；
 *   未命中刻度的值一律保留原样并列入报告，绝不「就近归并」—— 那会真的改变布局。
 *
 * 属性感知：同一个 rpx 值在不同属性上属于不同刻度（如 24rpx 可能是
 *   space-3 的间距、radius-lg 的圆角、或 font-caption 的字号）。
 *
 * 用法：node scripts/tokenize-rpx.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const DRY = !CHECK && process.argv.includes('--dry')

const SCAN_DIRS = ['packages/materials/src', 'packages/renderer/src', 'packages/runtime/src']
const SKIP_DIR = new Set(['node_modules', 'dist'])
const SCAN_EXT = /\.(vue|css|scss)$/

/** 刻度（单位 px；rpx = ×2） */
const SCALES = {
  space: { 4: 'space-1', 8: 'space-2', 12: 'space-3', 16: 'space-4', 20: 'space-5', 24: 'space-6', 32: 'space-8', 40: 'space-10', 48: 'space-12', 64: 'space-16' },
  radius: { 4: 'radius-xs', 6: 'radius-sm', 8: 'radius-md', 12: 'radius-lg', 16: 'radius-xl' },
  font: { 11: 'font-micro', 12: 'font-caption', 13: 'font-body-sm', 14: 'font-body', 15: 'font-body-lg', 16: 'font-h3', 18: 'font-h2', 22: 'font-h1', 28: 'font-display' },
  lh: { 18: 'lh-caption', 22: 'lh-body', 24: 'lh-h3', 26: 'lh-h2', 30: 'lh-h1', 36: 'lh-display' },
}

/** 属性 → 刻度族。未列出的属性一律不动（宽高、定位等属组件几何，不属间距刻度）。 */
const PROP_FAMILY = [
  [/^(padding|margin)(-(top|right|bottom|left))?$/, 'space'],
  [/^((row|column)-)?gap$/, 'space'],
  [/^border-radius$|^border-(top|bottom)-(left|right)-radius$/, 'radius'],
  [/^font-size$/, 'font'],
  [/^line-height$/, 'lh'],
  [/^border(-(top|right|bottom|left))?(-width)?$/, 'borderWidth'],
]

const PROP_RE = /^\s*([a-z-]+)\s*:/
const RPX_RE = /(-?\d*\.?\d+)rpx\b/g

function familyOf(prop) {
  for (const [re, family] of PROP_FAMILY) if (re.test(prop)) return family
  return null
}

/** 在刻度上查 rpx 值（n rpx → px = n/2） */
function lookup(family, rpxValue) {
  if (family === 'borderWidth') return rpxValue === 2 ? 'border-width' : null
  const table = SCALES[family]
  if (!table) return null
  const px = rpxValue / 2
  const key = table[px]
  return key ?? null
}

/* ---------------- 执行 ---------------- */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (SCAN_EXT.test(name)) out.push(p)
  }
  return out
}

const skipped = new Map() // rpx 值 -> 次数（未命中刻度）
const ambiguous = [] // 一行多个声明的行（无法安全判断属性）
const changedFiles = []
let total = 0

for (const rel of SCAN_DIRS) {
  for (const file of walk(join(ROOT, rel))) {
    const relPath = relative(ROOT, file).replace(/\\/g, '/')
    const original = readFileSync(file, 'utf8')
    let hits = 0

    const next = original
      .split('\n')
      .map((line, i, all) => {
        if (line.includes('design-token-exempt') || all[i - 1]?.includes('design-token-exempt')) return line
        if (!RPX_RE.test(line)) { RPX_RE.lastIndex = 0; return line }
        RPX_RE.lastIndex = 0

        // 一行多个声明时属性不可判 → 跳过并记录（宁可漏改，不可错改）
        const declCount = (line.split(';')[0] ?? '').split(':').length - 1
        if (declCount > 1) { ambiguous.push(`${relPath}:${i + 1}`); return line }

        const prop = line.replace(/\/\/.*$/, '').match(PROP_RE)?.[1]?.toLowerCase()
        if (!prop) return line
        const family = familyOf(prop)
        if (!family) return line

        return line.replace(RPX_RE, (whole, num) => {
          const key = lookup(family, Number(num))
          if (!key) {
            skipped.set(`${num}rpx`, (skipped.get(`${num}rpx`) ?? 0) + 1)
            return whole
          }
          hits += 1
          return `var(--lc-${key})`
        })
      })
      .join('\n')

    if (next !== original) {
      if (!DRY && !CHECK) writeFileSync(file, next, 'utf8')
      changedFiles.push({ file: relPath, hits })
      total += hits
    }
  }
}

/* ---------------- 报告 ---------------- */

if (CHECK) {
  if (total) {
    console.error(`FAIL：仍有 ${total} 处「落在刻度上」的 rpx 字面量未令牌化：`)
    for (const c of changedFiles.slice(0, 10)) console.error(`  ${String(c.hits).padStart(3)}  ${c.file}`)
    console.error('  跑 node scripts/tokenize-rpx.mjs 修正。')
    process.exit(1)
  }
  console.log('rpx 检查通过 ✔（刻度上的值均已令牌化）')
  process.exit(0)
}

console.log(`rpx 字面量令牌化${DRY ? '（dry-run，未写盘）' : ''}`)
console.log('─'.repeat(64))
console.log(`替换 ${total} 处，涉及 ${changedFiles.length} 个文件`)
for (const c of changedFiles.sort((a, b) => b.hits - a.hits).slice(0, 12)) {
  console.log(`  ${String(c.hits).padStart(3)}  ${c.file}`)
}
if (changedFiles.length > 12) console.log(`  … 其余 ${changedFiles.length - 12} 个文件`)

if (skipped.size) {
  const list = [...skipped.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n未命中刻度、保持字面量 ${list.reduce((s, [, n]) => s + n, 0)} 处（${list.length} 种值）：`)
  console.log('  ' + list.map(([v, n]) => `${v}×${n}`).join('  '))
  console.log('  说明：这些值不在 4px 基准刻度上。要么它们本就不该是刻度值（如 1px 描边、组件几何），')
  console.log('        要么是把刻度用错了 —— 建议逐个复核，不要机械归并到最近的刻度。')
}

if (ambiguous.length) {
  console.log(`\n⚠ 一行多声明、属性不可判，已跳过 ${ambiguous.length} 行：`)
  console.log('  ' + ambiguous.slice(0, 5).join('  '))
}

console.log('─'.repeat(64))
console.log('下一步：node scripts/build-tokens-rpx.mjs --check && pnpm color:check')
