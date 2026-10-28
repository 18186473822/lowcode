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

describe('2026-10-28：先选模型再建页面（store action）', () => {
  const leaveModel: ModelSchema = {
    schemaVersion: '1.0.0',
    id: 'm_leave',
    name: '请假单',
    code: 'leave',
    fields: [
      { key: 'title', name: '事由', type: 'string', required: true },
      { key: 'days', name: '天数', type: 'number' },
    ],
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('createPageFromModel：生成表单页、写入提交绑定并缓存模型字段', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.getModel.mockResolvedValue(leaveModel)
    store.setApi(api)

    expect(await store.createPageFromModel(' p_leave ', 'm_leave', 'form')).toBe(true)

    expect(api.getModel).toHaveBeenCalledWith('m_leave')
    expect(store.pageId).toBe('p_leave')
    expect(store.schema.id).toBe('p_leave')
    expect(store.schema.type).toBe('form')
    expect(store.submitModelId).toBe('m_leave')
    expect(store.schema.root.children?.map((n) => n.componentName)).toEqual([
      'Input',
      'NumberInput',
      'Button',
    ])
    expect(store.modelFields.map((f) => f.key)).toEqual(['title', 'days'])
    expect(store.statusText).toContain('表单页')
    expect(store.statusText).toContain('点保存建档')
  })

  it('createPageFromModel：列表页写入 list.modelId', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.getModel.mockResolvedValue(leaveModel)
    store.setApi(api)

    expect(await store.createPageFromModel('p_leave_list', 'm_leave', 'list')).toBe(true)
    expect(store.schema.list).toEqual({ modelId: 'm_leave', columns: ['title', 'days'] })
  })

  it('createPageFromModel：缺页面 id / 缺模型 / 拉模型失败都不落草稿', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.pageId = 'keep_me'

    expect(await store.createPageFromModel('   ', 'm_leave', 'form')).toBe(false)
    expect(store.statusText).toBe('请先填写页面 ID')

    expect(await store.createPageFromModel('p_x', '', 'form')).toBe(false)
    expect(store.statusText).toBe('请先选择数据模型')

    api.getModel.mockRejectedValueOnce(new Error('404 模型不存在'))
    expect(await store.createPageFromModel('p_x', 'm_missing', 'form')).toBe(false)
    expect(store.statusText).toContain('新建失败')
    expect(store.pageId).toBe('keep_me')
  })
})

describe('2026-10-28：模型即模块（一次生成成组页面）', () => {
  const leaveModel: ModelSchema = {
    schemaVersion: '1.0.0',
    id: 'm_leave',
    name: '请假单',
    code: 'leave',
    fields: [
      { key: 'title', name: '事由', type: 'string', required: true },
      { key: 'days', name: '天数', type: 'number' },
    ],
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('默认生成三页并落盘，串联跳转 + 回写模型默认页 + 打开列表页', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    api.getModel.mockResolvedValue(leaveModel)
    store.setApi(api)

    expect(await store.createModelModule('p_leave_list', 'm_leave')).toBe(true)

    const savedIds = api.saveSchema.mock.calls.map((c) => c[0])
    expect(savedIds).toEqual(['p_leave_list', 'p_leave_form', 'p_leave_detail'])
    const saved = api.saveSchema.mock.calls.map((c) => c[1])
    expect(saved[0].list?.detailPageId).toBe('p_leave_detail')
    expect(saved[1].submit?.successAction).toEqual({
      event: 'success',
      type: 'navigate',
      value: { pageId: 'p_leave_list', mode: 'redirect' },
    })
    expect(saved[2].detail?.backPageId).toBe('p_leave_list')

    // 模型反向索引
    const patched = api.putModel.mock.calls[0][0]
    expect(patched.listPageId).toBe('p_leave_list')
    expect(patched.formPageId).toBe('p_leave_form')
    expect(patched.id).toBe('m_leave')

    expect(store.pageId).toBe('p_leave_list')
    expect(store.modelFields.map((f) => f.key)).toEqual(['title', 'days'])
    expect(store.statusText).toContain('已生成 3 个页面')
  })

  it('任一目标 id 已存在 → 整体中止，不发写请求（不能 upsert 覆盖存量页）', async () => {
    const store = useDesignerStore()
    const api = mockApi([page('p_leave_detail')])
    api.getModel.mockResolvedValue(leaveModel)
    store.setApi(api)

    expect(await store.createModelModule('leave', 'm_leave')).toBe(false)
    expect(store.statusText).toContain('页面已存在')
    expect(store.statusText).toContain('p_leave_detail')
    expect(api.saveSchema).not.toHaveBeenCalled()
    expect(api.putModel).not.toHaveBeenCalled()
  })

  it('只勾选表单时只生成表单页，且不写列表默认页', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    api.getModel.mockResolvedValue(leaveModel)
    store.setApi(api)

    expect(await store.createModelModule('leave', 'm_leave', ['form'])).toBe(true)
    expect(api.saveSchema.mock.calls.map((c) => c[0])).toEqual(['p_leave_form'])
    const patched = api.putModel.mock.calls[0][0]
    expect(patched.formPageId).toBe('p_leave_form')
    expect(patched.listPageId).toBeUndefined()
    expect(store.pageId).toBe('p_leave_form')
  })

  it('中途保存失败 → 报告已建页面并刷新列表', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    api.getModel.mockResolvedValue(leaveModel)
    api.saveSchema
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('409 VERSION_CONFLICT'))
    store.setApi(api)

    expect(await store.createModelModule('leave', 'm_leave')).toBe(false)
    expect(store.statusText).toContain('生成中断')
    expect(store.statusText).toContain('已建 p_leave_list')
    expect(store.statusText).toContain('409 VERSION_CONFLICT')
    expect(api.putModel).not.toHaveBeenCalled()
    expect(api.listPages.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('模型回写失败只告警，不否定已生成的页面', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    api.getModel.mockResolvedValue(leaveModel)
    api.putModel.mockRejectedValueOnce(new Error('500 服务端错误'))
    store.setApi(api)

    expect(await store.createModelModule('leave', 'm_leave')).toBe(true)
    expect(store.statusText).toContain('已生成 3 个页面')
    expect(store.statusText).toContain('回写失败')
  })

  it('前缀为空 / 未勾选页面 → 直接拒绝，不读模型', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    store.setApi(api)

    expect(await store.createModelModule('   ', 'm_leave')).toBe(false)
    expect(store.statusText).toContain('模块 ID')

    expect(await store.createModelModule('leave', 'm_leave', [])).toBe(false)
    expect(store.statusText).toBe('至少要勾选一种页面')
    expect(api.getModel).not.toHaveBeenCalled()
  })
})

