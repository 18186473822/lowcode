/**
 * 将现有 JSON 文件数据导入 MySQL（幂等 upsert，不删除目标库中的额外数据）。
 *
 * 覆盖范围（与 Prisma schema 对齐）：
 *   pages/<id>.json            → pages + page_versions
 *   models/<id>.json           → models
 *   data/<modelId>/<id>.json   → data_records
 *   rbac.json                  → roles + rbac_page_grants
 *   flows.json                 → flow_definitions
 *   flow-instances.json        → flow_instances
 *   ops/events.json            → ops_events
 *   apps.json                  → app_config
 *   webhooks.json              → webhook_subscriptions
 *   webhook-deliveries.json    → webhook_deliveries
 *   webhook-delivery-archive.json → webhook_delivery_archives
 *   files/<id> + files-meta/<id>.json → files（字节 + 元信息）
 *
 * 用户/口令不走 JSON，执行前先 `pnpm -F @lc/server seed:mysql`。
 *
 * 用法（在 apps/server 下）：
 *   node --env-file=.env scripts/import-json-to-mysql.mjs
 *   LC_DATA_DIR=./data node --env-file=.env scripts/import-json-to-mysql.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient, Prisma } from '@prisma/client'

const dataDir = process.env.LC_DATA_DIR ?? path.join(process.cwd(), 'data')
const prisma = new PrismaClient()

function date(value, fallback = new Date()) {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function optionalDate(value) {
  return value ? date(value) : null
}

async function readJson(file) {
  const raw = await readFile(file, 'utf8')
  return JSON.parse(raw.replace(/^\uFEFF/, ''))
}

async function listJson(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.json'))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function importPages() {
  const dir = path.join(dataDir, 'pages')
  const files = await listJson(dir)
  for (const file of files) {
    const page = await readJson(path.join(dir, file))
    const data = {
      appId: page.appId ?? 'default',
      name: page.name ?? page.id,
      type: page.type ?? 'form',
      status: page.status === 'published' ? 'published' : 'draft',
      currentVersion: Number(page.currentVersion ?? 0),
      draft:
        page.draft === null || page.draft === undefined
          ? Prisma.DbNull
          : page.draft,
      draftUpdatedAt: optionalDate(page.draftUpdatedAt),
      draftUpdatedBy: page.draftUpdatedBy ?? null,
      createdAt: date(page.createdAt),
      updatedAt: date(page.updatedAt),
    }
    await prisma.$transaction(async (tx) => {
      await tx.page.upsert({
        where: { id: page.id },
        create: { id: page.id, ...data },
        update: data,
      })
      await tx.pageVersion.deleteMany({ where: { pageId: page.id } })
      const versions = Array.isArray(page.versions) ? page.versions : []
      if (versions.length > 0) {
        await tx.pageVersion.createMany({
          data: versions.map((version) => ({
            pageId: page.id,
            version: Number(version.version),
            schemaJson: version.schema,
            createdBy: version.createdBy ?? 'system',
            createdAt: date(version.createdAt),
            note: version.note ?? null,
          })),
        })
      }
    })
  }
  return files.length
}

async function importModels() {
  const dir = path.join(dataDir, 'models')
  const files = await listJson(dir)
  for (const file of files) {
    const model = await readJson(path.join(dir, file))
    const id = model.schema?.id ?? file.replace(/\.json$/, '')
    const data = {
      schemaJson: model.schema ?? model,
      createdAt: date(model.createdAt),
      updatedAt: date(model.updatedAt),
      createdBy: model.createdBy ?? 'system',
      updatedBy: model.updatedBy ?? 'system',
    }
    await prisma.modelDef.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }
  return files.length
}

async function importRecords() {
  const root = path.join(dataDir, 'data')
  let dirs
  try {
    dirs = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }

  let count = 0
  for (const modelId of dirs) {
    const model = await prisma.modelDef.findUnique({ where: { id: modelId } })
    if (!model) {
      console.warn(`跳过记录：模型 ${modelId} 尚未导入`)
      continue
    }
    for (const file of await listJson(path.join(root, modelId))) {
      const record = await readJson(path.join(root, modelId, file))
      const data = {
        payload: record.payload ?? {},
        createdBy: record.createdBy ?? 'system',
        createdAt: date(record.createdAt),
        updatedBy: record.updatedBy ?? null,
        updatedAt: date(record.updatedAt),
        deletedAt: optionalDate(record.deletedAt),
      }
      await prisma.dataRecord.upsert({
        where: { modelId_id: { modelId, id: record.id } },
        create: { modelId, id: record.id, ...data },
        update: data,
      })
      count += 1
    }
  }
  return count
}

async function importRbac() {
  const file = path.join(dataDir, 'rbac.json')
  let config
  try {
    config = await readJson(file)
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }

  const roles = Array.isArray(config.roles) ? config.roles : []
  const pages = config.pages && typeof config.pages === 'object' ? config.pages : {}
  await prisma.$transaction(async (tx) => {
    for (const role of roles) {
      const data = { name: role.name ?? role.key, perms: role.perms ?? [] }
      await tx.role.upsert({
        where: { key: role.key },
        create: { key: role.key, ...data },
        update: data,
      })
    }
    for (const [pageId, roleKeys] of Object.entries(pages)) {
      const data = { roles: roleKeys }
      await tx.rbacPageGrant.upsert({
        where: { pageId },
        create: { pageId, ...data },
        update: data,
      })
    }
  })
  return true
}

async function importFlows() {
  const file = path.join(dataDir, 'flows.json')
  let parsed
  try {
    parsed = await readJson(file)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const flows = Array.isArray(parsed) ? parsed : parsed.flows
  if (!Array.isArray(flows)) return 0

  for (const flow of flows) {
    const now = new Date()
    const data = {
      modelId: flow.modelId ?? '',
      name: flow.name ?? flow.flowId,
      schemaJson: flow,
      updatedAt: now,
    }
    await prisma.flowDefinition.upsert({
      where: { flowId: flow.flowId },
      create: { flowId: flow.flowId, ...data, createdAt: now },
      update: data,
    })
  }
  return flows.length
}

async function importFlowInstances() {
  const file = path.join(dataDir, 'flow-instances.json')
  let parsed
  try {
    parsed = await readJson(file)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const instances = Array.isArray(parsed) ? parsed : parsed.instances
  if (!Array.isArray(instances)) return 0

  for (const instance of instances) {
    const data = {
      flowId: instance.flowId,
      modelId: instance.modelId,
      recordId: instance.recordId,
      status: instance.status ?? 'running',
      currentNodeId: instance.currentNodeId ?? null,
      createdBy: instance.createdBy ?? 'system',
      createdAt: date(instance.createdAt),
      updatedAt: date(instance.updatedAt),
      tasksJson: Array.isArray(instance.tasks) ? instance.tasks : [],
      historyJson: Array.isArray(instance.history) ? instance.history : [],
    }
    await prisma.flowInstance.upsert({
      where: { id: instance.id },
      create: { id: instance.id, ...data },
      update: {
        flowId: data.flowId,
        modelId: data.modelId,
        recordId: data.recordId,
        status: data.status,
        currentNodeId: data.currentNodeId,
        createdBy: data.createdBy,
        updatedAt: data.updatedAt,
        tasksJson: data.tasksJson,
        historyJson: data.historyJson,
      },
    })
  }
  return instances.length
}

async function importOps() {
  const file = path.join(dataDir, 'ops', 'events.json')
  let parsed
  try {
    parsed = await readJson(file)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const events = Array.isArray(parsed) ? parsed : parsed.events
  if (!Array.isArray(events)) return 0

  for (const event of events) {
    const data = {
      type: event.type,
      name: event.name,
      pageId: event.pageId ?? null,
      pageVersion: event.pageVersion === undefined ? null : String(event.pageVersion),
      source: event.source ?? 'runtime',
      userId: event.userId ?? null,
      message: event.message ?? null,
      durationMs: event.durationMs ?? null,
      detailJson: event.detail ?? Prisma.DbNull,
      at: date(event.at),
    }
    await prisma.opsEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, ...data },
      update: data,
    })
  }
  return events.length
}

async function importAppConfig() {
  const file = path.join(dataDir, 'apps.json')
  let config
  try {
    config = await readJson(file)
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  const theme = config.theme && typeof config.theme === 'object' ? config.theme : Prisma.DbNull
  const now = new Date()
  await prisma.appConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', theme, updatedAt: now },
    update: { theme, updatedAt: now },
  })
  return true
}

function normalizeHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string'))
}

async function importWebhooks() {
  const file = path.join(dataDir, 'webhooks.json')
  let parsed
  try {
    parsed = await readJson(file)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const subscriptions = Array.isArray(parsed) ? parsed : parsed.subscriptions
  if (!Array.isArray(subscriptions)) return 0

  for (const sub of subscriptions) {
    const data = {
      name: sub.name ?? sub.id,
      description: sub.description ?? null,
      url: sub.url,
      events: Array.isArray(sub.events) ? sub.events : [],
      secret: sub.secret,
      previousSecret: sub.previousSecret ?? null,
      previousSecretExpiresAt: optionalDate(sub.previousSecretExpiresAt),
      headers: normalizeHeaders(sub.headers),
      rateLimitPerMinute: Number.isInteger(sub.rateLimitPerMinute) ? sub.rateLimitPerMinute : 0,
      active: sub.active !== false,
      maxAttempts: Number.isInteger(sub.maxAttempts) ? sub.maxAttempts : 5,
      timeoutMs: Number.isInteger(sub.timeoutMs) ? sub.timeoutMs : 10000,
      revision: Number.isInteger(sub.revision) ? sub.revision : 0,
      createdBy: sub.createdBy ?? 'system',
      updatedBy: sub.updatedBy ?? 'system',
      createdAt: date(sub.createdAt),
      updatedAt: date(sub.updatedAt),
    }
    await prisma.webhookSubscription.upsert({
      where: { id: sub.id },
      create: { id: sub.id, ...data },
      update: data,
    })
  }
  return subscriptions.length
}

function deliveryData(delivery) {
  return {
    subscriptionId: delivery.subscriptionId,
    eventId: delivery.eventId ?? delivery.id,
    eventType: delivery.eventType,
    source: delivery.source ?? 'event',
    status: delivery.status ?? 'pending',
    payloadJson: delivery.payload ?? {},
    attemptsJson: Array.isArray(delivery.attempts) ? delivery.attempts : [],
    attemptCount: Number.isInteger(delivery.attemptCount) ? delivery.attemptCount : 0,
    nextAttemptAt: date(delivery.nextAttemptAt ?? delivery.createdAt),
    lastAttemptAt: optionalDate(delivery.lastAttemptAt),
    responseStatus: delivery.responseStatus ?? null,
    responseBody: delivery.responseBody ?? null,
    error: delivery.error ?? null,
    leaseOwner: delivery.leaseOwner ?? null,
    leaseExpiresAt: optionalDate(delivery.leaseExpiresAt),
    revision: Number.isInteger(delivery.revision) ? delivery.revision : 0,
    createdAt: date(delivery.createdAt),
    updatedAt: date(delivery.updatedAt),
  }
}

async function importWebhookDeliveries() {
  const file = path.join(dataDir, 'webhook-deliveries.json')
  let parsed
  try {
    parsed = await readJson(file)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const deliveries = Array.isArray(parsed) ? parsed : parsed.deliveries
  if (!Array.isArray(deliveries)) return 0

  for (const delivery of deliveries) {
    const data = deliveryData(delivery)
    await prisma.webhookDelivery.upsert({
      where: { id: delivery.id },
      create: { id: delivery.id, ...data },
      update: data,
    })
  }
  return deliveries.length
}

async function importWebhookArchives() {
  const file = path.join(dataDir, 'webhook-delivery-archive.json')
  let parsed
  try {
    parsed = await readJson(file)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const deliveries = Array.isArray(parsed) ? parsed : parsed.deliveries
  if (!Array.isArray(deliveries)) return 0

  for (const delivery of deliveries) {
    const data = {
      ...deliveryData(delivery),
      archivedAt: date(delivery.archivedAt ?? delivery.updatedAt ?? delivery.createdAt),
    }
    await prisma.webhookDeliveryArchive.upsert({
      where: { id: delivery.id },
      create: { id: delivery.id, ...data },
      update: data,
    })
  }
  return deliveries.length
}

/** 文件 id 白名单与服务端一致：防止把目录里的临时文件/异常名导入数据库 */
const FILE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

