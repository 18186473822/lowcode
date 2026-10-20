/**
 * history-dialog.test.ts —— 批 5 HistoryDialog 组件（phase2-plan §9）。
 *
 * 覆盖：v-if 开关、列表三态（载入/失败/空）、倒序行与当前版徽标、note、
 * diff 条目渲染与无差异空态、两步确认回滚（取消 / 确认真调 rollback）、
 * 关闭按钮与遮罩点击、对比按钮触发 compareVersion、清除 diff。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { PageSchema, ModelSchema } from '@lc/schema'
import HistoryDialog from '../src/panel/HistoryDialog.vue'
import { useDesignerStore, type ModelSummary, type VersionList, type RbacConfig, type RoleRecord } from '../src/store/store'
import { demoPage } from '../src/fixtures/demo-page'

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

/** 预置「弹层已开 + 三行版本」的 store 状态（纯渲染断言不发请求） */
function seededStore() {
  const store = useDesignerStore()
  store.historyOpen = true
  store.currentVersion = 3
  store.versions = [
    { version: 3, createdBy: 'admin', createdAt: '2026-10-14T10:00:00.000Z' },
    { version: 2, createdBy: 'admin', createdAt: '2026-10-14T09:00:00.000Z' },
    { version: 1, createdBy: 'admin', createdAt: '2026-10-14T08:00:00.000Z', note: '初版' },
  ]
  return store
}

