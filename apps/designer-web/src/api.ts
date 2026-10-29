/**
 * 设计器服务端通道（批 3）——实现 @lc/designer 的 DesignerApi（fetch 版）。
 *
 * - 自动登录：首次请求前 POST /auth/login（种子账号 admin/admin123，方案 8.4），
 *   token 落 sessionStorage，后续请求带 `Authorization: Bearer`。
 * - 非 2xx 统一抛 Error（带服务端 message），由 store 落 statusText。
 * - dev 经 vite proxy `/api → http://localhost:3000`（vite.config.ts）。
 */
import type {
  DesignerApi,
  AppSettings,
  ModelSummary,
  PageListItem,
  VersionList,
  RoleRecord,
  RbacConfig,
  ThemeApi,
  WebhookApi,
  WebhookDeliveryPage,
  WebhookMetrics,
  WebhookSubscription,
} from '@lc/designer'
import type { PageSchema, ModelSchema, AppTheme } from '@lc/schema'

/** 应用设置通道只关心非主题部分（主题由 themeApi 负责，两者 patch 语义不同） */
function stripTheme(body: Record<string, unknown>): AppSettings {
  const { theme: _theme, ...settings } = body
  return settings as AppSettings
}

const BASE = '/api/v1'
const SEED_USER = { username: 'admin', password: 'admin123' }
const TOKEN_KEY = 'lc_designer_token'

function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? ''
}

async function ensureToken(): Promise<string> {
  const cached = getToken()
  if (cached) return cached
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SEED_USER),
  })
  if (!res.ok) throw new Error(`登录失败（${res.status}）`)
  const data = (await res.json()) as { accessToken?: string }
  const token = data.accessToken ?? ''
  if (!token) throw new Error('登录响应缺少 accessToken')
  sessionStorage.setItem(TOKEN_KEY, token)
  return token
}

/** 带鉴权的请求；非 2xx 抛 Error（取服务端 body.message 作内容） */
async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await ensureToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    let detail = String(res.status)
    try {
      const body = (await res.json()) as { message?: string; code?: string }
      detail = body.message ?? body.code ?? detail
    } catch {
      /* 非 JSON 响应体（如 HTML 错误页）→ 保留状态码 */
    }
    throw new Error(detail)
  }
  return res
}

/** 批 3 D-P3-8：应用主题通道（GET 读配置 / PUT patch 写入，与画布 DesignerApi 分域） */
export const themeApi: ThemeApi = {
  async get() {
    const res = await req('/apps/config')
    const body = (await res.json()) as { theme?: AppTheme }
    return body.theme
  },
  async put(patch) {
    const res = await req('/apps/config', {
      method: 'PUT',
      body: JSON.stringify({ theme: patch }),
    })
    const body = (await res.json()) as { theme?: AppTheme }
    return body.theme ?? {}
  },
}

function etagOf(res: Response): string | undefined {
  return res.headers.get('ETag') ?? undefined
}

/** Webhook 管理通道：写操作回传 If-Match；409 由 req 统一抛错，不自动覆盖。 */
export const webhookApi: WebhookApi = {
  async list() {
    const res = await req('/webhooks')
    return (await res.json()) as { items: WebhookSubscription[] }
  },
  async create(body) {
    const res = await req('/webhooks', { method: 'POST', body: JSON.stringify(body) })
    const data = (await res.json()) as WebhookSubscription & { secret?: string }
    return {
      data,
      secret: data.secret ?? '',
      ...(etagOf(res) ? { etag: etagOf(res) } : {}),
    }
  },
  async update(id, body, ifMatch) {
    const res = await req(`/webhooks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: ifMatch ? { 'If-Match': ifMatch } : {},
      body: JSON.stringify(body),
    })
    return {
      data: (await res.json()) as WebhookSubscription,
      ...(etagOf(res) ? { etag: etagOf(res) } : {}),
    }
  },
  async remove(id, ifMatch) {
    await req(`/webhooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: ifMatch ? { 'If-Match': ifMatch } : {},
    })
  },
  async rotate(id, graceSeconds, ifMatch) {
    const res = await req(`/webhooks/${encodeURIComponent(id)}/rotate-secret`, {
      method: 'POST',
      headers: ifMatch ? { 'If-Match': ifMatch } : {},
      body: JSON.stringify({ graceSeconds }),
    })
    const data = (await res.json()) as WebhookSubscription & { secret?: string }
    return {
      data,
      secret: data.secret ?? '',
      ...(etagOf(res) ? { etag: etagOf(res) } : {}),
    }
  },
  async test(id) {
    const res = await req(`/webhooks/${encodeURIComponent(id)}/test`, { method: 'POST' })
    return {
      data: (await res.json()) as WebhookDeliveryPage['items'][number],
      ...(etagOf(res) ? { etag: etagOf(res) } : {}),
    }
  },
  async deliveries(id, query = {}) {
    const params = new URLSearchParams()
    if (query.status) params.set('status', query.status)
    if (query.page) params.set('page', String(query.page))
    if (query.size) params.set('size', String(query.size))
    const qs = params.toString()
    const res = await req(`/webhooks/${encodeURIComponent(id)}/deliveries${qs ? `?${qs}` : ''}`)
    return (await res.json()) as WebhookDeliveryPage
  },
  async metrics() {
    const res = await req('/webhooks/metrics')
    return (await res.json()) as WebhookMetrics
  },
  async cleanup() {
    const res = await req('/webhooks/maintenance/cleanup', { method: 'POST' })
    return (await res.json()) as { archived: number }
  },
}

/** 页面 ETag 与服务端 `makeEtag('page', id, revision)` 同源 */
function pageEtag(pageId: string, revision: number): string {
  return `"page:${pageId}:${revision}"`
}

