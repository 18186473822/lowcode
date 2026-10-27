/**
 * MySQL 仓储单测（无数据库）：
 *
 * 集成测试 `mysql.persistence.test.ts` 需要真实 MySQL，CI 的覆盖率任务默认跳过；
 * 本文件用最小 Prisma 替身覆盖各仓储的映射、CAS 与边界分支，保证 mysql 实现
 * 也进入「函数/语句」覆盖率统计。真实 SQL 行为仍由集成测试与迁移回读负责。
 *
 * 替身只实现被测方法实际调用的 Prisma API，不模拟 SQL 语义。
 */
import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { PageSchema } from '@lc/schema'
import { MysqlPageRepository } from '../src/persistence/mysql/page.repository.js'
import { MysqlRecordRepository } from '../src/persistence/mysql/record.repository.js'
import { MysqlFlowRepository } from '../src/persistence/mysql/flow.repository.js'
import { MysqlAppConfigRepository } from '../src/persistence/mysql/app-config.repository.js'
import { MysqlFileRepository } from '../src/persistence/mysql/file.repository.js'
import { MysqlModelRepository } from '../src/persistence/mysql/model.repository.js'
import { MysqlOpsRepository } from '../src/persistence/mysql/ops.repository.js'
import { MysqlRbacRepository } from '../src/persistence/mysql/rbac.repository.js'
import { MysqlUserRepository } from '../src/persistence/mysql/user.repository.js'
import { MysqlMarketRepository } from '../src/persistence/mysql/market.repository.js'
import { MysqlAuditRepository } from '../src/persistence/mysql/audit.repository.js'
import { Prisma } from '@prisma/client'
import type { PageRecord } from '../src/page/page.types.js'
import type { DataRecordEntity } from '../src/model/model.types.js'
import type { FlowInstance } from '../src/flow/flow.types.js'
import type { OpsEvent } from '../src/ops/ops.types.js'

const NOW = new Date('2026-10-22T08:00:00.000Z')

