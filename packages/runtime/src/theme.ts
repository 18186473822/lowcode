/**
 * theme.ts —— 移动端运行时主题（design-system.md §2.5 + 批 3 D-P3-8/D-P3-9）
 *
 * 两层主题：
 *  1. **系统 dark 跟随**（移动端平台惯例）：`initTheme()` 解析系统偏好并挂监听；
 *  2. **应用配置主题**（批 3）：`applyAppTheme()` 覆盖品牌档位 / 圆角 / 显式 dark ——
 *     配置优先级高于系统偏好（D-P3-9：dark 显式配置后系统监听让位）。
 *
 * 令牌层（`@lc/tokens/tokens.rpx.css`）：dark 块由 `[data-theme='dark']` 驱动；
 * brand 档位 `--lc-brand-50..900` 是 action / focus / link 等语义变量的根 ——
 * 覆盖档位即全站生效（十档派生逻辑见 `@lc/renderer` 的 `deriveBrandPalette`）。
 *
 * 非 H5 端（小程序）没有 `document`：本文件所有 DOM 写入均为 no-op，
 * mp 端主题动态化见台账「明确未做」（批 3 首期 H5 口径）。
 */
import { deriveBrandPalette } from '@lc/renderer'
import type { AppTheme } from '@lc/schema'

export type ThemeMode = 'light' | 'dark'

/** 应用配置的显式 dark：undefined = 跟随系统（系统监听回调据此让位，D-P3-9） */
let appDark: boolean | undefined

/** 读系统偏好；无 matchMedia（老运行时 / 非浏览器）→ light */
export function resolveTheme(): ThemeMode {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {
    // 忽略：按 light 处理
  }
  return 'light'
}

/** 把主题写到根节点（只有 H5 有 document） */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', mode)
}

/**
 * 启动时调用一次。返回解析结果便于测试与日志。
 * 监听系统切换同样必要（移动端用户常在日落时切深色）——H5 下挂 change 监听；
 * 应用配置显式 dark 后监听让位（D-P3-9）。
 */
export function initTheme(): ThemeMode {
  const mode = resolveTheme()
  if (appDark === undefined) applyTheme(mode)

  try {
    if (typeof matchMedia === 'function') {
      const mql = matchMedia('(prefers-color-scheme: dark)')
      mql.addEventListener?.('change', (e) => {
        if (appDark !== undefined) return // 配置显式 dark：忽略系统切换
        applyTheme(e.matches ? 'dark' : 'light')
      })
    }
  } catch {
    // 不支持监听时退化为「仅启动时解析一次」
  }

  return mode
}

/**
 * 应用配置主题落地（批 3 D-P3-8）：bootstrap 下发 / 缓存恢复时调用。
 * - `primary` → 生成 brand 十档 CSS 变量（语义变量皆派生自档位，覆盖即全站）；
 * - `radius` → 覆盖主用三档（按钮/输入 sm、面板 md；配置单位约定 px，见服务端校验）；
 * - `dark`（显式）→ 覆盖系统偏好；`undefined` → 保持系统跟随。
 * 非 H5 / 非法值静默跳过（主题是增强，不阻断启动）。
 */
export function applyAppTheme(theme: AppTheme | undefined): void {
  if (!theme || typeof document === 'undefined') return
  const root = document.documentElement

  if (theme.primary) {
    const palette = deriveBrandPalette(theme.primary)
    if (palette) {
      for (const [name, value] of Object.entries(palette)) root.style.setProperty(name, value)
      // dark 覆盖块曾把 action-primary 硬编码为 #4d88f0（不引用档位）——
      // inline 补一笔保证暗色下主色同样跟随主题（inline 特异性最高，两态通吃）
      root.style.setProperty('--lc-action-primary', palette['--lc-brand-500'])
    }
  }

  if (theme.radius) {
    root.style.setProperty('--lc-radius-sm', theme.radius)
    root.style.setProperty('--lc-radius-md', theme.radius)
  }

  if (typeof theme.dark === 'boolean') {
    appDark = theme.dark
    applyTheme(theme.dark ? 'dark' : 'light')
  }
}
