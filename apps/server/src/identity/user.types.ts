/** 用户仓储契约：内存种子（JSON 模式）与 MySQL 实现共用。 */
export interface StoredUser {
  id: string
  username: string
  displayName: string
  roles: string[]
  passwordHash: string
  status: 'active' | 'disabled'
}

export interface UserRepository {
  findByUsername(username: string): Promise<StoredUser | null>
}

export const USER_REPOSITORY = 'LC:USER_REPOSITORY'
