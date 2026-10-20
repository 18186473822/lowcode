#!/usr/bin/env node
/**
 * smoke-p3b3.mjs —— Phase 3 批 3 冒烟（应用配置 / 主题 API 级留档）
 *
 * 前置：server 已起 127.0.0.1:3000（真实 dist 产物 + 真实 data，B-19）。
 * 与批 2 smoke 的分工：批 2 锁待办闭环，本脚本锁**批 3 新增面**——
 *   `GET/PUT /apps/config`（读开放写受限、patch 语义、null 清除）+ bootstrap 下发 theme。
 * H5 页面级实测（草稿恢复 / 全站变色 / dark 开关）另见 PROGRESS 留档。
 *
 * 用法：node scripts/smoke-p3b3.mjs   （期望 12/12 PASS）
 *
 * 注意：P6 起会改写真实 data/apps.json 的 theme（冒烟即配置动作的一部分）；
 * 想还原令牌默认主题：P11 之后再 PUT 三个 null 即可（或直接删 data/apps.json）。
 */
import process from 'node:process'

const BASE = 'http://127.0.0.1:3000/api/v1'
let adminToken = ''
let designerToken = ''
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

async function api(method, path, body, token) {
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
    /* 无体响应 */
  }
  return { status: res.status, data }
}

async function login(username, password) {
  const r = await api('POST', '/auth/login', { username, password })
  return r.data?.accessToken ?? ''
}

const main = async () => {
  adminToken = await login('admin', 'admin123')
  designerToken = await login('designer', 'designer123')
  ok('P0 登录（admin + designer）', !!adminToken && !!designerToken)

  // P1 未登录读配置 → 401
  const anon = await api('GET', '/apps/config')
  ok('P1 未登录 GET /apps/config → 401', anon.status === 401)

  // P2 登录可读（初始无配置也应 200）
  const read0 = await api('GET', '/apps/config', undefined, designerToken)
  ok('P2 登录 GET /apps/config → 200', read0.status === 200)

  // P3 designer（无 '*'）写 → 403 PERMISSION_DENIED
  const denied = await api('PUT', '/apps/config', { theme: { primary: '#ff6600' } }, designerToken)
  ok(
    'P3 designer PUT → 403 PERMISSION_DENIED',
    denied.status === 403 && denied.data?.code === 'PERMISSION_DENIED',
    `got ${denied.status} ${denied.data?.code}`,
  )

  // P4 非法 primary → 400 APP_CONFIG_INVALID
  const badHex = await api('PUT', '/apps/config', { theme: { primary: 'red' } }, adminToken)
  ok(
    'P4 非法 primary → 400 APP_CONFIG_INVALID',
    badHex.status === 400 && badHex.data?.code === 'APP_CONFIG_INVALID',
    `got ${badHex.status} ${badHex.data?.code}`,
  )

  // P5 未知配置项 → 400
  const unknown = await api('PUT', '/apps/config', { theme: { logo: 'x.png' } }, adminToken)
  ok(
    'P5 未知配置项 → 400 APP_CONFIG_INVALID',
    unknown.status === 400 && unknown.data?.code === 'APP_CONFIG_INVALID',
    `got ${unknown.status} ${unknown.data?.code}`,
  )

  // P6 完整写入 → 200 回传
  const full = await api(
    'PUT',
    '/apps/config',
    { theme: { primary: '#3366ff', radius: '10px', dark: false } },
    adminToken,
  )
  ok(
    'P6 PUT 完整 theme → 200 回传一致',
    full.status === 200 &&
      full.data?.theme?.primary === '#3366ff' &&
      full.data?.theme?.radius === '10px' &&
      full.data?.theme?.dark === false,
    JSON.stringify(full.data),
  )

  // P7 GET 回读一致（B-35）
  const readBack = await api('GET', '/apps/config', undefined, adminToken)
  ok(
    'P7 GET 回读一致（B-35）',
    readBack.data?.theme?.primary === '#3366ff' && readBack.data?.theme?.radius === '10px',
    JSON.stringify(readBack.data),
  )

  // P8 bootstrap 顶层 theme 下发（B-35）
  const boot = await api('GET', '/apps/bootstrap', undefined, designerToken)
  ok(
    'P8 bootstrap.theme 与 config 一致（B-35）',
    boot.status === 200 && boot.data?.theme?.primary === '#3366ff',
    JSON.stringify(boot.data?.theme),
  )

  // P9 patch：只改 primary，radius/dark 保留
  const patch = await api('PUT', '/apps/config', { theme: { primary: '#ff0055' } }, adminToken)
  ok(
    'P9 patch 缺键保留（primary 换、radius/dark 不丢）',
    patch.data?.theme?.primary === '#ff0055' &&
      patch.data?.theme?.radius === '10px' &&
      patch.data?.theme?.dark === false,
    JSON.stringify(patch.data?.theme),
  )

  // P10 显式 null 清除 dark（bootstrap 同步反映）
  const cleared = await api('PUT', '/apps/config', { theme: { dark: null } }, adminToken)
  const boot2 = await api('GET', '/apps/bootstrap', undefined, adminToken)
  ok(
    'P10 null 清除 dark（config + bootstrap 同步）',
    !('dark' in (cleared.data?.theme ?? {})) && boot2.data?.theme?.primary === '#ff0055',
    JSON.stringify(cleared.data?.theme),
  )

  // P11 还原：三键全清 → theme 为空对象（回落令牌默认）
  const restore = await api(
    'PUT',
    '/apps/config',
    { theme: { primary: null, radius: null, dark: null } },
    adminToken,
  )
  ok(
    'P11 三键全清 → theme 空对象（令牌默认）',
    restore.status === 200 && Object.keys(restore.data?.theme ?? {}).length === 0,
    JSON.stringify(restore.data?.theme),
  )
}

main()
  .catch((e) => {
    fail++
    console.error('  冒烟脚本异常：', e)
  })
  .finally(() => {
    console.log(`\n  结果：${pass}/${pass + fail} PASS`)
    process.exit(fail === 0 ? 0 : 1)
  })
