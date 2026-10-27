/**
 * 安全审计模块（2026-10-27）：
 * - `AuditService` 记录登录失败 / 401 / 403 / 429，并提供管理员查询；
 * - `AuditMiddleware` 在 AppModule 中挂到响应链（早于限流，才能捕获 429）；
 * - `AUDIT_REPOSITORY` 由全局 StorageModule 按 LC_STORAGE 提供（JSON / MySQL）。
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../common/auth.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { AuditController } from './audit.controller.js'
import { AuditMiddleware } from './audit.middleware.js'
import { AuditService } from './audit.service.js'

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AuditController],
  providers: [AuditService, AuditMiddleware],
  exports: [AuditService, AuditMiddleware],
})
export class AuditModule {}
