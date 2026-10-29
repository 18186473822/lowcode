/**
 * Phase 2 批 2：标准页设计器链路
 * - schema-ops 纯函数：setPageType（切类型初始化骨架/保留配置）、updateListConfig / updateDetailConfig
 *   （upsert 起底、换模型重置列/字段）；
 * - store actions：类型切换与配置写入即 touch（validate 红字联动）；
 * - PropsPanel 交互：类型下拉切换、list/detail 配置区块渲染与勾选写入。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { PageSchema, ModelSchema, PageType } from '@lc/schema'
import { createEmptyPage } from '@lc/schema'
import { setPageType, updateListConfig, updateDetailConfig, updatePortalConfig } from '../src/core/schema-ops'
import { useDesignerStore, type ModelSummary, type VersionList, type RbacConfig, type RoleRecord } from '../src/store/store'
import PropsPanel from '../src/panel/PropsPanel.vue'

function basePage(): PageSchema {
  const p = createEmptyPage('pg_x', 'X')
  p.type = 'form'
  p.list = { modelId: '', columns: [] }
  return p
}

/* ---------------- 纯函数 ---------------- */

describe('schema-ops：setPageType（切类型）', () => {
  it('同类型 no-op：返回 id=""，schema 引用不变', () => {
    const p = basePage()
    const r = setPageType(p, 'form')
    expect(r.id).toBe('')
    expect(r.schema).toBe(p)
  })

  it('form → list：初始化骨架 {modelId:"", columns:[]}，id = root.id，原 schema 不被改（纯函数）', () => {
    const p = basePage()
    const r = setPageType(p, 'list')
    expect(r.id).toBe(p.root.id)
    expect(r.schema.type).toBe('list')
    expect(r.schema.list).toEqual({ modelId: '', columns: [] })
    expect(p.type).toBe('form')
  })

  it('detail → list：双方骨架都在（list 已存在则保留原配置不重置）', () => {
    const p = basePage()
    p.type = 'detail'
    p.detail = { modelId: 'm_keep' }
    p.list = { modelId: 'm_old', columns: ['a'] }
    const r = setPageType(p, 'list')
    expect(r.schema.list).toEqual({ modelId: 'm_old', columns: ['a'] }) // 已有配置保留
    expect(r.schema.detail).toEqual({ modelId: 'm_keep' }) // 残留保留（validate 只查当前 type）
    expect(r.schema.type).toBe('list')
  })

  it('list → form：list 配置残留保留（切回不丢）', () => {
    const p = basePage()
    p.type = 'list'
    p.list = { modelId: 'm_e', columns: ['x'] }
    const r = setPageType(p, 'form')
    expect(r.schema.type).toBe('form')
    expect(r.schema.list).toEqual({ modelId: 'm_e', columns: ['x'] })
  })

  it('非法值不拦（类型由 TS/校验层兜底）——只做骨架分支', () => {
    const p = basePage()
    const r = setPageType(p, 'portal' as PageType)
    expect(r.schema.type).toBe('portal')
    expect(r.schema.list).toEqual({ modelId: '', columns: [] }) // 原有骨架原样
  })

  it('form → portal：初始化门户骨架 {cards:[]}（Phase 3 批 4）', () => {
    const p = basePage()
    const r = setPageType(p, 'portal')
    expect(r.id).toBe(p.root.id)
    expect(r.schema.type).toBe('portal')
    expect(r.schema.portal).toEqual({ cards: [] })
  })

  it('portal → form：门户配置残留保留（切回不丢）', () => {
    const p = basePage()
    p.type = 'portal'
    p.portal = { cards: [{ title: '首页', pageId: 'home' }] }
    const r = setPageType(p, 'form')
    expect(r.schema.type).toBe('form')
    expect(r.schema.portal).toEqual({ cards: [{ title: '首页', pageId: 'home' }] })
  })
})

