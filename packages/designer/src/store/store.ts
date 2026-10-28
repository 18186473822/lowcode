/**
 * 设计器全局状态（PLANS.md §1 D-A7：Pinia 单 store；批 2 扩展 schema 操作 actions）。
 *
 * 关键约束（方案 4.3）：**所有 schema 修改必须经 core/schema-ops 纯函数** ——
 * 本 store 是唯一的「执行者」（视图组件只发意图），为 undo/redo（Phase 2）留接缝。
 * 放在 designer 包而非 designer-web：可用 setActivePinia 单测。
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type {
  PageSchema,
  NodeSchema,
  MaterialSchema,
  ValidationResult,
  FieldSchema,
  ModelSchema,
  PageType,
  ListPageConfig,
  DetailPageConfig,
  PortalPageConfig,
} from '@lc/schema'
import { validatePage } from '@lc/schema'
import { countNodes, formatPerf, type PerfSample } from '@lc/renderer'
import { META_MAP } from '@lc/materials'
import {
  insertNode,
  removeNode,
  moveNode,
  moveSibling,
  updateProp,
  updateActions,
  findNode,
  findParent,
  readSubmitModel,
  setSubmitModel as setSubmitModelOp,
  setRequiredRule as setRequiredRuleOp,
  setPageType as setPageTypeOp,
  updateListConfig,
  updateDetailConfig,
  updatePortalConfig,
  cloneSubtree,
  pasteNode,
  setNodePerm as setNodePermOp,
} from '../core/schema-ops'
import { diffSchema, type DiffEntry } from '../core/schema-diff'
import { resolveAnchorTarget, type AnchorHit } from '../core/anchor'
import {
  addField as addFieldOp,
  blankModel,
  moveField as moveFieldOp,
  modelErrors as modelErrorsOp,
  removeField as removeFieldOp,
  updateField as updateFieldOp,
} from '../core/model-ops'
import type { DragSource } from '../core/dnd'
import {
  buildModelModule,
  buildModelPage,
  buildPortalPage,
  MODEL_PAGE_TYPE_LABEL,
  MODEL_PAGE_TYPES,
  moduleBase,
  modulePageIds,
  type ModelPageType,
} from '../core/page-builder'
import { demoPage } from '../fixtures/demo-page'

export type { DragSource }

/**
 * 数据模型摘要（页面级「提交模型」下拉的数据项）。
 * **结构兼容**服务端 `GET /api/v1/models` 的响应项（服务端 ModelSummary 在 server 包内，
 * 设计器不依赖 server —— 沿用 D-A3 副作用注入：只声明自己需要的最小字段）。
 */
export interface ModelSummary {
  id: string
  name: string
  code?: string
  fieldCount?: number
}

/**
 * 设计器持久化通道（批 3，副作用注入沿用 D-A3 模式）：
 * designer-web 提供 fetch 实现（自动登录 + Bearer），单测提供 mock —— store 不直接发请求。
 */
export interface DesignerApi {
  /** 打开页面：返回草稿 schema、版本标识与页面行 revision（乐观锁） */
  getSchema(
    pageId: string,
    version?: string,
  ): Promise<{ schema: PageSchema; version: string | number; revision?: number }>
  /** 保存草稿；带 revision 时发送 If-Match，服务端版本冲突返回 409 */
  saveSchema(
    pageId: string,
    schema: PageSchema,
    revision?: number,
  ): Promise<{ revision?: number } | void>
  /** 发布当前草稿为新版本，返回版本号与页面行 revision */
  publish(pageId: string, revision?: number): Promise<{ version?: number; revision?: number }>
  /** 列出全部数据模型（批 4：页面级「提交模型」下拉） */
  listModels(): Promise<ModelSummary[]>
  /** 取完整模型定义（批 4：节点级「字段绑定」下拉需要 fields） */
  getModel(modelId: string): Promise<ModelSchema>
  /** 保存模型定义（Phase 2 批 1：upsert，服务端 validateModel 再校验一次） */
  putModel(model: ModelSchema): Promise<void>
  /** 版本历史列表（Phase 2 批 5 / D-P2-8：轻量元数据倒序，不含 schema 全文） */
  listVersions(pageId: string): Promise<VersionList>
  /** 回滚：把历史版本复制为当前草稿（服务端已有接口，批 5 接 UI） */
  rollback(pageId: string, version: number, revision?: number): Promise<{ rolledBackTo: number }>
  /** RBAC 全量配置（Phase 2 批 6 / D-P2-10：角色 + 页面可见性白名单） */
  listRbac(): Promise<RbacConfig>
  /** upsert 角色（批 6：perms 逐项格式由服务端校验） */
  putRole(role: RoleRecord): Promise<void>
  /** upsert 页面授权（批 6：roles 空数组 = 恢复全员可见） */
  putPageAuth(pageId: string, roles: string[]): Promise<void>
  /**
   * 全页面摘要（批 6：页面授权矩阵行源）。
   *
   * 2026-10-20 起改走 `GET /pages`：除 `id/name` 外附带 `type/status/currentVersion/updatedAt`
   * 供顶栏换页下拉显示。这些字段在类型上是可选的 —— 只保证 `id/name` 的宿主实现仍然合法。
   */
  listPages(): Promise<PageListItem[]>
  /**
   * 删除页面及其全部历史版本（**可选能力**，沿 renderer `LcHost` 的可选宿主能力约定）。
   * 宿主未实现时 store 给出降级提示、不抛错 —— 避免为一个管理动作强制所有 API 实现跟进。
   */
  deletePage?(pageId: string): Promise<{ removedVersions: number }>
}

/** 页面列表项（2026-10-20；除 id/name 外为可选富字段） */
export interface PageListItem {
  id: string
  name: string
  type?: string
  status?: 'draft' | 'published'
  /** 最近一次发布版本号；0 = 从未发布 */
  currentVersion?: number
  updatedAt?: string
  /** 页面绑定的数据模型（表单取提交模型，列表/详情取各自配置） */
  modelId?: string
}

/**
 * 门户清单项（2026-10-28）：页面摘要 + 从 schema 读出的运营字段。
 *
 * 排序 / 备注存在 `schema.portal` 里（不新增表），所以清单加载时按页面逐份取 schema；
 * 门户页通常只有个位数，这点请求量换来「不改服务端协议」。
 */
export interface PortalListItem extends PageListItem {
  /** `portal.title`（可能与 name 不同） */
  title?: string
  /** 清单排序，小的在前；未设置 = 排在已设置的后面 */
  order?: number
  /** 运营备注 */
  remark?: string
}

/** 版本元数据（服务端 `GET :id/versions` 投影；designer 侧独立类型，沿 ModelSummary 先例） */
export interface VersionSummary {
  version: number
  createdBy: string
  createdAt: string
  note?: string
}

/** 版本历史列表响应（批 5） */
export interface VersionList {
  pageId: string
  status: 'draft' | 'published'
  currentVersion: number
  /** 倒序（vN 最新在前） */
  versions: VersionSummary[]
}

/** 一条角色记录（Phase 2 批 6 / D-P2-10；designer 侧独立类型，沿 ModelSummary 先例） */
export interface RoleRecord {
  key: string
  name: string
  /** 权限点集合；`'*'` 通配全部 */
  perms: string[]
}

