/**
 * MySQL 模式真实启动冒烟（不会触碰开发库 lowcode）。
 *
 * 前置：
 *   1. `pnpm -F @lc/server build`
 *   2. 已对 lowcode_test 执行 `prisma migrate deploy`
 *   3. 设置 LC_SMOKE_DATABASE_URL（或 LC_TEST_DATABASE_URL）指向 *_test 库
 *
 * 验证（10 项）：MySQL readiness、登录、页面草稿/发布/版本、模型/记录、流程定义/实例、
 * RBAC、ops 事件、app_config、文件元数据/内容、级联删除；并通过 Prisma 回读数据库行，
 * 证明不是只写了内存/文件。
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(scriptDir, '../../..')
const base = 'http://127.0.0.1:3105'
const databaseUrl =
  process.env.LC_SMOKE_DATABASE_URL ??
  process.env.LC_TEST_DATABASE_URL ??
  process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('缺少 LC_SMOKE_DATABASE_URL / LC_TEST_DATABASE_URL / DATABASE_URL')
  process.exit(1)
}

const dbName = new URL(databaseUrl).pathname.replace(/^\//, '')
if (!dbName.endsWith('_test')) {
  console.error(`拒绝在非测试库执行冒烟：${dbName}（库名必须以 _test 结尾）`)
  process.exit(1)
}

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`)
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`
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
      const res = await fetch(`${base}/api/v1/ready`)
      if (res.status === 200) {
        const body = await res.json()
        if (body.checks?.database === 'ok') return
      }
    } catch {
      /* not ready */
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('MySQL server not ready')
}

