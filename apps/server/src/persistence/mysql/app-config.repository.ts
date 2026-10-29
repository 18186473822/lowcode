/**
 * 应用配置 MySQL 仓储（Phase 4 数据库第二批；2026-10-29 P1 增加 settings 列）。
 *
 * 单行 `app_config(id='default')`：
 * - `theme` 列存 `AppTheme`（逐键合并）；
 * - `settings` 列存其余顶层键（name / icon / entry / menus，整键替换）。
 *
 * 拆两列而不是塞一个 JSON：theme 与 settings 的 patch 语义不同，混在一列会让
 * 「改名字顺手把主题写坏」这类错误难以发现。
 */
import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { AppTheme } from '@lc/schema'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type { AppConfig, AppConfigRepository } from '../../page/app-config.types.js'

const CONFIG_ID = 'default'

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

@Injectable()
export class MysqlAppConfigRepository implements AppConfigRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async read(): Promise<AppConfig> {
    const row = await this.prisma.appConfig.findUnique({ where: { id: CONFIG_ID } })
    const out: AppConfig = {}
    const theme = asObject(row?.theme)
    if (theme) out.theme = theme as AppTheme
    const settings = asObject(row?.settings)
    if (settings) Object.assign(out, settings)
    return out
  }

  async write(config: AppConfig): Promise<void> {
    const { theme, ...rest } = config
    const themeJson = theme ? (theme as unknown as Prisma.InputJsonValue) : Prisma.DbNull
    const settingsJson = Object.keys(rest).length
      ? (rest as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull
    const now = new Date()
    await this.prisma.appConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, theme: themeJson, settings: settingsJson, updatedAt: now },
      update: { theme: themeJson, settings: settingsJson, updatedAt: now },
    })
  }
}