async function importFiles() {
  const dir = path.join(dataDir, 'files')
  let names
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }

  let count = 0
  for (const id of names.sort()) {
    if (!FILE_ID_RE.test(id)) {
      console.warn(`跳过文件：非法 id ${id}`)
      continue
    }

    const content = await readFile(path.join(dir, id))
    let meta
    try {
      meta = await readJson(path.join(dataDir, 'files-meta', `${id}.json`))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      // 与运行时磁盘仓储的降级语义一致：元信息缺失仍可导入字节
      meta = {}
    }

    const data = {
      originalName: meta.originalName ?? id,
      mimeType: meta.mimeType ?? 'application/octet-stream',
      size: content.length,
      uploadedAt: date(meta.uploadedAt),
      uploadedBy: meta.uploadedBy ?? 'system',
      content,
    }
    await prisma.fileObject.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
    count += 1
  }
  return count
}

try {
  console.log(`数据目录：${dataDir}`)
  const pages = await importPages()
  const models = await importModels()
  const records = await importRecords()
  const rbac = await importRbac()
  const flows = await importFlows()
  const instances = await importFlowInstances()
  const ops = await importOps()
  const appConfig = await importAppConfig()
  const webhooks = await importWebhooks()
  const webhookDeliveries = await importWebhookDeliveries()
  const webhookArchives = await importWebhookArchives()
  const files = await importFiles()
  console.log(
    `导入完成：pages=${pages}, models=${models}, records=${records}, rbac=${rbac ? 'yes' : 'skip'}, ` +
      `flows=${flows}, instances=${instances}, ops=${ops}, appConfig=${appConfig ? 'yes' : 'skip'}, ` +
      `webhooks=${webhooks}, webhookDeliveries=${webhookDeliveries}, webhookArchives=${webhookArchives}, files=${files}`,
  )
} catch (error) {
  console.error('导入失败：', error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
