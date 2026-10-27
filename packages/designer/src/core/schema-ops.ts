/**
 * schema-ops.ts —— 页面 Schema 树操作纯函数（PLANS.md §1 D-A3，设计器批 2）
 *
 * 关键约束（方案 4.3）：
 * 1. **纯函数**：输入 schema，返回新 schema（结构共享，被修改路径重建），不原地改 ——
 *    为 Phase 2 的 immer undo 快照预留接缝；
 * 2. 所有对 schema 的修改**必须**经过本模块（视图组件不直接改 schema）；
 * 3. 不依赖 renderer/uni：`insertNode` 的物料信息由调用方传入（MaterialSchema），
 *    designer 包不 import materials —— 解耦，便于单测。
 */
import type {
  PageSchema,
  NodeSchema,
  MaterialSchema,
  Action,
  DataSourceSchema,
  PageType,
  ListPageConfig,
  DetailPageConfig,
  PortalPageConfig,
} from '@lc/schema'

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

let idSeq = 0

/**
 * 生成节点 id：`n_` + 时间戳基数 36 + 序号 —— 协议只要求唯一字符串。
 * 不用 crypto.randomUUID（老 WebView 兼容 + 可读性）。
 */
export function generateNodeId(): string {
  idSeq += 1
  return `n_${Date.now().toString(36)}${idSeq.toString(36)}`
}

/** 结构化深拷贝（schema 是纯 JSON 数据；不用 JSON.parse/stringify 以保留 undefined 语义） */
function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = clone(val)
    return out as T
  }
  return v
}

/** 在树中按 id 查找节点（含 root），返回引用（新旧 schema 中语义等价，只读用途） */
export function findNode(schema: PageSchema, nodeId: string): NodeSchema | null {
  const walk = (n: NodeSchema): NodeSchema | null => {
    if (n.id === nodeId) return n
    for (const c of n.children ?? []) {
      const hit = walk(c)
      if (hit) return hit
    }
    return null
  }
  return walk(schema.root)
}

/** 查找节点的父节点（root 无父，返回 null） */
export function findParent(schema: PageSchema, nodeId: string): { parent: NodeSchema; index: number } | null {
  const walk = (n: NodeSchema): { parent: NodeSchema; index: number } | null => {
    const children = n.children ?? []
    const idx = children.findIndex((c) => c.id === nodeId)
    if (idx >= 0) return { parent: n, index: idx }
    for (const c of children) {
      const hit = walk(c)
      if (hit) return hit
    }
    return null
  }
  if (schema.root.id === nodeId) return null
  return walk(schema.root)
}

/** 节点所有祖先 id（root → ... → parent），用于拖拽「不能拖进自己的子孙」判定 */
export function ancestorIds(schema: PageSchema, nodeId: string): string[] {
  const chain: string[] = []
  const walk = (n: NodeSchema, path: string[]): boolean => {
    if (n.id === nodeId) {
      chain.push(...path)
      return true
    }
    return (n.children ?? []).some((c) => walk(c, [...path, n.id]))
  }
  walk(schema.root, [])
  return chain
}

/* ------------------------------------------------------------------ */
/* 树操作                                                              */
/* ------------------------------------------------------------------ */

export interface OpResult {
  schema: PageSchema
  /** 变更相关 id（新节点 id / 被删节点 id / 被移节点 id）；无 id 变化时为 '' */
  id?: string
}

/**
 * 用物料信息构造新节点（defaultProps 深拷贝 → 挂到新 id）。
 * `parentId`/`index` 缺省 = 插入 root 末尾。
 */
export function insertNode(
  schema: PageSchema,
  material: Pick<MaterialSchema, 'name' | 'defaultProps' | 'isContainer'>,
  opts: { parentId?: string; index?: number } = {},
): OpResult {
  const newNode: NodeSchema = {
    id: generateNodeId(),
    componentName: material.name,
    props: clone(material.defaultProps ?? {}),
  }
  // 容器给 children 初值（非容器不带 children 字段，保持 schema 紧凑）
  if (material.isContainer) newNode.children = []

  const next = clone(schema)
  const parent = opts.parentId ? findNode(next, opts.parentId) : next.root
  if (!parent) return { schema: next, id: '' } // parentId 不存在：no-op（调用方兜底提示）
  const children = (parent.children ??= [])
  const idx = opts.index ?? children.length
  children.splice(Math.max(0, Math.min(idx, children.length)), 0, newNode)
  return { schema: next, id: newNode.id }
}

