/**
 * anchor 锚点算法单测 —— 设计器批 2（方案 4.5：纯几何，穷举三态与边界）
 */
import { describe, it, expect } from 'vitest'
import { computeAnchor, resolveAnchorTarget, type AnchorRect } from '../src/core/anchor'

const rect = (
  nodeId: string,
  top: number,
  left: number,
  width: number,
  height: number,
  isContainer = false,
): AnchorRect => ({ nodeId, rect: { top, left, width, height }, isContainer })

describe('computeAnchor —— 非容器：中线两分', () => {
  const list = [rect('x', 100, 0, 300, 100, false)]

  it('中线以上 → before', () => {
    expect(computeAnchor({ x: 10, y: 120 }, list)).toEqual({ nodeId: 'x', position: 'before' })
  })
  it('中线（含）→ before，中线以下 → after', () => {
    expect(computeAnchor({ x: 10, y: 150 }, list).position).toBe('before')
    expect(computeAnchor({ x: 10, y: 151 }, list).position).toBe('after')
  })
  it('矩形边界坐标视为命中', () => {
    expect(computeAnchor({ x: 0, y: 100 }, list).position).toBe('before')
    expect(computeAnchor({ x: 300, y: 200 }, list).position).toBe('after')
  })
  it('零高度 rect → relY 按 0.5 处理（中线含 → 非容器 before）', () => {
    expect(computeAnchor({ x: 10, y: 150 }, [rect('z', 150, 0, 300, 0)]).position).toBe('before')
  })
})

describe('computeAnchor —— 容器：25/75 三带', () => {
  const list = [rect('g', 0, 0, 300, 200, true)] // 25% = 50 → y<50 before；75% = 150 → y>150 after

  it('上 25% 带 → before（y=49）', () => {
    expect(computeAnchor({ x: 10, y: 49 }, list)).toEqual({ nodeId: 'g', position: 'before' })
  })
  it('下 25% 带 → after（y=151）', () => {
    expect(computeAnchor({ x: 10, y: 151 }, list)).toEqual({ nodeId: 'g', position: 'after' })
  })
  it('中间 50% → into（y=100）', () => {
    expect(computeAnchor({ x: 10, y: 100 }, list)).toEqual({ nodeId: 'g', position: 'into' })
  })
  it('边界点：y=50（带内开）→ into；y=150（带内闭）→ into', () => {
    expect(computeAnchor({ x: 10, y: 50 }, list).position).toBe('into')
    expect(computeAnchor({ x: 10, y: 150 }, list).position).toBe('into')
  })
})

describe('computeAnchor —— 嵌套与命中优先级', () => {
  const nested = [
    rect('root', 0, 0, 400, 400, true),
    rect('group', 50, 0, 300, 200, true),
    rect('child', 60, 10, 280, 60, false),
  ]

  it('多层命中取面积最小（最深节点）', () => {
    // (140, 140) 在 root + group 内（child 是 60..120 已出去）→ group 中段 → into group
    expect(computeAnchor({ x: 140, y: 140 }, nested)).toEqual({ nodeId: 'group', position: 'into' })
    // (100, 80) 三层全命中 → 最小的 child：y=80 在 60+60=120 内、中线 90 以上 → before child
    expect(computeAnchor({ x: 100, y: 80 }, nested)).toEqual({ nodeId: 'child', position: 'before' })
  })

  it('不在任何 rect（画布空白）→ fallback root into', () => {
    expect(computeAnchor({ x: 999, y: 999 }, nested, { rootId: 'root' })).toEqual({
      nodeId: 'root',
      position: 'into',
    })
    expect(computeAnchor({ x: 0, y: 0 }, [], { rootId: 'root' })).toEqual({
      nodeId: 'root',
      position: 'into',
    })
  })

  it('无 rects 且未给 rootId → nodeId 空串（调用方兜底）', () => {
    expect(computeAnchor({ x: 1, y: 1 }, [])).toEqual({ nodeId: '', position: 'into' })
  })
})

describe('resolveAnchorTarget —— 锚点 → parentId/index', () => {
  const schema = { root: { id: 'root' } }
  const helpers = {
    childrenOf: (nodeId: string) => (nodeId === 'root' ? ['a', 'b'] : nodeId === 'g' ? ['d'] : []),
    locate: (nodeId: string) => {
      const map: Record<string, { parentId: string; index: number }> = {
        a: { parentId: 'root', index: 0 },
        b: { parentId: 'root', index: 1 },
        d: { parentId: 'g', index: 0 },
      }
      return map[nodeId] ?? null
    },
  }

  it('into → 容器 children.length（末尾）', () => {
    expect(resolveAnchorTarget(schema, { nodeId: 'root', position: 'into' }, helpers)).toEqual({
      parentId: 'root',
      index: 2,
    })
    expect(resolveAnchorTarget(schema, { nodeId: 'g', position: 'into' }, helpers)).toEqual({
      parentId: 'g',
      index: 1,
    })
  })
  it('before → 自身索引；after → 索引 + 1', () => {
    expect(resolveAnchorTarget(schema, { nodeId: 'a', position: 'before' }, helpers)).toEqual({
      parentId: 'root',
      index: 0,
    })
    expect(resolveAnchorTarget(schema, { nodeId: 'a', position: 'after' }, helpers)).toEqual({
      parentId: 'root',
      index: 1,
    })
    expect(resolveAnchorTarget(schema, { nodeId: 'b', position: 'after' }, helpers)).toEqual({
      parentId: 'root',
      index: 2,
    })
  })
  it('locate 失败（如 before/after 命中 root 自身）→ fallback root 末尾', () => {
    expect(resolveAnchorTarget(schema, { nodeId: 'root', position: 'before' }, helpers)).toEqual({
      parentId: 'root',
      index: 2,
    })
    expect(resolveAnchorTarget(schema, { nodeId: 'nope', position: 'after' }, helpers)).toEqual({
      parentId: 'root',
      index: 2,
    })
  })
})
