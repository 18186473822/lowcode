/**
 * Webhook 纯函数 / MySQL 仓储 / worker 边界单测（无外部服务）。
 *
 * e2e `webhook.test.ts` 覆盖真实 HTTP 签名投递；本文件补：
 * - URL/事件/入参校验的异常分支；
 * - MySQL 仓储字段映射、CAS、分页/到期查询（Prisma 替身）；
 * - worker 生命周期、网络错误、超时、订阅停用/删除、响应体读取失败等 e2e 难以稳定构造的分支。
 */
import 'reflect-metadata'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { AuthUser } from '../src/common/jwt.service.js'
import type { RbacService } from '../src/rbac/rbac.service.js'
import { MysqlWebhookRepository } from '../src/persistence/mysql/webhook.repository.js'
import {
  WebhookService,
  isPrivateHost,
  isRetryableStatus,
  maskSecret,
  normalizeWebhookUrl,
  parseCreateWebhookInput,
  parsePatchWebhookInput,
  retryDelayMs,
  signWebhook,
  validateWebhookEvents,
} from '../src/webhook/webhook.service.js'
import {
  isWebhookDeliveryEventType,
  isWebhookEventType,
  subscriptionMatches,
  type WebhookDelivery,
  type WebhookDeliveryPage,
  type WebhookDeliveryQuery,
  type WebhookRepository,
  type WebhookSubscription,
} from '../src/webhook/webhook.types.js'

const NOW = new Date('2026-10-22T08:00:00.000Z')
const USER: AuthUser = { sub: 'u1', username: 'admin', roles: ['admin'] }

/* ------------------------------------------------------------------ */
/* 纯函数                                                              */
/* ------------------------------------------------------------------ */

