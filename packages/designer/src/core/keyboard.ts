/**
 * keyboard.ts —— 设计器全局快捷键意图分发（批 4，PLANS.md §2）。
 *
 * 纯函数：`KeyboardEvent` → 意图枚举；App.vue 只做「监听 → 分发 → 调 store」接线，
 * 逻辑本体可单测（输入态排除 / 修饰键组合 / 键位映射）。
 *
 * 键位（Ctrl 与 Meta/Cmd 等价，兼容 macOS）：
 * - `Delete` / `Backspace`        → 删除选中（**输入态不拦截**：交给文本编辑）
 * - `Ctrl/Cmd+Z`                  → 撤销
 * - `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` → 重做
 * - `Ctrl/Cmd+C` / `X` / `V`      → 复制 / 剪切 / 粘贴
 */

export type DesignerKeyIntent =
  | 'delete'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'

/** 输入/可编辑目标：任何键都不拦截（文本原生编辑与原生撤销优先） */
function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true
  if (el.isContentEditable === true) return true
  // 真实浏览器：contentEditable 反射属性；jsdom：只设自有属性、不反射为 attribute —— 双检查覆盖
  if (el.contentEditable === 'true') return true
  const attr = typeof el.getAttribute === 'function' ? el.getAttribute('contenteditable') : null
  return attr !== null && attr !== 'false'
}

/**
 * 解析键盘事件 → 意图；无匹配返回 `null`（不拦截）。
 * 输入态一律返回 `null`（含 Ctrl+Z —— 输入框内让给原生文本撤销）。
 */
export function resolveKeyIntent(e: KeyboardEvent): DesignerKeyIntent | null {
  if (isEditable(e.target)) return null

  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase()
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
    if (key === 'y') return 'redo'
    if (key === 'c') return 'copy'
    if (key === 'x') return 'cut'
    if (key === 'v') return 'paste'
    return null
  }

  if (e.key === 'Delete' || e.key === 'Backspace') return 'delete'
  return null
}
