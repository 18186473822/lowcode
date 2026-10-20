/**
 * 面板组件测试 —— 设计器批 2（D-A4：META 分组展示 / 排除 Page / 拖拽源 setData；
 * PropsPanel：选中信息 + 删除/排序按钮态 + settings 只读列出）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { PageSchema, ModelSchema } from '@lc/schema'
import MaterialPanel from '../src/panel/MaterialPanel.vue'
import PropsPanel from '../src/panel/PropsPanel.vue'
import { useDesignerStore, type ModelSummary, type VersionList, type RbacConfig, type RoleRecord } from '../src/store/store'
import { findNode } from '../src/core/schema-ops'
import { LC_MATERIAL_MIME } from '../src/core/dnd'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MaterialPanel（META 分组 + 拖拽源）', () => {
  it('展示 34 项（排除 Page：root 不可拖），按 category 分组', () => {
    const w = mount(MaterialPanel)
    const items = w.findAll('.lc-material-panel__item')
    expect(items).toHaveLength(34) // 35 份 META - Page（批 3：12 → 30；批 2：→ 32；批 4：→ 34）
    expect(w.text()).not.toContain('页面根容器')

    const titles = items.map((i) => i.text())
    expect(titles).toContain('单行输入')
    expect(titles).toContain('分组容器')
    expect(titles).toContain('按钮')
    // 批 3 新物料在册（抽样：表单/数据/导航各一）
    expect(titles).toContain('日期选择')
    expect(titles).toContain('描述组')
    expect(titles).toContain('标签页')

    // 分组标题（category 中文）：批 3 新增「数据」「导航」两组
    const groupTitles = w.findAll('.lc-material-panel__group-title').map((g) => g.text())
    expect(groupTitles).toEqual(expect.arrayContaining(['基础', '布局', '表单', '反馈', '数据', '导航']))

    // B6 稿：每项带 16×16 线性图标（图标不参与文本，故上面 titles 断言仍成立）
    expect(items.every((i) => i.find('svg.lc-material-panel__icon').exists())).toBe(true)
    expect(items[0]!.find('svg.lc-material-panel__icon').attributes('viewBox')).toBe('0 0 16 16')
    expect(items[0]!.find('svg.lc-material-panel__icon').attributes('stroke-width')).toBe('1.5')
    w.unmount()
  })

  it('dragstart：setData(MIME, name) + text/plain 兜底 + effectAllowed', async () => {
    const w = mount(MaterialPanel)
    const setData = vi.fn()
    const data: Record<string, string> = {}
    setData.mockImplementation((k: string, v: string) => {
      data[k] = v
    })
    const item = w.findAll('.lc-material-panel__item').find((i) => i.text() === '单行输入')!
    await item.trigger('dragstart', {
      dataTransfer: { setData, effectAllowed: '' } as unknown as DataTransfer,
    })
    expect(setData).toHaveBeenCalledWith(LC_MATERIAL_MIME, 'Input')
    expect(setData).toHaveBeenCalledWith('text/plain', '单行输入')
    w.unmount()
  })

  it('dataTransfer 缺失（如非拖拽环境）不报错', async () => {
    const w = mount(MaterialPanel)
    await w.find('.lc-material-panel__item').trigger('dragstart')
    w.unmount()
  })
})

describe('PropsPanel（选中信息 / 操作按钮 / settings 列出）', () => {
  it('未选中 → 提示文案', () => {
    const w = mount(PropsPanel)
    expect(w.text()).toContain('点击画布中任意节点')
    w.unmount()
  })

  it('选中 Input → 标题 + id + settings 6 行 setter 表单 + expression 占位', async () => {
    const store = useDesignerStore()
    store.select('n-input')
    const w = mount(PropsPanel)
    await nextTick()

    expect(w.find('.lc-props-panel__title').text()).toBe('单行输入')
    expect(w.find('.lc-props-panel__id').text()).toBe('n-input')

    // 限定 settings 区块：面板顶部的「提交模型」也是 .setter（批 4），不属本断言范围
    const rows = w.find('.lc-props-panel__settings').findAll('.setter')
    expect(rows).toHaveLength(6) // label/name/placeholder/required/disabled/value
    expect(w.text()).toContain('字段名')
    // 控件分布（限 settings 区块；批 6 的权限点 perm 在区块外，不计入）：3 input + 2 switch + 1 占位
    const settingsBox = w.find('.lc-props-panel__settings')
    expect(settingsBox.findAll('input[type="text"]')).toHaveLength(3)
    expect(settingsBox.findAll('input[type="checkbox"]')).toHaveLength(2)
    const ph = w.find('.setter-unsupported')
    expect(ph.exists()).toBe(true)
    expect(ph.text()).toContain('expression')
    expect(ph.text()).toContain('Phase 2')

    // 删除/排序可用（非 root）
    const deleteBtn = w.findAll('.op-btn--danger')[0]!
    expect(deleteBtn.attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  /* ---------------- Phase 2 批 3：optionList / color setter ---------------- */

  it('optionList setter：选项行展示/改名/增/删（写回 node.props.options）', async () => {
    const store = useDesignerStore()
    store.select('n-ck') // Checkbox（demo fixture：options 3 项）
    const w = mount(PropsPanel)
    await nextTick()

    const optsBlock = w.find('.setter__options')
    expect(optsBlock.exists()).toBe(true)
    expect(optsBlock.findAll('.setter__option-row')).toHaveLength(3)

    // 改第一行显示名
    const labelInput = optsBlock.findAll('.setter__option-label')[0]!
    ;(labelInput.element as HTMLInputElement).value = '改名项'
    await labelInput.trigger('input')
    const opts = (): Array<{ label: string; value: unknown }> =>
      (findNode(store.schema, 'n-ck')!.props as { options: Array<{ label: string; value: unknown }> }).options
    expect(opts()[0]!.label).toBe('改名项')

    // 添加一行（尾部空行）
    await optsBlock.find('.setter__option-add').trigger('click')
    expect(opts()).toHaveLength(4)

    // 删除第二行
    const rows = w.findAll('.setter__option-row')
    await rows[1]!.find('.setter__option-del').trigger('click')
    expect(opts()).toHaveLength(3)
    expect(opts()[0]!.label).toBe('改名项')
    w.unmount()
  })

  it('optionList setter：value 保型 —— 纯数字串写回 number（formData 严格相等匹配）', async () => {
    const store = useDesignerStore()
    store.select('n-pk') // Picker（demo fixture：options 高/中/低）
    const w = mount(PropsPanel)
    await nextTick()

    const valueInputs = w.findAll('.setter__option-value')
    ;(valueInputs[0]!.element as HTMLInputElement).value = '10086'
    await valueInputs[0]!.trigger('input')
    const opts = (findNode(store.schema, 'n-pk')!.props as { options: Array<{ value: unknown }> }).options
    expect(opts[0]!.value).toBe(10086) // number 而非字符串
    w.unmount()
  })

  it('color setter：缺失值兜底主题色读出，选色写回 hex', async () => {
    const store = useDesignerStore()
    store.select('n-progress') // Progress（activeColor 为 color setter；fixture 未设 → 兜底）
    const w = mount(PropsPanel)
    await nextTick()

    const color = w.find('.setter__color')
    expect(color.exists()).toBe(true)
    expect((color.element as HTMLInputElement).value).toBe('#2b6de8') // 兜底主题色

    ;(color.element as HTMLInputElement).value = '#ff0000'
    await color.trigger('input')
    expect((findNode(store.schema, 'n-progress')!.props as { activeColor?: string }).activeColor).toBe('#ff0000')
    w.unmount()
  })

  it('选中 root → Page 标题 + 无可配置属性 + 删除/排序禁用', async () => {
    const store = useDesignerStore()
    store.select('root')
    const w = mount(PropsPanel)
    await nextTick()

    expect(w.find('.lc-props-panel__title').text()).toBe('页面根容器')
    expect(w.text()).toContain('该节点无可配置属性')
    for (const btn of w.findAll('.op-btn')) {
      expect(btn.attributes('disabled')).toBe('')
    }
    w.unmount()
  })

  it('点删除 → store 节点移除 + 选中清空（按钮直连 store 动作）', async () => {
    const store = useDesignerStore()
    store.select('n-btn')
    const w = mount(PropsPanel)
    await nextTick()

    await w.find('.op-btn--danger').trigger('click')
    expect(store.schema.root.children!.map((c) => c.id)).not.toContain('n-btn')
    expect(store.selectedId).toBe('')
    w.unmount()
  })

  it('点上移 → store 中节点前移一位', async () => {
    const store = useDesignerStore()
    store.select('n-ta')
    const w = mount(PropsPanel)
    await nextTick()

    const ids = () => store.schema.root.children!.map((c) => c.id)
    expect(ids().slice(0, 3)).toEqual(['n-text', 'n-input', 'n-ta'])
    await w.findAll('.op-btn')[0]!.trigger('click') // 上移
    expect(ids().slice(0, 3)).toEqual(['n-text', 'n-ta', 'n-input'])
    w.unmount()
  })
})

