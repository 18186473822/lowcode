/**
 * Webhook 模块（Phase 4 开放集成第二批）。
 *
 * 依赖方向：
 * - `WebhookRepository` 由 @Global StorageModule 按 `LC_STORAGE` 注入（JSON / MySQL）；
 * - ModelModule / FlowModule 单向 import 本模块并调用 `WebhookService.emit()`，本模块不反向依赖业务模块，避免环；
 * - 控制器用 AuthGuard + RbacService 双重校验：先登录，再要求 `*` 管理员权限。
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../common/auth.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { WebhookController } from './webhook.controller.js'
import { WebhookService } from './webhook.service.js'

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
