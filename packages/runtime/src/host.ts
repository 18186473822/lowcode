import type { RuntimeHost } from '@lc/renderer'
import { API_ORIGIN, getToken } from './api'

function qs(params?: Record<string, unknown>): string {
  if (!params) return ''
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

/**
 * RuntimeHost 的 uni-app 实现 —— 渲染引擎与端能力的唯一接缝。
 * 必填 5 项（toast/confirm/navigate/back/request）全实现；
 * 可选项（copy/scan/...）按需追加，缺失时动作自动降级提示（方案 4.1）。
 */
export function createUniHost(): RuntimeHost {
  return {
    toast(opts) {
      uni.showToast({
        title: opts.text,
        icon: opts.icon && opts.icon !== 'none' ? opts.icon : 'none',
        duration: opts.duration ?? 1500,
      })
    },

    confirm(opts) {
      return new Promise<boolean>((resolve) => {
        uni.showModal({
          title: '确认',
          content: opts.text,
          confirmText: opts.confirmText ?? '确定',
          cancelText: opts.cancelText ?? '取消',
          success: (r) => resolve(!!r.confirm),
          fail: () => resolve(false),
        })
      })
    },

    navigate(target) {
      const url = `/pages/${target.pageId}/index${qs(target.params)}`
      if (target.mode === 'redirect') return uni.redirectTo({ url })
      if (target.mode === 'switchTab') return uni.switchTab({ url })
      return uni.navigateTo({ url })
    },

    back() {
      uni.navigateBack({ delta: 1, fail: () => void 0 })
    },

    async request(req) {
      // 数据源/动作发出的相对地址（如 /api/v1/models/:id/records）统一补服务端 origin，
      // 并在有会话时自动携带 Bearer —— 引擎侧（renderer）对登录态零感知
      const url = /^https?:\/\//.test(req.url) ? req.url : `${API_ORIGIN}${req.url}`
      const token = getToken()
      const header: Record<string, string> = {
        ...(req.headers ?? {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      }
      return new Promise((resolve) => {
        uni.request({
          url,
          method: req.method,
          data: req.data as Record<string, unknown> | undefined,
          header,
          timeout: req.timeout,
          success: (r) => resolve({ statusCode: r.statusCode, data: r.data }),
          fail: () => resolve({ statusCode: 0, data: null }),
        })
      })
    },

    copy(text) {
      uni.setClipboardData({
        data: text,
        success: () => uni.showToast({ title: '已复制', icon: 'none' }),
      })
    },
  }
}
