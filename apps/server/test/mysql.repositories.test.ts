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