/** 构造带事务回调的 Prisma 替身（事务直接使用同一个替身对象） */
function fakePrisma(parts: Record<string, unknown>): PrismaClient {
  const prisma = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    ...parts,
  }
  return prisma as unknown as PrismaClient
}

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    appId: 'app1',
    name: '页面',
    type: 'page',
    status: 'draft',
    currentVersion: 0,
    revision: 1,
    draft: { id: 'p1' },
    draftUpdatedAt: NOW,
    draftUpdatedBy: 'u1',
    createdBy: 'u1',
    versions: [
      {
        version: 1,
        schemaJson: { id: 'p1' },
        createdBy: 'u1',
        createdAt: NOW,
        note: null,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function pageRecord(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    id: 'p1',
    appId: 'app1',
    name: '页面',
    type: 'page',
    status: 'draft',
    currentVersion: 0,
    revision: 1,
    draft: { id: 'p1' } as PageSchema,
    draftUpdatedAt: NOW.toISOString(),
    draftUpdatedBy: 'u1',
    createdBy: 'u1',
    versions: [
      {
        version: 1,
        schema: { id: 'p1' } as PageSchema,
        createdBy: 'u1',
        createdAt: NOW.toISOString(),
      },
    ],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

function recordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    payload: { name: '张三' },
    revision: 3,
    createdBy: 'u1',
    createdAt: NOW,
    updatedBy: 'u2',
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  }
}

function recordEntity(overrides: Partial<DataRecordEntity> = {}): DataRecordEntity {
  return {
    id: 'r1',
    payload: { name: '张三' },
    revision: 3,
    createdBy: 'u1',
    createdAt: NOW.toISOString(),
    updatedBy: 'u2',
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

function flowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    flowId: 'f1',
    modelId: 'm1',
    recordId: 'r1',
    status: 'running',
    currentNodeId: 'n1',
    createdBy: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    revision: 2,
    pendingPatchJson: { status: 'approved' },
    tasksJson: [{ id: 't1', status: 'pending' }],
    historyJson: [{ nodeId: 'n0', action: 'start' }],
    ...overrides,
  }
}

function flowInstance(overrides: Partial<FlowInstance> = {}): FlowInstance {
  return {
    id: 'i1',
    flowId: 'f1',
    modelId: 'm1',
    recordId: 'r1',
    status: 'running',
    currentNodeId: 'n1',
    createdBy: 'u1',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    revision: 2,
    pendingPatch: { status: 'approved' },
    tasks: [{ id: 't1', status: 'pending' }] as FlowInstance['tasks'],
    history: [{ nodeId: 'n0', action: 'start' }] as FlowInstance['history'],
    ...overrides,
  }
}

describe('MysqlPageRepository', () => {
  it('映射、CAS、创建与删除路径', async () => {
    const page = {
      findUnique: vi.fn().mockResolvedValue(pageRow()),
      findMany: vi.fn().mockResolvedValue([pageRow()]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    }
    const pageVersion = { deleteMany: vi.fn(), createMany: vi.fn() }
    const prisma = fakePrisma({ page, pageVersion })
    const repo = new MysqlPageRepository(prisma)

    expect((await repo.find('p1'))?.revision).toBe(1)
    expect((await repo.find('p1'))?.createdBy).toBe('u1')
    expect(await repo.find('bad id')).toBeNull()
    expect((await repo.list())[0]!.versions[0]!.version).toBe(1)

    await repo.save(pageRecord())
    expect(page.update).toHaveBeenCalledTimes(1)
    expect(pageVersion.createMany).toHaveBeenCalled()

    expect(await repo.saveIfRevision(pageRecord(), 1)).toBe(true)
    expect(await repo.remove('p1')).toBe(true)
    expect(await repo.remove('bad id')).toBe(false)
  })

  it('新建页面、版本冲突与非法 id', async () => {
    const page = {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(null) // save → 新建
        .mockResolvedValueOnce({ revision: 1 }), // saveIfRevision → 版本不符
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    }
    const pageVersion = { deleteMany: vi.fn(), createMany: vi.fn() }
    const repo = new MysqlPageRepository(fakePrisma({ page, pageVersion }))

    await repo.save(pageRecord({ versions: [] }))
    expect(page.create).toHaveBeenCalledTimes(1)
    expect(pageVersion.createMany).not.toHaveBeenCalled()

    expect(await repo.saveIfRevision(pageRecord(), 0)).toBe(false)
    await expect(repo.save(pageRecord({ id: 'bad id' }))).rejects.toThrow('非法页面 id')
  })
})

describe('MysqlRecordRepository', () => {
  it('映射、upsert 与 CAS 分支', async () => {
    const dataRecord = {
      findUnique: vi.fn().mockResolvedValue(recordRow()),
      findMany: vi.fn().mockResolvedValue([recordRow()]),
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    }
    const repo = new MysqlRecordRepository(fakePrisma({ dataRecord }))

    expect((await repo.find('m1', 'r1'))?.revision).toBe(3)
    expect(await repo.find('bad id', 'r1')).toBeNull()
    expect((await repo.list('m1'))[0]!.id).toBe('r1')
    expect(await repo.list('bad id')).toEqual([])

    await repo.save('m1', recordEntity())
    expect(dataRecord.upsert).toHaveBeenCalledTimes(1)
    expect(await repo.saveIfRevision('m1', recordEntity(), 3)).toBe(true)
    await expect(repo.save('bad id', recordEntity())).rejects.toThrow('非法模型 id')
    await expect(repo.save('m1', recordEntity({ id: 'bad id' }))).rejects.toThrow('非法记录 id')
  })

  it('已有记录版本不符返回 false；新记录仅在 expected=0 时创建', async () => {
    const dataRecord = {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(recordRow()) // 版本不符且已存在
        .mockResolvedValueOnce(null), // 不存在 → 允许创建
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(),
    }
    const repo = new MysqlRecordRepository(fakePrisma({ dataRecord }))

    expect(await repo.saveIfRevision('m1', recordEntity(), 2)).toBe(false)
    expect(await repo.saveIfRevision('m1', recordEntity({ revision: 0 }), 0)).toBe(true)
    expect(dataRecord.create).toHaveBeenCalledTimes(1)
  })
})

describe('MysqlFlowRepository', () => {
  it('定义与实例映射、保存、删除', async () => {
    const flowDefinition = {
      findMany: vi.fn().mockResolvedValue([{ schemaJson: { flowId: 'f1' } }]),
      findUnique: vi.fn().mockResolvedValue({ schemaJson: { flowId: 'f1' } }),
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    }
    const flowInstanceStore = {
      findMany: vi.fn().mockResolvedValue([flowRow()]),
      findUnique: vi.fn().mockResolvedValue(flowRow()),
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    }
    const repo = new MysqlFlowRepository(fakePrisma({ flowDefinition, flowInstance: flowInstanceStore }))
    const flow = { flowId: 'f1', modelId: 'm1', name: '流程', nodes: [] } as never

    expect(await repo.listFlows()).toHaveLength(1)
    expect(await repo.findFlow('f1')).toMatchObject({ flowId: 'f1' })
    await repo.saveFlow(flow)
    expect(flowDefinition.upsert).toHaveBeenCalled()
    expect(await repo.deleteFlow('f1')).toBe(true)

    expect((await repo.listInstances())[0]!.pendingPatch).toEqual({ status: 'approved' })
    expect((await repo.findInstance('i1'))!.tasks).toHaveLength(1)
    await repo.saveInstance(flowInstance())
    expect(await repo.saveInstanceIfRevision(flowInstance(), 2)).toBe(true)
    expect(flowInstanceStore.upsert).toHaveBeenCalled()
  })

  it('实例 CAS：已存在冲突、缺失且 expected=0 时创建、非法时间回退', async () => {
    const flowInstanceStore = {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({ id: 'i1' }) // 已存在但版本不符
        .mockResolvedValueOnce(null), // 不存在 → 创建
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(),
      upsert: vi.fn(),
    }
    const repo = new MysqlFlowRepository(fakePrisma({ flowInstance: flowInstanceStore }))

    expect(await repo.saveInstanceIfRevision(flowInstance(), 1)).toBe(false)
    expect(
      await repo.saveInstanceIfRevision(flowInstance({ revision: 0, createdAt: 'bad' }), 0),
    ).toBe(true)
    expect(flowInstanceStore.create).toHaveBeenCalledTimes(1)

    flowInstanceStore.findUnique.mockResolvedValueOnce(null)
    expect(await repo.findInstance('missing')).toBeNull()
    flowInstanceStore.findMany.mockResolvedValueOnce([
      flowRow({ pendingPatchJson: null, tasksJson: {}, historyJson: null }),
    ])
    const inst = (await repo.listInstances())[0]!
    expect(inst.pendingPatch).toBeUndefined()
    expect(inst.tasks).toEqual([])
    expect(inst.history).toEqual([])
  })
})

describe('MysqlAppConfigRepository', () => {
  it('读取空/非法 theme，写入 theme 与空配置', async () => {
    const appConfig = {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ theme: [] })
        .mockResolvedValueOnce({ theme: { primary: '#000' } }),
      upsert: vi.fn(),
    }
    const repo = new MysqlAppConfigRepository(fakePrisma({ appConfig }))

    expect(await repo.read()).toEqual({})
    expect(await repo.read()).toEqual({})
    expect(await repo.read()).toEqual({ theme: { primary: '#000' } })

    await repo.write({ theme: { primary: '#111' } })
    await repo.write({})
    expect(appConfig.upsert).toHaveBeenCalledTimes(2)
  })
})

