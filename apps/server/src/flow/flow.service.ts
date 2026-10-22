/**
 * 流程服务 —— 轻量状态机（Phase 3 批 1，主方案 8.6 / D-P3-1）。
 *
 * 职责：
 *  1. 流程定义 CRUD（`validateFlow` + `checkExpr` 语法检查，非法定义 400 拒存）；
 *  2. **记录提交联动** `onRecordCreated`：按 `modelId` 匹配定义、创建实例并推进到首个审批节点
 *     （弱保证：流程启动失败只记日志、不影响记录提交 —— 记录是业务真相）；
 *  3. 审批动作 `decide`（同意推进 / 驳回回退或终止）+ **`onApprove.setField` 回写记录**
 *     （服务端内部写，不经表单 sanitize —— 8.6 `status: approved` 语义）；
 *  4. 待办任务列表（assignee 命中：starter=发起人、role=角色命中、`'*'` 超级豁免；dept 降级不可命中）；
 *  5. 实例查询（Timeline 时间轴数据源）。
 *
 * 推进语义：
 *  - `start` → 自动通过（history 记 start/reenter）；
 *  - `approve` → mode=condition 且 condition 求值为假 → **跳过**（history skip；求值异常按 true 走审批，fail-open 防漏审）；
 *                否则创建 pending 任务并**停下等审批**；
 *  - `end` → 流程 `approved` + 应用 `onApprove.setField`；
 *  - `reject` → 节点配置 `onReject` 则回退到目标节点（start 目标 = 重新发起），缺省 = 流程 `rejected` 终态。
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { FlowSchema, FlowNode } from '@lc/schema'
import { validateFlow } from '@lc/schema'
import { checkExpr, evalExpr } from '@lc/expression'
import type { AuthUser } from '../common/jwt.service.js'
import { KeyedLock } from '../common/keyed-lock.js'
import { RbacService } from '../rbac/rbac.service.js'
import { WebhookService } from '../webhook/webhook.service.js'
import { RECORD_REPOSITORY } from '../model/model.types.js'
import type { RecordRepository } from '../model/model.types.js'
import { FLOW_REPOSITORY } from './flow.types.js'
import type { FlowInstance, FlowRepository, FlowTask } from './flow.types.js'

/** 待办任务条目（`GET /flows/tasks/todo` 响应项）。 */
export interface TodoTask {
  taskId: string
  instanceId: string
  flowId: string
  flowName: string
  modelId: string
  recordId: string
  nodeName: string
  /** 发起人（展示「张三 的申请」） */
  createdBy: string
  createdAt: string
}

const nowIso = (): string => new Date().toISOString()

@Injectable()
export class FlowService {
  /** 同一实例的审批在单进程内串行；跨实例互不影响 */
  private readonly decideLock = new KeyedLock()

  constructor(
    @Inject(FLOW_REPOSITORY) private readonly repo: FlowRepository,
    @Inject(RECORD_REPOSITORY) private readonly records: RecordRepository,
    // 显式 @Inject：vitest/esbuild 不 emit decorator metadata，裸类型注入在测试容器中为 undefined
    @Inject(RbacService) private readonly rbac: RbacService,
    @Inject(WebhookService) private readonly webhooks: WebhookService,
  ) {}

  /* ---------------------------------------------------------------- */
  /* 定义 CRUD                                                         */
  /* ---------------------------------------------------------------- */

  async listFlows(): Promise<FlowSchema[]> {
    return this.repo.listFlows()
  }

  async getFlow(flowId: string): Promise<FlowSchema> {
    const flow = await this.repo.findFlow(flowId)
    if (!flow) throw new NotFoundException({ code: 'FLOW_NOT_FOUND', message: `流程不存在：${flowId}` })
    return flow
  }

