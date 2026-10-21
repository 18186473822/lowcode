/**
 * 用户存储（JSON 模式：内存实现，进程重启即重置）。
 *
 * MySQL 模式由 `MysqlUserRepository` 替换；AuthService 只依赖
 * `UserRepository.findByUsername` 契约，不感知存储实现。
 *
 * 种子账号（仅限开发环境）：
 *   admin / admin123        平台管理员
 *   designer / designer123  设计器用户
 */
import { Injectable } from '@nestjs/common'
import { hashPassword } from '../common/password.js'
import type { StoredUser, UserRepository } from './user.types.js'

@Injectable()
export class UserStore implements UserRepository {
  private readonly byUsername = new Map<string, StoredUser>()

  constructor() {
    this.seed('u_admin', 'admin', '平台管理员', ['admin'], 'admin123')
    this.seed('u_designer', 'designer', '设计器用户', ['designer'], 'designer123')
  }

  private seed(
    id: string,
    username: string,
    displayName: string,
    roles: string[],
    password: string,
  ): void {
    this.byUsername.set(username, {
      id,
      username,
      displayName,
      roles,
      passwordHash: hashPassword(password),
      status: 'active',
    })
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    return this.byUsername.get(username) ?? null
  }
}
