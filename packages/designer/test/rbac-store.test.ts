/**
 * rbac-store.test.ts —— 批 6：权限 RBAC store actions（PLANS.md §2 / D-P2-12）。
 *
 * 覆盖：loadRbac 三态（成功载入 roles+pages+页面行源 / 无 api / 拉取失败）、
 * 角色编辑生命周期（newRole/editRole/setRoleProp/setRolePerms/roleGateErrors/saveRole 门禁与落库）、
 * togglePageRole 矩阵写回（含全取消删条目、失败回滚重拉）、setNodePerm action、
 * 模型权限区块（setModelDataScope/toggleModelPerm 脏态与删键语义）、loadRoles 轻量载入。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { PageSchema, ModelSchema } from '@lc/schema'
import {
  useDesignerStore,
  type ModelSummary,
  type VersionList,
  type RbacConfig,
  type RoleRecord,
} from '../src/store/store'
import { demoPage } from '../src/fixtures/demo-page'
import { findNode } from '../src/core/schema-ops'

/** DesignerApi mock 工厂（沿 store.test.ts 形态；失败用例在调用处覆写具体方法） */
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
      currentVersion: 0,
      versions: [],
    }),
    rollback: vi
      .fn<(id: string, v: number) => Promise<{ rolledBackTo: number }>>()
      .mockResolvedValue({ rolledBackTo: 1 }),
    listRbac: vi
      .fn<() => Promise<RbacConfig>>()
      .mockResolvedValue({
        roles: [
          { key: 'admin', name: '平台管理员', perms: ['*'] },
          { key: 'designer', name: '设计师权限', perms: ['emp_submit'] },
        ],
        pages: { demo: ['admin'] },
      }),
    putRole: vi.fn<(r: RoleRecord) => Promise<void>>().mockResolvedValue(undefined),
    putPageAuth: vi.fn<(id: string, roles: string[]) => Promise<void>>().mockResolvedValue(undefined),
    listPages: vi
      .fn<() => Promise<Array<{ id: string; name: string }>>>()
      .mockResolvedValue([{ id: 'demo', name: '演示页' }]),
  }
}

