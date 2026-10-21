/**
 * 页面仓储的 MySQL 实现（Phase 4 数据库第一批）。
 *
 * `pages` + `page_versions` 按方案 8.4 拆表；仓储对外仍返回合并视图 `PageRecord`，
 * 因此 PageService / 设计器接口契约零改动。写入在一个事务内完成：
 * upsert 页面行 → 删除旧版本 → 批量插入当前版本，避免出现半更新状态。
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import type { PageSchema } from '@lc/schema'
import type { PageRecord, PageRepository, PageStatus, PageVersionRecord } from '../../page/page.types.js'

/** 页面 id 白名单（与 JSON 仓储 / service 层一致） */
const SAFE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

type PageWithVersions = Prisma.PageGetPayload<{ include: { versions: true } }>

function mapVersion(version: PageWithVersions['versions'][number]): PageVersionRecord {
  return {
    version: version.version,
    schema: version.schemaJson as unknown as PageSchema,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    ...(version.note === null ? {} : { note: version.note }),
  }
}

function mapPage(row: PageWithVersions): PageRecord {
  return {
    id: row.id,
    appId: row.appId,
    name: row.name,
    type: row.type,
    status: (row.status === 'published' ? 'published' : 'draft') as PageStatus,
    currentVersion: row.currentVersion,
    draft: row.draft as PageSchema | null,
    ...(row.draftUpdatedAt === null ? {} : { draftUpdatedAt: row.draftUpdatedAt.toISOString() }),
    ...(row.draftUpdatedBy === null ? {} : { draftUpdatedBy: row.draftUpdatedBy }),
    versions: row.versions.map(mapVersion),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function pageData(record: PageRecord) {
  return {
    appId: record.appId,
    name: record.name,
    type: record.type,
    status: record.status,
    currentVersion: record.currentVersion,
    draft:
      record.draft === null
        ? Prisma.DbNull
        : (record.draft as unknown as Prisma.InputJsonValue),
    draftUpdatedAt: record.draftUpdatedAt ? new Date(record.draftUpdatedAt) : null,
    draftUpdatedBy: record.draftUpdatedBy ?? null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }
}

export class MysqlPageRepository implements PageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(id: string): Promise<PageRecord | null> {
    if (!SAFE_ID_RE.test(id)) return null

    const row = await this.prisma.page.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'asc' } } },
    })
    return row ? mapPage(row) : null
  }

  async list(): Promise<PageRecord[]> {
    const rows = await this.prisma.page.findMany({
      include: { versions: { orderBy: { version: 'asc' } } },
      orderBy: { id: 'asc' },
    })
    return rows.map(mapPage)
  }

  async save(record: PageRecord): Promise<void> {
    if (!SAFE_ID_RE.test(record.id)) {
      throw new Error(`非法页面 id：${record.id}`)
    }

    const data = pageData(record)
    await this.prisma.$transaction(async (tx) => {
      await tx.page.upsert({
        where: { id: record.id },
        create: { id: record.id, ...data },
        update: data,
      })

      await tx.pageVersion.deleteMany({ where: { pageId: record.id } })
      if (record.versions.length > 0) {
        await tx.pageVersion.createMany({
          data: record.versions.map((version) => ({
            pageId: record.id,
            version: version.version,
            schemaJson: version.schema as unknown as Prisma.InputJsonValue,
            createdBy: version.createdBy,
            createdAt: new Date(version.createdAt),
            note: version.note ?? null,
          })),
        })
      }
    })
  }

  async remove(id: string): Promise<boolean> {
    if (!SAFE_ID_RE.test(id)) return false
    const result = await this.prisma.page.deleteMany({ where: { id } })
    return result.count > 0
  }
}
