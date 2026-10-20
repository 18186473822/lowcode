/**
 * 联动引擎：依赖收集 + 脏检查。
 *
 * 依赖粒度（见 docs/PROGRESS.md「已知限制」）：**根变量级**。
 * `refs()` 返回表达式引用的顶层变量名（`formData.amount > 100` → ['formData']），
 * 因此变更 `formData` 下任意字段都会重算依赖 `formData` 的所有节点。
 * 字段级精确依赖（`formData.amount`）属于后续优化项。
 *
 * 好处：实现简单且**必然正确**（宁可多算，不可漏算）；坏处是大表单联动重算偏多。
 */
import { refs, evalExpr, type Scope } from '@lc/expression'
import type { PageSchema, NodeSchema, Action } from '@lc/schema'

export interface LinkageDependency {
  /** 被依赖的根变量名（formData / user / ds / urlParams …） */
  root: string
  /** 依赖该根变量的节点 id 集合 */
  nodeIds: Set<string>
}

export class Linkage {
  /** root → 受影响节点 */
  private readonly dep = new Map<string, Set<string>>()
  /** nodeId → 该节点依赖的根变量集合（便于增量更新） */
  private readonly nodeRoots = new Map<string, Set<string>>()

  /** 从页面 Schema 收集全部依赖（condition / loop / 表达式型 props 与 action / 生命周期） */
  collect(page: PageSchema): void {
    this.dep.clear()
    this.nodeRoots.clear()

    if (page.lifecycle) {
      for (const hook of Object.values(page.lifecycle)) {
        // 钩子体可能是单表达式或按序执行的表达式数组
        for (const expr of Array.isArray(hook) ? hook : [hook]) {
          if (expr) this.addRoots(expr, '__lifecycle__')
        }
      }
    }

    const walk = (node: NodeSchema): void => {
      if (typeof node.condition === 'string') this.addRoots(node.condition, node.id)
      if (node.loop) this.addRoots(extractExpr(node.loop) ?? node.loop, node.id)

      for (const value of Object.values(node.props ?? {})) {
        const expr = extractExpr(value)
        if (expr) this.addRoots(expr, node.id)
      }

      for (const action of node.actions ?? []) {
        for (const expr of actionExprs(action)) this.addRoots(expr, node.id)
      }

      node.children?.forEach(walk)
    }

    if (page.root) walk(page.root)
  }

  private addRoots(expr: string, nodeId: string): void {
    let roots: string[]
    try {
      roots = refs(expr)
    } catch {
      return // 语法错误交给校验器报告，联动不中断
    }
    for (const root of roots) {
      let set = this.dep.get(root)
      if (!set) {
        set = new Set()
        this.dep.set(root, set)
      }
      set.add(nodeId)

      let nr = this.nodeRoots.get(nodeId)
      if (!nr) {
        nr = new Set()
        this.nodeRoots.set(nodeId, nr)
      }
      nr.add(root)
    }
  }

  /** 受影响的节点 id 集合（传入变更的根变量名） */
  dirtyNodes(root: string): Set<string> {
    return new Set(this.dep.get(root) ?? [])
  }

  /** 某节点依赖的根变量 */
  rootsOf(nodeId: string): Set<string> {
    return new Set(this.nodeRoots.get(nodeId) ?? [])
  }

  /** 依赖总览（调试与设计器「依赖关系」面板用） */
  snapshot(): LinkageDependency[] {
    return [...this.dep.entries()].map(([root, nodeIds]) => ({ root, nodeIds }))
  }
}

/** 从 props 值中提取 `$expr:` 前缀表达式 */
export function extractExpr(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('$expr:')) {
    const body = value.slice('$expr:'.length).trim()
    return body || null
  }
  return null
}

/**
 * 解析 props 中的表达式占位，返回解析后的 props（未含表达式的保持原值）。
 * 求值抛错时该字段置 `undefined` 并回调 onError —— **绝不因单个表达式写错而中断渲染**。
 */
export function resolveProps(
  props: Record<string, unknown>,
  scope: Scope,
  onError?: (info: { key: string; expr: string; error: unknown }) => void,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    const expr = extractExpr(v)
    if (!expr) {
      out[k] = v
      continue
    }
    try {
      out[k] = evalExpr(expr, scope)
    } catch (error) {
      onError?.({ key: k, expr, error })
      out[k] = undefined
    }
  }
  return out
}

/** 收集一个 action 中所有可含表达式的字符串 */
function actionExprs(action: Action): string[] {
  const out: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (action.type === 'expression' && v) out.push(v)
      else if (v.startsWith('$expr:')) out.push(v.slice('$expr:'.length))
    } else if (v && typeof v === 'object') {
      for (const val of Object.values(v as Record<string, unknown>)) walk(val)
    }
  }
  walk(action.value)
  return out
}
