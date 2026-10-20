/**
 * 身份模块：登录、令牌签发、用户种子。
 * 对外导出 AuthModule（JwtService）—— 页面/模型模块的 AuthGuard 依赖它。
 * 批 6：login 响应下发 perms（角色权限点并集），供运行时会话与 hasPerm 判定。
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../common/auth.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { UserStore } from './user.store.js'

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AuthController],
  providers: [UserStore, AuthService],
  exports: [AuthModule],
})
export class IdentityModule {}
