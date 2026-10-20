/**
 * RBAC 模块（批 6）：角色/页面授权配置 + 四层权限判定（单一事实源）。
 * 对外导出 RbacService —— identity（login +perms）、page（schema 守卫）、
 * model（records 强制）、apps（bootstrap 过滤）均依赖它。
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../common/auth.module.js'
import { RbacController } from './rbac.controller.js'
import { RbacService } from './rbac.service.js'
import { FileRbacRepository } from './file-rbac.repository.js'
import { RBAC_REPOSITORY } from './rbac.types.js'

@Module({
  // AuthModule 提供 JwtService —— controller 的 @UseGuards(AuthGuard) 依赖它（否则 DI 崩）
  imports: [AuthModule],
  controllers: [RbacController],
  providers: [RbacService, { provide: RBAC_REPOSITORY, useClass: FileRbacRepository }],
  exports: [RbacService],
})
export class RbacModule {}
