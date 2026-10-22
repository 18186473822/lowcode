/**
 * Webhook 订阅 / 签名投递 / 重试与投递日志端到端测试（Phase 4 开放集成第二批）。
 *
 * 真实启动 Nest 应用 + 本机 HTTP 接收器：
 * - 管理员 CRUD、ETag/If-Match、409、secret 脱敏与轮换；
 * - 记录/流程事件入队，手动驱动 worker，校验真实 HTTP 请求的签名与事件信封；
 * - 测试投递、不可重试失败、手动重投、投递日志分页/过滤；
 * - 删除订阅后投递日志保留。
 *
 * 测试环境 `NODE_ENV=test` 时 WebhookService 不启动后台定时器，统一调用 `dispatchDue()`，
 * 避免 5s 定时器带来的随机时序。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { FlowSchema, ModelSchema } from '@lc/schema'
import { AppModule } from '../src/app.module.js'
import { WebhookService } from '../src/webhook/webhook.service.js'

/* ------------------------------------------------------------------ */
/* 环境与辅助                                                          */
/* ------------------------------------------------------------------ */

let app: INestApplication
let base: string
let dataDir: string
let receiver: Server
let receiverUrl: string
let token: string
let dToken: string

interface Captured {
  path: string
  headers: IncomingHttpHeaders
  body: string
}

let received: Captured[] = []
/** 下一次请求强制返回的状态码（用于失败/重试测试） */
let nextFailureStatus: number | undefined

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
  return {
    status: res.status,
    body,
    headers: Object.fromEntries(res.headers.entries()) as Record<string, string>,
  }
}

function header(captured: Captured, name: string): string {
  const value = captured.headers[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** 按与生产实现相同的算法重算签名，避免“只断言头存在”的假测试。 */
function expectedSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

async function dispatchAll(): Promise<number> {
  return app.get(WebhookService).dispatchDue()
}

function eventsOf(type: string): Captured[] {
  return received.filter((item) => {
    try {
      return (JSON.parse(item.body) as { type?: string }).type === type
    } catch {
      return false
    }
  })
}

/** 取当前 pending 任务（按 currentNodeId 对位）。 */
function pendingTask(instance: any): any {
  const task = instance.tasks.find(
    (item: any) => item.status === 'pending' && item.nodeId === instance.currentNodeId,
  )
  expect(task, `无 pending 任务：${JSON.stringify(instance.tasks)}`).toBeTruthy()
  return task
}

function model(): ModelSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'md_webhook',
    name: 'Webhook 测试模型',
    code: 'webhook_test',
    fields: [
      { key: 'name', name: '姓名', type: 'string' },
      { key: 'amount', name: '金额', type: 'number' },
      { key: 'status', name: '状态', type: 'string' },
    ],
  } as ModelSchema
}

function flow(): FlowSchema {
  return {
    flowId: 'fl_webhook',
    name: 'Webhook 审批',
    modelId: 'md_webhook',
    mode: 'linear',
    nodes: [
      { id: 'n1', name: '提交', type: 'start' },
      { id: 'n2', name: '管理员审批', type: 'approve', assignee: { type: 'role', value: 'admin' } },
      { id: 'n3', name: '结束', type: 'end', onApprove: { setField: { status: 'approved' } } },
    ],
  } as FlowSchema
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-webhook-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret-0123456789-abcdefghij'
  process.env.LC_WEBHOOK_WORKER = 'off'

  receiver = createServer((req, res) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      raw += chunk
    })
    req.on('end', () => {
      received.push({ path: req.url ?? '', headers: req.headers, body: raw })
      if (nextFailureStatus !== undefined) {
        const status = nextFailureStatus
        nextFailureStatus = undefined
        res.statusCode = status
        res.end(`forced ${status}`)
        return
      }
      res.statusCode = 200
      res.end('ok')
    })
  })
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
  const address = receiver.address() as AddressInfo
  receiverUrl = `http://127.0.0.1:${address.port}/hook`

  app = await NestFactory.create(AppModule, { logger: ['error'] })
  app.setGlobalPrefix('api/v1')
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()

  const login = await call('POST', '/api/v1/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  })
  expect(login.status).toBe(200)
  token = login.body.accessToken

  const designer = await call('POST', '/api/v1/auth/login', {
    body: { username: 'designer', password: 'designer123' },
  })
  expect(designer.status).toBe(200)
  dToken = designer.body.accessToken

  // 订阅创建前先建模型/流程，避免初始化动作产生事件干扰断言。
  const modelRes = await call('PUT', '/api/v1/models/md_webhook', { body: model(), token })
  expect(modelRes.status, JSON.stringify(modelRes.body)).toBe(200)
  const flowRes = await call('PUT', '/api/v1/flows/fl_webhook', { body: flow(), token })
  expect(flowRes.status, JSON.stringify(flowRes.body)).toBe(200)
})

