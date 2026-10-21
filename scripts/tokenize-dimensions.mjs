#!/usr/bin/env node
/**
 * tokenize-dimensions.mjs —— 把「尺寸类」字面量换为令牌（幂等，可复跑）
 *
 * 管两类（其余维度各有专属门禁）：
 *   ① **px 间距**：padding / margin / gap → `--lc-space-*`
 *   ② **行高比率**：`line-height: 1.6` 这类无单位值 → `--lc-leading-*`
 *
 * 为什么行高要单独一族令牌：`--lc-lh-*` 是**绝对 px**，用在正文上会让文字
 * 不随字号缩放（200% 文字缩放会裁字）。正文/UI 文本一律用**无单位比率**。
 *
 * 安全边界（与 tokenize-rpx 同一原则）：
 *   只替换**落在刻度上**的值。未命中刻度的（3px / 5px / 7px / 14px、line-height: 2.4）
 *   一律保留 —— 那里多半是光学微调或特例，硬归并会真的改变布局。
 *
 * 用法：
 *   node scripts/tokenize-dimensions.mjs           # 替换
 *   node scripts/tokenize-dimensions.mjs --dry     # 只报告
 *   node scripts/tokenize-dimensions.mjs --check   # CI：仍有「刻度上」的字面量则失败
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODE = process.argv.includes('--check') ? 'check' : process.argv.includes('--dry') ? 'dry' : 'write'

const SCAN_DIRS = [
  'apps/designer-web/src',
  'packages/designer/src',
  'packages/renderer/src',
  'packages/runtime/src',
  // materials 是 uni 宿主、间距用 rpx（由 tokenize-rpx 管），但它同样有 px 行高与少量 px 间距，
  // 行高体系必须全端一致，故一并纳入。
  'packages/materials/src',
]
const SKIP_DIR = new Set(['node_modules', 'dist'])
const SCAN_EXT = /\.(vue|css|scss)$/

/** px → 间距令牌 */
const PX_TO_TOKEN = {
  2: 'space-0-5',
  4: 'space-1',
  6: 'space-1-5',
  8: 'space-2',
  10: 'space-2-5',
  12: 'space-3',
  16: 'space-4',
  20: 'space-5',
  24: 'space-6',
  32: 'space-8',
  40: 'space-10',
  48: 'space-12',
  64: 'space-16',
}
const ON_SCALE = new Set(Object.keys(PX_TO_TOKEN).map(Number))

/** 无单位行高 → 令牌（按用途命名，不与 lh-* 混淆） */
const LEADING_TO_TOKEN = {
  1: 'leading-label',
  1.2: 'leading-compact',
  1.5: 'leading-ui',
  1.6: 'leading-readable',
  1.7: 'leading-prose',
}

/** 间距类属性 */
const SPACING_RE = /((?:^|[\s;{])(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left))?\s*:\s*)([^;{}]+)/g
/** 行高 */
const LEADING_RE = /((?:^|[\s;{])line-height\s*:\s*)([^;{}]+)/g

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIR.has(n)) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (SCAN_EXT.test(n)) out.push(p)
  }
  return out
}

const stats = { spacing: 0, leading: 0, files: new Set(), leftOffSpacing: new Map(), leftOffLeading: new Map() }

const isExempt = (lines, i) =>
  lines[i].includes('design-token-exempt') || lines[i - 1]?.includes('design-token-exempt')