describe('2026-10-28：删除页面后清理模型默认页引用（旁路）', () => {
  const boundPage: PageListItem = {
    id: 'p_leave_list',
    name: '请假单',
    type: 'list',
    status: 'draft',
    currentVersion: 0,
    updatedAt: '2026-10-28T00:00:00.000Z',
    modelId: 'm_leave',
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('删掉模型默认列表页 → putModel 去掉 listPageId，保留 formPageId', async () => {
    const store = useDesignerStore()
    const api = mockApi([boundPage])
    api.getModel.mockResolvedValue({
      schemaVersion: '1.0.0',
      id: 'm_leave',
      name: '请假单',
      code: 'leave',
      fields: [{ key: 'title', name: '事由', type: 'string' }],
      listPageId: 'p_leave_list',
      formPageId: 'p_leave_form',
    })
    store.setApi(api)
    await store.loadPages()

    expect(await store.deletePage('p_leave_list')).toBe(true)
    await new Promise((r) => setTimeout(r, 0))

    expect(api.getModel).toHaveBeenCalledWith('m_leave')
    expect(api.putModel).toHaveBeenCalledTimes(1)
    const patched = api.putModel.mock.calls[0][0]
    expect(patched.listPageId).toBeUndefined()
    expect(patched.formPageId).toBe('p_leave_form')
  })

  it('模型没引用这个页面 → 不做无谓写回', async () => {
    const store = useDesignerStore()
    const api = mockApi([boundPage])
    api.getModel.mockResolvedValue({
      schemaVersion: '1.0.0',
      id: 'm_leave',
      name: '请假单',
      code: 'leave',
      fields: [{ key: 'title', name: '事由', type: 'string' }],
      listPageId: 'p_other_list',
      formPageId: 'p_leave_form',
    })
    store.setApi(api)
    await store.loadPages()

    expect(await store.deletePage('p_leave_list')).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(api.putModel).not.toHaveBeenCalled()
  })

  it('清理失败不影响删除结果（只告警，不回滚）', async () => {
    const store = useDesignerStore()
    const api = mockApi([boundPage])
    api.getModel.mockRejectedValue(new Error('500 服务端错误'))
    store.setApi(api)
    await store.loadPages()

    expect(await store.deletePage('p_leave_list')).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(store.pages).toEqual([])
    expect(store.statusText).toContain('已删除 p_leave_list')
  })

  it('页面未绑定模型 → 不查模型', async () => {
    const store = useDesignerStore()
    const api = mockApi([page('a')])
    store.setApi(api)
    await store.loadPages()

    expect(await store.deletePage('a')).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(api.getModel).not.toHaveBeenCalled()
    expect(api.putModel).not.toHaveBeenCalled()
  })
})
