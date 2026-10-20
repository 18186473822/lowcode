/**
 * 流程（轻量状态机）端到端集成测试（Phase 3 批 1，真实启动 Nest 应用、临时目录落盘）：
 * 定义 CRUD 与校验拦截 → **记录提交联动启动实例** → 待办/审批人过滤（'*' 豁免、starter、role）
 * → 同意推进至终态 + setField 回写记录 → 驳回回退（reenter）/ 驳回终止 → 条件跳过（skip）。
 *
 * 三个流程夹具（各绑独立模型，互不干扰）：
 *  - A fl_leave  linear   n1→n2(role dept_manager, admin '*' 豁免批)→n3(role admin)→end(setField status)
 *  - B fl_back   linear   n1→n2(starter + onReject n1 驳回回退)→n3(role, 无 onReject 驳回终止)→end
 *  - C fl_cond   condition n1→n2(condition formData.amount>1000)→n3→end
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { FlowSchema, ModelSchema } from '@lc/schema'
import { AppModule } from '../src/app.module.js'

/* ------------------------------------------------------------------ */
/* 环境与辅助                                                          */
/* ------------------------------------------------------------------ */

let app: INestApplication
let base: string
let dataDir: string
/** admin（角色 ['admin']，RBAC perms ['*'] 超级豁免） */
let token: string
/** designer（角色 ['designer']，perms [] 受限） */
let dToken: string

interface CallOptions {
  body?: unknown
  token?: string
}

