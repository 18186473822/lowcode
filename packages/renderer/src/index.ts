/**
 * @lc/renderer —— 渲染引擎（Schema → 页面）
 *
 * 分两层：
 *  1. **纯逻辑层**（`src/core`，本包导出的全部内容）
 *     不依赖 uni-app / Vue，所有副作用通过 `RuntimeHost` 注入，可 100% 单测。
 *  2. **uni-app 组件层**（`src/uni`，不参与 tsc 编译）
 *     `lc-renderer.vue` / `lc-node.vue` / `material-map.ts`，需放入 uni-app 工程使用。
 *     状态：✅ H5 实测通过（`packages/runtime`：渲染 / 表达式 / 联动 / 动作），
 *     `build:mp-weixin` 产物已验；小程序真机待验（台账 L-5）。
 *
 * 核心链路：
 * ```
 * PageSchema → buildTree → RenderNode
 *              + Linkage.collect（依赖收集）
 *   ↓ 每次 formData 变更
 * resolveTree(RenderNode, scope) → ResolvedNode[]（loop 展开 + condition + 权限 + 错误挂载）
 *   ↓ 组件渲染
 * 用户交互 → PageController.setField / handleEvent → 联动 + 校验 → 重新 resolve
 * ```
 */
export * from './core/types.js'
export * from './core/path.js'
export * from './core/context.js'
export * from './core/build.js'
export * from './core/linkage.js'
export * from './core/resolve.js'
export * from './core/validator.js'
export * from './core/datasource.js'
export * from './core/state-kind.js'
export * from './core/action.js'
export * from './core/lifecycle.js'
export * from './core/theme-vars.js'
export * from './core/ops.js'
export * from './core/perf.js'
export * from './core/controller.js'
