/**
 * 应用配置 JSON 文件仓储（原 `AppConfigService` 内的 fs 逻辑抽出）。
 *
 * 文件仍为 `<DATA_DIR>/apps.json`；写入 tmp + rename 原子替换，读取损坏回空对象。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import type { AppConfig, AppConfigRepository } from './app-config.types.js'

@Injectable()
export class FileAppConfigRepository implements AppConfigRepository {
  constructor(@Inject(DATA_DIR) private readonly dataDir: string) {}

  private get file(): string {
    return path.join(this.dataDir, 'apps.json')
  }

  async read(): Promise<AppConfig> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as AppConfig
      return typeof raw === 'object' && raw !== null ? raw : {}
    } catch {
      return {}
    }
  }

  async write(config: AppConfig): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
    await rename(tmp, this.file)
  }
}
