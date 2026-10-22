#!/usr/bin/env node
/**
 * audit-token-usage.mjs —— 令牌应用度审计（回答「设计系统到底应用了多少」）
 *
 * 与 check-*.mjs 的区别：那几条是**门禁**（红/绿），这条是**体检报告**（不分对错，看分布）。
 * 它回答三个问题：
 *   ① 每层令牌有多少被业务代码真正引用？→ 找出「定义了但没人用」的死令牌；
 *   ② 各 UI 目录的应用密度是否均衡？（均 X 处/文件）
 *   ③ 有没有引用不存在令牌的断链？
 *
 * 判定口径：
 *   · 「引用」= 业务代码里出现 `var(--lc-xxx)`。令牌之间互引（L2 引 L1）不算业务引用。
 *   · L1 原始层（色阶/尺度/阴影）多数只被 L2 引用，**未被业务引用是正常的**。
 *   · L2 语义层 / L3 组件层未被业务引用 = 真问题（规范里承诺了、产品里没用上）。
 *
 * 用法：pnpm tokens:audit
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, basename } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSS_PATH = resolve(ROOT, 'packages/tokens/src/tokens.css')

/** 业务代码所在目录（不含 packages/tokens 自身） */
const UI_DIRS = [
  'apps/designer-web/src',
  'packages/designer/src',
  'packages/renderer/src',
  'packages/runtime/src',
  'packages/materials/src',
]
const SKIP_DIR = new Set(['node_modules', 'dist'])
const SCAN_EXT = /\.(vue|css|scss|ts)$/

/** L1 原始层的命名特征 —— 这些未被业务引用不算问题 */
const PRIMITIVE_RE =
  /^--lc-(brand|neutral|dark|blue|gray|danger|success|warning|info|space|radius|font|lh|weight|shadow|duration|ease|z|opacity|size|border-width|chart)/

/* ---------------- 1. 令牌定义 ---------------- */

const css = readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const grab = (re) => css.match(re)?.[1] ?? ''
const namesIn = (t) => [...t.matchAll(/(--lc-[a-z0-9-]+)\s*:/g)].map((m) => m[1])

const lightDefs = new Set(namesIn(grab(/:root\s*\{([\s\S]*?)\n\}/)))
const darkDefs = new Set(namesIn(grab(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)))
const allDefs = new Set([...lightDefs, ...darkDefs])

/* ---------------- 2. 扫描业务代码 ---------------- */

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIR.has(n)) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (SCAN_EXT.test(n)) out.push(p)
  }
  return out
}

/** token → { count, files:Set } */
const usedInCode = new Map()
const perDir = new Map()
const brokenRefs = []

for (const rel of UI_DIRS) {
  const base = join(ROOT, rel)
  if (!existsSync(base)) continue
  const files = walk(base)
  const stat = { files: files.length, refs: 0, withTokens: 0, spacingLiterals: 0 }
  perDir.set(rel, stat)

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    let hit = false
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/var\((--lc-[a-z0-9-]+)/g)) {
        const token = m[1]
        stat.refs++
        hit = true
        if (!allDefs.has(token)) brokenRefs.push(`${rel}/${basename(file)}:${i + 1} ${token}`)
        const e = usedInCode.get(token) ?? { count: 0, files: new Set() }
        e.count++
        e.files.add(file)
        usedInCode.set(token, e)
      }
      // 间距类 px 字面量（目前**没有门禁覆盖**：color:check 只管颜色，tokenize-rpx 只管 rpx）
      if (!line.includes('design-token-exempt')) {
        const sp = line.match(/\b(gap|padding|margin)[a-z-]*:\s*[^;]*?(\d+)px/g)
        if (sp) stat.spacingLiterals += sp.length
      }
    })
    if (hit) stat.withTokens++
  }
}

