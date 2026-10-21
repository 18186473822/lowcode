/**
 * 健康检查（部署探针，不需要登录）：
 *
 * - `GET /api/v1/health`：进程存活 + 版本 + uptime；
 * - `GET /api/v1/ready`：数据目录可创建/可写（JSON 文件存储的就绪判据）。
 *
 * 说明：当前存储是 `LC_DATA_DIR` 下的 JSON 文件，没有数据库连接可探；
 * readiness 只验证「进程能读写自己的数据根目录」，避免探针通过但首次写入才报错。
 */
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { DATA_DIR } from './tokens.js'

/** 可供单测直接复用的目录可写检查。 */
export async function checkDataDirWritable(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true })
    await access(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

@Controller()
export class HealthController {
  constructor(@Inject(DATA_DIR) private readonly dataDir: string) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      version: process.env.LC_APP_VERSION?.trim() || '0.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    }
  }

  @Get('ready')
  async ready() {
    const writable = await checkDataDirWritable(this.dataDir)
    if (!writable) {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: '数据目录不可写',
        checks: { dataDir: 'unavailable' },
        timestamp: new Date().toISOString(),
      })
    }

    return {
      status: 'ok',
      checks: { dataDir: 'ok' },
      timestamp: new Date().toISOString(),
    }
  }
}
