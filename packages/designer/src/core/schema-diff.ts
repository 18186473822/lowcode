/**
 * schema-diff.ts —— 版本结构化 diff（Phase 2 批 5，PLANS.md §2 / 决策 D-P2-9）。
 *
 * 纯函数 `diffSchema(before, after)`：before = 历史版本 vN、after = 当前画布（内存 schema）。
 * 对齐键 = 节点 id（设计态 id 稳定）；**零依赖自研**，不引 JSON diff 库。
 *
 * 输出顺序约定（测试锁定）：`remove`（before 遍历序）→ `add`（after 遍历序）→
 * `change`（before 遍历序）→ `move`（before 遍历序）。
 *
 * 条目语义：
 * - `add` / `remove` —— 节点仅一侧存在；**子树只报顶层**（父已报则整支不再深入，防噪音）；
 * - `change` —— componentName 变化，或 props 键并集逐键比较（值 JSON 序列化后比，
 *   展示截断 80 字符；一侧缺失的键显示「（无）」）；
 * - `move`   —— 同 id 节点的 parentId / 同级 index 变化（root 恒在原位，无 move）。
 *
 * 粒度说明：对象值（如 `style`）整体 JSON 比较不逐键展开 —— 版本 diff 关心语义变化。
 */
import type { PageSchema, NodeSchema } from '@lc/schema'

export type DiffEntry =
  | { kind: 'add'; id: string; componentName: string; parentId: string }
  | { kind: 'remove'; id: string; componentName: string; parentId: string }
  | {
      kind: 'change'
      id: string
      componentName: string
      field: string
      before: string
      after: string
    }
  | { kind: 'move'; id: string; componentName: string; before: string; after: string }

interface FlatNode {
  node: NodeSchema
  parentId: string
  index: number
}

/** 扁平化整棵树：id → {node, parentId, 同级 index}（root 的 parentId 为空串） */
function flatten(root: NodeSchema): Map<string, FlatNode> {
  const out = new Map<string, FlatNode>()
  const walk = (n: NodeSchema, parentId: string, index: number): void => {
    out.set(n.id, { node: n, parentId, index })
    const kids = n.children ?? []
    for (let i = 0; i < kids.length; i++) walk(kids[i]!, n.id, i)
  }
  walk(root, '', 0)
  return out
}

/** 值 → 可展示/可比较的字符串（JSON 序列化 + 80 字符截断；undefined = 键缺失） */
function fmt(v: unknown): string {
  if (v === undefined) return '（无）'
  let s: string
  try {
    s = JSON.stringify(v) ?? String(v)
  } catch {
    s = String(v)
  }
  return s.length > 80 ? `${s.slice(0, 78)}…` : s
}

/**
 * 结构化 diff：`before`（历史版）相对 `after`（当前画布）的差异条目。
 * 两侧同引用/深相等 → 空数组。
 */
export function diffSchema(before: PageSchema, after: PageSchema): DiffEntry[] {
  const entries: DiffEntry[] = []
  const beforeFlat = flatten(before.root)
  const afterFlat = flatten(after.root)

  /* 1) remove：深度优先走 before 树 —— 节点缺失则报顶层并停止深入（子树并入本条） */
  const walkRemoved = (n: NodeSchema): void => {
    if (n.id !== before.root.id && !afterFlat.has(n.id)) {
      entries.push({
        kind: 'remove',
        id: n.id,
        componentName: n.componentName,
        parentId: beforeFlat.get(n.id)?.parentId ?? before.root.id,
      })
      return // 子树不再逐个报
    }
    for (const c of n.children ?? []) walkRemoved(c)
  }
  walkRemoved(before.root)

  /* 2) add：对称走 after 树 */
  const walkAdded = (n: NodeSchema): void => {
    if (n.id !== after.root.id && !beforeFlat.has(n.id)) {
      entries.push({
        kind: 'add',
        id: n.id,
        componentName: n.componentName,
        parentId: afterFlat.get(n.id)?.parentId ?? after.root.id,
      })
      return
    }
    for (const c of n.children ?? []) walkAdded(c)
  }
  walkAdded(after.root)

  /* 3) change + move：两侧都有的节点，按 before 遍历序逐个比 */
  for (const [id, b] of beforeFlat) {
    const a = afterFlat.get(id)
    if (!a) continue // 缺失方已在 remove 报过

    if (a.node.componentName !== b.node.componentName) {
      entries.push({
        kind: 'change',
        id,
        componentName: a.node.componentName,
        field: 'componentName',
        before: b.node.componentName,
        after: a.node.componentName,
      })
    }

    const bp = b.node.props ?? {}
    const ap = a.node.props ?? {}
    const keys = [...new Set([...Object.keys(bp), ...Object.keys(ap)])]
    for (const k of keys) {
      const bv = fmt(bp[k])
      const av = fmt(ap[k])
      if (bv !== av) {
        entries.push({
          kind: 'change',
          id,
          componentName: a.node.componentName,
          field: `props.${k}`,
          before: bv,
          after: av,
        })
      }
    }

    if (id !== before.root.id && (a.parentId !== b.parentId || a.index !== b.index)) {
      entries.push({
        kind: 'move',
        id,
        componentName: a.node.componentName,
        before: `${b.parentId}@${b.index}`,
        after: `${a.parentId}@${a.index}`,
      })
    }
  }

  return entries
}
