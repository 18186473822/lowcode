/**
 * Schema 加载 / 渲染耗时采样（Phase 3 批 5，D-P3-14）。
 *
 * 纯展示层工具：runtime 的 `?perf=1` 角标与设计器顶栏徽标共用同一 `formatPerf`，
 * 保证两端看到的数字口径一致（字段含义见 `PerfSample`）。
 */

export interface PerfSample {
  /** Schema 请求耗时（网络 + 服务端处理） */
  schemaMs?: number
  /** PageController 构造耗时（buildTree + 联动收集 + 规则收集） */
  buildMs?: number
  /** onMount 耗时（生命周期钩子 + 初始数据源 + 草稿恢复） */
  mountMs?: number
  /** 最近一次 resolve（表达式求值 + 条件/循环展开）耗时 */
  resolveMs?: number
  /** 首帧渲染耗时（宿主侧：schema 就绪 → nextTick） */
  renderMs?: number
  /** 渲染树节点数（loop 前） */
  nodes?: number
}

/** 毫秒取整（负数/NaN 归 0，避免 UI 出现 `NaNms`） */
export function roundMs(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0
  return Math.round(v)
}

/**
 * 一行式性能摘要，例：`加载 123ms · 渲染 45ms · 33 节点`
 * 缺项自动省略；全空返回空串（调用方据此隐藏徽标）。
 */
export function formatPerf(sample: PerfSample): string {
  const parts: string[] = []
  if (sample.schemaMs !== undefined) parts.push(`加载 ${roundMs(sample.schemaMs)}ms`)
  if (sample.buildMs !== undefined) parts.push(`构建 ${roundMs(sample.buildMs)}ms`)
  if (sample.renderMs !== undefined) parts.push(`渲染 ${roundMs(sample.renderMs)}ms`)
  if (sample.mountMs !== undefined) parts.push(`挂载 ${roundMs(sample.mountMs)}ms`)
  if (sample.nodes !== undefined) parts.push(`${sample.nodes} 节点`)
  return parts.join(' · ')
}

/** 递归统计节点数（NodeSchema / RenderNode 均适用；非对象子项忽略） */
export function countNodes(node: unknown): number {
  if (!node || typeof node !== 'object') return 0
  const children = (node as { children?: unknown }).children
  let total = 1
  if (Array.isArray(children)) {
    for (const child of children) total += countNodes(child)
  }
  return total
}