describe('PropsPanel setter 编辑（批 3：4 setter 写路径）', () => {
  it('input setter：@input 实时写 store → schema + dirty + 受控回显', async () => {
    const store = useDesignerStore()
    store.select('n-input')
    const w = mount(PropsPanel)
    await nextTick()

    const labelInput = w.findAll('input[type="text"]')[0]! // 首行 = label
    await labelInput.setValue('新标签')
    expect(findNode(store.schema, 'n-input')!.props!.label).toBe('新标签')
    expect(store.saveState).toBe('dirty')
    expect((labelInput.element as HTMLInputElement).value).toBe('新标签') // 受控值同步
    w.unmount()
  })

  it('switch setter：change 写 boolean（按当前值翻转）；required 联动 props.rules（D-A12）', async () => {
    const store = useDesignerStore()
    store.select('n-input')
    const w = mount(PropsPanel)
    await nextTick()

    const sw = w.find('input[type="checkbox"]') // 首个 switch = required
    const before = findNode(store.schema, 'n-input')!.props!.required === true
    ;(sw.element as HTMLInputElement).checked = !before
    await sw.trigger('change')
    expect(findNode(store.schema, 'n-input')!.props!.required).toBe(!before)
    // 必填开关一处控制两层：星号展示 + 校验规则（collectRules 只认 rules，不联动则拦截不生效）
    expect(findNode(store.schema, 'n-input')!.props!.rules).toEqual(
      !before ? [{ type: 'required' }] : [],
    )
    w.unmount()
  })

  it('number setter：change 写数字；清空 → undefined', async () => {
    const store = useDesignerStore()
    store.select('n-ta') // TextArea 有 maxLength（number）
    const w = mount(PropsPanel)
    await nextTick()

    const num = w.find('input[type="number"]')
    expect(num.exists()).toBe(true)
    const el = num.element as HTMLInputElement
    el.value = '99'
    await num.trigger('change')
    expect(findNode(store.schema, 'n-ta')!.props!.maxLength).toBe(99)

    el.value = ''
    await num.trigger('change')
    expect(findNode(store.schema, 'n-ta')!.props!.maxLength).toBeUndefined()
    w.unmount()
  })

  it('select setter：change 按 options 反查原值（保字符串类型）', async () => {
    const store = useDesignerStore()
    store.select('n-radio') // Radio 有 direction（select）
    const w = mount(PropsPanel)
    await nextTick()

    // 限定 settings 区块：首个 select 是批 4 的「提交模型」，此处要的是 direction
    const sel = w.find('.lc-props-panel__settings select')
    expect(sel.exists()).toBe(true)
    const options = sel.findAll('option')
    expect(options.length).toBeGreaterThan(1)
    const pick = options[1]!
    ;(sel.element as HTMLSelectElement).value = pick.attributes('value')!
    await sel.trigger('change')
    expect(findNode(store.schema, 'n-radio')!.props!.direction).toBe(
      pick.attributes('value')!,
    )
    w.unmount()
  })

  it('style.* key 读写对称（批 3：color setter 已实现，style.color 写回 node.style 不误伤 props）', async () => {
    const store = useDesignerStore()
    store.select('n-text') // Text：text(textarea) + style.color(color) + style.fontSize(number)
    const w = mount(PropsPanel)
    await nextTick()

    // 批 3：color / textarea 均已实现 → 面板无占位
    expect(w.find('.setter__color').exists()).toBe(true)
    expect(w.findAll('.setter-unsupported')).toHaveLength(0)

    // style.color 写回 node.style（updateProp 的 style.* 前缀路径）
    const color = w.find('.setter__color')
    ;(color.element as HTMLInputElement).value = '#123456'
    await color.trigger('input')
    expect(store.selectedNode!.style?.color).toBe('#123456')
    expect((store.selectedNode!.props as Record<string, unknown>)['style.color']).toBeUndefined() // 不误写 props
    w.unmount()
  })
})