  /** upsert（路径 flowId 与 body.flowId 必须一致）；校验不过 400 `INVALID_FLOW`。 */
  async upsertFlow(flowId: string, body: unknown): Promise<FlowSchema> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: '请求体必须是流程定义对象' })
    }
    const flow = body as FlowSchema
    if (flow.flowId !== flowId) {
      throw new BadRequestException({ code: 'INVALID_FLOW', message: '路径 flowId 与 body.flowId 不一致' })
    }
    const result = validateFlow(flow, { checkExpr })
    if (!result.valid) {
      throw new BadRequestException({
        code: 'INVALID_FLOW',
        message: '流程定义校验失败',
        issues: result.errors,
        warnings: result.warnings,
      })
    }
    await this.repo.saveFlow(flow)
    return flow
  }

  async deleteFlow(flowId: string): Promise<void> {
    const ok = await this.repo.deleteFlow(flowId)
    if (!ok) throw new NotFoundException({ code: 'FLOW_NOT_FOUND', message: `流程不存在：${flowId}` })
  }

  /* ---------------------------------------------------------------- */
  /* 记录提交联动（RecordService.create 调用；弱保证 —— 失败不影响提交） */
  /* ---------------------------------------------------------------- */

  async onRecordCreated(modelId: string, recordId: string, payload: Record<string, unknown>, user: AuthUser): Promise<void> {
    try {
      const flows = (await this.repo.listFlows()).filter((f) => f.modelId === modelId)
      for (const flow of flows) {
        const instance: FlowInstance = {
          id: randomUUID(),
          flowId: flow.flowId,
          modelId,
          recordId,
          status: 'running',
          currentNodeId: null,
          createdBy: user.username,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          revision: 0,
          tasks: [],
          history: [],
        }
        // start → 首个 approve（或直达 end 的极端定义）
        this.advanceFrom(instance, flow, payload, 0, user.username, 'start')
        await this.repo.saveInstance(instance)
        await this.webhooks.emit('flow.started', user.username, {
          instanceId: instance.id,
          flowId: instance.flowId,
          modelId: instance.modelId,
          recordId: instance.recordId,
          status: instance.status,
          revision: instance.revision ?? 0,
        })
        if (instance.status === 'approved') {
          await this.webhooks.emit('flow.completed', user.username, {
            instanceId: instance.id,
            flowId: instance.flowId,
            modelId: instance.modelId,
            recordId: instance.recordId,
            status: instance.status,
            revision: instance.revision ?? 0,
          })
        }
      }
    } catch (error) {
      // 弱保证：记录已是业务真相，流程启动失败只记日志（首期口径，注释见文件头）
      console.error('[flow] onRecordCreated 失败（记录提交不受影响）', error)
    }
  }

  /* ---------------------------------------------------------------- */
  /* 实例 / 待办查询                                                    */
  /* ---------------------------------------------------------------- */

  /** 实例查询（Timeline 数据源）：`recordId` 或 `modelId` 过滤，缺省全量（内部数据量小）。 */
  async listInstances(query: { recordId?: string; modelId?: string }): Promise<FlowInstance[]> {
    let items = await this.repo.listInstances()
    if (query.recordId) items = items.filter((i) => i.recordId === query.recordId)
    if (query.modelId) items = items.filter((i) => i.modelId === query.modelId)
    // 新实例在前（待办与时间轴都偏好最近）
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    // 读取即补偿：上次进程在「实例已落盘、记录未回写」之间退出时，这里把 outbox 收尾。
    const out: FlowInstance[] = []
    for (const inst of items) out.push(inst.pendingPatch ? await this.flushPendingPatch(inst) : inst)
    return out
  }

  /** 单实例查询（批 2：待办详情页 / 审批物料按 instanceId 取完整上下文）。 */
  async getInstance(instanceId: string): Promise<FlowInstance> {
    const inst = await this.repo.findInstance(instanceId)
    if (!inst) throw new NotFoundException({ code: 'FLOW_INSTANCE_NOT_FOUND', message: '流程实例不存在' })
    return inst.pendingPatch ? this.flushPendingPatch(inst) : inst
  }

  /** 当前用户待办（status=running 实例中、当前节点 pending 且 assignee 命中的任务）。 */
  async todoTasks(user: AuthUser): Promise<TodoTask[]> {
    const [instances, flows] = await Promise.all([this.repo.listInstances(), this.repo.listFlows()])
    const flowNames = new Map(flows.map((f) => [f.flowId, f.name]))
    const out: TodoTask[] = []
    for (const inst of instances) {
      if (inst.status !== 'running' || !inst.currentNodeId) continue
      const task = inst.tasks.find((t) => t.status === 'pending' && t.nodeId === inst.currentNodeId)
      if (!task) continue
      if (!(await this.canDecide(task, inst, user))) continue
      out.push({
        taskId: task.id,
        instanceId: inst.id,
        flowId: inst.flowId,
        flowName: flowNames.get(inst.flowId) ?? inst.flowId,
        modelId: inst.modelId,
        recordId: inst.recordId,
        nodeName: task.nodeName,
        createdBy: inst.createdBy,
        createdAt: task.createdAt,
      })
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  /* ---------------------------------------------------------------- */
  /* 审批动作                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * 同意 / 驳回（并发安全）：
   *
   * 1. 同一实例在本进程内串行（KeyedLock）；
   * 2. 实例带 revision，保存走 CAS；多实例同时审批只有一个成功，另一个 409 `FLOW_CONFLICT`；
   * 3. `Idempotency-Key` 相同且任务已是该动作结果时，直接返回当前实例（网络重试不重复推进）；
   * 4. 先落实例（含 `pendingPatch` outbox），再回写记录；失败/进程退出后由读取路径补偿。
   */
  async decide(
    instanceId: string,
    taskId: string,
    action: 'approve' | 'reject',
    comment: string | undefined,
    user: AuthUser,
    idempotencyKey?: string,
  ): Promise<FlowInstance> {
    return this.decideLock.runExclusive(instanceId, () =>
      this.decideUnlocked(instanceId, taskId, action, comment, user, idempotencyKey),
    )
  }

  private async decideUnlocked(
    instanceId: string,
    taskId: string,
    action: 'approve' | 'reject',
    comment: string | undefined,
    user: AuthUser,
    idempotencyKey?: string,
  ): Promise<FlowInstance> {
    let inst = await this.repo.findInstance(instanceId)
    if (!inst) throw new NotFoundException({ code: 'FLOW_INSTANCE_NOT_FOUND', message: '流程实例不存在' })
    // 上次只落了实例、没回写记录：先补偿，再做本次审批。
    inst = await this.flushPendingPatch(inst)

    const task = inst.tasks.find((t) => t.id === taskId)
    if (!task) throw new NotFoundException({ code: 'FLOW_TASK_NOT_FOUND', message: '任务不存在' })

    // 终态重放也要先认幂等键：否则「最后一次审批」的网络重试会误报 FLOW_NOT_RUNNING。
    const expectedStatus = action === 'approve' ? 'approved' : 'rejected'
    if (idempotencyKey !== undefined) {
      const used = inst.tasks.find((t) => t.idempotencyKey === idempotencyKey)
      if (used) {
        const sameRequest =
          used.id === taskId &&
          used.status === expectedStatus &&
          used.decidedBy === user.username &&
          (used.comment ?? '') === (comment ?? '')
        if (sameRequest) return inst
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: '同一 Idempotency-Key 已用于不同任务或不同审批内容',
        })
      }
    }

    if (inst.status !== 'running' || !inst.currentNodeId) {
      throw new BadRequestException({ code: 'FLOW_NOT_RUNNING', message: `流程已结束（${inst.status}）` })
    }

    if (task.status !== 'pending' || task.nodeId !== inst.currentNodeId) {
      throw new BadRequestException({ code: 'FLOW_TASK_STALE', message: '任务不是当前待办（可能已被处理）' })
    }

    if (!(await this.canDecide(task, inst, user))) {
      throw new ForbiddenException({ code: 'TASK_FORBIDDEN', message: '当前用户不是该任务的审批人' })
    }

    const flow = await this.getFlow(inst.flowId)
    const idx = flow.nodes.findIndex((n) => n.id === inst.currentNodeId)
    const node = flow.nodes[idx]
    if (!node) {
      throw new NotFoundException({ code: 'FLOW_NODE_NOT_FOUND', message: `流程节点不存在：${inst.currentNodeId}` })
    }
    const at = nowIso()

    let setFields: Record<string, unknown>[] = []
    if (action === 'approve') {
      task.status = 'approved'
      task.comment = comment
      task.decidedBy = user.username
      task.decidedAt = at
      if (idempotencyKey !== undefined) task.idempotencyKey = idempotencyKey
      inst.history.push({ nodeId: node.id, nodeName: node.name, action: 'approve', actor: user.username, comment, at })
      if (node.onApprove?.setField) setFields.push(node.onApprove.setField)
      // 同意后从下一节点继续推进（可能直达 end / 经 skip / 停在下一审批）
      setFields = setFields.concat(this.advanceFrom(inst, flow, await this.recordPayload(inst), idx + 1, user.username))
    } else {
      task.status = 'rejected'
      task.comment = comment
      task.decidedBy = user.username
      task.decidedAt = at
      if (idempotencyKey !== undefined) task.idempotencyKey = idempotencyKey
      inst.history.push({ nodeId: node.id, nodeName: node.name, action: 'reject', actor: user.username, comment, at })
      const target = node.onReject
      if (!target) {
        // 无回退配置 → 驳回即终止
        inst.status = 'rejected'
      } else {
        const targetIdx = flow.nodes.findIndex((n) => n.id === target)
        if (targetIdx < 0) {
          // onReject 指向已删节点（定义后改）→ 防御按终止处理
          inst.status = 'rejected'
        } else {
          const formData = await this.recordPayload(inst)
          setFields = this.advanceFrom(inst, flow, formData, targetIdx, user.username, 'reenter')
        }
      }
    }

    inst.updatedAt = at
    const currentRevision = inst.revision ?? 0
    const patch = mergeFields(setFields)
    if (Object.keys(patch).length > 0) inst.pendingPatch = patch
    inst.revision = currentRevision + 1

    // ① 先落实例（CAS，含 outbox）；失败说明另一审批已推进 → 409，不产生重复推进。
    const saved = await this.repo.saveInstanceIfRevision(inst, currentRevision)
    if (!saved) {
      throw new ConflictException({
        code: 'FLOW_CONFLICT',
        message: '审批已被其他请求处理，请刷新后重试',
        expectedRevision: currentRevision,
      })
    }

    // ② 再回写记录；失败由 pendingPatch 在后续读取时补偿。
    const result = await this.applyPendingPatch(inst)
    const eventType = action === 'approve' ? 'flow.task.approved' : 'flow.task.rejected'
    await this.webhooks.emit(eventType, user.username, {
      instanceId: result.id,
      flowId: result.flowId,
      modelId: result.modelId,
      recordId: result.recordId,
      taskId: task.id,
      nodeId: node.id,
      nodeName: node.name,
      action,
      ...(comment === undefined ? {} : { comment }),
      status: result.status,
      revision: result.revision ?? 0,
    })
    if (result.status === 'approved') {
      await this.webhooks.emit('flow.completed', user.username, {
        instanceId: result.id,
        flowId: result.flowId,
        modelId: result.modelId,
        recordId: result.recordId,
        status: result.status,
        revision: result.revision ?? 0,
      })
    } else if (result.status === 'rejected') {
      await this.webhooks.emit('flow.rejected', user.username, {
        instanceId: result.id,
        flowId: result.flowId,
        modelId: result.modelId,
        recordId: result.recordId,
        status: result.status,
        revision: result.revision ?? 0,
      })
    }
    return result
  }

  /* ---------------------------------------------------------------- */
  /* 内部：推进 / assignee / 记录读写                                    */
  /* ---------------------------------------------------------------- */

  /**
   * 从 `nodes[startIdx]` 起沿链推进，直到停在 pending 审批节点或到达 end。
   * 收集沿途应写回记录的 `onApprove.setField`（skip 的节点不收集 —— 未被同意过）。
   * start 节点：history 记 `entryAction`（'start' 首次 / 'reenter' 驳回后重入）。
   */
  private advanceFrom(
    inst: FlowInstance,
    flow: FlowSchema,
    formData: Record<string, unknown>,
    startIdx: number,
    actor: string,
    entryAction?: 'start' | 'reenter',
  ): Record<string, unknown>[] {
    const nodes = flow.nodes
    const collected: Record<string, unknown>[] = []
    let idx = Math.max(0, startIdx)

    while (idx < nodes.length) {
      const node: FlowNode = nodes[idx]
      if (node.type === 'start') {
        inst.history.push({
          nodeId: node.id,
          nodeName: node.name,
          action: entryAction ?? 'start',
          actor,
          at: nowIso(),
        })
        inst.currentNodeId = node.id
        idx += 1
        continue
      }
      if (node.type === 'approve') {
        if (flow.mode === 'condition' && node.condition && !this.evalCondition(node.condition, formData)) {
          inst.history.push({ nodeId: node.id, nodeName: node.name, action: 'skip', actor, at: nowIso() })
          idx += 1
          continue
        }
        // 停下等审批
        const task: FlowTask = {
          id: randomUUID(),
          nodeId: node.id,
          nodeName: node.name,
          assignee: node.assignee ?? { type: 'starter' },
          status: 'pending',
          createdAt: nowIso(),
        }
        inst.currentNodeId = node.id
        inst.tasks.push(task)
        return collected
      }
      // end
      inst.currentNodeId = node.id
      inst.history.push({ nodeId: node.id, nodeName: node.name, action: 'end', actor, at: nowIso() })
      inst.status = 'approved'
      if (node.onApprove?.setField) collected.push(node.onApprove.setField)
      return collected
    }
    // 理论不可达（validateFlow 保证末节点 end）；防御：按结束处理
    inst.status = 'approved'
    return collected
  }

  /** condition 求值：scope = { formData }；**异常按 true**（fail-open，宁多审不漏审）。 */
  private evalCondition(expr: string, formData: Record<string, unknown>): boolean {
    try {
      return evalExpr(expr, { formData }) === true
    } catch (error) {
      console.error('[flow] condition 求值异常，按 true 处理（不跳过）', expr, error)
      return true
    }
  }

  /** assignee 基础命中：starter=发起人；role=用户角色命中；dept=首期降级不可命中。 */
  private matchesAssignee(task: FlowTask, inst: FlowInstance, user: AuthUser): boolean {
    const a = task.assignee
    if (a.type === 'starter') return inst.createdBy === user.username
    if (a.type === 'role') return !!a.value && user.roles.includes(a.value)
    return false // dept：无组织服务降级（与批 6 dataScope dept 同口径）
  }

  /** assignee 命中（含 `'*'` 超级豁免）—— 对外判定入口。 */
  private async canDecide(task: FlowTask, inst: FlowInstance, user: AuthUser): Promise<boolean> {
    if (this.matchesAssignee(task, inst, user)) return true
    if (task.assignee.type === 'role') {
      const perms = await this.rbac.permsOf(user)
      return perms.includes('*')
    }
    return false
  }

  /** 读最新记录 payload 作为推进时的 formData（审批期间记录可能已被修改）。 */
  private async recordPayload(inst: FlowInstance): Promise<Record<string, unknown>> {
    const rec = await this.records.find(inst.modelId, inst.recordId)
    return rec && !rec.deletedAt ? rec.payload : {}
  }

  /**
   * 补偿 outbox：把 `pendingPatch` 合并到最新记录（只覆盖流程声明的字段，保留用户并发修改），
   * 成功后清空实例上的 pendingPatch。记录已删则直接清空，不阻塞审批。
   */
  private async flushPendingPatch(inst: FlowInstance): Promise<FlowInstance> {
    return this.applyPendingPatch(inst)
  }

  private async applyPendingPatch(inst: FlowInstance): Promise<FlowInstance> {
    const patch = inst.pendingPatch
    if (!patch || Object.keys(patch).length === 0) return inst

    // 记录可能被并发修改：CAS 失败就重新读取后把 setField 合并到最新 payload，最多重试 3 次。
    for (let attempt = 0; attempt < 3; attempt++) {
      const rec = await this.records.find(inst.modelId, inst.recordId)
      if (!rec || rec.deletedAt) return this.clearPendingPatch(inst)

      const currentRevision = rec.revision ?? 0
      const next = {
        ...rec,
        payload: { ...rec.payload, ...patch },
        updatedAt: nowIso(),
        revision: currentRevision + 1,
      }
      if (await this.records.saveIfRevision(inst.modelId, next, currentRevision)) {
        return this.clearPendingPatch(inst)
      }
    }

    // 仍冲突：保留 pendingPatch，下一次 GET / 审批会继续补偿（不把审批结果丢掉）。
    console.error('[flow] pendingPatch 回写记录连续冲突，保留待补偿', inst.id)
    return (await this.repo.findInstance(inst.id)) ?? inst
  }

  private async clearPendingPatch(inst: FlowInstance): Promise<FlowInstance> {
    const latest = await this.repo.findInstance(inst.id)
    if (!latest) return inst
    if (!latest.pendingPatch) return latest

    const currentRevision = latest.revision ?? 0
    const next: FlowInstance = {
      ...latest,
      pendingPatch: undefined,
      revision: currentRevision + 1,
      updatedAt: nowIso(),
    }
    const saved = await this.repo.saveInstanceIfRevision(next, currentRevision)
    // 另一个进程已清空/推进：以库里的最新状态为准，避免把旧快照返回给调用方。
    return saved ? next : ((await this.repo.findInstance(inst.id)) ?? next)
  }
}

/** 多个 setField 按节点顺序合并，后者覆盖前者（与旧 patchRecord 的 Object.assign 语义一致）。 */
function mergeFields(fields: Record<string, unknown>[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const f of fields) Object.assign(patch, f)
  return patch
}
