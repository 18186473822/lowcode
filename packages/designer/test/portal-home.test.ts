/**
 * portal-home.test.ts —— 门户设计一级首页骨架（2026-10-29 P0）
 *
 * 覆盖三块新增结构：
 * - 应用条：应用名 / 入口页 / 门户页数，配置缺失时降级为「未命名应用 / 未设置」；
 * - 页签：门户页面（清单默认）↔ 门户配置（入口页 + 底部栏只读）；
 * - 工作区右栏：五个入口可直达对应视图。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { AppSchema, PageSchema } from '@lc/schema'
import { useDesignerStore, type PageListItem } from '../src/store/store'
import PortalPanel from '../src/panel/PortalPanel.vue'

function portalSchema(id: string, name: string): PageSchema {
  return {
    schemaVersion: '1.0.0',
    id,
    name,
    type: 'portal',
    root: { id: 'root', componentName: 'Page', children: [] },
    portal: { title: name, columns: 4, cards: [] },
  }
}

function portalRow(id: string, name = id): PageListItem {
  return { id, name, type: 'portal', status: 'draft', currentVersion: 0, updatedAt: '2026-10-29T01:12:00.000Z' }
}

const APP_CONFIG: AppSchema = {
  schemaVersion: '1.0.0',
  id: 'app_leave',
  name: '请假管理',
  entry: { type: 'portal', pageId: 'p_home' },
  menus: [
    { id: 'm_home', name: '首页', type: 'portal', pageId: 'p_home' },
    { id: 'm_todo', name: '我的待办', type: 'builtin', target: 'todoList' },
    { id: 'm_site', name: '官网', type: 'url', url: 'https://example.com' },
  ],
  pages: ['p_home'],
}

/** DesignerApi 最小 mock；`withAppConfig=false` 模拟宿主未实现可选能力 */
function mockApi(pages: PageListItem[], withAppConfig = true) {
  const base = {
    getSchema: vi.fn().mockImplementation(async (id: string) => ({
      schema: portalSchema(id, id),
      version: 'draft',
      revision: 1,
    })),
    saveSchema: vi.fn().mockResolvedValue({ revision: 2 }),
    publish: vi.fn().mockResolvedValue({ version: 1 }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue({ fields: [] }),
    putModel: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue({ pageId: 'x', status: 'draft', currentVersion: 0, versions: [] }),
    rollback: vi.fn().mockResolvedValue({ rolledBackTo: 1 }),
    listRbac: vi.fn().mockResolvedValue({ roles: [], pages: {} }),
    putRole: vi.fn().mockResolvedValue(undefined),
    putPageAuth: vi.fn().mockResolvedValue(undefined),
    listPages: vi.fn().mockResolvedValue(pages),
    deletePage: vi.fn().mockResolvedValue({ removedVersions: 0 }),
  }
  return withAppConfig ? { ...base, getAppConfig: vi.fn().mockResolvedValue(APP_CONFIG) } : base
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('门户首页 · 应用条', () => {
  it('展示应用名 / 入口页 / 门户页数 / 最近编辑', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi([portalRow('p_home', '门户首页'), portalRow('p_docs', '文档门户')]))
    await store.loadPortalPages()
    await store.loadAppConfig()

    const w = mount(PortalPanel)
    const bar = w.get('[data-testid="portal-appbar"]').text()
    expect(bar).toContain('请假管理')
    expect(bar).toContain('入口页 门户首页')
    expect(bar).toContain('2 个门户页')
    expect(bar).toContain('最近编辑 10-29 01:12')
  })

  it('宿主未实现 getAppConfig → 降级为未命名应用 / 入口页未设置，清单照常渲染', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi([portalRow('p_home', '门户首页')], false))
    await store.loadPortalPages()
    expect(await store.loadAppConfig()).toBe(false)

    const w = mount(PortalPanel)
    const bar = w.get('[data-testid="portal-appbar"]').text()
    expect(bar).toContain('未命名应用')
    expect(bar).toContain('入口页 未设置')
    // 清单不受影响
    expect(w.find('[data-testid="portal-table"]').exists()).toBe(true)
  })
})

describe('门户首页 · 页签', () => {
  it('默认门户页面（有表格），切到门户配置显示可编辑表单', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi([portalRow('p_home', '门户首页')]))
    await store.loadPortalPages()
    await store.loadAppConfig()

    const w = mount(PortalPanel)
    expect(w.find('[data-testid="portal-table"]').exists()).toBe(true)
    expect(w.find('[data-testid="portal-config"]').exists()).toBe(false)

    await w.get('[data-testid="portal-tab-config"]').trigger('click')

    expect(w.find('[data-testid="portal-table"]').exists()).toBe(false)
    const cfg = w.get('[data-testid="portal-config"]')
    expect((cfg.get('[data-testid="cfg-name"]').element as HTMLInputElement).value).toBe('请假管理')
    expect((cfg.get('[data-testid="cfg-entry"]').element as HTMLSelectElement).value).toBe('p_home')
    // 三条菜单各一行，第一条是主页
    expect(cfg.findAll('[data-testid^="cfg-menu-name-"]')).toHaveLength(3)
    expect(cfg.find('[data-testid="cfg-menu-home"]').exists()).toBe(true)

    // 切回清单
    await w.get('[data-testid="portal-tab-pages"]').trigger('click')
    expect(w.find('[data-testid="portal-table"]').exists()).toBe(true)
  })

  it('未配置菜单时给明确空态，不是空白', async () => {
    const store = useDesignerStore()
    store.setApi({
      ...mockApi([portalRow('p_home', '门户首页')]),
      getAppConfig: vi.fn().mockResolvedValue({ ...APP_CONFIG, menus: [] }),
    })
    await store.loadPortalPages()
    await store.loadAppConfig()

    const w = mount(PortalPanel)
    await w.get('[data-testid="portal-tab-config"]').trigger('click')
    expect(w.find('[data-testid="cfg-menu-empty"]').exists()).toBe(true)
  })
})

describe('门户首页 · 工作区右栏', () => {
  it('五个入口齐备，点数据模型直达 model 视图', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi([portalRow('p_home', '门户首页')]))
    await store.loadPortalPages()

    const w = mount(PortalPanel)
    const items = w.findAll('[data-testid^="portal-ws-"]')
    expect(items).toHaveLength(5)

    await w.get('[data-testid="portal-ws-model"]').trigger('click')
    await flushPromises()
    expect(store.view).toBe('model')
  })
})