describe('MysqlFileRepository', () => {
  it('保存文件并映射读回；缺失返回 null', async () => {
    const fileObject = {
      upsert: vi.fn(),
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'f1.txt',
          originalName: 'a.txt',
          mimeType: 'text/plain',
          size: 3,
          uploadedAt: NOW,
          uploadedBy: 'u1',
          content: Buffer.from('abc'),
        }),
    }
    const repo = new MysqlFileRepository(fakePrisma({ fileObject }))

    await repo.save({
      id: 'f1.txt',
      meta: {
        originalName: 'a.txt',
        mimeType: 'text/plain',
        size: 3,
        uploadedAt: NOW.toISOString(),
        uploadedBy: 'u1',
      },
      data: Buffer.from('abc'),
    })
    expect(fileObject.upsert).toHaveBeenCalledTimes(1)
    expect(await repo.find('missing')).toBeNull()
    const found = await repo.find('f1.txt')
    expect(found?.meta.originalName).toBe('a.txt')
    expect(found?.data.toString()).toBe('abc')
  })
})

describe('MysqlModelRepository', () => {
  it('读取、保存、列表与非法 id', async () => {
    const modelDef = {
      findUnique: vi.fn().mockResolvedValue({
        schemaJson: { id: 'm1' },
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: 'u1',
        updatedBy: 'u1',
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          schemaJson: { id: 'm1' },
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: 'u1',
          updatedBy: 'u1',
        },
      ]),
      upsert: vi.fn(),
    }
    const repo = new MysqlModelRepository(fakePrisma({ modelDef }))
    const entity = {
      schema: { id: 'm1' } as never,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      createdBy: 'u1',
      updatedBy: 'u1',
    }

    expect((await repo.find('m1'))?.createdBy).toBe('u1')
    expect(await repo.find('bad id')).toBeNull()
    await repo.save('m1', entity)
    expect(modelDef.upsert).toHaveBeenCalled()
    expect(await repo.list()).toHaveLength(1)
    await expect(repo.save('bad id', entity)).rejects.toThrow('非法模型 id')
  })
})

