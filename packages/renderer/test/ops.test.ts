/**
 * 批 5 D-P3-13 —— 上报队列纯逻辑：批量、定时、失败保留、超限丢最旧、dispose。
 * 全部用注入的假定时器，不依赖真实时间。
 */
import { describe, it, expect, vi } from 'vitest'
import { createOpsQueue, type OpsEventInput } from '../src/core/ops.js'

function fakeTimer() {
  const tasks: Array<{ fn: () => void; ms: number; cancelled: boolean }> = []
  const set = (fn: () => void, ms: number) => {
    const t = { fn, ms, cancelled: false }
    tasks.push(t)
    return t
  }
  const clear = (h: unknown) => {
    ;(h as { cancelled: boolean }).cancelled = true
  }
  return { tasks, set, clear, runAll: () => tasks.filter((t) => !t.cancelled).forEach((t) => t.fn()) }
}

function ev(name: string, type: OpsEventInput['type'] = 'event'): OpsEventInput {
  return { type, name }
}

describe('createOpsQueue — 批量与定时', () => {
  it('达到 maxBatch 立即发送，其余留在队列', async () => {
    const send = vi.fn(async () => {})
    const timer = fakeTimer()
    const q = createOpsQueue({ send, maxBatch: 3, flushMs: 1000, timer })
    q.push(ev('a'))
    q.push(ev('b'))
    expect(send).not.toHaveBeenCalled()
    q.push(ev('c'))
    await Promise.resolve()
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toHaveLength(3)
    expect(q.size).toBe(0)
    expect(q.sent).toBe(3)
    q.dispose()
  })

  it('定时器到点 flush 未满批次的事件', async () => {
    const send = vi.fn(async () => {})
    const timer = fakeTimer()
    const q = createOpsQueue({ send, maxBatch: 10, flushMs: 2000, timer })
    q.push(ev('a'))
    expect(timer.tasks).toHaveLength(1)
    expect(timer.tasks[0].ms).toBe(2000)
    timer.runAll()
    await Promise.resolve()
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    expect(q.size).toBe(0)
    q.dispose()
  })

  it('flushMs=0 → 不排定时器，仅手动 flush', async () => {
    const send = vi.fn(async () => {})
    const timer = fakeTimer()
    const q = createOpsQueue({ send, maxBatch: 10, flushMs: 0, timer })
    q.push(ev('a'))
    expect(timer.tasks).toHaveLength(0)
    await q.flush()
    expect(send).toHaveBeenCalledTimes(1)
    q.dispose()
  })
})

describe('createOpsQueue — 失败与容量', () => {
  it('发送失败保留本批事件，下次 flush 重试成功', async () => {
    const send = vi
      .fn<(batch: OpsEventInput[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValue(undefined)
    const timer = fakeTimer()
    const q = createOpsQueue({ send, maxBatch: 2, flushMs: 0, timer })
    q.push(ev('a'))
    q.push(ev('b'))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(q.failed).toBe(1)
    expect(q.size).toBe(2)
    await q.flush()
    expect(q.size).toBe(0)
    expect(q.sent).toBe(2)
    q.dispose()
  })

  it('超过 maxQueue 丢最旧并累计 dropped', async () => {
    const send = vi.fn(async () => {})
    const timer = fakeTimer()
    const q = createOpsQueue({ send, maxBatch: 100, flushMs: 0, maxQueue: 3, timer })
    q.push(ev('a'))
    q.push(ev('b'))
    q.push(ev('c'))
    q.push(ev('d'))
    expect(q.size).toBe(3)
    expect(q.dropped).toBe(1)
    await q.flush()
    const names = (send.mock.calls[0][0] as OpsEventInput[]).map((e) => e.name)
    expect(names).toEqual(['b', 'c', 'd'])
    q.dispose()
  })

  it('dispose 后 push 不再入队，定时器被清', async () => {
    const send = vi.fn(async () => {})
    const timer = fakeTimer()
    const q = createOpsQueue({ send, maxBatch: 10, flushMs: 1000, timer })
    q.push(ev('a'))
    q.dispose()
    expect(timer.tasks[0].cancelled).toBe(true)
    q.push(ev('b'))
    expect(q.size).toBe(1)
    q.dispose()
  })

  it('send 抛同步异常也不会从 push 冒泡', () => {
    const send = () => {
      throw new Error('boom')
    }
    const timer = fakeTimer()
    const q = createOpsQueue({ send, maxBatch: 1, flushMs: 0, timer })
    expect(() => q.push(ev('a'))).not.toThrow()
    q.dispose()
  })
})
