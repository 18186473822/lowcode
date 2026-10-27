/**
 * 安全审计接口（2026-10-27）：
 *
 * ```
 * GET /api/v1/audit/events   拒绝类安全事件查询（仅 '*' 管理员）
 *                            type / username / since / limit
 * ```
 *
 * 权限取舍：事件含用户名、IP、访问路径，属安全数据，**仅管理员可读**；
 * 写入不开放接口 —— 只由服务端在登录失败 / 401 / 403 / 429 判定点记录，客户端无法伪造。
 */
import { Controller, ForbiddenException, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import { RbacService, WILDCARD } from '../rbac/rbac.service.js'
import { AuditService } from './audit.service.js'

@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    // B-43：Nest 构造注入一律显式 @Inject（vitest 不 emit decorator metadata）
    @Inject(RbacService) private readonly rbac: RbacService,
  ) {}

  @Get('events')
  async list(
    @Req() req: AuthedRequest,
    @Query('type') type?: string,
    @Query('username') username?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user
    if (!user) throw new Error('缺少登录态') // AuthGuard 已拦截
    const perms = await this.rbac.grantedPerms(user)
    if (!perms.includes(WILDCARD)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '仅管理员可查看安全审计' })
    }
    return this.audit.list({ type, username, since, limit })
  }
}
