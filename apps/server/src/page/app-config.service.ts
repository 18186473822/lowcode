/**
 * 应用配置（Phase 3 批 3 / D-P3-8；Phase 4 第二批落库；2026-10-29 P1 扩展应用设置）。
 *
 * 承载两类配置：
 * - `theme`（primary/radius/dark，协议见 `@lc/schema` 的 `AppTheme`）；
 * - 应用设置 `name` / `icon` / `entry` / `menus`（门户首页的应用条与菜单）。
 *
 * - 存储：`LC_STORAGE=json` 走 `<DATA_DIR>/apps.json`，`mysql` 走 `app_config` 表
 *   （`theme` 列 + `settings` 列，见 `MysqlAppConfigRepository`）；
 * - 写入语义：**patch**（缺键保留旧值、显式 null 清除该键）—— 前端只需提交改动项；
 *   `menus` 是**整组替换**（数组无法逐项合并，避免出现「删了一项没生效」的幻觉）；
 * - 读取容错：文件不存在 / JSON 损坏 → `{}`（配置层故障不拖垮 bootstrap）。
 */
import { Inject, Injectable } from '@nestjs/common'
import type { AppMenuItem, AppTheme } from '@lc/schema'
import {
  APP_CONFIG_REPOSITORY,
  type AppConfig,
  type AppEntry,
  type AppConfigRepository,
} from './app-config.types.js'

export type { AppConfig, AppEntry } from './app-config.types.js'

const THEME_KEYS = ['primary', 'radius', 'dark'] as const
const SETTING_KEYS = ['name', 'icon', 'entry', 'menus'] as const
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const PX_RE = /^\d+(?:\.\d+)?px$/
/** 与服务端 `PAGE_ID_RE` 同口径 */
const PAGE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/
const URL_RE = /^https?:\/\/\S+$/i
const NAME_MAX = 32
const ICON_MAX = 16
const MENU_MAX = 20
const MENU_TYPES = ['page', 'portal', 'builtin', 'url'] as const

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 主题 patch 校验：返回 issue 列表（空 = 合法）。
 * `null` 合法（清除该键）；未知键报错（防前端误写垃圾进配置）。
 */
export function validateTheme(theme: unknown): string[] {
  if (typeof theme !== 'object' || theme === null || Array.isArray(theme)) {
    return ['theme 必须是对象']
  }
  const t = theme as Record<string, unknown>
  const issues: string[] = []
  for (const k of Object.keys(t)) {
    if (!(THEME_KEYS as readonly string[]).includes(k)) issues.push(`未知配置项：${k}`)
  }
  const v = t.primary
  if (v !== undefined && v !== null && (typeof v !== 'string' || !HEX_RE.test(v))) {
    issues.push('primary 必须是 #RGB / #RRGGBB 十六进制色值')
  }
  const r = t.radius
  if (r !== undefined && r !== null && (typeof r !== 'string' || !PX_RE.test(r))) {
    issues.push('radius 必须是如 12px 的像素值字符串')
  }
  const d = t.dark
  if (d !== undefined && d !== null && typeof d !== 'boolean') {
    issues.push('dark 必须是布尔值')
  }
  return issues
}

/**
 * 应用设置 patch 校验（只校验**出现**的键，缺键 = 不改）。
 *
 * 与 theme 一样：`null` = 清除该键；未知键不在此函数报错（由 controller 白名单兜）。
 */
export function validateAppSettings(patch: Record<string, unknown>): string[] {
  const issues: string[] = []

  if ('name' in patch) {
    const v = patch.name
    if (v !== null && (typeof v !== 'string' || !v.trim() || v.trim().length > NAME_MAX)) {
      issues.push(`name 必须是 1~${NAME_MAX} 字的字符串（null 清除）`)
    }
  }

  if ('icon' in patch) {
    const v = patch.icon
    if (v !== null && (typeof v !== 'string' || !v.trim() || v.length > ICON_MAX)) {
      issues.push(`icon 必须是 1~${ICON_MAX} 个字符的字符串（null 清除）`)
    }
  }

  if ('entry' in patch) {
    const v = patch.entry
    if (v !== null) {
      if (!isObj(v)) issues.push('entry 必须是对象或 null')
      else {
        if (v.type !== 'portal' && v.type !== 'page') issues.push('entry.type 只能是 portal / page')
        if (
          v.pageId !== undefined &&
          (typeof v.pageId !== 'string' || !PAGE_ID_RE.test(v.pageId))
        ) {
          issues.push('entry.pageId 不合法（字母或下划线开头，最长 64 位）')
        }
      }
    }
  }

  if ('menus' in patch) {
    const v = patch.menus
    if (v !== null) {
      if (!Array.isArray(v)) issues.push('menus 必须是数组或 null')
      else if (v.length > MENU_MAX) issues.push(`menus 最多 ${MENU_MAX} 项`)
      else issues.push(...validateMenus(v))
    }
  }

  return issues
}

