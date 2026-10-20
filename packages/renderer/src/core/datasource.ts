/**
 * 数据源引擎：静态 / HTTP / 平台模型 / 公式 四类取数。
 *
 * 设计要点：
 *  - **不直接依赖 uni.request** —— 通过 `host.request` 注入，Node 下可单测
 *  - `params` 中的 `$expr:` 占位在请求前求值（如 `{ pid: '$expr: formData.city' }`）
 *  - TTL 缓存、`resultPath` 取值、`transform` 转换表达式
 *  - 任何失败都只把 `state.error` 置位并返回 null，**绝不向上抛异常打断渲染**
 */
import { evalExpr, safeEval, type Scope } from '@lc/expression'
import type { DataSourceSchema } from '@lc/schema'
import type { DataSourceState, HttpResponse, RuntimeHost } from './types.js'
import type { PageContext } from './context.js'

export interface DataSourceRunnerOptions {
  ctx: PageContext
  host: Pick<RuntimeHost, 'request'>
  /** 状态变更回调（Vue 层用于触发重渲染） */
  onStateChange?: (id: string, state: DataSourceState) => void
  /** 取数失败回调（埋点） */
  onError?: (info: { id: string; error: unknown }) => void
  /** 取数成功回调 */
  onSuccess?: (info: { id: string; data: unknown }) => void
}

interface CacheEntry {
  data: unknown
  expiresAt: number
}

