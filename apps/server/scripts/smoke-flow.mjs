/**
 * Phase 3 批 1 接口冒烟：真实服务端产物（dist + 真实 data 目录）全链路验证。
 *
 * 链路：登录 -> PUT 流程定义(绑定 m_leave) -> 读模型字段构造 payload -> 提交记录(联动启动实例)
 *       -> 查实例/待办 -> approve -> 记录状态回读(B-35) -> 清理(软删记录/删定义)。
 *
 * 用法：服务端已监听 :3000 后  node scripts/smoke-flow.mjs
 * 断言全过退出码 0；任一失败打印 FAIL 并退出 1（数字实测，不拍脑袋 - B-17）。
 */
const base = 'http://127.0.0.1:3000/api/v1'
const FLOW_ID = 'smoke_fl_leave'

let token = ''
let failed = 0

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS  ${name}`)
  } else {
    failed++
    console.log(`FAIL  ${name} ${detail}`)
  }
}

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* 204 etc */ }
  return { status: res.status, json }
}

/* 1. 登录 */
{
  const r = await call('POST', '/auth/login', { username: 'admin', password: 'admin123' })
  check('login admin', r.status === 200 && !!r.json?.accessToken, `status=${r.status}`)
  token = r.json?.accessToken ?? ''
}

/* 2. 幂等清理旧定义 + PUT 流程定义（8.6 形状：start -> approve(role dept_manager) -> end setField） */
await call('DELETE', `/flows/${FLOW_ID}`)
{
  const def = {
    flowId: FLOW_ID,
    name: 'smoke-leave',
    modelId: 'm_leave',
    mode: 'linear',
    nodes: [
      { id: 'n1', name: 'submit', type: 'start' },
      { id: 'n2', name: 'approve', type: 'approve', assignee: { type: 'role', value: 'dept_manager' } },
      { id: 'n3', name: 'end', type: 'end', onApprove: { setField: { status: 'approved' } } },
    ],
  }
  const r = await call('PUT', `/flows/${FLOW_ID}`, def)
  check('PUT flow definition', r.status === 200 && r.json?.flowId === FLOW_ID, `status=${r.status} body=${JSON.stringify(r.json)}`)
}

/* 3. 非法定义被拦截（末节点非 end） */
{
  const bad = { flowId: 'smoke_fl_bad', name: 'bad', modelId: 'm_leave', mode: 'linear',
    nodes: [{ id: 'a', name: 'a', type: 'start' }, { id: 'b', name: 'b', type: 'start' }] }
  const r = await call('PUT', '/flows/smoke_fl_bad', bad)
  check('invalid definition rejected 400 INVALID_FLOW', r.status === 400 && r.json?.code === 'INVALID_FLOW', `status=${r.status}`)
  await call('DELETE', '/flows/smoke_fl_bad') // 不应存在，兜底清理
}

/* 4. 读模型字段构造 payload（required 给类型 mock，不拍脑袋猜字段） */
let rid = ''
{
  const r = await call('GET', '/models/m_leave')
  check('GET model m_leave', r.status === 200, `status=${r.status}`)
  const fields = r.json?.fields ?? []
  const payload = {}
  for (const f of fields) {
    switch (f.type) {
      case 'number': payload[f.key] = 1; break
      case 'boolean': payload[f.key] = true; break
      case 'date': payload[f.key] = '2026-10-15'; break
      case 'enum': payload[f.key] = (f.options ?? [])[0]?.value ?? 'x'; break
      default: payload[f.key] = f.required ? 'smoke' : undefined
    }
    if (payload[f.key] === undefined) delete payload[f.key]
  }

  /* 5. 提交记录 -> 联动启动流程实例 */
  const c = await call('POST', '/models/m_leave/records', payload)
  check('POST record (flow auto-start)', c.status === 200 && !!c.json?.id, `status=${c.status} body=${JSON.stringify(c.json)}`)
  rid = c.json?.id ?? ''

  /* 6. 实例查询：1 个 running、停在 approve 节点 */
  const i = await call('GET', `/flows/instances?recordId=${rid}`)
  const inst = i.json?.items?.[0]
  check('instance created running @ n2', i.status === 200 && i.json?.items?.length === 1 && inst?.status === 'running' && inst?.currentNodeId === 'n2', `body=${JSON.stringify(i.json)}`)

  /* 7. 待办中心：admin('*') 可见该任务 */
  const t = await call('GET', '/flows/tasks/todo')
  const task = (t.json?.items ?? []).find((x) => x.instanceId === inst?.id)
  check('todo visible for admin', t.status === 200 && !!task, `body=${JSON.stringify(t.json)}`)

  /* 8. approve -> end：实例 approved + setField 回写记录（服务端回读 B-35） */
  const d = await call('POST', `/flows/instances/${inst.id}/tasks/${task.taskId}`, { action: 'approve', comment: 'smoke ok' })
  check('decide approve -> instance approved', d.status === 200 && d.json?.status === 'approved' && d.json?.currentNodeId === 'n3', `status=${d.status} body=${JSON.stringify(d.json)}`)

  const list = await call('GET', `/models/m_leave/records?filter=${encodeURIComponent(JSON.stringify({}))}&size=100`)
  const row = (list.json?.items ?? []).find((x) => x.id === rid)
  check('record payload.status == approved (server read-back)', row?.payload?.status === 'approved' || row?.status === 'approved', `row=${JSON.stringify(row)}`)

  /* 9. 重复审批 stale */
  /* 9. 终态后再审批 -> 400 FLOW_NOT_RUNNING（终态检查先于任务检查；
        中间节点的旧任务再审批才报 FLOW_TASK_STALE，两层语义集成测试分别覆盖） */
  const again = await call('POST', `/flows/instances/${inst.id}/tasks/${task.taskId}`, { action: 'approve' })
  check('re-decide after end 400 FLOW_NOT_RUNNING', again.status === 400 && again.json?.code === 'FLOW_NOT_RUNNING', `status=${again.status} code=${again.json?.code}`)

  /* 10. 清理：软删冒烟记录（实例保留审计） */
  await call('DELETE', `/models/m_leave/records/${rid}`)
}

/* 11. 定义删除 -> 404（实例不受影响） */
{
  const d = await call('DELETE', `/flows/${FLOW_ID}`)
  check('DELETE definition 204', d.status === 204, `status=${d.status}`)
  const g = await call('GET', `/flows/${FLOW_ID}`)
  check('GET deleted definition 404', g.status === 404, `status=${g.status}`)
}

console.log(failed === 0 ? 'SMOKE OK (all pass)' : `SMOKE FAILED (${failed})`)
process.exit(failed === 0 ? 0 : 1)
