/**
 * 文件接口（方案 8.3）：
 *
 * ```
 * POST /api/v1/files/upload    上传（multipart 字段名 file，Bearer 令牌）→ { fileId, url, ... }
 * GET  /api/v1/files/:fileId   读取字节（**公开**，见下）
 * ```
 *
 * 读取不挂 AuthGuard：`<image src>` / uni.uploadFile 拉取静态资源无法携带 Authorization 头，
 * 文件 url 视为公开只读（企业内网 Phase 1 可接受；鉴权直传对接 OSS 属 Phase 2 —— 台账登记）。
 *
 * POST 显式 `@HttpCode(200)` 固化契约（B-16）；文件超 10MB 由 multer 报 LIMIT_FILE_SIZE → 413。
 */
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import type { AuthUser } from '../common/jwt.service.js'
import { FileService, MAX_FILE_SIZE, type UploadedFileLike } from './file.service.js'

@Controller('files')
export class FileController {
  constructor(@Inject(FileService) private readonly svc: FileService) {}

  @Post('upload')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      // busboy 默认按 latin1 解码文件名参数 → 中文名乱码；显式 utf8（浏览器/uni 上传的原始 UTF-8 字节）
      defParamCharset: 'utf8',
    }),
  )
  upload(@UploadedFile() file: UploadedFileLike | undefined, @Req() req: AuthedRequest) {
    return this.svc.save(file, this.user(req))
  }

  @Get(':fileId')
  async download(@Param('fileId') fileId: string): Promise<StreamableFile> {
    const { meta, data } = await this.svc.read(fileId)
    return new StreamableFile(data, { type: meta.mimeType })
  }

  /** 守卫已挂载 req.user；此处兜底，防止未来重构漏挂守卫导致 undefined 泄漏 */
  private user(req: AuthedRequest): AuthUser {
    if (!req.user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '缺少登录态' })
    }
    return req.user
  }
}
