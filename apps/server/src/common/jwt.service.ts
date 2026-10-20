/**
 * JWT（HS256）签发与校验。
 *
 * - 密钥来自环境变量 `LC_JWT_SECRET`（未设置时用开发默认值，生产必须注入）；
 * - 校验固定 `algorithms: ['HS256']`，拒绝算法混淆攻击；
 * - 任何解析失败统一映射为 401，不向客户端泄露内部原因。
 */
import { Injectable, UnauthorizedException } from '@nestjs/common'
// jsonwebtoken 运行时是 CJS：Node ESM 对 CJS 的「具名导出」探测不可靠（冒烟实测 SyntaxError），
// 必须走默认导入；类型用 import type 单独引入，编译期完全擦除。
import jwt from 'jsonwebtoken'
import type { JwtPayload, SignOptions } from 'jsonwebtoken'

/** 登录态声明（JWT payload 的业务部分） */
export interface AuthUser {
  /** 用户 id（JWT sub） */
  sub: string
  username: string
  roles: string[]
}

const DEV_SECRET = 'dev-insecure-secret-please-set-LC_JWT_SECRET'
const TOKEN_TTL = '8h'

@Injectable()
export class JwtService {
  private readonly secret: string

  constructor() {
    this.secret = process.env.LC_JWT_SECRET || DEV_SECRET
  }

  /** 签发访问令牌（默认 8 小时） */
  sign(user: AuthUser, expiresIn: SignOptions['expiresIn'] = TOKEN_TTL): string {
    return jwt.sign({ username: user.username, roles: user.roles }, this.secret, {
      algorithm: 'HS256',
      subject: user.sub,
      expiresIn,
    })
  }

  /** 校验并还原登录态；失败抛 401 */
  verify(token: string): AuthUser {
    let payload: string | JwtPayload
    try {
      payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] })
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '无效或已过期的访问令牌' })
    }

    if (typeof payload === 'string' || !payload.sub || typeof payload.username !== 'string') {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '令牌内容不合法' })
    }

    return {
      sub: String(payload.sub),
      username: payload.username,
      roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
    }
  }
}