describe('批 6：RBAC store actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('switchView(rbac)：载入角色 + 页面授权 + 页面行源；loading 归位', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)

    await store.switchView('rbac')
    expect(store.view).toBe('rbac')
    expect(store.rbacLoading).toBe(false)
    expect(store.rbacError).toBe('')
    expect(store.rbacRoles).toHaveLength(2)
    expect(store.rbacRoles[0]).toMatchObject({ key: 'admin', perms: ['*'] })
    expect(store.pageAuth).toEqual({ demo: ['admin'] })
    expect(store.rbacPages).toEqual([{ id: 'demo', name: '演示页' }])
    expect(api.listRbac).toHaveBeenCalledTimes(1)

    // 已在目标视图 → no-op（不重复拉取）
    await store.switchView('rbac')
    expect(api.listRbac).toHaveBeenCalledTimes(1)
  })

  it('loadRbac：无 api 不抛（写 rbacError 不静默）；listRbac 失败带原因', async () => {
    const store = useDesignerStore()
    await store.loadRbac()
    expect(store.rbacError).toContain('未配置服务端 API')

    const api = mockApi()
    api.listRbac = vi.fn<() => Promise<RbacConfig>>().mockRejectedValue(new Error('网络炸了'))
    store.setApi(api)
    await store.loadRbac()
    expect(store.rbacError).toContain('网络炸了')
    expect(store.rbacLoading).toBe(false)
  })

  it('角色编辑生命周期：newRole 进编辑 → setRoleProp/setRolePerms 改值 → closeRole 复位', () => {
    const store = useDesignerStore()

    expect(store.newRole('employee')).toBe(true)
    expect(store.editingRole).toMatchObject({ key: 'employee', name: '', perms: [] })
    expect(store.newRole('  ')).toBe(false) // 空 key no-op

    store.setRoleProp({ name: '普通员工' })
    store.setRolePerms(' emp_submit , emp_approve ,')
    expect(store.editingRole).toMatchObject({
      name: '普通员工',
      perms: ['emp_submit', 'emp_approve'], // 逗号 split + 去空
    })

    store.closeRole()
    expect(store.editingRole).toBeNull()
    expect(store.roleErrors).toEqual([])
  })

  it('editRole 回填拷贝（改 perms 不污染列表源）；不存在 key → null', () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)

    // 同步拉一份列表态（不进视图，直接 loadRbac）
    return store.loadRbac().then(() => {
      store.editRole('designer')
      expect(store.editingRole).toMatchObject({ key: 'designer', perms: ['emp_submit'] })
      store.setRolePerms('other_perm')
      const src = store.rbacRoles.find((r) => r.key === 'designer')
      expect(src?.perms).toEqual(['emp_submit']) // 源未被污染

      store.editRole('ghost')
      expect(store.editingRole).toBeNull()
    })
  })

  it('roleGateErrors 三类红字（坏 key / 空 name / 坏 perms）与合法空集', () => {
    const store = useDesignerStore()
    expect(store.roleGateErrors({ key: '1bad', name: 'x', perms: [] })).toHaveLength(1)
    expect(store.roleGateErrors({ key: 'ok_key', name: '  ', perms: [] })).toHaveLength(1)
    expect(store.roleGateErrors({ key: 'ok_key', name: 'x', perms: ['has space'] })).toHaveLength(1)
    expect(
      store.roleGateErrors({ key: 'ok_key', name: 'x', perms: ['*', 'emp_1'] }),
    ).toEqual([])
  })

  it('saveRole：门禁红字不发 PUT；成功落库并关编辑刷新列表；失败 rbacError 不静默', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)

    // 门禁拦截
    store.newRole('bad key')
    store.setRoleProp({ name: '坏' })
    expect(await store.saveRole()).toBe(false)
    expect(store.roleErrors.length).toBeGreaterThan(0)
    expect(api.putRole).not.toHaveBeenCalled()
    expect(store.editingRole).not.toBeNull() // 保持编辑态供修正

    // 成功路径：覆写 listRbac 模拟「服务端 upsert 后」的最新真相（saveRole 成功会 loadRbac 刷新）
    api.listRbac = vi.fn<() => Promise<RbacConfig>>().mockResolvedValue({
      roles: [
        { key: 'admin', name: '平台管理员', perms: ['*'] },
        { key: 'designer', name: '设计师权限', perms: ['emp_submit'] },
        { key: 'employee', name: '普通员工', perms: ['emp_submit'] },
      ],
      pages: {},
    })
    store.newRole('employee')
    store.setRoleProp({ name: '普通员工' })
    store.setRolePerms('emp_submit')
    expect(await store.saveRole()).toBe(true)
    expect(api.putRole).toHaveBeenCalledWith({ key: 'employee', name: '普通员工', perms: ['emp_submit'] })
    expect(store.editingRole).toBeNull()
    expect(store.rbacRoles.some((r) => r.key === 'employee')).toBe(true) // 列表已刷新

    // 失败路径（补 name 过门禁，让请求真发出去再失败）
    const failApi = mockApi()
    failApi.putRole = vi.fn<(r: RoleRecord) => Promise<void>>().mockRejectedValue(new Error('写盘失败'))
    store.setApi(failApi)
    store.newRole('employee2')
    store.setRoleProp({ name: '员工二' })
    expect(await store.saveRole()).toBe(false)
    expect(store.rbacError).toContain('写盘失败')
  })

  it('togglePageRole：勾选写入白名单；全取消删条目（putPageAuth 传空数组）', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.loadRbac()

    // demo 当前 ['admin'] → 勾 designer → 两角色
    await store.togglePageRole('demo', 'designer', true)
    expect(store.pageAuth.demo).toEqual(['admin', 'designer'])
    expect(api.putPageAuth).toHaveBeenLastCalledWith('demo', expect.arrayContaining(['admin', 'designer']))

    // 取消两个 → 删条目（恢复全员可见）
    await store.togglePageRole('demo', 'admin', false)
    await store.togglePageRole('demo', 'designer', false)
    expect(store.pageAuth.demo).toBeUndefined()
    expect(api.putPageAuth).toHaveBeenLastCalledWith('demo', [])

    // 从未配置的页面：勾选从 undefined 起步
    await store.togglePageRole('p_new', 'admin', true)
    expect(store.pageAuth.p_new).toEqual(['admin'])
  })

  it('togglePageRole 失败：rbacError 带原因 + 重拉回滚本地乐观态', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.putPageAuth = vi
      .fn<(id: string, roles: string[]) => Promise<void>>()
      .mockRejectedValue(new Error('权限服务挂了'))
    store.setApi(api)
    await store.loadRbac()

    await store.togglePageRole('demo', 'designer', true)
    expect(store.rbacError).toContain('权限服务挂了')
    // 重拉后回到服务端真相（['admin']，乐观的勾选被回滚）
    expect(store.pageAuth.demo).toEqual(['admin'])
  })

  it('setNodePerm action：写顶层 perm + dirty（touch）；空串清除', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.save() // 复位 idle 观察 touch
    expect(store.saveState).toBe('idle')

    store.select('n-input')
    store.setNodePerm('n-input', 'emp_submit')
    expect(findNode(store.schema, 'n-input')?.perm).toBe('emp_submit')
    expect(store.saveState).toBe('dirty')

    store.setNodePerm('n-input', '')
    expect(findNode(store.schema, 'n-input')?.perm).toBeUndefined()
  })

  it('模型权限区块：setModelDataScope 脏态；toggleModelPerm 勾选/全清删键', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.openModel('m_employee')
    expect(store.editingModel).toBeTruthy()

    store.setModelDataScope('self')
    expect(store.editingModel!.dataScope).toBe('self')
    expect(store.modelDirty).toBe(true)

    // 勾 read 两角色 → 数组落地
    store.toggleModelPerm('read', 'admin', true)
    store.toggleModelPerm('read', 'designer', true)
    expect(store.editingModel!.permissions?.read).toEqual(['admin', 'designer'])

    // 取消一个 → 只剩 admin
    store.toggleModelPerm('read', 'designer', false)
    expect(store.editingModel!.permissions?.read).toEqual(['admin'])

    // 全清 → 删键（= 不限制）
    store.toggleModelPerm('read', 'admin', false)
    expect(store.editingModel!.permissions?.read).toBeUndefined()
  })

  it('loadRoles：轻量载入角色（不调 listPages）', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.loadRoles()
    expect(api.listRbac).toHaveBeenCalledTimes(1)
    expect(api.listPages).not.toHaveBeenCalled()
    expect(store.rbacRoles).toHaveLength(2)
  })
})