/** RBAC 全量配置（批 6：`GET /rbac/roles` 响应；pages 仅含受限页面，缺省键 = 全员可见） */
export interface RbacConfig {
  roles: RoleRecord[]
  pages: Record<string, string[]>
}

/** 保存状态机（顶栏徽标渲染源）：idle=与服务端一致 · dirty=有未保存修改 */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'loading' | 'error'

export const useDesignerStore = defineStore('lc-designer', () => {
  /** 当前编辑的页面 Schema（批 1：固定 demo；批 3 起接服务端加载/保存） */
  const schema = ref<PageSchema>(demoPage())

  /* ---------------- 批 3：持久化状态 ---------------- */

  /** 当前编辑的页面 id（打开/保存/发布的路由键；服务端 upsert 可用任意新 id 创建） */
  const pageId = ref('demo')
  /**
   * 当前页面行 revision（乐观锁）：openPage 从响应回填，save/publish/rollback 作为 If-Match 发送。
   * 新建页面从 0 开始；服务端首次建档接受 0。
   */
  const pageRevision = ref(0)
  /** 保存状态机（顶栏徽标）：demo 是本地 fixture、尚未保存 → 初始 dirty */
  const saveState = ref<SaveState>('dirty')
  /** 最近一次操作结果文本（顶栏徽标旁 / 底栏状态） */
  const statusText = ref('')
  /**
   * 批 5 Profiler（D-P3-14）：最近一次「Schema 加载 + 画布渲染」采样。
   * `schemaMs` 由 openPage 计时，`renderMs` 由 LcCanvas 渲染完成后回传（markRender 合并）。
   */
  const perf = ref<PerfSample | null>(null)
  const perfText = computed(() => (perf.value ? formatPerf(perf.value) : ''))
  /** 前端校验结果（validatePage 同步纯函数，schema 任何修改后由 touch 刷新） */
  const validation = ref<ValidationResult>(validatePage(demoPage()))
  /** 持久化通道（非响应：仅供 actions 调用，不参与渲染） */
  let api: DesignerApi | null = null

  /* ---------------- 2026-10-20：页面列表 / 删除（换页下拉） ---------------- */

  /** 服务端页面摘要（顶栏「换页」下拉的数据源；空 = 尚未加载） */
  const pages = ref<PageListItem[]>([])
  /** 是否已成功拉过一次（`loadPages(false)` 的重入短路依据） */
  const pagesLoaded = ref(false)
  const pagesLoading = ref(false)
  /** 加载失败原因（'' = 无错；面板内联提示，不弹全局错误） */
  const pagesError = ref('')

  /** 画布选中的节点 id（'' = 未选中） */
  const selectedId = ref('')

  const selectedNode = computed<NodeSchema | null>(
    () => (selectedId.value ? findNode(schema.value, selectedId.value) : null),
  )
  /** 选中节点的物料元信息（root/未知组件时 null） */
  const selectedMeta = computed<MaterialSchema | null>(
    () => (selectedNode.value ? (META_MAP[selectedNode.value.componentName] ?? null) : null),
  )
  const isRootSelected = computed(() => selectedId.value === schema.value.root.id)

  /* ---------------- 批 4：撤销/重做 + 剪贴板（PLANS.md §2，D-P2-7） ---------------- */

  /** 撤销栈（变更前快照引用 —— schema-ops 全线 clone-then-replace，旧引用永不被改） */
  const undoStack = ref<PageSchema[]>([])
  /** 重做栈 */
  const redoStack = ref<PageSchema[]>([])
  /** 吞掉紧随其后的下一次 schema 赋值入栈（换页/重置/undo 自身 —— 非用户编辑） */
  let suspendHistory = false
  /** 内存剪贴板：**换页不清**（DoD「剪贴板跨页粘贴」的前提） */
  const clipboard = ref<NodeSchema | null>(null)

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  /**
   * 单一入栈接缝（防漏 13 个变更入口）：schema 引用替换即视为一次编辑 ——
   * `past.push(prev)` + 清空 future（新分支产生后旧重作作废）。
   * Vue watch 默认 pre flush：同一同步 action 内的连写（setProp 的 required 联动两连赋值）
   * 合并为一次回调 → 只入栈一个快照。栈上限 50（超出丢最旧）。
   */
  watch(schema, (_next, prev) => {
    if (suspendHistory) {
      suspendHistory = false
      return
    }
    undoStack.value.push(prev)
    if (undoStack.value.length > 50) undoStack.value.splice(0, undoStack.value.length - 50)
    redoStack.value = []
  })

  /** 撤销：当前态进 future → 恢复 past 顶 → 失效选中清理 + 重校验。空栈 no-op。 */
  function undo(): boolean {
    if (undoStack.value.length === 0) return false
    const restored = undoStack.value.pop()!
    redoStack.value.push(schema.value)
    suspendHistory = true // 恢复动作本身不是编辑
    schema.value = restored
    if (selectedId.value && !findNode(schema.value, selectedId.value)) selectedId.value = ''
    touch()
    statusText.value = '已撤销'
    return true
  }

  /** 重做：与 undo 严格对称 */
  function redo(): boolean {
    if (redoStack.value.length === 0) return false
    const restored = redoStack.value.pop()!
    undoStack.value.push(schema.value)
    suspendHistory = true
    schema.value = restored
    if (selectedId.value && !findNode(schema.value, selectedId.value)) selectedId.value = ''
    touch()
    statusText.value = '已重做'
    return true
  }

  /** 复制选中子树到剪贴板（root 不可拷）；快照深拷贝，后续编辑不影响剪贴板 */
  function copyById(nodeId: string): boolean {
    if (!nodeId || nodeId === schema.value.root.id) return false
    const node = findNode(schema.value, nodeId)
    if (!node) return false
    clipboard.value = cloneSubtree(node)
    statusText.value = `已复制「${META_MAP[node.componentName]?.title ?? node.componentName}」`
    return true
  }

  /** 剪切 = 复制 + 删除（root 已被 copyById 排除；粘贴位置仍按当前选中规则） */
  function cutById(nodeId: string): boolean {
    if (!copyById(nodeId)) return false
    removeById(nodeId)
    return true
  }

  /** 粘贴：新 id（remapIds）+ 三定位规则（容器内/同级后/root 末尾）→ 选中新根 */
  function paste(): boolean {
    if (!clipboard.value) return false
    const r = pasteNode(schema.value, clipboard.value, selectedId.value || undefined)
    if (!r.id) return false
    schema.value = r.schema
    selectedId.value = r.id
    touch()
    statusText.value = '已粘贴'
    return true
  }

  /* ---------------- 批 5：版本历史 / 回滚 / 对比（PLANS.md §2，D-P2-8/9） ---------------- */

  /** 版本弹层开关（顶栏「历史」按钮驱动） */
  const historyOpen = ref(false)
  /** 版本列表（倒序；打开弹层/回滚后刷新） */
  const versions = ref<VersionSummary[]>([])
  /** 当前发布版号（列表响应带回；0 = 从未发布） */
  const currentVersion = ref(0)
  const versionsLoading = ref(false)
  const versionsError = ref('')
  /** 对比结果条目（before = vN 历史版，after = 当前画布；null diffVersion = 未对比） */
  const diffEntries = ref<DiffEntry[]>([])
  const diffVersion = ref<number | null>(null)

  /** 打开版本弹层并拉列表 */
  async function openHistory(): Promise<void> {
    historyOpen.value = true
    await refreshVersions()
  }

  /** 关闭弹层并清 diff（列表保留，下次打开刷新） */
  function closeHistory(): void {
    historyOpen.value = false
    diffEntries.value = []
    diffVersion.value = null
  }

  /** 拉版本列表（失败写 versionsError 不抛；api 未注入同文案） */
  async function refreshVersions(): Promise<boolean> {
    if (!api) {
      versionsError.value = '未配置服务端 API'
      return false
    }
    versionsLoading.value = true
    versionsError.value = ''
    try {
      const r = await api.listVersions(pageId.value)
      versions.value = r.versions
      currentVersion.value = r.currentVersion
      return true
    } catch (e) {
      versionsError.value = `版本列表加载失败：${errMsg(e)}`
      return false
    } finally {
      versionsLoading.value = false
    }
  }

  /** 对比历史版 vN 与当前画布（拉 vN 全文 → diffSchema；失败落 statusText） */
  async function compareVersion(v: number): Promise<boolean> {
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    try {
      const r = await api.getSchema(pageId.value, `v${v}`)
      diffEntries.value = diffSchema(r.schema, schema.value)
      diffVersion.value = v
      statusText.value = `已对比 v${v} 与当前画布：${diffEntries.value.length} 处差异`
      return true
    } catch (e) {
      statusText.value = `版本对比失败：${errMsg(e)}`
      return false
    }
  }

  /** 清空当前对比 */
  function clearDiff(): void {
    diffEntries.value = []
    diffVersion.value = null
  }

  /**
   * 回滚到 vN：服务端把 vN 复制为草稿 → 前端 `openPage()` 重载（replaceSchema 清栈清选中）
   * → 关弹窗清 diff → 状态提示「需重新发布生效」。
   */
  async function rollbackTo(v: number): Promise<boolean> {
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    try {
      await api.rollback(pageId.value, v, pageRevision.value)
    } catch (e) {
      statusText.value = `回滚失败：${errMsg(e)}`
      return false
    }
    await openPage()
    closeHistory()
    statusText.value = `已回滚到 v${v}（草稿，需重新发布生效）`
    return true
  }

  /* ---------------- 批 4：字段绑定（决策 D-A11） ---------------- */

  /** 数据模型列表（页面级「提交模型」下拉） */
  const models = ref<ModelSummary[]>([])
  /** 当前绑定模型的字段（节点级「字段绑定」下拉） */
  const modelFields = ref<FieldSchema[]>([])
  /** modelFields 归属的模型 id（同模型不重复请求；换模型即失效） */
  const fieldsModelId = ref('')
  /** 模型数据加载错误（**不静默**：下拉区展示，与 D-A4 同思路） */
  const modelError = ref('')
  /** 模型列表加载中（面板据此渲染骨架屏，避免「空列表」与「还没加载」混淆） */
  const modelsLoading = ref(false)
  /** 当前模型字段加载中（同上） */
  const fieldsLoading = ref(false)
  /** 页面提交目标模型 id（schema 推导，非独立状态 —— 换 schema 即重算） */
  const submitModelId = computed<string | null>(() => readSubmitModel(schema.value))

  /* ---------------- 批 3：校验 / 持久化基础设施 ---------------- */

  /** schema 任何修改后的统一钩子：置 dirty + 重跑前端校验（demo 规模全量重跑零成本） */
  function touch(): void {
    saveState.value = 'dirty'
    validation.value = validatePage(schema.value)
  }

  /** 注入持久化通道（designer-web 挂载时调用；测试传 mock） */
  function setApi(next: DesignerApi | null): void {
    api = next
  }

  function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  /* ---------------- 选中 ---------------- */

  function select(nodeId: string): void {
    selectedId.value = nodeId
  }

  function clearSelect(): void {
    selectedId.value = ''
  }

  /* ---------------- 拖放（锚点 → schema-ops） ---------------- */

  function resolve(hit: AnchorHit): { parentId: string; index: number } {
    return resolveAnchorTarget(schema.value, hit, {
      childrenOf: (nodeId) => findNode(schema.value, nodeId)?.children ?? [],
      locate: (nodeId) => {
        const loc = findParent(schema.value, nodeId)
        return loc ? { parentId: loc.parent.id, index: loc.index } : null
      },
    })
  }

  /** 物料拖入（hit 缺省 = 追加 root 末尾）；成功后选中新节点 */
  function insertMaterial(materialName: string, hit?: AnchorHit): boolean {
    const meta = META_MAP[materialName]
    if (!meta) return false
    const target =
      hit && hit.nodeId
        ? resolve(hit)
        : { parentId: schema.value.root.id, index: (schema.value.root.children ?? []).length }
    const r = insertNode(schema.value, meta, target)
    if (!r.id) return false
    schema.value = r.schema
    selectedId.value = r.id
    touch()
    return true
  }

  /** 画布内节点拖拽换位（非法目标由 moveNode no-op 兜底） */
  function moveByDrop(nodeId: string, hit: AnchorHit): void {
    if (!hit.nodeId || nodeId === hit.nodeId) return
    const target = resolve(hit)
    const r = moveNode(schema.value, nodeId, target.parentId, target.index)
    if (!r.id) return
    schema.value = r.schema
    touch()
  }

  /* ---------------- 删除 / 排序（工具栏 + Delete 键路径） ---------------- */

  function removeById(nodeId: string): boolean {
    if (nodeId === schema.value.root.id) return false
    const r = removeNode(schema.value, nodeId)
    if (!r.id) return false
    schema.value = r.schema
    if (selectedId.value === nodeId) selectedId.value = ''
    touch()
    return true
  }

  function moveById(nodeId: string, dir: -1 | 1): boolean {
    const r = moveSibling(schema.value, nodeId, dir)
    if (!r.id) return false
    schema.value = r.schema
    touch()
    return true
  }

  /* ---------------- 属性 ---------------- */

  function setProp(nodeId: string, key: string, value: unknown): void {
    const r = updateProp(schema.value, nodeId, key, value)
    if (!r.id) return
    schema.value = r.schema
    touch()
    // D-A12 联动：`required`（label「必填」，星号展示）与 `props.rules` 的 required（校验拦截）
    // 是同一个开关 —— 校验引擎 collectRules 只认 props.rules，不联动就会「开了必填只出星号、
    // 提交却不拦」（物料 required prop 纯展示）。只改校验层不动星号的场景不存在，故在写路径统一分叉。
    const sub = key.startsWith('props.') ? key.slice('props.'.length) : key
    if (sub === 'required') {
      const rr = setRequiredRuleOp(schema.value, nodeId, value === true)
      if (rr.id) schema.value = rr.schema
    }
  }

  /** 替换整棵 schema（打开/新建/回滚/撤销恢复入口）：不清剪贴板；清选中 + 清历史栈 + 重校验 + 置 dirty */
  function replaceSchema(next: PageSchema): void {
    suspendHistory = true // 换内容不是编辑，不入撤销栈
    schema.value = next
    selectedId.value = ''
    undoStack.value = [] // 历史跨页无意义（跨页撤销会把 A 页 schema 覆盖到 B 页 = 数据事故）
    redoStack.value = []
    touch()
  }

  /* ---------------- 批 3：打开 / 保存 / 发布 ---------------- */

  /** 打开页面：GET schema → replaceSchema → idle；失败保留本地内容并置 error */
  async function openPage(id?: string): Promise<boolean> {
    const target = (id ?? pageId.value).trim()
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    saveState.value = 'loading'
    perf.value = null
    const t0 = Date.now()
    try {
      const r = await api.getSchema(target)
      const schemaMs = Date.now() - t0
      pageId.value = target
      pageRevision.value = r.revision ?? 0
      replaceSchema(r.schema) // touch → dirty，下一行覆盖为 idle
      saveState.value = 'idle'
      statusText.value = `已打开 ${target}（${r.version}）`
      // 渲染耗时由 LcCanvas @rendered 异步回填（markRender 合并到同一采样）
      perf.value = { schemaMs, nodes: countNodes(r.schema.root) }
      return true
    } catch (e) {
      saveState.value = 'error'
      statusText.value = `打开失败：${errMsg(e)}`
      return false
    }
  }

  /**
   * 批 5：画布渲染完成回调（LcCanvas @rendered）。
   * 只更新 `renderMs` / `nodes`，保留 openPage 记下的 `schemaMs`。
   */
  function markRender(payload: { ms: number; nodes?: number }): void {
    perf.value = {
      ...(perf.value ?? {}),
      renderMs: payload.ms,
      ...(payload.nodes !== undefined ? { nodes: payload.nodes } : {}),
    }
  }

  /**
   * 保存草稿：前端 validatePage 先跑，**有错误不发 PUT**（错误在底栏可见）；
   * 通过则 PUT（服务端 upsert：新 pageId 自动建档 = 「新建即保存」）。
   */
  async function save(): Promise<boolean> {
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    validation.value = validatePage(schema.value)
    if (!validation.value.valid) {
      saveState.value = 'error'
      statusText.value = `校验 ${validation.value.errors.length} 项错误，未保存`
      return false
    }
    saveState.value = 'saving'
    try {
      const r = await api.saveSchema(pageId.value, schema.value, pageRevision.value)
      if (r && typeof r.revision === 'number') pageRevision.value = r.revision
      saveState.value = 'idle'
      statusText.value = `已保存 ${pageId.value}`
      return true
    } catch (e) {
      saveState.value = 'error'
      statusText.value = `保存失败：${errMsg(e)}`
      return false
    }
  }

  /** 发布：草稿非 idle（有未保存修改）先保存（同受校验门禁），再 POST 固化版本 */
  async function publish(): Promise<boolean> {
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    if (saveState.value !== 'idle' && !(await save())) return false
    try {
      const r = await api.publish(pageId.value, pageRevision.value)
      if (typeof r.revision === 'number') pageRevision.value = r.revision
      statusText.value = `已发布 ${pageId.value} v${r.version ?? '?'}`
      return true
    } catch (e) {
      statusText.value = `发布失败：${errMsg(e)}`
      return false
    }
  }

  /** 新建页面：换 pageId + 载入 demo 初始结构（置 dirty；建档由随后的保存完成） */
  function newPage(id: string): boolean {
    const target = id.trim()
    if (!target) return false
    pageId.value = target
    pageRevision.value = 0 // 新建/换页从 0 开始；首次保存由服务端建档
    const fresh = demoPage()
    fresh.name = target // D-P2-3：name 默认 = pageId —— 模板名「画布演示」残留会致 runtime 菜单多页撞名
    replaceSchema(fresh) // touch → dirty
    statusText.value = `新建 ${target}（未保存，点保存建档）`
    return true
  }

  /**
   * 基于数据模型新建页面（2026-10-28 产品口径：先模型、后页面）。
   *
   * 与 `newPage`（demo 模板）不同：这里生成**只含当前模型字段**的干净页面，
   * 并直接写入提交 / list / detail 绑定，避免用户建完页再手工找模型。
   * 建档仍由随后的保存完成（首次 PUT schema 时服务端 upsert）。
   */
  async function createPageFromModel(
    pageIdInput: string,
    modelId: string,
    type: ModelPageType,
  ): Promise<boolean> {
    const target = pageIdInput.trim()
    if (!target) {
      statusText.value = '请先填写页面 ID'
      return false
    }
    if (!modelId) {
      statusText.value = '请先选择数据模型'
      return false
    }
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    try {
      const model = await api.getModel(modelId)
      const fresh = buildModelPage({ pageId: target, type, model })
      pageId.value = target
      pageRevision.value = 0
      replaceSchema(fresh)
      // 同步字段缓存：新建后右栏「绑定字段」立即可用，无需再拉一次模型
      modelFields.value = model.fields ?? []
      fieldsModelId.value = modelId
      modelError.value = ''
      statusText.value = `新建 ${target}（${MODEL_PAGE_TYPE_LABEL[type]} · 模型 ${modelId}，未保存，点保存建档）`
      return true
    } catch (e) {
      statusText.value = `新建失败：${errMsg(e)}`
      return false
    }
  }

  /* ---------------- 2026-10-28：模型即模块（一次生成成组页面） ---------------- */

  /**
   * 一次生成成组页面（列表 / 表单 / 详情），并回写模型的默认页引用。
   *
   * 与 `createPageFromModel` 的区别：这里**直接落盘**（逐个 PUT，服务端 upsert），
   * 因为「模块」是个整体 —— 只留在本地草稿上，用户切页就散了。
   *
   * 安全约束：
   *  - 生成前先刷新列表，**任一目标 id 已存在就整体中止**（saveSchema 是 upsert，不能悄悄覆盖别人的页面）；
   *  - 每页先跑 `validatePage`，有错不发请求；
   *  - 模型回写（`listPageId` / `formPageId`）失败只告警 —— 页面已成组，不该回滚。
   */
  async function createModelModule(
    rawBase: string,
    modelId: string,
    types: readonly ModelPageType[] = MODEL_PAGE_TYPES,
  ): Promise<boolean> {
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    const base = moduleBase(rawBase)
    if (!base) {
      statusText.value = '请先填写模块 ID（字母或下划线开头）'
      return false
    }
    if (!modelId) {
      statusText.value = '请先选择数据模型'
      return false
    }
    const wanted = MODEL_PAGE_TYPES.filter((t) => types.includes(t))
    if (!wanted.length) {
      statusText.value = '至少要勾选一种页面'
      return false
    }

    const ids = modulePageIds(base)
    const targets = wanted.map((t) => ids[t])
    const created: string[] = []
    let model: ModelSchema | undefined
    try {
      // 先刷新：id 冲突必须整体中止，不能靠「服务端 upsert」把存量页面覆盖掉
      await loadPages(true)
      const clash = targets.filter((id) => pages.value.some((p) => p.id === id))
      if (clash.length) {
        statusText.value = `页面已存在：${clash.join('、')}，请换一个模块 ID`
        return false
      }
      model = await api.getModel(modelId)
    } catch (e) {
      statusText.value = `读取模型失败：${errMsg(e)}`
      return false
    }
    if (!model) {
      statusText.value = `读取模型失败：${modelId}`
      return false
    }

    const mod = buildModelModule({ model, base, types: wanted })
    try {
      for (const page of mod.pages) {
        const v = validatePage(page)
        if (!v.valid) {
          statusText.value = `页面 ${page.id} 校验失败（${v.errors.length} 项），已中止`
          return false
        }
        await api.saveSchema(page.id, page, 0)
        created.push(page.id)
      }
    } catch (e) {
      statusText.value = `生成中断：${created.length ? `已建 ${created.join('、')}；` : ''}失败原因 ${errMsg(e)}`
      await loadPages(true)
      return false
    }

    // 回写模型默认页：让「模型 → 页面」有反向索引（云程同款：模型记得自己的列表/表单页）
    let refWarn = ''
    try {
      const next: ModelSchema = { ...model }
      if (wanted.includes('list')) next.listPageId = ids.list
      if (wanted.includes('form')) next.formPageId = ids.form
      await api.putModel(next)
    } catch (e) {
      refWarn = `；模型默认页回写失败：${errMsg(e)}`
    }

    await loadPages(true)
    const openTarget = wanted.includes('list') ? ids.list : mod.pages[0]!.id
    const opened = await openPage(openTarget)
    modelFields.value = model.fields ?? []
    fieldsModelId.value = modelId
    statusText.value = `已生成 ${created.length} 个页面（${created.join('、')}）${
      opened ? '，已打开首页' : '，但打开首页失败'
    }${refWarn}`
    return true
  }

  /* ---------------- 2026-10-28：门户清单（移动门户） ---------------- */

  /** 页面编码规则（与服务端 `PAGE_ID_RE` 一致） */
  const PORTAL_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

  const portalPages = ref<PortalListItem[]>([])
  const portalLoading = ref(false)
  const portalError = ref('')

  /**
   * 加载门户清单：页面列表里 `type=portal` 的行 + 各自的排序 / 备注。
   *
   * 排序 / 备注放在 `schema.portal` 而非页面行上（不动服务端协议），所以这里
   * 逐页 `getSchema` 取运营字段；单页失败**不拖垮整张表**，该行降级为未设置。
   */
  async function loadPortalPages(): Promise<boolean> {
    if (!api) {
      portalError.value = '未配置服务端 API'
      return false
    }
    portalLoading.value = true
    try {
      // 清单要反映别处新建 / 删除的结果，跳过「已加载」缓存
      await loadPages(true)
      if (pagesError.value && !pages.value.length) {
        portalError.value = pagesError.value
        return false
      }
      const rows = pages.value.filter((p) => p.type === 'portal')
      type PortalMeta = Pick<PortalListItem, 'id' | 'title' | 'order' | 'remark'>
      const metas = await Promise.all(
        rows.map(async (p): Promise<PortalMeta> => {
          try {
            const { schema } = await api!.getSchema(p.id)
            return {
              id: p.id,
              title: schema.portal?.title,
              order: schema.portal?.order,
              remark: schema.portal?.remark,
            }
          } catch {
            // 单页读取失败（如并发删除）不阻塞清单：当未设置处理
            return { id: p.id }
          }
        }),
      )
      const byId = new Map(metas.map((m) => [m.id, m]))
      portalPages.value = rows
        .map((p) => ({ ...p, ...(byId.get(p.id) ?? {}) }))
        .sort((a, b) => {
          const ao = a.order
          const bo = b.order
          if (ao !== undefined && bo !== undefined) return ao - bo || a.name.localeCompare(b.name)
          if (ao !== undefined) return -1
          if (bo !== undefined) return 1
          return a.name.localeCompare(b.name, 'zh-Hans-CN')
        })
      portalError.value = ''
      return true
    } catch (e) {
      portalError.value = `门户清单加载失败：${errMsg(e)}`
      return false
    } finally {
      portalLoading.value = false
    }
  }

  /**
   * 新建门户页（清单里的「新增」）：建骨架后**直接落盘**。
   *
   * 与 `newPage`（本地草稿）不同，门户清单是个列表，留本地草稿会让「清单」与
   * 「页面」两处都不一样；这里先刷新列表查重，**编码已存在就拒绝**（saveSchema 是 upsert）。
   */
  async function createPortalPage(input: {
    id: string
    name?: string
    order?: number
    remark?: string
  }): Promise<boolean> {
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    const id = input.id.trim()
    if (!PORTAL_ID_RE.test(id)) {
      statusText.value = '页面编码不合法：字母或下划线开头，仅限字母、数字、下划线、短横线，最长 64 位'
      return false
    }
    try {
      await loadPages(true)
      if (pages.value.some((p) => p.id === id)) {
        statusText.value = `页面编码已存在：${id}，请换一个`
        return false
      }
      const fresh = buildPortalPage({
        pageId: id,
        name: input.name,
        order: input.order,
        remark: input.remark,
      })
      const v = validatePage(fresh)
      if (!v.valid) {
        statusText.value = `门户页校验失败（${v.errors.length} 项），未创建`
        return false
      }
      await api.saveSchema(id, fresh, 0)
      await loadPortalPages()
      statusText.value = `已创建门户页 ${id}`
      return true
    } catch (e) {
      statusText.value = `创建门户页失败：${errMsg(e)}`
      return false
    }
  }

  /**
   * 更新门户页的名称 / 排序 / 备注（清单里的「编辑」）。
   *
   * 先 `getSchema` 拿 revision 再写，走 If-Match —— 409 只提示、不自动覆盖；
   * `order` / `remark` 传 `null` 表示清空（键直接删掉，避免空值进协议）。
   */
  async function updatePortalMeta(
    id: string,
    patch: { name?: string; order?: number | null; remark?: string | null },
  ): Promise<boolean> {
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    try {
      const { schema: current, revision } = await api.getSchema(id)
      const next: PageSchema = { ...current }
      if (patch.name !== undefined) {
        const name = patch.name.trim()
        if (!name) {
          statusText.value = '门户页名称不能为空'
          return false
        }
        next.name = name
      }
      const portal: PortalPageConfig = { ...(next.portal ?? { cards: [] }) }
      if (patch.order !== undefined) {
        if (patch.order === null) delete portal.order
        else portal.order = patch.order
      }
      if (patch.remark !== undefined) {
        const remark = (patch.remark ?? '').trim()
        if (!remark) delete portal.remark
        else portal.remark = remark
      }
      next.portal = portal
      const v = validatePage(next)
      if (!v.valid) {
        statusText.value = `门户页校验失败（${v.errors.length} 项），未保存`
        return false
      }
      await api.saveSchema(id, next, revision)
      await loadPortalPages()
      statusText.value = `已更新门户页 ${id}`
      return true
    } catch (e) {
      statusText.value = `更新门户页失败：${errMsg(e)}`
      return false
    }
  }

  /* ---------------- 2026-10-20：页面列表 / 删除 ---------------- */

  /**
   * 拉取页面列表（顶栏换页下拉的数据源）。
   * `force=false` 且已加载过 → 短路（下拉每次展开都拉一遍没有意义）；失败只写 `pagesError`，不抛。
   */
  async function loadPages(force = false): Promise<boolean> {
    if (!api) {
      pagesError.value = '未配置服务端 API'
      return false
    }
    if (!force && pagesLoaded.value) return true
    pagesLoading.value = true
    try {
      pages.value = await api.listPages()
      pagesLoaded.value = true
      pagesError.value = ''
      return true
    } catch (e) {
      pagesError.value = `页面列表加载失败：${errMsg(e)}`
      return false
    } finally {
      pagesLoading.value = false
    }
  }

  /**
   * 删除页面（含全部历史版本，不可恢复 —— UI 必须两步确认）。
   *
   * 删的若正是当前页，**必须立刻切走**：否则画布上会留着一份「服务端已不存在」的 schema，
   * 用户再点保存就会把它 upsert 回来（删除等于没删）。无剩余页面时落一份新的 `page_new` 草稿。
   */
  async function deletePage(id: string): Promise<boolean> {
    if (!api) {
      statusText.value = '未配置服务端 API'
      return false
    }
    if (!api.deletePage) {
      statusText.value = '当前服务端未提供删除接口'
      return false
    }
    // 删除前记下绑定模型：删完要顺手清掉模型上指向本页的默认页引用
    const removedPage = pages.value.find((p) => p.id === id)
    try {
      const r = await api.deletePage(id)
      pages.value = pages.value.filter((p) => p.id !== id)
      void clearModelPageRef(id, removedPage?.modelId)
      const deleted = `已删除 ${id}（含 ${r.removedVersions} 个历史版本）`
      if (pageId.value === id) {
        const next = pages.value[0]
        if (!next) {
          newPage(freshDraftId())
          statusText.value = `${deleted}，已落新草稿 ${pageId.value}`
        } else {
          const opened = await openPage(next.id)
          if (opened) {
            statusText.value = `${deleted}，已切换到 ${next.id}`
          } else {
            // 打不开下一页时绝不能留着已删除页的 schema（再保存会把页面 upsert 回来）
            const fallback = statusText.value
            newPage(freshDraftId())
            statusText.value = `${deleted}；打开 ${next.id} 失败（${fallback}），已回落到新草稿`
          }
        }
      } else {
        statusText.value = deleted
      }
      return true
    } catch (e) {
      statusText.value = `删除失败：${errMsg(e)}`
      return false
    }
  }

  /**
   * 清理模型上指向已删除页面的默认页引用（旁路）。
   *
   * 「模型记得自己的列表/表单页」是本次新增的反向索引，页面被删后必须失效；
   * 否则模型面板会指向一个 404 页面。失败只影响索引，**绝不回滚删除**。
   */
  async function clearModelPageRef(pageId: string, modelId?: string): Promise<void> {
    if (!api || !modelId) return
    try {
      const model = await api.getModel(modelId)
      if (model.listPageId !== pageId && model.formPageId !== pageId) return
      const next: ModelSchema = { ...model }
      if (next.listPageId === pageId) delete next.listPageId
      if (next.formPageId === pageId) delete next.formPageId
      await api.putModel(next)
    } catch {
      // 清理失败不影响删除结果；下次在模型面板重新指定默认页即可
    }
  }

  /** 删除后回落用的草稿 id：优先 `page_new`，被占用则递增，避免覆盖存量页面 */
  function freshDraftId(): string {
    if (!pages.value.some((p) => p.id === 'page_new')) return 'page_new'
    let n = 2
    while (pages.value.some((p) => p.id === `page_new_${n}`)) n += 1
    return `page_new_${n}`
  }

  /* ---------------- 批 4：字段绑定（决策 D-A11） ---------------- */

  /**
   * 拉取数据模型列表（属性面板下拉的数据源）。
   * `force=false` 且已加载 → 跳过（面板重挂载不重复请求）；失败写 `modelError` 不抛。
   */
  async function loadModels(force = false): Promise<boolean> {
    if (!api) {
      modelError.value = '未配置服务端 API'
      return false
    }
    if (!force && models.value.length > 0) return true
    modelsLoading.value = true
    try {
      models.value = await api.listModels()
      modelError.value = ''
      return true
    } catch (e) {
      modelError.value = `模型列表加载失败：${errMsg(e)}`
      return false
    } finally {
      modelsLoading.value = false
    }
  }

  /**
   * 拉取指定模型的字段（按 `modelId` 缓存，同模型不重复请求）。
   * `modelId` 为空 → 清空字段与缓存标记（解绑状态）。
   * 失败时清空字段（避免展示**别的**模型的字段误导配置）+ 写 `modelError`。
   */
  async function loadModelFields(modelId: string): Promise<boolean> {
    if (!modelId) {
      modelFields.value = []
      fieldsModelId.value = ''
      return true
    }
    if (fieldsModelId.value === modelId && modelFields.value.length > 0) return true
    if (!api) {
      modelError.value = '未配置服务端 API'
      return false
    }
    fieldsLoading.value = true
    try {
      const m = await api.getModel(modelId)
      modelFields.value = m.fields ?? []
      fieldsModelId.value = modelId
      modelError.value = ''
      return true
    } catch (e) {
      modelFields.value = []
      fieldsModelId.value = ''
      modelError.value = `模型字段加载失败：${errMsg(e)}`
      return false
    } finally {
      fieldsLoading.value = false
    }
  }

  /**
   * 页面级：设置提交目标模型（`null` = 清除）→ schema-ops `setSubmitModel`。
   * 换模型时使字段缓存失效并立即拉新模型字段（下拉不展示旧模型字段）。
   */
  function setSubmitModel(modelId: string | null): void {
    const r = setSubmitModelOp(schema.value, modelId)
    if (!r.id) return
    schema.value = r.schema
    touch()
    if (fieldsModelId.value !== (modelId ?? '')) {
      modelFields.value = []
      fieldsModelId.value = ''
    }
    void loadModelFields(modelId ?? '')
  }

  /**
   * 节点级：绑定表单字段（写 `props.name` —— 协议 2.2 字段绑定名，
   * renderer `collectFieldNames` 用它组装提交 payload 的键）。
   * 传 `''` = 解绑（写 `undefined`，字段从 payload 中消失）。
   */
  function setFieldBinding(nodeId: string, fieldKey: string): void {
    setProp(nodeId, 'name', fieldKey ? fieldKey : undefined)
  }

  /**
   * 节点级：绑定事件动作（批 5 / D-A13 最小动作绑定）——
   * `actionType = null` 解除该事件的动作；否则**同事件原位替换**（一个事件一个动作）。
   * 写 `node.actions`（renderer `runActions` 按 event 过滤执行）。
   */
  function setNodeAction(nodeId: string, event: string, actionType: string | null): void {
    const cur = findNode(schema.value, nodeId)?.actions ?? []
    const rest = cur.filter((a) => a.event !== event)
    const next = actionType
      ? [...rest, { event, type: actionType } as (typeof rest)[number]]
      : rest
    const r = updateActions(schema.value, nodeId, next)
    if (!r.id) return
    schema.value = r.schema
    touch()
  }

  /* ---------------- Phase 2 批 2：页面类型切换 + list/detail 配置 ---------------- */

  /** 切换页面类型（form/list/detail/custom）；list/detail 由 schema-ops 初始化骨架配置 */
  function setPageType(type: PageType): void {
    const r = setPageTypeOp(schema.value, type)
    if (!r.id) return
    schema.value = r.schema
    touch()
  }

  /** 浅合并列表页配置（换模型时 schema-ops 会重置 columns） */
  function setListConfig(patch: Partial<ListPageConfig>): void {
    const r = updateListConfig(schema.value, patch)
    if (!r.id) return
    schema.value = r.schema
    touch()
    // 选中模型后拉字段（多选列的选项源；loadModelFields 自带同模型缓存）
    if (patch.modelId) void loadModelFields(patch.modelId)
  }

  /** 浅合并详情页配置（与 setListConfig 对称） */
  function setDetailConfig(patch: Partial<DetailPageConfig>): void {
    const r = updateDetailConfig(schema.value, patch)
    if (!r.id) return
    schema.value = r.schema
    touch()
    if (patch.modelId) void loadModelFields(patch.modelId)
  }

  /** 浅合并门户页配置（Phase 3 批 4；cards 整体替换，其余浅合并） */
  function setPortalConfig(patch: Partial<PortalPageConfig>): void {
    const r = updatePortalConfig(schema.value, patch)
    if (!r.id) return
    schema.value = r.schema
    touch()
  }

  /* ---------------- Phase 2 批 1：模型可视化建模（D-P2-1） ---------------- */

  /**
   * 设计器视图：`page` 画布（默认）| `portal` 移动门户清单 | `model` 数据模型管理 |
   * `rbac` 权限管理 | `theme` 主题配置 | `webhook` 开放集成 | `market` 物料市场
   */
  const view = ref<'page' | 'portal' | 'model' | 'rbac' | 'theme' | 'webhook' | 'market'>('page')
  /** 当前编辑的模型（null = 列表视图） */
  const editingModel = ref<ModelSchema | null>(null)
  /** 模型编辑脏态 / 保存中 */
  const modelDirty = ref(false)
  const modelSaving = ref(false)
  /** 模型保存门禁错误（**不静默**：面板红字列表，与 modelError 分工 —— 这里是编辑态校验，那边是加载态） */
  const modelErrors = ref<string[]>([])

  /** 切换视图（切到 model/rbac/portal 时刷新对应列表；已在目标视图 no-op；theme/webhook 面板自持读写无需预载） */
  async function switchView(
    v: 'page' | 'portal' | 'model' | 'rbac' | 'theme' | 'webhook' | 'market',
  ): Promise<void> {
    if (view.value === v) return
    view.value = v
    if (v === 'model') {
      editingModel.value = null
      modelErrors.value = []
      await loadModels(true) // force：列表摘要 fieldCount 需要新鲜（模型可能刚保存）
      void loadRoles() // permissions 勾选需要角色源（不阻塞主加载）
    } else if (v === 'rbac') {
      await loadRbac()
    } else if (v === 'portal') {
      await loadPortalPages()
    }
  }

  /** 打开模型编辑器（GET 定义 → 回填编辑态） */
  async function openModel(id: string): Promise<boolean> {
    if (!api) {
      modelError.value = '未配置服务端 API'
      return false
    }
    try {
      const m = await api.getModel(id)
      editingModel.value = m
      modelDirty.value = false
      modelErrors.value = []
      return true
    } catch (e) {
      modelError.value = `模型打开失败：${errMsg(e)}`
      return false
    }
  }

  /** 新建模型：输入 id → 空白骨架进编辑器（建档由随后的保存完成） */
  function newModel(id: string): boolean {
    const target = id.trim()
    if (!target) return false
    editingModel.value = blankModel(target)
    modelDirty.value = true
    modelErrors.value = []
    return true
  }

  /** 关闭编辑器回列表 */
  function closeModel(): void {
    editingModel.value = null
    modelErrors.value = []
  }

  /** 顶层属性（name / code）修改 */
  function setModelProp(patch: Partial<Pick<ModelSchema, 'name' | 'code'>>): void {
    if (!editingModel.value) return
    editingModel.value = { ...editingModel.value, ...patch }
    modelDirty.value = true
  }

  function addModelField(): string {
    if (!editingModel.value) return ''
    const r = addFieldOp(editingModel.value)
    editingModel.value = r.model
    modelDirty.value = true
    return r.key
  }

  function removeModelField(key: string): void {
    if (!editingModel.value) return
    const next = removeFieldOp(editingModel.value, key)
    if (next === editingModel.value) return
    editingModel.value = next
    modelDirty.value = true
  }

  function moveModelField(key: string, dir: -1 | 1): void {
    if (!editingModel.value) return
    const next = moveFieldOp(editingModel.value, key, dir)
    if (next === editingModel.value) return
    editingModel.value = next
    modelDirty.value = true
  }

  function editModelField(key: string, patch: Partial<FieldSchema>): void {
    if (!editingModel.value) return
    editingModel.value = updateFieldOp(editingModel.value, key, patch)
    modelDirty.value = true
  }

  /** 设置模型 dataScope（批 6 / 行级；dept 系在面板置灰不可选，这里只收 all/self） */
  function setModelDataScope(scope: ModelSchema['dataScope']): void {
    if (!editingModel.value) return
    editingModel.value = { ...editingModel.value, dataScope: scope }
    modelDirty.value = true
  }

  /** 切换模型 CRUD 某动作的某角色授权（批 6；on=false 移除；清空该动作 = 删 permissions[action]） */
  function toggleModelPerm(
    action: 'create' | 'read' | 'update' | 'delete',
    roleKey: string,
    on: boolean,
  ): void {
    if (!editingModel.value) return
    const cur = editingModel.value.permissions?.[action] ?? []
    const next = on ? [...new Set([...cur, roleKey])] : cur.filter((k) => k !== roleKey)
    const permissions = { ...(editingModel.value.permissions ?? {}) }
    if (next.length === 0) delete permissions[action]
    else permissions[action] = [...next].sort()
    editingModel.value = { ...editingModel.value, permissions }
    modelDirty.value = true
  }

  /** 保存模型：modelErrors 门禁（有错不发 PUT）→ putModel（服务端 upsert）→ 刷新列表摘要 */
  async function saveModel(): Promise<boolean> {
    if (!editingModel.value) return false
    if (!api) {
      modelErrors.value = ['未配置服务端 API']
      return false
    }
    const errs = modelErrorsOp(editingModel.value)
    if (errs.length > 0) {
      modelErrors.value = errs
      return false
    }
    modelSaving.value = true
    try {
      await api.putModel(editingModel.value)
      modelDirty.value = false
      modelErrors.value = []
      statusText.value = `已保存模型 ${editingModel.value.id}`
      await loadModels(true)
      return true
    } catch (e) {
      modelErrors.value = [`保存失败：${errMsg(e)}`]
      return false
    } finally {
      modelSaving.value = false
    }
  }

  /* ---------------- Phase 2 批 6：权限 RBAC（D-P2-10/12） ---------------- */

  /** RBAC 角色列表（权限管理视图左表） */
  const rbacRoles = ref<RoleRecord[]>([])
  /** pageId → 可见角色 key[]（仅含受限页面；缺省键 = 全员可见） */
  const pageAuth = ref<Record<string, string[]>>({})
  /** 全页面摘要（页面授权矩阵行源；复用 bootstrap 投影，零新接口） */
  const rbacPages = ref<Array<{ id: string; name: string }>>([])
  const rbacLoading = ref(false)
  const rbacSaving = ref(false)
  /** RBAC 错误（加载/保存失败，**不静默**红字） */
  const rbacError = ref('')
  /** 当前编辑的角色（null = 未编辑）；perms 以逗号分隔文本在面板编辑，这里存结构化值 */
  const editingRole = ref<RoleRecord | null>(null)
  /** 角色编辑门禁错误（红字，保存前拦截） */
  const roleErrors = ref<string[]>([])

  /** 载入 RBAC 配置 + 全页面列表（页面矩阵需要页面行源） */
  async function loadRbac(): Promise<void> {
    if (!api) {
      rbacError.value = '未配置服务端 API'
      return
    }
    rbacLoading.value = true
    rbacError.value = ''
    try {
      const cfg = await api.listRbac()
      rbacRoles.value = cfg.roles
      pageAuth.value = cfg.pages
      // 页面行源：优先 bootstrap（含 name/分组），失败退化为空（矩阵仍可按 pageId 手输提示）
      try {
        const boot = await api.listPages()
        rbacPages.value = boot
      } catch {
        rbacPages.value = []
      }
    } catch (e) {
      rbacError.value = `RBAC 加载失败：${errMsg(e)}`
    } finally {
      rbacLoading.value = false
    }
  }

  /** 轻量载入角色（模型面板 permissions 勾选需要角色源；不拉页面矩阵） */
  async function loadRoles(): Promise<void> {
    if (!api) return
    try {
      const cfg = await api.listRbac()
      rbacRoles.value = cfg.roles
    } catch {
      /* 角色源失败不阻塞模型编辑（permissions 勾选退化为空列表） */
    }
  }

  /** 新建角色（进入编辑态，未落库；key 校验在 roleErrors 门禁） */
  function newRole(key: string): boolean {
    const target = key.trim()
    if (!target) return false
    editingRole.value = { key: target, name: '', perms: [] }
    roleErrors.value = []
    return true
  }

  /** 打开角色编辑（回填） */
  function editRole(key: string): void {
    const r = rbacRoles.value.find((x) => x.key === key)
    editingRole.value = r ? { ...r, perms: [...r.perms] } : null
    roleErrors.value = []
  }

  /** 关闭角色编辑回列表 */
  function closeRole(): void {
    editingRole.value = null
    roleErrors.value = []
  }

  /** 角色编辑：改展示名 */
  function setRoleProp(patch: Partial<Pick<RoleRecord, 'name'>>): void {
    if (!editingRole.value) return
    editingRole.value = { ...editingRole.value, ...patch }
  }

  /** 角色编辑：改权限点（面板传逗号分隔文本，这里 split 去空；格式校验在门禁） */
  function setRolePerms(permsText: string): void {
    if (!editingRole.value) return
    const perms = permsText
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    editingRole.value = { ...editingRole.value, perms }
  }

  /** 角色保存门禁：key 格式 + name 非空 + perms 逐项格式（与服务端 PERM_RE + '*' 通配同源） */
  function roleGateErrors(role: RoleRecord): string[] {
    const errs: string[] = []
    if (!/^[A-Za-z_][\w-]{0,63}$/.test(role.key)) errs.push(`角色 key 格式不合法：${role.key}`)
    if (!role.name.trim()) errs.push('角色展示名不能为空')
    for (const p of role.perms) {
      // '*' 通配 = 超级角色，合法（服务端 upsertRole 同款豁免）
      if (p !== '*' && !/^[A-Za-z_][\w-]*$/.test(p)) errs.push(`权限点格式不合法：${p}`)
    }
    return errs
  }

  /** 保存角色：门禁红字不发 PUT → putRole → 刷新列表 */
  async function saveRole(): Promise<boolean> {
    if (!editingRole.value) return false
    if (!api) {
      rbacError.value = '未配置服务端 API'
      return false
    }
    const errs = roleGateErrors(editingRole.value)
    if (errs.length > 0) {
      roleErrors.value = errs
      return false
    }
    rbacSaving.value = true
    rbacError.value = ''
    try {
      await api.putRole(editingRole.value)
      statusText.value = `已保存角色 ${editingRole.value.key}`
      editingRole.value = null
      roleErrors.value = []
      await loadRbac()
      return true
    } catch (e) {
      rbacError.value = `角色保存失败：${errMsg(e)}`
      return false
    } finally {
      rbacSaving.value = false
    }
  }

  /** 页面授权矩阵：切换某页对某角色的可见性（勾选 true/false）；写回 pageAuth 并 PUT */
  async function togglePageRole(pageId: string, roleKey: string, on: boolean): Promise<void> {
    if (!api) return
    const cur = pageAuth.value[pageId] ? [...pageAuth.value[pageId]!] : []
    const next = on ? [...new Set([...cur, roleKey])] : cur.filter((k) => k !== roleKey)
    // 更新本地（乐观）+ 落服务端（空数组 = 删条目恢复全员可见）
    const copy = { ...pageAuth.value }
    if (next.length === 0) delete copy[pageId]
    else copy[pageId] = [...next].sort()
    pageAuth.value = copy
    try {
      await api.putPageAuth(pageId, next)
      statusText.value = next.length ? `已更新页面授权 ${pageId}` : `已恢复 ${pageId} 全员可见`
    } catch (e) {
      // 先重拉回滚本地乐观态，再写 error —— loadRbac 成功会清空 rbacError，
      // 顺序颠倒会把「保存失败」提示吞掉（B-18：错误不静默）
      await loadRbac()
      rbacError.value = `页面授权保存失败：${errMsg(e)}`
    }
  }

  /** 节点级：设置权限点（批 6 / D-P2-12 按钮级；空 = 清除） */
  function setNodePerm(nodeId: string, perm: string): void {
    const r = setNodePermOp(schema.value, nodeId, perm)
    if (!r.id) return
    schema.value = r.schema
    touch()
  }

  return {
    schema,
    pageId,
    pageRevision,
    saveState,
    statusText,
    validation,
    /* 2026-10-20：页面列表 / 删除（顶栏换页下拉） */
    pages,
    pagesError,
    pagesLoading,
    pagesLoaded,
    loadPages,
    deletePage,
    /* 2026-10-28：移动门户清单 */
    portalPages,
    portalLoading,
    portalError,
    loadPortalPages,
    createPortalPage,
    updatePortalMeta,
    /* 批 5：Profiler 采样（schema 加载 / 画布渲染） */
    perf,
    perfText,
    markRender,
    selectedId,
    selectedNode,
    selectedMeta,
    isRootSelected,
    /* 批 4：撤销/重做 + 剪贴板 */
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    undo,
    redo,
    clipboard,
    copyById,
    cutById,
    paste,
    /* 批 5：版本历史 / 回滚 / 对比 */
    historyOpen,
    versions,
    currentVersion,
    versionsLoading,
    versionsError,
    diffEntries,
    diffVersion,
    openHistory,
    closeHistory,
    refreshVersions,
    compareVersion,
    clearDiff,
    rollbackTo,
    models,
    modelFields,
    fieldsModelId,
    modelError,
    modelsLoading,
    fieldsLoading,
    submitModelId,
    select,
    clearSelect,
    insertMaterial,
    moveByDrop,
    removeById,
    moveById,
    setProp,
    replaceSchema,
    setApi,
    openPage,
    save,
    publish,
    newPage,
    createPageFromModel,
    createModelModule,
    loadModels,
    loadModelFields,
    setSubmitModel,
    setFieldBinding,
    setNodeAction,
    setPageType,
    setListConfig,
    setDetailConfig,
    setPortalConfig,
    view,
    editingModel,
    modelDirty,
    modelSaving,
    modelErrors,
    switchView,
    openModel,
    newModel,
    closeModel,
    setModelProp,
    addModelField,
    removeModelField,
    moveModelField,
    editModelField,
    setModelDataScope,
    toggleModelPerm,
    saveModel,
    /* 批 6：权限 RBAC（D-P2-10/12） */
    rbacRoles,
    pageAuth,
    rbacPages,
    rbacLoading,
    rbacSaving,
    rbacError,
    editingRole,
    roleErrors,
    loadRbac,
    loadRoles,
    newRole,
    editRole,
    closeRole,
    setRoleProp,
    setRolePerms,
    roleGateErrors,
    saveRole,
    togglePageRole,
    setNodePerm,
  }
})
