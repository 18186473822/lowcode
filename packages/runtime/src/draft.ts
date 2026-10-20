/**
 * 表单草稿的 uni storage 实现（Phase 3 批 3 / D-P3-7）。
 *
 * - key = `lc_draft:${username}:${pageId}` —— 按用户隔离（同设备切换账号不串草稿）；
 * - 值 = `{ data, at }`；超过 7 天过期（静默清除，不再提示恢复）；
 * - 存储失败（配额 / 隐私模式）吞掉：controller 侧同样兜底，草稿是体验增强，不阻断表单。
 */
import type { DraftStore } from '@lc/renderer'
import { getUser } from './api'

const PREFIX = 'lc_draft'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function createUniDraft(pageId: string): DraftStore {
  const key = `${PREFIX}:${getUser()?.username || 'anon'}:${pageId}`
  return {
    load() {
      try {
        const raw = uni.getStorageSync(key)
        if (!raw) return null
        const parsed =
          typeof raw === 'string'
            ? (JSON.parse(raw) as { data?: Record<string, unknown>; at?: number })
            : (raw as { data?: Record<string, unknown>; at?: number })
        if (!parsed?.data || typeof parsed.at !== 'number') return null
        if (Date.now() - parsed.at > MAX_AGE_MS) {
          uni.removeStorageSync(key)
          return null
        }
        return parsed.data
      } catch {
        return null
      }
    },
    save(data) {
      try {
        uni.setStorageSync(key, JSON.stringify({ data, at: Date.now() }))
      } catch {
        // 配额 / 隐私模式：忽略
      }
    },
    clear() {
      try {
        uni.removeStorageSync(key)
      } catch {
        // 忽略
      }
    },
  }
}
