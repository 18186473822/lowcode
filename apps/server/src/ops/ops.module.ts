/**
 * 运维模块（Phase 3 批 5 / D-P3-12）。
 *
 * 依赖方向：`AuthModule`（JwtService）+ `RbacModule`（管理员判定）+ 全局 `StorageModule`（DATA_DIR）。
 * 本模块不依赖 page / model / flow —— 埋点只存「现场快照」，不反查业务实体。
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../common/auth.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { OpsController } from './ops.controller.js'
import { OpsService } from './ops.service.js'

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [OpsController],
  // OPS_REPOSITORY 由全局 StorageModule 按 LC_STORAGE 提供（JSON / MySQL）。
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
