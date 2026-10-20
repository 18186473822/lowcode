#!/usr/bin/env node
/**
 * tokenize-colors.mjs —— 把硬编码色值机械替换为设计令牌（一次性改造 + 可复跑）
 *
 * 为什么用脚本而不是手改：336 处 / 44 文件，手改的错误面远大于一份**可审查的映射表**。
 * 映射按「实测用途」确定，不是按色号目测 —— 例如 `#ffffff` 有 30 处是底色、13 处是
 * 「品牌底上的文字」，两者必须映射到不同令牌，否则暗色下白字会变成深色。
 *
 * 幂等：替换后再跑一次应当 0 改动；`pnpm color:check` 是它的验收标准。
 *
 * 用法：node scripts/tokenize-colors.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')

const SCAN_DIRS = ['packages/materials/src', 'packages/renderer/src', 'packages/runtime/src']
const SKIP_DIR = new Set(['node_modules', 'dist'])
const SCAN_EXT = /\.(vue|css|scss|ts)$/

/**
 * ① 语义唯一，与属性无关
 *    依据：实测用途（见注释），非色号目测。
 */
const EXACT = {
  // —— 品牌主色 ——
  '#2b6de8': 'var(--lc-action-primary)',
  // —— 文字：主要 ——
  '#333333': 'var(--lc-text-primary)',
  '#1f2733': 'var(--lc-text-primary)',
  // —— 文字：次要（表单标签 / 描述） ——
  '#666666': 'var(--lc-text-secondary)',
  '#8a94a6': 'var(--lc-text-secondary)',
  '#5b6472': 'var(--lc-text-secondary)',
  // —— 文字：辅助 / 占位（含禁用态） ——
  '#999999': 'var(--lc-text-tertiary)',
  '#9aa3b0': 'var(--lc-text-tertiary)',
  '#b6bec9': 'var(--lc-text-tertiary)',
  '#bbbbbb': 'var(--lc-text-tertiary)',
  '#d8dade': 'var(--lc-text-tertiary)',
  // —— 边框 / 分隔线 ——
  '#e0e3e8': 'var(--lc-border-default)',
  '#e6e9ef': 'var(--lc-border-default)',
  '#eceff4': 'var(--lc-border-default)',
  '#f0f1f3': 'var(--lc-border-default)',
  '#e3e7ee': 'var(--lc-border-default)',
  '#d7dbe2': 'var(--lc-border-strong)',
  '#c2c8d0': 'var(--lc-border-strong)',
  // —— 底色 ——
  '#f5f6f7': 'var(--lc-bg-canvas)',
  '#fafafa': 'var(--lc-bg-subtle)',
  '#f5f7fa': 'var(--lc-bg-subtle)',
  '#f2f4f7': 'var(--lc-bg-subtle)',
  '#f0f3f8': 'var(--lc-bg-subtle)',
  // —— 主色弱底 / 浅色装饰 ——
  '#eaf1fe': 'var(--lc-action-primary-subtle)',
  '#e8f1ff': 'var(--lc-action-primary-subtle)',
  'rgba(43, 109, 232, 0.06)': 'var(--lc-action-primary-subtle)',
  'rgba(90, 155, 255, 0.08)': 'var(--lc-action-primary-subtle)',
  '#5a9bff': 'var(--lc-brand-400)',
  '#9db9f0': 'var(--lc-brand-300)',
  '#1746a2': 'var(--lc-brand-700)',
  // —— 危险 ——
  '#e54545': 'var(--lc-status-danger)',
  '#e5484d': 'var(--lc-status-danger)',
  '#c93a3a': 'var(--lc-status-danger)',
  '#fdecec': 'var(--lc-status-danger-bg)',
  '#fdeaea': 'var(--lc-status-danger-bg)',
  // —— 成功 ——
  '#1a7f37': 'var(--lc-status-success)',
  '#16a34a': 'var(--lc-status-success)',
  '#e7f6ec': 'var(--lc-status-success-bg)',
  '#e6f7ee': 'var(--lc-status-success-bg)',
  // —— 警示 ——
  '#b25e09': 'var(--lc-status-warning)',
  '#d97706': 'var(--lc-status-warning)',
  '#f5a623': 'var(--lc-status-warning)',
  '#fff4e0': 'var(--lc-status-warning-bg)',
  '#fdf3e1': 'var(--lc-status-warning-bg)',
  // —— 遮罩 ——
  'rgba(0, 0, 0, 0.55)': 'var(--lc-overlay-scrim)',
  // —— 品牌底上的次级文字（hero / 渐变卡）。三个 alpha 归一为一枚令牌 ——
  'rgba(255, 255, 255, 0.8)': 'var(--lc-text-on-brand-muted)',
  'rgba(255, 255, 255, 0.75)': 'var(--lc-text-on-brand-muted)',
  'rgba(255, 255, 255, 0.6)': 'var(--lc-text-on-brand-muted)',
}

