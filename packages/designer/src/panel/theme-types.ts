/**
 * ThemePanel 的通道类型（Phase 3 批 3 / D-P3-8）——独立 ts 文件而非 SFC 内导出：
 * `<script setup>` 不能承载 export，跨包类型引用走本文件最干净。
 *
 * patch 语义与服务端 `PUT /apps/config` 对齐：**缺键保留旧值、显式 null 清除该键**
 * （清除后回落 `@lc/tokens` 令牌默认值）。
 */
import type { AppTheme } from '@lc/schema'

export type ThemePatch = {
  primary?: string | null
  radius?: string | null
  dark?: boolean | null
}

/** 主题读写通道：designer-web 注入 fetch 实现，测试注入 mock（面板不感知传输层） */
export interface ThemeApi {
  get(): Promise<AppTheme | undefined>
  put(patch: ThemePatch): Promise<AppTheme>
}