async function call(method, apiPath, { body, token } = {}) {
  const res = await fetch(`${base}/api/v1${apiPath}`, {
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
    /* ignore */
  }
  return { status: res.status, data }
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const dataDir = await mkdtemp(path.join(tmpdir(), 'lc-mysql-smoke-'))
let stdout = ''
let child

try {
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0')
  for (const table of [
    'data_records',
    'page_versions',
    'pages',
    'models',
    'user_roles',
    'roles',
    'users',
    'rbac_page_grants',
    'flow_instances',
    'flow_definitions',
    'ops_events',
    'app_config',
    'files',
  ]) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``)
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1')

  await prisma.role.createMany({
    data: [
      { key: 'admin', name: '平台管理员', perms: ['*'] },
      { key: 'designer', name: '设计器用户', perms: [] },
    ],
  })
  await prisma.user.create({
    data: {
      id: 'u_admin',
      username: 'admin',
      displayName: '平台管理员',
      passwordHash: hashPassword('admin123'),
      status: 'active',
      roles: { create: [{ roleKey: 'admin' }] },
    },
  })
  await prisma.user.create({
    data: {
      id: 'u_designer',
      username: 'designer',
      displayName: '设计器用户',
      passwordHash: hashPassword('designer123'),
      status: 'active',
      roles: { create: [{ roleKey: 'designer' }] },
    },
  })

  child = spawn(process.execPath, ['apps/server/dist/main.js'], {
    cwd: repo,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: '3105',
      LC_DATA_DIR: dataDir,
      LC_STORAGE: 'mysql',
      DATABASE_URL: databaseUrl,
      LC_JWT_SECRET: 'smoke-secret-0123456789-abcdefghij',
      LC_ACCESS_LOG: '0',
      LC_RATE_LIMIT_MAX: '1000',
      LC_LOGIN_RATE_LIMIT_MAX: '100',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    stdout += chunk.toString()
  })

  await waitReady()

  const ready = await call('GET', '/ready')
  assert(ready.status === 200, `ready status=${ready.status}`)
  assert(ready.data.storage === 'mysql', `ready storage=${ready.data.storage}`)
  assert(ready.data.checks.database === 'ok', 'ready database check')
  console.log('PASS /ready 200 + MySQL SELECT 1')

  const login = await call('POST', '/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  })
  assert(login.status === 200, `login status=${login.status}`)
  assert(login.data.user.roles.includes('admin'), 'admin roles from MySQL')
  const token = login.data.accessToken
  console.log('PASS login from MySQL user/role tables')

  const fileBytes = Buffer.from('mysql-smoke-file-content')
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(fileBytes)], { type: 'text/plain' }), 'mysql-smoke.txt')
  const uploadRes = await fetch(`${base}/api/v1/files/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  })
  const uploaded = await uploadRes.json()
  assert(uploadRes.status === 200, `upload status=${uploadRes.status}`)
  assert(uploaded.name === 'mysql-smoke.txt', `upload name=${uploaded.name}`)
  const dbFile = await prisma.fileObject.findUnique({ where: { id: uploaded.fileId } })
  assert(dbFile?.mimeType === 'text/plain', `file mime=${dbFile?.mimeType}`)
  assert(dbFile?.uploadedBy === 'admin', `file uploader=${dbFile?.uploadedBy}`)
  assert(
    dbFile !== null && Buffer.from(dbFile.content).equals(fileBytes),
    'file content from MySQL',
  )
  const download = await fetch(`${base}/api/v1/files/${uploaded.fileId}`)
  assert(download.status === 200, `download status=${download.status}`)
  assert(Buffer.from(await download.arrayBuffer()).equals(fileBytes), 'download bytes match')
  console.log('PASS file metadata + content persisted (files)')

  const pageSchema = {
    schemaVersion: '1.0.0',
    id: 'p_mysql_smoke',
    name: 'MySQL 冒烟页',
    type: 'form',
    root: {
      id: 'root',
      componentName: 'Page',
      children: [{ id: 'n1', componentName: 'Input', props: { name: 'title', label: '标题' } }],
    },
  }
  const saved = await call('PUT', '/pages/p_mysql_smoke/schema', {
    body: { schema: pageSchema, appId: 'app_smoke' },
    token,
  })
  assert(saved.status === 200, `save page status=${saved.status}`)
  const published = await call('POST', '/pages/p_mysql_smoke/publish', {
    body: { note: 'mysql-smoke' },
    token,
  })
  assert(published.status === 200, `publish status=${published.status}`)

  const dbPage = await prisma.page.findUnique({
    where: { id: 'p_mysql_smoke' },
    include: { versions: true },
  })
  assert(dbPage?.status === 'published', `db page status=${dbPage?.status}`)
  assert(dbPage?.versions.length === 1, `db versions=${dbPage?.versions.length}`)
  console.log('PASS page draft/publish persisted (pages + page_versions)')

  const model = {
    schemaVersion: '1.0.0',
    id: 'md_mysql_smoke',
    name: 'MySQL 冒烟模型',
    code: 'mysql_smoke',
    fields: [{ key: 'name', name: '名称', type: 'string', required: true }],
  }
  const modelSaved = await call('PUT', '/models/md_mysql_smoke', { body: model, token })
  assert(modelSaved.status === 200, `save model status=${modelSaved.status}`)
  const flow = {
    flowId: 'fl_mysql_smoke',
    name: 'MySQL 冒烟流程',
    modelId: 'md_mysql_smoke',
    mode: 'linear',
    nodes: [
      { id: 'n1', type: 'start', name: '开始' },
      { id: 'n2', type: 'approve', name: '审批', assignee: { type: 'role', value: 'admin' } },
      { id: 'n3', type: 'end', name: '结束' },
    ],
  }
  const flowSaved = await call('PUT', '/flows/fl_mysql_smoke', { body: flow, token })
  assert(flowSaved.status === 200, `save flow status=${flowSaved.status}`)
  const dbFlow = await prisma.flowDefinition.findUnique({ where: { flowId: 'fl_mysql_smoke' } })
  assert(dbFlow?.modelId === 'md_mysql_smoke', 'flow definition from MySQL')
  console.log('PASS flow definition persisted (flow_definitions)')

  const created = await call('POST', '/models/md_mysql_smoke/records', {
    body: { name: '记录一' },
    token,
  })
  assert(created.status === 200, `create record status=${created.status}`)
  const dbRecord = await prisma.dataRecord.findUnique({
    where: { modelId_id: { modelId: 'md_mysql_smoke', id: created.data.id } },
  })
  assert(dbRecord?.payload.name === '记录一', 'record payload from MySQL')
  const dbInstance = await prisma.flowInstance.findFirst({
    where: { flowId: 'fl_mysql_smoke', recordId: created.data.id },
  })
  assert(dbInstance?.status === 'running', 'flow instance from MySQL')
  assert(Array.isArray(dbInstance?.tasksJson) && dbInstance.tasksJson.length === 1, 'flow tasks JSON')
  console.log('PASS model + record + flow instance persisted')

  const rbac = await call('GET', '/rbac/roles', { token })
  assert(rbac.status === 200, `rbac status=${rbac.status}`)
  assert(rbac.data.roles.some((role) => role.key === 'admin'), 'rbac roles from MySQL')
  console.log('PASS RBAC roles read from MySQL')

  const ingested = await call('POST', '/ops/events', {
    token,
    body: { events: [{ type: 'event', name: 'mysql-smoke', pageId: 'pg_mysql_smoke' }] },
  })
  assert(ingested.status === 200, `ops ingest status=${ingested.status}`)
  const dbOps = await prisma.opsEvent.findMany({ where: { pageId: 'pg_mysql_smoke' } })
  assert(dbOps.length === 1 && dbOps[0].name === 'mysql-smoke', 'ops event from MySQL')
  console.log('PASS ops event persisted (ops_events)')

  const theme = await call('PUT', '/apps/config', {
    token,
    body: { theme: { primary: '#2255AA', radius: '10px' } },
  })
  assert(theme.status === 200, `app config status=${theme.status}`)
  const dbConfig = await prisma.appConfig.findUnique({ where: { id: 'default' } })
  assert(dbConfig?.theme?.primary === '#2255AA', 'app config from MySQL')
  console.log('PASS app config persisted (app_config)')

  const removed = await call('DELETE', '/pages/p_mysql_smoke', { token })
  assert(removed.status === 200, `delete page status=${removed.status}`)
  const orphans = await prisma.pageVersion.count({ where: { pageId: 'p_mysql_smoke' } })
  assert(orphans === 0, `orphan versions=${orphans}`)
  console.log('PASS delete page cascades page_versions')

  console.log('ALL MYSQL SMOKE PASSED')
} catch (error) {
  console.error('--- server output ---')
  console.error(stdout)
  throw error
} finally {
  if (child) {
    child.kill()
    await waitExit(child, 10000).catch(() => {})
  }
  await prisma.$disconnect()
  await rm(dataDir, { recursive: true, force: true })
}
