/**
 * shim/index.ts —— uni-shim 注册入口（D-A1 · B-22 修正版）
 *
 * 实测结论（B-22）：Vue 把 **同时是 SVG 标签**的 `view/text/image/switch` 当保留元素
 * 直出，组件注册无效（运行时报 "Do not use built-in or reserved HTML elements"）——
 * 这 4 个走「CSS 兜底（view/text）+ 运行时增强器（image/switch，见 enhance.ts）」。
 *
 * 组件 shim 只对**不在保留名单**的标签生效：picker / radio / radio-group。
 * 事件载荷与 uni 同构 → 物料零改动（input/textarea/button 是内建标签，原生可用，
 * 物料侧已做 e.detail / e.target 双端兼容）。
 */
import type { App } from 'vue'
import { PickerShim } from './picker'
import { RadioShim, RadioGroupShim } from './radio'
import { installUniApi } from './uni-api'

/** 组件 shim 生效组（非保留标签） */
export const UNI_SHIMS = {
  picker: PickerShim,
  radio: RadioShim,
  'radio-group': RadioGroupShim,
} as const

export function registerUniShim(app: App): void {
  for (const [name, component] of Object.entries(UNI_SHIMS)) {
    app.component(name, component)
  }
  installUniApi()
}

export { PickerShim, RadioShim, RadioGroupShim, installUniApi }
export { installEnhancer } from './enhance'
export { IMAGE_FIT } from './basic'
