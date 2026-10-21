/**
 * RBAC 模块（批 6）：角色/页面授权配置 + 四层权限判定（单一事实源）。
 * 对外导出 RbacService —— identity（login +perms）、page（schema 守卫）、
 * model（records 强制）、apps（bootstrap 过滤）均依赖它。
 * RBAC_REPOSITORY 由全局 StorageModule 按 LC_STORAGE 提供。
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../common/auth.module.js'
import { RbacController } from './rbac.controller.js'
import { RbacService } from './rbac.service.js'

@Module({
  // AuthModule 提供 JwtService —— controller 的 @UseGuards(AuthGuard) 依赖它（否则 DI 崩）
  imports: [AuthModule],
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
