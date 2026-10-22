/**
 * 流程接口（Phase 3 批 1，protocol.md §11，全部需 Bearer 令牌）：
 *
 * ```
 * GET    /api/v1/flows                                     流程定义列表
 * GET    /api/v1/flows/tasks/todo                          当前用户待办任务（assignee 命中）
 * GET    /api/v1/flows/instances?recordId=&modelId=        实例查询（Timeline 数据源）
 * GET    /api/v1/flows/instances/:instanceId               单实例查询（批 2：待办详情页）
 * GET    /api/v1/flows/:flowId                             定义详情
 * PUT    /api/v1/flows/:flowId                             定义 upsert（validateFlow 不过 400）
 * DELETE /api/v1/flows/:flowId                             删除定义（实例保留审计）
 * POST   /api/v1/flows/instances/:iid/tasks/:tid           审批动作 { action: approve|reject, comment? }
 * ```
 *
 * 路由顺序注记：`tasks/todo` / `instances` 静态段必须先于 `:flowId` 声明（同段参数路由会抢配）。
 * POST 显式 `@HttpCode(200)` 固化契约（B-16 教训）。
 */
import {
  BadRequestException,
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
import { FlowService } from './flow.service.js'

interface DecideBody {
  action?: 'approve' | 'reject'
  comment?: string
}

@Controller('flows')
@UseGuards(AuthGuard)
export class FlowController {
  constructor(@Inject(FlowService) private readonly svc: FlowService) {}

  @Get()
  list() {
    return this.svc.listFlows().then((flows) => ({ flows }))
  }

  @Get('tasks/todo')
  todo(@Req() req: AuthedRequest) {
    return this.svc.todoTasks(this.user(req)).then((items) => ({ items }))
  }

  @Get('instances')
  instances(@Query('recordId') recordId?: string, @Query('modelId') modelId?: string) {
    return this.svc.listInstances({ recordId, modelId }).then((items) => ({ items }))
  }

  /** 批 2：单实例查询（待办详情页数据源；不存在 404 FLOW_INSTANCE_NOT_FOUND） */
  @Get('instances/:instanceId')
  async getInstance(
    @Param('instanceId') instanceId: string,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ) {
    const inst = await this.svc.getInstance(instanceId)
    res.setHeader('ETag', makeEtag('flow', instanceId, inst.revision ?? 0))
    return inst
  }

  @Get(':flowId')
  get(@Param('flowId') flowId: string) {
    return this.svc.getFlow(flowId)
  }

  @Put(':flowId')
  upsert(@Param('flowId') flowId: string, @Body() body: unknown) {
    return this.svc.upsertFlow(flowId, body)
  }

  @Delete(':flowId')
  @HttpCode(204)
  async remove(@Param('flowId') flowId: string): Promise<void> {
    await this.svc.deleteFlow(flowId)
  }

  @Post('instances/:instanceId/tasks/:taskId')
  @HttpCode(200)
  async decide(
    @Param('instanceId') instanceId: string,
    @Param('taskId') taskId: string,
    @Body() body: DecideBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ) {
    if (body?.action !== 'approve' && body?.action !== 'reject') {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'action 必须是 approve | reject' })
    }
    if (body.comment !== undefined && typeof body.comment !== 'string') {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'comment 必须是字符串' })
    }
    if (idempotencyKey !== undefined && (!idempotencyKey.trim() || idempotencyKey.length > 128)) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Idempotency-Key 必须为 1~128 字符的非空字符串',
      })
    }
    const inst = await this.svc.decide(
      instanceId,
      taskId,
      body.action,
      body.comment,
      this.user(req),
      idempotencyKey?.trim(),
    )
    res.setHeader('ETag', makeEtag('flow', instanceId, inst.revision ?? 0))
    return inst
  }

  /** 守卫已挂载 req.user；此处兜底（同 RecordController 口径） */
  private user(req: AuthedRequest): AuthUser {
    if (!req.user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '缺少登录态' })
    }
    return req.user
  }
}
