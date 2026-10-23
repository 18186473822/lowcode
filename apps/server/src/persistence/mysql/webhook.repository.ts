/**
 * Webhook 订阅 / 投递日志 MySQL 仓储（Phase 4 开放集成第二批）。
 *
 * 与 JSON 实现字段形状一致；订阅写操作使用 `revision` 做 CAS（`updateMany` / `deleteMany`），
 * 失败返回 false 由服务层转 409。投递日志只由单进程 worker 更新，使用 upsert。
 */
import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type PrismaClient } from '@prisma/client'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type {
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookDeliveryPage,
  WebhookDeliveryQuery,
  WebhookDeliveryStats,
  WebhookEventEnvelope,
  WebhookRepository,
  WebhookSubscription,
} from '../../webhook/webhook.types.js'

function iso(value: Date): string {
  return value.toISOString()
}

function date(value: string, fallback = new Date()): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stringRecord(value: Prisma.JsonValue): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') result[key] = raw
  }
  return result
}

function attempts(value: Prisma.JsonValue): WebhookDeliveryAttempt[] {
  return Array.isArray(value) ? (value as unknown as WebhookDeliveryAttempt[]) : []
}

function envelope(value: Prisma.JsonValue): WebhookEventEnvelope {
  return value as unknown as WebhookEventEnvelope
}

