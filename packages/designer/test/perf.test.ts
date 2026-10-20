/**
 * perf.test.ts —— 批 5 D-P3-14：设计器 Profiler 采样（schemaMs + renderMs + nodes）。
 *
 * 数据流：openPage 计时 GET → store.perf = { schemaMs, nodes }；
 *         LcCanvas @rendered → store.markRender({ ms, nodes }) 合并 renderMs。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { PageSchema } from '@lc/schema'
import { useDesignerStore } from '../src/store/store'
import { demoPage } from '../src/fixtures/demo-page'

function mockApi(version: number | 'draft' = 'draft') {
  return {
    getSchema: vi
      .fn<(id: string, v?: string) => Promise<{ schema: PageSchema; version: string | number }>>()
      .mockResolvedValue({ schema: demoPage(), version }),
  } as unknown as Parameters<ReturnType<typeof useDesignerStore>['setApi']>[0]
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('store.perf —— 初始与 schema 加载', () => {
  it('初始无采样 → perf null、perfText 空串（徽标隐藏）', () => {
    const store = useDesignerStore()
    expect(store.perf).toBeNull()
    expect(store.perfText).toBe('')
  })

  it('openPage 记录 schemaMs 与节点数（节点数含根）', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.openPage('pg_perf')

    expect(store.perf).not.toBeNull()
    expect(store.perf!.schemaMs).toBeGreaterThanOrEqual(0)
    expect(store.perf!.nodes).toBeGreaterThan(1)
    expect(store.perf!.renderMs).toBeUndefined() // 等画布回传
    expect(store.perfText).toContain('加载')
    expect(store.perfText).toContain('节点')
  })

  it('打开失败 → 不产生采样（保留失败前状态）', async () => {
    const store = useDesignerStore()
    store.setApi({
      getSchema: vi.fn().mockRejectedValue(new Error('404 页面不存在')),
    } as unknown as Parameters<typeof store.setApi>[0])
    await store.openPage('pg_missing')
    expect(store.perf).toBeNull()
  })
})

describe('store.markRender —— 渲染回填', () => {
  it('合并 renderMs / nodes，保留 openPage 的 schemaMs', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.openPage('pg_perf')
    const schemaMs = store.perf!.schemaMs

    store.markRender({ ms: 12.4, nodes: 40 })
    expect(store.perf!.renderMs).toBe(12.4)
    expect(store.perf!.nodes).toBe(40)
    expect(store.perf!.schemaMs).toBe(schemaMs) // 不被覆盖
    expect(store.perfText).toContain('渲染 12ms')
    expect(store.perfText).toContain('40 节点')
  })

  it('无历史采样时也能独立记录渲染（新建/回滚路径）', () => {
    const store = useDesignerStore()
    store.markRender({ ms: 3 })
    expect(store.perf).toEqual({ renderMs: 3 })
    expect(store.perfText).toBe('渲染 3ms')
  })

  it('多次渲染取最新一次', () => {
    const store = useDesignerStore()
    store.markRender({ ms: 9, nodes: 10 })
    store.markRender({ ms: 2, nodes: 11 })
    expect(store.perf!.renderMs).toBe(2)
    expect(store.perf!.nodes).toBe(11)
  })
})
