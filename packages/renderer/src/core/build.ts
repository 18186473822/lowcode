/**
 * 渲染树归一化：PageSchema.root → RenderNode。
 *
 * 只做**静态**处理（一次性），loop 展开与 condition 求值放到运行期 `resolve.ts`：
 *  - 补齐 id / componentName 默认结构
 *  - 深拷贝 props，避免污染 Schema 原件（Schema 可能被设计器共享）
 *  - 防御性跳过非法节点（缺 componentName），不因个别脏数据白屏
 */
import type { NodeSchema } from '@lc/schema'
import type { RenderNode } from './types.js'

export interface BuildResult {
  root: RenderNode
  /** 被跳过的非法节点，供埋点与设计器标红 */
  skipped: Array<{ path: string; reason: string }>
}

/** 归一化整棵树（忽略跳过项） */
export function buildTree(root: NodeSchema): RenderNode {
  return buildTreeWithReport(root).root
}

/** 归一化整棵树并返回被跳过的非法节点清单 */
export function buildTreeWithReport(root: NodeSchema): BuildResult {
  const skipped: BuildResult['skipped'] = []
  const built = buildNode(root, 'root', skipped)
  if (!built) {
    throw new Error('根节点非法：缺少 id 或 componentName')
  }
  return { root: built, skipped }
}

function buildNode(schema: NodeSchema, path: string, skipped: BuildResult['skipped']): RenderNode | null {
  if (!schema || typeof schema !== 'object') {
    skipped.push({ path, reason: '节点不是对象' })
    return null
  }
  if (!schema.id) {
    skipped.push({ path, reason: '缺少 id' })
    return null
  }
  if (!schema.componentName) {
    skipped.push({ path: `${path}(${schema.id})`, reason: '缺少 componentName' })
    return null
  }

  const children: RenderNode[] = []
  schema.children?.forEach((child, i) => {
    const built = buildNode(child, `${path}.children[${i}]`, skipped)
    if (built) children.push(built)
  })

  return {
    id: schema.id,
    componentName: schema.componentName,
    props: deepClone(schema.props ?? {}),
    style: schema.style ? { ...schema.style } : undefined,
    condition: schema.condition,
    loop: schema.loop,
    loopArgs: schema.loopArgs,
    actions: schema.actions ? schema.actions.map((a) => ({ ...a })) : undefined,
    perm: schema.perm,
    children,
  }
}

function deepClone<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(v)
    } catch {
      /* 含不可克隆值时降级 */
    }
  }
  if (v && typeof v === 'object') return JSON.parse(JSON.stringify(v)) as T
  return v
}
