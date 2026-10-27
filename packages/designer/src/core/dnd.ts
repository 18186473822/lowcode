/**
 * dnd.ts —— 拖放共享契约（PLANS.md §1 D-A5）。
 * 物料面板（拖拽源）、画布（接收方）、store（落库方）三方共用的 MIME 与类型。
 */
/** 物料拖入的 dataTransfer MIME（值 = MaterialSchema.name） */
export const LC_MATERIAL_MIME = 'application/x-lc-material'

/**
 * 画布内节点换位的 dataTransfer MIME —— HTML5 DnD 路径保留（drop 侧兼容），
 * 但**主路径已改自研 mouse 手势**（B-25：SVG view 的 HTML5 DnD 会话在实测中不建立）。
 */
export const LC_NODE_MIME = 'application/x-lc-node'

export type DragSource =
  | { kind: 'material'; name: string }
  | { kind: 'node'; id: string }