/* ------------------------------------------------------------------ */
/* 批 4：字段绑定 UI（决策 D-A11）                                      */
/* ------------------------------------------------------------------ */

describe('PropsPanel 字段绑定（提交模型 + 绑定字段）', () => {
  const summary = [{ id: 'm_emp', name: '员工信息', code: 'emp', fieldCount: 2 }] as ModelSummary[]
  const empModel = {
    schemaVersion: '1.0.0',
    id: 'm_emp',
    name: '员工信息',
    code: 'emp',
    fields: [
      { key: 'empName', name: '姓名', type: 'string' },
      { key: 'dept', name: '部门', type: 'string' },
    ],
  } as ModelSchema

  function apiWithModels() {
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
      // 批 6 RBAC：默认空配置（只需满足 DesignerApi 形状）
      listRbac: vi.fn<() => Promise<RbacConfig>>().mockResolvedValue({ roles: [], pages: {} }),
      putRole: vi.fn<(r: RoleRecord) => Promise<void>>().mockResolvedValue(undefined),
      putPageAuth: vi.fn<(id: string, roles: string[]) => Promise<void>>().mockResolvedValue(undefined),
      listPages: vi.fn<() => Promise<Array<{ id: string; name: string }>>>().mockResolvedValue([]),
    }
  }

  it('页面级：提交模型下拉渲染模型列表；选中写入 submit.dataSourceId', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    const w = mount(PropsPanel)
    await flushPromises()

    const sel = w.find('[data-testid="submit-model"]')
    expect(sel.exists()).toBe(true)
    expect(sel.findAll('option').map((o) => o.text())).toEqual(['（不提交到模型）', '员工信息'])

    await sel.setValue('m_emp')
    expect(store.submitModelId).toBe('m_emp')
    expect(store.schema.submit?.dataSourceId).toBe('ds_submit')
    expect(w.text()).toContain('/models/m_emp/records') // 帮助文案回显真实接口
    w.unmount()
  })

  it('页面级：未选中任何节点也显示提交模型（页面配置与选中态无关）', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    const w = mount(PropsPanel)
    await flushPromises()

    expect(w.find('[data-testid="submit-model"]').exists()).toBe(true)
    expect(w.text()).toContain('点击画布中任意节点') // 原空态仍在
    w.unmount()
  })

  it('节点级：hasField 节点出字段下拉（选项=模型字段），绑定写 props.name', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    store.setSubmitModel('m_emp') // 配模型 → watch 触发字段加载
    store.select('n-input') // Input.hasField = true
    const w = mount(PropsPanel)
    await flushPromises()

    const bind = w.find('[data-testid="field-binding"]')
    expect(bind.exists()).toBe(true)
    expect(bind.findAll('option').map((o) => o.text())).toEqual([
      '（未绑定）',
      '姓名（empName）',
      '部门（dept）',
    ])

    await bind.setValue('empName')
    expect(store.schema.root.children).toBeDefined()
    expect(store.selectedNode?.props?.name).toBe('empName')
    w.unmount()
  })

  it('节点级：非 hasField 节点（Text）不出字段下拉', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    store.select('n-text')
    const w = mount(PropsPanel)
    await flushPromises()

    expect(w.find('[data-testid="field-binding"]').exists()).toBe(false)
    w.unmount()
  })

  it('动作绑定（D-A13）：Button 出 click 下拉，选「提交表单」写 actions；有参动作占位禁用', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    store.select('n-btn') // Button.events = ['click']
    const w = mount(PropsPanel)
    await nextTick()

    const sel = w.find('[data-testid="action-click"]')
    expect(sel.exists()).toBe(true)

    // 无参动作可选：提交表单
    await sel.setValue('submit')
    expect(findNode(store.schema, 'n-btn')!.actions).toEqual([{ event: 'click', type: 'submit' }])
    expect(store.saveState).toBe('dirty')

    // 回填：重挂载后当前值 = submit
    const sel2 = w.find('[data-testid="action-click"]')
    expect((sel2.element as HTMLSelectElement).value).toBe('submit')

    // 有参动作（页面跳转）→ 占位禁用（参数编辑器 Phase 2）
    const nav = sel2.findAll('option').find((o) => o.text()!.includes('页面跳转'))!
    expect(nav.attributes('disabled')).toBeDefined()

    // 解除
    await sel2.setValue('')
    expect(findNode(store.schema, 'n-btn')!.actions).toEqual([])
    w.unmount()
  })

  it('动作绑定（D-A13）：无事件物料（Text）不出动作区块', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    store.select('n-text')
    const w = mount(PropsPanel)
    await nextTick()

    expect(w.find('[data-testid="action-click"]').exists()).toBe(false)
    w.unmount()
  })

  it('textarea setter（批 5 补齐）：Text「文本内容」真渲染，改值写 props.text', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    store.select('n-text')
    const w = mount(PropsPanel)
    await nextTick()

    const ta = w.find('textarea.setter__textarea')
    expect(ta.exists()).toBe(true)
    expect((ta.element as HTMLTextAreaElement).value).toBe('标题') // demo n-text 初始值

    ;(ta.element as HTMLTextAreaElement).value = '员工信息登记'
    await ta.trigger('input')
    expect(findNode(store.schema, 'n-text')!.props!.text).toBe('员工信息登记')
    expect(store.saveState).toBe('dirty')
    w.unmount()
  })

  it('权限点 setter（批 6 / D-P2-12）：非 root 写顶层 perm；清空移除；root 不显示', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    store.select('n-btn')
    const w = mount(PropsPanel)
    await nextTick()

    const perm = w.find('[data-testid="node-perm"]')
    expect(perm.exists()).toBe(true)

    await perm.setValue('emp_submit')
    expect(findNode(store.schema, 'n-btn')!.perm).toBe('emp_submit')
    expect(store.saveState).toBe('dirty')
    // perm 是顶层字段，不误写 props
    expect(findNode(store.schema, 'n-btn')!.props).not.toHaveProperty('perm')

    // 清空 → 移除（节点全员可见）
    await w.find('[data-testid="node-perm"]').setValue('')
    expect(findNode(store.schema, 'n-btn')!.perm).toBeUndefined()

    // root 选中 → 不显示权限点（root 不受权限约束）
    store.select('root')
    await nextTick()
    expect(w.find('[data-testid="node-perm"]').exists()).toBe(false)
    w.unmount()
  })

  it('未配提交模型 → 字段下拉给引导文案（不静默空态）', async () => {
    const store = useDesignerStore()
    store.setApi(apiWithModels())
    store.select('n-input')
    const w = mount(PropsPanel)
    await flushPromises()

    expect(w.find('[data-testid="field-binding"]').exists()).toBe(true)
    expect(w.text()).toContain('先在上方选择「提交模型」')
    w.unmount()
  })

  it('模型接口失败 → 错误可见（model-error），不静默', async () => {
    const store = useDesignerStore()
    const api = apiWithModels()
    api.listModels.mockRejectedValue(new Error('服务不可用'))
    store.setApi(api)
    const w = mount(PropsPanel)
    await flushPromises()

    const err = w.find('[data-testid="model-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('服务不可用')
    w.unmount()
  })
})
