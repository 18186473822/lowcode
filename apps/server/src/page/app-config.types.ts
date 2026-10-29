/**
 * 应用配置仓储契约（Phase 4 数据库第二批；P1 扩展应用设置）。
 *
 * 首期只有顶层 `theme`；2026-10-29 起增加门户首页需要的应用设置：
 * `name` / `icon` / `entry`（入口页）/ `menus`（应用菜单）。
 * 结构保持**扁平顶层对象**，后续独立应用实体可整体迁入。
 */
import type { AppMenuItem, AppTheme } from '@lc/schema'

/** 入口页：登录后落地哪一页（没有底部栏时表现为「主页」置顶项） */
export interface AppEntry {
  type: 'portal' | 'page'
  pageId?: string
}

export interface AppConfig {
  theme?: AppTheme
  /** 应用名（门户首页应用条 / 运行时标题） */
  name?: string
  /** 应用图标：单字符或短文本，运行时按文本渲染（不引图标包） */
  icon?: string
  /** 入口页 */
  entry?: AppEntry
  /** 应用菜单：数组顺序即运行时首页顺序 */
  menus?: AppMenuItem[]
}

export interface AppConfigRepository {
  read(): Promise<AppConfig>
  write(config: AppConfig): Promise<void>
}

export const APP_CONFIG_REPOSITORY = 'LC:APP_CONFIG_REPOSITORY'
