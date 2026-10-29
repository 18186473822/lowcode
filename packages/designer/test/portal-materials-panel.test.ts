/**
 * portal-materials-panel.test.ts —— 门户物料在设计器侧的可发现性与配置（2026-10-29 P2）
 *
 * 覆盖：
 * - 门户页的物料面板按「基础组件 / 业务组件」两组收敛，且包含新增的「魔方 / 页面入口」；
 * - `pagePicker` setter 的选项来自已保存页面，选中写回 `node.props.pageId`。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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
import MaterialPanel from '../src/panel/MaterialPanel.vue'
import PropsPanel from '../src/panel/PropsPanel.vue'
import { findNode } from '../src/core/schema-ops'

const PAGES: PageListItem[] = [
  { id: 'p_leave', name: '请假列表', type: 'list' },
  { id: 'p_home', name: '门户首页', type: 'portal' },
]

function portalSchema(): PageSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'p_home',
    name: '门户首页',
    type: 'portal',
    root: {
      id: 'root',
      componentName: 'Page',
      children: [
        // 一个页面入口节点，用于 pagePicker 测试
        { id: 'n-entry', componentName: 'PortalPageEntry', props: { title: '请假', pageId: '' } },
        // 一个魔方节点，用于 pageItemList 测试
        {
          id: 'n-grid',
          componentName: 'PortalGrid',
          props: {
            title: '',
            columns: 4,
            items: [
              { icon: '考', title: '考勤', pageId: '' },
              { icon: '报', title: '报销', pageId: 'p_leave' },
            ],
          },
        },
      ],
    },
    portal: { title: '门户首页', columns: 4, cards: [] },
  }
}

function mockApi() {
  return {
    getSchema: vi.fn().mockResolvedValue({ schema: portalSchema(), version: 'draft', revision: 1 }),
    saveSchema: vi.fn().mockResolvedValue({ revision: 2 }),
    publish: vi.fn().mockResolvedValue({ version: 1 }),
    listModels: vi.fn<() => Promise<ModelSummary[]>>().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue({ fields: [] }),
    putModel: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn<() => Promise<VersionList>>().mockResolvedValue({
      pageId: 'p_home',
      status: 'draft',
      currentVersion: 0,
      versions: [],
    }),
    rollback: vi.fn().mockResolvedValue({ rolledBackTo: 1 }),
    listRbac: vi.fn<() => Promise<RbacConfig>>().mockResolvedValue({ roles: [], pages: {} }),
    putRole: vi.fn<(r: RoleRecord) => Promise<void>>().mockResolvedValue(undefined),
    putPageAuth: vi.fn().mockResolvedValue(undefined),
    listPages: vi.fn<() => Promise<PageListItem[]>>().mockResolvedValue(PAGES),
    deletePage: vi.fn().mockResolvedValue({ removedVersions: 0 }),
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('门户页物料面板（P2）', () => {
  it('只出「基础组件 / 业务组件」两组，且含魔方与页面入口', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    store.replaceSchema(portalSchema())

    const w = mount(MaterialPanel)
    const groups = w.findAll('.lc-material-panel__group-title').map((g) => g.text())
    expect(groups).toEqual(['基础组件', '业务组件'])

    const labels = w.findAll('.lc-material-panel__item').map((i) => i.text())
    expect(labels).toContain('魔方')
    expect(labels).toContain('页面入口')
    // 魔方归基础、页面入口归业务（分组标题是扁平列表，靠分组块定位）
    const blocks = w.findAll('.lc-material-panel__group')
    const basic = blocks.find((b) => b.text().includes('基础组件'))!
    const biz = blocks.find((b) => b.text().includes('业务组件'))!
    expect(basic.text()).toContain('魔方')
    expect(basic.text()).not.toContain('页面入口')
    expect(biz.text()).toContain('页面入口')
    w.unmount()
  })
})

describe('pagePicker setter（P2）', () => {
  it('选项来自已保存页面，选中写回 props.pageId', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    store.replaceSchema(portalSchema())
    await store.loadPages(true)
    store.select('n-entry')

    const w = mount(PropsPanel)
    await flushPromises()

    const sel = w.get('[data-testid="setter-page-picker"]')
    expect(sel.findAll('option').map((o) => o.text())).toEqual([
      '未选择页面',
      '请假列表（p_leave）',
      '门户首页（p_home）',
    ])
    // 初始未选择
    expect((sel.element as HTMLSelectElement).value).toBe('')

    await sel.setValue('p_leave')
    expect(findNode(store.schema, 'n-entry')?.props?.pageId).toBe('p_leave')
    w.unmount()
  })
})

describe('pageItemList setter（魔方入口行编辑，P2 收尾）', () => {
  async function mountGrid() {
    const store = useDesignerStore()
    store.setApi(mockApi())
    store.replaceSchema(portalSchema())
    await store.loadPages(true)
    store.select('n-grid')
    const w = mount(PropsPanel)
    await flushPromises()
    return { store, w }
  }

  const itemsOf = (store: ReturnType<typeof useDesignerStore>) =>
    (findNode(store.schema, 'n-grid')?.props?.items ?? []) as Array<Record<string, string>>

  it('按行渲染图标/名称/目标页面（目标页是下拉，不是手敲编码）', async () => {
    const { w } = await mountGrid()
    expect(w.findAll('[data-testid^="page-item-title-"]')).toHaveLength(2)
    expect((w.get('[data-testid="page-item-icon-0"]').element as HTMLInputElement).value).toBe('考')
    const sel = w.get('[data-testid="page-item-page-1"]')
    expect((sel.element as HTMLSelectElement).value).toBe('p_leave')
    // 下拉第二项起是已保存页面
    expect(sel.findAll('option').map((o) => o.text())).toEqual(['不跳转', '请假列表', '门户首页'])
    w.unmount()
  })

  it('改名 / 改目标页面写回 props.items，且不丢其它字段', async () => {
    const { store, w } = await mountGrid()
    await w.get('[data-testid="page-item-title-0"]').setValue('打卡')
    await w.get('[data-testid="page-item-page-0"]').setValue('p_home')

    const items = itemsOf(store)
    expect(items[0]).toEqual({ icon: '考', title: '打卡', pageId: 'p_home' })
    // 第二行原样
    expect(items[1]).toEqual({ icon: '报', title: '报销', pageId: 'p_leave' })
    w.unmount()
  })

  it('增 / 删 / 排序', async () => {
    const { store, w } = await mountGrid()

    await w.get('[data-testid="page-item-add"]').trigger('click')
    expect(itemsOf(store)).toHaveLength(3)

    // 下移第一行 → 顺序交换
    await w.get('[data-testid="page-item-down-0"]').trigger('click')
    expect(itemsOf(store).map((i) => i.title)).toEqual(['报销', '考勤', ''])

    await w.get('[data-testid="page-item-del-2"]').trigger('click')
    expect(itemsOf(store)).toHaveLength(2)
    w.unmount()
  })
})
