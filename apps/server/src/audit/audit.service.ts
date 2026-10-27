/**
 * 安全审计服务：记录拒绝类安全事件 + 管理员查询。
 *
 * 写入是**旁路**：`record` 永不抛出，存储失败只打 warning，避免审计把登录/业务请求带崩。
 * 归一化在这里做（截断长度、剥离查询串），保证两个仓储拿到的形状一致。
 */
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import {
  AUDIT_LIST_DEFAULT,
  AUDIT_LIST_MAX,
  AUDIT_REPOSITORY,
  type AuditEvent,
  type AuditEventInput,
  type AuditEventType,
  type AuditListQuery,
  type AuditListResult,
  type AuditRepository,
} from './audit.types.js'

const TYPES: readonly AuditEventType[] = ['login_failed', 'unauthorized', 'forbidden', 'rate_limited']
const USERNAME_MAX = 64
const IP_MAX = 64
const METHOD_MAX = 8
const PATH_MAX = 512
const CODE_MAX = 64
const UA_MAX = 256

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(@Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository) {}

  /** 记录一条拒绝事件；任何异常都吞掉（旁路，不影响原请求）。 */
  async record(input: AuditEventInput): Promise<void> {
    try {
      const event: AuditEvent = {
        id: randomUUID(),
        at: new Date().toISOString(),
        type: input.type,
        ip: truncate(input.ip, IP_MAX) || 'unknown',
        method: truncate(input.method, METHOD_MAX).toUpperCase(),
        path: truncate(stripQuery(input.path), PATH_MAX),
        status: input.status,
        ...(input.username ? { username: truncate(input.username, USERNAME_MAX) } : {}),
        ...(input.code ? { code: truncate(input.code, CODE_MAX) } : {}),
        ...(input.userAgent ? { userAgent: truncate(input.userAgent, UA_MAX) } : {}),
      }
      await this.repo.append(event)
    } catch (error) {
      this.logger.warn(`安全审计写入失败：${(error as Error).message}`)
    }
  }

  /** 管理员查询：按 type / username / since 过滤；新 → 旧。 */
  async list(query: AuditListQuery = {}): Promise<AuditListResult> {
    const type = parseType(query.type)
    const username = parseUsername(query.username)
    const since = parseSince(query.since)
    const limit = parseLimit(query.limit)

    const all = await this.repo.list()
    const filtered = all.filter(
      (e) =>
        (!type || e.type === type) &&
        (!username || e.username === username) &&
        (!since || e.at >= since),
    )
    return { items: filtered.slice().reverse().slice(0, limit), total: filtered.length }
  }
}

function stripQuery(path: string): string {
  return path.split('?')[0] ?? path
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: 'AUDIT_INVALID', message })
}

function parseType(raw: string | undefined): AuditEventType | undefined {
  if (raw === undefined || raw === '') return undefined
  if (!TYPES.includes(raw as AuditEventType)) throw invalid(`type 必须为 ${TYPES.join('/')}`)
  return raw as AuditEventType
}

function parseUsername(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === '') return undefined
  if (raw.length > USERNAME_MAX) throw invalid(`username 超过 ${USERNAME_MAX} 字符`)
  return raw
}

function parseSince(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === '') return undefined
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) throw invalid('since 必须为 ISO 时间')
  return d.toISOString()
}

function parseLimit(raw: string | number | undefined): number {
  if (raw === undefined || raw === '') return AUDIT_LIST_DEFAULT
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) throw invalid('limit 必须为数字')
  return Math.min(AUDIT_LIST_MAX, Math.max(1, Math.floor(n)))
}
