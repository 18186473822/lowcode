/**
 * rbac-panel.test.ts —— 批 6：RbacPanel 权限管理视图（phase2-plan §10 / D-P2-12）。
 *
 * 覆盖：角色列表渲染与空态、新建 → 编辑视图、门禁红字（空 name 不发 PUT）、
 * 保存成功回列表、页面授权矩阵渲染与勾选写回、rbacError 可见不静默。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RbacPanel from '../src/panel/RbacPanel.vue'
import { useDesignerStore, type RbacConfig } from '../src/store/store'

/** 预置 RBAC 列表态（纯渲染断言不发请求；保存用例另挂 mock） */
function seedList(store: ReturnType<typeof useDesignerStore>): void {
  store.rbacRoles = [
    { key: 'admin', name: '平台管理员', perms: ['*'] },
    { key: 'designer', name: '设计师权限', perms: ['emp_submit'] },
  ]
  store.pageAuth = { demo: ['admin'] }
  store.rbacPages = [
    { id: 'demo', name: '演示页' },
    { id: 'open_page', name: '开放页' },
  ]
  store.rbacLoading = false
  store.rbacError = ''
}

/** DesignerApi 最小 mock（saveRole/togglePageRole 需要的三方法） */
function mockApi(cfg?: Partial<RbacConfig>) {
  return {
    getSchema: vi.fn().mockResolvedValue({ schema: {}, version: 'draft' }),
    saveSchema: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue({ version: 1 }),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn().mockResolvedValue({}),
    putModel: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue({ pageId: 'demo', status: 'published', currentVersion: 0, versions: [] }),
    rollback: vi.fn().mockResolvedValue({ rolledBackTo: 1 }),
    listRbac: vi.fn().mockResolvedValue(
      cfg ?? {
        roles: [
          { key: 'admin', name: '平台管理员', perms: ['*'] },
          { key: 'designer', name: '设计师权限', perms: ['emp_submit'] },
        ],
        pages: { demo: ['admin'] },
      },
    ),
    putRole: vi.fn().mockResolvedValue(undefined),
    putPageAuth: vi.fn().mockResolvedValue(undefined),
    listPages: vi.fn().mockResolvedValue([{ id: 'demo', name: '演示页' }]),
  }
}

describe('批 6：RbacPanel 权限管理视图', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('角色列表：行渲染（key/名/权限点摘要）+ 页面矩阵行', () => {
    const store = useDesignerStore()
    seedList(store)
    const w = mount(RbacPanel)

    expect(w.find('[data-testid="role-admin"]').exists()).toBe(true)
    expect(w.find('[data-testid="role-designer"]').text()).toContain('emp_submit')
    expect(w.find('[data-testid="page-matrix"]').exists()).toBe(true)
    expect(w.find('[data-testid="page-demo"]').exists()).toBe(true)
    // demo 对 admin 勾选、对 designer 不勾
    const adminCb = w.find('[data-testid="cell-demo-admin"] input')
    const designerCb = w.find('[data-testid="cell-demo-designer"] input')
    expect((adminCb.element as HTMLInputElement).checked).toBe(true)
    expect((designerCb.element as HTMLInputElement).checked).toBe(false)
  })

  it('空态：无角色给「暂无角色」提示', () => {
    const store = useDesignerStore()
    store.rbacRoles = []
    store.rbacPages = []
    const w = mount(RbacPanel)
    expect(w.find('[data-testid="role-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="page-empty"]').exists()).toBe(true)
  })

  it('新建角色：key → 进编辑视图（显示 key + 名/权限点输入）', async () => {
    const store = useDesignerStore()
    seedList(store)
    const w = mount(RbacPanel)

    await w.find('[data-testid="new-role-key"]').setValue('employee')
    await w.find('[data-testid="new-role"]').trigger('click')

    expect(store.editingRole).toMatchObject({ key: 'employee' })
    expect(w.find('[data-testid="role-name"]').exists()).toBe(true)
    expect(w.find('[data-testid="role-perms"]').exists()).toBe(true)
    expect(w.find('[data-testid="back-roles"]').exists()).toBe(true)
  })

  it('门禁红字：空 name 保存 → role-errors 可见、putRole 不调、保持编辑态', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api as never)
    seedList(store)

    store.newRole('employee')
    const w = mount(RbacPanel)
    // name 保持空 → 点保存
    await w.find('[data-testid="save-role"]').trigger('click')
    await flushPromises()

    expect(w.find('[data-testid="role-errors"]').exists()).toBe(true)
    expect(api.putRole).not.toHaveBeenCalled()
    expect(store.editingRole).not.toBeNull()
  })

  it('保存成功：putRole 载荷正确 → 关编辑回列表', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api as never)
    seedList(store)

    store.newRole('employee')
    const w = mount(RbacPanel)
    await w.find('[data-testid="role-name"]').setValue('普通员工')
    await w.find('[data-testid="role-perms"]').setValue('emp_submit, emp_approve')
    await w.find('[data-testid="save-role"]').trigger('click')
    await flushPromises()

    expect(api.putRole).toHaveBeenCalledWith({
      key: 'employee',
      name: '普通员工',
      perms: ['emp_submit', 'emp_approve'],
    })
    expect(store.editingRole).toBeNull()
    expect(store.view).toBeDefined() // 列表态渲染回来
    expect(w.find('[data-testid="role-list"]').exists()).toBe(true)
  })

  it('矩阵勾选：取消 admin 勾选 → putPageAuth 传空数组（恢复全员可见）', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api as never)
    seedList(store)

    const w = mount(RbacPanel)
    const cb = w.find('[data-testid="cell-demo-admin"] input')
    await cb.setValue(false)
    await flushPromises()

    expect(api.putPageAuth).toHaveBeenCalledWith('demo', [])
    expect(store.pageAuth.demo).toBeUndefined()
  })

  it('rbacError 红字可见（不静默）', () => {
    const store = useDesignerStore()
    seedList(store)
    store.rbacError = 'RBAC 加载失败：网络炸了'
    const w = mount(RbacPanel)
    expect(w.find('[data-testid="rbac-error"]').text()).toContain('网络炸了')
  })

  it('角色行点击 → editRole 回填编辑视图；返回按钮复位', async () => {
    const store = useDesignerStore()
    seedList(store)
    const w = mount(RbacPanel)

    await w.find('[data-testid="edit-role-designer"]').trigger('click')
    expect(store.editingRole).toMatchObject({ key: 'designer', perms: ['emp_submit'] })

    await w.find('[data-testid="back-roles"]').trigger('click')
    expect(store.editingRole).toBeNull()
    expect(w.find('[data-testid="role-list"]').exists()).toBe(true)
  })
})
