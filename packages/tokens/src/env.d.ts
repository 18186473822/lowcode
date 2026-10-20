/**
 * env.d.ts —— 令牌包的类型补充（当前无需额外声明）
 *
 * 说明：测试用 `node:fs` 直接读 tokens.css 文本做值比对（见 test/tokens.test.ts）。
 * 曾尝试 vite 的 `?raw` 导入，但 vitest 默认把 CSS 导入桩成空对象（`test.css` 默认 false），
 * 读到的不是原文 —— 故退回文件读取，并显式声明 `@types/node`。
 */
export {}
