/**
 * 运行期解析：RenderNode + scope → ResolvedNode[]。
 *
 * 职责：
 *  1. **loop 展开** —— 把一个节点按数据展开成 N 份，每份注入 `item` / `index` 局部变量
 *  2. **condition 求值** —— 决定节点可见性；父不可见时**不解算子树**（省算力）
 *  3. **props 解析** —— `$expr:` 占位求值
 *  4. **权限判定** —— `perm` 无权限时整节点不可见（而非仅 disabled）
 *  5. **校验错误挂载** —— 把字段错误贴到对应节点
 *
 * 设计取舍：本函数是**全量纯函数**（每次 formData 变更整体重算），配合表达式
 * AST 缓存成本可控；字段级增量重算属于后续优化，见 PROGRESS.md 已知限制。
 */
import { evalExpr, safeEval, type Scope } from '@lc/expression'
import type { RenderNode, ResolvedNode } from './types.js'
import { resolveProps, extractExpr } from './linkage.js'

export interface ResolveOptions {
  /** 根作用域 */
  scope: Scope
  /** 字段校验错误：nodeId → message */
  errors?: ReadonlyMap<string, string>
  /** 权限判定；未提供时视为全部有权限 */
  hasPerm?: (perm: string) => boolean
  /** loop 单节点最大展开数（防御脏数据导致 OOM），默认 500 */
  maxLoopItems?: number
  /** condition / 表达式出错回调（埋点） */
  onExprError?: (info: { nodeId: string; expr: string; error: unknown }) => void
  /** loop 展开数超限回调 */
  onLoopOverflow?: (info: { nodeId: string; limit: number; actual: number }) => void
}

const DEFAULT_LOOP_LIMIT = 500

/** 解析整棵渲染树（根节点不参与 loop） */
export function resolveTree(root: RenderNode, opts: ResolveOptions): ResolvedNode[] {
  const list = resolveNode(root, true, opts.scope, opts, true)
  return list
}

function resolveNode(
  node: RenderNode,
  parentVisible: boolean,
  scope: Scope,
  opts: ResolveOptions,
  isRoot = false,
): ResolvedNode[] {
  // 父已不可见 → 不再解析子树
  if (!parentVisible) return []

  const instances = expandLoop(node, scope, opts, isRoot)

  return instances.map(({ instanceScope, item, index }) => {
    // ① 权限
    let visible = true
    if (node.perm && opts.hasPerm && !opts.hasPerm(node.perm)) visible = false

    // ② condition
    let exprError = false
    if (visible && typeof node.condition === 'string' && node.condition.trim()) {
      const r = evalCondition(node.condition, instanceScope, node.id, opts)
      visible = r.value
      exprError = r.error
    } else if (visible && node.condition === false) {
      visible = false
    }

    // ③ props 解析（即便不可见也解析，便于设计态预览）
    const props = resolveProps(node.props, instanceScope, ({ expr, error }) => {
      exprError = true
      opts.onExprError?.({ nodeId: node.id, expr, error })
    })

    const children: ResolvedNode[] = []
    if (visible) {
      for (const child of node.children) {
        children.push(...resolveNode(child, true, instanceScope, opts))
      }
    }

    return {
      node,
      props,
      visible,
      exprError,
      error: opts.errors?.get(node.id),
      item,
      index,
      children,
    }
  })
}

/* ------------------------------------------------------------------ */
/* loop 展开                                                           */
/* ------------------------------------------------------------------ */

interface Instance {
  instanceScope: Scope
  item?: unknown
  index?: number
}

function expandLoop(
  node: RenderNode,
  scope: Scope,
  opts: ResolveOptions,
  isRoot: boolean,
): Instance[] {
  if (!node.loop || isRoot) return [{ instanceScope: scope }]

  const expr = extractExpr(node.loop) ?? node.loop
  const list = safeEval(expr, scope, undefined)
  if (!Array.isArray(list)) return [{ instanceScope: scope }]

  const limit = opts.maxLoopItems ?? DEFAULT_LOOP_LIMIT
  if (list.length > limit) {
    opts.onLoopOverflow?.({ nodeId: node.id, limit, actual: list.length })
  }

  const [itemName, indexName] = node.loopArgs ?? ['item', 'index']
  const items = list.slice(0, limit)
  return items.map((item, index) => ({
    instanceScope: Object.assign(Object.create(null), scope, {
      [itemName]: item,
      [indexName]: index,
    }) as Scope,
    item,
    index,
  }))
}

/* ------------------------------------------------------------------ */
/* 表达式求值                                                          */
/* ------------------------------------------------------------------ */

function evalCondition(
  condition: string,
  scope: Scope,
  nodeId: string,
  opts: ResolveOptions,
): { value: boolean; error: boolean } {
  try {
    // 默认可见：表达式写错时宁可多显示，也不能让整块内容凭空消失
    const v = evalExpr(condition, scope)
    return { value: !!v, error: false }
  } catch (error) {
    opts.onExprError?.({ nodeId, expr: condition, error })
    return { value: true, error: true }
  }
}

/* ------------------------------------------------------------------ */
/* 工具：扁平化（用于校验定位 / 性能剖析 / 大纲树）                        */
/* ------------------------------------------------------------------ */

export function flatten(nodes: ResolvedNode[], includeHidden = false): ResolvedNode[] {
  const out: ResolvedNode[] = []
  const walk = (list: ResolvedNode[]): void => {
    for (const n of list) {
      if (n.visible || includeHidden) out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** 找到第一个校验错误节点（供提交失败自动滚动定位） */
export function findFirstErrorNode(
  nodes: ResolvedNode[],
  errors: ReadonlyMap<string, string>,
): ResolvedNode | null {
  for (const n of flatten(nodes, true)) {
    if (errors.has(n.node.id)) return n
  }
  return null
}