/**
 * ② 需按属性区分（同一字面量、两种语义）
 *    `#ffffff` 实测：30 处 background（卡/输入底）、13 处 color（品牌底上的白字）。
 *    `#c0c4cc` 实测：占位文字色 与 控件边框两种用途。
 *    品牌底上的白字**不随主题翻转**，故指向 `--lc-text-on-brand` 而非 `--lc-bg-surface`。
 */
const BY_PROP = {
  '#ffffff': {
    background: 'var(--lc-bg-surface)',
    'background-color': 'var(--lc-bg-surface)',
    color: 'var(--lc-text-on-brand)',
  },
  '#fff': {
    background: 'var(--lc-bg-surface)',
    'background-color': 'var(--lc-bg-surface)',
    color: 'var(--lc-text-on-brand)',
  },
  '#c0c4cc': {
    color: 'var(--lc-text-tertiary)',
    border: 'var(--lc-border-strong)',
    'border-color': 'var(--lc-border-strong)',
    'border-top': 'var(--lc-border-strong)',
    'border-bottom': 'var(--lc-border-strong)',
    'border-left': 'var(--lc-border-strong)',
    'border-right': 'var(--lc-border-strong)',
  },
}

/** ③ 整串替换：品牌渐变统一为一枚装饰令牌（原先两个页面各写一套角度与端点） */
const WHOLE = [
  [/linear-gradient\(135deg,\s*#2b6de8\s*,\s*#5a9bff\)/gi, 'var(--lc-gradient-brand)'],
  [/linear-gradient\(160deg,\s*#2b6de8\s+0%,\s*#1746a2\s+100%\)/gi, 'var(--lc-gradient-brand)'],
]

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

/** 长字面量优先，避免 `#fff` 先吃掉 `#ffffff` 的前缀 */
const EXACT_KEYS = Object.keys(EXACT).sort((a, b) => b.length - a.length)
const BYPROP_KEYS = Object.keys(BY_PROP).sort((a, b) => b.length - a.length)
const PROP_RE = /^\s*([a-z-]+)\s*:/
const unmapped = []
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
        // 豁免标记可写在当前行，也可写在上一行（TS/JS 里注释写在赋值上方更自然）
        if (line.includes('design-token-exempt') || all[i - 1]?.includes('design-token-exempt')) {
          return line
        }
        let out = line

        // ③ 整串替换先行
        for (const [re, token] of WHOLE) {
          if (re.test(out)) {
            out = out.replace(re, token)
            hits += 1
          }
          re.lastIndex = 0
        }

        // ② 按属性
        const prop = out.match(PROP_RE)?.[1]?.toLowerCase()
        if (prop) {
          for (const key of BYPROP_KEYS) {
            const table = BY_PROP[key]
            const token = table[prop]
            if (!token) continue
            const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
            if (re.test(out)) {
              out = out.replace(re, token)
              hits += 1
            }
          }
        }

        // ① 语义唯一
        for (const key of EXACT_KEYS) {
          const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
          if (re.test(out)) {
            out = out.replace(re, EXACT[key])
            hits += 1
          }
        }

        // 兜底：仍剩色值字面量 → 记入未映射（不静默放过）
        const leftover = out.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g)
        if (leftover && !/var\(--lc-/.test(leftover.join(''))) {
          for (const l of leftover) {
            if (!EXACT[l.toLowerCase()] && !BY_PROP[l.toLowerCase()]) {
              unmapped.push({ file: relPath, literal: l })
            }
          }
        }

        return out
      })
      .join('\n')

    if (next !== original) {
      if (!DRY) writeFileSync(file, next, 'utf8')
      changedFiles.push({ file: relPath, hits })
      total += hits
    }
  }
}

/* ---------------- 报告 ---------------- */

console.log(`色值令牌化${DRY ? '（dry-run，未写盘）' : ''}`)
console.log('─'.repeat(64))
console.log(`替换 ${total} 处，涉及 ${changedFiles.length} 个文件`)
for (const c of changedFiles.sort((a, b) => b.hits - a.hits)) {
  console.log(`  ${String(c.hits).padStart(3)}  ${c.file}`)
}

const uniqueUnmapped = [...new Set(unmapped.map((u) => u.literal))].sort()
if (uniqueUnmapped.length) {
  console.log(`\n⚠ 未映射字面量 ${uniqueUnmapped.length} 种（需补映射表或加 design-token-exempt）：`)
  for (const l of uniqueUnmapped) {
    const where = unmapped.filter((u) => u.literal === l).slice(0, 3).map((u) => u.file)
    console.log(`  ${l}  ← ${where.join(', ')}`)
  }
  process.exitCode = 2
}

console.log('─'.repeat(64))
console.log('下一步：pnpm color:check 验证（应为 0 处硬编码）。')
