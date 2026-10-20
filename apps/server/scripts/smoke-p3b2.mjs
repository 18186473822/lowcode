#!/usr/bin/env node
/**
 * smoke-p3b2.mjs —— Phase 3 批 2 冒烟（待办闭环 API 级留档）
 *
 * 前置：server 已起 127.0.0.1:3000（真实 dist 产物 + 真实 data，B-19）。
 * 与批 1 smoke-flow 的分工：批 1 锁推进语义，本脚本锁**批 2 新增面**——
 *   单实例查询接口（P3/P4/P7）、待办数据链（P6）、审批闭环与 setField 回写（P8~P11）。
 * H5 页面级实测（待办中心 → 内置详情 → 物料审批条/时间轴）另见 PROGRESS 留档。
 *
 * 用法：node scripts/smoke-p3b2.mjs   （期望 12/12 PASS；P5 拆两步断言）
 */
import process from 'node:process'

const BASE = 'http://127.0.0.1:3000/api/v1'
let token = ''
let pass = 0
let fail = 0

function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}${extra ? ` —— ${extra}` : ''}`)
  }
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* 204 等无体响应 */
  }
  return { status: res.status, data }
}

/** 按模型字段构造合法提交载荷（enum/select 类取 options[0].value —— 批 1 冒烟实测语义） */
function payloadOf(model) {
  const out = {}
  for (const f of model.fields ?? []) {
    const t = String(f.type ?? '')
    if ((t === 'select' || t === 'enum' || t === 'radio') && Array.isArray(f.options) && f.options.length) {
      out[f.key] = typeof f.options[0] === 'object' ? f.options[0].value : f.options[0]
    } else if (t === 'number' || t === 'money') out[f.key] = 1
    else if (t === 'boolean') out[f.key] = false
    else if (t === 'date' || t === 'datetime') out[f.key] = '2026-10-20'
    else if (t === 'json') out[f.key] = {}
    else out[f.key] = 'b2冒烟'
  }
  return out
}

const FLOW = {
  flowId: 'fl_leave_b2',
  name: '请假审批-批2',
  modelId: 'm_leave',
  mode: 'linear',
  nodes: [
    { id: 'n1', name: '提交', type: 'start' },
    { id: 'n2', name: '部门审批', type: 'approve', assignee: { type: 'role', value: 'dept_manager' } },
    { id: 'n3', name: '结束', type: 'end', onApprove: { setField: { status: 'approved' } } },
  ],
}

async function main() {
  console.log('== Phase 3 批 2 冒烟 ==')

  /* P1 登录 */
  const login = await api('POST', '/auth/login', { username: 'admin', password: 'admin123' })
  token = login.data?.accessToken ?? ''
  ok('P1 登录 admin 拿 token', login.status === 200 && !!token)

  /* P2 建流程定义（绑 m_leave；提交记录即自动启动） */
  const putFlow = await api('PUT', `/flows/${FLOW.flowId}`, FLOW)
  ok('P2 建流程 fl_leave_b2（validateFlow 通过）', putFlow.status === 200 || putFlow.status === 201, JSON.stringify(putFlow.data))

  /* P3 空记录的实例列表：200 且 items 为空数组 */
  const empty = await api('GET', '/flows/instances?recordId=rec_ghost_b2')
  ok('P3 实例列表（无此记录）→ 200 items=[]', empty.status === 200 && Array.isArray(empty.data?.items) && empty.data.items.length === 0)

  /* P4 单实例查询不存在 → 404 业务码 */
  const ghost = await api('GET', '/flows/instances/inst_ghost_b2')
  ok('P4 单实例不存在 → 404 FLOW_INSTANCE_NOT_FOUND', ghost.status === 404 && ghost.data?.code === 'FLOW_INSTANCE_NOT_FOUND', JSON.stringify(ghost.data))

  /* P5 提交记录 → 实例自动 running（start 入史） */
  const model = (await api('GET', '/models/m_leave')).data
  const rec = await api('POST', '/models/m_leave/records', payloadOf(model))
  const recordId = rec.data?.id
  ok('P5 提交记录拿到 id', rec.status === 200 && !!recordId, JSON.stringify(rec.data))

  const list = await api('GET', `/flows/instances?recordId=${recordId}`)
  const inst = list.data?.items?.[0]
  ok('P5 提交联动启动实例（running + history start）', list.status === 200 && inst?.status === 'running' && inst?.history?.[0]?.action === 'start', JSON.stringify(list.data))

  /* P6 待办命中（admin RBAC '*' 豁免） */
  const todo = await api('GET', '/flows/tasks/todo')
  const hit = (todo.data?.items ?? []).find((t) => t.instanceId === inst?.id)
  ok('P6 待办列表命中本实例（flowName/nodeName/taskId 齐）', todo.status === 200 && !!hit && hit.flowName === '请假审批-批2' && hit.nodeName === '部门审批' && !!hit.taskId, JSON.stringify(hit))

  /* P7 单实例查询 = 列表同款数据 */
  const single = await api('GET', `/flows/instances/${inst.id}`)
  ok('P7 单实例查询 200（recordId/tasks/history 齐）', single.status === 200 && single.data?.recordId === recordId && Array.isArray(single.data?.tasks) && Array.isArray(single.data?.history), JSON.stringify(single.data))

  /* P8 审批动作 → approved */
  const dec = await api('POST', `/flows/instances/${inst.id}/tasks/${hit.taskId}`, { action: 'approve', comment: '批2冒烟同意' })
  ok('P8 decide approve → 200 status=approved', dec.status === 200 && dec.data?.status === 'approved', JSON.stringify(dec.data))

  /* P9 记录回写（end.setField，B-35 服务端回读） */
  const back = await api('GET', `/models/m_leave/records?filter=${encodeURIComponent(JSON.stringify({ id: recordId }))}&size=1`)
  const row = back.data?.items?.[0]
  ok('P9 记录 status 回读 = approved（setField 回写）', row?.status === 'approved', `实际 status=${row?.status}`)

  /* P10 时间轴数据源：start → approve → end 三条 */
  const after = await api('GET', `/flows/instances/${inst.id}`)
  const actions = (after.data?.history ?? []).map((h) => h.action)
  ok('P10 history = start→approve→end（Timeline 数据源）', after.status === 200 && actions.join(',') === 'start,approve,end', `实际=${actions.join(',')}`)

  /* P11 终态防护回归 */
  const again = await api('POST', `/flows/instances/${inst.id}/tasks/${hit.taskId}`, { action: 'approve' })
  ok('P11 终态再审批 → 400 FLOW_NOT_RUNNING', again.status === 400 && again.data?.code === 'FLOW_NOT_RUNNING', JSON.stringify(again.data))

  console.log(`\n结果：${pass}/${pass + fail} PASS${fail ? `，${fail} FAIL` : ''}`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('冒烟脚本异常：', e)
  process.exit(1)
})
