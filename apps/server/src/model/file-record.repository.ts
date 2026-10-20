/**
 * 业务记录的 JSON 文件仓储（方案 8.5-B「通用表」）。
 *
 * - 落盘位置：`<DATA_DIR>/data/<modelId>/<recordId>.json`，一文件 = 一行记录；
 * - 原子写与双重 ID 防线同 FilePageRepository / FileModelRepository；
 * - 软删不删文件：`deletedAt` 置位即可（记录保留，可审计 / 可恢复）。
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import type { DataRecordEntity, RecordRepository } from './model.types.js'

/** 模型 id 白名单：字母/下划线开头（用作子目录名，防路径穿越） */
const SAFE_MODEL_RE = /^[A-Za-z_][\w-]{0,63}$/
/** 记录 id 白名单：字母/数字开头（自增 uuid 形如 `9f3a…` 允许数字开头） */
const SAFE_RECORD_RE = /^[A-Za-z0-9][\w-]{0,63}$/

@Injectable()
export class FileRecordRepository implements RecordRepository {
  private readonly root: string

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.root = path.join(dataDir, 'data')
  }

  async find(modelId: string, recordId: string): Promise<DataRecordEntity | null> {
    if (!SAFE_MODEL_RE.test(modelId) || !SAFE_RECORD_RE.test(recordId)) return null

    try {
      const raw = await readFile(path.join(this.root, modelId, `${recordId}.json`), 'utf8')
      return JSON.parse(raw) as DataRecordEntity
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async save(modelId: string, record: DataRecordEntity): Promise<void> {
    if (!SAFE_MODEL_RE.test(modelId)) {
      throw new Error(`非法模型 id：${modelId}`)
    }
    if (!SAFE_RECORD_RE.test(record.id)) {
      throw new Error(`非法记录 id：${record.id}`)
    }

    const dir = path.join(this.root, modelId)
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `${record.id}.json`)
    const tmp = `${file}.${process.pid}.tmp`

    await writeFile(tmp, JSON.stringify(record, null, 2), 'utf8')
    await rename(tmp, file)
  }

  async list(modelId: string): Promise<DataRecordEntity[]> {
    if (!SAFE_MODEL_RE.test(modelId)) return []

    const dir = path.join(this.root, modelId)
    let names: string[]
    try {
      names = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [] // 模型尚无记录
      throw error
    }

    const out: DataRecordEntity[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const raw = await readFile(path.join(dir, name), 'utf8')
      out.push(JSON.parse(raw) as DataRecordEntity)
    }
    return out
  }
}
