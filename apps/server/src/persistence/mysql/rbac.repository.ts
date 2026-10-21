/**
 * RBAC 配置仓储的 MySQL 实现（Phase 4 数据库第一批）。
 *
 * 与 JSON 版共用 `seedRbacConfig()` 首启兜底；角色落 `roles`，页面白名单落
 * `rbac_page_grants`。`save` 用事务做增量 upsert + 删除已移除项，避免全删全建
 * 期间短暂清空角色导致用户登录权限抖动。
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import {
  seedRbacConfig,
  type RbacConfig,
  type RbacRepository,
  type RoleRecord,
} from '../../rbac/rbac.types.js'

function mapRole(row: { key: string; name: string; perms: Prisma.JsonValue }): RoleRecord {
  return {
    key: row.key,
    name: row.name,
    perms: Array.isArray(row.perms)
      ? row.perms.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

export class MysqlRbacRepository implements RbacRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async load(): Promise<RbacConfig> {
    const [roles, grants] = await Promise.all([
      this.prisma.role.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.rbacPageGrant.findMany({ orderBy: { pageId: 'asc' } }),
    ])

    if (roles.length === 0 && grants.length === 0) return seedRbacConfig()

    const pages: Record<string, string[]> = {}
    for (const grant of grants) {
      pages[grant.pageId] = Array.isArray(grant.roles)
        ? grant.roles.filter((item): item is string => typeof item === 'string')
        : []
    }
    return { roles: roles.map(mapRole), pages }
  }

  async save(config: RbacConfig): Promise<void> {
    const roleKeys = config.roles.map((role) => role.key)
    const pageIds = Object.keys(config.pages)

    await this.prisma.$transaction(async (tx) => {
      if (roleKeys.length === 0) {
        await tx.role.deleteMany()
      } else {
        await tx.role.deleteMany({ where: { key: { notIn: roleKeys } } })
      }

      for (const role of config.roles) {
        const data = {
          name: role.name,
          perms: role.perms as unknown as Prisma.InputJsonValue,
        }
        await tx.role.upsert({
          where: { key: role.key },
          create: { key: role.key, ...data },
          update: data,
        })
      }

      if (pageIds.length === 0) {
        await tx.rbacPageGrant.deleteMany()
      } else {
        await tx.rbacPageGrant.deleteMany({ where: { pageId: { notIn: pageIds } } })
      }

      for (const [pageId, roles] of Object.entries(config.pages)) {
        const data = { roles: roles as unknown as Prisma.InputJsonValue }
        await tx.rbacPageGrant.upsert({
          where: { pageId },
          create: { pageId, ...data },
          update: data,
        })
      }
    })
  }
}
