/**
 * version-store.test.ts —— 批 5：版本历史 / 回滚 / 对比 store actions（phase2-plan §9）。
 *
 * 覆盖：openHistory 三态（成功倒序载入 / api 未注入 / 拉取失败）、compareVersion 的
 * version 参数透传与 diffEntries 产出、rollbackTo 成功（openPage 重载 + 关弹清 diff）
 * 与失败、closeHistory 清 diff。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { PageSchema, ModelSchema } from '@lc/schema'
import { useDesignerStore, type ModelSummary, type VersionList, type RbacConfig, type RoleRecord } from '../src/store/store'
import { demoPage } from '../src/fixtures/demo-page'

/** DesignerApi mock 工厂（沿 store.test.ts 形态；批 5 版本两方法默认值齐备） */
function mockApi() {
  return {
    getSchema: vi
      .fn<(id: string, version?: string) => Promise<{ schema: PageSchema; version: string | number }>>()
      .mockResolvedValue({ schema: demoPage(), version: 'draft' }),
    saveSchema: vi.fn<(id: string, s: PageSchema) => Promise<void>>().mockResolvedValue(undefined),
    publish: vi.fn<(id: string) => Promise<{ version?: number }>>().mockResolvedValue({ version: 1 }),
    listModels: vi.fn<() => Promise<ModelSummary[]>>().mockResolvedValue([]),
    getModel: vi.fn<(id: string) => Promise<ModelSchema>>().mockResolvedValue({} as ModelSchema),
    putModel: vi.fn<(m: ModelSchema) => Promise<void>>().mockResolvedValue(undefined),
    listVersions: vi.fn<(id: string) => Promise<VersionList>>().mockResolvedValue({
      pageId: 'demo',
      status: 'published',
      currentVersion: 3,
      versions: [
        { version: 3, createdBy: 'admin', createdAt: '2026-10-14T10:00:00.000Z' },
        { version: 2, createdBy: 'admin', createdAt: '2026-10-14T09:00:00.000Z' },
        { version: 1, createdBy: 'admin', createdAt: '2026-10-14T08:00:00.000Z', note: '初版' },
      ],
    }),
    rollback: vi
      .fn<(id: string, v: number) => Promise<{ rolledBackTo: number }>>()
      .mockResolvedValue({ rolledBackTo: 1 }),
    // 批 6 RBAC：默认空配置（本文件不测 RBAC，只需满足 DesignerApi 形状）
    listRbac: vi.fn<() => Promise<RbacConfig>>().mockResolvedValue({ roles: [], pages: {} }),
    putRole: vi.fn<(r: RoleRecord) => Promise<void>>().mockResolvedValue(undefined),
    putPageAuth: vi.fn<(id: string, roles: string[]) => Promise<void>>().mockResolvedValue(undefined),
    listPages: vi.fn<() => Promise<Array<{ id: string; name: string }>>>().mockResolvedValue([]),
  }
}

