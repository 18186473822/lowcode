/**
 * 乐观锁 / 审批幂等集成测试（2026-10-22）：
 *
 * - 页面：GET 返回 ETag；PUT 带 If-Match 时版本不符 409；并发同版本只有一个成功；
 * - 记录：创建返回 revision/ETag；更新带 If-Match；并发更新只有一个成功；
 * - 流程：Idempotency-Key 重放返回当前实例（不重复推进）；并发审批只产生一次历史。
 *
 * 真实启动 Nest + 临时目录（JSON 仓储），验证服务端契约与文件仓储的进程内串行锁。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { FlowSchema, ModelSchema, PageSchema } from '@lc/schema'
import { AppModule } from '../src/app.module.js'

let app: INestApplication
let base: string
let dataDir: string
let token: string

interface CallOptions {
  body?: unknown
  token?: string
  headers?: Record<string, string>
}

async function call(method: string, apiPath: string, opts: CallOptions = {}) {
  const res = await fetch(`${base}${apiPath}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, body, headers: res.headers }
}

function pageSchema(name: string): PageSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'p_lock',
    name,
    type: 'form',
    root: {
      id: 'root',
      componentName: 'Page',
      children: [{ id: 'n1', componentName: 'Input', props: { name: 'title', label: '标题' } }],
    },
  } as PageSchema
}

function modelSchema(id: string): ModelSchema {
  return {
    schemaVersion: '1.0.0',
    id,
    name: '并发测试模型',
    code: `lock_${id.slice(-4)}`,
    fields: [
      { key: 'amount', name: '金额', type: 'number' },
      { key: 'status', name: '状态', type: 'string' },
    ],
  } as ModelSchema
}

function flowSchema(flowId: string, modelId: string): FlowSchema {
  return {
    flowId,
    name: '并发审批流程',
    modelId,
    mode: 'linear',
    nodes: [
      { id: 'n1', name: '提交', type: 'start' },
      { id: 'n2', name: '审批', type: 'approve', assignee: { type: 'role', value: 'admin' } },
      { id: 'n3', name: '结束', type: 'end', onApprove: { setField: { status: 'approved' } } },
    ],
  } as FlowSchema
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-concurrency-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret-0123456789-abcdefghij'

  app = await NestFactory.create(AppModule, { logger: false })
  app.setGlobalPrefix('api/v1')
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()

  const login = await call('POST', '/api/v1/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  })
  token = login.body.accessToken
  expect(token).toBeTruthy()
})

afterAll(async () => {
  await app?.close()
  await rm(dataDir, { recursive: true, force: true })
})

describe('页面乐观锁', () => {
  it('GET 返回 ETag；首次保存 revision=1', async () => {
    const created = await call('PUT', '/api/v1/pages/p_lock/schema', {
      body: { schema: pageSchema('锁测试') },
      token,
    })
    expect(created.status).toBe(200)
    expect(created.body.revision).toBe(1)
    expect(created.headers.get('etag')).toBe('"page:p_lock:1"')

    const got = await call('GET', '/api/v1/pages/p_lock/schema', { token })
    expect(got.status).toBe(200)
    expect(got.body.revision).toBe(1)
    expect(got.headers.get('etag')).toBe('"page:p_lock:1"')
  })

  it('If-Match 匹配时更新成功并推进 revision', async () => {
    const got = await call('GET', '/api/v1/pages/p_lock/schema', { token })
    const etag = got.headers.get('etag')!
    const r = await call('PUT', '/api/v1/pages/p_lock/schema', {
      body: { schema: pageSchema('锁测试 v2') },
      token,
      headers: { 'if-match': etag },
    })
    expect(r.status).toBe(200)
    expect(r.body.revision).toBe(2)
  })

  it('陈旧 If-Match → 409 VERSION_CONFLICT', async () => {
    const r = await call('PUT', '/api/v1/pages/p_lock/schema', {
      body: { schema: pageSchema('陈旧写') },
      token,
      headers: { 'if-match': '"page:p_lock:1"' },
    })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('VERSION_CONFLICT')
    expect(r.body.currentRevision).toBe(2)
  })

  it('非法 If-Match → 400 INVALID_IF_MATCH', async () => {
    const r = await call('PUT', '/api/v1/pages/p_lock/schema', {
      body: { schema: pageSchema('坏头') },
      token,
      headers: { 'if-match': '"not-a-page-etag"' },
    })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_IF_MATCH')
  })

  it('并发 PUT 同版本只有一个成功', async () => {
    const got = await call('GET', '/api/v1/pages/p_lock/schema', { token })
    const etag = got.headers.get('etag')!
    const [a, b] = await Promise.all([
      call('PUT', '/api/v1/pages/p_lock/schema', {
        body: { schema: pageSchema('并发 A') },
        token,
        headers: { 'if-match': etag },
      }),
      call('PUT', '/api/v1/pages/p_lock/schema', {
        body: { schema: pageSchema('并发 B') },
        token,
        headers: { 'if-match': etag },
      }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const final = await call('GET', '/api/v1/pages/p_lock/schema', { token })
    expect(final.body.revision).toBe(3)
  })
})

describe('记录乐观锁', () => {
  let etag: string

  beforeAll(async () => {
    const model = await call('PUT', '/api/v1/models/md_lock_record', {
      body: modelSchema('md_lock_record'),
      token,
    })
    expect(model.status).toBe(200)
  })

  it('创建返回 revision/ETag；If-Match 更新成功', async () => {
    const created = await call('POST', '/api/v1/models/md_lock_record/records', {
      body: { amount: 1 },
      token,
    })
    expect(created.status).toBe(200)
    expect(created.body.revision).toBe(0)
    expect(created.headers.get('etag')).toBe(
      `"record:md_lock_record/${created.body.id}:0"`,
    )

    etag = created.headers.get('etag')!
    const updated = await call('PUT', `/api/v1/models/md_lock_record/records/${created.body.id}`, {
      body: { amount: 2 },
      token,
      headers: { 'if-match': etag },
    })
    expect(updated.status).toBe(200)
    expect(updated.body.revision).toBe(1)
    expect(updated.body.amount).toBe(2)

    const byRevision = await call(
      'GET',
      `/api/v1/models/md_lock_record/records?filter=${encodeURIComponent(JSON.stringify({ revision: 1 }))}`,
      { token },
    )
    expect(byRevision.body.total).toBe(1)
    expect(byRevision.body.items[0].id).toBe(created.body.id)
  })

  it('陈旧 If-Match → 409 VERSION_CONFLICT', async () => {
    const list = await call('GET', '/api/v1/models/md_lock_record/records', { token })
    const row = list.body.items.find((x: any) => x.amount === 2)
    expect(row).toBeTruthy()
    const r = await call('PUT', `/api/v1/models/md_lock_record/records/${row.id}`, {
      body: { amount: 3 },
      token,
      headers: { 'if-match': etag },
    })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('VERSION_CONFLICT')
  })

  it('并发更新同版本只有一个成功', async () => {
    const list = await call('GET', '/api/v1/models/md_lock_record/records', { token })
    const row = list.body.items.find((x: any) => x.amount === 2)
    const current = `"record:md_lock_record/${row.id}:${row.revision}"`
    const [a, b] = await Promise.all([
      call('PUT', `/api/v1/models/md_lock_record/records/${row.id}`, {
        body: { amount: 10 },
        token,
        headers: { 'if-match': current },
      }),
      call('PUT', `/api/v1/models/md_lock_record/records/${row.id}`, {
        body: { amount: 20 },
        token,
        headers: { 'if-match': current },
      }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
  })
})

describe('流程审批幂等与并发', () => {
  const modelId = 'md_lock_flow'
  const flowId = 'fl_lock'

  beforeAll(async () => {
    expect((await call('PUT', `/api/v1/models/${modelId}`, { body: modelSchema(modelId), token })).status).toBe(200)
    expect((await call('PUT', `/api/v1/flows/${flowId}`, { body: flowSchema(flowId, modelId), token })).status).toBe(200)
  })

  async function submitAndTask() {
    const created = await call('POST', `/api/v1/models/${modelId}/records`, {
      body: { amount: 100 },
      token,
    })
    expect(created.status).toBe(200)
    const instances = await call('GET', `/api/v1/flows/instances?recordId=${created.body.id}`, { token })
    const inst = instances.body.items[0]
    const task = inst.tasks.find((t: any) => t.status === 'pending')
    return { recordId: created.body.id as string, inst, task }
  }

  it('同一 Idempotency-Key 重放不重复推进（含终态）', async () => {
    const { recordId, inst, task } = await submitAndTask()
    const body = { action: 'approve', comment: '同意' }
    const first = await call('POST', `/api/v1/flows/instances/${inst.id}/tasks/${task.id}`, {
      body,
      token,
      headers: { 'idempotency-key': 'lock-key-1' },
    })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.status).toBe('approved')
    expect(first.headers.get('etag')).toBe(`"flow:${inst.id}:${first.body.revision}"`)
    const historyLen = first.body.history.length

    const replay = await call('POST', `/api/v1/flows/instances/${inst.id}/tasks/${task.id}`, {
      body,
      token,
      headers: { 'idempotency-key': 'lock-key-1' },
    })
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body.status).toBe('approved')
    expect(replay.body.history).toHaveLength(historyLen)

    const list = await call('GET', `/api/v1/models/${modelId}/records`, { token })
    const row = list.body.items.find((x: any) => x.id === recordId)
    expect(row.status).toBe('approved')
  })

  it('同一 Idempotency-Key 改变动作或意见 → 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const { inst, task } = await submitAndTask()
    const key = 'lock-key-reuse'
    const first = await call('POST', `/api/v1/flows/instances/${inst.id}/tasks/${task.id}`, {
      body: { action: 'approve', comment: '同意' },
      token,
      headers: { 'idempotency-key': key },
    })
    expect(first.status, JSON.stringify(first.body)).toBe(200)

    const changedAction = await call('POST', `/api/v1/flows/instances/${inst.id}/tasks/${task.id}`, {
      body: { action: 'reject', comment: '同意' },
      token,
      headers: { 'idempotency-key': key },
    })
    expect(changedAction.status).toBe(409)
    expect(changedAction.body.code).toBe('IDEMPOTENCY_KEY_REUSED')

    const changedComment = await call('POST', `/api/v1/flows/instances/${inst.id}/tasks/${task.id}`, {
      body: { action: 'approve', comment: '改意见' },
      token,
      headers: { 'idempotency-key': key },
    })
    expect(changedComment.status).toBe(409)
    expect(changedComment.body.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  it('并发审批同一任务只产生一次历史', async () => {
    const { recordId, inst, task } = await submitAndTask()
    const [a, b] = await Promise.all([
      call('POST', `/api/v1/flows/instances/${inst.id}/tasks/${task.id}`, {
        body: { action: 'approve', comment: '并发 A' },
        token,
        headers: { 'idempotency-key': 'lock-key-a' },
      }),
      call('POST', `/api/v1/flows/instances/${inst.id}/tasks/${task.id}`, {
        body: { action: 'approve', comment: '并发 B' },
        token,
        headers: { 'idempotency-key': 'lock-key-b' },
      }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 400])

    const got = await call('GET', `/api/v1/flows/instances/${inst.id}`, { token })
    expect(got.body.history.filter((h: any) => h.action === 'approve')).toHaveLength(1)
    expect(got.body.status).toBe('approved')

    const list = await call('GET', `/api/v1/models/${modelId}/records`, { token })
    const row = list.body.items.find((x: any) => x.id === recordId)
    expect(row.status).toBe('approved')
  })
})
