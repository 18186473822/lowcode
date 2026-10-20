/**
 * 运维事件接口（Phase 3 批 5，protocol.md §10.1「运维事件」，全部需 Bearer 令牌）：
 *
 * ```
 * POST /api/v1/ops/events      上报批量事件（登录即可；1~50 条；返回 accepted/total/dropped）
 * GET  /api/v1/ops/events      事件查询（仅 '*' 管理员；type/pageId/since/limit）
 * GET  /api/v1/ops/summary     事件汇总（仅 '*' 管理员；错误数 + perf avg/p95/max）
 * ```
 *
 * 权限取舍（D-P3-12）：**写开放、读收紧**。
 * - 写：任何登录用户都会产生错误/性能事件，要求管理员令牌反而会丢现场；
 *   载荷里 `userId` 由服务端从令牌取，客户端伪造无效；
 * - 读：事件含页面 id、错误消息、用户 id，属运维数据，仅管理员（`'*'` 通配）可查。
 *
 * 路由顺序注记：`summary` 静态段与 `events` 同级不同词，无抢配风险；
 * POST 显式 `@HttpCode(200)` 固化契约（B-16 教训）。
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import { RbacService } from '../rbac/rbac.service.js'
import { OpsService } from './ops.service.js'

@Controller('ops')
@UseGuards(AuthGuard)
export class OpsController {
  constructor(
    @Inject(OpsService) private readonly ops: OpsService,
    // B-43：Nest 构造注入一律显式 @Inject（vitest 不 emit decorator metadata）
    @Inject(RbacService) private readonly rbac: RbacService,
  ) {}

  /** 上报：登录即可；结构非法 400 OPS_INVALID */
  @Post('events')
  @HttpCode(200)
  async ingest(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.ops.ingest(this.mustUser(req), body)
  }

  /** 查询：仅管理员；新 → 旧 */
  @Get('events')
  async list(
    @Req() req: AuthedRequest,
    @Query('type') type?: string,
    @Query('pageId') pageId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    await this.assertAdmin(req)
    return this.ops.list({ type, pageId, since, limit })
  }

  /** 汇总：仅管理员；DoD「加载耗时指标接口回读」用 perf.avgMs / p95Ms */
  @Get('summary')
  async summary(
    @Req() req: AuthedRequest,
    @Query('pageId') pageId?: string,
    @Query('since') since?: string,
  ) {
    await this.assertAdmin(req)
    return this.ops.summary({ pageId, since })
  }

  private mustUser(req: AuthedRequest) {
    if (!req.user) throw new Error('缺少登录态') // AuthGuard 已拦截，此处兜底
    return req.user
  }

  private async assertAdmin(req: AuthedRequest): Promise<void> {
    const perms = await this.rbac.grantedPerms(this.mustUser(req))
    if (!perms.includes('*')) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '仅管理员可查看运维事件' })
    }
  }
}