/**
 * 删除节点。**root 永不可删**（返回原 schema 的等价拷贝，id 为空）。
 * 容器内最后一个子节点删除后容器保留（方案 D-A5）。
 */
export function removeNode(schema: PageSchema, nodeId: string): OpResult {
  if (nodeId === schema.root.id) return { schema: clone(schema), id: '' }
  const hit = findParent(schema, nodeId)
  if (!hit) return { schema: clone(schema), id: '' }
  const next = clone(schema)
  const parent = findNode(next, nodeId)
  // 重新定位（clone 后引用变化）：用路径再找
  const loc = findParent(next, nodeId)
  if (!parent || !loc) return { schema: next, id: '' }
  ;(loc.parent.children ?? []).splice(loc.index, 1)
  return { schema: next, id: nodeId }
}

/**
 * 节点移动（同树/跨容器换位）。非法目标（目标是自己或自己的子孙 / 目标父不存在）→ no-op。
 * 先摘除再插入，索引按「摘除后的树」计算。
 */
export function moveNode(
  schema: PageSchema,
  nodeId: string,
  targetParentId: string,
  index: number,
): OpResult {
  if (nodeId === schema.root.id) return { schema: clone(schema), id: '' }
  if (nodeId === targetParentId) return { schema: clone(schema), id: '' }
  // 非法：目标父是**自己的子孙**（把节点拖进自己的子树 = 丢树）。注意：目标父是自己的直接父（同父换位）是合法的
  if (ancestorIds(schema, targetParentId).includes(nodeId)) return { schema: clone(schema), id: '' }
  // 前置校验目标父存在（否则会在摘除后丢节点）
  if (targetParentId !== schema.root.id && !findNode(schema, targetParentId)) {
    return { schema: clone(schema), id: '' }
  }

  const next = clone(schema)
  const loc = findParent(next, nodeId)
  if (!loc) return { schema: next, id: '' }
  const [moving] = (loc.parent.children ?? []).splice(loc.index, 1)
  if (!moving) return { schema: next, id: '' }

  const parent = findNode(next, targetParentId)
  if (!parent) return { schema: next, id: '' }
  const children = (parent.children ??= [])
  children.splice(Math.max(0, Math.min(index, children.length)), 0, moving)
  return { schema: next, id: nodeId }
}

/**
 * 单节点上移/下移（工具栏按钮与键盘可达性的兜底路径，方案 D-A5）。
 * 越界（已是第一个/最后一个）→ no-op。
 */
export function moveSibling(schema: PageSchema, nodeId: string, dir: -1 | 1): OpResult {
  const loc = findParent(schema, nodeId)
  if (!loc) return { schema: clone(schema), id: '' }
  const target = loc.index + dir
  const children = loc.parent.children ?? []
  if (target < 0 || target >= children.length) return { schema: clone(schema), id: '' }
  return moveNode(schema, nodeId, loc.parent.id, target)
}

/**
 * 更新节点属性。`key` 支持三段（协议 4 章 SettingDesc key 约定）：
 * - `'label'`        → `node.props.label`
 * - `'props.xxx'`    → `node.props.xxx`（显式前缀，等价无前缀）
 * - `'style.xxx'`    → `node.style.xxx`
 * - `'event'`        → 请改用 `updateActions`
 */
export function updateProp(
  schema: PageSchema,
  nodeId: string,
  key: string,
  value: unknown,
): OpResult {
  const next = clone(schema)
  const node = findNode(next, nodeId)
  if (!node) return { schema: next, id: '' }

  if (key === 'style' || key.startsWith('style.')) {
    const sub = key === 'style' ? '' : key.slice('style.'.length)
    if (!sub) return { schema: next, id: nodeId } // 裸 'style' 视为 no-op（不建空对象）
    node.style ??= {}
    const parts = sub.split('.')
    let cursor = node.style as unknown as Record<string, unknown>
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i]!
      if (typeof cursor[k] !== 'object' || cursor[k] === null) cursor[k] = {}
      cursor = cursor[k] as Record<string, unknown>
    }
    cursor[parts[parts.length - 1]!] = clone(value)
    return { schema: next, id: nodeId }
  }

  const sub = key.startsWith('props.') ? key.slice('props.'.length) : key
  if (!sub) return { schema: next, id: nodeId }
  node.props ??= {}
  const parts = sub.split('.')
  let cursor: Record<string, unknown> = node.props
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!
    if (typeof cursor[k] !== 'object' || cursor[k] === null) cursor[k] = {}
    cursor = cursor[k] as Record<string, unknown>
  }
  cursor[parts[parts.length - 1]!] = clone(value)
  return { schema: next, id: nodeId }
}

