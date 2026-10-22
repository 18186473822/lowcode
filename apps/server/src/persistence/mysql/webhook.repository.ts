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

  async saveDelivery(delivery: WebhookDelivery): Promise<void> {
    const data = this.deliveryData(delivery)
    await this.prisma.webhookDelivery.upsert({
      where: { id: delivery.id },
      create: { id: delivery.id, ...data },
      update: data,
    })
  }

  async dueDeliveries(now: string, limit: number): Promise<WebhookDelivery[]> {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: date(now) } },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    })
    return rows.map((row) => this.mapDelivery(row))
  }

  private mapSubscription(row: {
    id: string
    name: string
    description: string | null
    url: string
    events: Prisma.JsonValue
    secret: string
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
      revision: delivery.revision,
      createdAt: date(delivery.createdAt),
      updatedAt: date(delivery.updatedAt),
    }
  }
}
