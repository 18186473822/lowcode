/**
 * 应用配置 MySQL 仓储（Phase 4 数据库第二批）。
 *
 * 单行 `app_config(id='default')`，theme 存 JSON；`undefined` 落 SQL NULL。
 */
import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { AppTheme } from '@lc/schema'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type { AppConfig, AppConfigRepository } from '../../page/app-config.types.js'

const CONFIG_ID = 'default'

@Injectable()
export class MysqlAppConfigRepository implements AppConfigRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async read(): Promise<AppConfig> {
    const row = await this.prisma.appConfig.findUnique({ where: { id: CONFIG_ID } })
    const theme = row?.theme
    if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return {}
    return { theme: theme as AppTheme }
  }

  async write(config: AppConfig): Promise<void> {
    const theme = config.theme
      ? (config.theme as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull
    const now = new Date()
    await this.prisma.appConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, theme, updatedAt: now },
      update: { theme, updatedAt: now },
    })
  }
}
