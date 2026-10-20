/**
 * 运行时埋点上报器（Phase 3 批 5，D-P3-13）。
 *
 * 复用 `@lc/renderer` 的纯逻辑队列（`createOpsQueue`），本文件只做三件事：
 *  ① 用 `uni.request` 实现发送（带会话 token；失败静默，不弹错误 —— 埋点不打扰用户）；
 *  ② 把 `pageId / pageVersion / source` 等页面级上下文自动附加到每条事件；
 *  ③ 暴露 `error / perf / event` 三个语义化方法，页面按场景调用。
 *
 * 上下文对象 `meta` 是**引用**：页面拉取 Schema 前就能创建上报器（这样加载失败也能上报），
 * 拿到版本号后再 `meta.pageVersion = ...` 即可，无需重建。
 */
import { createOpsQueue, type OpsEventInput, type OpsQueue, type OpsSource } from '@lc/renderer'
import { API_BASE, getToken } from '@/api'

export interface OpsReporterMeta {
  pageId?: string
  pageVersion?: number | 'draft'
  /** 端标识：默认 runtime（设计器若复用本模块则传 designer） */
  source?: OpsSource
}

export interface OpsReporter {
  /** 业务错误（表达式求值失败 / 动作失败 / Schema 加载失败…） */
  error(name: string, message: string, detail?: Record<string, unknown>): void
  /** 性能采样（schema-load / render …） */
  perf(name: string, durationMs: number, detail?: Record<string, unknown>): void
  /** 普通事件（不支持的动作等） */
  event(name: string, detail?: Record<string, unknown>): void
  /** 立即发送（页面隐藏 / 卸载时调用） */
  flush(): Promise<void>
  dispose(): void
  /** 暴露队列便于诊断（size/sent/failed） */
  readonly queue: OpsQueue
}

/** 单事件体积上限：与服务端 OPS_DETAIL_MAX 对齐，客户端先截断可少传无用字节 */
const DETAIL_MAX = 2000
/** 消息上限：与服务端 MESSAGE_MAX 对齐 */
const MESSAGE_MAX = 500

export function createUniOpsReporter(meta: OpsReporterMeta = {}): OpsReporter {
  const queue = createOpsQueue({
    maxBatch: 10,
    flushMs: 2000,
    maxQueue: 50,
    send: sendBatch,
  })

  function base(): Omit<OpsEventInput, 'type' | 'name'> {
    return {
      ...(meta.pageId ? { pageId: meta.pageId } : {}),
      ...(meta.pageVersion !== undefined ? { pageVersion: meta.pageVersion } : {}),
      source: meta.source ?? 'runtime',
    }
  }

  return {
    error(name, message, detail) {
      queue.push({
        ...base(),
        type: 'error',
        name,
        message: clip(message, MESSAGE_MAX),
        ...(detail ? { detail: shrink(detail) } : {}),
      })
    },
    perf(name, durationMs, detail) {
      queue.push({
        ...base(),
        type: 'perf',
        name,
        durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
        ...(detail ? { detail: shrink(detail) } : {}),
      })
    },
    event(name, detail) {
      queue.push({ ...base(), type: 'event', name, ...(detail ? { detail: shrink(detail) } : {}) })
    },
    flush: () => queue.flush(),
    dispose: () => queue.dispose(),
    queue,
  }
}

/** 发送一批：2xx 视为成功；其余（含 401）抛错 → 队列保留、下次再试 */
function sendBatch(events: OpsEventInput[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const token = getToken()
    uni.request({
      url: `${API_BASE}/ops/events`,
      method: 'POST',
      data: { events },
      timeout: 5000,
      header: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve()
        else reject(new Error(`ops-report ${res.statusCode}`))
      },
      fail: () => reject(new Error('ops-report network')),
    })
  })
}

function clip(text: string, max: number): string {
  const s = String(text)
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

/** detail 先序列化探体积：超限/循环引用 → 只留可读预览（绝不因埋点自身抛错） */
function shrink(detail: Record<string, unknown>): Record<string, unknown> {
  try {
    const json = JSON.stringify(detail)
    if (json.length <= DETAIL_MAX) return detail
    return { truncated: true, preview: clip(json, DETAIL_MAX) }
  } catch {
    return { truncated: true, reason: 'detail 不可序列化' }
  }
}
