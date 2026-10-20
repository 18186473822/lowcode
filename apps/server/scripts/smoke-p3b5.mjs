#!/usr/bin/env node
/**
 * smoke-p3b5.mjs —— Phase 3 批 5 冒烟：运维事件上报 / 查询 / 汇总（B-35：写后必回读）。
 *
 * 用法（需服务端已启动）：
 *   node apps/server/scripts/smoke-p3b5.mjs
 *   LC_BASE=http://127.0.0.1:3000 node apps/server/scripts/smoke-p3b5.mjs
 *
 * 断言：
 *   ① 上报 3 条事件（perf×2 + error×1）→ 200 accepted=3；
 *   ② 查询回读：新→旧、服务端补 id/at/userId、按 pageId 过滤；
 *   ③ 汇总回读：byType / errors.total / perf avg·p95·max（DoD「耗时指标接口回读」）；
 *   ④ 权限：designer 读汇总 → 403 PERMISSION_DENIED；
 *   ⑤ 结构校验：perf 缺 durationMs → 400 OPS_INVALID；批量 >50 → 400；
 *   ⑥ 校验失败不落库（汇总仍是 3 条）。
 *
 * 使用独立 pageId（`pgc_ops_smoke_<时间戳>`），不干扰真实页面的统计，且可重复执行。
 * 退出码：全过 0；任一失败 1。
 */
const BASE = process.env.LC_BASE ?? 'http://127.0.0.1:3000'
const USER = process.env.LC_USER ?? 'admin'
const PASS = process.env.LC_PASS ?? 'admin123'
const PAGE_ID = `pgc_ops_smoke_${Date.now().toString(36)}`

let failed = 0
function check(name, cond, extra) {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${extra === undefined ? '' : ` → ${JSON.stringify(extra)}`}`)
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

async function login(username, password) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password } })
  return r.status === 200 ? r.json?.accessToken : undefined
}

console.log(`smoke-p3b5 @ ${BASE}`)

// ① 登录（admin 可读，designer 用于验证只读被拒）
const token = await login(USER, PASS)
check('admin 登录成功', typeof token === 'string', token)
if (!token) process.exit(1)
const designerToken = await login('designer', 'designer123')
check('designer 登录成功', typeof designerToken === 'string')

// ② 上报 3 条
const ingest = await api('/ops/events', {
  method: 'POST',
  token,
  body: {
    events: [
      { type: 'perf', name: 'schema-load', pageId: PAGE_ID, durationMs: 120, detail: { version: 'draft', nodes: 12 } },
      { type: 'perf', name: 'render', pageId: PAGE_ID, durationMs: 45 },
      { type: 'error', name: 'expr', pageId: PAGE_ID, message: 'Unexpected token +', detail: { nodeId: 'n1', expr: 'a +' } },
    ],
  },
})
check('上报 200', ingest.status === 200, ingest.status)
check('accepted=3', ingest.json?.accepted === 3, ingest.json)
check('total ≥ 3', typeof ingest.json?.total === 'number' && ingest.json.total >= 3, ingest.json?.total)

// ③ 查询回读
const list = await api(`/ops/events?pageId=${PAGE_ID}&limit=10`, { token })
const items = Array.isArray(list.json?.items) ? list.json.items : []
check('查询 200 且本页 3 条', list.status === 200 && list.json?.total === 3, { status: list.status, total: list.json?.total })
check('新 → 旧（最后上报的 expr 在最前）', items[0]?.name === 'expr', items.map((e) => e?.name))
check('服务端补 id（evt_ 前缀）', typeof items[0]?.id === 'string' && items[0].id.startsWith('evt_'), items[0]?.id)
check('服务端补 at（ISO）', /^\d{4}-\d{2}-\d{2}T/.test(items[0]?.at ?? ''), items[0]?.at)
check('服务端补 userId', typeof items[0]?.userId === 'string' && items[0].userId.length > 0, items[0]?.userId)
check('detail 原样回读', items[0]?.detail?.nodeId === 'n1' && items[0]?.detail?.expr === 'a +', items[0]?.detail)

// ④ 汇总回读（DoD）
const sum = await api(`/ops/summary?pageId=${PAGE_ID}`, { token })
const perf = sum.json?.perf
check('汇总 200', sum.status === 200, sum.status)
check('total=3', sum.json?.total === 3, sum.json?.total)
check('byType perf=2 / error=1', sum.json?.byType?.perf === 2 && sum.json?.byType?.error === 1, sum.json?.byType)
check('errors.total=1', sum.json?.errors?.total === 1, sum.json?.errors)
check('perf.count=2', perf?.count === 2, perf)
check('perf.avgMs=82.5', perf?.avgMs === 82.5, perf)
check('perf.p95Ms=120', perf?.p95Ms === 120, perf)
check('perf.maxMs=120', perf?.maxMs === 120, perf)

// ⑤ 权限：designer 读 → 403
const denied = await api(`/ops/summary?pageId=${PAGE_ID}`, { token: designerToken })
check('designer 读汇总 → 403', denied.status === 403, denied.status)
check('错误码 PERMISSION_DENIED', denied.json?.code === 'PERMISSION_DENIED', denied.json?.code)

// ⑥ 结构校验
const badPerf = await api('/ops/events', {
  method: 'POST',
  token,
  body: { events: [{ type: 'perf', name: 'render', pageId: PAGE_ID }] },
})
check('perf 缺 durationMs → 400', badPerf.status === 400, badPerf.status)
check('错误码 OPS_INVALID', badPerf.json?.code === 'OPS_INVALID', badPerf.json?.code)
check('错误定位 events[0]', String(badPerf.json?.message ?? '').includes('events[0]'), badPerf.json?.message)

const tooMany = await api('/ops/events', {
  method: 'POST',
  token,
  body: { events: Array.from({ length: 51 }, () => ({ type: 'event', name: 'x' })) },
})
check('批量 51 条 → 400', tooMany.status === 400, tooMany.status)

// ⑦ 校验失败不落库
const after = await api(`/ops/summary?pageId=${PAGE_ID}`, { token })
check('校验失败未落库（仍 3 条）', after.json?.total === 3, after.json?.total)

console.log(failed === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL（${failed} 项）`)
process.exit(failed === 0 ? 0 : 1)