function validateMenus(items: unknown[]): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  items.forEach((item, i) => {
    const at = `menus[${i}]`
    if (!isObj(item)) {
      issues.push(`${at} 必须是对象`)
      return
    }
    if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 64) {
      issues.push(`${at}.id 必填且 ≤64 位`)
    } else if (ids.has(item.id)) {
      issues.push(`${at}.id 重复：${item.id}`)
    } else {
      ids.add(item.id)
    }
    if (
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.trim().length > NAME_MAX
    ) {
      issues.push(`${at}.name 必填且 ≤${NAME_MAX} 字`)
    }
    if (item.icon !== undefined && (typeof item.icon !== 'string' || item.icon.length > ICON_MAX)) {
      issues.push(`${at}.icon 最多 ${ICON_MAX} 个字符`)
    }
    if (!(MENU_TYPES as readonly string[]).includes(item.type as string)) {
      issues.push(`${at}.type 只能是 ${MENU_TYPES.join(' / ')}`)
      return
    }
    if (item.type === 'page' || item.type === 'portal') {
      if (typeof item.pageId !== 'string' || !PAGE_ID_RE.test(item.pageId)) {
        issues.push(`${at}.pageId 不合法（type=${String(item.type)} 必填）`)
      }
    }
    if (item.type === 'builtin' && (typeof item.target !== 'string' || !item.target.trim())) {
      issues.push(`${at}.target 必填（内置页标识，如 todoList）`)
    }
    if (item.type === 'url' && (typeof item.url !== 'string' || !URL_RE.test(item.url))) {
      issues.push(`${at}.url 必须是 http(s) 链接`)
    }
  })
  return issues
}

/** 菜单项归一化：去空白、丢弃未在契约内的 children（避免把前端临时字段写进配置） */
function normalizeMenu(item: AppMenuItem): AppMenuItem {
  const out: AppMenuItem = {
    id: String(item.id).trim(),
    name: String(item.name).trim(),
    type: item.type,
  }
  if (item.icon) out.icon = String(item.icon).trim()
  if (item.pageId) out.pageId = String(item.pageId).trim()
  if (item.target) out.target = String(item.target).trim()
  if (item.url) out.url = String(item.url).trim()
  if (item.badge) out.badge = item.badge
  return out
}

function mergeTheme(
  base: AppTheme | undefined,
  patch: Record<string, unknown>,
): AppTheme {
  const next: AppTheme = { ...(base ?? {}) }
  for (const k of THEME_KEYS) {
    if (!(k in patch)) continue
    const v = patch[k]
    if (v === null || v === undefined) delete next[k]
    else (next as Record<string, unknown>)[k] = v
  }
  return next
}

@Injectable()
export class AppConfigService {
  // B-43：vitest/esbuild 不 emit decorator metadata —— 构造注入一律显式 @Inject
  constructor(@Inject(APP_CONFIG_REPOSITORY) private readonly repo: AppConfigRepository) {}

  async getConfig(): Promise<AppConfig> {
    return this.repo.read()
  }

  /**
   * 统一 patch：`theme` 逐键合并，`name/icon/entry/menus` 按顶层键替换，显式 null 清除。
   * 返回合并后的**完整配置**（调用方无需再读一次）。
   */
  async patch(patch: Record<string, unknown>): Promise<AppConfig> {
    const cfg = await this.repo.read()

    if ('theme' in patch) {
      cfg.theme = mergeTheme(cfg.theme, (patch.theme ?? {}) as Record<string, unknown>)
    }
    for (const k of SETTING_KEYS) {
      if (!(k in patch)) continue
      const v = patch[k]
      if (v === null || v === undefined) {
        delete cfg[k]
        continue
      }
      if (k === 'name' || k === 'icon') {
        ;(cfg as Record<string, unknown>)[k] = String(v).trim()
      } else if (k === 'entry') {
        const e = v as AppEntry
        cfg.entry = e.pageId ? { type: e.type, pageId: e.pageId } : { type: e.type }
      } else {
        cfg.menus = (v as AppMenuItem[]).map(normalizeMenu)
      }
    }

    await this.repo.write(cfg)
    return cfg
  }

  /** 兼容入口：只写 theme（内部走 patch） */
  async patchTheme(patch: Record<string, unknown>): Promise<AppTheme> {
    const cfg = await this.patch({ theme: patch })
    return cfg.theme ?? {}
  }
}
