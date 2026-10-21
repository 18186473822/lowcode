/**
 * 运维事件文件仓储：追加 + 环形裁剪 + 单进程写队列。
 *
 * 并发 append 是实际风险点：旧实现「读整表 → 合并 → 写回」在两次上报
 * 交错时会丢事件。这里用真实临时目录验证队列串行化后的结果。
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileOpsRepository } from '../src/ops/file-ops.repository.js'
import type { OpsEvent } from '../src/ops/ops.types.js'

const dirs: string[] = []

async function repo(): Promise<{ dir: string; repo: FileOpsRepository }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lc-ops-'))
  dirs.push(dir)
  return { dir, repo: new FileOpsRepository(dir) }
}

function event(id: string): OpsEvent {
  return {
    id,
    type: 'event',
    name: 'fill',
    source: 'runtime',
    at: '2026-10-21T00:00:00.000Z',
  }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('FileOpsRepository', () => {
  it('并发 append 不丢事件（写队列串行化读改写）', async () => {
    const { repo: store } = await repo()
    const batches = Array.from({ length: 10 }, (_, batch) =>
      Array.from({ length: 10 }, (_, i) => event(`e_${batch}_${i}`)),
    )

    const results = await Promise.all(batches.map((batch) => store.append(batch, 500)))
    const list = await store.list()

    expect(list).toHaveLength(100)
    expect(new Set(list.map((e) => e.id)).size).toBe(100)
    expect(results.reduce((sum, r) => sum + r.dropped, 0)).toBe(0)
  })

  it('超出 limit 淘汰最旧并返回 dropped', async () => {
    const { repo: store } = await repo()
    await store.append([event('a'), event('b'), event('c')], 2)

    const list = await store.list()
    expect(list.map((e) => e.id)).toEqual(['b', 'c'])
    expect(await store.append([event('d')], 2)).toEqual({ total: 2, dropped: 1 })
    expect((await store.list()).map((e) => e.id)).toEqual(['c', 'd'])
  })
})