afterAll(async () => {
  await app?.close()
  if (receiver) {
    await new Promise<void>((resolve) => receiver.close(() => resolve()))
  }
  await rm(dataDir, { recursive: true, force: true })
  delete process.env.LC_WEBHOOK_WORKER
})

/* ------------------------------------------------------------------ */
/* 1. 鉴权与校验                                                       */
/* ------------------------------------------------------------------ */

describe('Webhook 管理接口鉴权与校验', () => {
  it('未登录 401；非管理员 403 ADMIN_REQUIRED', async () => {
    const anonymous = await call('GET', '/api/v1/webhooks')
    expect(anonymous.status).toBe(401)

    const forbidden = await call('GET', '/api/v1/webhooks', { token: dToken })
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.code).toBe('ADMIN_REQUIRED')

    const create = await call('POST', '/api/v1/webhooks', {
      body: { name: 'x', url: receiverUrl, events: ['*'] },
      token: dToken,
    })
    expect(create.status).toBe(403)
  })

  it('创建参数校验：协议/事件/长度/未知字段', async () => {
    const baseBody = { name: '测试订阅', url: receiverUrl, events: ['*'] }
    const cases: Array<Record<string, unknown>> = [
      { ...baseBody, url: 'ftp://example.com/hook' },
      { ...baseBody, events: [] },
      { ...baseBody, events: ['unknown.event'] },
      { ...baseBody, events: ['*', 'record.created'] },
      { ...baseBody, maxAttempts: 0 },
      { ...baseBody, timeoutMs: 999 },
      { ...baseBody, secret: 'short' },
      { ...baseBody, extra: true },
    ]
    for (const body of cases) {
      const r = await call('POST', '/api/v1/webhooks', { body, token })
      expect(r.status, JSON.stringify(body)).toBe(400)
      expect(r.body.code).toBe('WEBHOOK_INVALID')
      expect(r.body.errors.length).toBeGreaterThan(0)
    }
  })
})

/* ------------------------------------------------------------------ */
/* 2. CRUD / ETag / secret                                             */
/* ------------------------------------------------------------------ */

let subId = ''
let secret = ''
let etag = ''
let staleEtag = ''