function transform(src) {
  const lines = src.split('\n')
  return lines
    .map((line, i) => {
      if (isExempt(lines, i)) return line
      let out = line

      // ① px 间距
      if (/\d+px/.test(out)) {
        out = out.replace(SPACING_RE, (whole, head, value) => {
          if (/calc\(/.test(value)) return whole
          const next = value.replace(/(-?)(\d+(?:\.\d+)?)px/g, (m, sign, num) => {
            const px = Number(num)
            if (sign === '-') return m
            if (ON_SCALE.has(px)) {
              stats.spacing += 1
              return `var(--lc-${PX_TO_TOKEN[px]})`
            }
            stats.leftOffSpacing.set(`${px}px`, (stats.leftOffSpacing.get(`${px}px`) ?? 0) + 1)
            return m
          })
          return head + next
        })
      }

      // ② 行高比率
      out = out.replace(LEADING_RE, (whole, head, value) => {
        const v = value.trim()
        if (v.startsWith('var(') || /px|rpx|%|em|rem|calc\(|inherit|normal|initial/.test(v)) {
          if (/^\d/.test(v)) stats.leftOffLeading.set(v, (stats.leftOffLeading.get(v) ?? 0) + 1)
          return whole
        }
        const n = Number(v)
        if (LEADING_TO_TOKEN[n]) {
          stats.leading += 1
          return `${head}var(--lc-${LEADING_TO_TOKEN[n]})`
        }
        stats.leftOffLeading.set(v, (stats.leftOffLeading.get(v) ?? 0) + 1)
        return whole
      })

      return out
    })
    .join('\n')
}

for (const rel of SCAN_DIRS) {
  const base = join(ROOT, rel)
  for (const file of walk(base)) {
    const src = readFileSync(file, 'utf8')
    const out = transform(src)
    if (out === src) continue
    stats.files.add(relative(ROOT, file).replace(/\\/g, '/'))
    if (MODE === 'write') writeFileSync(file, out, 'utf8')
  }
}

/* ---------------- --check ---------------- */

if (MODE === 'check') {
  let bad = 0
  for (const rel of SCAN_DIRS) {
    for (const file of walk(join(ROOT, rel))) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (isExempt(lines, i)) return
        let m
        SPACING_RE.lastIndex = 0
        while ((m = SPACING_RE.exec(line))) {
          for (const hit of m[2].matchAll(/(^|[^-\w.])(\d+(?:\.\d+)?)px/g)) {
            if (ON_SCALE.has(Number(hit[2]))) {
              bad += 1
              if (bad <= 10) {
                console.error(`  ${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}  ${hit[2]}px → var(--lc-${PX_TO_TOKEN[Number(hit[2])]})`)
              }
            }
          }
        }
        LEADING_RE.lastIndex = 0
        while ((m = LEADING_RE.exec(line))) {
          const v = m[2].trim()
          if (/^\d/.test(v) && LEADING_TO_TOKEN[Number(v)]) {
            bad += 1
            if (bad <= 10) {
              console.error(`  ${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}  line-height:${v} → var(--lc-${LEADING_TO_TOKEN[Number(v)]})`)
            }
          }
        }
      })
    }
  }
  if (bad) {
    console.error(`\nFAIL：仍有 ${bad} 处尺寸类字面量可令牌化。跑 node scripts/tokenize-dimensions.mjs 修正。`)
    process.exit(1)
  }
  console.log('尺寸类检查通过 ✔（px 间距 + 行高比率均已令牌化）')
  process.exit(0)
}

/* ---------------- 报告 ---------------- */

console.log(`尺寸类字面量令牌化${MODE === 'dry' ? '（dry-run，未写盘）' : ''}`)
console.log('─'.repeat(70))
console.log(`px 间距 ${stats.spacing} 处 · 行高比率 ${stats.leading} 处 —— 涉及 ${stats.files.size} 个文件`)

if (stats.leftOffSpacing.size) {
  const l = [...stats.leftOffSpacing.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n刻度外间距（保留）${l.reduce((s, [, n]) => s + n, 0)} 处：` + l.map(([v, n]) => `${v}×${n}`).join('  '))
}
if (stats.leftOffLeading.size) {
  const l = [...stats.leftOffLeading.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n刻度外行高（保留）${l.reduce((s, [, n]) => s + n, 0)} 处：` + l.map(([v, n]) => `${v}×${n}`).join('  '))
  console.log('  说明：`2.4` 是按钮用行高撑高度的反模式、`16px` 是 perf 角标的固定高度 —— 都属特例。')
}
