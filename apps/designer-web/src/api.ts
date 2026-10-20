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
  ModelSummary,
  PageListItem,
  VersionList,
  RoleRecord,
  RbacConfig,
  ThemeApi,
} from '@lc/designer'
import type { PageSchema, ModelSchema, AppTheme } from '@lc/schema'

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

export const designerApi: DesignerApi = {
  async getSchema(pageId, version) {
    const qs = version ? `?version=${encodeURIComponent(version)}` : ''
    const res = await req(`/pages/${encodeURIComponent(pageId)}/schema${qs}`)
    const data = (await res.json()) as { schema: PageSchema; version: string | number }
    return { schema: data.schema, version: data.version }
  },
  async saveSchema(pageId, schema) {
    await req(`/pages/${encodeURIComponent(pageId)}/schema`, {
      method: 'PUT',
      body: JSON.stringify({ schema }),
    })
  },
  async publish(pageId) {
    const res = await req(`/pages/${encodeURIComponent(pageId)}/publish`, {
      method: 'POST',
      body: JSON.stringify({ note: '设计器发布' }),
    })
    return (await res.json()) as { version?: number }
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
  async rollback(pageId, version) {
    const res = await req(`/pages/${encodeURIComponent(pageId)}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    })
    return (await res.json()) as { rolledBackTo: number }
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
