/**
 * panel-state.test.ts —— 面板状态视图（空 / 加载 / 错误）
 *
 * 规范：docs/design-system.md §5「异常状态族」——
 *   ① 空状态必须有出口，且不能只写「暂无数据」；
 *   ② 加载中优先骨架屏（不用整屏遮罩转圈），且**不得与空状态混淆**；
 *   ③ 错误态就地呈现 + 有重试出口，不静默。
 *
 * 覆盖：PanelState 组件单元行为 + PropsPanel / ModelPanel / RbacPanel 接入后的可观测状态。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PanelState from '../src/components/PanelState.vue'
import PropsPanel from '../src/panel/PropsPanel.vue'
import ModelPanel from '../src/panel/ModelPanel.vue'
import RbacPanel from '../src/panel/RbacPanel.vue'
import { useDesignerStore } from '../src/store/store'

/** DesignerApi 最小 mock（只覆盖本文件用到的方法） */
function mockApi() {
  return {
    getSchema: vi.fn().mockResolvedValue({ schema: {}, version: 'draft' }),
    saveSchema: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue({ version: 1 }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue({ fields: [] }),
    putModel: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue({
      pageId: 'demo',
      status: 'draft',
      currentVersion: 0,
      versions: [],
    }),
    rollback: vi.fn().mockResolvedValue({ rolledBackTo: 1 }),
    listRbac: vi.fn().mockResolvedValue({ roles: [], pages: {} }),
    putRole: vi.fn().mockResolvedValue(undefined),
    putPageAuth: vi.fn().mockResolvedValue(undefined),
    listPages: vi.fn().mockResolvedValue([]),
  }
}

describe('PanelState 组件：四态形态', () => {
  it('空态：标题 + 说明 + 出口按钮，点击 emit action', async () => {
    const w = mount(PanelState, {
      props: {
        kind: 'empty',
        title: '还没有数据',
        text: '先创建一条再来。',
        actionText: '去创建',
        testid: 'demo',
      },
    })

    expect(w.find('[data-testid="demo"]').exists()).toBe(true)
    expect(w.text()).toContain('还没有数据')
    expect(w.text()).toContain('先创建一条再来。')

    await w.find('[data-testid="demo-action"]').trigger('click')
    expect(w.emitted('action')).toHaveLength(1)
  })

  it('空态：无 actionText 时不渲染出口（由调用方保证规范要求）', () => {
    const w = mount(PanelState, { props: { kind: 'empty', title: '空' } })
    expect(w.find('.lc-state__action').exists()).toBe(false)
  })

  it('错误态：role=alert（可被读屏即时播报）', () => {
    const w = mount(PanelState, { props: { kind: 'error', title: '接口 500' } })
    expect(w.attributes('role')).toBe('alert')
    expect(w.classes()).toContain('lc-state--error')
  })

  it('骨架屏：按 rows 渲染条数，不含文字与出口，标记 aria-busy', () => {
    const w = mount(PanelState, { props: { kind: 'skeleton', rows: 4 } })
    expect(w.findAll('.lc-skeleton__bar')).toHaveLength(4)
    expect(w.find('.lc-state__title').exists()).toBe(false)
    expect(w.find('.lc-state__action').exists()).toBe(false)
    expect(w.attributes('aria-busy')).toBe('true')
  })

  it('加载态：转圈指示 + aria-busy', () => {
    const w = mount(PanelState, { props: { kind: 'loading' } })
    expect(w.find('.lc-state__spinner').exists()).toBe(true)
    expect(w.attributes('aria-busy')).toBe('true')
  })

  it('inline 修饰：追加紧凑类，供窄面板内嵌', () => {
    const w = mount(PanelState, { props: { kind: 'empty', inline: true } })
    expect(w.classes()).toContain('lc-state--inline')
  })

  it('默认 rows=3 / inline=false（默认值生效）', () => {
    const w = mount(PanelState, { props: { kind: 'skeleton' } })
    expect(w.findAll('.lc-skeleton__bar')).toHaveLength(3)
    expect(w.classes()).not.toContain('lc-state--inline')
  })
})

describe('状态接入：加载态不得被误显示为空态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ModelPanel：modelsLoading → 骨架屏，且空态不出现', () => {
    const store = useDesignerStore()
    store.models = []
    store.modelsLoading = true
    const w = mount(ModelPanel)

    expect(w.find('[data-testid="model-list-loading"]').exists()).toBe(true)
    expect(w.find('[data-testid="model-empty"]').exists()).toBe(false)
    expect(w.find('[data-testid="model-list"]').exists()).toBe(false)
  })

  it('ModelPanel：加载结束且为空 → 空态 + 出处（去输入 id）', async () => {
    const store = useDesignerStore()
    store.models = []
    store.modelsLoading = false
    store.modelError = ''
    const w = mount(ModelPanel)

    const empty = w.find('[data-testid="model-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('还没有数据模型')
    // 出口存在（规范：空状态必须可行动）
    expect(w.find('[data-testid="model-empty-action"]').exists()).toBe(true)
  })

  it('RbacPanel：rbacLoading → 骨架屏，且角色空态不出现', () => {
    const store = useDesignerStore()
    store.rbacRoles = []
    store.rbacError = ''
    store.rbacLoading = true
    const w = mount(RbacPanel)

    expect(w.find('[data-testid="rbac-loading"]').exists()).toBe(true)
    expect(w.find('[data-testid="role-empty"]').exists()).toBe(false)
  })

  it('RbacPanel：错误优先于加载态（错误与加载不会同时出现）', () => {
    const store = useDesignerStore()
    store.rbacError = 'RBAC 加载失败：网络炸了'
    store.rbacLoading = true
    const w = mount(RbacPanel)

    expect(w.find('[data-testid="rbac-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="rbac-loading"]').exists()).toBe(false)
    expect(w.find('[data-testid="rbac-error-action"]').exists()).toBe(true)
  })
})

describe('状态接入：错误态必须有重试出口', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('RbacPanel：点「重试」→ 重新拉取 RBAC 配置', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.rbacError = 'RBAC 加载失败：网络炸了'

    const w = mount(RbacPanel)
    await w.find('[data-testid="rbac-error-action"]').trigger('click')
    await flushPromises()

    expect(api.listRbac).toHaveBeenCalled()
  })

  it('PropsPanel：点「重试」→ 强制重拉模型列表（绕过「已加载即跳过」缓存）后错误消失', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.listModels.mockRejectedValueOnce(new Error('服务不可用'))
    store.setApi(api)

    const w = mount(PropsPanel)
    await flushPromises()
    expect(w.find('[data-testid="model-error"]').exists()).toBe(true)

    api.listModels.mockResolvedValue([
      { id: 'm_employee', name: '员工档案', fieldCount: 3 },
    ])
    await w.find('[data-testid="model-error-action"]').trigger('click')
    await flushPromises()

    expect(api.listModels).toHaveBeenCalledTimes(2)
    expect(w.find('[data-testid="model-error"]').exists()).toBe(false)
  })
})

describe('状态接入：未选中节点的空态文案保持稳定（既有断言基线）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('PropsPanel：无选中 → 空态，仍含「点击画布中任意节点」', () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    store.clearSelect()
    const w = mount(PropsPanel)

    const empty = w.find('[data-testid="props-no-selection"]')
    expect(empty.exists()).toBe(true)
    expect(w.text()).toContain('点击画布中任意节点')
  })
})
