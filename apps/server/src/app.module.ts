/**
 * 应用根模块（方案 8.2：identity + page + model + file，其余模块 Phase 1 后起）。
 *
 * - `StorageModule` 为 @Global 存储根目录（DATA_DIR），提供一次全容器可用；
 * - `reflect-metadata` 必须先于任何装饰器求值 —— 放在本文件首个 import，
 *   这样 main.ts 与测试都经由 AppModule 加载时元数据多 polyfill 已就绪。
 */
import 'reflect-metadata'
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { RateLimitMiddleware } from './common/rate-limit.js'
import { StorageModule } from './common/storage.module.js'
import { IdentityModule } from './identity/identity.module.js'
import { PageModule } from './page/page.module.js'
import { ModelModule } from './model/model.module.js'
import { FileModule } from './file/file.module.js'
import { RbacModule } from './rbac/rbac.module.js'
import { FlowModule } from './flow/flow.module.js'
import { OpsModule } from './ops/ops.module.js'

@Module({
  imports: [StorageModule, RbacModule, IdentityModule, PageModule, ModelModule, FileModule, FlowModule, OpsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 全部 API 共用限流；登录接口在中间件内额外套更严的 loginMax。
    consumer.apply(RateLimitMiddleware).forRoutes('*')
  }
}
