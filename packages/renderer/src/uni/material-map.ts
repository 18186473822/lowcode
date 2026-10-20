/**
 * uni-app 组件层骨架 ⚠️ **未经真机验证**
 *
 * 本文件是《落地方案》4.3「componentName → 真实组件」的映射实现。
 *
 * ## 为什么必须静态映射
 * 微信小程序**不支持 `<component :is>` 动态组件**，也不能运行时 `import()` 任意路径。
 * 因此所有物料必须在**编译期静态 import**，运行时用 `v-if` 链分发（见 lc-node.vue）。
 *
 * ## 使用前提（尚未验证的三项，Phase 0 第 2 批遗留）
 * 1. 本文件需在 uni-app 工程内，且物料已用 easycom 注册（pages.json）；
 * 2. 构建期需扫描 Schema 裁剪未使用物料，否则小程序包体积会超限；
 * 3. 需在**微信小程序真机**验证 v-if 分发的渲染与性能。
 *
 * ## 与测试的关系
 * 本目录不参与 tsc 编译与 vitest —— 逻辑正确性由 `src/core` 的单测保证，
 * 组件层只做「把已解析的数据交给物料」这一层薄适配。
 */
// import LcText from '../../../materials/basic/text/index.vue'
// import LcInput from '../../../materials/form/input/index.vue'
// ... 物料库（Phase 1）就绪后由 schema-cli 自动生成本文件，请勿手改

/** componentName → 组件的静态映射 */
export const MATERIAL_MAP = {
  // Text: LcText,
  // Input: LcInput,
} as const

export type MaterialName = keyof typeof MATERIAL_MAP

/** 校验 Schema 中的 componentName 是否都已注册（构建期/启动期调用） */
export function assertMaterials(names: string[]): { ok: boolean; missing: string[] } {
  const missing = names.filter((n) => !(n in MATERIAL_MAP))
  return { ok: missing.length === 0, missing }
}
