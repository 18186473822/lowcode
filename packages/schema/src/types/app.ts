/** 应用菜单项。 */
export interface AppMenuItem {
  id: string
  name: string
  icon?: string
  type: 'page' | 'portal' | 'builtin' | 'url'
  /** type=page 时指向的页面 */
  pageId?: string
  /** type=builtin 时的内置页标识，如 todoList / contacts / profile */
  target?: string
  /** type=url 时的外链 */
  url?: string
  badge?: 'todo' | 'none'
  children?: AppMenuItem[]
}

/** 应用主题。 */
export interface AppTheme {
  primary?: string
  radius?: string
  dark?: boolean
}

/** 应用协议：一个 App = 页面 + 菜单 + 数据模型 + 流程 + 主题。 */
export interface AppSchema {
  schemaVersion: string
  id: string
  name: string
  icon?: string
  entry?: { type: 'portal' | 'page'; pageId?: string }
  menus: AppMenuItem[]
  theme?: AppTheme
  pages: string[]
  models?: string[]
  flows?: string[]
  /** 应用级共享数据初值 */
  appData?: Record<string, unknown>
}
