/**
 * 业务记录接口（方案 8.3 动态 CRUD，全部需 Bearer 令牌）：
 *
 * ```
 * POST   /api/v1/models/:modelId/records          新增（sanitize + 服务端再校验）
 * GET    /api/v1/models/:modelId/records          查询（filter/sort/page）
 * PUT    /api/v1/models/:modelId/records/:rid     更新（合并后整体再校验）
 * DELETE /api/v1/models/:modelId/records/:rid     删除（软删）
 * ```
 *
 * POST 显式 `@HttpCode(200)` —— 固化契约，避免 Nest 默认 201（B-16 教训）。
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import type { AuthUser } from '../common/jwt.service.js'
import { makeEtag } from '../common/etag.js'
import { RecordService, type ListQuery } from './record.service.js'

@Controller('models/:modelId/records')
@UseGuards(AuthGuard)
export class RecordController {
  constructor(@Inject(RecordService) private readonly svc: RecordService) {}

  @Post()
  @HttpCode(200)
  async create(
    @Param('modelId') modelId: string,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ) {
    const created = await this.svc.create(modelId, body, this.user(req))
    res.setHeader('ETag', makeEtag('record', `${modelId}/${String(created.id)}`, Number(created.revision ?? 0)))
    return created
  }

  @Get()
  list(@Param('modelId') modelId: string, @Query() query: ListQuery, @Req() req: AuthedRequest) {
    return this.svc.list(modelId, query, this.user(req))
  }

  @Put(':rid')
  async update(
    @Param('modelId') modelId: string,
    @Param('rid') rid: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ) {
    const updated = await this.svc.update(modelId, rid, body, this.user(req), ifMatch)
    res.setHeader('ETag', makeEtag('record', `${modelId}/${rid}`, Number(updated.revision ?? 0)))
    return updated
  }

  @Delete(':rid')
  @HttpCode(200)
  async remove(
    @Param('modelId') modelId: string,
    @Param('rid') rid: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ) {
    const removed = await this.svc.remove(modelId, rid, this.user(req), ifMatch)
    res.setHeader('ETag', makeEtag('record', `${modelId}/${rid}`, removed.revision))
    return removed
  }

  /** 守卫已挂载 req.user；此处兜底，防止未来重构漏挂守卫导致 undefined 泄漏 */
  private user(req: AuthedRequest): AuthUser {
    if (!req.user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '缺少登录态' })
    }
    return req.user
  }
}
