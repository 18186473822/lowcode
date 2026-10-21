/**
 * 运维事件服务（Phase 3 批 5，D-P3-12）：上报校验 / 环形落库 / 查询 / 汇总。
 *
 * 校验策略：**结构性错误 400，数据性超限截断**。
 * - 结构性（type/name/pageId/pageVersion/source/detail 形状、批量条数）→ `OPS_INVALID`；
 * - 数据性（message > 500 字符、detail 序列化 > 2000 字符）→ 截断后入库 ——
 *   埋点是旁路，绝不能因为现场太大反而把业务请求打挂（方案 791 的「兜底」精神）。
 *
 * 身份：`userId` 一律取登录态（`AuthUser.sub`），客户端传的同名字段被忽略。
 */
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { AuthUser } from '../common/jwt.service.js'
import {
  OPS_BATCH_MAX,
  OPS_DETAIL_MAX,
  OPS_EVENT_LIMIT,
  OPS_REPOSITORY,
  type OpsEvent,
  type OpsEventInput,
  type OpsEventType,
  type OpsRepository,
  type OpsSource,
} from './ops.types.js'

const TYPES: readonly OpsEventType[] = ['error', 'perf', 'event']
const SOURCES: readonly OpsSource[] = ['runtime', 'designer', 'server']
/** 与页面 / 模型 id 同款白名单（防日志注入路径穿越式假 id） */
const SAFE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/
const NAME_MAX = 64
const MESSAGE_MAX = 500
const DURATION_MAX = 600_000
const LIST_DEFAULT = 50
const LIST_MAX = 200

export interface OpsListQuery {
  type?: string
  pageId?: string
  since?: string
  limit?: string | number
}

export interface OpsSummary {
  total: number
  byType: Record<OpsEventType, number>
  errors: { total: number; lastAt: string | null }
  perf: { count: number; avgMs: number; p95Ms: number; maxMs: number }
  lastAt: string | null
}

export interface OpsIngestResult {
  accepted: number
  /** 落库后总条数（含历史，已裁剪到上限） */
  total: number
  /** 本次因超过 OPS_EVENT_LIMIT 被淘汰的旧事件数 */
  dropped: number
}

@Injectable()
export class OpsService {
  constructor(@Inject(OPS_REPOSITORY) private readonly repo: OpsRepository) {}

  /* ------------------------------ 写入 ------------------------------ */

  async ingest(user: AuthUser, body: unknown): Promise<OpsIngestResult> {
    const inputs = validateBatch(body)
    const at = new Date().toISOString()
    const added = inputs.map((input, i) => normalize(input, user, at, i))

    // 追加 + 裁剪在仓储内原子完成：不再先读整表再写回，避免并发上报互相覆盖。
    const result = await this.repo.append(added, OPS_EVENT_LIMIT)
    return { accepted: added.length, total: result.total, dropped: result.dropped }
  }

  /* ------------------------------ 查询 ------------------------------ */

  async list(query: OpsListQuery = {}): Promise<{ items: OpsEvent[]; total: number }> {
    const type = parseType(query.type)
    const pageId = parsePageId(query.pageId)
    const since = parseSince(query.since)
    const limit = parseLimit(query.limit)

    const all = await this.repo.list()
    const filtered = all.filter(
      (e) =>
        (!type || e.type === type) &&
        (!pageId || e.pageId === pageId) &&
        (!since || e.at >= since),
    )
    // 倒序（新 → 旧），分页只做 limit（运维排查不需要 offset 游标）
    return { items: filtered.slice().reverse().slice(0, limit), total: filtered.length }
  }

  async summary(query: OpsListQuery = {}): Promise<OpsSummary> {
    const pageId = parsePageId(query.pageId)
    const since = parseSince(query.since)
    const all = await this.repo.list()
    const filtered = all.filter(
      (e) => (!pageId || e.pageId === pageId) && (!since || e.at >= since),
    )

    const byType: Record<OpsEventType, number> = { error: 0, perf: 0, event: 0 }
    const durations: number[] = []
    let lastErrorAt: string | null = null

    for (const e of filtered) {
      byType[e.type] += 1
      if (e.type === 'perf' && typeof e.durationMs === 'number' && Number.isFinite(e.durationMs)) {
        durations.push(e.durationMs)
      }
      if (e.type === 'error') lastErrorAt = e.at // 正序遍历，最后一次赋值即最新
    }

    durations.sort((a, b) => a - b)
    const count = durations.length
    const sum = durations.reduce((acc, v) => acc + v, 0)

    return {
      total: filtered.length,
      byType,
      errors: { total: byType.error, lastAt: lastErrorAt },
      perf: {
        count,
        avgMs: count === 0 ? 0 : Math.round((sum / count) * 100) / 100,
        p95Ms: count === 0 ? 0 : durations[Math.min(count - 1, Math.ceil(count * 0.95) - 1)],
        maxMs: count === 0 ? 0 : durations[count - 1],
      },
      lastAt: filtered.length === 0 ? null : filtered[filtered.length - 1].at,
    }
  }
}

/* ------------------------------------------------------------------ */
/* 校验与归一化（导出便于单测）                                          */
/* ------------------------------------------------------------------ */

