/**
 * 画布 mock 宿主（RuntimeHost）
 *
 * 批 1：design 态动作已被 lc-node 遮罩/guard 拦截，host 仅作类型兜底与调试输出。
 * 批 2 预览态接入真实宿主（toast → ElMessage 等）。
 */
import type { RuntimeHost } from '@lc/renderer'

export const mockHost: RuntimeHost = {
  toast: (opts) => {
    console.info('[host.toast]', opts.icon ?? 'none', opts.text)
  },
  confirm: async () => true,
  navigate: () => {
    console.info('[host.navigate] 批 2 预览态接入')
  },
  back: () => {},
  request: async () => ({ statusCode: 200, data: null }),
}
