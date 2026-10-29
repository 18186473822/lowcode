/**
 * 运行时壳的服务端 API 层：会话（token/用户）+ 三个壳接口
 * （登录 / 启动聚合 / 页面 Schema 拉取）。
 *
 * - 基址用**绝对地址**（H5 与小程序通用，服务端已 `enableCors()`）；
 *   **B-29**：本机 IPv6 回环 `::1` 被拦，一律写 `127.0.0.1` 而非 `localhost`；
 *   真机调试时改成局域网 IP（如 `http://192.168.1.10:3000`）。
 * - token 存 `uni` 本地缓存，`host.request` 出站请求自动携带（见 host.ts）。
 */

import type { AppTheme } from '@lc/schema'

export const API_ORIGIN = 'http://127.0.0.1:3000'
export const API_BASE = `${API_ORIGIN}/api/v1`

const TOKEN_KEY = 'lc_token'
const USER_KEY = 'lc_user'
/** 批 6：用户权限点（角色 perms 并集；'*' 通配）—— 供 view 页 hasPerm 判定 */
const PERMS_KEY = 'lc_perms'
/** 批 3：应用主题缓存（bootstrap 下发；App.vue 启动时恢复应用，D-P3-8） */
const THEME_KEY = 'lc_theme'

/** 登录用户（与服务端 LoginResult.user / /auth/me 对齐的最小投影） */
export interface SessionUser {
  id?: string
  username: string
  displayName?: string
  roles?: string[]
}

/** API 错误：带 HTTP 状态与业务 code（401 用于触发跳登录，404 用于「页面不存在」） */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/* ------------------------------ 会话 ------------------------------ */

export function getToken(): string {
  return (uni.getStorageSync(TOKEN_KEY) as string) || ''
}

export function getUser(): SessionUser | null {
  try {
    const raw = uni.getStorageSync(USER_KEY)
    return raw ? (JSON.parse(raw as string) as SessionUser) : null
  } catch {
    return null
  }
}

export function setSession(token: string, user: SessionUser): void {
  uni.setStorageSync(TOKEN_KEY, token)
  uni.setStorageSync(USER_KEY, JSON.stringify(user))
}

/** 批 6：写入权限点（login/bootstrap 后调用；bootstrap 每次刷新以反映最新授权） */
export function setPerms(perms: string[]): void {
  uni.setStorageSync(PERMS_KEY, JSON.stringify(perms))
}

