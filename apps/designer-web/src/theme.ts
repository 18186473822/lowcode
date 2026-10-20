/**
 * theme.ts —— 亮暗主题（design-system.md §2.2 / §10.4）
 *
 * 主题只改令牌取值，不改组件与页面用法：根节点 `data-theme` 驱动
 * `@lc/designer/tokens.css` 里 Semantic / Component 两层的 Dark 覆盖。
 *
 * 取值优先级：显式选择（localStorage） > 系统偏好（prefers-color-scheme） > light。
 */
import { deriveBrandPalette } from '@lc/renderer'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'lc-theme'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // 隐私模式 / 禁用存储
  }
}

/** 系统偏好（SSR / 老浏览器无 matchMedia → light） */
function prefersDark(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/** 读当前应生效的主题（不读 DOM，便于单测） */
export function resolveTheme(): ThemeMode {
  const stored = storage()?.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return prefersDark() ? 'dark' : 'light'
}

/** 把主题写到根节点（唯一副作用入口）
 *  - `data-theme` 驱动本项目令牌层（tokens.css）
 *  - `dark` class 驱动 Element Plus 的暗色变量（element-plus/theme-chalk/dark/css-vars.css）
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', mode)
  root.classList.toggle('dark', mode === 'dark')
}

/** 用户显式切换并持久化 */
export function setTheme(mode: ThemeMode): void {
  applyTheme(mode)
  try {
    storage()?.setItem(STORAGE_KEY, mode)
  } catch {
    // 存储写入失败不影响本次会话的主题生效
  }
}

/** 启动时调用：解析并应用一次 */
export function initTheme(): ThemeMode {
  const mode = resolveTheme()
  applyTheme(mode)
  return mode
}

/**
 * 批 3 D-P3-8：应用主题 → 设计器自身换肤预览（ThemePanel 保存成功时调用）。
 * 只覆盖 primary / radius 两组变量；**dark 不在此联动** —— 设计器自身亮暗由
 * 独立切换（setTheme）管理，运行时 dark 语义在移动端 H5 验证即可。
 */
export function applyBrandVars(theme: { primary?: string; radius?: string } | undefined): void {
  if (!theme || typeof document === 'undefined') return
  const root = document.documentElement
  if (theme.primary) {
    const palette = deriveBrandPalette(theme.primary)
    if (palette) {
      for (const [name, value] of Object.entries(palette)) root.style.setProperty(name, value)
      // dark 块把 action-primary 硬编码为 #4d88f0（不引用档位）——inline 补一笔两态通吃
      root.style.setProperty('--lc-action-primary', palette['--lc-brand-500'])
    }
  }
  if (theme.radius) {
    root.style.setProperty('--lc-radius-sm', theme.radius)
    root.style.setProperty('--lc-radius-md', theme.radius)
  }
}
