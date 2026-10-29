/**
 * Phase 2 批 1：模型可视化建模（D-P2-1）
 * - store 模型编辑 actions：视图切换 / 新建骨架 / 打开 / 字段行编辑 / 保存门禁（有错不发 PUT）
 * - ModelPanel 面板：列表 ↔ 编辑视图渲染、字段行操作、enum 选项输入、错误红字。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { ModelSchema, PageSchema } from '@lc/schema'
import ModelPanel from '../src/panel/ModelPanel.vue'
import { useDesignerStore, type ModelSummary, type VersionList, type RbacConfig, type RoleRecord } from '../src/store/store'

const empModel = {
  schemaVersion: '1.0.0',
  id: 'm_employee',
  name: '员工信息',
  code: 'm_employee',
  fields: [
    { key: 'empName', name: '姓名', type: 'string' },
    { key: 'dept', name: '部门', type: 'string' },
  ],
} as ModelSchema

const summary: ModelSummary[] = [{ id: 'm_employee', name: '员工信息', code: 'm_employee', fieldCount: 2 }]

/** DesignerApi mock（本批新增 putModel） */
function mockApi() {
  return {
    getSchema: vi.fn<(id: string) => Promise<{ schema: PageSchema; version: string | number }>>(),
    saveSchema: vi.fn<(id: string, s: PageSchema) => Promise<void>>(),
    publish: vi.fn<(id: string) => Promise<{ version?: number }>>(),
    listModels: vi.fn<() => Promise<ModelSummary[]>>().mockResolvedValue(summary),
    getModel: vi.fn<(id: string) => Promise<ModelSchema>>().mockResolvedValue(empModel),
    putModel: vi.fn<(m: ModelSchema) => Promise<void>>().mockResolvedValue(undefined),
    // 批 5：版本历史两方法（本文件不测，只需满足 DesignerApi 形状）
    listVersions: vi.fn<(id: string) => Promise<VersionList>>().mockResolvedValue({
      pageId: 'demo',
      status: 'published',
      currentVersion: 0,
      versions: [],
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

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('store：模型编辑 actions', () => {
  it('switchView(model)：进视图 + force 刷新模型列表；切回 page', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    expect(store.view).toBe('portal') // 2026-10-28：门户清单是默认首页
    await store.switchView('model')
    expect(store.view).toBe('model')
    expect(api.listModels).toHaveBeenCalledTimes(1)
    expect(store.models).toEqual(summary)
    await store.switchView('page')
    expect(store.view).toBe('page')
  })

  it('newModel：空白骨架进编辑器（1 行 f1、code = id）+ 置脏；空白 id no-op', () => {
    const store = useDesignerStore()
    expect(store.newModel('m_leave')).toBe(true)
    expect(store.editingModel?.id).toBe('m_leave')
    expect(store.editingModel?.code).toBe('m_leave')
    expect(store.editingModel?.fields).toHaveLength(1)
    expect(store.modelDirty).toBe(true)
    expect(store.newModel('  ')).toBe(false)
  })

  it('openModel：GET 回填 + 非脏；失败写 modelError 不静默', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    expect(await store.openModel('m_employee')).toBe(true)
    expect(store.editingModel?.name).toBe('员工信息')
    expect(store.modelDirty).toBe(false)
    api.getModel.mockRejectedValueOnce(new Error('404'))
    expect(await store.openModel('nope')).toBe(false)
    expect(store.modelError).toContain('模型打开失败：404')
  })

  it('字段行编辑链：加行 / 改属性 / 排序 / 删行；边界 no-op 不置脏', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.openModel('m_employee')
    // 加字段
    const key = store.addModelField()
    expect(key).toBe('f1')
    expect(store.editingModel?.fields).toHaveLength(3)
    // 改属性（枚举选项串解析在面板层，这里验证 store 透传）
    store.editModelField('f1', { type: 'enum', options: [{ label: 'A', value: 'a' }] })
    expect(store.editingModel?.fields[2]).toMatchObject({ type: 'enum', options: [{ label: 'A', value: 'a' }] })
    // 排序（f1 上移越过 dept）
    store.moveModelField('f1', -1)
    expect(store.editingModel?.fields.map((f) => f.key)).toEqual(['empName', 'f1', 'dept'])
    // 边界 no-op：首行上移（模型引用不变 → 不再置脏）
    store.modelDirty = false
    store.moveModelField('empName', -1)
    expect(store.modelDirty).toBe(false)
    // 删行
    store.removeModelField('f1')
    expect(store.editingModel?.fields.map((f) => f.key)).toEqual(['empName', 'dept'])
    // 顶层属性
    store.setModelProp({ name: '员工档案' })
    expect(store.editingModel?.name).toBe('员工档案')
    expect(store.modelDirty).toBe(true)
  })

  it('saveModel 门禁：校验不过不发 PUT + 错误文案可见', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.newModel('m_leave') // name 空 → validateModel 报「模型缺少 name」
    expect(await store.saveModel()).toBe(false)
    expect(api.putModel).not.toHaveBeenCalled()
    expect(store.modelErrors).toEqual(['模型缺少 name'])
  })

  it('saveModel 成功：putModel 收到编辑态 + 清脏 + 刷新列表 + 状态文本', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.newModel('m_leave')
    store.setModelProp({ name: '请假' })
    store.editModelField('f1', { name: '天数', type: 'number', required: true })
    expect(await store.saveModel()).toBe(true)
    expect(api.putModel).toHaveBeenCalledTimes(1)
    expect(api.putModel.mock.calls[0]![0]).toMatchObject({
      id: 'm_leave',
      name: '请假',
      fields: [{ key: 'f1', name: '天数', type: 'number', required: true }],
    })
    expect(store.modelDirty).toBe(false)
    expect(store.modelErrors).toEqual([])
    expect(store.statusText).toContain('已保存模型 m_leave')
    expect(api.listModels).toHaveBeenCalledTimes(1) // 本用例未走 switchView，只有保存后的这一次 force 刷新
    expect(store.modelSaving).toBe(false)
  })

  it('saveModel 服务端拒：错误落 modelErrors + 复位 saving', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.putModel.mockRejectedValueOnce(new Error('非法的模型 id'))
    store.setApi(api)
    store.newModel('m_leave')
    store.setModelProp({ name: '请假' })
    expect(await store.saveModel()).toBe(false)
    expect(store.modelErrors).toEqual(['保存失败：非法的模型 id'])
    expect(store.modelSaving).toBe(false)
  })

  it('closeModel：回空编辑态', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.openModel('m_employee')
    store.closeModel()
    expect(store.editingModel).toBeNull()
  })
})

