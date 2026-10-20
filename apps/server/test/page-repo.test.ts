/**
 * FilePageRepository 单元测试：重点覆盖 `list()`（应用菜单数据源）——
 * 空目录、正常读取、非页面文件（.tmp 残留 / 非法 id）跳过。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FilePageRepository } from '../src/page/file-page.repository.js'
import type { PageRecord } from '../src/page/page.types.js'

let dir: string

function record(id: string, updatedAt = '2026-10-12T00:00:00.000Z'): PageRecord {
  return {
    id,
    appId: 'app_default',
    name: `页面 ${id}`,
    type: 'form',
    status: 'draft',
    currentVersion: 0,
    draft: null,
    versions: [],
    createdAt: updatedAt,
    updatedAt,
  }
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'lc-repo-test-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('FilePageRepository.list', () => {
  it('目录不存在（尚未保存过页面）返回 [] 而非抛错', async () => {
    const repo = new FilePageRepository(path.join(dir, 'not-created'))
    await expect(repo.list()).resolves.toEqual([])
  })

  it('save 后 list 返回全部记录', async () => {
    const repo = new FilePageRepository(dir)
    await repo.save(record('page_a'))
    await repo.save(record('page_b'))

    const list = await repo.list()
    expect(list.map((r) => r.id)).toEqual(['page_a', 'page_b']) // 按文件名稳定排序
    expect(list[0]).toMatchObject({ name: '页面 page_a', appId: 'app_default' })
  })

  it('跳过 .tmp 残留与不符合 id 白名单的文件', async () => {
    const repo = new FilePageRepository(dir)
    await repo.save(record('page_ok'))
    // 模拟原子写中断残留与非法名文件（JSON 坏内容也不应被读到）
    await writeFile(path.join(dir, 'page_ok.json.123.tmp'), '{broken', 'utf8')
    await writeFile(path.join(dir, '-bad.json'), 'not json', 'utf8')
    await writeFile(path.join(dir, 'README.txt'), 'hi', 'utf8')

    const list = await repo.list()
    expect(list.map((r) => r.id)).toEqual(['page_ok'])
  })
})

describe('FilePageRepository.remove（2026-10-20 补）', () => {
  it('删除已存在页面返回 true，且 list 随即不再包含它', async () => {
    const repo = new FilePageRepository(dir)
    await repo.save(record('page_keep'))
    await repo.save(record('page_drop'))

    await expect(repo.remove('page_drop')).resolves.toBe(true)
    await expect(repo.find('page_drop')).resolves.toBeNull()
    expect((await repo.list()).map((r) => r.id)).toEqual(['page_keep'])
  })

  it('删除不存在的页面返回 false（不抛错）', async () => {
    const repo = new FilePageRepository(dir)
    await expect(repo.remove('page_missing')).resolves.toBe(false)
  })

  it('目录不存在时删除返回 false（不抛错）', async () => {
    const repo = new FilePageRepository(path.join(dir, 'not-created'))
    await expect(repo.remove('page_x')).resolves.toBe(false)
  })

  it('非法 id 直接返回 false，不触达文件系统（防路径穿越）', async () => {
    const repo = new FilePageRepository(dir)
    await expect(repo.remove('../etc/passwd')).resolves.toBe(false)
  })
})
