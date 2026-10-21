/**
 * 用户仓储的 MySQL 实现（Phase 4 数据库第一批）。
 *
 * 只读取登录所需字段；角色来自 `user_roles → roles`，与 JSON 模式 `UserStore`
 * 的 `StoredUser` 形状保持一致。写用户/角色由 seed 脚本或后续管理接口负责。
 */
import type { PrismaClient } from '@prisma/client'
import type { StoredUser, UserRepository } from '../../identity/user.types.js'

export class MysqlUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUsername(username: string): Promise<StoredUser | null> {
    const row = await this.prisma.user.findUnique({
      where: { username },
      include: {
        roles: { orderBy: { roleKey: 'asc' } },
      },
    })
    if (!row) return null

    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      roles: row.roles.map((item) => item.roleKey),
      passwordHash: row.passwordHash,
      status: row.status === 'active' ? 'active' : 'disabled',
    }
  }
}
