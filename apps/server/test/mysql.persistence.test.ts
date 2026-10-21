/**
 * MySQL 仓储集成测试（可选执行）。
 *
 * 默认 CI / 本地无 MySQL 时整组 skip；本机验证：
 *   $env:LC_TEST_DATABASE_URL='mysql://lc_app:...@127.0.0.1:3306/lowcode_test'
 *   pnpm -F @lc/server test
 *
 * 测试直接实例化 PrismaClient / MySQL 仓储，不经过 Nest，避免污染默认 JSON 路径；
 * 只清理 lowcode_test 的业务表，不触碰开发库 lowcode。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { PageSchema } from '@lc/schema'
import { hashPassword } from '../src/common/password.js'
import { MysqlUserRepository } from '../src/persistence/mysql/user.repository.js'
import { MysqlPageRepository } from '../src/persistence/mysql/page.repository.js'
import { MysqlModelRepository } from '../src/persistence/mysql/model.repository.js'
import { MysqlRecordRepository } from '../src/persistence/mysql/record.repository.js'
import { MysqlRbacRepository } from '../src/persistence/mysql/rbac.repository.js'
import { MysqlFlowRepository } from '../src/persistence/mysql/flow.repository.js'
import { MysqlOpsRepository } from '../src/persistence/mysql/ops.repository.js'
import { MysqlAppConfigRepository } from '../src/persistence/mysql/app-config.repository.js'
import type { FlowSchema } from '@lc/schema'
import type { FlowInstance } from '../src/flow/flow.types.js'
import type { OpsEvent } from '../src/ops/ops.types.js'

const url = process.env.LC_TEST_DATABASE_URL
const describeMysql = url ? describe : describe.skip

function schema(): PageSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'p_mysql_test',
    name: 'MySQL 测试页',
    type: 'form',
    root: {
      id: 'root',
      componentName: 'Page',
      children: [{ id: 'n1', componentName: 'Input', props: { name: 'title', label: '标题' } }],
    },
  } as PageSchema
}

function now(): string {
  return new Date().toISOString()
}

describeMysql('MySQL 仓储', () => {
  // 只在有 LC_TEST_DATABASE_URL 时创建连接；否则 describe.skip 仍可能执行收集阶段，
  // 不能在这里用 undefined url 构造 PrismaClient（会让默认 JSON 门禁整文件失败）。
  let prisma: PrismaClient
  let users: MysqlUserRepository
  let pages: MysqlPageRepository
  let models: MysqlModelRepository
  let records: MysqlRecordRepository
  let rbac: MysqlRbacRepository
  let flows: MysqlFlowRepository
  let ops: MysqlOpsRepository
  let appConfig: MysqlAppConfigRepository

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } })
    users = new MysqlUserRepository(prisma)
    pages = new MysqlPageRepository(prisma)
    models = new MysqlModelRepository(prisma)
    records = new MysqlRecordRepository(prisma)
    rbac = new MysqlRbacRepository(prisma)
    flows = new MysqlFlowRepository(prisma)
    ops = new MysqlOpsRepository(prisma)
    appConfig = new MysqlAppConfigRepository(prisma)

    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0')
    for (const table of [
      'data_records',
      'page_versions',
      'pages',
      'models',
      'user_roles',
      'roles',
      'users',
      'rbac_page_grants',
      'flow_instances',
      'flow_definitions',
      'ops_events',
      'app_config',
    ]) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``)
    }
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1')

    await prisma.role.createMany({
      data: [
        { key: 'admin', name: '平台管理员', perms: ['*'] },
        { key: 'designer', name: '设计器用户', perms: [] },
      ],
    })
    await prisma.user.create({
      data: {
        id: 'u_test',
        username: 'tester',
        displayName: '测试用户',
        passwordHash: hashPassword('tester123'),
        status: 'active',
        roles: { create: [{ roleKey: 'admin' }] },
      },
    })
    await prisma.rbacPageGrant.create({
      data: { pageId: 'p_hidden', roles: ['admin'] },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('用户仓储读取角色并拒绝未知用户', async () => {
    const user = await users.findByUsername('tester')
    expect(user).toMatchObject({
      id: 'u_test',
      username: 'tester',
      roles: ['admin'],
      status: 'active',
    })
    expect(user?.passwordHash.startsWith('scrypt:')).toBe(true)
    expect(await users.findByUsername('ghost')).toBeNull()
  })

  it('页面仓储保存草稿/版本，列表与级联删除', async () => {
    const t = now()
    await pages.save({
      id: 'p_mysql_test',
      appId: 'app_test',
      name: 'MySQL 测试页',
      type: 'form',
      status: 'published',
      currentVersion: 2,
      draft: schema(),
      draftUpdatedAt: t,
      draftUpdatedBy: 'tester',
      versions: [
        { version: 1, schema: schema(), createdBy: 'tester', createdAt: t, note: 'v1' },
        { version: 2, schema: schema(), createdBy: 'tester', createdAt: t },
      ],
      createdAt: t,
      updatedAt: t,
    })

    const found = await pages.find('p_mysql_test')
    expect(found).toMatchObject({
      id: 'p_mysql_test',
      appId: 'app_test',
      status: 'published',
      currentVersion: 2,
      draftUpdatedBy: 'tester',
    })
    expect(found?.versions.map((version) => version.version)).toEqual([1, 2])
    expect(found?.versions[0]?.note).toBe('v1')
    expect((await pages.list()).map((page) => page.id)).toContain('p_mysql_test')

    expect(await pages.remove('p_mysql_test')).toBe(true)
    expect(await pages.remove('p_mysql_test')).toBe(false)
    expect(await pages.find('p_mysql_test')).toBeNull()
  })

  it('模型/记录仓储支持同 id 跨模型隔离与软删', async () => {
    const t = now()
    const modelSchema = (id: string) =>
      ({
        schemaVersion: '1.0.0',
        id,
        name: id,
        code: id,
        fields: [{ key: 'name', name: '名称', type: 'string', required: true }],
      }) as const

    await models.save('md_a', {
      schema: modelSchema('md_a') as never,
      createdAt: t,
      updatedAt: t,
      createdBy: 'tester',
      updatedBy: 'tester',
    })
    await models.save('md_b', {
      schema: modelSchema('md_b') as never,
      createdAt: t,
      updatedAt: t,
      createdBy: 'tester',
      updatedBy: 'tester',
    })

    const base = {
      id: 'same_id',
      payload: { name: '记录' },
      createdBy: 'tester',
      createdAt: t,
      updatedAt: t,
    }
    await records.save('md_a', base)
    await records.save('md_b', base)

    expect((await models.list()).map((model) => model.schema.id).sort()).toEqual(['md_a', 'md_b'])
    expect((await records.find('md_a', 'same_id'))?.payload).toEqual({ name: '记录' })
    expect((await records.find('md_b', 'same_id'))?.payload).toEqual({ name: '记录' })
    expect(await records.list('md_a')).toHaveLength(1)

    await records.save('md_a', { ...base, deletedAt: t })
    expect((await records.find('md_a', 'same_id'))?.deletedAt).toBe(t)
    expect((await records.find('md_b', 'same_id'))?.deletedAt).toBeUndefined()
  })

  it('RBAC 仓储读写角色与页面白名单', async () => {
    const loaded = await rbac.load()
    expect(loaded.roles.map((role) => role.key)).toEqual(['admin', 'designer'])
    expect(loaded.pages).toEqual({ p_hidden: ['admin'] })

    await rbac.save({
      roles: [
        { key: 'admin', name: '平台管理员', perms: ['*'] },
        { key: 'designer', name: '设计器用户', perms: [] },
        { key: 'auditor', name: '审计员', perms: ['ops:read'] },
      ],
      pages: { p_hidden: ['admin', 'auditor'] },
    })

    const next = await rbac.load()
    expect(next.roles.find((role) => role.key === 'auditor')?.perms).toEqual(['ops:read'])
    expect(next.pages).toEqual({ p_hidden: ['admin', 'auditor'] })

    await rbac.save({ roles: next.roles.filter((role) => role.key !== 'auditor'), pages: {} })
    const cleaned = await rbac.load()
    expect(cleaned.roles.map((role) => role.key)).not.toContain('auditor')
    expect(cleaned.pages).toEqual({})
  })

  it('流程仓储保存定义/实例，删除定义不删实例', async () => {
    const flow = {
      flowId: 'fl_mysql_test',
      name: 'MySQL 测试流程',
      modelId: 'md_mysql_test',
      mode: 'linear',
      nodes: [
        { id: 'n1', type: 'start', name: '开始' },
        { id: 'n2', type: 'approve', name: '审批', assignee: { type: 'role', value: 'admin' } },
        { id: 'n3', type: 'end', name: '结束' },
      ],
    } as FlowSchema
    await flows.saveFlow(flow)
    expect(await flows.findFlow('fl_mysql_test')).toMatchObject({
      flowId: 'fl_mysql_test',
      modelId: 'md_mysql_test',
    })
    expect((await flows.listFlows()).map((item) => item.flowId)).toContain('fl_mysql_test')

    const t = now()
    const instance: FlowInstance = {
      id: 'fi_mysql_test',
      flowId: 'fl_mysql_test',
      modelId: 'md_mysql_test',
      recordId: 'rec_mysql_test',
      status: 'running',
      currentNodeId: 'n2',
      createdBy: 'tester',
      createdAt: t,
      updatedAt: t,
      tasks: [
        {
          id: 'task_mysql_test',
          nodeId: 'n2',
          nodeName: '审批',
          assignee: { type: 'role', value: 'admin' },
          status: 'pending',
          createdAt: t,
        },
      ],
      history: [{ nodeId: 'n1', nodeName: '开始', action: 'start', actor: 'tester', at: t }],
    }
    await flows.saveInstance(instance)
    const loaded = (await flows.listInstances()).find((item) => item.id === 'fi_mysql_test')
    expect(loaded).toMatchObject({ status: 'running', currentNodeId: 'n2' })
    expect(loaded?.tasks[0]?.id).toBe('task_mysql_test')
    expect(loaded?.history[0]?.action).toBe('start')

    expect(await flows.deleteFlow('fl_mysql_test')).toBe(true)
    expect(await flows.findFlow('fl_mysql_test')).toBeNull()
    expect((await flows.listInstances()).some((item) => item.id === 'fi_mysql_test')).toBe(true)
  })

  it('运维事件仓储保留 pageVersion/detail/duration 与写入顺序', async () => {
    const t = now()
    const events: OpsEvent[] = [
      {
        id: 'evt_mysql_a',
        type: 'perf',
        name: 'schema-load',
        pageId: 'pg_mysql',
        pageVersion: 'draft',
        source: 'runtime',
        userId: 'u_test',
        durationMs: 12.5,
        detail: { step: 'load' },
        at: t,
      },
      {
        id: 'evt_mysql_b',
        type: 'error',
        name: 'render',
        pageVersion: 3,
        source: 'designer',
        message: 'boom',
        at: t,
      },
    ]
    await ops.save(events)
    const loaded = await ops.list()
    expect(loaded.map((event) => event.id)).toEqual(['evt_mysql_a', 'evt_mysql_b'])
    expect(loaded[0]).toMatchObject({ pageVersion: 'draft', durationMs: 12.5, detail: { step: 'load' } })
    expect(loaded[1]).toMatchObject({ pageVersion: 3, message: 'boom' })
    expect(loaded[1]?.pageId).toBeUndefined()

    await ops.save([])
    expect(await ops.list()).toEqual([])
  })

  it('应用配置仓储读写 theme，清除后回空对象', async () => {
    expect(await appConfig.read()).toEqual({})
    await appConfig.write({ theme: { primary: '#2255AA', radius: '10px', dark: true } })
    expect(await appConfig.read()).toEqual({
      theme: { primary: '#2255AA', radius: '10px', dark: true },
    })
    await appConfig.write({})
    expect(await appConfig.read()).toEqual({})
  })
})
