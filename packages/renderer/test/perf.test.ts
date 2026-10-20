/**
 * 批 5 D-P3-14 —— Profiler 展示层纯函数：取整、摘要拼接、节点计数。
 */
import { describe, it, expect } from 'vitest'
import { countNodes, formatPerf, roundMs } from '../src/core/perf.js'

describe('roundMs', () => {
  it('四舍五入到整数毫秒', () => {
    expect(roundMs(12.4)).toBe(12)
    expect(roundMs(12.6)).toBe(13)
  })

  it('负数 / NaN / Infinity 归 0（UI 不出现 NaNms）', () => {
    expect(roundMs(-3)).toBe(0)
    expect(roundMs(Number.NaN)).toBe(0)
    expect(roundMs(Number.POSITIVE_INFINITY)).toBe(0)
    expect(roundMs(undefined)).toBe(0)
  })
})

describe('formatPerf', () => {
  it('全字段拼接（固定顺序：加载 → 构建 → 渲染 → 挂载 → 节点）', () => {
    expect(
      formatPerf({ schemaMs: 120.4, buildMs: 3, renderMs: 45, mountMs: 8, nodes: 33 }),
    ).toBe('加载 120ms · 构建 3ms · 渲染 45ms · 挂载 8ms · 33 节点')
  })

  it('缺项自动省略', () => {
    expect(formatPerf({ schemaMs: 9 })).toBe('加载 9ms')
    expect(formatPerf({ nodes: 0 })).toBe('0 节点')
  })

  it('全空返回空串（调用方据此隐藏徽标）', () => {
    expect(formatPerf({})).toBe('')
  })
})

describe('countNodes', () => {
  it('含根节点递归计数', () => {
    const tree = {
      id: 'root',
      children: [{ id: 'a' }, { id: 'b', children: [{ id: 'c' }] }],
    }
    expect(countNodes(tree)).toBe(4)
  })

  it('非对象 / 无 children 安全', () => {
    expect(countNodes(null)).toBe(0)
    expect(countNodes('x')).toBe(0)
    expect(countNodes({ id: 'solo' })).toBe(1)
  })
})