describe('批 5：HistoryDialog 版本历史弹层', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('historyOpen=false → 不渲染（v-if）', () => {
    const w = mount(HistoryDialog)
    expect(w.find('[data-testid="history-dialog"]').exists()).toBe(false)
  })

  it('列表：三行倒序渲染、v3 当前发布徽标、note 与行按钮可见', () => {
    seededStore()
    const w = mount(HistoryDialog)
    const rows = w.findAll('[data-testid^="history-v"]')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.attributes('data-testid')).toBe('history-v3')
    expect(rows[0]!.find('.lc-history__badge--cur').exists()).toBe(true) // 当前发布版
    expect(rows[2]!.find('.lc-history__badge--cur').exists()).toBe(false)
    expect(rows[2]!.text()).toContain('初版') // v1 带 note
    expect(w.find('[data-testid="history-current"]').text()).toContain('当前发布 v3')
    expect(w.find('[data-testid="compare-v2"]').exists()).toBe(true)
    expect(w.find('[data-testid="rollback-v1"]').exists()).toBe(true)
  })

  it('三态：加载中', () => {
    const store = useDesignerStore()
    store.historyOpen = true
    store.versionsLoading = true
    const w = mount(HistoryDialog)
    expect(w.find('[data-testid="history-loading"]').exists()).toBe(true)
    expect(w.find('[data-testid="history-list"]').exists()).toBe(false)
  })

  it('三态：失败', () => {
    const store = useDesignerStore()
    store.historyOpen = true
    store.versionsError = '版本列表加载失败：boom'
    const w = mount(HistoryDialog)
    expect(w.find('[data-testid="history-error"]').text()).toContain('boom')
  })

  it('三态：空历史', () => {
    const store = useDesignerStore()
    store.historyOpen = true
    store.versions = []
    const w = mount(HistoryDialog)
    expect(w.find('[data-testid="history-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="history-list"]').exists()).toBe(false)
  })

  it('diff 区：条目按 kind 分行渲染，描述含字段与前后值', async () => {
    const store = seededStore()
    store.diffVersion = 1
    store.diffEntries = [
      { kind: 'add', id: 'n9', componentName: 'Text', parentId: 'root' },
      { kind: 'remove', id: 'n8', componentName: 'Image', parentId: 'root' },
      {
        kind: 'change',
        id: 'n-text',
        componentName: 'Text',
        field: 'props.text',
        before: '"旧"',
        after: '"新"',
      },
      { kind: 'move', id: 'n-img', componentName: 'Image', before: 'root@1', after: 'root@2' },
    ]
    const w = mount(HistoryDialog)
    expect(w.find('[data-testid="history-diff"]').exists()).toBe(true)
    expect(w.find('[data-testid="diff-count"]').text()).toBe('4 处差异')
    expect(w.find('[data-testid="diff-add"]').text()).toContain('新增')
    expect(w.find('[data-testid="diff-remove"]').text()).toContain('删除')
    expect(w.find('[data-testid="diff-change"]').text()).toContain('props.text: "旧" → "新"')
    expect(w.find('[data-testid="diff-move"]').text()).toContain('位置 root@1 → root@2')
    // 清除 → diff 区收起、diffVersion 复位
    await w.find('[data-testid="diff-clear"]').trigger('click')
    expect(store.diffVersion).toBeNull()
    expect(w.find('[data-testid="history-diff"]').exists()).toBe(false)
  })

  it('diff 区：0 条 → 「与当前画布无差异」', () => {
    const store = seededStore()
    store.diffVersion = 2
    store.diffEntries = []
    const w = mount(HistoryDialog)
    expect(w.find('[data-testid="diff-none"]').exists()).toBe(true)
    expect(w.find('[data-testid="diff-count"]').text()).toBe('0 处差异')
  })

  it('对比按钮：真调 compareVersion 拉 v1 全文 → 渲染条目 → 清除按钮收起', async () => {
    const store = seededStore()
    const api = mockApi()
    const old = demoPage()
    const first = old.root.children![0]!
    first.props = { ...first.props, text: '__历史__' }
    api.getSchema.mockResolvedValueOnce({ schema: old, version: 'v1' })
    store.setApi(api)

    const w = mount(HistoryDialog)
    await w.find('[data-testid="compare-v1"]').trigger('click')
    await flushPromises()
    expect(api.getSchema).toHaveBeenCalledWith('demo', 'v1')
    expect(w.find('[data-testid="history-diff"]').exists()).toBe(true)
    expect(w.find('[data-testid="diff-change"]').text()).toContain('props.text')

    await w.find('[data-testid="diff-clear"]').trigger('click')
    expect(store.diffVersion).toBeNull()
    expect(w.find('[data-testid="history-diff"]').exists()).toBe(false)
  })

  it('回滚两步确认：首点进确认态不调接口', async () => {
    const store = seededStore()
    const api = mockApi()
    store.setApi(api)
    const w = mount(HistoryDialog)

    await w.find('[data-testid="rollback-v1"]').trigger('click')
    expect(w.find('[data-testid="rollback-v1"]').exists()).toBe(false) // 原按钮让位
    const confirm = w.find('[data-testid="confirm-rollback-v1"]')
    expect(confirm.exists()).toBe(true)
    expect(confirm.text()).toContain('确认回滚到 v1')
    expect(api.rollback).not.toHaveBeenCalled() // 首点不执行
    expect(store.historyOpen).toBe(true)

    // 取消退出确认态，仍不调接口
    await w.find('[data-testid="cancel-rollback"]').trigger('click')
    expect(w.find('[data-testid="rollback-v1"]').exists()).toBe(true)
    expect(api.rollback).not.toHaveBeenCalled()
  })

  it('回滚两步确认：二次确认 → rollback + openPage 重载 → 弹窗关闭', async () => {
    const store = seededStore()
    const api = mockApi()
    store.setApi(api)
    const w = mount(HistoryDialog)

    await w.find('[data-testid="rollback-v1"]').trigger('click')
    await w.find('[data-testid="confirm-rollback-v1"]').trigger('click')
    await flushPromises()

    expect(api.rollback).toHaveBeenCalledWith('demo', 1)
    expect(store.historyOpen).toBe(false)
    expect(w.find('[data-testid="history-dialog"]').exists()).toBe(false)
    expect(store.statusText).toBe('已回滚到 v1（草稿，需重新发布生效）')
  })

  it('刷新按钮 → refreshVersions 重新拉列表', async () => {
    seededStore()
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    const w = mount(HistoryDialog)
    await w.find('[data-testid="history-refresh"]').trigger('click')
    await flushPromises()
    expect(api.listVersions).toHaveBeenCalledTimes(1)
  })

  it('关闭按钮与遮罩点击 → closeHistory（并复位确认态）', async () => {
    const store = seededStore()
    const w = mount(HistoryDialog)
    await w.find('[data-testid="rollback-v3"]').trigger('click')
    expect(w.find('[data-testid="confirm-rollback-v3"]').exists()).toBe(true)

    await w.find('[data-testid="history-close"]').trigger('click')
    expect(store.historyOpen).toBe(false)

    // 重开 → 确认态已复位（watch historyOpen=false 清 confirming）
    store.historyOpen = true
    await w.vm.$nextTick()
    expect(w.find('[data-testid="confirm-rollback-v3"]').exists()).toBe(false)
    expect(w.find('[data-testid="rollback-v3"]').exists()).toBe(true)
  })

  it('遮罩（面板外区域）点击 → 关闭', async () => {
    const store = seededStore()
    const w = mount(HistoryDialog)
    await w.find('[data-testid="history-dialog"]').trigger('click')
    expect(store.historyOpen).toBe(false)
  })
})
