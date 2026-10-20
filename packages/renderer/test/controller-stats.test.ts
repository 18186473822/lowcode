/**
 * 批 5 D-P3-13/14 —— controller 统计与「表达式坏掉不白屏」：
 *  - stats：buildMs / mountMs / resolveMs / nodeCount / exprErrors / loopOverflows / skipped；
 *  - 坏表达式只标记 `exprError`，其余节点照常渲染（方案 791「不得白屏」）；
 *  - 对外 `onExprError` 回调语义不变（仍收到同一份 info）。
 */
import { describe, it, expect, vi } from 'vitest'
import type { PageSchema, NodeSchema } from '@lc/schema'
import { PageController } from '../src/core/controller.js'
import type { RuntimeHost } from '../src/core/types.js'

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

function makeHost(): RuntimeHost {
  return {
    toast: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    back: vi.fn(async () => {}),
    confirm: vi.fn(async () => true),
    request: vi.fn(async () => ({ statusCode: 200, data: {} })),
  }
}

function pageWithBadExpr(): PageSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'p_stats',
    name: '统计页',
    type: 'form',
    root: node({
      id: 'root',
      componentName: 'Page',
      children: [
        node({ id: 'n-ok', componentName: 'Text', props: { text: '正常节点' } }),
        // 三个坏表达式：props / condition / loop
        node({ id: 'n-bad-prop', componentName: 'Text', props: { text: '$expr: formData.amount +' } }),
        node({ id: 'n-bad-cond', componentName: 'Text', props: { text: '条件' }, condition: 'formData.x +' }),
        node({
          id: 'n-bad-loop',
          componentName: 'Text',
          props: { text: '循环' },
          loop: '$expr: formData.items.map(',
          children: [node({ id: 'n-loop-child', componentName: 'Text' })],
        }),
      ],
    }),
    defaultFormData: { amount: 1, items: [1] },
  }
}

describe('PageController.stats', () => {
  it('构造后给出节点数与构建耗时（非负、nodeCount 含根）', () => {
    const pc = new PageController(pageWithBadExpr(), { host: makeHost() })
    const s = pc.stats
    expect(s.nodeCount).toBe(6)
    expect(s.buildMs).toBeGreaterThanOrEqual(0)
    expect(s.resolveMs).toBe(0)
    expect(s.exprErrors).toBe(0)
    pc.dispose()
  })

  it('resolve 记录耗时并累计表达式错误数', () => {
    const pc = new PageController(pageWithBadExpr(), { host: makeHost() })
    const nodes = pc.resolve()
    const s = pc.stats
    expect(s.resolveMs).toBeGreaterThanOrEqual(0)
    // 至少 props + condition 两个坏表达式（loop 语法错误也计入）
    expect(s.exprErrors).toBeGreaterThanOrEqual(2)
    // 不白屏：根与正常节点仍可见
    expect(nodes).toHaveLength(1)
    expect(nodes[0].children.some((n) => n.node.id === 'n-ok' && n.visible)).toBe(true)
    pc.dispose()
  })

  it('onExprError 外部回调照常收到（计数不吞事件）', () => {
    const onExprError = vi.fn()
    const pc = new PageController(pageWithBadExpr(), { host: makeHost(), onExprError })
    pc.resolve()
    expect(onExprError).toHaveBeenCalled()
    const info = onExprError.mock.calls[0][0] as { nodeId: string; expr: string }
    expect(typeof info.nodeId).toBe('string')
    expect(pc.stats.exprErrors).toBe(onExprError.mock.calls.length + pc.stats.loopOverflows)
    pc.dispose()
  })

  it('onMount 记录耗时；重复调用不重置', async () => {
    const pc = new PageController(pageWithBadExpr(), { host: makeHost() })
    await pc.onMount()
    const first = pc.stats.mountMs
    expect(first).toBeGreaterThanOrEqual(0)
    await pc.onMount()
    expect(pc.stats.mountMs).toBe(first)
    pc.dispose()
  })

  it('skipped 计入 stats（非法节点不影响页面渲染）', () => {
    const page = pageWithBadExpr()
    ;(page.root.children as unknown[]).push({ id: 'broken' })
    const pc = new PageController(page, { host: makeHost() })
    expect(pc.stats.skipped).toBe(1)
    expect(pc.stats.nodeCount).toBe(6) // 非法节点未进树
    expect(pc.resolve()).toHaveLength(1)
    pc.dispose()
  })

  it('stats 返回副本（外部修改不回写内部）', () => {
    const pc = new PageController(pageWithBadExpr(), { host: makeHost() })
    const s = pc.stats
    s.exprErrors = 999
    expect(pc.stats.exprErrors).toBe(0)
    pc.dispose()
  })
})