@Injectable()
export class MysqlWebhookRepository implements WebhookRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async list(): Promise<WebhookSubscription[]> {
    const rows = await this.prisma.webhookSubscription.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    })
    return rows.map((row) => this.mapSubscription(row))
  }

  async find(id: string): Promise<WebhookSubscription | null> {
    const row = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    return row ? this.mapSubscription(row) : null
  }

  async create(subscription: WebhookSubscription): Promise<void> {
    await this.prisma.webhookSubscription.create({
      data: { id: subscription.id, ...this.subscriptionData(subscription) },
    })
  }

  async update(subscription: WebhookSubscription, expectedRevision: number): Promise<boolean> {
    const result = await this.prisma.webhookSubscription.updateMany({
      where: { id: subscription.id, revision: expectedRevision },
      data: this.subscriptionData(subscription),
    })
    return result.count === 1
  }

  async remove(id: string, expectedRevision: number): Promise<boolean> {
    const result = await this.prisma.webhookSubscription.deleteMany({
      where: { id, revision: expectedRevision },
    })
    return result.count > 0
  }

  async listDeliveries(subscriptionId: string, query: WebhookDeliveryQuery): Promise<WebhookDeliveryPage> {
    const where = {
      subscriptionId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
    }
    const [rows, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.size,
        take: query.size,
      }),
      this.prisma.webhookDelivery.count({ where }),
    ])
    return {
      items: rows.map((row) => this.mapDelivery(row)),
      total,
      page: query.page,
      size: query.size,
    }
  }

  async findDelivery(id: string): Promise<WebhookDelivery | null> {
    const row = await this.prisma.webhookDelivery.findUnique({ where: { id } })
    return row ? this.mapDelivery(row) : null
  }

  async createDeliveries(deliveries: WebhookDelivery[]): Promise<void> {
    if (deliveries.length === 0) return
    await this.prisma.webhookDelivery.createMany({
      data: deliveries.map((delivery) => ({ id: delivery.id, ...this.deliveryData(delivery) })),
    })
  }

  async saveDelivery(delivery: WebhookDelivery, expectedLeaseOwner?: string): Promise<boolean> {
    const data = this.deliveryData(delivery)
    if (!expectedLeaseOwner) {
      const result = await this.prisma.webhookDelivery.updateMany({
        where: { id: delivery.id },
        data,
      })
      return result.count === 1
    }
    const result = await this.prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, leaseOwner: expectedLeaseOwner },
      data,
    })
    return result.count === 1
  }

  async dueDeliveries(now: string, limit: number): Promise<WebhookDelivery[]> {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: date(now) } },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    })
    return rows.map((row) => this.mapDelivery(row))
  }

  /**
   * `FOR UPDATE SKIP LOCKED` 保证同一行只被一个副本领取。
   * 事务内先选 id 再 update，避免把整批业务字段读进锁内后做慢操作。
   */
  async claimDueDeliveries(
    now: string,
    limit: number,
    owner: string,
    leaseMs: number,
  ): Promise<WebhookDelivery[]> {
    const nowDate = date(now)
    const leaseExpiresAt = new Date(nowDate.getTime() + leaseMs)
    const ids = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM webhook_deliveries
        WHERE status = 'pending'
          AND nextAttemptAt <= ${nowDate}
          AND (leaseExpiresAt IS NULL OR leaseExpiresAt <= ${nowDate})
        ORDER BY nextAttemptAt ASC, createdAt ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `)
      if (rows.length === 0) return []
      const claimedIds = rows.map((row) => row.id)
      await tx.webhookDelivery.updateMany({
        where: { id: { in: claimedIds } },
        data: {
          leaseOwner: owner,
          leaseExpiresAt,
          updatedAt: nowDate,
        },
      })
      return claimedIds
    })
    if (ids.length === 0) return []
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { id: { in: ids }, leaseOwner: owner },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map((row) => this.mapDelivery(row))
  }

  async claimDelivery(id: string, owner: string, leaseMs: number): Promise<WebhookDelivery | null> {
    const now = new Date()
    const result = await this.prisma.webhookDelivery.updateMany({
      where: {
        id,
        status: 'pending',
        OR: [{ leaseOwner: null }, { leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }, { leaseOwner: owner }],
      },
      data: {
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
    })
    if (result.count !== 1) return null
    const row = await this.prisma.webhookDelivery.findUnique({ where: { id } })
    return row ? this.mapDelivery(row) : null
  }

  async countRecentDeliveries(subscriptionId: string, since: string): Promise<number> {
    return this.prisma.webhookDelivery.count({
      where: { subscriptionId, lastAttemptAt: { gte: date(since) } },
    })
  }

  async stats(now: string): Promise<WebhookDeliveryStats> {
    const nowDate = date(now)
    const dayAgo = new Date(nowDate.getTime() - 24 * 60 * 60 * 1000)
    const [grouped, recentGrouped, oldest] = await Promise.all([
      this.prisma.webhookDelivery.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.webhookDelivery.groupBy({
        by: ['status'],
        where: { createdAt: { gte: dayAgo } },
        _count: { _all: true },
      }),
      this.prisma.webhookDelivery.findFirst({
        where: { status: 'pending' },
        orderBy: { nextAttemptAt: 'asc' },
        select: { nextAttemptAt: true },
      }),
    ])
    const countOf = (rows: typeof grouped, status: string) =>
      rows.find((row) => row.status === status)?._count._all ?? 0
    return {
      total: grouped.reduce((sum, row) => sum + row._count._all, 0),
      pending: countOf(grouped, 'pending'),
      success: countOf(grouped, 'success'),
      failed: countOf(grouped, 'failed'),
      ...(oldest ? { oldestPendingAt: iso(oldest.nextAttemptAt) } : {}),
      last24hTotal: recentGrouped.reduce((sum, row) => sum + row._count._all, 0),
      last24hSuccess: countOf(recentGrouped, 'success'),
      last24hFailed: countOf(recentGrouped, 'failed'),
    }
  }

  async archiveDeliveries(before: string, limit: number): Promise<number> {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { status: { in: ['success', 'failed'] }, createdAt: { lt: date(before) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    })
    if (rows.length === 0) return 0
    const ids = rows.map((row) => row.id)
    const archivedAt = new Date()
    await this.prisma.$transaction([
      this.prisma.webhookDeliveryArchive.createMany({
        data: rows.map((row) => ({
          id: row.id,
          ...this.deliveryDataFromRow(row),
          archivedAt,
        })),
        skipDuplicates: true,
      }),
      this.prisma.webhookDelivery.deleteMany({
        where: { id: { in: ids }, status: { in: ['success', 'failed'] } },
      }),
    ])
    return rows.length
  }

  private mapSubscription(row: {
    id: string
    name: string
    description: string | null
    url: string
    events: Prisma.JsonValue
    secret: string
    previousSecret?: string | null
    previousSecretExpiresAt?: Date | null
    headers?: Prisma.JsonValue
    rateLimitPerMinute?: number
    active: boolean
    maxAttempts: number
    timeoutMs: number
    revision: number
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
  }): WebhookSubscription {
    return {
      id: row.id,
      name: row.name,
      ...(row.description === null ? {} : { description: row.description }),
      url: row.url,
      events: stringArray(row.events),
      secret: row.secret,
      ...(row.previousSecret ? { previousSecret: row.previousSecret } : {}),
      ...(row.previousSecretExpiresAt ? { previousSecretExpiresAt: iso(row.previousSecretExpiresAt) } : {}),
      headers: stringRecord(row.headers ?? {}),
      rateLimitPerMinute: row.rateLimitPerMinute ?? 0,
      active: row.active,
      maxAttempts: row.maxAttempts,
      timeoutMs: row.timeoutMs,
      revision: row.revision,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }
  }

  private mapDelivery(row: {
    id: string
    subscriptionId: string
    eventId: string
    eventType: string
    source: string
    status: string
    payloadJson: Prisma.JsonValue
    attemptsJson: Prisma.JsonValue
    attemptCount: number
    nextAttemptAt: Date
    lastAttemptAt: Date | null
    responseStatus: number | null
    responseBody: string | null
    error: string | null
    leaseOwner?: string | null
    leaseExpiresAt?: Date | null
    revision: number
    createdAt: Date
    updatedAt: Date
  }): WebhookDelivery {
    return {
      id: row.id,
      subscriptionId: row.subscriptionId,
      eventId: row.eventId,
      eventType: row.eventType as WebhookDelivery['eventType'],
      payload: envelope(row.payloadJson),
      source: row.source as WebhookDelivery['source'],
      status: row.status as WebhookDelivery['status'],
      attempts: attempts(row.attemptsJson),
      attemptCount: row.attemptCount,
      nextAttemptAt: iso(row.nextAttemptAt),
      ...(row.lastAttemptAt === null ? {} : { lastAttemptAt: iso(row.lastAttemptAt) }),
      ...(row.responseStatus === null ? {} : { responseStatus: row.responseStatus }),
      ...(row.responseBody === null ? {} : { responseBody: row.responseBody }),
      ...(row.error === null ? {} : { error: row.error }),
      ...(row.leaseOwner ? { leaseOwner: row.leaseOwner } : {}),
      ...(row.leaseExpiresAt ? { leaseExpiresAt: iso(row.leaseExpiresAt) } : {}),
      revision: row.revision,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }
  }

  private subscriptionData(subscription: WebhookSubscription) {
    return {
      name: subscription.name,
      description: subscription.description ?? null,
      url: subscription.url,
      events: subscription.events as Prisma.InputJsonValue,
      secret: subscription.secret,
      previousSecret: subscription.previousSecret ?? null,
      previousSecretExpiresAt: subscription.previousSecretExpiresAt
        ? date(subscription.previousSecretExpiresAt)
        : null,
      headers: subscription.headers as Prisma.InputJsonValue,
      rateLimitPerMinute: subscription.rateLimitPerMinute,
      active: subscription.active,
      maxAttempts: subscription.maxAttempts,
      timeoutMs: subscription.timeoutMs,
      revision: subscription.revision,
      createdBy: subscription.createdBy,
      updatedBy: subscription.updatedBy,
      createdAt: date(subscription.createdAt),
      updatedAt: date(subscription.updatedAt),
    }
  }

  private deliveryData(delivery: WebhookDelivery) {
    return {
      subscriptionId: delivery.subscriptionId,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      source: delivery.source,
      status: delivery.status,
      payloadJson: delivery.payload as unknown as Prisma.InputJsonValue,
      attemptsJson: delivery.attempts as unknown as Prisma.InputJsonValue,
      attemptCount: delivery.attemptCount,
      nextAttemptAt: date(delivery.nextAttemptAt),
      lastAttemptAt: delivery.lastAttemptAt ? date(delivery.lastAttemptAt) : null,
      responseStatus: delivery.responseStatus ?? null,
      responseBody: delivery.responseBody ?? null,
      error: delivery.error ?? null,
      // 状态落盘即释放租约，后续重试/重投由下一次 claim 重新领取。
      leaseOwner: null,
      leaseExpiresAt: null,
      revision: delivery.revision,
      createdAt: date(delivery.createdAt),
      updatedAt: date(delivery.updatedAt),
    }
  }

  private deliveryDataFromRow(row: {
    subscriptionId: string
    eventId: string
    eventType: string
    source: string
    status: string
    payloadJson: Prisma.JsonValue
    attemptsJson: Prisma.JsonValue
    attemptCount: number
    nextAttemptAt: Date
    lastAttemptAt: Date | null
    responseStatus: number | null
    responseBody: string | null
    error: string | null
    leaseOwner?: string | null
    leaseExpiresAt?: Date | null
    revision: number
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      subscriptionId: row.subscriptionId,
      eventId: row.eventId,
      eventType: row.eventType,
      source: row.source,
      status: row.status,
      payloadJson: row.payloadJson as Prisma.InputJsonValue,
      attemptsJson: row.attemptsJson as Prisma.InputJsonValue,
      attemptCount: row.attemptCount,
      nextAttemptAt: row.nextAttemptAt,
      lastAttemptAt: row.lastAttemptAt,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
      error: row.error,
      leaseOwner: row.leaseOwner ?? null,
      leaseExpiresAt: row.leaseExpiresAt ?? null,
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
