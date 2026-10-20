/**
 * 认证服务：口令校验 + 令牌签发。
 *
 * 安全约定：「用户不存在」与「口令错误」返回**同一个**错误码与文案（INVALID_CREDENTIALS），
 * 防止用户名枚举。
 */
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, type AuthUser } from '../common/jwt.service.js'
import { verifyPassword } from '../common/password.js'
import { RbacService } from '../rbac/rbac.service.js'
import { UserStore } from './user.store.js'

export interface LoginResult {
  accessToken: string
  tokenType: 'Bearer'
  /** 令牌有效期（秒） */
  expiresIn: number
  /** 批 6：用户权限点（角色 perms 并集；'*' 通配），登录即得供运行时会话/hasPerm */
  perms: string[]
  user: {
    id: string
    username: string
    displayName: string
    roles: string[]
  }
}

const TTL_SECONDS = 8 * 3600

@Injectable()
export class AuthService {
  constructor(
    @Inject(UserStore) private readonly users: UserStore,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(RbacService) private readonly rbac: RbacService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const user = this.users.findByUsername(username)

    if (!user || user.status !== 'active' || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '用户名或密码错误' })
    }

    const auth: AuthUser = { sub: user.id, username: user.username, roles: user.roles }

    return {
      accessToken: this.jwt.sign(auth, '8h'),
      tokenType: 'Bearer',
      expiresIn: TTL_SECONDS,
      perms: await this.rbac.grantedPerms(auth),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roles: user.roles,
      },
    }
  }
}