describe('schema-ops：updateListConfig / updateDetailConfig', () => {
  it('配置不存在 → 以 {modelId:""} 起底并合并', () => {
    const p = createEmptyPage('pg_y', 'Y')
    p.type = 'list'
    delete p.list
    const r = updateListConfig(p, { modelId: 'm_e' })
    expect(r.schema.list).toEqual({ modelId: 'm_e' })
    expect(r.id).toBe(p.root.id)
  })

  it('浅合并保留既有字段（sort/search 等不动）', () => {
    const p = createEmptyPage('pg_y', 'Y')
    p.type = 'list'
    p.list = { modelId: 'm_a', columns: ['x'], sort: [{ field: 'days', order: 'desc' }] }
    const r = updateListConfig(p, { detailPageId: 'p_d' })
    expect(r.schema.list).toEqual({
      modelId: 'm_a',
      columns: ['x'],
      sort: [{ field: 'days', order: 'desc' }],
      detailPageId: 'p_d',
    })
  })

  it('换模型重置 columns（列属于模型字段，旧 key 残留会渲染空列）；同模型合并不动 columns', () => {
    const p = createEmptyPage('pg_y', 'Y')
    p.type = 'list'
    p.list = { modelId: 'm_a', columns: ['x', 'y'] }
    const changed = updateListConfig(p, { modelId: 'm_b' })
    expect(changed.schema.list!.modelId).toBe('m_b')
    expect(changed.schema.list!.columns).toEqual([])
    const same = updateListConfig(p, { detailPageId: 'p_d' })
    expect(same.schema.list!.columns).toEqual(['x', 'y'])
  })

  it('updateDetailConfig 对称：起底 + 合并 + 换模型重置 fields', () => {
    const p = createEmptyPage('pg_y', 'Y')
    p.type = 'detail'
    const born = updateDetailConfig(p, { modelId: 'm_a' })
    expect(born.schema.detail).toEqual({ modelId: 'm_a' })
    const withFields = updateDetailConfig(born.schema, { fields: ['a', 'b'] })
    expect(withFields.schema.detail!.fields).toEqual(['a', 'b'])
    const changed = updateDetailConfig(withFields.schema, { modelId: 'm_b' })
    expect(changed.schema.detail!.modelId).toBe('m_b')
    expect(changed.schema.detail!.fields).toEqual([]) // 换模型重置（空数组 = 展示全部字段）
    // 原 schema 不被改（纯函数）
    expect(p.detail).toBeUndefined()
  })
})

describe('schema-ops：updatePortalConfig（Phase 3 批 4）', () => {
  it('配置不存在 → 以 {cards:[]} 起底并合并', () => {
    const p = createEmptyPage('pg_p', 'P')
    p.type = 'portal'
    const r = updatePortalConfig(p, { title: '工作台' })
    expect(r.schema.portal).toEqual({ cards: [], title: '工作台' })
    expect(r.id).toBe(p.root.id)
    expect(p.portal).toBeUndefined() // 纯函数
  })

  it('浅合并：改 columns 不动 cards；cards 整体替换', () => {
    const p = createEmptyPage('pg_p', 'P')
    p.type = 'portal'
    p.portal = { cards: [{ title: 'A', pageId: 'a' }], title: 'T' }
    const r = updatePortalConfig(p, { columns: 3 })
    expect(r.schema.portal).toEqual({ cards: [{ title: 'A', pageId: 'a' }], title: 'T', columns: 3 })
    const r2 = updatePortalConfig(r.schema, { cards: [{ title: 'B' }] })
    expect(r2.schema.portal!.cards).toEqual([{ title: 'B' }])
    expect(r2.schema.portal!.title).toBe('T')
  })
})

/* ---------------- store actions ---------------- */

const empModel = {
  schemaVersion: '1.0.0',
  id: 'm_e',
  name: '员工',
  code: 'm_e',
  fields: [
    { key: 'empName', name: '姓名', type: 'string' },
    { key: 'dept', name: '部门', type: 'string' },
  ],
} as ModelSchema

const otherModel = {
  schemaVersion: '1.0.0',
  id: 'm_o',
  name: '其他',
  code: 'm_o',
  fields: [{ key: 'other', name: '其他', type: 'string' }],
} as ModelSchema