/** 批量结构校验；结构性错误汇总成一条 400（最多列 3 处，避免响应体爆炸） */
export function validateBatch(body: unknown): OpsEventInput[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('请求体必须为 { events: [...] }')
  }
  const events = (body as { events?: unknown }).events
  if (!Array.isArray(events)) throw invalid('events 必须为数组')
  if (events.length === 0) throw invalid('events 不能为空')
  if (events.length > OPS_BATCH_MAX) throw invalid(`单次最多上报 ${OPS_BATCH_MAX} 条`)

  const issues: string[] = []
  events.forEach((raw, i) => {
    const issue = validateOne(raw)
    if (issue) issues.push(`events[${i}]: ${issue}`)
  })
  if (issues.length > 0) throw invalid(issues.slice(0, 3).join('；'))
  return events as OpsEventInput[]
}

function validateOne(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '必须是对象'
  const e = raw as Record<string, unknown>

  if (typeof e.type !== 'string' || !TYPES.includes(e.type as OpsEventType)) {
    return `type 必须为 ${TYPES.join('/')}`
  }
  if (typeof e.name !== 'string' || e.name.trim().length === 0) return 'name 不能为空'
  if (e.name.trim().length > NAME_MAX) return `name 超过 ${NAME_MAX} 字符`
  if (e.pageId !== undefined && (typeof e.pageId !== 'string' || !SAFE_ID_RE.test(e.pageId))) {
    return 'pageId 格式非法'
  }
  if (
    e.pageVersion !== undefined &&
    e.pageVersion !== 'draft' &&
    !(typeof e.pageVersion === 'number' && Number.isInteger(e.pageVersion) && e.pageVersion >= 0)
  ) {
    return 'pageVersion 必须为非负整数或 "draft"'
  }
  if (e.source !== undefined && (typeof e.source !== 'string' || !SOURCES.includes(e.source as OpsSource))) {
    return `source 必须为 ${SOURCES.join('/')}`
  }
  if (e.detail !== undefined && (!e.detail || typeof e.detail !== 'object' || Array.isArray(e.detail))) {
    return 'detail 必须为对象'
  }
  if (e.message !== undefined && typeof e.message !== 'string') return 'message 必须为字符串'
  if (e.durationMs !== undefined && (typeof e.durationMs !== 'number' || !Number.isFinite(e.durationMs))) {
    return 'durationMs 必须为有限数字'
  }
  if (e.type === 'perf') {
    if (typeof e.durationMs !== 'number') return 'perf 事件必须带 durationMs'
    if (e.durationMs < 0 || e.durationMs > DURATION_MAX) return `durationMs 超出 [0, ${DURATION_MAX}]`
  }
  if (e.type === 'error' && typeof e.message !== 'string') return 'error 事件必须带 message'
  return null
}

function normalize(input: OpsEventInput, user: AuthUser, at: string, seq: number): OpsEvent {
  const id = `evt_${randomUUID()}`
  const event: OpsEvent = {
    id,
    type: input.type,
    name: input.name.trim(),
    source: input.source ?? 'runtime',
    userId: user.sub,
    at,
  }
  if (input.pageId !== undefined) event.pageId = input.pageId
  if (input.pageVersion !== undefined) event.pageVersion = input.pageVersion
  if (input.message !== undefined) event.message = truncate(input.message, MESSAGE_MAX)
  if (input.durationMs !== undefined) event.durationMs = input.durationMs
  if (input.detail !== undefined) event.detail = shrinkDetail(input.detail)

  // seq 仅用于保证同毫秒内 id 不冲突的语义说明（randomUUID 已足够），保留参数便于将来换序列实现
  void seq
  return event
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** detail 序列化超限 → 存截断预览（保留可读性，也保证单条体积可控） */
function shrinkDetail(detail: Record<string, unknown>): Record<string, unknown> {
  let json: string
  try {
    json = JSON.stringify(detail)
  } catch {
    return { truncated: true, reason: '循环引用或不可序列化' }
  }
  if (json.length <= OPS_DETAIL_MAX) return detail
  return { truncated: true, preview: truncate(json, OPS_DETAIL_MAX) }
}

/* ------------------------------------------------------------------ */
/* 查询参数解析                                                         */
/* ------------------------------------------------------------------ */

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: 'OPS_INVALID', message })
}

function parseType(raw: string | undefined): OpsEventType | undefined {
  if (raw === undefined || raw === '') return undefined
  if (!TYPES.includes(raw as OpsEventType)) throw invalid(`type 必须为 ${TYPES.join('/')}`)
  return raw as OpsEventType
}

function parsePageId(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === '') return undefined
  if (!SAFE_ID_RE.test(raw)) throw invalid('pageId 格式非法')
  return raw
}

function parseSince(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === '') return undefined
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) throw invalid('since 必须为 ISO 时间')
  return d.toISOString()
}

function parseLimit(raw: string | number | undefined): number {
  if (raw === undefined || raw === '') return LIST_DEFAULT
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) throw invalid('limit 必须为数字')
  return Math.min(LIST_MAX, Math.max(1, Math.floor(n)))
}
