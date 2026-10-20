/**
 * JSON 文件仓储（Phase 0）。
 *
 * - 落盘位置：`<DATA_DIR>/pages/<id>.json`，一个文件 = 一条 pages 行 + 全部 page_versions；
 * - 写入采用「临时文件 + rename」原子替换，进程中断不会留下半截文件；
 * - `find` 对非法 id 直接返回 null（与 service 层的 ID 白名单构成双重防线，防路径穿越）。
 */
import { mkdir, readFile, rename, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import type { PageRecord, PageRepository } from './page.types.js'

/** 页面 id 白名单（与 service 层一致）：字母/下划线开头，可含数字、下划线、连字符 */
const SAFE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

@Injectable()
export class FilePageRepository implements PageRepository {
  private readonly dir: string

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.dir = path.join(dataDir, 'pages')
  }

  async find(id: string): Promise<PageRecord | null> {
    if (!SAFE_ID_RE.test(id)) return null

    try {
      const raw = await readFile(path.join(this.dir, `${id}.json`), 'utf8')
      return JSON.parse(raw) as PageRecord
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error // 文件损坏等异常原样上抛 → 500，不静默吞掉
    }
  }

  /** 全量记录：按文件名稳定排序；目录不存在（尚未保存过任何页面）返回 [] */
  async list(): Promise<PageRecord[]> {
    let files: string[]
    try {
      files = await readdir(this.dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    const records: PageRecord[] = []
    for (const file of files.sort()) {
      if (!file.endsWith('.json')) continue // 跳过原子写的 .tmp 残留等非页面文件
      const id = file.slice(0, -5)
      if (!SAFE_ID_RE.test(id)) continue
      const record = await this.find(id)
      if (record) records.push(record)
    }
    return records
  }

  async save(record: PageRecord): Promise<void> {
    if (!SAFE_ID_RE.test(record.id)) {
      throw new Error(`非法页面 id：${record.id}`)
    }

    await mkdir(this.dir, { recursive: true })
    const file = path.join(this.dir, `${record.id}.json`)
    const tmp = `${file}.${process.pid}.tmp`

    await writeFile(tmp, JSON.stringify(record, null, 2), 'utf8')
    await rename(tmp, file)
  }

  /** 删除页面文件（草稿 + 全部版本同文件，故无孤儿版本）；不存在返回 false */
  async remove(id: string): Promise<boolean> {
    if (!SAFE_ID_RE.test(id)) return false
    try {
      await unlink(path.join(this.dir, `${id}.json`))
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }
}
