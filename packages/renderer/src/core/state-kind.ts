/**
 * state-kind.ts —— 移动端异常状态的**分类与文案**（纯函数，design-system.md §5）
 *
 * 为什么需要它：renderer 里取数失败统统一 throw Error，消息形如「请求失败（401）：url」。
 * 若不分类，401（该去登录）、403（该提示无权限）、网络中断（该提示重试）会全部显示成
 * 同一句红字 —— 用户拿到信息却不知道该做什么，正是 §5 禁止的「无声失败」。
 *
 * 设计约束：
 *   - 纯函数，不依赖 uni API / DOM，可在 vitest(node) 下单测；
 *   - 兼容两种错误来源：结构化 `ApiError`（runtime 壳层，带 status）与
 *     renderer 内部 throw 的 Error（状态码只存在于消息文本里，见 statusOf）。
 */
import type { DataSourceStatus } from './types'

export type StateKind = 'empty' | 'loading' | 'error' | 'no-auth' | 'forbidden' | 'not-found'

export interface StateInfo {
  kind: StateKind
  /** 主标题（一句话说清发生了什么） */
  title: string
  /** 补充说明（告诉用户能做什么；不复述用户已看到的信息） */
  text: string
  /** 出口按钮文案；缺省表示由调用方决定（如禁用一个按钮） */
  actionText?: string
}

/** 从错误对象里提取 HTTP 状态码；取不到返回 0（渲染层据此判「网络层失败」） */
export function statusOf(err: unknown): number {
  const e = err as { status?: unknown; statusCode?: unknown } | null | undefined
  if (typeof e?.status === 'number') return e.status
  if (typeof e?.statusCode === 'number') return e.statusCode
  const m = err instanceof Error ? err.message : String(err ?? '')
  const hit = m.match(/[（(]\s*(\d{3})\s*[）)]/)
  return hit ? Number(hit[1]) : 0
}

/** 消息文本（仅 Error 有 message；裸对象视为「无消息」） */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : ''
}

/** 网络层失败的文案特征（连不上 / 超时 / 被中断） */
const NETWORK_RE =
  /network|fetch|timeout|abort|无法连接|连接失败|econnrefused|socket|request:fail|服务已启动|服务端/

/** 是否网络层失败 —— 区别于「服务端返回了错误码」。
 *
 * ⚠️ 本仓的网络失败契约：`host.request` 在 uni.request fail 时**不 reject**，而是
 * `resolve({ statusCode: 0 })`（见 `packages/runtime/src/host.ts`）。因此 `status === 0`
 * 且**没有**可读消息时，就是网络失败的信号；但「配置缺少 modelId」这类非网络异常同样
 * 没有状态码，只是它有明确消息，故按消息特征区分，避免误报成「网络中断」。
 */
export function isNetworkError(err: unknown): boolean {
  const m = messageOf(err).toLowerCase()
  if (statusOf(err) === 0) return m === '' || NETWORK_RE.test(m)
  return NETWORK_RE.test(m)
}

/**
 * 原始错误信息（用于「就地显示可核对信息」，§5 要求错误文案含可核对内容）。
 * 兼容三种来源：Error、带 status/statusCode 的响应对象、其他值。
 */
export function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.message
  const e = err as { status?: unknown; statusCode?: unknown } | null | undefined
  const status = typeof e?.status === 'number' ? e.status : typeof e?.statusCode === 'number' ? e.statusCode : null
  if (status !== null) return `服务端返回 ${status}`
  return String(err ?? '未知错误')
}

/**
 * 把取数失败翻译成「状态 + 标题 + 说明 + 出口」。
 * @param ctx.pageId          页面 id，用于 403 文案里指明是哪个页面
 * @param ctx.notFoundTitle   覆盖 404 的标题（详情页取不到**记录**时用，避免说成「页面不存在」）
 * @param ctx.notFoundText    覆盖 404 的说明
 */
export function classifyError(
  err: unknown,
  ctx?: { pageId?: string; notFoundTitle?: string; notFoundText?: string },
): StateInfo {
  const status = statusOf(err)
  const page = ctx?.pageId ? `（${ctx.pageId}）` : ''

  if (status === 401) {
    return {
      kind: 'no-auth',
      title: '登录已过期',
      text: '为保护你的数据，会话已失效。重新登录后会回到当前页面，已填的内容不会丢。',
      actionText: '去登录',
    }
  }
  if (status === 403) {
    return {
      kind: 'forbidden',
      title: '无权访问',
      text: `你没有该页面${page}的访问权限。如需开通，请联系管理员在「权限管理」里授权。`,
      actionText: '返回菜单',
    }
  }
  if (status === 404) {
    return {
      kind: 'not-found',
      title: ctx?.notFoundTitle ?? '页面不存在',
      text: ctx?.notFoundText ?? `该页面${page}已被删除或从未创建。`,
    }
  }
  if (isNetworkError(err)) {
    return {
      kind: 'error',
      title: '网络连接中断',
      text: '服务端暂时连不上。已经加载出来的内容仍在，恢复后直接重试即可。',
      actionText: '重试',
    }
  }
  return { kind: 'error', title: '加载失败', text: errorDetail(err), actionText: '重试' }
}

/** 空状态：给出口，不只写「暂无数据」（§5） */
export function emptyState(text: string, actionText?: string): StateInfo {
  return { kind: 'empty', title: '还没有数据', text, actionText }
}

/** 加载中：骨架屏优先；total 用于「已加载 N 条」的文案 */
export function loadingState(total: number): StateInfo {
  return {
    kind: 'loading',
    title: total > 0 ? `正在加载更多…` : '正在加载…',
    text: total > 0 ? `已加载 ${total} 条` : '',
  }
}

/** datasource 的状态 → 状态视图类型（供 lc-node 等复用） */
export function fromStatus(status: DataSourceStatus): StateKind {
  return status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'empty'
}
