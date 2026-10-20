/**
 * 审批类物料的宿主注入（Phase 3 批 2，D-P3-4）。
 *
 * 与 renderer 的 `LC_DESIGN_KEY` 同款 provide/inject 范式：lc-renderer provide，
 * ApprovalBar / Timeline inject —— 不走逐层 prop 透传（天然免疫递归处漏绑）。
 *
 * 依赖方向：materials 定义最小结构接口（不反向依赖 @lc/renderer），renderer 侧
 * `options.host` 结构兼容直接 provide —— renderer → materials 单向依赖保持不破。
 */
import type { InjectionKey } from 'vue'

/** 宿主最小面：审批物料只用 request；confirm 可选（PC/降级确认走它，缺省则系统弹窗不可用时不阻断） */
export interface LcFlowHost {
  request(req: {
    method: string
    url: string
    data?: unknown
    headers?: Record<string, string>
    timeout?: number
  }): Promise<{ statusCode: number; data: unknown }>
  confirm?(opts: {
    text: string
    confirmText?: string
    cancelText?: string
  }): Promise<boolean>
}

/**
 * 审批物料数据通道 key。
 * 未注入（designer 画布未 provide / 老版本宿主）时物料走空态占位 —— 零崩溃。
 */
export const LC_FLOW_HOST_KEY: InjectionKey<LcFlowHost> = Symbol('lc-flow-host')
