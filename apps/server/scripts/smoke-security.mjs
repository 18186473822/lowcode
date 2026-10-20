import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const repo = process.argv[2] ?? process.cwd()
const STRONG_SECRET = 'smoke-secret-0123456789-abcdefghij'

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

async function waitReady(base, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/v1/auth/me`)
      if (res.status === 401) return
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server not ready')
}

async function runDevSmoke() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'lc-sec-smoke-'))
  let stderr = ''
  const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
    cwd: repo,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: '3100',
      LC_DATA_DIR: dataDir,
      LC_JWT_SECRET: STRONG_SECRET,
      LC_CORS_ORIGINS: 'http://localhost:5174',
      LC_LOGIN_RATE_LIMIT_MAX: '2',
      LC_RATE_LIMIT_MAX: '100',
      LC_RATE_LIMIT_WINDOW_MS: '60000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stderr.on('data', (d) => {
    stderr += d.toString()
  })
  child.stdout.on('data', () => {})

  const base = 'http://127.0.0.1:3100'
  try {
    await waitReady(base)

    const preflight = await fetch(`${base}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5174',
        'Access-Control-Request-Method': 'POST',
      },
    })
    assert(preflight.status === 204, `allowed preflight status=${preflight.status}`)
    assert(
      preflight.headers.get('access-control-allow-origin') === 'http://localhost:5174',
      'allowed origin header',
    )
    console.log(`PASS CORS allowed preflight 204 + ACAO`)

    const denied = await fetch(`${base}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    })
    assert(!denied.headers.get('access-control-allow-origin'), 'disallowed origin must not get ACAO')
    console.log(`PASS CORS disallowed origin has no ACAO (status=${denied.status})`)

    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: 'http://localhost:5174' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
    const loginBody = await login.json()
    assert(login.status === 200, `login status=${login.status}`)
    assert(loginBody.accessToken, 'login token')
    assert(
      login.headers.get('access-control-allow-origin') === 'http://localhost:5174',
      'login ACAO',
    )
    console.log('PASS login 200 + token + ACAO')

    const me = await fetch(`${base}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${loginBody.accessToken}` },
    })
    assert(me.status === 200, `me status=${me.status}`)
    console.log('PASS /auth/me 200')

    const wrong = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    })
    assert(wrong.status === 401, `second login status=${wrong.status}`)
    console.log('PASS second login 401')

    const blocked = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    })
    const blockedBody = await blocked.json()
    assert(blocked.status === 429, `third login status=${blocked.status}`)
    assert(blockedBody.code === 'RATE_LIMITED', `rate code=${blockedBody.code}`)
    assert(blocked.headers.get('retry-after'), 'retry-after header')
    console.log('PASS third login 429 + RATE_LIMITED + Retry-After')
  } finally {
    child.kill()
    await waitExit(child, 10000).catch(() => {})
    await rm(dataDir, { recursive: true, force: true })
    if (stderr.trim()) console.log(`server stderr: ${stderr.trim().split('\n').slice(-3).join(' | ')}`)
  }
}

async function runDevFallbackSmoke() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'lc-sec-dev-'))
  let output = ''
  const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
    cwd: repo,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: '3103',
      LC_DATA_DIR: dataDir,
      LC_JWT_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => {
    output += d.toString()
  })
  child.stderr.on('data', (d) => {
    output += d.toString()
  })

  try {
    await waitReady('http://127.0.0.1:3103')
    assert(/LC_JWT_SECRET 未设置/.test(output), `dev fallback warning: ${output}`)
    console.log('PASS development fallback starts + warning')
  } finally {
    child.kill()
    await waitExit(child, 10000).catch(() => {})
    await rm(dataDir, { recursive: true, force: true })
  }
}

async function runFailClosedSmoke() {
  const cases = [
    {
      name: 'production missing LC_JWT_SECRET',
      env: { NODE_ENV: 'production', LC_JWT_SECRET: '' },
      expect: /LC_JWT_SECRET/,
    },
    {
      name: 'production short LC_JWT_SECRET',
      env: { NODE_ENV: 'production', LC_JWT_SECRET: 'too-short' },
      expect: /至少需要/,
    },
    {
      name: 'CORS wildcard',
      env: { NODE_ENV: 'development', LC_JWT_SECRET: STRONG_SECRET, LC_CORS_ORIGINS: '*' },
      expect: /通配符/,
    },
  ]

  for (const c of cases) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'lc-sec-fail-'))
    let output = ''
    const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
      cwd: repo,
      env: { ...process.env, PORT: '3199', LC_DATA_DIR: dataDir, ...c.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (d) => {
      output += d.toString()
    })
    child.stderr.on('data', (d) => {
      output += d.toString()
    })
    const code = await waitExit(child, 10000)
    assert(code !== 0, `${c.name}: exit code should be non-zero (got ${code})`)
    assert(c.expect.test(output), `${c.name}: output should match ${c.expect}: ${output}`)
    console.log(`PASS ${c.name} -> exit ${code}`)
    await rm(dataDir, { recursive: true, force: true })
  }
}

await runDevSmoke()
await runDevFallbackSmoke()
await runFailClosedSmoke()
console.log('ALL SECURITY SMOKE PASSED')
