/**
 * design.ts —— 设计态共享状态（D-A2）
 *
 * lc-renderer 在 `mode='design'` 时 provide 一份响应式设计状态，
 * lc-node 通过 **inject** 读取 —— 不走逐层 prop 透传，天然免疫「递归处忘绑事件」
 * 类缺陷（B-19 同款坑的设计规避）。
 *
 * 注意：`select` 事件仍需逐层冒泡（外部设计器要知道选中了谁），
 * 递归处必须绑定 `@select` —— 已有组件测试回归用例锁死。
 * mode 为运行期静态配置（画布固定 design / 运行时固定 runtime），不做动态切换。
 */
import type { InjectionKey } from 'vue'

export interface DesignState {
  /** 当前选中节点 id（根节点 id 为 root） */
  selectedId: string
}

/** null = runtime 态（不渲染遮罩、不拦截动作）；对象 = design 态 */
export const LC_DESIGN_KEY: InjectionKey<DesignState | null> = Symbol('lc-design')
