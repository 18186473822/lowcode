/**
 * 存储根目录（全局模块）。
 *
 * `DATA_DIR` 原挂在 PageModule；动态 CRUD（model）与文件模块（file）同样要落盘，
 * 故提升为 `@Global()` 模块 —— AppModule 引入一次、全容器可用，避免三处重复 provider。
 * 默认 `<cwd>/data`，测试/部署用 `LC_DATA_DIR` 覆盖（页面 / 模型 / 记录 / 文件共用同一根）。
 *
 * Phase 3 批 1（D-P3-3）：`RECORD_REPOSITORY` 亦提升至此 —— RecordService（写入路径）与
 * FlowService（setField 回写）都要访问记录，且 FlowModule ⇄ ModelModule 互相 imports 会成环；
 * 提升到 @Global 后两侧各自注入、**单实例共享**（文件仓 read-modify-write 不分裂），
 * 依赖方向固定为 `ModelModule → FlowModule` 单向。`model/` 类型与实现上提至此属层次妥协，
 * 以本注释与 D-P3-3 记录为准。
 */
import { Global, Module } from '@nestjs/common'
import path from 'node:path'
import { DATA_DIR } from './tokens.js'
import { FileRecordRepository } from '../model/file-record.repository.js'
import { RECORD_REPOSITORY } from '../model/model.types.js'

@Global()
@Module({
  providers: [
    {
      provide: DATA_DIR,
      useFactory: () => process.env.LC_DATA_DIR ?? path.join(process.cwd(), 'data'),
    },
    { provide: RECORD_REPOSITORY, useClass: FileRecordRepository },
  ],
  exports: [DATA_DIR, RECORD_REPOSITORY],
})
export class StorageModule {}
