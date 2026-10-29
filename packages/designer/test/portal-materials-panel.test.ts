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
