/**
 * Bearer 令牌守卫：解析 `Authorization: Bearer <jwt>` 并挂载 req.user。
 *
 * 挂载方式：按路由 `@UseGuards(AuthGuard)` 应用（登录与校验接口之外全部保护），
 * 而非全局守卫 —— 骨架阶段少一层 Reflector 反射依赖，语义同样清晰。
 */
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, type AuthUser } from './jwt.service.js'

/** 携带登录态的请求形状（骨架阶段自定义，避免服务端强依赖 express 类型） */
export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>
  user?: AuthUser
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>()

    const raw = req.headers.authorization
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '缺少 Authorization: Bearer <token>' })
    }

    const m = /^Bearer\s+(\S+)$/i.exec(raw.trim())
    if (!m) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authorization 头必须为 Bearer <token>' })
    }

    req.user = this.jwt.verify(m[1])
    return true
  }
}
