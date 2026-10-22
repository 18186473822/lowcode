/**
 * 流程模块类型契约（Phase 3 批 1 / D-P3-1）。
 *
 * - `FlowSchema`（定义）类型来自 `@lc/schema`（协议包）；
 * - 实例 / 任务 / 历史是**运行时数据**，只在服务端落盘与接口响应中出现，故本文件承载。
 */
import type { FlowSchema } from '@lc/schema'

/** 流程任务（一次审批动作的最小单元；同一节点驳回重进会生成新任务）。 */
export interface FlowTask {
  id: string
  nodeId: string
  /** 节点名快照（定义改名后历史任务仍可读） */
  nodeName: string
  assignee: { type: 'role' | 'dept' | 'starter'; value?: string }
  status: 'pending' | 'approved' | 'rejected'
  /** 审批意见 */
  comment?: string
  decidedBy?: string
  decidedAt?: string
  /** 客户端幂等键；同一任务用同一键重放时返回当前实例而不是 400 */
  idempotencyKey?: string
  createdAt: string
}

/** 流程历史条目（Timeline 时间轴数据源）。 */
export interface FlowHistoryEntry {
  nodeId: string
  nodeName: string
  /** start=发起 / approve=同意 / reject=驳回 / skip=条件跳过 / end=结束 / reenter=驳回后重新发起 */
  action: 'start' | 'approve' | 'reject' | 'skip' | 'end' | 'reenter'
  actor: string
  comment?: string
  at: string
}

/** 流程实例（一条记录一次流程生命周期）。 */
export interface FlowInstance {
  id: string
  flowId: string
  modelId: string
  /** 关联的业务记录（记录提交时自动创建） */
  recordId: string
  status: 'running' | 'approved' | 'rejected'
  /** 当前停留节点（approved/rejected 终态时为最后所在节点） */
  currentNodeId: string | null
  /** 发起人（assignee=starter 的判定依据） */
  createdBy: string
  createdAt: string
  updatedAt: string
  /** 实例版本（乐观锁）；旧 JSON 缺失时按 0 处理 */
  revision?: number
  /**
   * 待回写记录的字段（outbox）。实例先落盘，再回写记录；若进程在两步之间退出，
   * 下次读取/审批时继续补偿，避免「审批已通过但业务状态没变」。
   */
  pendingPatch?: Record<string, unknown>
  tasks: FlowTask[]
  history: FlowHistoryEntry[]
}

/** 流程仓储（定义 + 实例两份 JSON；原子写同 FileRbacRepository）。 */
export interface FlowRepository {
  listFlows(): Promise<FlowSchema[]>
  findFlow(flowId: string): Promise<FlowSchema | null>
  saveFlow(flow: FlowSchema): Promise<void>
  deleteFlow(flowId: string): Promise<boolean>
  listInstances(): Promise<FlowInstance[]>
  findInstance(instanceId: string): Promise<FlowInstance | null>
  saveInstance(instance: FlowInstance): Promise<void>
  /**
   * 乐观写实例：仅当当前 revision === expectedRevision 时写入。
   * 返回 false 表示并发审批已推进实例（service 转 409 FLOW_CONFLICT）。
   */
  saveInstanceIfRevision(instance: FlowInstance, expectedRevision: number): Promise<boolean>
}

export const FLOW_REPOSITORY = 'LC:FLOW_REPOSITORY'