describe('Webhook 订阅 CRUD / ETag / secret 脱敏', () => {
  it('创建 → 返回完整 secret 与 ETag', async () => {
    const r = await call('POST', '/api/v1/webhooks', {
      body: { name: '业务事件订阅', description: '初始', url: receiverUrl, events: ['*'] },
      token,
    })
    expect(r.status).toBe(200)
    expect(r.body.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(r.body.secretPreview).toContain('…')
    expect(r.body.active).toBe(true)
    expect(r.body.maxAttempts).toBe(5)
    expect(r.body.timeoutMs).toBe(10000)
    expect(r.body.revision).toBe(0)
    expect(r.headers.etag).toBe(`"webhook:${r.body.id}:0"`)

    subId = r.body.id
    secret = r.body.secret
    etag = r.headers.etag
    staleEtag = etag
  })

  it('列表/详情脱敏；详情返回 ETag', async () => {
    const list = await call('GET', '/api/v1/webhooks', { token })
    expect(list.status).toBe(200)
    expect(list.body.items).toHaveLength(1)
    expect(list.body.items[0].id).toBe(subId)
    expect(list.body.items[0]).not.toHaveProperty('secret')
    expect(list.body.items[0].secretPreview).toBeTruthy()

    const detail = await call('GET', `/api/v1/webhooks/${subId}`, { token })
    expect(detail.status).toBe(200)
    expect(detail.body).not.toHaveProperty('secret')
    expect(detail.headers.etag).toBe(etag)
  })

  it('PUT 乐观锁：正确 If-Match 成功，旧版本 409，空 patch / secret 字段 400', async () => {
    const first = await call('PUT', `/api/v1/webhooks/${subId}`, {
      body: { description: '已更新', maxAttempts: 5, timeoutMs: 2000 },
      token,
      headers: { 'if-match': etag },
    })
    expect(first.status).toBe(200)
    expect(first.body.description).toBe('已更新')
    expect(first.body.timeoutMs).toBe(2000)
    expect(first.body.revision).toBe(1)
    expect(first.headers.etag).toBe(`"webhook:${subId}:1"`)
    etag = first.headers.etag

    const conflict = await call('PUT', `/api/v1/webhooks/${subId}`, {
      body: { active: false },
      token,
      headers: { 'if-match': staleEtag },
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('VERSION_CONFLICT')
    expect(conflict.body.currentRevision).toBe(1)

    const empty = await call('PUT', `/api/v1/webhooks/${subId}`, { body: {}, token })
    expect(empty.status).toBe(400)
    expect(empty.body.code).toBe('WEBHOOK_INVALID')

    const secretPatch = await call('PUT', `/api/v1/webhooks/${subId}`, {
      body: { secret: 'a'.repeat(32) },
      token,
    })
    expect(secretPatch.status).toBe(400)

    // active=false → true，确保后续事件仍会入队
    const disable = await call('PUT', `/api/v1/webhooks/${subId}`, {
      body: { active: false },
      token,
      headers: { 'if-match': etag },
    })
    expect(disable.status).toBe(200)
    expect(disable.body.active).toBe(false)
    expect(disable.body.revision).toBe(2)
    etag = disable.headers.etag

    const enable = await call('PUT', `/api/v1/webhooks/${subId}`, {
      body: { active: true, description: null },
      token,
      headers: { 'if-match': etag },
    })
    expect(enable.status).toBe(200)
    expect(enable.body.active).toBe(true)
    expect(enable.body).not.toHaveProperty('description')
    expect(enable.body.revision).toBe(3)
    etag = enable.headers.etag
  })

  it('轮换 secret：旧密钥失效，新密钥仅本次返回', async () => {
    const oldSecret = secret
    const r = await call('POST', `/api/v1/webhooks/${subId}/rotate-secret`, {
      token,
      headers: { 'if-match': etag },
    })
    expect(r.status).toBe(200)
    expect(r.body.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(r.body.secret).not.toBe(oldSecret)
    expect(r.body.revision).toBe(4)
    expect(r.headers.etag).toBe(`"webhook:${subId}:4"`)
    secret = r.body.secret
    etag = r.headers.etag

    const detail = await call('GET', `/api/v1/webhooks/${subId}`, { token })
    expect(detail.body).not.toHaveProperty('secret')
  })

  it('不存在的订阅 → 404；非法 If-Match → 400', async () => {
    for (const [method, apiPath] of [
      ['GET', '/api/v1/webhooks/wh_missing'],
      ['PUT', '/api/v1/webhooks/wh_missing'],
      ['DELETE', '/api/v1/webhooks/wh_missing'],
      ['POST', '/api/v1/webhooks/wh_missing/test'],
    ] as const) {
      const r = await call(method, apiPath, { token, body: method === 'PUT' ? { name: 'x' } : undefined })
      expect(r.status, `${method} ${apiPath}`).toBe(404)
    }

    const bad = await call('PUT', `/api/v1/webhooks/${subId}`, {
      body: { name: 'x' },
      token,
      headers: { 'if-match': '"webhook:wrong-id:1"' },
    })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('INVALID_IF_MATCH')
  })
})

/* ------------------------------------------------------------------ */
/* 3. 事件投递 / 签名 / 投递日志                                        */
/* ------------------------------------------------------------------ */

let recordId = ''

describe('记录与流程事件投递 / 签名校验', () => {
  it('记录创建 → record.created + flow.started，签名可复算', async () => {
    received = []
    const created = await call('POST', '/api/v1/models/md_webhook/records', {
      body: { name: '张三', amount: 100 },
      token,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    recordId = created.body.id

    expect(await dispatchAll()).toBeGreaterThanOrEqual(2)

    const recordEvent = eventsOf('record.created')
    expect(recordEvent).toHaveLength(1)
    const startedEvent = eventsOf('flow.started')
    expect(startedEvent).toHaveLength(1)

    const captured = recordEvent[0]
    const signatureHeader = header(captured, 'x-lc-signature')
    const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signatureHeader)
    expect(match, signatureHeader).toBeTruthy()
    const timestamp = match![1]
    const signature = match![2]
    expect(header(captured, 'x-lc-timestamp')).toBe(timestamp)
    expect(header(captured, 'x-lc-event')).toBe('record.created')
    expect(header(captured, 'x-lc-delivery')).toBeTruthy()
    expect(signature).toBe(expectedSignature(secret, timestamp, captured.body))

    const payload = JSON.parse(captured.body)
    expect(payload.id).toBeTruthy()
    expect(payload.type).toBe('record.created')
    expect(payload.actor).toBe('admin')
    expect(payload.data.modelId).toBe('md_webhook')
    expect(payload.data.recordId).toBe(recordId)
    expect(payload.data.record.name).toBe('张三')
    expect(payload.data.record.id).toBe(recordId)

    expect(JSON.parse(startedEvent[0].body).data.instanceId).toBeTruthy()
  })

  it('审批通过与驳回 → task/completed/rejected 事件', async () => {
    const instances = await call('GET', `/api/v1/flows/instances?recordId=${recordId}`, { token })
    expect(instances.status).toBe(200)
    const instance = instances.body.items[0]
    const task = pendingTask(instance)

    received = []
    const approve = await call('POST', `/api/v1/flows/instances/${instance.id}/tasks/${task.id}`, {
      body: { action: 'approve', comment: '同意' },
      token,
    })
    expect(approve.status, JSON.stringify(approve.body)).toBe(200)
    await dispatchAll()
    expect(eventsOf('flow.task.approved')).toHaveLength(1)
    expect(eventsOf('flow.completed')).toHaveLength(1)
    const approved = JSON.parse(eventsOf('flow.task.approved')[0].body)
    expect(approved.data.action).toBe('approve')
    expect(approved.data.comment).toBe('同意')

    // 第二条记录走驳回终态：flow.task.rejected + flow.rejected
    const second = await call('POST', '/api/v1/models/md_webhook/records', {
      body: { name: '李四', amount: 200 },
      token,
    })
    expect(second.status).toBe(200)
    await dispatchAll()
    const secondInstances = await call('GET', `/api/v1/flows/instances?recordId=${second.body.id}`, { token })
    const secondInstance = secondInstances.body.items[0]
    const secondTask = pendingTask(secondInstance)

    received = []
    const reject = await call('POST', `/api/v1/flows/instances/${secondInstance.id}/tasks/${secondTask.id}`, {
      body: { action: 'reject', comment: '驳回' },
      token,
    })
    expect(reject.status, JSON.stringify(reject.body)).toBe(200)
    await dispatchAll()
    expect(eventsOf('flow.task.rejected')).toHaveLength(1)
    expect(eventsOf('flow.rejected')).toHaveLength(1)
    expect(JSON.parse(eventsOf('flow.rejected')[0].body).data.status).toBe('rejected')
  })

  it('记录更新/删除事件 + 投递日志过滤分页', async () => {
    received = []
    const updated = await call('PUT', `/api/v1/models/md_webhook/records/${recordId}`, {
      body: { amount: 300 },
      token,
    })
    expect(updated.status, JSON.stringify(updated.body)).toBe(200)
    await dispatchAll()
    expect(eventsOf('record.updated')).toHaveLength(1)

    const deleted = await call('DELETE', `/api/v1/models/md_webhook/records/${recordId}`, { token })
    expect(deleted.status).toBe(200)
    await dispatchAll()
    expect(eventsOf('record.deleted')).toHaveLength(1)

    const logs = await call('GET', `/api/v1/webhooks/${subId}/deliveries?status=success&eventType=record.created&page=1&size=1`, {
      token,
    })
    expect(logs.status).toBe(200)
    expect(logs.body.total).toBe(2)
    expect(logs.body.items).toHaveLength(1)
    expect(logs.body.page).toBe(1)
    expect(logs.body.size).toBe(1)
    const delivery = logs.body.items[0]
    expect(delivery.status).toBe('success')
    expect(delivery.attemptCount).toBe(1)
    expect(delivery.attempts[0].status).toBe(200)
    expect(delivery.attempts[0].ok).toBe(true)
    expect(delivery.payload.type).toBe('record.created')

    for (const [query, code] of [
      ['status=unknown', 'INVALID_QUERY'],
      ['eventType=unknown.event', 'INVALID_QUERY'],
      ['page=0', 'INVALID_QUERY'],
      ['size=101', 'INVALID_QUERY'],
    ] as const) {
      const r = await call('GET', `/api/v1/webhooks/${subId}/deliveries?${query}`, { token })
      expect(r.status, query).toBe(400)
      expect(r.body.code).toBe(code)
    }
  })
})

/* ------------------------------------------------------------------ */
/* 4. 测试投递 / 失败 / 手动重投                                       */
/* ------------------------------------------------------------------ */

describe('测试投递与重试', () => {
  it('POST /test 同步发送成功，返回投递 ETag', async () => {
    received = []
    nextFailureStatus = undefined
    const r = await call('POST', `/api/v1/webhooks/${subId}/test`, { token })
    expect(r.status).toBe(200)
    expect(r.body.eventType).toBe('webhook.test')
    expect(r.body.source).toBe('test')
    expect(r.body.status).toBe('success')
    expect(r.body.attempts).toHaveLength(1)
    expect(r.body.attempts[0].status).toBe(200)
    expect(r.headers.etag).toMatch(/^"webhook-delivery:[^"]+:1"$/)
    expect(received).toHaveLength(1)
    expect(JSON.parse(received[0].body).type).toBe('webhook.test')
  })

  it('500 → pending 且自动重试等待期内手动重投 409 DELIVERY_PENDING', async () => {
    received = []
    nextFailureStatus = 500
    const r = await call('POST', `/api/v1/webhooks/${subId}/test`, { token })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('pending')
    expect(r.body.attemptCount).toBe(1)
    expect(r.body.attempts[0].status).toBe(500)
    expect(new Date(r.body.nextAttemptAt).getTime()).toBeGreaterThan(Date.now())

    const retry = await call('POST', `/api/v1/webhooks/deliveries/${r.body.id}/retry`, {
      token,
      headers: { 'if-match': r.headers.etag },
    })
    expect(retry.status).toBe(409)
    expect(retry.body.code).toBe('DELIVERY_PENDING')
  })

  it('400 → failed；手动重投成功后保留两次 attempts 历史', async () => {
    received = []
    nextFailureStatus = 400
    const failed = await call('POST', `/api/v1/webhooks/${subId}/test`, { token })
    expect(failed.status).toBe(200)
    expect(failed.body.status).toBe('failed')
    expect(failed.body.attemptCount).toBe(1)
    expect(failed.body.attempts[0].status).toBe(400)

    const retried = await call('POST', `/api/v1/webhooks/deliveries/${failed.body.id}/retry`, {
      token,
      headers: { 'if-match': failed.headers.etag },
    })
    expect(retried.status, JSON.stringify(retried.body)).toBe(200)
    expect(retried.body.status).toBe('success')
    expect(retried.body.attemptCount).toBe(1)
    expect(retried.body.attempts).toHaveLength(2)
    expect(retried.body.attempts[0].ok).toBe(false)
    expect(retried.body.attempts[1].ok).toBe(true)
    expect(retried.body.revision).toBe(3)
    expect(retried.headers.etag).toBe(`"webhook-delivery:${failed.body.id}:3"`)
  })

  it('重投不存在/旧版本 → 404 / 409', async () => {
    const missing = await call('POST', '/api/v1/webhooks/deliveries/del_missing/retry', { token })
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe('WEBHOOK_DELIVERY_NOT_FOUND')

    const list = await call('GET', `/api/v1/webhooks/${subId}/deliveries?status=success`, { token })
    const delivery = list.body.items[0]
    const conflict = await call('POST', `/api/v1/webhooks/deliveries/${delivery.id}/retry`, {
      token,
      headers: { 'if-match': `"webhook-delivery:${delivery.id}:0"` },
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('VERSION_CONFLICT')
  })
})

/* ------------------------------------------------------------------ */
/* 5. 删除与日志保留                                                   */
/* ------------------------------------------------------------------ */

describe('删除订阅保留投递日志', () => {
  it('旧 ETag 删除 409；正确删除后列表为空、日志文件仍在', async () => {
    const conflict = await call('DELETE', `/api/v1/webhooks/${subId}`, {
      token,
      headers: { 'if-match': staleEtag },
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('VERSION_CONFLICT')

    const removed = await call('DELETE', `/api/v1/webhooks/${subId}`, {
      token,
      headers: { 'if-match': etag },
    })
    expect(removed.status).toBe(200)
    expect(removed.body).toEqual({ id: subId, deleted: true })

    const detail = await call('GET', `/api/v1/webhooks/${subId}`, { token })
    expect(detail.status).toBe(404)
    const list = await call('GET', '/api/v1/webhooks', { token })
    expect(list.body.items).toHaveLength(0)

    const file = JSON.parse(await readFile(path.join(dataDir, 'webhook-deliveries.json'), 'utf8'))
    expect(file.deliveries.length).toBeGreaterThan(0)
    expect(file.deliveries.every((item: any) => item.subscriptionId === subId)).toBe(true)

    const testAfterDelete = await call('POST', `/api/v1/webhooks/${subId}/test`, { token })
    expect(testAfterDelete.status).toBe(404)
  })
})
