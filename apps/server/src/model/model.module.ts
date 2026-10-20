/**
 * 数据模型模块：元数据定义 + 业务记录动态 CRUD（方案 8.2 `model/`，存储走 8.5-B JSON 起步）。
 * 引入 IdentityModule 以获得导出的 JwtService（AuthGuard 依赖）；
 * 引入 RbacModule（批 6：records 四接口的 ③ CRUD 权限与 ④ 行级 dataScope 强制）。
 */
import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { FlowModule } from '../flow/flow.module.js'
import { ModelController } from './model.controller.js'
import { RecordController } from './record.controller.js'
import { ModelService } from './model.service.js'
import { RecordService } from './record.service.js'
import { FileModelRepository } from './file-model.repository.js'
import { MODEL_REPOSITORY } from './model.types.js'

/**
 * 批 1（D-P3-3）：`RECORD_REPOSITORY` 提升到 @Global StorageModule（FlowService 回写同源单实例）；
 * `imports FlowModule` —— 记录提交后联动启动流程实例（单向，防循环）。
 */
@Module({
  imports: [IdentityModule, RbacModule, FlowModule],
  controllers: [ModelController, RecordController],
  providers: [ModelService, RecordService, { provide: MODEL_REPOSITORY, useClass: FileModelRepository }],
})
export class ModelModule {}
