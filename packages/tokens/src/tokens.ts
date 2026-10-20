/**
 * tokens.ts —— 设计令牌的 **JS 侧字面值**（仅限 CSS 变量无法覆盖的场景）
 *
 * 绝大多数场景应使用 CSS 变量（见 ./tokens.css）；本文件只为少数「属性值必须是
 * 字面量」的 API 兜底，例如 `input[type=color]` 的 value 必须是 `#RRGGBB`。
 *
 * ⚠️ 与 tokens.css 保持同步：改这里必须同时改 tokens.css 的对应令牌。
 *    同步关系由脚本可比对（命名一致：brand500 ↔ --lc-brand-500）。
 */

export const TOKEN_LITERAL = {
  /** ↔ tokens.css `--lc-brand-500`（主品牌色） */
  brand500: '#2b6de8',
} as const
