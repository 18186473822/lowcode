/**
 * portal.test.ts —— 移动门户清单（2026-10-28）
 *
 * 覆盖：
 * - `loadPortalPages`：只取 `type=portal`、按 `portal.order` 排序、单页读失败降级；
 * - `createPortalPage`：编码合法时落盘、编码冲突拒绝、非法编码拒绝；
 * - `updatePortalMeta`：If-Match 带 revision、`null` 清空 order/remark、409 只提示；
 * - `switchView('portal')` 触发清单加载；
 * - PortalPanel：系统内置行 + 在线设计行渲染、查询过滤、新增弹层提交。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { PageSchema } from '@lc/schema'
import {
  useDesignerStore,
  type PageListItem,
  type ModelSummary,
  type VersionList,
  type RbacConfig,
  type RoleRecord,
} from '../src/store/store'
import PortalPanel from '../src/panel/PortalPanel.vue'
import MaterialPanel from '../src/panel/MaterialPanel.vue'
import PropsPanel from '../src/panel/PropsPanel.vue'
import { findNode } from '../src/core/schema-ops'

function portalSchema(
  id: string,
  name: string,
  extra: { order?: number; remark?: string } = {},
): PageSchema {
  return {
    schemaVersion: '1.0.0',
    id,
    name,
    type: 'portal',
    root: { id: 'root', componentName: 'Page', children: [] },
    portal: { title: name, columns: 4, cards: [], ...extra },
  }
}

function portalRow(id: string, name = id): PageListItem {
  return { id, name, type: 'portal', status: 'draft', currentVersion: 0, updatedAt: '2026-10-28T00:00:00.000Z' }
}

/** DesignerApi 最小 mock（只覆盖本文件用到的方法；其余给形状） */
function mockApi(pages: PageListItem[], schemas: Record<string, PageSchema> = {}) {
  return {
    getSchema: vi
      .fn<(id: string) => Promise<{ schema: PageSchema; version: string | number; revision: number }>>()
      .mockImplementation(async (id: string) => ({
        schema: schemas[id] ?? portalSchema(id, id),
        version: 'draft',
        revision: 7,
      })),
    saveSchema: vi.fn<(id: string, s: PageSchema, r?: number) => Promise<{ revision: number }>>()
      .mockResolvedValue({ revision: 8 }),
    publish: vi.fn<() => Promise<{ version?: number }>>().mockResolvedValue({ version: 1 }),
    listModels: vi.fn<() => Promise<ModelSummary[]>>().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue({ fields: [] }),
    putModel: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn<() => Promise<VersionList>>().mockResolvedValue({
      pageId: 'x',
      status: 'draft',
      currentVersion: 0,
      versions: [],
    }),
    rollback: vi.fn().mockResolvedValue({ rolledBackTo: 1 }),
    listRbac: vi.fn<() => Promise<RbacConfig>>().mockResolvedValue({ roles: [], pages: {} }),
    putRole: vi.fn<(r: RoleRecord) => Promise<void>>().mockResolvedValue(undefined),
    putPageAuth: vi.fn().mockResolvedValue(undefined),
    listPages: vi.fn<() => Promise<PageListItem[]>>().mockResolvedValue(pages),
    deletePage: vi.fn().mockResolvedValue({ removedVersions: 0 }),
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('loadPortalPages：清单取数 / 排序 / 降级', () => {
  it('只取 portal 页，按 order 升序，未设置的排最后', async () => {
    const store = useDesignerStore()
    const api = mockApi(
      [
        portalRow('p_home', '门户首页'),
        { id: 'p_leave_list', name: '请假列表', type: 'list' },
        portalRow('p_docs', '文档门户'),
        portalRow('p_new', '新门户'),
      ],
      {
        p_home: portalSchema('p_home', '门户首页', { order: 2, remark: '主页' }),
        p_docs: portalSchema('p_docs', '文档门户', { order: 1 }),
      },
    )
    store.setApi(api)

    expect(await store.loadPortalPages()).toBe(true)
    expect(store.portalPages.map((p) => p.id)).toEqual(['p_docs', 'p_home', 'p_new'])
    expect(store.portalPages[1]).toMatchObject({ order: 2, remark: '主页' })
    expect(store.portalPages[2].order).toBeUndefined()
    expect(store.portalError).toBe('')
    expect(store.portalLoading).toBe(false)
  })

  it('单页 schema 读取失败只降级该行，不拖垮整张清单', async () => {
    const store = useDesignerStore()
    const api = mockApi([portalRow('p_a'), portalRow('p_b', 'B 门户')])
    api.getSchema.mockImplementation(async (id: string) => {
      if (id === 'p_a') throw new Error('404 PAGE_NOT_FOUND')
      return { schema: portalSchema('p_b', 'B 门户', { order: 5 }), version: 'draft', revision: 1 }
    })
    store.setApi(api)

    expect(await store.loadPortalPages()).toBe(true)
    expect(store.portalPages.map((p) => p.id)).toEqual(['p_b', 'p_a'])
    expect(store.portalPages[1].order).toBeUndefined()
  })

  it('页面列表加载失败且无缓存 → portalError 透出底层错误', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    api.listPages.mockRejectedValueOnce(new Error('网络断了'))
    store.setApi(api)

    expect(await store.loadPortalPages()).toBe(false)
    // 清单复用 loadPages 取数，这里原样透出它的错误文案（不二次包装，避免红色提示重复「加载失败」）
    expect(store.portalError).toContain('页面列表加载失败')
    expect(store.portalError).toContain('网络断了')
  })

  it('从别的视图切回 portal 触发清单加载（portal 已是默认首页）', async () => {
    const store = useDesignerStore()
    const api = mockApi([portalRow('p_home')])
    store.setApi(api)

    // 2026-10-28：view 初始就是 portal → 直接 switchView('portal') 是 no-op，
    // 先切走再切回，才是「进入门户清单」的真实路径。
    await store.switchView('page')
    await store.switchView('portal')
    expect(store.view).toBe('portal')
    expect(api.listPages).toHaveBeenCalled()
    expect(store.portalPages.map((p) => p.id)).toEqual(['p_home'])
  })
})

describe('createPortalPage：新建门户页', () => {
  it('合法编码 → 落盘空门户骨架（4 列 / 排序 / 备注）', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    store.setApi(api)

    expect(
      await store.createPortalPage({ id: 'default_home', name: '门户首页', order: 0, remark: '主页' }),
    ).toBe(true)

    expect(api.saveSchema).toHaveBeenCalledTimes(1)
    const [id, schema, revision] = api.saveSchema.mock.calls[0]
    expect(id).toBe('default_home')
    expect(revision).toBe(0)
    expect(schema.type).toBe('portal')
    expect(schema.name).toBe('门户首页')
    expect(schema.portal).toEqual({ title: '门户首页', columns: 4, cards: [], order: 0, remark: '主页' })
    expect(store.statusText).toContain('已创建门户页 default_home')
  })

  it('编码已存在 → 拒绝，不发写请求（saveSchema 是 upsert，不能覆盖）', async () => {
    const store = useDesignerStore()
    const api = mockApi([portalRow('default_home')])
    store.setApi(api)

    expect(await store.createPortalPage({ id: 'default_home', name: '重复' })).toBe(false)
    expect(store.statusText).toContain('页面编码已存在')
    expect(api.saveSchema).not.toHaveBeenCalled()
  })

  it('非法编码 → 本地拒绝，不查列表也不写', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    store.setApi(api)

    expect(await store.createPortalPage({ id: '1bad', name: 'X' })).toBe(false)
    expect(store.statusText).toContain('页面编码不合法')
    expect(api.listPages).not.toHaveBeenCalled()
    expect(api.saveSchema).not.toHaveBeenCalled()
  })

  it('名称留空 → 用编码兜底，排序留空则不写 order 键', async () => {
    const store = useDesignerStore()
    const api = mockApi([])
    store.setApi(api)

    expect(await store.createPortalPage({ id: 'p_home' })).toBe(true)
    const schema = api.saveSchema.mock.calls[0][1]
    expect(schema.name).toBe('p_home')
    expect(schema.portal && 'order' in schema.portal).toBe(false)
  })
})

