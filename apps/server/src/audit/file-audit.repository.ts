/**
 * 安全审计 JSON 文件仓储。
 *
 * - 落盘位置：`<DATA_DIR>/audit/events.json`，整表一个文件 `{ version: 1, events: [...] }`；
 * - 写入「临时文件 + rename」原子替换（与 FileOpsRepository 同款）；
 * - 单进程写队列串行化，避免并发追加互相覆盖；
 * - 环形上限 2000 条，超出丢最旧（审计是排查现场，不是数仓）；
 * - 读取容错：文件不存在 → 空表；内容损坏 → 备份改名后按空表继续（审计失败不影响业务）。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import {
  AUDIT_EVENT_LIMIT,
  type AuditEvent,
  type AuditRepository,
} from './audit.types.js'

const FILE_VERSION = 1

interface AuditFile {
  version: number
  events: AuditEvent[]
}

@Injectable()
export class FileAuditRepository implements AuditRepository, OnModuleDestroy {
  private readonly dir: string
  private readonly file: string
  private readonly logger = new Logger(FileAuditRepository.name)
  private writeChain: Promise<void> = Promise.resolve()

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.dir = path.join(dataDir, 'audit')
    this.file = path.join(this.dir, 'events.json')
  }

  /**
   * 关停前等待队列落盘。
   *
   * 中间件是旁路写入（`void`），进程/测试关闭时可能还有未完成的 append；
   * 不等待会在清理数据目录时看到 `ENOTEMPTY`（Windows）或丢最后一条事件。
   */
  async onModuleDestroy(): Promise<void> {
    await this.writeChain
  }

  async list(): Promise<AuditEvent[]> {
    return this.read()
  }

  append(event: AuditEvent): Promise<void> {
    const job = this.writeChain.then(() => this.appendInner(event))
    // 队列本身吞掉失败，避免一次写入失败后后续 append 永久 rejected。
    this.writeChain = job.then(
      () => undefined,
      () => undefined,
    )
    return job
  }

  private async appendInner(event: AuditEvent): Promise<void> {
    const existing = await this.read()
    const merged = [...existing, event]
    const dropped = Math.max(0, merged.length - AUDIT_EVENT_LIMIT)
    await this.write(dropped > 0 ? merged.slice(dropped) : merged)
  }

  private async read(): Promise<AuditEvent[]> {
    let raw: string
    try {
      raw = await readFile(this.file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    try {
      const parsed = JSON.parse(raw) as Partial<AuditFile>
      if (!parsed || !Array.isArray(parsed.events)) throw new Error('events 不是数组')
      return parsed.events.filter(
        (e): e is AuditEvent => !!e && typeof e === 'object' && typeof (e as AuditEvent).id === 'string',
      )
    } catch (error) {
      const backup = `${this.file}.corrupt.${Date.now()}`
      await rename(this.file, backup).catch(() => {})
      this.logger.warn(
        `audit/events.json 解析失败，已备份为 ${path.basename(backup)}：${(error as Error).message}`,
      )
      return []
    }
  }

  private async write(events: AuditEvent[]): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const payload: AuditFile = { version: FILE_VERSION, events }
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')
    try {
      await renameWithRetry(tmp, this.file)
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {})
      throw error
    }
  }
}

/**
 * 原子替换，容忍 Windows 上的瞬时占用。
 *
 * Windows 下 `rename` 要求目标文件可被删除；若此时另一个请求正在 `readFile`
 * （审计查询与写入并发是很常见的），会抛 `EPERM`/`EACCES`/`EBUSY`。
 * 读取窗口只有毫秒级，短暂退避后重试即可，不需要引入锁。
 */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let i = 0; ; i += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const retryable = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (!retryable || i >= attempts - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 10 * (i + 1)))
    }
  }
}
