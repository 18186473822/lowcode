/**
 * Webhook 管理接口（Phase 4 开放集成第二批，全部需 Bearer + 管理员）。
 *
 * ```
 * GET    /api/v1/webhooks                              订阅列表（密钥脱敏）
 * POST   /api/v1/webhooks                              创建订阅（返回完整 secret，仅此一次）
 * GET    /api/v1/webhooks/:id                          订阅详情（密钥脱敏）
 * PUT    /api/v1/webhooks/:id                          更新订阅（If-Match 可选，冲突 409）
 * DELETE /api/v1/webhooks/:id                          删除订阅（投递日志保留）
 * POST   /api/v1/webhooks/:id/rotate-secret            轮换密钥（返回新 secret）
 * POST   /api/v1/webhooks/:id/test                     测试投递（同步发送一次）
 * GET    /api/v1/webhooks/:id/deliveries               投递日志（状态/事件过滤 + 分页）
 * POST   /api/v1/webhooks/deliveries/:deliveryId/retry 手动重投
 * ```
 *
 * 写接口均返回 ETag；`If-Match` 不匹配返回 409 `VERSION_CONFLICT`，不自动覆盖。
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
import { makeEtag } from '../common/etag.js'
import type { AuthUser } from '../common/jwt.service.js'
import { WebhookService } from './webhook.service.js'

type HeaderSink = { setHeader(name: string, value: string): void }

@Controller('webhooks')
@UseGuards(AuthGuard)
export class WebhookController {
  constructor(@Inject(WebhookService) private readonly svc: WebhookService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(this.user(req))
  }

  @Post()
  @HttpCode(200)
  async create(
    @Body() body: unknown,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const created = await this.svc.create(this.user(req), body)
    res.setHeader('ETag', makeEtag('webhook', created.id, created.revision))
    return created
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const subscription = await this.svc.get(this.user(req), id)
    res.setHeader('ETag', makeEtag('webhook', subscription.id, subscription.revision))
    return subscription
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const updated = await this.svc.update(this.user(req), id, body, ifMatch)
    res.setHeader('ETag', makeEtag('webhook', id, updated.revision))
    return updated
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.svc.remove(this.user(req), id, ifMatch)
  }

  @Post(':id/rotate-secret')
  @HttpCode(200)
  async rotateSecret(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const rotated = await this.svc.rotateSecret(this.user(req), id, ifMatch)
    res.setHeader('ETag', makeEtag('webhook', id, rotated.revision))
    return rotated
  }

  @Post(':id/test')
  @HttpCode(200)
  async test(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const delivery = await this.svc.test(this.user(req), id)
    res.setHeader('ETag', makeEtag('webhook-delivery', delivery.id, delivery.revision))
    return delivery
  }

  @Get(':id/deliveries')
  listDeliveries(
    @Param('id') id: string,
    @Query() query: { status?: unknown; eventType?: unknown; page?: unknown; size?: unknown },
    @Req() req: AuthedRequest,
  ) {
    return this.svc.listDeliveries(this.user(req), id, query)
  }

  @Post('deliveries/:deliveryId/retry')
  @HttpCode(200)
  async retryDelivery(
    @Param('deliveryId') deliveryId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const delivery = await this.svc.retryDelivery(this.user(req), deliveryId, ifMatch)
    res.setHeader('ETag', makeEtag('webhook-delivery', delivery.id, delivery.revision))
    return delivery
  }

  private user(req: AuthedRequest): AuthUser {
    if (!req.user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '缺少登录态' })
    }
    return req.user
  }
}
