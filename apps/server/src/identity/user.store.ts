/**
 * 用户存储（骨架阶段为内存实现，进程重启即重置）。
 *
 * Phase 1 切换为 identity 数据表 + RBAC 表，届时仅替换本类实现，
 * AuthService 依赖的是 `findByUsername` 这一契约，不受影响。
 *
 * 种子账号（仅限开发环境）：
 *   admin / admin123        平台管理员
 *   designer / designer123  设计器用户
 */
import { Injectable } from '@nestjs/common'
import { hashPassword } from '../common/password.js'

export interface StoredUser {
  id: string
  username: string
  displayName: string
  roles: string[]
  passwordHash: string
  status: 'active' | 'disabled'
}

@Injectable()
export class UserStore {
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

  findByUsername(username: string): StoredUser | null {
    return this.byUsername.get(username) ?? null
  }
}