describe('ModelPanel（列表 ↔ 编辑视图）', () => {
  it('列表：渲染模型摘要 + 点打开进编辑视图（字段行渲染）', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.switchView('model')
    const w = mount(ModelPanel)
    await flushPromises()
    expect(w.get('[data-testid="model-list"]').text()).toContain('员工信息')
    await w.get('[data-testid="open-model-m_employee"]').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-testid^="field-"]')).toHaveLength(2)
    expect(w.get('[data-testid="model-name"]').element as HTMLInputElement).toHaveProperty(
      'value',
      '员工信息',
    )
    w.unmount()
  })

  it('列表：新建输入 id → 空白骨架进编辑视图', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.switchView('model')
    const w = mount(ModelPanel)
    await flushPromises()
    await w.get('[data-testid="new-model-id"]').setValue('m_leave')
    await w.get('[data-testid="new-model"]').trigger('click')
    expect(store.editingModel?.id).toBe('m_leave')
    expect(w.find('[data-testid="model-dirty"]').exists()).toBe(true)
    expect(w.findAll('[data-testid^="field-"]')).toHaveLength(1)
    w.unmount()
  })

  it('编辑：改名称/展示名写入编辑态；加字段行数 +1；删行 -1', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.switchView('model')
    await store.openModel('m_employee')
    const w = mount(ModelPanel)
    await flushPromises()
    await w.get('[data-testid="model-name"]').setValue('员工档案')
    expect(store.editingModel?.name).toBe('员工档案')
    const nameInput = w.get('[data-testid="field-empName"] .model-field__name')
    await nameInput.setValue('姓名全称')
    expect(store.editingModel?.fields[0]?.name).toBe('姓名全称')
    await w.get('[data-testid="add-field"]').trigger('click')
    expect(store.editingModel?.fields).toHaveLength(3)
    await w.get('[data-testid="field-dept"] .op-btn--danger').trigger('click')
    expect(store.editingModel?.fields.map((f) => f.key)).toEqual(['empName', 'f1'])
    w.unmount()
  })

  it('编辑：type 切 enum 出选项输入；选项串解析写回 options', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.openModel('m_employee')
    const w = mount(ModelPanel)
    await flushPromises()
    const typeSel = w.get('[data-testid="field-empName"] .model-field__type')
    await typeSel.setValue('enum')
    expect(store.editingModel?.fields[0]).toMatchObject({
      type: 'enum',
      options: [{ label: '选项1', value: 'option1' }], // model-ops 自动初始化
    })
    const optsInput = w.get('[data-testid="field-empName"] .model-field__opts')
    await optsInput.setValue('正式工|f,实习生|i')
    await optsInput.trigger('change')
    expect(store.editingModel?.fields[0]?.options).toEqual([
      { label: '正式工', value: 'f' },
      { label: '实习生', value: 'i' },
    ])
    w.unmount()
  })

  it('编辑：required 勾选写入', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.openModel('m_employee')
    const w = mount(ModelPanel)
    await flushPromises()
    // setChecked 在本版 @vue/test-utils 类型为 private —— 原生 click 切换 checked + 手动派发 change
    const cb = w.find<HTMLInputElement>('[data-testid="field-empName"] .model-field__req input')
    cb.element.click()
    await cb.trigger('change')
    expect(store.editingModel?.fields[0]?.required).toBe(true)
    w.unmount()
  })

  it('保存门禁：错误红字列表渲染 + putModel 未被调；合法保存后清脏', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.newModel('m_leave') // name 空 → 门禁拦
    const w = mount(ModelPanel)
    await flushPromises()
    await w.get('[data-testid="save-model"]').trigger('click')
    await flushPromises()
    expect(api.putModel).not.toHaveBeenCalled()
    expect(w.get('[data-testid="model-errors"]').text()).toContain('模型缺少 name')
    // 补齐后保存成功
    await w.get('[data-testid="model-name"]').setValue('请假')
    await w.get('[data-testid="save-model"]').trigger('click')
    await flushPromises()
    expect(api.putModel).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="model-errors"]').exists()).toBe(false)
    expect(store.modelDirty).toBe(false)
    w.unmount()
  })

  it('返回列表：editingModel 清空回到列表视图', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    await store.switchView('model') // 预加载列表（真实流程：从列表进入编辑）
    await store.openModel('m_employee')
    const w = mount(ModelPanel)
    await flushPromises()
    await w.get('[data-testid="back-list"]').trigger('click')
    expect(store.editingModel).toBeNull()
    expect(w.find('[data-testid="model-list"]').exists()).toBe(true)
    w.unmount()
  })

  it('数据权限区块（批 6）：dataScope 下拉写入且 dept 系置灰；CRUD 角色勾选/全清删键', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    // 角色源（真实流程由 switchView(model) → loadRoles 拉取，这里直赋做渲染断言）
    store.rbacRoles = [
      { key: 'admin', name: '平台管理员', perms: ['*'] },
      { key: 'designer', name: '设计师权限', perms: [] },
    ]
    await store.openModel('m_employee')
    const w = mount(ModelPanel)
    await flushPromises()

    const box = w.find('[data-testid="model-perms"]')
    expect(box.exists()).toBe(true)
    expect(box.text()).toContain('向后兼容') // 空/未勾 = 不限制的语义文案

    // dataScope：初始 all → 改 self 写入；dept 系存在但置灰（需组织服务，防配了不生效）
    const sel = w.find<HTMLSelectElement>('[data-testid="model-data-scope"]')
    expect(sel.element.value).toBe('all')
    const opts = [...sel.element.options]
    expect(opts.find((o) => o.value === 'dept')!.disabled).toBe(true)
    expect(opts.find((o) => o.value === 'deptAndChild')!.disabled).toBe(true)
    await sel.setValue('self')
    expect(store.editingModel?.dataScope).toBe('self')
    expect(store.modelDirty).toBe(true)

    // CRUD 勾选：read → admin
    const cb = w.find<HTMLInputElement>('[data-testid="perm-read-admin"] input')
    cb.element.click()
    await cb.trigger('change')
    expect(store.editingModel?.permissions?.read).toEqual(['admin'])

    // 全清 → 删键（= 不限制，向后兼容）
    cb.element.click()
    await cb.trigger('change')
    expect(store.editingModel?.permissions?.read).toBeUndefined()
    w.unmount()
  })
})
