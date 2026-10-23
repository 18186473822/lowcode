/**
 * Webhook JSON 文件仓储（`LC_STORAGE=json`，默认/测试路径）。
 *
 * 文件布局：
 * - `<DATA_DIR>/webhooks.json`                 → `{ subscriptions: WebhookSubscription[] }`
 * - `<DATA_DIR>/webhook-deliveries.json`       → `{ deliveries: WebhookDelivery[] }`
 * - `<DATA_DIR>/webhook-delivery-archive.json` → `{ deliveries: (WebhookDelivery & { archivedAt })[] }`
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
  WebhookDeliveryStats,
  WebhookRepository,
  WebhookSubscription,
} from './webhook.types.js'

interface SubscriptionsFile {
  subscriptions: WebhookSubscription[]
}

interface DeliveriesFile {
  deliveries: WebhookDelivery[]
}

interface ArchiveFile {
  deliveries: Array<WebhookDelivery & { archivedAt: string }>
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const headers: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') headers[key] = raw
  }
  return headers
}

/** 旧文件缺字段时的默认值（向前兼容，不因新增列读取失败）。 */
function normalizeSubscription(raw: WebhookSubscription): WebhookSubscription {
  return {
    ...raw,
    events: Array.isArray(raw.events) ? raw.events : [],
    headers: normalizeHeaders(raw.headers),
    rateLimitPerMinute: Number.isInteger(raw.rateLimitPerMinute) ? raw.rateLimitPerMinute : 0,
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

/** 清掉租约字段，避免把进程内租约写回持久层后阻塞其它副本。 */
function releaseLease(delivery: WebhookDelivery): WebhookDelivery {
  const next = { ...delivery, leaseOwner: undefined, leaseExpiresAt: undefined }
  return next
}

@Injectable()
export class FileWebhookRepository implements WebhookRepository {
  private readonly subscriptionsFile: string
  private readonly deliveriesFile: string
  private readonly archiveFile: string
  private readonly subscriptionsLock = new KeyedLock()
  private readonly deliveriesLock = new KeyedLock()

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.subscriptionsFile = path.join(dataDir, 'webhooks.json')
    this.deliveriesFile = path.join(dataDir, 'webhook-deliveries.json')
    this.archiveFile = path.join(dataDir, 'webhook-delivery-archive.json')
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

  async saveDelivery(delivery: WebhookDelivery, expectedLeaseOwner?: string): Promise<boolean> {
    return this.deliveriesLock.runExclusive('webhook-deliveries', async () => {
      const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
      const deliveries = (Array.isArray(data.deliveries) ? data.deliveries : []).map(normalizeDelivery)
      const idx = deliveries.findIndex((item) => item.id === delivery.id)
      if (idx < 0) return false
      if (expectedLeaseOwner && deliveries[idx].leaseOwner !== expectedLeaseOwner) return false
      deliveries[idx] = releaseLease(delivery)
      await this.writeJson(this.deliveriesFile, { deliveries })
      return true
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

  async claimDueDeliveries(
    now: string,
    limit: number,
    owner: string,
    leaseMs: number,
  ): Promise<WebhookDelivery[]> {
    return this.deliveriesLock.runExclusive('webhook-deliveries', async () => {
      const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
      const deliveries = (Array.isArray(data.deliveries) ? data.deliveries : []).map(normalizeDelivery)
      const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString()
      const claimed: WebhookDelivery[] = []
      for (const delivery of deliveries) {
        if (claimed.length >= limit) break
        if (delivery.status !== 'pending' || delivery.nextAttemptAt > now) continue
        if (delivery.leaseOwner && delivery.leaseOwner !== owner && (delivery.leaseExpiresAt ?? '') > now) continue
        delivery.leaseOwner = owner
        delivery.leaseExpiresAt = leaseExpiresAt
        claimed.push(delivery)
      }
      if (claimed.length > 0) await this.writeJson(this.deliveriesFile, { deliveries })
      return claimed
    })
  }

  async claimDelivery(id: string, owner: string, leaseMs: number): Promise<WebhookDelivery | null> {
    return this.deliveriesLock.runExclusive('webhook-deliveries', async () => {
      const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
      const deliveries = (Array.isArray(data.deliveries) ? data.deliveries : []).map(normalizeDelivery)
      const current = deliveries.find((item) => item.id === id)
      if (!current || current.status !== 'pending') return null
      const now = new Date().toISOString()
      if (current.leaseOwner && current.leaseOwner !== owner && (current.leaseExpiresAt ?? '') > now) return null
      current.leaseOwner = owner
      current.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString()
      await this.writeJson(this.deliveriesFile, { deliveries })
      return current
    })
  }

  async countRecentDeliveries(subscriptionId: string, since: string): Promise<number> {
    const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
    return (Array.isArray(data.deliveries) ? data.deliveries : [])
      .map(normalizeDelivery)
      .filter((item) => item.subscriptionId === subscriptionId && (item.lastAttemptAt ?? '') >= since).length
  }

  async stats(now: string): Promise<WebhookDeliveryStats> {
    const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
    const deliveries = (Array.isArray(data.deliveries) ? data.deliveries : []).map(normalizeDelivery)
    const dayAgo = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000).toISOString()
    const pending = deliveries.filter((item) => item.status === 'pending')
    const recent = deliveries.filter((item) => item.createdAt >= dayAgo)
    const oldest = pending
      .map((item) => item.nextAttemptAt)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0]
    return {
      total: deliveries.length,
      pending: pending.length,
      success: deliveries.filter((item) => item.status === 'success').length,
      failed: deliveries.filter((item) => item.status === 'failed').length,
      ...(oldest === undefined ? {} : { oldestPendingAt: oldest }),
      last24hTotal: recent.length,
      last24hSuccess: recent.filter((item) => item.status === 'success').length,
      last24hFailed: recent.filter((item) => item.status === 'failed').length,
    }
  }

  async archiveDeliveries(before: string, limit: number): Promise<number> {
    return this.deliveriesLock.runExclusive('webhook-deliveries', async () => {
      const data = await this.readJson<DeliveriesFile>(this.deliveriesFile, { deliveries: [] })
      const deliveries = (Array.isArray(data.deliveries) ? data.deliveries : []).map(normalizeDelivery)
      const candidates = deliveries
        .filter((item) => item.status !== 'pending' && item.createdAt < before)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
        .slice(0, limit)
      if (candidates.length === 0) return 0

      const archive = await this.readJson<ArchiveFile>(this.archiveFile, { deliveries: [] })
      const archivedAt = new Date().toISOString()
      const existing = Array.isArray(archive.deliveries) ? archive.deliveries : []
      await this.writeJson(this.archiveFile, {
        deliveries: [...existing, ...candidates.map((item) => ({ ...item, archivedAt }))],
      })

      const ids = new Set(candidates.map((item) => item.id))
      await this.writeJson(this.deliveriesFile, {
        deliveries: deliveries.filter((item) => !ids.has(item.id)),
      })
      return candidates.length
    })
  }
}
