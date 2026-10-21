/**
 * 应用配置仓储契约（Phase 4 数据库第二批）。
 *
 * `apps.json` 只有顶层 `theme`，但按仓储抽象保留完整对象，后续加应用字段不用改仓储签名。
 */
import type { AppTheme } from '@lc/schema'

export interface AppConfig {
  theme?: AppTheme
}

export interface AppConfigRepository {
  read(): Promise<AppConfig>
  write(config: AppConfig): Promise<void>
}

export const APP_CONFIG_REPOSITORY = 'LC:APP_CONFIG_REPOSITORY'
