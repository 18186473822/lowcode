/**
 * 埋点 / 错误事件上报队列（Phase 3 批 5，D-P3-12 / D-P3-13）。
 *
 * 纯逻辑：**不依赖 uni / DOM / fetch** —— 发送函数由宿主注入（runtime 用 `uni.request`，
 * 测试用 spy）。因此批量、定时、失败重排队、队列上限等策略可 100% 单测。
 *
 * 设计约束（埋点不得反噬业务）：
 *  - `push` 永不抛错、永不阻塞调用方；
 *  - `send` 失败 → 本批留在队列等下次 flush（不丢），但连续失败不重试风暴；
 *  - 队列超过 `maxQueue` → 丢**最旧**事件并累计 `dropped`（保最新现场）。
 */

/** 事件类型：错误 / 性能 / 普通事件（三者共用一张表，查询用 type 过滤） */
export type OpsEventType = 'error' | 'perf' | 'event'

/** 事件来源端：运行时报错与设计器行为分开统计 */
export type OpsSource = 'runtime' | 'designer' | 'server'

/** 上报载荷（服务端补齐 id / at / userId） */
export interface OpsEventInput {
  type: OpsEventType
  /** 事件名，如 `expr` / `schema-load` / `render` / `unsupported-action`（≤64 字符） */
  name: string
  pageId?: string
  /** 页面版本：数字 = 已发布版本，`'draft'` = 草稿回退 */
  pageVersion?: number | 'draft'
  source?: OpsSource
  /** 错误消息（error 事件必填；≤500 字符） */
  message?: string
  /** 耗时（perf 事件必填，毫秒） */
  durationMs?: number
  /** 附加现场（会被服务端序列化并截断到 2000 字符） */
  detail?: Record<string, unknown>
}

export interface OpsQueueOptions {
  /** 发送一批事件；抛错 = 失败（本批保留，待下次 flush 重试） */
  send: (events: OpsEventInput[]) => Promise<void> | void
  /** 攒够多少条立即发送（默认 10） */
  maxBatch?: number
  /** 定时发送间隔毫秒（默认 2000；`0` = 只靠 maxBatch / 手动 flush） */
  flushMs?: number
  /** 队列上限（默认 100，超出丢最旧） */
  maxQueue?: number
  /** 兜底计时器注入（测试用假定时器；缺省 setTimeout/clearTimeout） */
  timer?: {
    set: (fn: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  }
}

export interface OpsQueue {
  push(event: OpsEventInput): void
  /** 立即发送（等待在途批次完成；失败静默） */
  flush(): Promise<void>
  /** 清定时器（不发送） */
  dispose(): void
  /** 当前待发送条数 */
  readonly size: number
  /** 因队列超限被丢弃的条数 */
  readonly dropped: number
  /** 已成功发送的条数 */
  readonly sent: number
  /** 最近一次发送失败的累计次数 */
  readonly failed: number
}

export function createOpsQueue(opts: OpsQueueOptions): OpsQueue {
  const maxBatch = Math.max(1, opts.maxBatch ?? 10)
  const maxQueue = Math.max(1, opts.maxQueue ?? 100)
  const flushMs = opts.flushMs ?? 2000
  const setTimer =
    opts.timer?.set ??
    ((fn: () => void, ms: number) => setTimeout(fn, ms) as unknown)
  const clearTimerFn =
    opts.timer?.clear ??
    ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let queue: OpsEventInput[] = []
  let handle: unknown = null
  let chain: Promise<void> = Promise.resolve()
  let dropped = 0
  let sent = 0
  let failed = 0
  let disposed = false

  function clearTimer(): void {
    if (handle !== null) {
      clearTimerFn(handle)
      handle = null
    }
  }

  function schedule(): void {
    if (disposed || flushMs <= 0 || handle !== null || queue.length === 0) return
    handle = setTimer(() => {
      handle = null
      void flush()
    }, flushMs)
  }

  function push(event: OpsEventInput): void {
    if (disposed) return
    queue.push(event)
    while (queue.length > maxQueue) {
      queue.shift()
      dropped += 1
    }
    if (queue.length >= maxBatch) {
      clearTimer()
      void flush()
      return
    }
    schedule()
  }

  function flush(): Promise<void> {
    clearTimer()
    chain = chain.then(async () => {
      while (queue.length > 0) {
        const batch = queue.slice(0, maxBatch)
        try {
          await opts.send(batch)
          queue = queue.slice(batch.length)
          sent += batch.length
        } catch {
          // 失败不丢事件：保留本批，等下一次 push / flush；避免重试风暴
          failed += 1
          break
        }
      }
      schedule()
    })
    return chain
  }

  function dispose(): void {
    disposed = true
    clearTimer()
  }

  return {
    push,
    flush,
    dispose,
    get size() {
      return queue.length
    },
    get dropped() {
      return dropped
    },
    get sent() {
      return sent
    },
    get failed() {
      return failed
    },
  }
}