const summary: ModelSummary[] = [
  { id: 'm_e', name: '员工', code: 'm_e', fieldCount: 2 },
  { id: 'm_o', name: '其他', code: 'm_o', fieldCount: 1 },
]

function mockApi() {
  return {
    getSchema: vi.fn<(id: string) => Promise<{ schema: PageSchema; version: string | number }>>(),
    saveSchema: vi.fn<(id: string, s: PageSchema) => Promise<void>>(),
    publish: vi.fn<(id: string) => Promise<{ version?: number }>>(),
    listModels: vi.fn<() => Promise<ModelSummary[]>>().mockResolvedValue(summary),
    // 按 id 分发（换模型用例需要两个模型各自字段）
    getModel: vi.fn<(id: string) => Promise<ModelSchema>>().mockImplementation(async (id) =>
      id === 'm_o' ? otherModel : empModel,
    ),
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

describe('store：标准页 actions', () => {
  it('setPageType(list)：骨架初始化 + touch；同类型不 touch', () => {
    const store = useDesignerStore()
    // 初始即 dirty（demo fixture 未保存过）——复位为 idle 才能观察 touch()
    store.saveState = 'idle'
    store.setPageType('list')
    expect(store.schema.type).toBe('list')
    expect(store.schema.list).toEqual({ modelId: '', columns: [] })
    expect(store.saveState).toBe('dirty') // touch：置 dirty + 重跑校验
    expect(store.validation.valid).toBe(false) // list.modelId 空 → 红字联动
    expect(store.validation.errors.some((e) => e.path === 'list.modelId')).toBe(true)
    // 同类型 no-op：不 touch
    store.setPageType('form')
    store.saveState = 'idle'
    store.setPageType('form')
    expect(store.saveState).toBe('idle')
  })

  it('setListConfig：写入 + touch + 触发 loadModelFields（选模型拉字段缓存）', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.setPageType('list')
    store.setListConfig({ modelId: 'm_e' })
    expect(store.schema.list?.modelId).toBe('m_e')
    expect(store.validation.valid).toBe(true) // modelId 配齐红字消解
    await flushPromises()
    expect(api.getModel).toHaveBeenCalledWith('m_e')
    expect(store.modelFields.map((f) => f.key)).toEqual(['empName', 'dept'])
    // 勾列
    store.setListConfig({ columns: ['empName'] })
    expect(store.schema.list?.columns).toEqual(['empName'])
  })

  it('setDetailConfig：写入 + touch + 换模型字段缓存刷新', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.setPageType('detail')
    store.setDetailConfig({ modelId: 'm_e', fields: ['dept'] })
    expect(store.schema.detail).toEqual({ modelId: 'm_e', fields: ['dept'] })
    expect(store.validation.valid).toBe(true)
    await flushPromises()
    expect(store.modelFields).toHaveLength(2)
  })

  it('setPortalConfig：写入 + touch（Phase 3 批 4）', () => {
    const store = useDesignerStore()
    store.saveState = 'idle'
    store.setPageType('portal')
    expect(store.schema.portal).toEqual({ cards: [] })
    store.saveState = 'idle'
    store.setPortalConfig({ title: '工作台', cards: [{ title: '首页', pageId: 'home' }] })
    expect(store.schema.portal).toEqual({ cards: [{ title: '首页', pageId: 'home' }], title: '工作台' })
    expect(store.saveState).toBe('dirty')
  })
})

/* ---------------- PropsPanel 交互 ---------------- */