describe('MysqlOpsRepository', () => {
  it('读回分页版本/详情，并对非法页码做降级', async () => {
    const opsEvent = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'e1',
          type: 'error',
          name: 'boom',
          pageId: 'p1',
          pageVersion: 'draft',
          source: 'server',
          userId: 'u1',
          message: '失败',
          durationMs: 12,
          detailJson: { stack: 'x' },
          at: NOW,
        },
        {
          id: 'e2',
          type: 'event',
          name: 'open',
          pageId: null,
          pageVersion: 'bad',
          source: 'runtime',
          userId: null,
          message: null,
          durationMs: null,
          detailJson: [],
          at: NOW,
        },
      ]),
    }
    const repo = new MysqlOpsRepository(fakePrisma({ opsEvent }))
    const items = await repo.list()
    expect(items[0]).toMatchObject({ pageVersion: 'draft', detail: { stack: 'x' } })
    expect(items[1]!.pageVersion).toBeUndefined()
    expect(items[1]!.detail).toBeUndefined()
  })

  it('追加时插入事件并淘汰溢出最旧行；空批次也返回总数', async () => {
    const opsEvent = {
      createMany: vi.fn(),
      findMany: vi
        .fn()
        .mockResolvedValueOnce([{ seq: 1 }, { seq: 2 }, { seq: 3 }])
        .mockResolvedValueOnce([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    }
    const repo = new MysqlOpsRepository(fakePrisma({ opsEvent }))
    const event: OpsEvent = {
      id: 'e1',
      type: 'event',
      name: 'open',
      source: 'runtime',
      at: NOW.toISOString(),
    }

    expect(await repo.append([event], 1)).toEqual({ total: 1, dropped: 2 })
    expect(opsEvent.createMany).toHaveBeenCalledTimes(1)
    expect(await repo.append([], 5)).toEqual({ total: 0, dropped: 0 })
    expect(opsEvent.createMany).toHaveBeenCalledTimes(1)
  })
})

