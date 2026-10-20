/**
 * 流程模块（Phase 3 批 1 / D-P3-1 轻量状态机）。
 *
 * 依赖方向（D-P3-3 防循环）：
 * - `RECORD_REPOSITORY` 已提升到 `@Global` StorageModule —— 本模块与 ModelModule 各自可用、单实例；
 * - **本模块不 import ModelModule**：setField 回写直接经全局 RecordRepository；
 * - ModelModule **imports 本模块**（RecordService 提交后调 FlowService.onRecordCreated）。
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../common/auth.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { FlowController } from './flow.controller.js'
import { FlowService } from './flow.service.js'
import { FileFlowRepository } from './file-flow.repository.js'
import { FLOW_REPOSITORY } from './flow.types.js'

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [FlowController],
  providers: [FlowService, { provide: FLOW_REPOSITORY, useClass: FileFlowRepository }],
  exports: [FlowService],
})
export class FlowModule {}
