#!/usr/bin/env node
/**
 * build-tokens-rpx.mjs —— 由 tokens.css 派生移动端用的 rpx 变体
 *
 * 为什么要有这个文件（design-system.md §10.3）：
 *   移动端（uni-app）的单位是 `rpx`（750 设计宽基准），Web 是 `px`。
 *   我们**不维护第二份手写的 rpx 令牌** —— 那会立刻变成两份真相源，`tokens:check` 只能覆盖一份。
 *   做法是：`tokens.css` 是唯一源，本脚本派生 `tokens.rpx.css`，并由 `--check` 保证产物不漂移。
 *
 * 换算规则（只动「带 px 单位」的数值）：
 *   `<n>px` → `<n*2>rpx`     ← 1px = 2rpx（750 / 375 基准）
 *   其余一律原样：颜色、无单位数值（字重 400 不可×2！）、`ms`、字符串（字族 / 阴影里的颜色）、
 *   以及 `var(--lc-*)` 别名（别名自行解析，不在这里展开）。
 *
 * 用法：
 *   node scripts/build-tokens-rpx.mjs          # 生成 / 更新产物
 *   node scripts/build-tokens-rpx.mjs --check  # 只校验（CI：产物过期则 exit 1）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'packages/tokens/src/tokens.css')
const OUT = resolve(ROOT, 'packages/tokens/src/tokens.rpx.css')
const CHECK = process.argv.includes('--check')

const BANNER = `/**
 * tokens.rpx.css —— 移动端（uni-app）令牌变体
 *
 * ⚠️ 本文件由 scripts/build-tokens-rpx.mjs 自动生成，**请勿手改**。
 *    改令牌请改 tokens.css，然后跑 \`pnpm tokens:rpx\`。
 *    产物是否过期由 \`pnpm design:check\` 校验。
 *
 * 与 tokens.css 的唯一差别：带 px 的数值统一 ×2 转为 rpx（750 基准 / 375 逻辑宽）。
 * 颜色、无单位数值、ms、字符串型令牌完全一致。
 */
`

/** 只转换「值」部分（`:` 与 `;` 之间），避免动到注释里的 px */
function convertLine(line) {
  const m = line.match(/^(\s*--lc-[a-z0-9-]+\s*:\s*)([^;]*)(;.*)$/)
  if (!m) return line
  const [, head, value, tail] = m
  const converted = value.replace(/(-?\d*\.?\d+)px\b/g, (_all, num) => `${Number(num) * 2}rpx`)
  return head + converted + tail
}

// 先归一化换行：Windows 工作区检出可能是 CRLF，`convertLine` 的正则末尾锚点
// 会被行尾 `\r` 顶掉而静默不转换（产物不漂移但内容仍是 px），导致 CI（LF）两侧不一致。
// 统一按 LF 生成，保证任何平台产物一致。
const source = readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n')
const generated = BANNER + source.split('\n').map(convertLine).join('\n')

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (current === generated) {
    console.log('tokens.rpx.css 与 tokens.css 同步 ✔')
    process.exit(0)
  }
  console.error(
    'FAIL：packages/tokens/src/tokens.rpx.css 与 tokens.css 不一致（产物过期或被人手改）。\n' +
      '      跑 `pnpm tokens:rpx` 重新生成。',
  )
  process.exit(1)
}

writeFileSync(OUT, generated, 'utf8')
const pxCount = (source.match(/\d+px\b/g) ?? []).length
console.log(`已生成 packages/tokens/src/tokens.rpx.css（转换 ${pxCount} 个 px 值 → rpx）`)