describe('MysqlRbacRepository', () => {
  it('空表回退 seed；非空映射角色与页面白名单', async () => {
    const role = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { key: 'admin', name: '管理员', perms: ['*', 1] },
          { key: 'viewer', name: '访客', perms: 'bad' },
        ]),
    }
    const rbacPageGrant = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ pageId: 'p1', roles: ['admin', 2] }]),
    }
    const repo = new MysqlRbacRepository(fakePrisma({ role, rbacPageGrant }))

    const seeded = await repo.load()
    expect(seeded.roles.length).toBeGreaterThan(0)
    const loaded = await repo.load()
    expect(loaded.roles[0]!.perms).toEqual(['*'])
    expect(loaded.roles[1]!.perms).toEqual([])
    expect(loaded.pages.p1).toEqual(['admin'])
  })

  it('保存空配置走全量删除，非空配置走差量 upsert', async () => {
    const role = { deleteMany: vi.fn(), upsert: vi.fn() }
    const rbacPageGrant = { deleteMany: vi.fn(), upsert: vi.fn() }
    const repo = new MysqlRbacRepository(fakePrisma({ role, rbacPageGrant }))

    await repo.save({ roles: [], pages: {} })
    expect(role.deleteMany).toHaveBeenCalledWith()
    expect(rbacPageGrant.deleteMany).toHaveBeenCalledWith()

    await repo.save({
      roles: [{ key: 'admin', name: '管理员', perms: ['*'] }],
      pages: { p1: ['admin'] },
    })
    expect(role.upsert).toHaveBeenCalledTimes(1)
    expect(rbacPageGrant.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('MysqlUserRepository', () => {
  it('缺失返回 null；命中映射角色并降级未知状态', async () => {
    const user = {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'u1',
          username: 'alice',
          displayName: 'Alice',
          roles: [{ roleKey: 'viewer' }],
          passwordHash: 'hash',
          status: 'disabled',
        }),
    }
    const repo = new MysqlUserRepository(fakePrisma({ user }))

    expect(await repo.findByUsername('missing')).toBeNull()
    expect(await repo.findByUsername('alice')).toEqual({
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      roles: ['viewer'],
      passwordHash: 'hash',
      status: 'disabled',
    })
  })
})

/* ------------------------------------------------------------------ */
/* 物料市场                                                            */
/* ------------------------------------------------------------------ */

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

function marketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'brand-button',
    status: 'draft',
    version: '1.0.0',
    name: '品牌按钮',
    description: null,
    category: 'basic',
    kind: 'component',
    component: 'Button',
    metaJson: { name: 'BrandButton', title: '品牌按钮' },
    revision: 1,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: NOW,
    updatedAt: NOW,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewDecision: null,
    reviewNote: null,
    publishedAt: null,
    publishedBy: null,
    publishedVersion: null,
    ...overrides,
  }
}

