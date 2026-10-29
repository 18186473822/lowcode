/**
 * store 单测 —— 设计器批 2（D-A3/D-A5：视图只发意图，schema 修改一律经 schema-ops）
 *
 * store 是「执行者」层：本文件验证 hit → resolve → schema-ops 的接线、选中态联动与
 * 非法输入的兜底（root 不可删 / 未知物料 / 拖到自己）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import type { PageSchema, ModelSchema } from '@lc/schema'
import { useDesignerStore, type ModelSummary, type VersionList, type RbacConfig, type RoleRecord } from '../src/store/store'
import { findNode, setSubmitModel as setSubmitModelOp } from '../src/core/schema-ops'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('store 初始化', () => {
  it('demo schema + 未选中；root children = 30（批 3：30 物料全量演示）', () => {
    const store = useDesignerStore()
    expect(store.schema.root.id).toBe('root')
    expect(store.schema.root.children).toHaveLength(32)
    expect(store.selectedId).toBe('')
    expect(store.selectedNode).toBeNull()
    expect(store.isRootSelected).toBe(false)
  })
})

describe('首屏工作区（2026-10-28 结构调整）', () => {
  it('默认落在「移动门户」清单，且画布未载入（不再自动打开 demo 页）', () => {
    const store = useDesignerStore()
    expect(store.view).toBe('portal')
    expect(store.pageLoaded).toBe(false)
    // demo 只是「默认待打开 id」，不代表已经载入 —— 否则保存按钮会写用户看不见的页
    expect(store.pageId).toBe('demo')
  })

  it('openPage 成功 / newPage 之后 pageLoaded 置真（画布才允许展示与保存）', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    const loaded = JSON.parse(JSON.stringify(store.schema)) as PageSchema
    api.getSchema.mockResolvedValue({ schema: loaded, version: 'draft' })
    store.setApi(api)

    expect(await store.openPage('p_home')).toBe(true)
    expect(store.pageLoaded).toBe(true)

    setActivePinia(createPinia())
    const fresh = useDesignerStore()
    expect(fresh.pageLoaded).toBe(false)
    fresh.newPage('p_new')
    expect(fresh.pageLoaded).toBe(true)
  })
})

describe('insertMaterial（拖入）', () => {
  it('无 hit → root 末尾插入 + 选中新节点 + defaultProps 生效', () => {
    const store = useDesignerStore()
    expect(store.insertMaterial('Input')).toBe(true)
    expect(store.schema.root.children).toHaveLength(33) // demo 32 + 插入 1
    const created = store.schema.root.children!.at(-1)!
    expect(created.componentName).toBe('Input')
    expect(created.props!.label).toBe('输入项') // defaultProps 来自 META
    expect(store.selectedId).toBe(created.id)
    expect(store.selectedMeta?.name).toBe('Input')
  })

  it('带 hit（into 分组容器 n-fg）→ 插到容器末尾', () => {
    const store = useDesignerStore()
    expect(store.insertMaterial('Text', { nodeId: 'n-fg', position: 'into' })).toBe(true)
    const fg = findNode(store.schema, 'n-fg')!
    expect(fg.children).toHaveLength(2) // 组内原有 1 + 新插 1
    expect(fg.children!.at(-1)!.componentName).toBe('Text')
    expect(store.schema.root.children).toHaveLength(32) // root 数不变
    expect(store.selectedId).toBe(fg.children!.at(-1)!.id)
  })

  it('带 hit（after 某叶子）→ 插到其父的 index+1', () => {
    const store = useDesignerStore()
    const before = store.schema.root.children!.map((c) => c.id)
    store.insertMaterial('Divider', { nodeId: 'n-input', position: 'after' })
    const after = store.schema.root.children!.map((c) => c.id)
    expect(after).toHaveLength(before.length + 1)
    // n-input 索引 1 → 新节点落在索引 2，原 n-ta 后移到 3
    expect(after[2]!.startsWith('n_')).toBe(true)
    expect(after[3]).toBe('n-ta')
  })

  it('未知物料 / 非法 hit（nodeId 不存在）→ false，schema 不变', () => {
    const store = useDesignerStore()
    const snapshot = JSON.stringify(store.schema)
    expect(store.insertMaterial('NoSuch')).toBe(false)
    expect(store.insertMaterial('Input', { nodeId: 'nope', position: 'into' })).toBe(false)
    expect(JSON.stringify(store.schema)).toBe(snapshot)
    expect(store.selectedId).toBe('')
  })
})

describe('moveByDrop（换位）', () => {
  it('同父换位（n-btn before n-text）', () => {
    const store = useDesignerStore()
    const ids = () => store.schema.root.children!.map((c) => c.id)
    expect(ids().slice(0, 3)).toEqual(['n-text', 'n-input', 'n-ta'])
    store.moveByDrop('n-btn', { nodeId: 'n-text', position: 'before' })
    expect(ids()[0]).toBe('n-btn')
    expect(ids()[1]).toBe('n-text') // n-btn 已移出原位（原索引 28）
    expect(store.schema.root.children).toHaveLength(32) // 数量不变
  })

  it('拖到自己 → no-op', () => {
    const store = useDesignerStore()
    const snapshot = JSON.stringify(store.schema)
    store.moveByDrop('n-input', { nodeId: 'n-input', position: 'after' })
    expect(JSON.stringify(store.schema)).toBe(snapshot)
  })

  it('拖进自己的子孙 → no-op（moveNode 内部拦）', () => {
    const store = useDesignerStore()
    const snapshot = JSON.stringify(store.schema)
    store.moveByDrop('n-fg', { nodeId: 'n-in-fg', position: 'into' })
    expect(JSON.stringify(store.schema)).toBe(snapshot)
  })

  it('跨容器（n-text into n-fg）', () => {
    const store = useDesignerStore()
    store.moveByDrop('n-text', { nodeId: 'n-fg', position: 'into' })
    expect(store.schema.root.children!.map((c) => c.id)).not.toContain('n-text')
    expect(findNode(store.schema, 'n-fg')!.children!.map((c) => c.id)).toContain('n-text')
  })
})

describe('removeById / moveById（工具栏与 Delete 键路径）', () => {
  it('删除普通节点：成功 + 清选中；root 拒绝', () => {
    const store = useDesignerStore()
    store.select('n-input')
    expect(store.removeById('n-input')).toBe(true)
    expect(findNode(store.schema, 'n-input')).toBeNull()
    expect(store.selectedId).toBe('')
    expect(store.removeById('root')).toBe(false)
    expect(store.schema.root.id).toBe('root')
    expect(store.removeById('nope')).toBe(false)
  })

  it('容器内最后一个子节点删除后容器保留', () => {
    const store = useDesignerStore()
    store.removeById('n-in-fg')
    expect(findNode(store.schema, 'n-fg')).not.toBeNull()
    expect(findNode(store.schema, 'n-fg')!.children).toHaveLength(0)
  })

  it('moveById 上移/下移；越界返回 false', () => {
    const store = useDesignerStore()
    const ids = () => store.schema.root.children!.map((c) => c.id)
    expect(store.moveById('n-input', -1)).toBe(true)
    expect(ids().slice(0, 2)).toEqual(['n-input', 'n-text'])
    expect(store.moveById('n-input', -1)).toBe(false) // 已是第一个
    expect(store.moveById('n-fg', 1)).toBe(false) // 最后一个 → 越界
    expect(store.moveById('n-btn', 1)).toBe(true) // 倒数第二 → 下移可行
    expect(ids().at(-1)).toBe('n-btn') // n-btn 成为末位（n-fg 让位）
  })
})

describe('setProp / replaceSchema / 选中元信息', () => {
  it('setProp 写 props（无前缀 key）', () => {
    const store = useDesignerStore()
    store.setProp('n-input', 'label', '姓名')
    expect(findNode(store.schema, 'n-input')!.props!.label).toBe('姓名')
    store.setProp('n-input', 'style.color', 'red')
    expect(findNode(store.schema, 'n-input')!.style).toEqual({ color: 'red' })
  })

  it('setProp required 联动（D-A12）：星号与 props.rules 校验同开同关', () => {
    const store = useDesignerStore()
    const node = () => findNode(store.schema, 'n-input')!

    // 开：props.required（星号展示）与 props.rules（校验引擎唯一依据）同时写入
    store.setProp('n-input', 'required', true)
    expect(node().props!.required).toBe(true)
    expect(node().props!.rules).toEqual([{ type: 'required' }])

    // 关：两侧同时清（rules 只剩空数组，collectRules 不收集）
    store.setProp('n-input', 'required', false)
    expect(node().props!.required).toBe(false)
    expect(node().props!.rules).toEqual([])

    // 其他属性的 setProp 不触碰 rules（联动只认 key === 'required'）
    store.setProp('n-input', 'label', '姓名')
    expect(node().props!.rules).toEqual([])
    expect(node().props!.label).toBe('姓名')

    // 修改进 dirty（两次 touch：联动写也计入）
    expect(store.saveState).toBe('dirty')
  })

  it('selectedMeta 随选中切换：root = Page（settings 空）、未知组件 = null', () => {
    const store = useDesignerStore()
    store.select('root')
    expect(store.isRootSelected).toBe(true)
    expect(store.selectedMeta?.name).toBe('Page')
    expect(store.selectedMeta?.settings).toEqual([])

    store.select('n-fg')
    expect(store.selectedMeta?.name).toBe('FormGroup')
    expect(store.selectedMeta?.settings.length).toBeGreaterThan(0)

    store.select('nope')
    expect(store.selectedNode).toBeNull()
    expect(store.selectedMeta).toBeNull()
  })

  it('replaceSchema 替换整树并清选中', () => {
    const store = useDesignerStore()
    store.select('n-input')
    const next = JSON.parse(JSON.stringify(store.schema)) as typeof store.schema
    next.id = 'p_replaced'
    store.replaceSchema(next)
    expect(store.schema.id).toBe('p_replaced')
    expect(store.selectedId).toBe('')
  })
})

/** DesignerApi mock 工厂（批 3 起共用；批 4 补 listModels/getModel，默认空表；Phase 2 批 1 补 putModel；批 5 补 listVersions/rollback） */
function mockApi() {
  return {
    getSchema: vi.fn<
      (id: string, version?: string) => Promise<{ schema: PageSchema; version: string | number; revision?: number }>
    >(),
    saveSchema: vi.fn<
      (id: string, s: PageSchema, revision?: number) => Promise<{ revision?: number } | void>
    >(),
    publish: vi.fn<(id: string, revision?: number) => Promise<{ version?: number; revision?: number }>>(),
    // 批 4 字段绑定：默认空表（新测试用 mockResolvedValue 覆盖成有数据的）
    listModels: vi.fn<() => Promise<ModelSummary[]>>().mockResolvedValue([]),
    getModel: vi.fn<(id: string) => Promise<ModelSchema>>(),
    putModel: vi.fn<(m: ModelSchema) => Promise<void>>().mockResolvedValue(undefined),
    // 批 5 版本历史：默认空列表 + 回滚成功
    listVersions: vi.fn<(id: string) => Promise<VersionList>>().mockResolvedValue({
      pageId: 'demo',
      status: 'published',
      currentVersion: 0,
      versions: [],
    }),
    rollback: vi
      .fn<(id: string, v: number, revision?: number) => Promise<{ rolledBackTo: number }>>()
      .mockResolvedValue({ rolledBackTo: 1 }),
    // 批 6 RBAC：默认空配置（本文件不测 RBAC，只需满足 DesignerApi 形状）
    listRbac: vi.fn<() => Promise<RbacConfig>>().mockResolvedValue({ roles: [], pages: {} }),
    putRole: vi.fn<(r: RoleRecord) => Promise<void>>().mockResolvedValue(undefined),
    putPageAuth: vi.fn<(id: string, roles: string[]) => Promise<void>>().mockResolvedValue(undefined),
    listPages: vi.fn<() => Promise<Array<{ id: string; name: string }>>>().mockResolvedValue([]),
  }
}

