/**
 * 文件模块：上传与读取（方案 8.2 `file/` 模块裁剪）。
 * 引入 IdentityModule 以获得导出的 JwtService（AuthGuard 依赖）。
 */
import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module.js'
import { FileController } from './file.controller.js'
import { FileService } from './file.service.js'

@Module({
  imports: [IdentityModule],
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