describe('updatePortalMeta：改名称 / 排序 / 备注', () => {
  it('走 If-Match（getSchema 的 revision）并清空 null 字段', async () => {
    const store = useDesignerStore()
    const api = mockApi(
      [portalRow('p_home', '旧名')],
      { p_home: portalSchema('p_home', '旧名', { order: 2, remark: '旧备注' }) },
    )
    store.setApi(api)

    expect(await store.updatePortalMeta('p_home', { name: '新名', order: 3, remark: null })).toBe(true)

    expect(api.saveSchema).toHaveBeenCalledTimes(1)
    const [id, schema, revision] = api.saveSchema.mock.calls[0]
    expect(id).toBe('p_home')
    expect(revision).toBe(7)
    expect(schema.name).toBe('新名')
    expect(schema.portal?.order).toBe(3)
    expect(schema.portal && 'remark' in schema.portal).toBe(false)
    expect(store.statusText).toContain('已更新门户页 p_home')
  })

  it('名称为空 → 本地拒绝，不写', async () => {
    const store = useDesignerStore()
    const api = mockApi([portalRow('p_home')])
    store.setApi(api)

    expect(await store.updatePortalMeta('p_home', { name: '   ' })).toBe(false)
    expect(store.statusText).toContain('不能为空')
    expect(api.saveSchema).not.toHaveBeenCalled()
  })

  it('保存 409 → 只提示，不重试不覆盖', async () => {
    const store = useDesignerStore()
    const api = mockApi([portalRow('p_home')])
    api.saveSchema.mockRejectedValueOnce(new Error('409 VERSION_CONFLICT'))
    store.setApi(api)

    expect(await store.updatePortalMeta('p_home', { name: '新名' })).toBe(false)
    expect(store.statusText).toContain('更新门户页失败')
    expect(store.statusText).toContain('409 VERSION_CONFLICT')
    expect(api.saveSchema).toHaveBeenCalledTimes(1)
  })
})