describe('PropsPanel：页面类型 + 标准页配置区块', () => {
  it('类型下拉切 list：提交模型区块隐藏、list-config 区块出现（骨架 + validate 红字联动）', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    const w = mount(PropsPanel)
    await flushPromises()
    expect(w.find('[data-testid="submit-model"]').exists()).toBe(true)
    expect(w.find('[data-testid="list-config"]').exists()).toBe(false)

    await w.get('[data-testid="page-type"]').setValue('list')
    expect(store.schema.type).toBe('list')
    await flushPromises()
    expect(w.find('[data-testid="submit-model"]').exists()).toBe(false)
    expect(w.find('[data-testid="list-config"]').exists()).toBe(true)
    w.unmount()
  })

  it('list 区块：选模型 → 字段多选出现 → 勾选写 columns → 详情页 id 输入写配置', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    store.setPageType('list')
    const w = mount(PropsPanel)
    await flushPromises()

    await w.get('[data-testid="list-model"]').setValue('m_e')
    await flushPromises()
    expect(store.schema.list?.modelId).toBe('m_e')

    const boxes = w.findAll('[data-testid="list-config"] .cols__item input')
    expect(boxes).toHaveLength(2) // empName / dept
    await boxes[0]!.setValue(true)
    expect(store.schema.list?.columns).toEqual(['empName'])
    await boxes[1]!.setValue(true)
    expect(store.schema.list?.columns).toEqual(['empName', 'dept'])
    await boxes[0]!.setValue(false)
    expect(store.schema.list?.columns).toEqual(['dept'])

    await w.get('[data-testid="list-detail-page"]').setValue('p_detail')
    expect(store.schema.list?.detailPageId).toBe('p_detail')

    await w.get('[data-testid="list-page-size"]').setValue('20')
    expect(store.schema.list?.pagination).toEqual({ mode: 'page', size: 20 })

    // Phase 4：列表写操作默认关闭；勾选写 true，取消回 undefined
    expect((w.get('[data-testid="list-editable"]').element as HTMLInputElement).checked).toBe(false)
    await w.get('[data-testid="list-editable"]').setValue(true)
    expect(store.schema.list?.editable).toBe(true)
    await w.get('[data-testid="list-deletable"]').setValue(true)
    expect(store.schema.list?.deletable).toBe(true)
    await w.get('[data-testid="list-deletable"]').setValue(false)
    expect(store.schema.list?.deletable).toBeUndefined()
    w.unmount()
  })

  it('detail 区块：选模型 → fields 勾选 + 返回页输入 + 编辑/删除开关；与 list 区块互斥', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    store.setPageType('detail')
    const w = mount(PropsPanel)
    await flushPromises()
    expect(w.find('[data-testid="detail-config"]').exists()).toBe(true)
    expect(w.find('[data-testid="list-config"]').exists()).toBe(false)

    await w.get('[data-testid="detail-model"]').setValue('m_e')
    await flushPromises()
    const boxes = w.findAll('[data-testid="detail-config"] .cols__item input')
    expect(boxes).toHaveLength(2)
    await boxes[1]!.setValue(true)
    expect(store.schema.detail?.fields).toEqual(['dept'])

    await w.get('[data-testid="detail-back-page"]').setValue('p_list')
    expect(store.schema.detail?.backPageId).toBe('p_list')

    // Phase 4：写操作默认关闭；勾选写 true，取消勾选回 undefined（协议「缺省 = 只读」）
    expect((w.get('[data-testid="detail-editable"]').element as HTMLInputElement).checked).toBe(false)
    await w.get('[data-testid="detail-editable"]').setValue(true)
    expect(store.schema.detail?.editable).toBe(true)
    await w.get('[data-testid="detail-deletable"]').setValue(true)
    expect(store.schema.detail?.deletable).toBe(true)
    await w.get('[data-testid="detail-deletable"]').setValue(false)
    expect(store.schema.detail?.deletable).toBeUndefined()
    w.unmount()
  })

  it('换模型重置列：m_e 勾 2 列 → 切走再切回（换模型语义）→ columns 清空、勾选态复位', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.setPageType('list')
    const w = mount(PropsPanel)
    await flushPromises()
    await w.get('[data-testid="list-model"]').setValue('m_e')
    await flushPromises()
    const boxes = () => w.findAll('[data-testid="list-config"] .cols__item input')
    await boxes()[0]!.setValue(true)
    await boxes()[1]!.setValue(true)
    expect(store.schema.list?.columns).toEqual(['empName', 'dept'])
    // 换模型（getModel 已按 id 分发：m_o → otherModel）
    await w.get('[data-testid="list-model"]').setValue('m_o')
    await flushPromises()
    expect(store.schema.list?.modelId).toBe('m_o')
    expect(store.schema.list?.columns).toEqual([]) // 换模型重置
    expect(boxes()).toHaveLength(1) // 新模型字段
    w.unmount()
  })
})

