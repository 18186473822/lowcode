/**
 * @lc/tokens —— 跨端 UI 设计令牌包
 *
 * 本包只做一件事：持有设计令牌的**唯一真相源**。
 *   - `./tokens.css` —— CSS 自定义属性（`:root` 亮色 + `[data-theme='dark']` 暗色），
 *     由各端入口引入；所有 UI 代码只允许消费 `var(--lc-*)`，禁止硬编码色值。
 *   - `TOKEN_LITERAL` —— 少数「属性值必须是字面量」场景（如 `input[type=color]`）的常量，
 *     与 tokens.css 的同步由 test/tokens.test.ts 强制校验。
 *
 * 一致性门禁（仓库根）：
 *   pnpm tokens:check   —— 设计稿导出 ↔ tokens.css 的值比对
 *   pnpm design:check   —— 上面那条 + 全仓硬编码色值扫描
 *
 * 规范：docs/design-system.md
 */
export { TOKEN_LITERAL } from './tokens'
