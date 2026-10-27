/**
 * 安全审计单测：JSON 仓储 + 服务归一化/查询校验。
 *
 * 端到端链路（登录失败 / 403 / 429 真正落库）在 api.test.ts 覆盖；
 * 这里锁定存储容错与参数解析边界，避免审计把业务请求带崩。
 */
import 'reflect-metadata'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FileAuditRepository } from '../src/audit/file-audit.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import type { AuditEvent, AuditEventInput, AuditRepository } from '../src/audit/audit.types.js'

const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lc-audit-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'a1',
    at: '2026-10-27T00:00:00.000Z',
    type: 'login_failed',
    username: 'alice',
    ip: '127.0.0.1',
    method: 'POST',
    path: '/api/v1/auth/login',
    status: 401,
    code: 'INVALID_CREDENTIALS',
    ...overrides,
  }
}

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEvent[] = []
  failAppend = false

  async append(e: AuditEvent): Promise<void> {
    if (this.failAppend) throw new Error('disk full')
    this.events.push(e)
  }

  async list(): Promise<AuditEvent[]> {
    return this.events
  }
}

describe('FileAuditRepository', () => {
  it('追加后按写入顺序读回', async () => {
    const repo = new FileAuditRepository(await tempDir())
    await repo.append(event())
    await repo.append(event({ id: 'a2', type: 'forbidden', status: 403 }))

    const all = await repo.list()
    expect(all.map((e) => e.id)).toEqual(['a1', 'a2'])
    expect(all[1]).toMatchObject({ type: 'forbidden', status: 403 })
  })

  it('文件损坏时备份并按空表继续，后续追加仍可用', async () => {
    const dir = await tempDir()
    const auditDir = path.join(dir, 'audit')
    await mkdir(auditDir, { recursive: true })
    await writeFile(path.join(auditDir, 'events.json'), '{not json', 'utf8')

    const repo = new FileAuditRepository(dir)
    expect(await repo.list()).toEqual([])
    await repo.append(event())
    expect((await repo.list()).map((e) => e.id)).toEqual(['a1'])
  })
})

describe('AuditService', () => {
  it('record 归一化：剥离查询串、方法大写、缺省 IP、截断 UA', async () => {
    const repo = new MemoryAuditRepository()
    const svc = new AuditService(repo)

    await svc.record({
      type: 'forbidden',
      username: 'alice',
      ip: '',
      method: 'get',
      path: '/api/v1/audit/events?type=forbidden',
      status: 403,
      code: 'PERMISSION_DENIED',
      userAgent: 'x'.repeat(400),
    })

    const saved = repo.events[0]!
    expect(saved.path).toBe('/api/v1/audit/events')
    expect(saved.method).toBe('GET')
    expect(saved.ip).toBe('unknown')
    expect(saved.userAgent!.length).toBeLessThanOrEqual(256)
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('record 的存储失败被吞掉，不影响调用方', async () => {
    const repo = new MemoryAuditRepository()
    repo.failAppend = true
    const svc = new AuditService(repo)
    await expect(
      svc.record({
        type: 'rate_limited',
        ip: '127.0.0.1',
        method: 'POST',
        path: '/api/v1/auth/login',
        status: 429,
      }),
    ).resolves.toBeUndefined()
  })

  it('list 支持 type/username/since 过滤，并倒序返回', async () => {
    const repo = new MemoryAuditRepository()
    repo.events.push(
      event({ id: 'a1', at: '2026-10-26T00:00:00.000Z' }),
      event({ id: 'a2', type: 'forbidden', username: 'bob', at: '2026-10-27T00:00:00.000Z' }),
      event({ id: 'a3', type: 'forbidden', username: 'alice', at: '2026-10-27T01:00:00.000Z' }),
    )
    const svc = new AuditService(repo)

    expect((await svc.list({ type: 'forbidden' })).items.map((e) => e.id)).toEqual(['a3', 'a2'])
    expect((await svc.list({ username: 'alice' })).items.map((e) => e.id)).toEqual(['a3', 'a1'])
    expect(
      (await svc.list({ since: '2026-10-27T00:00:00.000Z' })).items.map((e) => e.id),
    ).toEqual(['a3', 'a2'])
    expect((await svc.list({ limit: 1 })).items.map((e) => e.id)).toEqual(['a3'])
  })

  it('非法查询参数返回 400 AUDIT_INVALID', async () => {
    const svc = new AuditService(new MemoryAuditRepository())
    const bad = [
      { type: 'nope' },
      { username: 'x'.repeat(65) },
      { since: 'not-a-date' },
      { limit: 'abc' },
    ]
    for (const query of bad) {
      await expect(svc.list(query)).rejects.toMatchObject({
        response: { code: 'AUDIT_INVALID' },
      })
    }
  })
})