/* ---------------- PropsPanel：门户配置（Phase 3 批 4） ---------------- */

describe('PropsPanel：门户配置区块', () => {
  it('切 portal：提交模型区块隐藏、portal-config 出现；标题/列数写入', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    const w = mount(PropsPanel)
    await flushPromises()
    expect(w.find('[data-testid="submit-model"]').exists()).toBe(true)

    await w.get('[data-testid="page-type"]').setValue('portal')
    await flushPromises()
    expect(store.schema.type).toBe('portal')
    expect(w.find('[data-testid="submit-model"]').exists()).toBe(false)
    expect(w.find('[data-testid="portal-config"]').exists()).toBe(true)

    await w.get('[data-testid="portal-title"]').setValue('工作台')
    expect(store.schema.portal?.title).toBe('工作台')
    await w.get('[data-testid="portal-columns"]').setValue('3')
    expect(store.schema.portal?.columns).toBe(3)
    w.unmount()
  })

  it('卡片增删改：添加 → 编辑标题/跳转页 → 删除', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    store.setPageType('portal')
    store.setPortalConfig({ cards: [] })
    const w = mount(PropsPanel)
    await flushPromises()
    expect(w.findAll('.lc-props-panel__card')).toHaveLength(0)

    await w.get('[data-testid="portal-card-add"]').trigger('click')
    expect(store.schema.portal?.cards).toEqual([{ title: '新卡片' }])
    await w.get('[data-testid="portal-card-title-0"]').setValue('请假申请')
    expect(store.schema.portal?.cards?.[0]?.title).toBe('请假申请')
    await w.get('[data-testid="portal-card-page-0"]').setValue('leave_form')
    expect(store.schema.portal?.cards?.[0]?.pageId).toBe('leave_form')

    await w.get('[data-testid="portal-card-del-0"]').trigger('click')
    expect(store.schema.portal?.cards).toEqual([])
    w.unmount()
  })

  it('卡片行：默认折叠、展开编辑 badge/url、上移/复制/删除', async () => {
    const store = useDesignerStore()
    store.setApi(mockApi())
    store.setPageType('portal')
    store.setPortalConfig({ cards: [{ title: '甲' }, { title: '乙' }] })
    const w = mount(PropsPanel)
    await flushPromises()

    // 初始折叠：卡片行没有 --open；展开后加上
    const card = (i: number) => w.get(`[data-testid="portal-card-${i}"]`)
    expect(card(1).classes()).not.toContain('lc-props-panel__card--open')
    await w.get('[data-testid="portal-card-toggle-1"]').trigger('click')
    expect(card(1).classes()).toContain('lc-props-panel__card--open')

    await w.get('[data-testid="portal-card-badge-1"]').setValue('新')
    await w.get('[data-testid="portal-card-url-1"]').setValue('https://example.com')
    expect(store.schema.portal?.cards[1]).toMatchObject({
      title: '乙',
      badge: '新',
      url: 'https://example.com',
    })

    // 上移：乙到第一位
    await w.get('[data-testid="portal-card-up-1"]').trigger('click')
    expect(store.schema.portal?.cards.map((c) => c.title)).toEqual(['乙', '甲'])

    // 复制：原地插入副本
    await w.get('[data-testid="portal-card-copy-0"]').trigger('click')
    expect(store.schema.portal?.cards.map((c) => c.title)).toEqual(['乙', '乙 副本', '甲'])

    // 删除副本
    await w.get('[data-testid="portal-card-del-1"]').trigger('click')
    expect(store.schema.portal?.cards.map((c) => c.title)).toEqual(['乙', '甲'])
    w.unmount()
  })
})
