/**
 * 健康检查（部署探针，不需要登录）：
 *
 * - `GET /api/v1/health`：进程存活 + 版本 + uptime + 存储模式；
 * - `GET /api/v1/ready`：JSON 模式检查数据目录；MySQL 模式同时检查数据目录与 `SELECT 1`。
 *
 * 探针不依赖业务服务，避免数据库/文件异常时连 readiness 都无法返回。
 */
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import {
  checkDataDirWritable,
  STORAGE_HEALTH,
  type StorageHealth,
} from '../persistence/storage-health.js'
import { resolveStorageMode } from '../persistence/storage.config.js'

/** 兼容旧测试/调用方的导出；实现已移到 persistence/storage-health.ts。 */
export { checkDataDirWritable }

@Controller()
export class HealthController {
  constructor(@Inject(STORAGE_HEALTH) private readonly storage: StorageHealth) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      storage: resolveStorageMode(),
      version: process.env.LC_APP_VERSION?.trim() || '0.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    }
  }

  @Get('ready')
  async ready() {
    const result = await this.storage.check()
    if (!result.ok) {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: '存储未就绪',
        storage: resolveStorageMode(),
        checks: result.checks,
        timestamp: new Date().toISOString(),
      })
    }

    return {
      status: 'ok',
      storage: resolveStorageMode(),
      checks: result.checks,
      timestamp: new Date().toISOString(),
    }
  }
}