describe('Webhook 纯函数', () => {
  it('签名 / 重试间隔 / 可重试状态码', () => {
    expect(signWebhook('secret', '1700000000', '{"a":1}')).toMatch(/^[0-9a-f]{64}$/)
    expect(signWebhook('secret', '1700000000', '{"a":1}')).toBe(
      signWebhook('secret', '1700000000', '{"a":1}'),
    )
    expect(retryDelayMs(0)).toBe(0)
    expect(retryDelayMs(1)).toBe(5000)
    expect(retryDelayMs(2)).toBe(30000)
    expect(retryDelayMs(3)).toBe(120000)
    expect(retryDelayMs(4)).toBe(600000)
    expect(retryDelayMs(99)).toBe(600000)

    expect(isRetryableStatus(undefined)).toBe(true)
    expect(isRetryableStatus(408)).toBe(true)
    expect(isRetryableStatus(425)).toBe(true)
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(404)).toBe(false)
    expect(isRetryableStatus(302)).toBe(false)
  })

  it('内网地址与 URL 规范化', () => {
    for (const host of [
      'localhost',
      'foo.localhost',
      'x.local',
      'svc.internal',
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.1.1',
      '100.64.0.1',
      '198.18.0.1',
      '224.0.0.1',
      '::1',
      'fd00::1',
      'fe80::1',
      '[::1]',
    ]) {
      expect(isPrivateHost(host), host).toBe(true)
    }
    for (const host of ['example.com', '8.8.8.8', '172.32.0.1', '2001:db8::1']) {
      expect(isPrivateHost(host), host).toBe(false)
    }

    expect(normalizeWebhookUrl('https://example.com/hook', false)).toBe('https://example.com/hook')
    expect(() => normalizeWebhookUrl('', false)).toThrow('url 必填')
    expect(() => normalizeWebhookUrl(`https://e.com/${'a'.repeat(2050)}`, false)).toThrow('不能超过')
    expect(() => normalizeWebhookUrl('not a url', false)).toThrow('合法')
    expect(() => normalizeWebhookUrl('ftp://example.com', false)).toThrow('http/https')
    expect(() => normalizeWebhookUrl('https://u:p@example.com', false)).toThrow('账号口令')
    expect(() => normalizeWebhookUrl('http://127.0.0.1/hook', true)).toThrow('本机/内网')
    expect(normalizeWebhookUrl('http://127.0.0.1/hook', false)).toBe('http://127.0.0.1/hook')
  })

  it('事件校验 / 事件类型 / 订阅匹配 / 密钥脱敏', () => {
    expect(validateWebhookEvents(['*'])).toEqual(['*'])
    expect(validateWebhookEvents(['record.created', 'record.created', 'flow.started'])).toEqual([
      'record.created',
      'flow.started',
    ])
    expect(() => validateWebhookEvents('x')).toThrow('非空数组')
    expect(() => validateWebhookEvents([])).toThrow('非空数组')
    expect(() => validateWebhookEvents(Array.from({ length: 21 }, () => 'record.created'))).toThrow('最多')
    expect(() => validateWebhookEvents([1])).toThrow('字符串')
    expect(() => validateWebhookEvents(['*', 'record.created'])).toThrow('不能与其他事件混用')
    expect(() => validateWebhookEvents(['nope'])).toThrow('未知事件类型')

    expect(isWebhookEventType('record.created')).toBe(true)
    expect(isWebhookEventType('webhook.test')).toBe(false)
    expect(isWebhookDeliveryEventType('webhook.test')).toBe(true)
    expect(isWebhookDeliveryEventType('nope')).toBe(false)

    const sub = subscription()
    expect(subscriptionMatches(sub, 'record.created')).toBe(true)
    expect(subscriptionMatches({ ...sub, events: ['*'] }, 'flow.completed')).toBe(true)
    expect(subscriptionMatches({ ...sub, events: ['flow.started'] }, 'record.deleted')).toBe(false)

    expect(maskSecret('abcdefghijklmnop')).toBe('abcd…mnop')
    expect(maskSecret('short')).toBe('****')
  })

  it('创建/更新入参校验覆盖默认值与异常分支', () => {
    const created = parseCreateWebhookInput(
      { name: '  订阅  ', url: 'https://example.com/hook', events: ['record.created'] },
      false,
    )
    expect(created.name).toBe('订阅')
    expect(created.active).toBe(true)
    expect(created.maxAttempts).toBe(5)
    expect(created.timeoutMs).toBe(10000)

    const full = parseCreateWebhookInput(
      {
        name: 'n',
        description: 'd',
        url: 'https://example.com/hook',
        events: ['*'],
        secret: 's'.repeat(16),
        active: false,
        maxAttempts: 1,
        timeoutMs: 1000,
      },
      false,
    )
    expect(full.secret).toHaveLength(16)
    expect(full.active).toBe(false)

    for (const body of [
      null,
      [],
      { name: '', url: 'https://e.com', events: ['*'] },
      { name: 'n', url: 'https://e.com', events: ['*'], description: 1 },
      { name: 'n', url: 'https://e.com', events: ['*'], active: 'yes' },
      { name: 'n', url: 'https://e.com', events: ['*'], maxAttempts: '5' },
      { name: 'n', url: 'https://e.com', events: ['*'], timeoutMs: 1 },
      { name: 'n', url: 'https://e.com', events: ['*'], unknown: 1 },
    ]) {
      expect(() => parseCreateWebhookInput(body, false)).toThrow()
    }

    expect(
      parsePatchWebhookInput(
        {
          name: ' n ',
          description: null,
          url: 'https://e.com/h',
          events: ['flow.started'],
          active: true,
          maxAttempts: 10,
          timeoutMs: 30000,
        },
        false,
      ),
    ).toMatchObject({ name: 'n', description: null, maxAttempts: 10 })
    expect(parsePatchWebhookInput({ description: 'x' }, false)).toEqual({ description: 'x' })

    for (const body of [
      null,
      {},
      { secret: 'x'.repeat(16) },
      { name: '' },
      { description: 1 },
      { description: 'x'.repeat(501) },
      { url: 'ftp://e.com' },
      { events: [] },
      { active: 1 },
      { maxAttempts: 0 },
      { timeoutMs: 99999 },
    ]) {
      expect(() => parsePatchWebhookInput(body, false)).toThrow()
    }
  })
})

