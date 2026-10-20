/**
 * 认证基础模块：仅承载 JwtService（AuthGuard 的依赖）。
 *
 * 独立成模块的原因（批 6）：JwtService 此前由 IdentityModule 提供，
 * 但 RbacController 也要 AuthGuard（依赖 JwtService），而 IdentityModule
 * 又要 import RbacModule（login 下发 perms）—— 会成环。
 * 抽出 AuthModule 后：Identity/Rbac 各自 import AuthModule，无环。
 * IdentityModule 再导出本模块，PageModule/ModelModule 的既有引入不受影响。
 */
import { Module } from '@nestjs/common'
import { JwtService } from './jwt.service.js'

@Module({
  providers: [JwtService],
  exports: [JwtService],
})
export class AuthModule {}