/** 批 6：读取权限点（view 页 hasPerm 判定源；无缓存 → 空数组，perm 节点 fail-closed 全隐） */
export function getPerms(): string[] {
  try {
    const raw = uni.getStorageSync(PERMS_KEY)
    const parsed = raw ? (JSON.parse(raw as string) as unknown) : null
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function clearSession(): void {
  uni.removeStorageSync(TOKEN_KEY)
  uni.removeStorageSync(USER_KEY)
  uni.removeStorageSync(PERMS_KEY)
}

/** 展示名：displayName 优先，回落 username */
export function displayName(user: SessionUser | null): string {
  return user?.displayName || user?.username || '未登录'
}

/* ------------------------------ 请求 ------------------------------ */

interface RawResult {
  status: number
  body: any
}

/** 底层请求：绝对 URL + JSON + 可选 Bearer；网络失败归一为 status 0 */
function raw(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<RawResult> {
  return new Promise((resolve) => {
    uni.request({
      url: `${API_BASE}${path}`,
      method: (opts.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE',
      data: opts.body as Record<string, unknown> | undefined,
      header: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      success: (r) => resolve({ status: r.statusCode, body: r.data as RawResult['body'] }),
      fail: () => resolve({ status: 0, body: null }),
    })
  })
}

/** 业务请求：2xx 返回 body，否则抛 ApiError（message 取服务端 message） */
async function call(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<any> {
  const r = await raw(path, opts)
  if (r.status === 0) {
    throw new ApiError(0, 'NETWORK_ERROR', '网络异常：无法连接服务端')
  }
  if (r.status < 200 || r.status >= 300) {
    const code = typeof r.body?.code === 'string' ? r.body.code : 'HTTP_ERROR'
    const message = typeof r.body?.message === 'string' ? r.body.message : `请求失败（${r.status}）`
    throw new ApiError(r.status, code, message)
  }
  return r.body
}

/* ------------------------------ 三个壳接口 ------------------------------ */

/** 登录：成功写入会话（含批 6 权限点）并返回用户；失败抛 ApiError（401 INVALID_CREDENTIALS 等） */
export async function login(username: string, password: string): Promise<SessionUser> {
  const body = await call('/auth/login', { method: 'POST', body: { username, password } })
  const user: SessionUser = body.user
  setSession(body.accessToken, user)
  // 批 6：登录即落权限点（直达 view 页不经菜单也能拿到）
  if (Array.isArray(body.perms)) setPerms(body.perms.map(String))
  return user
}

/**
 * 启动聚合：当前用户 + 权限点 + 应用菜单（菜单已按页面可见性过滤，批 6）。
 * 无令牌/令牌过期 → 401。每次调用刷新会话 perms（反映最新授权）。
 */
export async function bootstrap(): Promise<{
  user: SessionUser
  perms: string[]
  apps: BootstrapApp[]
  theme?: AppTheme
  app?: BootstrapConfig
}> {
  const body = (await call('/apps/bootstrap', { token: getToken() })) as {
    user: SessionUser
    perms?: unknown
    apps: BootstrapApp[]
    theme?: AppTheme
    app?: BootstrapConfig
  }
  const perms = Array.isArray(body.perms) ? body.perms.map(String) : []
  setPerms(perms)
  // 批 3：主题缓存（无配置时清缓存，回落令牌默认值）
  setThemeCache(body.theme)
  return { user: body.user, perms, apps: body.apps, theme: body.theme, app: body.app }
}

/** 批 3：主题缓存（bootstrap 下发时写入；App.vue 启动时恢复应用，直达 view 页也有主题） */
export function setThemeCache(theme: AppTheme | undefined): void {
  try {
    if (theme) uni.setStorageSync(THEME_KEY, JSON.stringify(theme))
    else uni.removeStorageSync(THEME_KEY)
  } catch {
    // 缓存失败不阻断启动
  }
}

export function getThemeCache(): AppTheme | null {
  try {
    const raw = uni.getStorageSync(THEME_KEY)
    if (!raw || typeof raw !== 'string') return null
    return JSON.parse(raw) as AppTheme
  } catch {
    return null
  }
}

export interface BootstrapApp {
  id: string
  name: string
  pages: MenuPage[]
}

/**
 * 应用设置（2026-10-29 P1）：`bootstrap` 顶层 `app` 下发。
 *
 * 本期**不做自绘底部栏**（小程序 tabBar 是 pages.json 静态配置、运行时不可改），
 * 所以 `menus` 只用于首页列表的顺序与命名，`entry` 用于标「主页」并置顶。
 */
export interface BootstrapConfig {
  name?: string
  icon?: string
  entry?: { type: 'portal' | 'page'; pageId?: string }
  menus?: AppMenu[]
}

export interface AppMenu {
  id: string
  name: string
  icon?: string
  type: 'page' | 'portal' | 'builtin' | 'url'
  pageId?: string
  target?: string
  url?: string
}

export interface MenuPage {
  id: string
  name: string
  type: string
  status: 'draft' | 'published'
  currentVersion: number
  updatedAt: string
}

export interface FetchedSchema {
  /** 实际取到的版本：数字 = 已发布版本号，'draft' = 草稿回退 */
  version: number | 'draft'
  schema: Record<string, unknown>
}

/**
 * 拉取页面 Schema：**已发布版本优先**（出口判据语义），从未发布（409 NOT_PUBLISHED）
 * 则回退草稿（开发期方便）；404/401 原样抛出由页面处理。
 */
export async function fetchPageSchema(pageId: string): Promise<FetchedSchema> {
  try {
    const body = await call(`/pages/${encodeURIComponent(pageId)}/schema?version=published`, {
      token: getToken(),
    })
    return { version: body.version as number, schema: body.schema }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_PUBLISHED') {
      // 从未发布过 → 回退草稿（开发期方便）；页面不存在（404）不回退，原样抛出
      const draft = await call(`/pages/${encodeURIComponent(pageId)}/schema?version=draft`, {
        token: getToken(),
      })
      return { version: 'draft', schema: draft.schema }
    }
    throw e
  }
}

/* --------------------------- 流程审批（Phase 3 批 2） --------------------------- */

/** 待办任务项（服务端 FlowService.todoTasks 投影） */
export interface TodoTask {
  taskId: string
  instanceId: string
  flowId: string
  flowName: string
  modelId: string
  recordId: string
  nodeName: string
  createdBy: string
  createdAt: string
}

/** 流程历史条目（服务端 FlowHistoryEntry） */
export interface FlowHistoryEntry {
  nodeId: string
  nodeName: string
  action: 'start' | 'approve' | 'reject' | 'skip' | 'end' | 'reenter'
  actor: string
  comment?: string
  at: string
}

/** 流程实例（服务端 FlowInstance 运行时形状） */
export interface FlowInstance {
  id: string
  flowId: string
  modelId: string
  recordId: string
  status: 'running' | 'approved' | 'rejected'
  currentNodeId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  tasks: Array<{
    id: string
    nodeId: string
    nodeName: string
    status: 'pending' | 'approved' | 'rejected'
    comment?: string
    decidedBy?: string
    decidedAt?: string
    createdAt: string
  }>
  history: FlowHistoryEntry[]
}

/** 当前用户待办（待办中心列表） */
export async function fetchTodoTasks(): Promise<TodoTask[]> {
  const body = await call('/flows/tasks/todo', { token: getToken() })
  return Array.isArray(body?.items) ? (body.items as TodoTask[]) : []
}

/** 单实例查询（待办详情页） */
export async function fetchFlowInstance(instanceId: string): Promise<FlowInstance> {
  return (await call(`/flows/instances/${encodeURIComponent(instanceId)}`, {
    token: getToken(),
  })) as FlowInstance
}

/** 审批动作：同意 / 驳回（200 返回推进后的实例；403 TASK_FORBIDDEN 等抛 ApiError） */
export async function decideFlowTask(
  instanceId: string,
  taskId: string,
  action: 'approve' | 'reject',
  comment?: string,
): Promise<FlowInstance> {
  return (await call(
    `/flows/instances/${encodeURIComponent(instanceId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'POST', token: getToken(), body: { action, comment: comment || undefined } },
  )) as FlowInstance
}

/** 模型定义（详情展示取字段中文名） */
export async function fetchModelDef(modelId: string): Promise<{
  fields: Array<{ key: string; name: string }>
}> {
  return (await call(`/models/${encodeURIComponent(modelId)}`, { token: getToken() })) as {
    fields: Array<{ key: string; name: string }>
  }
}

/** 单条记录（filter 等值取 id；无命中返回 null） */
export async function fetchRecordById(
  modelId: string,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  const usp = new URLSearchParams()
  usp.set('filter', JSON.stringify({ id: recordId }))
  usp.set('size', '1')
  const body = await call(`/models/${encodeURIComponent(modelId)}/records?${usp.toString()}`, {
    token: getToken(),
  })
  const items = Array.isArray(body?.items) ? body.items : []
  return (items[0] as Record<string, unknown> | undefined) ?? null
}
