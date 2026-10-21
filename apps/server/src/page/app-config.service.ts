/**
 * 应用配置（Phase 3 批 3 / D-P3-8；Phase 4 第二批落库）。
 *
 * 首期只承载 `theme`（primary/radius/dark，协议见 `@lc/schema` 的 `AppTheme`）；
 * 结构为顶层对象预留扩展位（未来独立应用实体可迁入本文件）。
 *
 * - 存储：`LC_STORAGE=json` 走 `<DATA_DIR>/apps.json`，`mysql` 走 `app_config` 表；
 * - 写入语义：**patch**（缺键保留旧值、显式 null 清除该键）—— 前端只需提交改动项；
 * - 读取容错：文件不存在 / JSON 损坏 → `{}`（配置层故障不拖垮 bootstrap）。
 */
import { Inject, Injectable } from '@nestjs/common'
import type { AppTheme } from '@lc/schema'
import {
  APP_CONFIG_REPOSITORY,
  type AppConfig,
  type AppConfigRepository,
} from './app-config.types.js'

export type { AppConfig } from './app-config.types.js'

const THEME_KEYS = ['primary', 'radius', 'dark'] as const
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const PX_RE = /^\d+(?:\.\d+)?px$/

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

@Injectable()
export class AppConfigService {
  // B-43：vitest/esbuild 不 emit decorator metadata —— 构造注入一律显式 @Inject
  constructor(@Inject(APP_CONFIG_REPOSITORY) private readonly repo: AppConfigRepository) {}

  async getConfig(): Promise<AppConfig> {
    return this.repo.read()
  }

  /** patch 语义写入 theme：缺键保留、显式 null 清除；返回合并后的完整 theme */
  async patchTheme(patch: Record<string, unknown>): Promise<AppTheme> {
    const cfg = await this.repo.read()
    const next: AppTheme = { ...(cfg.theme ?? {}) }
    for (const k of THEME_KEYS) {
      if (!(k in patch)) continue
      const v = patch[k]
      if (v === null || v === undefined) delete next[k]
      else (next as Record<string, unknown>)[k] = v
    }
    cfg.theme = next
    await this.repo.write(cfg)
    return next
  }
}