export class DataSourceRunner {
  private readonly schemas = new Map<string, DataSourceSchema>()
  private readonly states = new Map<string, DataSourceState>()
  private readonly cache = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<unknown>>()
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly opts: DataSourceRunnerOptions,
    schemas: DataSourceSchema[] = [],
  ) {
    for (const s of schemas) {
      this.schemas.set(s.id, s)
      this.states.set(s.id, {
        id: s.id,
        status: 'idle',
        loading: false,
        data: undefined,
        error: null,
        updatedAt: null,
      })
    }
  }

  /* ------------------------------ 状态 ------------------------------ */

  get(id: string): DataSourceState {
    return (
      this.states.get(id) ?? {
        id,
        status: 'idle',
        loading: false,
        data: undefined,
        error: null,
        updatedAt: null,
      }
    )
  }

  /** 全部状态快照（供渲染层一次性读取） */
  snapshot(): Record<string, DataSourceState> {
    return Object.fromEntries(this.states)
  }

  private setState(id: string, patch: Partial<DataSourceState>): void {
    const cur = this.states.get(id) ?? {
      id,
      status: 'idle' as const,
      loading: false,
      data: undefined,
      error: null,
      updatedAt: null,
    }
    const next = { ...cur, ...patch }
    this.states.set(id, next)
    this.opts.onStateChange?.(id, next)
  }

  /* ------------------------------ 触发 ------------------------------ */

  /** 加载所有 trigger=init 的数据源（onMount 时调用） */
  async loadInit(): Promise<void> {
    const jobs: Promise<unknown>[] = []
    for (const s of this.schemas.values()) {
      if (s.trigger === 'init') jobs.push(this.load(s.id))
    }
    await Promise.all(jobs)
  }

  /** 订阅字段变更以驱动 `watch:` 触发器 */
  startWatch(): void {
    if (this.unsubscribe) return
    this.unsubscribe = this.opts.ctx.onFieldChange(({ name, root }) => {
      for (const s of this.schemas.values()) {
        if (!s.trigger || !s.trigger.startsWith('watch:')) continue
        const target = s.trigger.slice('watch:'.length)
        // watch:formData.city —— 变更路径与目标互为前缀即触发
        const full = name === root ? root : `${root}.${name}`
        if (full === target || full.startsWith(`${target}.`) || target.startsWith(`${full}.`)) {
          void this.load(s.id)
        }
      }
    })
  }

  stopWatch(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /* ------------------------------ 加载 ------------------------------ */

  /**
   * 加载数据源。
   * @returns 成功返回数据，失败返回 null（不抛异常）
   */
  async load(id: string, paramsOverride?: Record<string, unknown>): Promise<unknown> {
    const schema = this.schemas.get(id)
    if (!schema) {
      this.setState(id, { status: 'error', loading: false, error: `数据源不存在：${id}` })
      return null
    }

    // 并发去重：同一数据源的重复 load 复用同一个 Promise
    const pending = this.inflight.get(id)
    if (pending) return pending

    const job = this.run(schema, paramsOverride).finally(() => this.inflight.delete(id))
    this.inflight.set(id, job)
    return job
  }

  private async run(schema: DataSourceSchema, paramsOverride?: Record<string, unknown>): Promise<unknown> {
    const id = schema.id
    this.setState(id, { status: 'loading', loading: true, error: null })

    try {
      // ① 缓存
      if (schema.cache?.enable) {
        const hit = this.cache.get(id)
        if (hit && hit.expiresAt > Date.now()) {
          this.setState(id, {
            status: 'success',
            loading: false,
            data: hit.data,
            error: null,
            updatedAt: Date.now(),
          })
          this.opts.onSuccess?.({ id, data: hit.data })
          return hit.data
        }
      }

      // ② 解析参数
      const scope = this.opts.ctx.scope
      const params = resolveParams(schema.params ?? {}, scope, paramsOverride)

      // ③ 按类型取数
      let raw: unknown
      switch (schema.type) {
        case 'static':
          raw = schema.data
          break
        case 'http':
          raw = await this.runHttp(schema, params)
          break
        case 'model':
          raw = await this.runModel(schema, params)
          break
        case 'formula': {
          raw = this.runFormula(schema, scope)
          break
        }
        default:
          throw new Error(`不支持的数据源类型：${(schema as DataSourceSchema).type}`)
      }

      // ④ resultPath 取值
      let data = schema.resultPath ? safeEval(schema.resultPath, { ...scope, result: raw }, raw) : raw

      // ⑤ transform 转换
      if (schema.transform) {
        data = evalExpr(schema.transform, { ...scope, result: data })
      }

      // ⑥ 写缓存
      if (schema.cache?.enable) {
        this.cache.set(id, { data, expiresAt: Date.now() + (schema.cache.ttl ?? 60) * 1000 })
      }

      this.setState(id, { status: 'success', loading: false, data, error: null, updatedAt: Date.now() })
      this.opts.onSuccess?.({ id, data })
      return data
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState(id, { status: 'error', loading: false, error: message })
      this.opts.onError?.({ id, error })
      return null
    }
  }

  private async runHttp(schema: DataSourceSchema, params: Record<string, unknown>): Promise<unknown> {
    const method = schema.method ?? 'GET'
    const query =
      method === 'GET' && Object.keys(params).length > 0
        ? '?' + new URLSearchParams(params as Record<string, string>).toString()
        : ''
    const res: HttpResponse = await this.opts.host.request({
      method,
      url: `${schema.url ?? ''}${query}`,
      data: method === 'GET' ? undefined : params,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`请求失败（${res.statusCode}）：${schema.url}`)
    }
    return res.data
  }

  /** 平台内模型 CRUD（服务端约定 REST 风格）。GET 把 params 拼成 query string ——
   * filter 对象按服务端契约序列化为 JSON 字符串（parseListQuery 只接受 JSON），sort 为 field:dir。 */
  private async runModel(schema: DataSourceSchema, params: Record<string, unknown>): Promise<unknown> {
    const modelId = schema.modelId
    if (!modelId) throw new Error('model 数据源缺少 modelId')
    const method = schema.method ?? 'POST'
    const url = `/api/v1/models/${modelId}/records`
    if (method !== 'GET') {
      const res = await this.opts.host.request({ method, url, data: params })
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`模型取数失败（${res.statusCode}）`)
      }
      return res.data
    }
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue
      usp.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
    const qs = usp.toString()
    const res = await this.opts.host.request({ method: 'GET', url: qs ? `${url}?${qs}` : url })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`模型取数失败（${res.statusCode}）`)
    }
    return res.data
  }

  /** 公式数据源：基于其他数据源/字段计算（`expr` 写在 transform 上） */
  private runFormula(schema: DataSourceSchema, scope: Scope): unknown {
    const expr = schema.transform ?? schema.url
    if (!expr) throw new Error('formula 数据源缺少计算表达式')
    return evalExpr(expr, { ...scope, ds: this.snapshot() })
  }

  /* ------------------------------ 维护 ------------------------------ */

  /** 清除缓存（id 省略则全清） */
  clearCache(id?: string): void {
    if (id) this.cache.delete(id)
    else this.cache.clear()
  }

  /** 注册新数据源（运行期动态下发 Schema 时使用） */
  register(schema: DataSourceSchema): void {
    this.schemas.set(schema.id, schema)
    if (!this.states.has(schema.id)) {
      this.setState(schema.id, {
        status: 'idle',
        loading: false,
        data: undefined,
        error: null,
        updatedAt: null,
      })
    }
  }

  /** 释放订阅 */
  dispose(): void {
    this.stopWatch()
    this.inflight.clear()
  }
}

/* ------------------------------------------------------------------ */
/* 参数解析                                                            */
/* ------------------------------------------------------------------ */

/**
 * 解析数据源参数：值为 `$expr: xxx` 时求值，其余保持原值。
 * 支持 override 覆盖（联动触发时携带上下文）。
 */
export function resolveParams(
  params: Record<string, unknown>,
  scope: Scope,
  override?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.startsWith('$expr:')) {
      out[k] = safeEval(v.slice('$expr:'.length).trim(), scope, undefined)
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === 'string' && item.startsWith('$expr:')
          ? safeEval(item.slice('$expr:'.length).trim(), scope, undefined)
          : item && typeof item === 'object'
            ? resolveParams(item as Record<string, unknown>, scope)
            : item,
      )
    } else if (v && typeof v === 'object') {
      // 嵌套对象不传 override —— override 只在顶层生效，避免污染子结构
      out[k] = resolveParams(v as Record<string, unknown>, scope)
    } else {
      out[k] = v
    }
  }
  return { ...out, ...(override ?? {}) }
}