describe('PortalPanel：清单渲染与查询', () => {
  async function setup() {
    const store = useDesignerStore()
    const api = mockApi(
      [portalRow('p_home', '门户首页'), portalRow('p_docs', '文档门户')],
      {
        p_home: portalSchema('p_home', '门户首页', { order: 1, remark: '主页' }),
        p_docs: portalSchema('p_docs', '文档门户'),
      },
    )
    store.setApi(api)
    await store.loadPortalPages()
    const w = mount(PortalPanel)
    return { store, api, w }
  }

  it('系统内置行在前，在线设计行在后，共 N 条含内置', async () => {
    const { w } = await setup()
    await flushPromises()

    const rows = w.findAll('.portal-row')
    expect(rows).toHaveLength(4) // 2 内置 + 2 门户
    expect(w.text()).toContain('应用入口')
    expect(w.text()).toContain('我的待办')
    expect(w.text()).toContain('在线设计')
    expect(w.text()).toContain('系统内置')
    expect(w.get('[data-testid="portal-pager"]').text()).toContain('共 4 条')
    // 门户首页 order=1 应排在文档门户前
    const designRows = w.findAll('.portal-row:not(.portal-row--builtin)')
    expect(designRows[0].text()).toContain('门户首页')
    w.unmount()
  })

  it('查询只在点「查询」后生效，重置恢复全部', async () => {
    const { w } = await setup()
    await flushPromises()

    await w.get('[data-testid="portal-q-name"]').setValue('文档')
    expect(w.findAll('.portal-row:not(.portal-row--builtin)')).toHaveLength(2) // 尚未应用
    await w.get('[data-testid="portal-search"]').trigger('click')
    const filtered = w.findAll('.portal-row:not(.portal-row--builtin)')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].text()).toContain('文档门户')

    await w.get('[data-testid="portal-reset"]').trigger('click')
    expect(w.findAll('.portal-row:not(.portal-row--builtin)')).toHaveLength(2)
    w.unmount()
  })

  it('新增弹层：填编码 / 名称 → 调用 createPortalPage 落盘并关闭', async () => {
    const { api, w } = await setup()
    await flushPromises()

    await w.get('[data-testid="portal-new"]').trigger('click')
    await w.get('[data-testid="portal-form-id"]').setValue('p_new_home')
    await w.get('[data-testid="portal-form-name"]').setValue('新门户')
    await w.get('[data-testid="portal-form-submit"]').trigger('click')
    await flushPromises()

    expect(api.saveSchema).toHaveBeenCalledTimes(1)
    expect(api.saveSchema.mock.calls[0][0]).toBe('p_new_home')
    expect(w.find('[data-testid="portal-form-id"]').exists()).toBe(false)
    w.unmount()
  })

  it('新增弹层：排序填数字（type=number 的 v-model 会转 number）不崩，且写进 schema', async () => {
    const { api, w } = await setup()
    await flushPromises()

    await w.get('[data-testid="portal-new"]').trigger('click')
    await w.get('[data-testid="portal-form-id"]').setValue('p_order_home')
    await w.get('[data-testid="portal-form-order"]').setValue('3')
    await w.get('[data-testid="portal-form-submit"]').trigger('click')
    await flushPromises()

    expect(api.saveSchema).toHaveBeenCalledTimes(1)
    expect(api.saveSchema.mock.calls[0][1].portal?.order).toBe(3)
    expect(w.find('[data-testid="portal-form-id"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('门户组件库（批 2）：物料面板分组 + json setter', () => {
  it('type=portal → 只有「基础组件 / 业务组件」两组，且只列门户可用物料', () => {
    const store = useDesignerStore()
    store.setPageType('portal')

    const w = mount(MaterialPanel)
    const groupTitles = w.findAll('.lc-material-panel__group-title').map((g) => g.text())
    expect(groupTitles).toEqual(['基础组件', '业务组件'])

    const titles = w.findAll('.lc-material-panel__item').map((i) => i.text())
    // 4 个新门户物料在两组内
    expect(titles).toEqual(expect.arrayContaining(['轮播图', '公告条', '数据卡', '待办列表']))
    // 表单控件/布局容器不进门户面板（门户是首屏展示，不是录入页）
    expect(titles).not.toContain('单行输入')
    expect(titles).not.toContain('按钮')
    expect(titles).not.toContain('分组容器')
    w.unmount()
  })

  it('非门户页仍按 7 个 category 分组（不回归）', () => {
    const store = useDesignerStore()
    store.setPageType('form')
    const w = mount(MaterialPanel)
    const groupTitles = w.findAll('.lc-material-panel__group-title').map((g) => g.text())
    expect(groupTitles).toEqual(expect.arrayContaining(['基础', '布局', '表单', '反馈', '数据', '导航', '业务']))
    w.unmount()
  })

  it('json setter：合法 JSON 写回数组；非法输入保留上一次合法值并红字提示', async () => {
    const store = useDesignerStore()
    store.schema = {
      schemaVersion: '1.0.0',
      id: 'p_portal_json',
      name: '门户联调',
      type: 'portal',
      root: {
        id: 'root',
        componentName: 'Page',
        children: [
          {
            id: 'n_banner',
            componentName: 'PortalBanner',
            props: { items: [{ title: 'A' }] },
          },
        ],
      },
      portal: { cards: [] },
    } as PageSchema
    store.select('n_banner')

    const w = mount(PropsPanel)
    await nextTick()

    const readItems = (): unknown =>
      (findNode(store.schema, 'n_banner')!.props as { items?: unknown }).items

    const first = w.find('textarea.setter__textarea')
    expect((first.element as HTMLTextAreaElement).value).toContain('"title": "A"')

    // 合法 JSON → 写回解析后的数组（不是字符串）
    ;(first.element as HTMLTextAreaElement).value = '[{"title":"B"}]'
    await first.trigger('input')
    expect(readItems()).toEqual([{ title: 'B' }])

    // 非法 JSON → 保留上一次合法值 + 提示
    const second = w.find('textarea.setter__textarea')
    ;(second.element as HTMLTextAreaElement).value = '[{oops'
    await second.trigger('input')
    expect(readItems()).toEqual([{ title: 'B' }])
    expect(w.find('.setter__json-err').text()).toContain('JSON 语法错误')

    // 清空 → 删键
    const third = w.find('textarea.setter__textarea')
    ;(third.element as HTMLTextAreaElement).value = '  '
    await third.trigger('input')
    expect(readItems()).toBeUndefined()
    expect(w.find('.setter__json-err').exists()).toBe(false)
    w.unmount()
  })
})