describe('批 3：校验 touch / 打开 / 保存 / 发布', () => {
  /** 构造必失败校验的 schema：root.children 两个同 id → E_DUPLICATE_ID */
  function dupSchema(): PageSchema {
    const s = JSON.parse(JSON.stringify(useDesignerStore().schema)) as PageSchema
    s.root.children![1]!.id = s.root.children![0]!.id
    return s
  }

  it('初始化：pageId=demo、saveState=dirty、validation 已跑（demo 过校验）', () => {
    const store = useDesignerStore()
    expect(store.pageId).toBe('demo')
    expect(store.saveState).toBe('dirty')
    expect(store.validation.valid).toBe(true)
    expect(
      store.validation.errors,
      `errors: ${JSON.stringify(store.validation.errors)}`,
    ).toHaveLength(0)
  })

  it('schema 修改 → dirty + validation 重跑；错误 schema 立即报错', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.save()
    expect(store.saveState).toBe('idle')

    store.setProp('n-input', 'label', '改')
    expect(store.saveState).toBe('dirty')
    expect(store.validation.valid).toBe(true)

    store.replaceSchema(dupSchema())
    expect(store.saveState).toBe('dirty')
    expect(store.validation.valid).toBe(false)
    expect(store.validation.errors.some((e) => e.code === 'E_DUPLICATE_ID')).toBe(true)
  })

  it('save：校验通过 → PUT（pageId + 当前 schema）+ idle', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)

    expect(await store.save()).toBe(true)
    expect(api.saveSchema).toHaveBeenCalledTimes(1)
    expect(api.saveSchema.mock.calls[0]![0]).toBe('demo')
    expect(api.saveSchema.mock.calls[0]![2]).toBe(0)
    expect(store.saveState).toBe('idle')
    expect(store.statusText).toContain('已保存')
  })

  it('save：校验不过 → 不发 PUT + error + 错误数入 statusText', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.replaceSchema(dupSchema())

    expect(await store.save()).toBe(false)
    expect(api.saveSchema).not.toHaveBeenCalled()
    expect(store.saveState).toBe('error')
    expect(store.statusText).toContain('未保存')
    expect(store.statusText).toContain(String(store.validation.errors.length))
  })

  it('save：网络失败 → error + statusText 带服务端消息', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.saveSchema.mockRejectedValue(new Error('Schema 校验未通过'))
    store.setApi(api)

    expect(await store.save()).toBe(false)
    expect(store.saveState).toBe('error')
    expect(store.statusText).toContain('Schema 校验未通过')
  })

  it('未注入 api → save/open 均拒绝并提示', async () => {
    const store = useDesignerStore()
    expect(await store.save()).toBe(false)
    expect(await store.openPage()).toBe(false)
    expect(store.statusText).toContain('未配置服务端 API')
  })

  it('openPage 成功 → 换 pageId + 替换 schema + 清选中 + idle', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    const loaded = JSON.parse(JSON.stringify(store.schema)) as PageSchema
    loaded.id = 'p_loaded'
    api.getSchema.mockResolvedValue({ schema: loaded, version: 'draft' })
    store.setApi(api)
    store.select('n-input')

    expect(await store.openPage('page-x')).toBe(true)
    expect(api.getSchema).toHaveBeenCalledWith('page-x')
    expect(store.pageId).toBe('page-x')
    expect(store.schema.id).toBe('p_loaded')
    expect(store.selectedId).toBe('')
    expect(store.saveState).toBe('idle')
    expect(store.statusText).toContain('已打开')
  })

  it('openPage 回填 revision；save/publish 透传并回写新版本', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    const loaded = JSON.parse(JSON.stringify(store.schema)) as PageSchema
    loaded.id = 'p_rev'
    api.getSchema.mockResolvedValue({ schema: loaded, version: 'draft', revision: 7 })
    api.saveSchema.mockResolvedValue({ revision: 8 })
    api.publish.mockResolvedValue({ version: 2, revision: 9 })
    store.setApi(api)

    expect(await store.openPage('page-rev')).toBe(true)
    expect(store.pageRevision).toBe(7)

    expect(await store.save()).toBe(true)
    expect(api.saveSchema).toHaveBeenCalledWith('page-rev', expect.anything(), 7)
    expect(store.pageRevision).toBe(8)

    expect(await store.publish()).toBe(true)
    expect(api.publish).toHaveBeenCalledWith('page-rev', 8)
    expect(store.pageRevision).toBe(9)
  })

  it('openPage 失败 → error + 本地内容保留', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    const before = store.schema
    api.getSchema.mockRejectedValue(new Error('页面 demo 不存在'))
    store.setApi(api)

    expect(await store.openPage()).toBe(false)
    expect(store.schema).toBe(before)
    expect(store.saveState).toBe('error')
    expect(store.statusText).toContain('打开失败')
  })

  it('publish：dirty 先保存（顺序 save→publish）再发布', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.publish.mockResolvedValue({ version: 3 })
    store.setApi(api)
    store.setProp('n-input', 'label', 'X') // dirty

    expect(await store.publish()).toBe(true)
    expect(api.saveSchema).toHaveBeenCalledTimes(1)
    expect(api.publish).toHaveBeenCalledTimes(1)
    expect(api.saveSchema.mock.invocationCallOrder[0]!).toBeLessThan(
      api.publish.mock.invocationCallOrder[0]!,
    )
    expect(store.statusText).toContain('已发布')
    expect(store.statusText).toContain('v3')
  })

  it('publish：idle 时直接发布；发布失败不动草稿状态', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    await store.save() // → idle

    api.publish.mockResolvedValueOnce({ version: 1 })
    expect(await store.publish()).toBe(true)
    expect(api.saveSchema).toHaveBeenCalledTimes(1) // 仍只有前面那次

    api.publish.mockRejectedValueOnce(new Error('没有可发布的草稿'))
    expect(await store.publish()).toBe(false)
    expect(store.saveState).toBe('idle') // 发布失败不改草稿状态
    expect(store.statusText).toContain('发布失败')
  })

  it('save 失败后再 publish → 被校验门禁阻断（不发 publish）', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    store.setApi(api)
    store.replaceSchema(dupSchema())

    expect(await store.publish()).toBe(false)
    expect(api.saveSchema).not.toHaveBeenCalled()
    expect(api.publish).not.toHaveBeenCalled()
  })

  it('newPage：换 pageId + demo 结构 + 清选中 + dirty；空 id 拒绝', () => {
    const store = useDesignerStore()
    store.select('n-input')

    expect(store.newPage('  my-page ')).toBe(true)
    expect(store.pageId).toBe('my-page')
    expect(store.selectedId).toBe('')
    expect(store.saveState).toBe('dirty')
    expect(store.schema.root.children).toHaveLength(32) // demo 初始结构（批 3：30 物料全量；批 2：+2 → 32）

    expect(store.newPage('   ')).toBe(false)
    expect(store.pageId).toBe('my-page')
  })
})

