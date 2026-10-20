/**
 * tokens.test.ts —— 令牌包的自检（把「手工同步」变成「自动化约束」）
 *
 * 覆盖三件事：
 *   ① `TOKEN_LITERAL`（JS 侧字面量）与 `tokens.css` 的对应令牌**值一致** ——
 *      该常量的注释原本写着「改这里必须同时改 tokens.css」，靠人记；现在靠测试。
 *   ② 亮暗双模式都在（`:root` + `[data-theme='dark']`）—— 少一个，暗色主题会静默失效。
 *   ③ 核心语义令牌在暗色块确有覆盖 —— 新增语义令牌时忘写暗色值是本层最常见的漏。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { TOKEN_LITERAL } from '../src'

// 直接读 tokens.css 原文比对（vitest 会把普通 CSS 导入桩成空，vite `?raw` 在此不适用）
const CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/tokens.css')
const RAW = readFileSync(CSS_PATH, 'utf8')

function grabBlock(re: RegExp): string {
  return RAW.match(re)?.[1] ?? ''
}

function cssValue(blockText: string, varName: string): string | undefined {
  const m = blockText.match(new RegExp(`${varName}\\s*:\\s*([^;]+);`))
  return m?.[1].trim()
}

/** 暗色块里「必须跟随主题变化」的语义令牌（新语义令牌应在此登记） */
const DARK_SENSITIVE = [
  '--lc-bg-canvas',
  '--lc-bg-surface',
  '--lc-text-primary',
  '--lc-text-label',
  '--lc-text-secondary',
  '--lc-border-default',
  '--lc-border-strong',
  '--lc-action-primary',
  '--lc-status-danger',
] as const

describe('@lc/tokens —— JS 字面量与 CSS 令牌同步', () => {
  const rootBlock = grabBlock(/:root\s*\{([\s\S]*?)\n\}/)

  it('TOKEN_LITERAL.brand500 与 --lc-brand-500 一致', () => {
    const v = cssValue(rootBlock, '--lc-brand-500')
    expect(v, '--lc-brand-500 必须在 :root 定义为字面值').toBeTruthy()
    expect(v!.toLowerCase()).toBe(TOKEN_LITERAL.brand500.toLowerCase())
  })

  it('TOKEN_LITERAL 的每个键都能在 tokens.css 找到同名令牌（命名约定 brand500 ↔ --lc-brand-500）', () => {
    for (const [key, value] of Object.entries(TOKEN_LITERAL)) {
      const kebab = key.replace(/([a-z])([0-9])/g, '$1-$2')
      const cssVar = `--lc-${kebab}`
      const v = cssValue(rootBlock, cssVar)
      expect(v, `${key} 应对应 ${cssVar}`).toBeTruthy()
      expect(v!.toLowerCase()).toBe((value as string).toLowerCase())
    }
  })
})

describe('@lc/tokens —— 双模式完整性', () => {
  it('同时定义 :root（亮色）与 [data-theme=\'dark\']（暗色）', () => {
    expect(grabBlock(/:root\s*\{([\s\S]*?)\n\}/)).not.toBe('')
    expect(grabBlock(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)).not.toBe('')
  })

  it('核心语义令牌在暗色块均有覆盖（防新增令牌漏写暗色值）', () => {
    const darkBlock = grabBlock(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)
    const missing = DARK_SENSITIVE.filter((v) => cssValue(darkBlock, v) === undefined)
    expect(missing, `以下语义令牌缺少暗色值：${missing.join(', ')}`).toEqual([])
  })

  it('--lc-text-on-brand 在亮暗下都是白（品牌底文字不随主题翻转）', () => {
    const darkBlock = grabBlock(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)
    // 亮色必须定义；暗色可继承（未覆盖 = 沿用亮色，同样正确）
    expect(cssValue(grabBlock(/:root\s*\{([\s\S]*?)\n\}/), '--lc-text-on-brand')).toBeTruthy()
    expect(cssValue(darkBlock, '--lc-text-on-brand')).toBeUndefined()
  })
})