/* ------------------------------------------------------------------ */
/* MySQL 仓储                                                          */
/* ------------------------------------------------------------------ */

function subRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh1',
    name: '订阅',
    description: null,
    url: 'https://example.com/hook',
    events: ['*'],
    secret: 's'.repeat(16),
    active: true,
    maxAttempts: 5,
    timeoutMs: 10000,
    revision: 2,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    subscriptionId: 'wh1',
    eventId: 'e1',
    eventType: 'record.created',
    source: 'event',
    status: 'success',
    payloadJson: { id: 'e1', type: 'record.created', occurredAt: NOW.toISOString(), actor: 'admin', data: {} },
    attemptsJson: [{ attempt: 1, at: NOW.toISOString(), ok: true, status: 200, durationMs: 1 }],
    attemptCount: 1,
    nextAttemptAt: NOW,
    lastAttemptAt: NOW,
    responseStatus: 200,
    responseBody: 'ok',
    error: null,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function fakePrisma(overrides: Record<string, any> = {}): PrismaClient {
  const prisma: any = {
    webhookSubscription: {
      findMany: vi.fn(async () => [subRow()]),
      findUnique: vi.fn(async () => subRow()),
      create: vi.fn(async () => subRow()),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    webhookDelivery: {
      findMany: vi.fn(async () => [deliveryRow()]),
      findUnique: vi.fn(async () => deliveryRow()),
      count: vi.fn(async () => 1),
      createMany: vi.fn(async () => ({ count: 1 })),
      upsert: vi.fn(async () => deliveryRow()),
    },
    ...overrides,
  }
  return prisma as PrismaClient
}

describe('MysqlWebhookRepository', () => {
  it('订阅映射 / 创建 / CAS 更新与删除', async () => {
    const prisma = fakePrisma()
    const repo = new MysqlWebhookRepository(prisma)

    const list = await repo.list()
    expect(list[0].description).toBeUndefined()
    expect(list[0].events).toEqual(['*'])
    expect(list[0].createdAt).toBe(NOW.toISOString())

    const found = await repo.find('wh1')
    expect(found?.id).toBe('wh1')
    prisma.webhookSubscription.findUnique.mockResolvedValueOnce(null)
    expect(await repo.find('ghost')).toBeNull()

    const sub = subscription()
    await repo.create(sub)
    const createData = prisma.webhookSubscription.create.mock.calls[0][0].data
    expect(createData.id).toBe(sub.id)
    expect(createData.events).toEqual(['*'])

    expect(await repo.update(sub, 2)).toBe(true)
    expect(prisma.webhookSubscription.updateMany.mock.calls[0][0].where).toEqual({ id: sub.id, revision: 2 })
    prisma.webhookSubscription.updateMany.mockResolvedValueOnce({ count: 0 })
    expect(await repo.update(sub, 1)).toBe(false)

    expect(await repo.remove(sub.id, 2)).toBe(true)
    prisma.webhookSubscription.deleteMany.mockResolvedValueOnce({ count: 0 })
    expect(await repo.remove(sub.id, 1)).toBe(false)

    // 非法 events / 描述存在分支
    prisma.webhookSubscription.findMany.mockResolvedValueOnce([
      subRow({ events: 'bad', description: 'd' }),
    ])
    const mapped = await repo.list()
    expect(mapped[0].events).toEqual([])
    expect(mapped[0].description).toBe('d')
  })

  it('投递映射 / 列表过滤 / 到期查询 / 创建与 upsert', async () => {
    const prisma = fakePrisma()
    const repo = new MysqlWebhookRepository(prisma)

    const page = await repo.listDeliveries('wh1', {
      status: 'success',
      eventType: 'record.created',
      page: 2,
      size: 10,
    })
    expect(page.total).toBe(1)
    expect(page.items[0].attempts).toHaveLength(1)
    expect(page.items[0].responseStatus).toBe(200)
    expect(prisma.webhookDelivery.findMany.mock.calls[0][0].where).toMatchObject({
      subscriptionId: 'wh1',
      status: 'success',
      eventType: 'record.created',
    })
    expect(prisma.webhookDelivery.findMany.mock.calls[0][0].skip).toBe(10)

    prisma.webhookDelivery.findMany.mockResolvedValueOnce([
      deliveryRow({
        attemptsJson: 'bad',
        source: 'test',
        status: 'pending',
        lastAttemptAt: null,
        responseStatus: null,
        responseBody: null,
        error: 'x',
      }),
    ])
    const mapped = await repo.listDeliveries('wh1', { page: 1, size: 20 })
    expect(mapped.items[0].attempts).toEqual([])
    expect(mapped.items[0].lastAttemptAt).toBeUndefined()
    expect(mapped.items[0].responseStatus).toBeUndefined()
    expect(mapped.items[0].error).toBe('x')
    expect(prisma.webhookDelivery.findMany.mock.calls[1][0].where).toEqual({ subscriptionId: 'wh1' })

    const found = await repo.findDelivery('d1')
    expect(found?.id).toBe('d1')
    prisma.webhookDelivery.findUnique.mockResolvedValueOnce(null)
    expect(await repo.findDelivery('ghost')).toBeNull()

    await repo.createDeliveries([])
    expect(prisma.webhookDelivery.createMany).not.toHaveBeenCalled()
    await repo.createDeliveries([delivery()])
    expect(prisma.webhookDelivery.createMany.mock.calls[0][0].data[0].id).toBe('d1')

    await repo.saveDelivery(delivery())
    expect(prisma.webhookDelivery.upsert.mock.calls[0][0].create.id).toBe('d1')

    prisma.webhookDelivery.findMany.mockResolvedValueOnce([deliveryRow()])
    const due = await repo.dueDeliveries(NOW.toISOString(), 5)
    expect(due).toHaveLength(1)
    expect(prisma.webhookDelivery.findMany.mock.calls[2][0].take).toBe(5)

    // 非法日期走 fallback；空 attempts 数组
    await repo.create(subscription({ createdAt: 'bad', updatedAt: 'bad' }))
    expect(prisma.webhookSubscription.create).toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ */
/* worker 边界                                                         */
/* ------------------------------------------------------------------ */

function subscription(overrides: Partial<WebhookSubscription> = {}): WebhookSubscription {
  return {
    id: 'wh1',
    name: '订阅',
    url: 'https://example.com/hook',
    events: ['*'],
    secret: 's'.repeat(16),
    active: true,
    maxAttempts: 5,
    timeoutMs: 1000,
    revision: 0,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

function delivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  const sub = subscription()
  return {
    id: 'd1',
    subscriptionId: sub.id,
    eventId: 'e1',
    eventType: 'record.created',
    payload: { id: 'e1', type: 'record.created', occurredAt: NOW.toISOString(), actor: 'admin', data: {} },
    source: 'event',
    status: 'pending',
    attempts: [],
    attemptCount: 0,
    nextAttemptAt: new Date(0).toISOString(),
    revision: 0,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

class MemoryRepo implements WebhookRepository {
  subscriptions: WebhookSubscription[] = []
  deliveries: WebhookDelivery[] = []

  async list(): Promise<WebhookSubscription[]> {
    return this.subscriptions
  }
  async find(id: string): Promise<WebhookSubscription | null> {
    return this.subscriptions.find((item) => item.id === id) ?? null
  }
  async create(sub: WebhookSubscription): Promise<void> {
    this.subscriptions.push(sub)
  }
  async update(sub: WebhookSubscription): Promise<boolean> {
    const idx = this.subscriptions.findIndex((item) => item.id === sub.id)
    if (idx < 0) return false
    this.subscriptions[idx] = sub
    return true
  }
  async remove(id: string): Promise<boolean> {
    const idx = this.subscriptions.findIndex((item) => item.id === id)
    if (idx < 0) return false
    this.subscriptions.splice(idx, 1)
    return true
  }
  async listDeliveries(subscriptionId: string, query: WebhookDeliveryQuery): Promise<WebhookDeliveryPage> {
    const items = this.deliveries.filter((item) => item.subscriptionId === subscriptionId)
    return { items: items.slice(0, query.size), total: items.length, page: query.page, size: query.size }
  }
  async findDelivery(id: string): Promise<WebhookDelivery | null> {
    return this.deliveries.find((item) => item.id === id) ?? null
  }
  async createDeliveries(items: WebhookDelivery[]): Promise<void> {
    this.deliveries.push(...items)
  }
  async saveDelivery(item: WebhookDelivery): Promise<void> {
    const idx = this.deliveries.findIndex((entry) => entry.id === item.id)
    if (idx >= 0) this.deliveries[idx] = item
    else this.deliveries.push(item)
  }
  async dueDeliveries(now: string, limit: number): Promise<WebhookDelivery[]> {
    return this.deliveries
      .filter((item) => item.status === 'pending' && item.nextAttemptAt <= now)
      .slice(0, limit)
  }
}

function service(repo = new MemoryRepo(), perms: string[] = ['*']) {
  const rbac = { permsOf: vi.fn(async () => perms) } as unknown as RbacService
  const svc = new WebhookService(repo, rbac)
  return { svc, repo }
}

function okResponse(body = 'ok'): Response {
  return { status: 200, text: async () => body } as unknown as Response
}

function failResponse(status: number): Response {
  return { status, text: async () => 'failed' } as unknown as Response
}

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

describe('WebhookService worker 边界', () => {
  it('emit：未知事件/无订阅/仓储异常均不抛；匹配订阅生成同事件 id 的投递', async () => {
    const { svc, repo } = service()
    await svc.emit('unknown' as any, 'admin', {})
    expect(repo.deliveries).toHaveLength(0)

    await svc.emit('record.created', 'admin', { modelId: 'm1' })
    expect(repo.deliveries).toHaveLength(0)

    repo.subscriptions = [
      subscription({ id: 'wh1', events: ['*'] }),
      subscription({ id: 'wh2', events: ['record.created'] }),
      subscription({ id: 'wh3', events: ['flow.started'] }),
      subscription({ id: 'wh4', active: false }),
    ]
    await svc.emit('record.created', 'admin', { modelId: 'm1' })
    expect(repo.deliveries).toHaveLength(2)
    expect(repo.deliveries[0].eventId).toBe(repo.deliveries[1].eventId)
    expect(repo.deliveries[0].payload).toEqual(repo.deliveries[1].payload)

    vi.spyOn(repo, 'list').mockRejectedValueOnce(new Error('boom'))
    await expect(svc.emit('record.created', 'admin', {})).resolves.toBeUndefined()
  })

  it('dispatchDue：正常扫描 + 仓储异常返回 0', async () => {
    const { svc, repo } = service()
    repo.subscriptions = [subscription()]
    repo.deliveries = [delivery()]
    svc.fetchImpl = vi.fn(async () => okResponse()) as unknown as typeof fetch
    expect(await svc.dispatchDue()).toBe(1)
    expect(repo.deliveries[0].status).toBe('success')

    vi.spyOn(repo, 'dueDeliveries').mockRejectedValueOnce(new Error('boom'))
    expect(await svc.dispatchDue()).toBe(0)
  })

  it('dispatchDelivery：订阅删除/停用直接 failed；测试投递可绕过停用', async () => {
    const { svc, repo } = service()
    svc.fetchImpl = vi.fn(async () => okResponse()) as unknown as typeof fetch

    repo.deliveries = [delivery()]
    expect((await svc.dispatchDelivery('d1'))?.status).toBe('failed')
    expect(repo.deliveries[0].error).toBe('订阅已删除')

    repo.subscriptions = [subscription({ active: false })]
    repo.deliveries = [delivery({ id: 'd2' })]
    expect((await svc.dispatchDelivery('d2'))?.status).toBe('failed')
    expect(repo.deliveries[0].error).toBe('订阅已停用')

    repo.deliveries = [delivery({ id: 'd3', source: 'test' })]
    expect((await svc.dispatchDelivery('d3'))?.status).toBe('success')

    repo.deliveries = [delivery({ id: 'd4', status: 'success' })]
    expect((await svc.dispatchDelivery('d4'))?.status).toBe('success')
    expect(await svc.dispatchDelivery('missing')).toBeNull()
  })

  it('dispatchDelivery：网络错误→pending；超时文案；后续成功', async () => {
    const { svc, repo } = service()
    repo.subscriptions = [subscription()]
    repo.deliveries = [delivery()]

    svc.fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const first = await svc.dispatchDelivery('d1')
    expect(first?.status).toBe('pending')
    expect(first?.attempts[0].error).toBe('ECONNREFUSED')
    expect(new Date(first!.nextAttemptAt).getTime()).toBeGreaterThan(Date.now())

    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    repo.deliveries = [delivery({ id: 'd2' })]
    svc.fetchImpl = vi.fn(async () => {
      throw abort
    }) as unknown as typeof fetch
    const timeout = await svc.dispatchDelivery('d2')
    expect(timeout?.attempts[0].error).toContain('请求超时')

    repo.deliveries = [delivery({ id: 'd3' })]
    svc.fetchImpl = vi.fn(async () => okResponse()) as unknown as typeof fetch
    expect((await svc.dispatchDelivery('d3'))?.status).toBe('success')
  })

  it('dispatchDelivery：404 直接 failed；响应体读取失败仍视为成功', async () => {
    const { svc, repo } = service()
    repo.subscriptions = [subscription()]

    repo.deliveries = [delivery({ id: 'd1' })]
    svc.fetchImpl = vi.fn(async () => failResponse(404)) as unknown as typeof fetch
    const failed = await svc.dispatchDelivery('d1')
    expect(failed?.status).toBe('failed')
    expect(failed?.attempts[0].status).toBe(404)

    repo.deliveries = [delivery({ id: 'd2' })]
    svc.fetchImpl = vi.fn(async () => ({
      status: 204,
      text: async () => {
        throw new Error('body read failed')
      },
    })) as unknown as typeof fetch
    const success = await svc.dispatchDelivery('d2')
    expect(success?.status).toBe('success')
    expect(success?.responseBody).toBeUndefined()
  })

  it('worker 生命周期：off 不启动；开启后 timer 可销毁', async () => {
    const { svc } = service()

    process.env.NODE_ENV = 'production'
    process.env.LC_WEBHOOK_WORKER = 'off'
    svc.onModuleInit()
    expect((svc as any).timer).toBeUndefined()

    process.env.LC_WEBHOOK_WORKER = 'on'
    process.env.LC_WEBHOOK_WORKER_INTERVAL_MS = '1000'
    svc.onModuleInit()
    expect((svc as any).timer).toBeDefined()
    await Promise.resolve()
    svc.onModuleDestroy()
    expect((svc as any).timer).toBeUndefined()
  })

  it('非管理员管理操作 → 403', async () => {
    const { svc } = service(new MemoryRepo(), [])
    await expect(svc.list(USER)).rejects.toMatchObject({ response: { code: 'ADMIN_REQUIRED' } })
    await expect(svc.get(USER, 'wh1')).rejects.toMatchObject({ response: { code: 'ADMIN_REQUIRED' } })
  })
})