/* ------------------------------------------------------------------ */
/* 批 4：字段绑定（决策 D-A11）—— 模型列表/字段加载 + 提交模型 + 字段绑定 */
/* ------------------------------------------------------------------ */

describe('字段绑定（批 4）', () => {
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

  it('loadModels：成功填充 + 清错误；重复调用走缓存，force 才重拉', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.listModels.mockResolvedValue(summary)
    store.setApi(api)

    expect(await store.loadModels()).toBe(true)
    expect(store.models).toEqual(summary)
    expect(store.modelError).toBe('')

    await store.loadModels() // 缓存：不重复请求
    expect(api.listModels).toHaveBeenCalledTimes(1)

    expect(await store.loadModels(true)).toBe(true) // force
    expect(api.listModels).toHaveBeenCalledTimes(2)
  })

  it('loadModels：未注入 API → false + 错误文案，不抛异常', async () => {
    const store = useDesignerStore()
    expect(await store.loadModels()).toBe(false)
    expect(store.modelError).toContain('未配置服务端 API')
    expect(store.models).toHaveLength(0)
  })

  it('loadModels：请求失败 → 错误带原因，models 保持为空', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.listModels.mockRejectedValue(new Error('500'))
    store.setApi(api)

    expect(await store.loadModels()).toBe(false)
    expect(store.modelError).toContain('500')
    expect(store.models).toHaveLength(0)
  })

  it('loadModelFields：按 modelId 缓存（同模型不重复请求），换模型重拉', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.getModel.mockResolvedValue(empModel)
    store.setApi(api)

    expect(await store.loadModelFields('m_emp')).toBe(true)
    expect(store.modelFields.map((f) => f.key)).toEqual(['empName', 'dept'])
    expect(store.fieldsModelId).toBe('m_emp')

    await store.loadModelFields('m_emp')
    expect(api.getModel).toHaveBeenCalledTimes(1) // 同模型缓存

    await store.loadModelFields('m_other') // 换模型 → 重新请求
    expect(api.getModel).toHaveBeenCalledTimes(2)
  })

  it('loadModelFields：空 id → 清空字段与缓存标记（不发请求）', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.getModel.mockResolvedValue(empModel)
    store.setApi(api)
    await store.loadModelFields('m_emp')

    expect(await store.loadModelFields('')).toBe(true)
    expect(store.modelFields).toHaveLength(0)
    expect(store.fieldsModelId).toBe('')
    expect(api.getModel).toHaveBeenCalledTimes(1)
  })

  it('loadModelFields：失败 → 清空字段（不残留旧模型字段）+ 错误文案', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.getModel.mockResolvedValue(empModel)
    store.setApi(api)
    await store.loadModelFields('m_emp')

    api.getModel.mockRejectedValue(new Error('404'))
    expect(await store.loadModelFields('m_gone')).toBe(false)
    expect(store.modelFields).toHaveLength(0) // 关键：不残留 m_emp 的字段
    expect(store.modelError).toContain('404')
  })

  it('setSubmitModel：写 schema（ds_submit + submit）+ dirty + 触发字段加载', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.getModel.mockResolvedValue(empModel)
    store.setApi(api)

    store.setSubmitModel('m_emp')
    expect(store.submitModelId).toBe('m_emp')
    expect(store.saveState).toBe('dirty')
    expect(store.schema.submit?.dataSourceId).toBe('ds_submit')

    await flushPromises() // setSubmitModel 内部 void 调用字段加载
    expect(store.modelFields.map((f) => f.key)).toEqual(['empName', 'dept'])
    expect(api.getModel).toHaveBeenCalledWith('m_emp')
  })

  it('setSubmitModel(null)：清除 submit 与提交源，字段随之清空', async () => {
    const store = useDesignerStore()
    const api = mockApi()
    api.getModel.mockResolvedValue(empModel)
    store.setApi(api)

    store.setSubmitModel('m_emp')
    await flushPromises()
    expect(store.modelFields).toHaveLength(2)

    store.setSubmitModel(null)
    expect(store.submitModelId).toBeNull()
    expect(store.schema.submit).toBeUndefined()
    await flushPromises()
    expect(store.modelFields).toHaveLength(0)
    expect(store.fieldsModelId).toBe('')
  })

  it('setFieldBinding：写 props.name（提交 payload 的键）；空串解绑', () => {
    const store = useDesignerStore()

    store.setFieldBinding('n-input', 'empName')
    expect(findNode(store.schema, 'n-input')!.props!.name).toBe('empName')
    expect(store.saveState).toBe('dirty')

    store.setFieldBinding('n-input', '')
    expect(findNode(store.schema, 'n-input')!.props!.name).toBeUndefined()
    // 解绑后不参与提交（renderer collectFieldNames 只收有 name 的字段）
    expect(JSON.stringify(findNode(store.schema, 'n-input')!.props)).not.toContain('name')
  })

  it('setNodeAction（D-A13）：写 actions、同事件原位替换、null 解除、他事件不误伤', () => {
    const store = useDesignerStore()
    const actions = () => findNode(store.schema, 'n-btn')!.actions ?? []

    // 绑定
    store.setNodeAction('n-btn', 'click', 'submit')
    expect(actions()).toEqual([{ event: 'click', type: 'submit' }])
    expect(store.saveState).toBe('dirty')

    // 同事件替换（一个事件一个动作，不重复追加）
    store.setNodeAction('n-btn', 'click', 'back')
    expect(actions()).toEqual([{ event: 'click', type: 'back' }])

    // 他事件共存 + 解除只清本事件
    store.setNodeAction('n-btn', 'longpress', 'scan')
    expect(actions()).toHaveLength(2)
    store.setNodeAction('n-btn', 'click', null)
    expect(actions()).toEqual([{ event: 'longpress', type: 'scan' }])

    // 节点不存在 → no-op
    store.setNodeAction('nope', 'click', 'submit')
    expect(store.schema.root.children).toBeDefined()
  })

  it('submitModelId 由 schema 推导（换页/打开已配置页面即回填）', () => {
    const store = useDesignerStore()
    expect(store.submitModelId).toBeNull()

    const next = setSubmitModelOp(store.schema, 'm_pre').schema
    store.replaceSchema(next)
    expect(store.submitModelId).toBe('m_pre')
  })
})
