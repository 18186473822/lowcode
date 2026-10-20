/**
 * 数据模型接口（方案 8.3，全部需 Bearer 令牌）：
 *
 * ```
 * GET /api/v1/models        模型摘要列表
 * GET /api/v1/models/:id    完整定义
 * PUT /api/v1/models/:id    保存定义（upsert 建档，服务端再校验一次）
 * ```
 * 记录（records）四个接口在 RecordController。
 */
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import type { AuthUser } from '../common/jwt.service.js'
import { ModelService } from './model.service.js'

@Controller('models')
@UseGuards(AuthGuard)
export class ModelController {
  constructor(@Inject(ModelService) private readonly svc: ModelService) {}

  @Get()
  list() {
    return this.svc.listSummaries()
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id)
  }

  @Put(':id')
  save(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    return this.svc.save(id, body, this.user(req))
  }

  /** 守卫已挂载 req.user；此处兜底，防止未来重构漏挂守卫导致 undefined 泄漏 */
  private user(req: AuthedRequest): AuthUser {
    if (!req.user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '缺少登录态' })
    }
    return req.user
  }
}
