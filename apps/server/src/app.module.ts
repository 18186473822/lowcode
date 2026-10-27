/**
 * 应用根模块（方案 8.2：identity + page + model + file，其余模块 Phase 1 后起）。
 *
 * - `StorageModule` 为 @Global 存储根目录（DATA_DIR），提供一次全容器可用；
 * - `reflect-metadata` 必须先于任何装饰器求值 —— 放在本文件首个 import，
 *   这样 main.ts 与测试都经由 AppModule 加载时元数据多 polyfill 已就绪。
 */
import 'reflect-metadata'
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { HealthController } from './common/health.controller.js'
import { RequestObservabilityMiddleware } from './common/observability.js'
import { RateLimitMiddleware } from './common/rate-limit.js'
import { StorageModule } from './common/storage.module.js'
import { IdentityModule } from './identity/identity.module.js'
import { PageModule } from './page/page.module.js'
import { ModelModule } from './model/model.module.js'
import { FileModule } from './file/file.module.js'
import { RbacModule } from './rbac/rbac.module.js'
import { FlowModule } from './flow/flow.module.js'
import { OpsModule } from './ops/ops.module.js'
import { OpenModule } from './open/open.module.js'
import { WebhookModule } from './webhook/webhook.module.js'
import { MarketModule } from './market/market.module.js'
import { AuditModule } from './audit/audit.module.js'
import { AuditMiddleware } from './audit/audit.middleware.js'

@Module({
  imports: [StorageModule, RbacModule, IdentityModule, PageModule, ModelModule, FileModule, FlowModule, OpsModule, OpenModule, WebhookModule, MarketModule, AuditModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 顺序：请求 ID/访问日志 → 安全审计 → 限流。
    // 审计必须早于限流，才能捕获限流中间件直接返回的 429。
    consumer.apply(RequestObservabilityMiddleware, AuditMiddleware, RateLimitMiddleware).forRoutes('*')
  }
}