/**
 * 读取节点属性（与 updateProp 对称的读路径，批 3 属性面板 setter 取值用）：
 * - `'label'` / `'props.xxx'` → `node.props`
 * - `'style.xxx'` → `node.style`
 * - `'event'` → `node.actions`
 *
 * 路径不存在返回 `undefined`（不抛错，setter 显示空值）。
 */
export function readNodeValue(node: NodeSchema, key: string): unknown {
  if (key === 'event') return node.actions
  if (key === 'style') return node.style
  const isStyle = key.startsWith('style.')
  const sub = isStyle
    ? key.slice('style.'.length)
    : key.startsWith('props.')
      ? key.slice('props.'.length)
      : key
  if (!sub) return undefined
  let cursor: unknown = isStyle ? node.style : node.props
  for (const part of sub.split('.')) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor
}

/** 更新节点动作列表（property 面板 eventBinder / 批 3 接入；键为 'event'） */
export function updateActions(schema: PageSchema, nodeId: string, actions: Action[]): OpResult {
  const next = clone(schema)
  const node = findNode(next, nodeId)
  if (!node) return { schema: next, id: '' }
  node.actions = clone(actions)
  return { schema: next, id: nodeId }
}

/**
 * 设置节点权限点（批 6 / D-P2-12 按钮级）：写顶层 `node.perm`（非 props）。
 * `perm` 传空串/undefined = 清除（写 `undefined`，节点对所有角色可见）。
 * 格式校验由协议 `E_PERM_FORMAT` 在保存门禁统一拦截（与 setProp 同口径，不在 setter 即时报错）。
 */
export function setNodePerm(schema: PageSchema, nodeId: string, perm?: string): OpResult {
  const next = clone(schema)
  const node = findNode(next, nodeId)
  if (!node) return { schema: next, id: '' }
  node.perm = perm && perm.trim() ? perm.trim() : undefined
  return { schema: next, id: nodeId }
}

/* ------------------------------------------------------------------ */
/* 页面级配置：提交目标模型（字段绑定，批 4 / 决策 D-A11）              */
/* ------------------------------------------------------------------ */

/**
 * 提交数据源的**固定 id**：页面级「提交模型」只写这一条，
 * 换模型时原位替换（数组顺序不变 → schema diff 稳定）。
 */
export const SUBMIT_DS_ID = 'ds_submit'

/**
 * 推导当前页面的提交目标模型 id（属性面板回填；未配置返回 null）。
 *
 * 读路径与 `setSubmitModel` 写路径严格对称：
 * `submit.dataSourceId` → `dataSources` 中那条 → `type==='model'` → `modelId`。
 * 数据源不是 model 类型（如 http）也返回 null —— 「提交模型」未配置。
 */
export function readSubmitModel(schema: PageSchema): string | null {
  const dsId = schema.submit?.dataSourceId
  if (!dsId) return null
  const ds = (schema.dataSources ?? []).find((d) => d.id === dsId)
  if (!ds || ds.type !== 'model') return null
  return ds.modelId ?? null
}

/**
 * 设置页面提交目标模型（页面级配置，决策 D-A11）：
 *
 * - `modelId = null` → **清除**：删掉本模块管理的 `ds_submit` 与 `submit`，
 *   **其他数据源原样保留**（用户自建的 http/static 源不误伤）；
 * - 否则 **upsert**：`dataSources` 原位写入
 *   `{ id:'ds_submit', type:'model', method:'POST', modelId }`，
 *   并把 `submit.dataSourceId` 指向它（已有的 successToast / successAction 保留）。
 *
 * `method` 固定 `POST`：renderer `runModel` 缺省即 POST，对应服务端
 * `POST /api/v1/models/:id/records`（新建记录）—— 页面提交 = 新建一行。
 *
 * 返回 `id = root.id` 表示成功（页面级操作，对象即页面本身），
 * store 沿用 `if (!r.id) return` 的统一成败判定。
 */
