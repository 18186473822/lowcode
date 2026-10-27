/**
 * 物料市场模块（Phase 4 开放集成第三批）。
 *
 * 依赖方向：
 * - `MarketRepository` 由 @Global StorageModule 按 `LC_STORAGE` 注入（JSON / MySQL）；
 * - `RbacService` 只用于管理员判定（`*` 权限点）；
 * - 两个 controller 分开：清单公钥/清单公开，其余统一 Bearer。
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../common/auth.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { MarketController, MarketManifestController } from './market.controller.js'
import { MarketService } from './market.service.js'

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [MarketManifestController, MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
