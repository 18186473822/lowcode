/**
 * basic.ts —— 直出型 uni 标签的 PC 兜底（D-A1 修正，实测 B-22 后）
 *
 * 实测结论：`view / text / image / switch` **同时是 SVG 标签**，Vue 编译期按保留元素
 * 直出（`resolveComponent` 警告 "Do not use built-in or reserved HTML elements"）——
 * **组件 shim 对这 4 个标签无效**；而 `picker / radio / radio-group` 不在保留名单，组件 shim 生效。
 *
 * 因此直出组改用两层兜底（不替换节点 → Vue diff 安全）：
 *  - view / text：全局 CSS 修正块级/行内语义（见 shim.css）；
 *  - image / switch：`enhance.ts` 运行时增强器（attribute 样式 + 事件派发）。
 * 本文件保留 `imageModeFit` 供增强器复用。
 */

/** uni mode → CSS background-size 映射（image 背景图升级用） */
export const IMAGE_FIT: Record<string, string> = {
  aspectFill: 'cover',
  aspectFit: 'contain',
  widthFix: 'contain',
  scaleToFill: '100% 100%',
}
