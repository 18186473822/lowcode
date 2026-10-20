#!/usr/bin/env node
/**
 * smoke-p3b4.mjs —— Phase 3 批 4 冒烟：门户页（portal）配置校验 + Schema 落库回读。
 *
 * 用法（需服务端已启动）：
 *   node apps/server/scripts/smoke-p3b4.mjs
 *   LC_BASE=http://127.0.0.1:3000 node apps/server/scripts/smoke-p3b4.mjs
 *
 * 断言（B-35：写库后必服务端回读）：
 *   ① 合法 portal 页 PUT → 200，validation.valid=true；
 *   ② GET ?version=draft 回读 → portal.cards 3 张、root 下 Chart×3 + Statistic×1（顺序保持）；
 *   ③ 非法 portal（卡片 title 为空）→ 400 SCHEMA_INVALID，且 errors 指向 portal.cards[0].title；
 *   ④ 复原合法页，避免冒烟把环境留在非法状态。
 *
 * 退出码：全过 0；任一失败 1（便于 CI / 人工一键判定）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.LC_BASE ?? 'http://127.0.0.1:3000'
const USER = process.env.LC_USER ?? 'admin'
const PASS = process.env.LC_PASS ?? 'admin123'
const PAGE_ID = 'pgc_demo'
const SEED = join(dirname(fileURLToPath(import.meta.url)), 'seed-pgc-demo.json')

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

const seed = JSON.parse(readFileSync(SEED, 'utf8'))
const goodSchema = seed.schema

console.log(`smoke-p3b4 @ ${BASE}`)

// ① 登录
const login = await api('/auth/login', { method: 'POST', body: { username: USER, password: PASS } })
check('登录成功', login.status === 200 && typeof login.json?.accessToken === 'string', login.status)
const token = login.json?.accessToken
if (!token) process.exit(1)

// ② 写入合法 portal 页
const put = await api(`/pages/${PAGE_ID}/schema`, {
  method: 'PUT',
  token,
  body: { schema: goodSchema },
})
check('合法 portal 页 PUT 200', put.status === 200, { status: put.status, body: put.json })
check('服务端校验通过（validation.valid）', put.json?.validation?.valid === true, put.json?.validation)

// ③ 回读草稿
const got = await api(`/pages/${PAGE_ID}/schema?version=draft`, { token })
const schema = got.json?.schema
check('回读草稿 200', got.status === 200 && !!schema, got.status)
check('type=portal 已落库', schema?.type === 'portal', schema?.type)
check('portal.cards 3 张', schema?.portal?.cards?.length === 3, schema?.portal?.cards?.length)
check(
  'portal.columns 落库',
  schema?.portal?.columns === 2,
  schema?.portal?.columns,
)

const children = Array.isArray(schema?.root?.children) ? schema.root.children : []
const charts = children.filter((n) => n?.componentName === 'Chart')
const stats = children.filter((n) => n?.componentName === 'Statistic')
check('root 下 Chart×3', charts.length === 3, charts.length)
check(
  '三种形态齐全（bar/line/pie）',
  ['bar', 'line', 'pie'].every((t) => charts.some((c) => c?.props?.chartType === t)),
  charts.map((c) => c?.props?.chartType),
)
check('root 下 Statistic×1', stats.length === 1, stats.length)
check(
  'Chart 绑定模型聚合参数保留',
  charts.every((c) => c?.props?.modelId === 'm_employee' && c?.props?.dimension === 'dept'),
  charts.map((c) => ({ modelId: c?.props?.modelId, dimension: c?.props?.dimension })),
)

// ④ 非法 portal：卡片 title 为空 → 400 SCHEMA_INVALID
const bad = JSON.parse(JSON.stringify(goodSchema))
bad.portal.cards[0].title = ''
const badPut = await api(`/pages/${PAGE_ID}/schema`, { method: 'PUT', token, body: { schema: bad } })
check('非法 portal（卡片空标题）→ 400', badPut.status === 400, badPut.status)
check('错误码 SCHEMA_INVALID', badPut.json?.code === 'SCHEMA_INVALID', badPut.json?.code)
const paths = Array.isArray(badPut.json?.errors) ? badPut.json.errors.map((e) => e?.path) : []
check(
  '错误定位到 portal.cards[0].title',
  paths.includes('portal.cards[0].title'),
  paths,
)

// ⑤ 复原（冒烟不留脏状态）
const restore = await api(`/pages/${PAGE_ID}/schema`, {
  method: 'PUT',
  token,
  body: { schema: goodSchema },
})
check('复原合法页', restore.status === 200, restore.status)

console.log(failed === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL（${failed} 项）`)
process.exit(failed === 0 ? 0 : 1)