export function setSubmitModel(schema: PageSchema, modelId: string | null): OpResult {
  const next = clone(schema)
  const rootId = next.root.id
  const list = next.dataSources ?? []

  // —— 清除 ——
  if (!modelId) {
    const rest = list.filter((d) => d.id !== SUBMIT_DS_ID)
    if (rest.length !== list.length) next.dataSources = rest
    if (next.submit) delete next.submit
    return { schema: next, id: rootId }
  }

  // —— 配置 / 换模型 ——
  const ds: DataSourceSchema = {
    id: SUBMIT_DS_ID,
    name: '提交',
    type: 'model',
    method: 'POST',
    modelId,
  }
  const idx = list.findIndex((d) => d.id === SUBMIT_DS_ID)
  next.dataSources = idx >= 0 ? list.map((d, i) => (i === idx ? ds : d)) : [...list, ds]
  // submit 其余字段（successToast/successAction）原样保留
  next.submit = { ...next.submit, dataSourceId: SUBMIT_DS_ID }
  return { schema: next, id: rootId }
}

/**
 * 切换页面类型（Phase 2 批 2；Phase 3 批 4 补 portal）：
 *
 * - `list` / `detail` / `portal`：初始化骨架配置（**已有配置保留** —— 切走再切回不丢）；
 * - `form` / `custom`：原样（list/detail/portal 配置残留无害，validate 只按当前 type 查）。
 *
 * 类型不同 → 返回 `id = root.id`（成功）；相同 → `id = ''`（no-op，store 不 touch）。
 * 切到 list/detail 后 validate 立即红字「缺少 modelId」，由属性面板配置消解。
 */
export function setPageType(schema: PageSchema, type: PageType): OpResult {
  if (schema.type === type) return { schema, id: '' }
  const next = clone(schema)
  next.type = type
  if (type === 'list' && !next.list) next.list = { modelId: '', columns: [] }
  if (type === 'detail' && !next.detail) next.detail = { modelId: '' }
  if (type === 'portal' && !next.portal) next.portal = { cards: [] }
  return { schema: next, id: next.root.id }
}

/**
 * 更新列表页配置（浅合并 upsert；配置不存在以 `{modelId:''}` 起底）。
 * **换模型即重置 columns**（列属于模型字段，残留旧 key 会渲染空列），但两处豁免：
 * 起底（prev 不存在，无「旧模型」可言）与 patch 显式带 columns（调用方明确指定列）。
 */
export function updateListConfig(schema: PageSchema, patch: Partial<ListPageConfig>): OpResult {
  const next = clone(schema)
  const existed = next.list !== undefined
  const prev: ListPageConfig = next.list ?? { modelId: '' }
  const merged: ListPageConfig = { ...prev, ...patch }
  if (
    existed &&
    patch.modelId !== undefined &&
    patch.modelId !== prev.modelId &&
    patch.columns === undefined
  ) {
    merged.columns = []
  }
  next.list = merged
  return { schema: next, id: next.root.id }
}

/** 更新详情页配置（与 updateListConfig 对称：换模型重置 fields，起底/patch 显式带 fields 豁免） */
export function updateDetailConfig(schema: PageSchema, patch: Partial<DetailPageConfig>): OpResult {
  const next = clone(schema)
  const existed = next.detail !== undefined
  const prev: DetailPageConfig = next.detail ?? { modelId: '' }
  const merged: DetailPageConfig = { ...prev, ...patch }
  if (
    existed &&
    patch.modelId !== undefined &&
    patch.modelId !== prev.modelId &&
    patch.fields === undefined
  ) {
    merged.fields = []
  }
  next.detail = merged
  return { schema: next, id: next.root.id }
}

/**
 * 更新门户页配置（Phase 3 批 4，浅合并 upsert；配置不存在以 `{cards:[]}` 起底）。
 * `cards` 为整体替换（面板增删改后回传完整数组），其余键浅合并。
 */
export function updatePortalConfig(schema: PageSchema, patch: Partial<PortalPageConfig>): OpResult {
  const next = clone(schema)
  const prev: PortalPageConfig = next.portal ?? { cards: [] }
  next.portal = { ...prev, ...patch }
  return { schema: next, id: next.root.id }
}

