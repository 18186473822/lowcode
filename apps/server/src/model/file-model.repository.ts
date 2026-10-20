/**
 * 模型定义的 JSON 文件仓储（方案 8.5-B 起步实现）。
 *
 * - 落盘位置：`<DATA_DIR>/models/<id>.json`，一文件 = 一条模型定义；
 * - 写入采用「临时文件 + rename」原子替换（与 FilePageRepository 同款，防半截文件）；
 * - `find` 对非法 id 直接返回 null（与 service 层 ID 白名单双重防线，防路径穿越）。
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import type { ModelEntity, ModelRepository } from './model.types.js'

/** 模型 id 白名单（与 service 层一致）：字母/下划线开头，可含数字、下划线、连字符 */
const SAFE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

@Injectable()
export class FileModelRepository implements ModelRepository {
  private readonly dir: string

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.dir = path.join(dataDir, 'models')
  }

  async find(id: string): Promise<ModelEntity | null> {
    if (!SAFE_ID_RE.test(id)) return null

    try {
      const raw = await readFile(path.join(this.dir, `${id}.json`), 'utf8')
      return JSON.parse(raw) as ModelEntity
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error // 文件损坏等异常原样上抛 → 500，不静默吞掉
    }
  }

  async save(id: string, entity: ModelEntity): Promise<void> {
    if (!SAFE_ID_RE.test(id)) {
      throw new Error(`非法模型 id：${id}`)
    }

    await mkdir(this.dir, { recursive: true })
    const file = path.join(this.dir, `${id}.json`)
    const tmp = `${file}.${process.pid}.tmp`

    await writeFile(tmp, JSON.stringify(entity, null, 2), 'utf8')
    await rename(tmp, file)
  }

  async list(): Promise<ModelEntity[]> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [] // 尚无任何模型
      throw error
    }

    const out: ModelEntity[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const raw = await readFile(path.join(this.dir, name), 'utf8')
      out.push(JSON.parse(raw) as ModelEntity)
    }
    return out
  }
}
