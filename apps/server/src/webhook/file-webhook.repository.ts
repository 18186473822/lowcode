/**
 * Webhook JSON 文件仓储（`LC_STORAGE=json`，默认/测试路径）。
 *
 * 文件布局：
 * - `<DATA_DIR>/webhooks.json`            → `{ subscriptions: WebhookSubscription[] }`
 * - `<DATA_DIR>/webhook-deliveries.json`  → `{ deliveries: WebhookDelivery[] }`
 *
 * 两个文件都采用「临时文件 + rename」原子写；单文件集合写操作共用一把 KeyedLock，
 * 避免并发 append 丢数据。与 Flow/Record 仓储一致，损坏 JSON 原样上抛（500），不静默吞。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import { KeyedLock } from '../common/keyed-lock.js'
import type {
  WebhookDelivery,
  WebhookDeliveryPage,
  WebhookDeliveryQuery,
  WebhookRepository,
  WebhookSubscription,
} from './webhook.types.js'

interface SubscriptionsFile {
  subscriptions: WebhookSubscription[]
}

interface DeliveriesFile {
  deliveries: WebhookDelivery[]
}

/** 旧文件缺字段时的默认值（向前兼容，不因新增列读取失败）。 */
function normalizeSubscription(raw: WebhookSubscription): WebhookSubscription {
  return {
    ...raw,
    events: Array.isArray(raw.events) ? raw.events : [],
    active: raw.active !== false,
    maxAttempts: Number.isInteger(raw.maxAttempts) ? raw.maxAttempts : 5,
    timeoutMs: Number.isInteger(raw.timeoutMs) ? raw.timeoutMs : 10_000,
    revision: Number.isInteger(raw.revision) ? raw.revision : 0,
  }
}

function normalizeDelivery(raw: WebhookDelivery): WebhookDelivery {
  return {
    ...raw,
    attempts: Array.isArray(raw.attempts) ? raw.attempts : [],
    attemptCount: Number.isInteger(raw.attemptCount) ? raw.attemptCount : 0,
    status: raw.status ?? 'pending',
    source: raw.source ?? 'event',
    nextAttemptAt: raw.nextAttemptAt ?? raw.createdAt,
    revision: Number.isInteger(raw.revision) ? raw.revision : 0,
  }
}

@Injectable()
export class FileWebhookRepository implements WebhookRepository {
  private readonly subscriptionsFile: string
  private readonly deliveriesFile: string
  private readonly subscriptionsLock = new KeyedLock()
  private readonly deliveriesLock = new KeyedLock()

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.subscriptionsFile = path.join(dataDir, 'webhooks.json')
    this.deliveriesFile = path.join(dataDir, 'webhook-deliveries.json')
  }

  private async readJson<T>(file: string, empty: T): Promise<T> {
    try {
      const raw = await readFile(file, 'utf8')
      return JSON.parse(raw) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty
      throw error
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await rename(tmp, file)
  }

  async list(): Promise<WebhookSubscription[]> {
    const data = await this.readJson<SubscriptionsFile>(this.subscriptionsFile, { subscriptions: [] })
    return Array.isArray(data.subscriptions) ? data.subscriptions.map(normalizeSubscription) : []
  }

  async find(id: string): Promise<WebhookSubscription | null> {
    return (await this.list()).find((item) => item.id === id) ?? null
  }

  async create(subscription: WebhookSubscription): Promise<void> {
    await this.subscriptionsLock.runExclusive('webhooks', async () => {
      const subscriptions = await this.list()
      subscriptions.push(subscription)
      await this.writeJson(this.subscriptionsFile, { subscriptions })
    })
  }

  async update(subscription: WebhookSubscription, expectedRevision: number): Promise<boolean> {
    return this.subscriptionsLock.runExclusive('webhooks', async () => {
      const subscriptions = await this.list()
      const idx = subscriptions.findIndex((item) => item.id === subscription.id)
      if (idx < 0 || subscriptions[idx].revision !== expectedRevision) return false
      subscriptions[idx] = subscription
      await this.writeJson(this.subscriptionsFile, { subscriptions })
      return true
    })
  }

  async remove(id: string, expectedRevision: number): Promise<boolean> {
    return this.subscriptionsLock.runExclusive('webhooks', async () => {
      const subscriptions = await this.list()
      const idx = subscriptions.findIndex((item) => item.id === id)
      if (idx < 0 || subscriptions[idx].revision !== expectedRevision) return false
      subscriptions.splice(idx, 1)
      await this.writeJson(this.subscriptionsFile, { subscriptions })
      return true
    })
  }

  async listDeliveries(subscriptionId: string, query: WebhookDeliveryQuery): Promise<WebhookDeliveryPage> {
    const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
    let items = (Array.isArray(data.deliveries) ? data.deliveries : [])
      .map(normalizeDelivery)
      .filter((item) => item.subscriptionId === subscriptionId)

    if (query.status) items = items.filter((item) => item.status === query.status)
    if (query.eventType) items = items.filter((item) => item.eventType === query.eventType)

    // createdAt 倒序；同一毫秒内按 id 倒序，保证分页稳定。
    items.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
      return a.id < b.id ? 1 : -1
    })

    const total = items.length
    const start = (query.page - 1) * query.size
    return {
      items: items.slice(start, start + query.size),
      total,
      page: query.page,
      size: query.size,
    }
  }

  async findDelivery(id: string): Promise<WebhookDelivery | null> {
    const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
    const found = (Array.isArray(data.deliveries) ? data.deliveries : []).find((item) => item.id === id)
    return found ? normalizeDelivery(found) : null
  }

  async createDeliveries(deliveries: WebhookDelivery[]): Promise<void> {
    if (deliveries.length === 0) return
    await this.deliveriesLock.runExclusive('webhook-deliveries', async () => {
      const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
      const current = Array.isArray(data.deliveries) ? data.deliveries : []
      await this.writeJson(this.deliveriesFile, { deliveries: [...current, ...deliveries] })
    })
  }

  async saveDelivery(delivery: WebhookDelivery): Promise<void> {
    await this.deliveriesLock.runExclusive('webhook-deliveries', async () => {
      const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
      const deliveries = Array.isArray(data.deliveries) ? data.deliveries : []
      const idx = deliveries.findIndex((item) => item.id === delivery.id)
      if (idx >= 0) deliveries[idx] = delivery
      else deliveries.push(delivery)
      await this.writeJson(this.deliveriesFile, { deliveries })
    })
  }

  async dueDeliveries(now: string, limit: number): Promise<WebhookDelivery[]> {
    const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
    return (Array.isArray(data.deliveries) ? data.deliveries : [])
      .map(normalizeDelivery)
      .filter((item) => item.status === 'pending' && item.nextAttemptAt <= now)
      .sort((a, b) => {
        if (a.nextAttemptAt !== b.nextAttemptAt) return a.nextAttemptAt < b.nextAttemptAt ? -1 : 1
        return a.createdAt < b.createdAt ? -1 : 1
      })
      .slice(0, limit)
  }
}
