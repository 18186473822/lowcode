/**
 * 流程（审批）协议 —— 主方案 8.6 轻量状态机（Phase 3 批 1 / D-P3-1）。
 *
 * 首期不做 BPMN：线性节点链（start → approve* → end）+ 可选条件跳过，
 * 覆盖 80% 申请-审批场景；二期若接 Flowable/Camunda，协议保持不变。
 */

/** 流程节点类型。 */
export type FlowNodeType = 'start' | 'approve' | 'end'

/**
 * 审批人解析。首期支持 `starter`（发起人）与 `role`（角色命中，`'*'` 超级权限豁免）；
 * `dept` 协议保留 —— 运行时因无组织服务降级为不可命中并告警（与批 6 dataScope dept 降级同口径）。
 */
export interface FlowAssignee {
  type: 'role' | 'dept' | 'starter'
  /** type=role 时角色 key；type=dept 时组织标识（首期不解析） */
  value?: string
}

/** 流程节点（顺序即 nodes 数组顺序）。 */
export interface FlowNode {
  id: string
  /** 节点名（待办 / 时间轴展示文案） */
  name: string
  type: FlowNodeType
  /** type=approve 必填：谁来审批 */
  assignee?: FlowAssignee
  /**
   * 进入本节点前求值（scope：`formData` = 记录 payload）；
   * mode='condition' 且求值为假 → **跳过本节点**（不是拒绝）。linear 模式忽略此字段。
   */
  condition?: string
  /** 驳回动作指向的节点 id（缺省 = 驳回即流程 rejected 终态）；指向 start 表示退回重新发起 */
  onReject?: string
  /** approve/end 节点同意后的业务动作：把字段写回记录 payload（服务端内部写，不经表单 sanitize） */
  onApprove?: { setField?: Record<string, unknown> }
}

/**
 * 流程定义（主方案 8.6 原文形状 + name 补充）。
 * 通过 `modelId` 绑定数据模型：该模型记录**提交时自动启动**流程实例。
 */
export interface FlowSchema {
  flowId: string
  /** 展示名（待办列表 / 时间轴用） */
  name: string
  /** 绑定的数据模型 id */
  modelId: string
  /**
   * 发起流程的表单页 id（2026-10-29）：门户「常用流程」据此列出发得起的流程并跳转。
   * 缺省 = 该流程不能从门户发起（仍可由页面 submit 动作的 flow.start 启动）。
   */
  startPageId?: string
  /** linear：全序推进（condition 忽略）；condition：按节点 condition 求值跳过 */
  mode: 'linear' | 'condition'
  /** 首节点必须 start、末节点必须 end、approve ≥ 1 */
  nodes: FlowNode[]
}
