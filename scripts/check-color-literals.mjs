#!/usr/bin/env node
/**
 * check-color-literals.mjs —— 硬编码色值门禁（design-system.md §8.2 / §10）
 *
 * 为什么需要它：`tokens:check` 只比对「令牌名 ↔ 令牌值」，抓不到**绕过令牌直接写死色值**的代码。
 * 而 runtime / renderer 正是这样积累出 28 个自造色的 —— 两端视觉悄悄分叉，无人发现。
 *
 * 与 uni 构建的关系（重要）：本脚本**只读源码文本，不构建、不联网、不依赖 uni CLI**。
 * 因此它可以在不把 `packages/runtime` 拉进 `pnpm -r build` 的前提下覆盖到它 ——
 * 尊重 ADR-006 / L-5「runtime 壳排除在重构建链外、覆盖率由实机冒烟代替」的既有决策。
 *
 * 豁免：
 *   ① 令牌源头文件（见 TOKEN_SOURCES）—— 它们的职责就是持有字面色值；
 *   ② 行内标记 `design-token-exempt`（须在同一行给出理由注释），用于 uni 原生 API 模拟等
 *      确实无法用 CSS 变量的场景。
 *
 * 用法：pnpm design:check（与 tokens:check 串联）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 扫描范围：所有会产出 UI 的源码目录 */
const SCAN_DIRS = [
  'apps/designer-web/src',
  'packages/designer/src',
  'packages/renderer/src',
  'packages/runtime/src',
  'packages/materials/src',
]

/** 令牌源头：职责即持有字面色值，不参与扫描 */
const TOKEN_SOURCES = ['packages/tokens/src']

const SCAN_EXT = /\.(vue|css|scss|less|ts|tsx)$/
const SKIP_DIR = new Set(['node_modules', 'dist', '.git'])

/** 色值字面量：hex / rgb(a) / hsl(a) / oklch。排除 URL 片段与 `#app` 这类非色值。 */
const COLOR_RE = [
  /#[0-9a-fA-F]{8}\b/g,
  /#[0-9a-fA-F]{6}\b/g,
  /#[0-9a-fA-F]{4}\b/g,
  /#[0-9a-fA-F]{3}\b/g,
  /\brgba?\([^)]*\)/g,
  /\bhsla?\([^)]*\)/g,
  /\boklch\([^)]*\)/g,
]
/** 排除形如 `href="#abc"`、`url(#id)` 的引用 */
const NOT_A_COLOR = /(?:href|url|id|class|for)\s*=\s*["']?#/i

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (SCAN_EXT.test(name)) out.push(p)
  }
  return out
}

const findings = []
let exemptCount = 0

for (const rel of SCAN_DIRS) {
  const absDir = join(ROOT, rel)
  for (const file of walk(absDir)) {
    const relPath = relative(ROOT, file).replace(/\\/g, '/')
    if (TOKEN_SOURCES.some((src) => relPath.startsWith(src))) continue

    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')

    lines.forEach((line, i) => {
      // 豁免标记可写在当前行，也可写在上一行（TS/JS 里注释写在赋值上方更自然）
      if (line.includes('design-token-exempt') || lines[i - 1]?.includes('design-token-exempt')) {
        exemptCount += 1
        return
      }
      // 去掉行内注释后再匹配，避免注释里提到色值被误报
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
      if (NOT_A_COLOR.test(code)) return
      for (const re of COLOR_RE) {
        re.lastIndex = 0
        const hits = code.match(re)
        if (hits) {
          for (const hit of hits) findings.push({ file: relPath, line: i + 1, literal: hit })
          break // 一行只报一次，避免重复计数
        }
      }
    })
  }
}

/* ---------------- 报告 ---------------- */

const byFile = new Map()
for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f])

console.log('硬编码色值门禁  （扫描 apps/*/src 与 packages/*/src）')
console.log('─'.repeat(64))

if (findings.length === 0) {
  console.log(`✔ 未发现硬编码色值。豁免标记 ${exemptCount} 处。`)
  console.log('─'.repeat(64))
  console.log('PASS：所有 UI 色值均来自设计令牌。')
  process.exit(0)
}

console.log(`✘ ${findings.length} 处硬编码色值，分布在 ${byFile.size} 个文件：\n`)
for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${file}  (${items.length})`)
  const preview = items.slice(0, 4).map((i) => `L${i.line}:${i.literal}`)
  console.log(`      ${preview.join('  ')}${items.length > 4 ? '  …' : ''}`)
}
console.log(`\n豁免标记（design-token-exempt）${exemptCount} 处。`)
console.log('─'.repeat(64))
console.error(
  'FAIL：请改用 var(--lc-*)。确实无法用变量的场景（如 uni 原生 API 模拟）请在该行加 design-token-exempt 并注明理由。',
)
process.exit(1)
