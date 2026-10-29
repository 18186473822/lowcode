/**
 * portal-config.test.ts —— 门户配置页签（2026-10-29 P1）
 *
 * 覆盖：
 * - 草稿来自 store.appConfig（应用名 / 图标 / 入口页 / 菜单）；
 * - 改名 → dirty → 保存把 patch 交给宿主，成功后再同步；
 * - 菜单增删与排序（顺序即运行时顺序）；
 * - 本地校验（外链必须 http(s)）挡住保存；
 * - 清空入口页提交 `entry: null`（服务端语义 = 清除）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { AppMenuItem } from '@lc/schema'
import { useDesignerStore, type AppConfigPatch, type AppSettings, type PageListItem } from '../src/store/store'
import PortalConfigPanel from '../src/panel/PortalConfigPanel.vue'

const PAGES: PageListItem[] = [
  { id: 'p_home', name: '门户首页', type: 'portal' },
  { id: 'p_leave', name: '请假列表', type: 'list' },
]

const MENUS: AppMenuItem[] = [
  { id: 'm_home', name: '首页', type: 'portal', pageId: 'p_home' },
  { id: 'm_leave', name: '请假', type: 'page', pageId: 'p_leave' },
]

function mockApi(initial: AppSettings) {
  let cfg: AppSettings = JSON.parse(JSON.stringify(initial))
  return {
    getSchema: vi.fn().mockResolvedValue({ schema: {}, version: 'draft', revision: 1 }),
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
    listPages: vi.fn().mockResolvedValue(PAGES),
    deletePage: vi.fn().mockResolvedValue({ removedVersions: 0 }),
    getAppConfig: vi.fn(async () => cfg),
    putAppConfig: vi.fn(async (patch: AppConfigPatch) => {
      const next: Record<string, unknown> = { ...cfg }
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k]
        else next[k] = v
      }
      cfg = next as AppSettings
      return cfg
    }),
  }
}

async function setup(initial: AppSettings = { name: '请假管理', icon: '假', entry: { type: 'portal', pageId: 'p_home' }, menus: MENUS }) {
  const store = useDesignerStore()
  const api = mockApi(initial)
  store.setApi(api)
  await store.loadPages(true)
  await store.loadAppConfig()
  const w = mount(PortalConfigPanel)
  return { store, api, w }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('草稿同步', () => {
  it('应用名 / 图标 / 入口页 / 菜单都来自 store，初始为已同步', async () => {
    const { w } = await setup()
    expect((w.get('[data-testid="cfg-name"]').element as HTMLInputElement).value).toBe('请假管理')
    expect((w.get('[data-testid="cfg-icon"]').element as HTMLInputElement).value).toBe('假')
    expect((w.get('[data-testid="cfg-entry"]').element as HTMLSelectElement).value).toBe('p_home')
    expect(w.findAll('[data-testid^="cfg-menu-name-"]')).toHaveLength(2)
    expect(w.find('[data-testid="cfg-synced"]').exists()).toBe(true)
  })
})

describe('保存', () => {
  it('改名 → 出现未保存提示 → 保存后回到已同步，宿主收到 patch', async () => {
    const { api, w } = await setup()
    await w.get('[data-testid="cfg-name"]').setValue('请假管理 v2')
    expect(w.find('[data-testid="cfg-dirty"]').exists()).toBe(true)

    await w.get('[data-testid="cfg-save"]').trigger('click')
    await flushPromises()

    expect(api.putAppConfig).toHaveBeenCalledTimes(1)
    const patch = api.putAppConfig.mock.calls[0]![0] as AppConfigPatch
    expect(patch.name).toBe('请假管理 v2')
    expect(w.find('[data-testid="cfg-synced"]').exists()).toBe(true)
  })

  it('清空入口页 → patch.entry 为 null（服务端按「清除」处理）', async () => {
    const { api, w } = await setup()
    await w.get('[data-testid="cfg-entry"]').setValue('')
    await w.get('[data-testid="cfg-save"]').trigger('click')
    await flushPromises()
    const patch = api.putAppConfig.mock.calls[0]![0] as AppConfigPatch
    expect(patch.entry).toBeNull()
  })

  it('清空应用名 → patch.name 为 null（不提交空串）', async () => {
    const { api, w } = await setup()
    await w.get('[data-testid="cfg-name"]').setValue('   ')
    await w.get('[data-testid="cfg-save"]').trigger('click')
    await flushPromises()
    const patch = api.putAppConfig.mock.calls[0]![0] as AppConfigPatch
    expect(patch.name).toBeNull()
  })
})

describe('菜单编辑', () => {
  it('添加 / 删除菜单', async () => {
    const { w } = await setup()
    await w.get('[data-testid="cfg-menu-add"]').trigger('click')
    expect(w.findAll('[data-testid^="cfg-menu-name-"]')).toHaveLength(3)

    await w.get('[data-testid="cfg-menu-remove-0"]').trigger('click')
    expect(w.findAll('[data-testid^="cfg-menu-name-"]')).toHaveLength(2)
    // 剩下的第一项是原来的「请假」
    expect((w.get('[data-testid="cfg-menu-name-0"]').element as HTMLInputElement).value).toBe('请假')
  })

  it('下移改变顺序，保存后按新顺序提交', async () => {
    const { api, w } = await setup()
    await w.get('[data-testid="cfg-menu-down-0"]').trigger('click')
    expect((w.get('[data-testid="cfg-menu-name-0"]').element as HTMLInputElement).value).toBe('请假')

    await w.get('[data-testid="cfg-save"]').trigger('click')
    await flushPromises()
    const patch = api.putAppConfig.mock.calls[0]![0] as AppConfigPatch
    expect(patch.menus?.map((m) => m.id)).toEqual(['m_leave', 'm_home'])
  })

  it('删空菜单后给空态', async () => {
    const { w } = await setup()
    await w.get('[data-testid="cfg-menu-remove-0"]').trigger('click')
    await w.get('[data-testid="cfg-menu-remove-0"]').trigger('click')
    expect(w.find('[data-testid="cfg-menu-empty"]').exists()).toBe(true)
  })
})

describe('本地校验', () => {
  it('外链不是 http(s) → 提示且保存禁用', async () => {
    const { w } = await setup({
      name: 'X',
      menus: [{ id: 'm1', name: '外链', type: 'url', url: 'ftp://x' }],
    })
    expect(w.find('[data-testid="cfg-issues"]').text()).toContain('http(s)')
    expect(w.get('[data-testid="cfg-save"]').attributes('disabled')).toBeDefined()
  })

  it('菜单名称为空 → 提示且保存禁用', async () => {
    const { w } = await setup({ menus: [{ id: 'm1', name: '', type: 'page', pageId: 'p_home' }] })
    expect(w.find('[data-testid="cfg-issues"]').text()).toContain('名称为空')
    expect(w.get('[data-testid="cfg-save"]').attributes('disabled')).toBeDefined()
  })
})