async function call(method: string, apiPath: string, opts: CallOptions = {}) {
  const res = await fetch(`${base}${apiPath}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* 非 JSON 响应（如 204） */
  }
  return { status: res.status, body }
}

const hasCode = (errors: any[] | undefined, code: string): boolean =>
  Array.isArray(errors) && errors.some((e) => e.code === code)

/* ------------------------------------------------------------------ */
/* 夹具                                                                */
/* ------------------------------------------------------------------ */

function flowModel(id: string): ModelSchema {
  return {
    schemaVersion: '1.0.0',
    id,
    name: '流程测试模型',
    code: `flow_t_${id.slice(-1)}`,
    fields: [{ key: 'amount', name: '金额', type: 'number' }],
  } as ModelSchema
}

/** A：线性主链 + '*' 豁免 + role 命中 + end 回写 status */
function flowA(): FlowSchema {
  return {
    flowId: 'fl_leave',
    name: '请假审批',
    modelId: 'md_flow_a',
    mode: 'linear',
    nodes: [
      { id: 'n1', name: '提交', type: 'start' },
      { id: 'n2', name: '部门审批', type: 'approve', assignee: { type: 'role', value: 'dept_manager' } },
      { id: 'n3', name: '财务审批', type: 'approve', assignee: { type: 'role', value: 'admin' } },
      { id: 'n4', name: '结束', type: 'end', onApprove: { setField: { status: 'approved' } } },
    ],
  }
}

/** B：starter 审批 + 驳回回退（onReject→start reenter）+ 驳回终止（n3 无 onReject） */
function flowB(): FlowSchema {
  return {
    flowId: 'fl_back',
    name: '退回归档',
    modelId: 'md_flow_b',
    mode: 'linear',
    nodes: [
      { id: 'n1', name: '提交', type: 'start' },
      { id: 'n2', name: '发起人确认', type: 'approve', assignee: { type: 'starter' }, onReject: 'n1' },
      { id: 'n3', name: '部门审批', type: 'approve', assignee: { type: 'role', value: 'dept_manager' } },
      { id: 'n4', name: '结束', type: 'end', onApprove: { setField: { status: 'approved' } } },
    ],
  }
}

/** C：条件跳过（mode=condition） */
function flowC(): FlowSchema {
  return {
    flowId: 'fl_cond',
    name: '大额审批',
    modelId: 'md_flow_c',
    mode: 'condition',
    nodes: [
      { id: 'n1', name: '提交', type: 'start' },
      {
        id: 'n2',
        name: '大额审批',
        type: 'approve',
        assignee: { type: 'role', value: 'dept_manager' },
        condition: 'formData.amount > 1000',
      },
      { id: 'n3', name: '例行审批', type: 'approve', assignee: { type: 'role', value: 'dept_manager' } },
      { id: 'n4', name: '结束', type: 'end', onApprove: { setField: { status: 'approved' } } },
    ],
  }
}

/** 提交记录并返回 id */
async function submit(modelId: string, body: Record<string, unknown>): Promise<string> {
  const r = await call('POST', `/api/v1/models/${modelId}/records`, { body, token })
  expect(r.status, `提交记录失败：${JSON.stringify(r.body)}`).toBe(200)
  return r.body.id as string
}

/** 按记录取实例（应恰 1 个） */
async function instanceOf(recordId: string) {
  const r = await call('GET', `/api/v1/flows/instances?recordId=${recordId}`, { token })
  expect(r.status).toBe(200)
  expect(r.body.items).toHaveLength(1)
  return r.body.items[0]
}

async function decideOk(instanceId: string, taskId: string, action: 'approve' | 'reject', t = token) {
  return call('POST', `/api/v1/flows/instances/${instanceId}/tasks/${taskId}`, {
    body: { action, comment: '同意-自动化' },
    token: t,
  })
}

/** 当前 pending 任务 id（按 currentNodeId 对位） */
function pendingTask(inst: any): any {
  const t = inst.tasks.find((x: any) => x.status === 'pending' && x.nodeId === inst.currentNodeId)
  expect(t, `无 pending 任务：${JSON.stringify(inst.tasks)}`).toBeTruthy()
  return t
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-flow-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret'

  app = await NestFactory.create(AppModule, { logger: ['error'] })
  app.setGlobalPrefix('api/v1')
  // 显式绑 127.0.0.1：listen(0) 默认绑 :: 时本机 IPv6 回环被拦测试全红（教训 B-29）
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()

  const login = await call('POST', '/api/v1/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  })
  token = login.body.accessToken
  expect(token).toBeTruthy()

  const dlogin = await call('POST', '/api/v1/auth/login', {
    body: { username: 'designer', password: 'designer123' },
  })
  expect(dlogin.status).toBe(200)
  dToken = dlogin.body.accessToken

  // 4 个模型 + 3 个流程定义
  for (const id of ['md_flow_a', 'md_flow_b', 'md_flow_c', 'md_flow_none']) {
    const r = await call('PUT', `/api/v1/models/${id}`, { body: flowModel(id), token })
    expect(r.status, `建模型 ${id} 失败：${JSON.stringify(r.body)}`).toBe(200)
  }
  for (const f of [flowA(), flowB(), flowC()]) {
    const r = await call('PUT', `/api/v1/flows/${f.flowId}`, { body: f, token })
    expect(r.status, `建流程 ${f.flowId} 失败：${JSON.stringify(r.body)}`).toBe(200)
  }
})

afterAll(async () => {
  await app?.close()
  await rm(dataDir, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ */
/* 1. 定义接口                                                          */
/* ------------------------------------------------------------------ */

describe('批 1：流程定义接口', () => {
  it('未登录访问 → 401', async () => {
    const r = await call('GET', '/api/v1/flows')
    expect(r.status).toBe(401)
  })

  it('PUT 8.6 形状定义 → 200 且 GET 列表/详情一致', async () => {
    const list = await call('GET', '/api/v1/flows', { token })
    expect(list.status).toBe(200)
    expect(list.body.flows.map((f: any) => f.flowId).sort()).toEqual(['fl_back', 'fl_cond', 'fl_leave'])

    const detail = await call('GET', '/api/v1/flows/fl_leave', { token })
    expect(detail.status).toBe(200)
    expect(detail.body.nodes).toHaveLength(4)
    expect(detail.body.nodes[3].onApprove.setField).toEqual({ status: 'approved' })
  })

  it('PUT 非法定义（末节点非 end）→ 400 INVALID_FLOW + issues 错误码', async () => {
    const bad: FlowSchema = { ...flowA(), flowId: 'fl_bad', nodes: [...flowA().nodes] }
    bad.nodes[3] = { id: 'n9', name: '非结束', type: 'start' }
    const r = await call('PUT', '/api/v1/flows/fl_bad', { body: bad, token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_FLOW')
    expect(hasCode(r.body.issues, 'E_FLOW_END_POS')).toBe(true)
  })

  it('路径与 body flowId 不一致 → 400 INVALID_FLOW', async () => {
    const r = await call('PUT', '/api/v1/flows/fl_other', { body: flowA(), token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_FLOW')
  })

  it('GET/DELETE 不存在的定义 → 404', async () => {
    const g = await call('GET', '/api/v1/flows/fl_ghost', { token })
    expect(g.status).toBe(404)
    const d = await call('DELETE', '/api/v1/flows/fl_ghost', { token })
    expect(d.status).toBe(404)
  })
})

/* ------------------------------------------------------------------ */
/* 2. 记录提交联动启动                                                  */
/* ------------------------------------------------------------------ */

describe('批 1：记录提交联动启动实例', () => {
  it('无流程绑定的模型提交 → 不产生实例', async () => {
    const rid = await submit('md_flow_none', { amount: 1 })
    const r = await call('GET', `/api/v1/flows/instances?recordId=${rid}`, { token })
    expect(r.body.items).toHaveLength(0)
  })

  it('绑定模型提交 → 实例 running、history start、停在首个审批节点（pending 任务）', async () => {
    const rid = await submit('md_flow_a', { amount: 100 })
    const inst = await instanceOf(rid)
    expect(inst.status).toBe('running')
    expect(inst.flowId).toBe('fl_leave')
    expect(inst.createdBy).toBe('admin')
    expect(inst.currentNodeId).toBe('n2')
    expect(inst.history.map((h: any) => h.action)).toEqual(['start'])
    const t = pendingTask(inst)
    expect(t.nodeName).toBe('部门审批')
    expect(t.assignee).toEqual({ type: 'role', value: 'dept_manager' })
  })
})

/* ------------------------------------------------------------------ */
/* 3. 待办过滤与审批人判定                                               */
/* ------------------------------------------------------------------ */

describe('批 1：待办过滤与审批人判定', () => {
  let aInst: any
  let aTask: any

  beforeAll(async () => {
    const rid = await submit('md_flow_a', { amount: 200 })
    aInst = await instanceOf(rid)
    aTask = pendingTask(aInst)
  })

  it('admin（perms ["*"] 超级豁免）todo 可见 role≠己的任务', async () => {
    const r = await call('GET', '/api/v1/flows/tasks/todo', { token })
    expect(r.status).toBe(200)
    const hit = r.body.items.find((i: any) => i.instanceId === aInst.id)
    expect(hit, `admin todo 应含该任务，实际：${JSON.stringify(r.body.items)}`).toBeTruthy()
    expect(hit.taskId).toBe(aTask.id)
    expect(hit.flowName).toBe('请假审批')
    expect(hit.nodeName).toBe('部门审批')
  })

  it('designer（role 不命中、无 "*"）todo 为空', async () => {
    const r = await call('GET', '/api/v1/flows/tasks/todo', { token: dToken })
    expect(r.status).toBe(200)
    expect(r.body.items.find((i: any) => i.instanceId === aInst.id)).toBeUndefined()
  })

  it('designer 直接审批 → 403 TASK_FORBIDDEN', async () => {
    const r = await decideOk(aInst.id, aTask.id, 'approve', dToken)
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('TASK_FORBIDDEN')
  })
})

/* ------------------------------------------------------------------ */
/* 4. A：同意推进 + setField 回写                                       */
/* ------------------------------------------------------------------ */

describe('批 1：A 主链推进与状态回写', () => {
  let inst: any
  let t2: any
  let rid: string

  beforeAll(async () => {
    rid = await submit('md_flow_a', { amount: 300 })
    inst = await instanceOf(rid)
    t2 = pendingTask(inst)
  })

  it('approve n2（admin "*" 豁免）→ 推进至 n3（role=admin 角色直接命中）', async () => {
    const r = await decideOk(inst.id, t2.id, 'approve')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.status).toBe('running')
    expect(r.body.currentNodeId).toBe('n3')
    expect(r.body.history.map((h: any) => h.action)).toEqual(['start', 'approve'])
    const t3 = pendingTask(r.body)
    expect(t3.assignee).toEqual({ type: 'role', value: 'admin' })
    inst = r.body
  })

  it('重复处理已批任务 → 400 FLOW_TASK_STALE', async () => {
    const r = await decideOk(inst.id, t2.id, 'approve')
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('FLOW_TASK_STALE')
  })

  it('approve n3 → 到达 end：实例 approved + 记录 payload.status 回写（不经 sanitize）', async () => {
    const r = await decideOk(inst.id, pendingTask(inst).id, 'approve')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.status).toBe('approved')
    expect(r.body.currentNodeId).toBe('n4')
    expect(r.body.history.map((h: any) => h.action)).toEqual(['start', 'approve', 'approve', 'end'])

    // 服务端回写读回（B-35 服务端回读）
    const list = await call('GET', `/api/v1/models/md_flow_a/records?filter=${encodeURIComponent(JSON.stringify({ amount: 300 }))}`, { token })
    expect(list.status).toBe(200)
    const row = list.body.items.find((r2: any) => r2.id === rid)
    expect(row, '回写记录应可查').toBeTruthy()
    expect(row.payload?.status ?? row.status).toBe('approved')
  })
})

/* ------------------------------------------------------------------ */
/* 5. B：starter + 驳回回退 / 驳回终止                                   */
/* ------------------------------------------------------------------ */

describe('批 1：B 驳回语义与 starter 审批人', () => {
  let rid: string
  let inst: any
  let t2: any

  beforeAll(async () => {
    rid = await submit('md_flow_b', { amount: 10 })
    inst = await instanceOf(rid)
    t2 = pendingTask(inst)
  })

  it('starter 任务：发起人 admin 可见；非发起人 designer 审批 → 403', async () => {
    const todo = await call('GET', '/api/v1/flows/tasks/todo', { token })
    expect(todo.body.items.find((i: any) => i.taskId === t2.id)).toBeTruthy()

    const todo2 = await call('GET', '/api/v1/flows/tasks/todo', { token: dToken })
    expect(todo2.body.items.find((i: any) => i.taskId === t2.id)).toBeUndefined()

    const r = await decideOk(inst.id, t2.id, 'approve', dToken)
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('TASK_FORBIDDEN')
  })

  it('reject（onReject→n1）→ reenter 重发、新建 pending 任务、旧任务置 rejected', async () => {
    const r = await call('POST', `/api/v1/flows/instances/${inst.id}/tasks/${t2.id}`, {
      body: { action: 'reject', comment: '材料不全' },
      token,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.status).toBe('running')
    expect(r.body.currentNodeId).toBe('n2')
    const actions = r.body.history.map((h: any) => h.action)
    expect(actions).toEqual(['start', 'reject', 'reenter'])
    // 新 pending 任务 ≠ 旧任务；旧任务 rejected
    const fresh = pendingTask(r.body)
    expect(fresh.id).not.toBe(t2.id)
    expect(r.body.tasks.find((t: any) => t.id === t2.id).status).toBe('rejected')
    expect(r.body.tasks.find((t: any) => t.id === t2.id).comment).toBe('材料不全')
    inst = r.body
  })

  it('旧任务再处理 → 400 FLOW_TASK_STALE', async () => {
    const r = await decideOk(inst.id, t2.id, 'approve')
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('FLOW_TASK_STALE')
  })

  it('approve 新任务 → 推进 n3；reject n3（无 onReject）→ 实例 rejected 终态', async () => {
    const ok = await decideOk(inst.id, pendingTask(inst).id, 'approve')
    expect(ok.status).toBe(200)
    expect(ok.body.currentNodeId).toBe('n3')

    const rj = await decideOk(inst.id, pendingTask(ok.body).id, 'reject', token)
    expect(rj.status).toBe(200)
    expect(rj.body.status).toBe('rejected')
    expect(rj.body.history.at(-1).action).toBe('reject')

    // 终态后再审批 → 400 FLOW_NOT_RUNNING（终态实例无 pending 任务，取末尾任务触发状态检查）
    const again = await decideOk(inst.id, rj.body.tasks.at(-1).id, 'approve')
    expect(again.status).toBe(400)
    expect(again.body.code).toBe('FLOW_NOT_RUNNING')
  })
})

/* ------------------------------------------------------------------ */
/* 6. C：条件跳过（mode=condition）                                      */
/* ------------------------------------------------------------------ */

describe('批 1：C 条件跳过', () => {
  it('amount=500（条件假）→ n2 skip、停在 n3', async () => {
    const rid = await submit('md_flow_c', { amount: 500 })
    const inst = await instanceOf(rid)
    expect(inst.currentNodeId).toBe('n3')
    expect(inst.history.map((h: any) => h.action)).toEqual(['start', 'skip'])
    expect(pendingTask(inst).nodeName).toBe('例行审批')
  })

  it('amount=2000（条件真）→ 停在 n2 大额审批', async () => {
    const rid = await submit('md_flow_c', { amount: 2000 })
    const inst = await instanceOf(rid)
    expect(inst.currentNodeId).toBe('n2')
    expect(inst.history.map((h: any) => h.action)).toEqual(['start'])
    expect(pendingTask(inst).nodeName).toBe('大额审批')
  })
})

/* ------------------------------------------------------------------ */
/* 7. 定义删除（末序：不影响前序用例）                                    */
/* ------------------------------------------------------------------ */

describe('批 1：定义删除（实例审计保留）', () => {
  it('DELETE fl_cond → 204，GET 404，已有实例仍可查', async () => {
    const rid = await submit('md_flow_c', { amount: 7777 })
    const del = await call('DELETE', '/api/v1/flows/fl_cond', { token })
    expect(del.status).toBe(204)
    const again = await call('DELETE', '/api/v1/flows/fl_cond', { token })
    expect(again.status).toBe(404)
    const g = await call('GET', '/api/v1/flows/fl_cond', { token })
    expect(g.status).toBe(404)
    // 实例不随定义删除（审计保留）
    const inst = await instanceOf(rid)
    expect(inst.flowId).toBe('fl_cond')
  })
})

/* ------------------------------------------------------------------ */
/* 批 2：单实例查询（待办详情页 / 审批物料数据源）                        */
/* ------------------------------------------------------------------ */

describe('批 2：单实例查询', () => {
  it('GET /flows/instances/:iid → 200 完整实例（tasks/history 齐）；不存在 → 404', async () => {
    const rid = await submit('md_flow_a', { amount: 600 })
    const inst = await instanceOf(rid)

    const g = await call('GET', `/api/v1/flows/instances/${inst.id}`, { token })
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    expect(g.body.id).toBe(inst.id)
    expect(g.body.recordId).toBe(rid)
    expect(g.body.flowId).toBe(inst.flowId)
    expect(Array.isArray(g.body.tasks)).toBe(true)
    expect(Array.isArray(g.body.history)).toBe(true)
    // 与列表查询同实例（单查是 detail 语义，不改数据）
    expect(g.body.status).toBe('running')

    const miss = await call('GET', '/api/v1/flows/instances/inst_not_exists', { token })
    expect(miss.status).toBe(404)
    expect(miss.body.code).toBe('FLOW_INSTANCE_NOT_FOUND')
  })
})