function marketMaterial(overrides: Record<string, unknown> = {}) {
  return {
    id: 'brand-button',
    name: '品牌按钮',
    version: '1.0.0',
    category: 'basic' as const,
    kind: 'component' as const,
    component: 'Button',
    meta: { name: 'BrandButton', title: '品牌按钮' } as never,
    status: 'draft' as const,
    revision: 1,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

function marketVersion(overrides: Record<string, unknown> = {}) {
  return {
    materialId: 'brand-button',
    version: '1.0.0',
    entry: {
      id: 'brand-button',
      name: '品牌按钮',
      version: '1.0.0',
      category: 'basic' as const,
      kind: 'component' as const,
      component: 'Button',
      meta: { name: 'BrandButton', title: '品牌按钮' } as never,
    },
    publishedBy: 'admin',
    publishedAt: NOW.toISOString(),
    ...overrides,
  }
}

function marketInstall(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'default',
    materialId: 'brand-button',
    version: '1.0.0',
    installedBy: 'designer',
    installedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    revision: 1,
    ...overrides,
  }
}

describe('MysqlMarketRepository', () => {
  it('物料列表/详情映射可空字段（null 不进入对象）与完整字段', async () => {
    const marketMaterialApi = {
      findMany: vi.fn().mockResolvedValue([
        marketRow(),
        marketRow({
          id: 'with-audit',
          description: '有描述',
          component: null,
          kind: 'meta',
          status: 'published',
          revision: 5,
          submittedAt: NOW,
          reviewedAt: NOW,
          reviewedBy: 'admin',
          reviewDecision: 'approved',
          reviewNote: 'OK',
          publishedAt: NOW,
          publishedBy: 'admin',
          publishedVersion: '1.0.0',
        }),
      ]),
      findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(marketRow()),
    }
    const repo = new MysqlMarketRepository(fakePrisma({ marketMaterial: marketMaterialApi }))

    const rows = await repo.listMaterials()
    expect(marketMaterialApi.findMany).toHaveBeenCalledWith({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    })
    expect(rows[0]).toEqual({
      id: 'brand-button',
      status: 'draft',
      version: '1.0.0',
      name: '品牌按钮',
      category: 'basic',
      kind: 'component',
      component: 'Button',
      meta: { name: 'BrandButton', title: '品牌按钮' },
      revision: 1,
      createdBy: 'admin',
      updatedBy: 'admin',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    })
    expect(rows[1]).toMatchObject({
      description: '有描述',
      kind: 'meta',
      status: 'published',
      reviewDecision: 'approved',
      reviewNote: 'OK',
      publishedVersion: '1.0.0',
      submittedAt: NOW.toISOString(),
    })
    expect(rows[1]!.component).toBeUndefined()

    expect(await repo.findMaterial('missing')).toBeNull()
    expect((await repo.findMaterial('brand-button'))?.id).toBe('brand-button')
  })

  it('创建重复 id 捕获 P2002 返回 false，其它错误原样抛出', async () => {
    const marketMaterialApi = {
      create: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(uniqueViolation())
        .mockRejectedValueOnce(new Error('boom')),
    }
    const repo = new MysqlMarketRepository(fakePrisma({ marketMaterial: marketMaterialApi }))

    expect(await repo.createMaterial(marketMaterial() as never)).toBe(true)
    expect(await repo.createMaterial(marketMaterial() as never)).toBe(false)
    await expect(repo.createMaterial(marketMaterial() as never)).rejects.toThrow('boom')
    expect(marketMaterialApi.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'brand-button', revision: 1, submittedAt: null }),
    })
  })

  it('更新走 revision CAS；发布事务返回 conflict/ok/version-exists', async () => {
    const marketMaterialApi = {
      updateMany: vi
        .fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 }),
    }
    const marketMaterialVersionApi = {
      create: vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(uniqueViolation()),
    }
    const repo = new MysqlMarketRepository(
      fakePrisma({
        marketMaterial: marketMaterialApi,
        marketMaterialVersion: marketMaterialVersionApi,
      }),
    )

    expect(await repo.updateMaterial(marketMaterial() as never, 9)).toBe(false)
    expect(marketMaterialApi.updateMany).toHaveBeenCalledWith({
      where: { id: 'brand-button', revision: 9 },
      data: expect.objectContaining({ revision: 1 }),
    })
    expect(await repo.updateMaterial(marketMaterial() as never, 1)).toBe(true)

    expect(await repo.publishMaterial(marketMaterial() as never, marketVersion() as never, 9)).toBe(
      'conflict',
    )
    expect(
      await repo.publishMaterial(marketMaterial() as never, marketVersion() as never, 1),
    ).toBe('ok')
    expect(marketMaterialVersionApi.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ materialId: 'brand-button', version: '1.0.0', note: null }),
    })
    expect(
      await repo.publishMaterial(
        marketMaterial() as never,
        marketVersion() as never,
        1,
      ),
    ).toBe('version-exists')
  })

  it('版本列表/详情映射，note 为空时不输出', async () => {
    const marketMaterialVersionApi = {
      findMany: vi.fn().mockResolvedValue([
        {
          materialId: 'brand-button',
          version: '1.0.0',
          entryJson: { id: 'brand-button' },
          note: null,
          publishedBy: 'admin',
          publishedAt: NOW,
        },
        {
          materialId: 'brand-button',
          version: '0.9.0',
          entryJson: { id: 'brand-button' },
          note: '首发',
          publishedBy: 'admin',
          publishedAt: NOW,
        },
      ]),
      findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        materialId: 'brand-button',
        version: '1.0.0',
        entryJson: { id: 'brand-button' },
        note: 'OK',
        publishedBy: 'admin',
        publishedAt: NOW,
      }),
    }
    const repo = new MysqlMarketRepository(fakePrisma({ marketMaterialVersion: marketMaterialVersionApi }))

    const items = await repo.listVersions('brand-button')
    expect(items).toHaveLength(2)
    expect(items[0]!.note).toBeUndefined()
    expect(items[0]!.publishedAt).toBe(NOW.toISOString())
    expect(items[1]!.note).toBe('首发')

    expect(await repo.findVersion('brand-button', '9.9.9')).toBeNull()
    expect((await repo.findVersion('brand-button', '1.0.0'))?.note).toBe('OK')
    expect(marketMaterialVersionApi.findUnique).toHaveBeenCalledWith({
      where: { materialId_version: { materialId: 'brand-button', version: '1.0.0' } },
    })
  })

  it('安装记录：租户过滤、创建冲突、CAS 更新与删除', async () => {
    const installRow = {
      tenantId: 'default',
      materialId: 'brand-button',
      version: '1.0.0',
      installedBy: 'designer',
      installedAt: NOW,
      updatedAt: NOW,
      revision: 1,
    }
    const marketInstallApi = {
      findMany: vi.fn().mockResolvedValue([installRow]),
      findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(installRow),
      create: vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(uniqueViolation()),
      updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
    }
    const repo = new MysqlMarketRepository(fakePrisma({ marketInstall: marketInstallApi }))

    const items = await repo.listInstalls('default')
    expect(marketInstallApi.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'default' },
      orderBy: [{ installedAt: 'asc' }, { materialId: 'asc' }],
    })
    expect(items[0]).toEqual(marketInstall())

    expect(await repo.findInstall('default', 'missing')).toBeNull()
    expect((await repo.findInstall('default', 'brand-button'))?.revision).toBe(1)

    expect(await repo.createInstall(marketInstall() as never)).toBe(true)
    expect(await repo.createInstall(marketInstall() as never)).toBe(false)

    expect(await repo.updateInstall(marketInstall({ revision: 2 }) as never, 9)).toBe(false)
    expect(await repo.updateInstall(marketInstall({ revision: 2 }) as never, 1)).toBe(true)
    expect(marketInstallApi.updateMany).toHaveBeenLastCalledWith({
      where: { tenantId: 'default', materialId: 'brand-button', revision: 1 },
      data: expect.objectContaining({ revision: 2 }),
    })

    expect(await repo.removeInstall('default', 'brand-button', 9)).toBe(false)
    expect(await repo.removeInstall('default', 'brand-button', 1)).toBe(true)
    expect(marketInstallApi.deleteMany).toHaveBeenLastCalledWith({
      where: { tenantId: 'default', materialId: 'brand-button', revision: 1 },
    })
  })
})

