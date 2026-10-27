/**
 * anchor.ts —— 拖拽锚点计算纯函数（PLANS.md §1 D-A5，设计器批 2）
 *
 * 输入 = 鼠标坐标 + 画布可见节点的 DOMRect 列表（几何事实），输出 = 插入提示
 * （目标节点 + before/after/into 三态）。**不依赖 schema**（index 由 drop 处理器
 * 基于 schema 计算）—— 保持纯几何，便于穷举单测。
 *
 * 三态规则（方案 4.5）：
 * - 容器：上 25% 带 → before，下 25% 带 → after，中间 50% → into（插到末尾；
 *   想插容器中间时鼠标会先命中更小的子节点 rect，自然产生子节点的 before/after）；
 * - 非容器：按中线上下 → before / after；
 * - 都没命中（画布空白/padding 区）→ fallback root 的 into。
 */

export interface AnchorRect {
  nodeId: string
  /** 视口坐标系的矩形子集（可序列化，便于单测直接构造） */
  rect: { top: number; left: number; width: number; height: number }
  /** 是否容器（Page/FormGroup/任何 isContainer 节点） */
  isContainer: boolean
}

export type DropPosition = 'before' | 'after' | 'into'

export interface AnchorHit {
  nodeId: string
  position: DropPosition
}

/** 相对纵向位置系数（0=顶边 1=底边） */
function relY(y: number, r: AnchorRect['rect']): number {
  if (r.height <= 0) return 0.5
  return (y - r.top) / r.height
}

function contains(r: AnchorRect['rect'], x: number, y: number): boolean {
  return x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height
}

/**
 * 计算锚点。命中多层嵌套 rect 时取**面积最小**者（最深节点）；
 * 无命中时 fallback `{ nodeId: rootId, position: 'into' }`。
 */
export function computeAnchor(
  point: { x: number; y: number },
  rects: AnchorRect[],
  opts: { rootId?: string } = {},
): AnchorHit {
  // 过滤命中的 rect，取面积最小（最内层）
  let best: AnchorRect | null = null
  let bestArea = Number.POSITIVE_INFINITY
  for (const item of rects) {
    if (!contains(item.rect, point.x, point.y)) continue
    const area = Math.max(item.rect.width, 0) * Math.max(item.rect.height, 0)
    if (area < bestArea) {
      best = item
      bestArea = area
    }
  }

  if (!best) {
    return { nodeId: opts.rootId ?? '', position: 'into' }
  }

  const y = relY(point.y, best.rect)
  if (best.isContainer) {
    if (y < 0.25) return { nodeId: best.nodeId, position: 'before' }
    if (y > 0.75) return { nodeId: best.nodeId, position: 'after' }
    return { nodeId: best.nodeId, position: 'into' }
  }
  return { nodeId: best.nodeId, position: y <= 0.5 ? 'before' : 'after' }
}

/**
 * 锚点 → 插入坐标（parentId / index）。drop 处理器用（需要 schema 结构信息）。
 * 与 schema-ops 的 insertNode/moveNode 参数约定对齐。
 */
export function resolveAnchorTarget(
  schema: { root: { id: string } },
  hit: AnchorHit,
  helpers: {
    childrenOf: (nodeId: string) => unknown[]
    locate: (nodeId: string) => { parentId: string; index: number } | null
  },
): { parentId: string; index: number } {
  if (hit.position === 'into') {
    return { parentId: hit.nodeId, index: helpers.childrenOf(hit.nodeId).length }
  }
  const loc = helpers.locate(hit.nodeId)
  if (!loc) return { parentId: schema.root.id, index: helpers.childrenOf(schema.root.id).length }
  return { parentId: loc.parentId, index: hit.position === 'before' ? loc.index : loc.index + 1 }
}