/* ---------------- 3. 令牌内部互引 ---------------- */
const internalRefs = new Map()
for (const m of css.matchAll(/var\((--lc-[a-z0-9-]+)/g)) {
  internalRefs.set(m[1], (internalRefs.get(m[1]) ?? 0) + 1)
}

const rows = [...allDefs]
  .map((token) => {
    const e = usedInCode.get(token)
    const inner = internalRefs.get(token) ?? 0
    const status = e ? 'used' : inner ? 'internal-only' : 'dead'
    return { token, count: e?.count ?? 0, files: e?.files.size ?? 0, inner, status }
  })
  .sort((a, b) => a.token.localeCompare(b.token))

/* ---------------- 4. 报告 ---------------- */

const totalRefs = [...usedInCode.values()].reduce((s, e) => s + e.count, 0)
const used = rows.filter((r) => r.status === 'used')
const internalOnly = rows.filter((r) => r.status === 'internal-only')
const dead = rows.filter((r) => r.status === 'dead')
const deadSemantic = dead.filter((r) => !PRIMITIVE_RE.test(r.token))
const deadPrimitive = dead.filter((r) => PRIMITIVE_RE.test(r.token))

console.log('令牌应用度审计')
console.log('═'.repeat(78))
console.log(`定义 ${allDefs.size} 项（亮 ${lightDefs.size} / 暗 ${darkDefs.size}）| 业务引用 ${totalRefs} 处 | 断链 ${brokenRefs.length} 处`)
console.log(`✔ 被业务代码引用 ${used.length} 项   ○ 仅被其它令牌引用 ${internalOnly.length} 项   ✘ 完全未用 ${dead.length} 项`)

console.log('\n各目录应用密度')
console.log('─'.repeat(78))
for (const [dir, s] of perDir) {
  const avg = s.files ? (s.refs / s.files).toFixed(1) : '0'
  const pct = s.files ? Math.round((s.withTokens / s.files) * 100) : 0
  console.log(
    `  ${dir.replace('/src', '').padEnd(22)} ${String(s.files).padStart(3)} 文件  引用 ${String(s.refs).padStart(4)}  均 ${avg.padStart(4)}/文件  覆盖率 ${String(pct).padStart(3)}%  间距字面量 ${String(s.spacingLiterals).padStart(3)}`,
  )
}
const spacingTotal = [...perDir.values()].reduce((n, s) => n + s.spacingLiterals, 0)
if (spacingTotal) {
  console.log(`\n间距类 px 字面量合计 ${spacingTotal} 处 —— 门禁见 \`pnpm dimensions:check\`（只拦「落在刻度上」的值）。`)
  console.log('  剩余多为刻度外的光学微调（3 / 5 / 7 / 14 / 18px），按设计保留，不硬归并。')
}

if (deadSemantic.length) {
  console.log(`\n✘ 语义层 / 组件层死令牌 ${deadSemantic.length} 项 —— 规范承诺了但代码没用：`)
  const groups = new Map()
  for (const r of deadSemantic) {
    const fam = (r.token.match(/^--lc-([a-z]+)-/) ?? [, 'other'])[1]
    groups.set(fam, [...(groups.get(fam) ?? []), r.token.replace(/^--lc-/, '')])
  }
  for (const [fam, list] of groups) {
    console.log(`  · ${fam.padEnd(8)} ${list.join(', ')}`)
  }
  console.log('  → 组件几何写在实现里（padding/height/radius 字面量），改这些令牌不会影响产品。')
} else {
  console.log('\n✔ 没有语义层 / 组件层死令牌。')
}

if (deadPrimitive.length) {
  console.log(`\n○ 原始层未被引用 ${deadPrimitive.length} 项（色阶中的备用档位，一般正常）：`)
  console.log('  ' + deadPrimitive.map((r) => r.token.replace(/^--lc-/, '')).join(', '))
}

if (brokenRefs.length) {
  console.log('\n✘ 断链引用（引用了不存在的令牌）：')
  for (const b of brokenRefs) console.log(`  · ${b}`)
} else {
  console.log('\n✔ 无断链引用。')
}

console.log('\n' + '═'.repeat(78))
console.log('口径：L1 原始层（色阶/尺度）多数只被 L2 引用，未被业务引用属正常；')
console.log('      L2 语义层 / L3 组件层未被业务引用 = 真缺口。')
