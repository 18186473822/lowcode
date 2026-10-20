/**
 * 运维事件 JSON 文件仓储（Phase 3 批 5，D-P3-12）。
 *
 * - 落盘位置：`<DATA_DIR>/ops/events.json`，整表一个文件 `{ version: 1, events: [...] }`；
 * - 写入「临时文件 + rename」原子替换（同 FilePageRepository），断电不留半截文件；
 * - 读取容错：文件不存在 → 空表；**内容损坏 → 空表 + 备份改名**（埋点数据不值得让服务起不来）；
 * - 环形上限由 service 控制（本层只负责读写，不裁剪），保持存储层可替换。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import type { OpsEvent, OpsRepository } from './ops.types.js'

/** 文件内容版本（后续换存储/加字段时用于迁移判定） */
const FILE_VERSION = 1

interface OpsFile {
  version: number
  events: OpsEvent[]
}

@Injectable()
export class FileOpsRepository implements OpsRepository {
  private readonly dir: string
  private readonly file: string
  private readonly logger = new Logger(FileOpsRepository.name)

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.dir = path.join(dataDir, 'ops')
    this.file = path.join(this.dir, 'events.json')
  }

  async list(): Promise<OpsEvent[]> {
    let raw: string
    try {
      raw = await readFile(this.file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    try {
      const parsed = JSON.parse(raw) as Partial<OpsFile>
      if (!parsed || !Array.isArray(parsed.events)) throw new Error('events 不是数组')
      return parsed.events.filter((e): e is OpsEvent => !!e && typeof e === 'object' && typeof (e as OpsEvent).id === 'string')
    } catch (error) {
      // 损坏文件改名留档（便于人工排查），随后以空表继续 —— 埋点不能阻塞业务
      const backup = `${this.file}.corrupt.${Date.now()}`
      await rename(this.file, backup).catch(() => {})
      this.logger.warn(`ops/events.json 解析失败，已备份为 ${path.basename(backup)}：${(error as Error).message}`)
      return []
    }
  }

  async save(events: OpsEvent[]): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const payload: OpsFile = { version: FILE_VERSION, events }
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')
    await rename(tmp, this.file)
  }
}
