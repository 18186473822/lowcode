/**
 * 审批类物料共享工具（Phase 3 批 2，D-P3-4）。
 *
 * - 类型 = 服务端 `apps/server/src/flow/flow.types.ts` 的结构化子集（接口响应直用）；
 * - `fetchFlowInstance`：`GET /flows/instances?recordId=` 取该记录的流程实例，
 *   flowId 指定则精确匹配，缺省 running 优先、其次最新（接口新实例在前）；
 * - ACTION_LABEL / fmtTime：两物料共用的展示语义（事实源 = flow.types 注释）。
 */
import type { LcFlowHost } from './keys'

export interface FlowTaskLike {
  id: string
  nodeId: string
  nodeName: string
  assignee: { type: string; value?: string }
  status: 'pending' | 'approved' | 'rejected'
  comment?: string
  decidedBy?: string
  decidedAt?: string
  createdAt: string
}

export interface FlowHistoryEntryLike {
  nodeId: string
  nodeName: string
  action: 'start' | 'approve' | 'reject' | 'skip' | 'end' | 'reenter'
  actor: string
  comment?: string
  at: string
}

export interface FlowInstanceLike {
  id: string
  flowId: string
  modelId: string
  recordId: string
  status: 'running' | 'approved' | 'rejected'
  currentNodeId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  tasks: FlowTaskLike[]
  history: FlowHistoryEntryLike[]
}

/** history.action → 中文（事实源：服务端 FlowHistoryEntry 注释） */
export const ACTION_LABEL: Record<string, string> = {
  start: '提交',
  approve: '同意',
  reject: '驳回',
  skip: '条件跳过',
  end: '完成',
  reenter: '重新提交',
}

/** action → 时间轴圆点色调（ok 绿 / no 红 / warn 橙） */
export const ACTION_TONE: Record<string, 'ok' | 'no' | 'warn'> = {
  start: 'ok',
  approve: 'ok',
  end: 'ok',
  reject: 'no',
  skip: 'warn',
  reenter: 'warn',
}

export interface FlowQuery {
  /** 当前记录主键（由 `$expr: urlParams.rid` 等绑定求值传入；空 = 不请求，画布安全占位） */
  recordId?: string
  modelId?: string
  flowId?: string
}

/** 取该记录的流程实例（无实例/失败均返回 null —— 物料按「暂无审批流」空态渲染，不白屏） */
export async function fetchFlowInstance(
  host: LcFlowHost | undefined,
  q: FlowQuery,
): Promise<FlowInstanceLike | null> {
  if (!host || !q.recordId) return null
  const usp = new URLSearchParams()
  usp.set('recordId', q.recordId)
  if (q.modelId) usp.set('modelId', q.modelId)
  const res = await host.request({ method: 'GET', url: `/api/v1/flows/instances?${usp.toString()}` })
  if (res.statusCode !== 200 || !res.data) return null
  const items = ((res.data as { items?: unknown }).items ?? []) as FlowInstanceLike[]
  if (q.flowId) return items.find((i) => i.flowId === q.flowId) ?? null
  return items.find((i) => i.status === 'running') ?? items[0] ?? null
}

/** ISO 时间 → `MM-DD HH:mm` 展示（跨年补年份；非法值给 —） */
export function fmtTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number): string => String(n).padStart(2, '0')
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const y = sameYear ? '' : `${d.getFullYear()}-`
  return `${y}${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 终态中文 */
export function statusLabel(status: string): string {
  if (status === 'approved') return '审批已通过'
  if (status === 'rejected') return '审批已驳回'
  return '审批进行中'
}