describe('批 5：版本历史 / 回滚 / 对比（store actions）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('openHistory：成功拉列表（倒序入 versions、currentVersion 同步、loading 归位）', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    const p = store.openHistory()
    expect(store.versionsLoading).toBe(true) // 同步段先置 loading
    await p
    expect(store.historyOpen).toBe(true)
    expect(store.versions.map((v) => v.version)).toEqual([3, 2, 1])
    expect(store.currentVersion).toBe(3)
    expect(store.versionsLoading).toBe(false)
    expect(store.versionsError).toBe('')
    expect(api.listVersions).toHaveBeenCalledWith('demo')
  })

  it('openHistory：api 未注入 → 弹层仍开 + versionsError 提示', async () => {
    const store = useDesignerStore()
    await store.openHistory()
    expect(store.historyOpen).toBe(true)
    expect(store.versionsError).toBe('未配置服务端 API')
    expect(store.versionsLoading).toBe(false)
  })

  it('openHistory：listVersions 失败 → versionsError 带原因、不抛', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.listVersions.mockRejectedValueOnce(new Error('网络炸了'))
    store.setApi(api)
    await store.openHistory()
    expect(store.versionsError).toContain('版本列表加载失败')
    expect(store.versionsError).toContain('网络炸了')
    expect(store.versionsLoading).toBe(false)
  })

  it('compareVersion：version 参数透传 → diffEntries 精确产出 + statusText 计数', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    // 历史版 v1 = 当前画布把首子节点 text 改成「__历史__」
    const old = demoPage()
    const first = old.root.children![0]!
    first.props = { ...first.props, text: '__历史__' }
    api.getSchema.mockResolvedValueOnce({ schema: old, version: 'v1' })

    const ok = await store.compareVersion(1)
    expect(ok).toBe(true)
    expect(api.getSchema).toHaveBeenCalledWith('demo', 'v1') // 可选 version 参数透传
    expect(store.diffVersion).toBe(1)
    expect(store.diffEntries).toHaveLength(1)
    expect(store.diffEntries[0]).toMatchObject({
      kind: 'change',
      id: first.id,
      field: 'props.text',
      before: '"__历史__"',
      after: '"标题"', // demoPage 首子节点 Text 的原值
    })
    expect(store.statusText).toContain('已对比 v1 与当前画布：1 处差异')
  })

  it('compareVersion：api 未注入 → 提示；注入后拉取失败 → 「对比失败」且 diff 不动', async () => {
    const store = useDesignerStore()
    expect(await store.compareVersion(1)).toBe(false)
    expect(store.statusText).toBe('未配置服务端 API')

    const api = mockApi()
    api.getSchema.mockRejectedValueOnce(new Error('404'))
    store.setApi(api)
    expect(await store.compareVersion(1)).toBe(false)
    expect(store.statusText).toContain('版本对比失败')
    expect(store.diffVersion).toBeNull()
    expect(store.diffEntries).toHaveLength(0)
  })

  it('rollbackTo：成功 → rollback 调用 + openPage 重载 + 关弹清 diff + 状态提示', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.openHistory()
    // 造一个 diff（历史版砍光子节点 → 一堆 remove），回滚后应全清
    const old = demoPage()
    old.root.children = []
    api.getSchema.mockResolvedValueOnce({ schema: old, version: 'v1' })
    await store.compareVersion(1)
    expect(store.diffEntries.length).toBeGreaterThan(0)

    // 回滚：服务端把 v1 复制成草稿 → openPage 重载拿到 v1 内容
    api.getSchema.mockResolvedValueOnce({ schema: old, version: 'draft' })
    const ok = await store.rollbackTo(1)
    expect(ok).toBe(true)
    expect(api.rollback).toHaveBeenCalledWith('demo', 1)
    expect(store.historyOpen).toBe(false)
    expect(store.diffEntries).toHaveLength(0)
    expect(store.diffVersion).toBeNull()
    expect(store.statusText).toBe('已回滚到 v1（草稿，需重新发布生效）')
    expect(store.saveState).toBe('idle')
    expect(store.schema.root.children).toHaveLength(0) // 画布已换成回滚后的草稿
  })

  it('rollbackTo：失败 → statusText 报错、弹窗保持打开', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.rollback.mockRejectedValueOnce(new Error('冲突'))
    store.setApi(api)
    await store.openHistory()
    expect(await store.rollbackTo(2)).toBe(false)
    expect(store.statusText).toContain('回滚失败')
    expect(store.statusText).toContain('冲突')
    expect(store.historyOpen).toBe(true)
  })

  it('rollbackTo：api 未注入 → 提示不抛', async () => {
    const store = useDesignerStore()
    expect(await store.rollbackTo(1)).toBe(false)
    expect(store.statusText).toBe('未配置服务端 API')
  })

  it('closeHistory：关弹窗清 diff，列表保留；refreshVersions 可手动刷新', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.openHistory()
    const old = demoPage()
    old.root.children![0]!.props = { ...old.root.children![0]!.props, text: '__历史__' }
    api.getSchema.mockResolvedValueOnce({ schema: old, version: 'v1' })
    await store.compareVersion(1)
    expect(store.diffVersion).toBe(1)

    store.closeHistory()
    expect(store.historyOpen).toBe(false)
    expect(store.diffEntries).toHaveLength(0)
    expect(store.diffVersion).toBeNull()
    expect(store.versions).toHaveLength(3) // 列表保留（下次打开再刷新）

    api.listVersions.mockClear()
    await store.refreshVersions()
    expect(api.listVersions).toHaveBeenCalledTimes(1)
  })
})