describe('MysqlAuditRepository', () => {
  it('写入映射与读回（可选字段缺省）', async () => {
    const auditEvent = {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'a1',
          at: NOW,
          type: 'login_failed',
          username: 'alice',
          ip: '127.0.0.1',
          method: 'POST',
          path: '/api/v1/auth/login',
          status: 401,
          code: 'INVALID_CREDENTIALS',
          userAgent: 'vitest',
        },
        {
          id: 'a2',
          at: NOW,
          type: 'forbidden',
          username: null,
          ip: '10.0.0.1',
          method: 'GET',
          path: '/api/v1/audit/events',
          status: 403,
          code: null,
          userAgent: null,
        },
      ]),
    }
    const repo = new MysqlAuditRepository(fakePrisma({ auditEvent }))

    await repo.append({
      id: 'a1',
      at: NOW.toISOString(),
      type: 'login_failed',
      username: 'alice',
      ip: '127.0.0.1',
      method: 'post',
      path: '/api/v1/auth/login',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      userAgent: 'vitest',
    })
    expect(auditEvent.create).toHaveBeenCalledTimes(1)

    const events = await repo.list()
    expect(events[0]).toMatchObject({ id: 'a1', username: 'alice', at: NOW.toISOString() })
    expect(events[1]).toEqual({
      id: 'a2',
      at: NOW.toISOString(),
      type: 'forbidden',
      ip: '10.0.0.1',
      method: 'GET',
      path: '/api/v1/audit/events',
      status: 403,
    })
  })
})