/* ------------------------------------------------------------------ */
/* 校验规则：required 开关（批 5 / D-A12 —— 出口判据「拦截空必填」）      */
/* ------------------------------------------------------------------ */

/** 判定一条规则是否为 required（含容错：非对象 / 无 type 一律不算） */
function isRequiredRule(r: unknown): boolean {
  return !!r && typeof r === 'object' && (r as { type?: unknown }).type === 'required'
}

/**
 * 读取节点是否配置了 required 校验规则（属性面板回填，与写路径严格对称）。
 * 规则载体是 `props.rules`（renderer `resolveNodeRules` 只认它）。
 */
export function readRequiredRule(node: NodeSchema): boolean {
  const raw = node.props?.['rules']
  return Array.isArray(raw) && raw.some(isRequiredRule)
}

/**
 * 设置节点的 required 校验规则（批 5 / D-A12，写 `props.rules`）：
 * - `required = true`  → 已有则 no-op；没有则**追加末尾**（不打乱既有规则顺序）；
 * - `required = false` → **只移除 `type === 'required'` 项，其他规则（pattern/range/…）原样保留**；
 * - 目标态已达成 → no-op；且未配置 rules 时**不建空数组**（避免 schema 出现噪音字段）。
 *
 * 生效前提（renderer `collectRules`）：节点还须绑定 `props.name` —— 属性面板
 * 在未绑定字段时禁用该开关，避免配了却不生效的「假必填」。
 * 返回 `id = nodeId` 成功，节点不存在 `id = ''`。
 */
export function setRequiredRule(schema: PageSchema, nodeId: string, required: boolean): OpResult {
  const next = clone(schema)
  const node = findNode(next, nodeId)
  if (!node) return { schema: next, id: '' }

  const raw = node.props?.['rules']
  const list = Array.isArray(raw) ? (raw as unknown[]) : []
  const has = list.some(isRequiredRule)
  if (has === required) return { schema: next, id: nodeId } // 目标态已达成（含 rules 未配置 + 关闭）

  const rules = required ? [...list, { type: 'required' }] : list.filter((r) => !isRequiredRule(r))
  node.props ??= {}
  node.props['rules'] = rules
  return { schema: next, id: nodeId }
}

/* ------------------------------------------------------------------ */
/* 批 4：复制粘贴（PLANS.md §2 —— 内存剪贴板 + 跨页粘贴）             */
/* ------------------------------------------------------------------ */

/** 节点级深拷贝（剪贴板快照；与内部 clone 同源语义 —— 保留 undefined） */
export function cloneSubtree(node: NodeSchema): NodeSchema {
  return clone(node)
}

/**
 * 递归重映射整棵子树的节点 id（粘贴防重复 id —— validate 的 id 唯一门禁是硬约束）。
 * 结构/props 原样保留，只换 id；返回新树（不改入参）。
 */
export function remapIds(node: NodeSchema): NodeSchema {
  const next = clone(node)
  const walk = (n: NodeSchema): void => {
    n.id = generateNodeId()
    for (const c of n.children ?? []) walk(c)
  }
  walk(next)
  return next
}

/**
 * 粘贴子树（批 4）。定位三规则（PLANS.md §2）：
 * ① 有选中且选中是容器（带 `children` 字段）→ 插其 children 末尾；
 * ② 有选中且是叶子 → 插其**同级之后**；
 * ③ 无选中 / 选中不存在 → root children 末尾。
 * 根 id 经 `remapIds` 重生成；返回新根 id 供粘贴后选中。
 */
export function pasteNode(
  schema: PageSchema,
  clipboard: NodeSchema,
  selectedId?: string,
): OpResult {
  const next = clone(schema)
  const pasted = remapIds(clipboard)

  if (selectedId) {
    const sel = findNode(next, selectedId)
    if (sel) {
      if (Array.isArray(sel.children)) {
        // 规则①：容器（含 root）→ 末尾追加
        ;(sel.children ??= []).push(pasted)
        return { schema: next, id: pasted.id }
      }
      // 规则②：叶子 → 同级之后
      const loc = findParent(next, selectedId)
      if (loc) {
        ;(loc.parent.children ?? []).splice(loc.index + 1, 0, pasted)
        return { schema: next, id: pasted.id }
      }
    }
  }
  // 规则③：兜底 root 末尾
  ;(next.root.children ??= []).push(pasted)
  return { schema: next, id: pasted.id }
}