function ifMatchFor(pageId: string, revision: number | undefined): Record<string, string> {
  return revision === undefined ? {} : { 'If-Match': pageEtag(pageId, revision) }
}

export const designerApi: DesignerApi = {
  /**
   * 应用设置（门户首页应用条 / 门户配置）：`GET /apps/config` 返回 `{ theme, name, icon, entry, menus }`。
   * 这里把 `theme` 摘掉 —— 主题走独立的 `themeApi` 通道，两条通道的 patch 语义不同。
   */
  async getAppConfig() {
    const res = await req('/apps/config')
    return stripTheme((await res.json()) as Record<string, unknown>)
  },
  async putAppConfig(patch) {
    const res = await req('/apps/config', {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
    return stripTheme((await res.json()) as Record<string, unknown>)
  },
  /**
   * 流程定义列表（门户配置「流程入口」）：只投影需要的字段。
   * 流程定义的其余部分（nodes/onApprove…）设计器不建模，绑定启动页时原样透传。
   */
  async listFlows() {
    const res = await req('/flows')
    const body = (await res.json()) as { flows?: Array<Record<string, unknown>> }
    return (Array.isArray(body.flows) ? body.flows : [])
      .filter((f) => typeof f.flowId === 'string' && f.flowId)
      .map((f) => ({
        flowId: String(f.flowId),
        name: typeof f.name === 'string' && f.name ? f.name : String(f.flowId),
        modelId: typeof f.modelId === 'string' ? f.modelId : undefined,
        startPageId: typeof f.startPageId === 'string' ? f.startPageId : undefined,
      }))
  },
  /** 绑 / 解绑启动页：读完整定义 → 只改 startPageId → 原样写回（不重建定义） */
  async putFlowStartPage(flowId, startPageId) {
    const path = `/flows/${encodeURIComponent(flowId)}`
    const got = await req(path)
    const flow = (await got.json()) as Record<string, unknown>
    const next: Record<string, unknown> = { ...flow }
    if (startPageId) next.startPageId = startPageId
    else delete next.startPageId
    await req(path, { method: 'PUT', body: JSON.stringify(next) })
  },
  async getSchema(pageId, version) {
    const qs = version ? `?version=${encodeURIComponent(version)}` : ''
    const res = await req(`/pages/${encodeURIComponent(pageId)}/schema${qs}`)
    const data = (await res.json()) as {
      schema: PageSchema
      version: string | number
      revision?: number
    }
    return { schema: data.schema, version: data.version, revision: data.revision }
  },
  async saveSchema(pageId, schema, revision) {
    const res = await req(`/pages/${encodeURIComponent(pageId)}/schema`, {
      method: 'PUT',
      headers: ifMatchFor(pageId, revision),
      body: JSON.stringify({ schema }),
    })
    return (await res.json()) as { revision?: number }
  },
  async publish(pageId, revision, note) {
    const res = await req(`/pages/${encodeURIComponent(pageId)}/publish`, {
      method: 'POST',
      headers: ifMatchFor(pageId, revision),
      // 版本说明会进历史列表；空串走服务端默认，避免出现空备注
      body: JSON.stringify({ note: note?.trim() || '设计器发布' }),
    })
    return (await res.json()) as { version?: number; revision?: number }
  },
  /* 批 4：字段绑定 —— 模型列表（提交模型下拉）/ 模型定义（字段下拉） */
  async listModels() {
    const res = await req('/models')
    return (await res.json()) as ModelSummary[]
  },
  async getModel(modelId) {
    const res = await req(`/models/${encodeURIComponent(modelId)}`)
    return (await res.json()) as ModelSchema
  },
  /* Phase 2 批 1：模型可视化建模 —— 保存模型定义（upsert；body 即 ModelSchema 本体） */
  async putModel(model) {
    await req(`/models/${encodeURIComponent(model.id)}`, {
      method: 'PUT',
      body: JSON.stringify(model),
    })
  },
  /* Phase 2 批 5：版本历史列表（轻量元数据倒序）+ 回滚（历史版 → 新草稿） */
  async listVersions(pageId) {
    const res = await req(`/pages/${encodeURIComponent(pageId)}/versions`)
    return (await res.json()) as VersionList
  },
  async rollback(pageId, version, revision) {
    const res = await req(`/pages/${encodeURIComponent(pageId)}/rollback`, {
      method: 'POST',
      headers: ifMatchFor(pageId, revision),
      body: JSON.stringify({ version }),
    })
    return (await res.json()) as { rolledBackTo: number; revision?: number }
  },
  /* Phase 2 批 6：RBAC 全量配置（角色 + 页面可见性白名单）+ upsert 角色/页面授权 + 全页面摘要 */
  async listRbac() {
    const res = await req('/rbac/roles')
    return (await res.json()) as RbacConfig
  },
  async putRole(role: RoleRecord) {
    await req(`/rbac/roles/${encodeURIComponent(role.key)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: role.name, perms: role.perms }),
    })
  },
  async putPageAuth(pageId, roles) {
    await req(`/rbac/pages/${encodeURIComponent(pageId)}`, {
      method: 'PUT',
      body: JSON.stringify({ roles }),
    })
  },
  async listPages() {
    // 2026-10-20 起走 `GET /pages`：除 id/name 外还带 type/status/currentVersion/updatedAt，
    // 供顶栏换页下拉展示（服务端已按 RBAC 可见性过滤，与 bootstrap 菜单同口径）。
    const res = await req('/pages')
    return (await res.json()) as PageListItem[]
  },
  async deletePage(pageId: string) {
    const res = await req(`/pages/${encodeURIComponent(pageId)}`, { method: 'DELETE' })
    return (await res.json()) as { removedVersions: number }
  },
}
