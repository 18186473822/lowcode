/**
 * page-list.test.ts —— 2026-10-20：页面列表 / 换页 / 删除（B2 消费端）。
 *
 * 覆盖：
 * - `loadPages` 成功 / 失败 / 未注入 API / 已加载短路 / force 重拉；
 * - `deletePage` 删除非当前页 / 删除当前页后切到剩余第一页 / 删最后一页落新草稿；
 * - 删除失败保留列表、宿主未实现删除能力时降级提示。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { PageSchema, ModelSchema } from '@lc/schema'
import {
  useDesignerStore,
  type ModelSummary,
  type PageListItem,
  type VersionList,
  type RbacConfig,
  type RoleRecord,
} from '../src/store/store'
import { demoPage } from '../src/fixtures/demo-page'

function page(id: string, name = id): PageListItem {
  return { id, name, type: 'form', status: 'draft', currentVersion: 0, updatedAt: '2026-10-20T00:00:00.000Z' }
}

/** DesignerApi mock（只测页面列表/删除，其余方法给最小可用值） */
function mockApi(pages: PageListItem[] = [page('a'), page('b')]) {
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
      pageId: 'a',
      status: 'draft',
      currentVersion: 0,
      versions: [],
    }),
    rollback: vi
      .fn<(id: string, v: number) => Promise<{ rolledBackTo: number }>>()
      .mockResolvedValue({ rolledBackTo: 1 }),
    listRbac: vi.fn<() => Promise<RbacConfig>>().mockResolvedValue({ roles: [], pages: {} }),
    putRole: vi.fn<(r: RoleRecord) => Promise<void>>().mockResolvedValue(undefined),
    putPageAuth: vi.fn<(id: string, roles: string[]) => Promise<void>>().mockResolvedValue(undefined),
    listPages: vi.fn<() => Promise<PageListItem[]>>().mockResolvedValue(pages),
    deletePage: vi.fn<(id: string) => Promise<{ removedVersions: number }>>().mockResolvedValue({ removedVersions: 3 }),
  }
}

describe('2026-10-20：页面列表 / 删除（store actions）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loadPages：成功写入列表并置 loaded；重复调用短路，force 才重拉', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)

    expect(await store.loadPages()).toBe(true)
    expect(store.pages.map((p) => p.id)).toEqual(['a', 'b'])
    expect(store.pagesLoaded).toBe(true)
    expect(store.pagesError).toBe('')
    expect(store.pagesLoading).toBe(false)

    expect(await store.loadPages()).toBe(true)
    expect(api.listPages).toHaveBeenCalledTimes(1)

    await store.loadPages(true)
    expect(api.listPages).toHaveBeenCalledTimes(2)
  })

  it('loadPages：失败写 pagesError、不置 loaded、不抛错', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.listPages.mockRejectedValueOnce(new Error('网络断了'))
    store.setApi(api)

    expect(await store.loadPages()).toBe(false)
    expect(store.pagesError).toContain('页面列表加载失败')
    expect(store.pagesError).toContain('网络断了')
    expect(store.pagesLoaded).toBe(false)
    expect(store.pagesLoading).toBe(false)
  })

  it('loadPages：未注入 API 时降级提示', async () => {
    const store = useDesignerStore()
    expect(await store.loadPages()).toBe(false)
    expect(store.pagesError).toBe('未配置服务端 API')
  })

  it('loadPages：空列表也算成功加载（避免每次展开都重拉）', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi([]))
    expect(await store.loadPages()).toBe(true)
    expect(store.pages).toEqual([])
    expect(store.pagesLoaded).toBe(true)
  })

  it('deletePage：删除非当前页 → 只移出列表、当前页不变', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.loadPages()
    store.pageId = 'a'

    expect(await store.deletePage('b')).toBe(true)
    expect(store.pages.map((p) => p.id)).toEqual(['a'])
    expect(store.pageId).toBe('a')
    expect(store.statusText).toContain('已删除 b')
    expect(store.statusText).toContain('3 个历史版本')
    expect(api.getSchema).not.toHaveBeenCalled()
  })

  it('deletePage：删除当前页 → 自动打开剩余第一页', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.loadPages()
    store.pageId = 'a'

    expect(await store.deletePage('a')).toBe(true)
    expect(store.pages.map((p) => p.id)).toEqual(['b'])
    expect(store.pageId).toBe('b')
    expect(api.getSchema).toHaveBeenCalledWith('b')
    expect(store.statusText).toContain('已切换到 b')
  })

  it('deletePage：删最后一页 → 落一份未保存的新草稿', async () => {
    const store = useDesignerStore()
    const api = mockApi([page('only')])
    store.setApi(api)
    await store.loadPages()
    store.pageId = 'only'

    expect(await store.deletePage('only')).toBe(true)
    expect(store.pages).toEqual([])
    expect(store.pageId).toBe('page_new')
    expect(store.saveState).toBe('dirty')
    expect(store.statusText).toContain('已落新草稿 page_new')
  })

  it('deletePage：删除当前页但下一页打不开 → 回落新草稿，避免“删除等于没删”', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.getSchema.mockRejectedValueOnce(new Error('网络断了'))
    store.setApi(api)
    await store.loadPages()
    store.pageId = 'a'

    expect(await store.deletePage('a')).toBe(true)
    expect(store.pageId).toBe('page_new')
    expect(store.statusText).toContain('打开 b 失败')
    expect(store.statusText).toContain('已回落到新草稿')
  })

  it('deletePage：服务端失败 → 保留列表与当前页、状态可读', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.deletePage.mockRejectedValueOnce(new Error('403 无权限'))
    store.setApi(api)
    await store.loadPages()
    store.pageId = 'a'

    expect(await store.deletePage('a')).toBe(false)
    expect(store.pages.map((p) => p.id)).toEqual(['a', 'b'])
    expect(store.pageId).toBe('a')
    expect(store.statusText).toContain('删除失败')
    expect(store.statusText).toContain('403 无权限')
  })

  it('deletePage：宿主未实现可选删除能力 → 明确降级提示', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    // 模拟旧宿主：没有 deletePage 能力（接口里是可选方法）
    const legacy = { ...api, deletePage: undefined }
    store.setApi(legacy)
    await store.loadPages()

    expect(await store.deletePage('a')).toBe(false)
    expect(store.statusText).toBe('当前服务端未提供删除接口')
  })

  it('deletePage：未注入 API → 降级提示', async () => {
    const store = useDesignerStore()
    expect(await store.deletePage('a')).toBe(false)
    expect(store.statusText).toBe('未配置服务端 API')
  })
})
