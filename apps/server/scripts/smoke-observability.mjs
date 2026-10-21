/**
 * 可观测性真实启动冒烟：
 * - `/health` / `/ready` 探针；
 * - `X-Request-Id` 透传与非法值替换；
 * - 结构化访问日志为单行 JSON，且不包含 query 中的敏感串。
 *
 * 用法：node apps/server/scripts/smoke-observability.mjs [仓库根目录]
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 允许从仓库根或 `pnpm -F @lc/server` 两种 cwd 调用；默认按脚本位置回推仓库根。
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repo = process.argv[2] ?? path.resolve(scriptDir, '../../..')
const STRONG_SECRET = 'smoke-secret-0123456789-abcdefghij'
const BASE = 'http://127.0.0.1:3104'

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`)
}

function waitExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('process did not exit in time')), timeoutMs)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

async function waitReady(timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/v1/health`)
      if (res.status === 200) return
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server not ready')
}

const dataDir = await mkdtemp(path.join(tmpdir(), 'lc-obs-smoke-'))
let stdout = ''
const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
  cwd: repo,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: '3104',
    LC_DATA_DIR: dataDir,
    LC_JWT_SECRET: STRONG_SECRET,
    LC_ACCESS_LOG: '1',
    LC_CORS_ORIGINS: 'http://localhost:5174',
    LC_APP_VERSION: '9.9.9-smoke',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', (d) => {
  stdout += d.toString()
})
child.stderr.on('data', (d) => {
  stdout += d.toString()
})

try {
  await waitReady()

  const health = await fetch(`${BASE}/api/v1/health`, {
    headers: { 'x-request-id': 'obs-smoke-001' },
  })
  const healthBody = await health.json()
  assert(health.status === 200, `health status=${health.status}`)
  assert(healthBody.status === 'ok', 'health body status')
  assert(healthBody.version === '9.9.9-smoke', `health version=${healthBody.version}`)
  assert(health.headers.get('x-request-id') === 'obs-smoke-001', 'request id echo')
  console.log('PASS /health 200 + version + X-Request-Id')

  const invalidId = await fetch(`${BASE}/api/v1/health`, {
    headers: { 'x-request-id': 'bad id' },
  })
  const generated = invalidId.headers.get('x-request-id') ?? ''
  assert(generated !== 'bad id', 'invalid id must be replaced')
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(generated),
    `generated id=${generated}`,
  )
  console.log('PASS invalid X-Request-Id replaced by UUID')

  const ready = await fetch(`${BASE}/api/v1/ready`)
  const readyBody = await ready.json()
  assert(ready.status === 200, `ready status=${ready.status}`)
  assert(readyBody.checks?.dataDir === 'ok', 'ready dataDir')
  console.log('PASS /ready 200 + dataDir ok')

  const missing = await fetch(`${BASE}/api/v1/not-found?token=secret-token`, {
    headers: { 'x-request-id': 'obs-smoke-002' },
  })
  assert(missing.status === 404, `missing status=${missing.status}`)
  await new Promise((r) => setTimeout(r, 200))

  const access = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .find((entry) => entry?.type === 'access' && entry.requestId === 'obs-smoke-002')

  assert(access, 'access log line with requestId')
  assert(access.path === '/api/v1/not-found', `log path=${access.path}`)
  assert(access.status === 404, `log status=${access.status}`)
  assert(!JSON.stringify(access).includes('secret-token'), 'log must not contain query token')
  console.log('PASS structured access log (path/status, no query token)')

  console.log('ALL OBSERVABILITY SMOKE PASSED')
} catch (error) {
  console.error('--- server output ---')
  console.error(stdout)
  throw error
} finally {
  child.kill()
  await waitExit(child, 10000).catch(() => {})
  await rm(dataDir, { recursive: true, force: true })
}
