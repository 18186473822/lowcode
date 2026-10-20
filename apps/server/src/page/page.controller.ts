/**
 * 页面接口（方案 8.3，全部需 Bearer 令牌）：
 *
 * ```
 * GET  /api/v1/pages                  页面列表（轻量摘要，按可见性过滤；设计器换页用）
 * POST /api/v1/pages/validate          Schema 静态校验（设计器保存前调用）
 * GET  /api/v1/pages/:id/schema        获取 Schema（?version=draft|published|vN）
 * PUT  /api/v1/pages/:id/schema        保存草稿（服务端再校验一次）
 * POST /api/v1/pages/:id/publish       发布（固化版本）
 * POST /api/v1/pages/:id/rollback      回滚（历史版本 → 新草稿）
 * GET  /api/v1/pages/:id/versions      版本历史列表（Phase 2 批 5：轻量元数据，倒序）
 * DELETE /api/v1/pages/:id             删除页面及全部历史版本（仅 '*' 通配角色）
 * ```
 *
 * 路由顺序注意：`validate` 是静态段且与 `:id/schema` 段数不同，先声明无歧义。
 * `GET /pages`（无参数）与 `GET /pages/:id/schema` 段数不同，亦无歧义。
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import type { AuthUser } from '../common/jwt.service.js'
import { RbacService } from '../rbac/rbac.service.js'
import {
  PageService,
  type PublishBody,
  type RollbackBody,
  type SaveDraftBody,
} from './page.service.js'

@Controller('pages')
@UseGuards(AuthGuard)
export class PageController {
  constructor(
    @Inject(PageService) private readonly svc: PageService,
    @Inject(RbacService) private readonly rbac: RbacService,
  ) {}

  /**
   * 页面列表（2026-10-20 补）：轻量摘要、`updatedAt` 倒序。
   * 可见性口径与 `GET /apps/bootstrap` 完全一致（`canSeePage`：`'*'` 恒通 / 无条目全员可见），
   * 否则会出现「菜单里没有、下拉里却有」的不一致。
   */
  @Get()
  async list(@Req() req: AuthedRequest) {
    const user = this.user(req)
    const all = await this.svc.listPages()
    const visible: typeof all = []
    for (const page of all) {
      if (await this.rbac.canSeePage(user, page.id)) visible.push(page)
    }
    return visible
  }

  /** 保存前静态校验（结果永远 200，valid/errors/warnings 在 body） */
  @Post('validate')
  @HttpCode(200)
  validate(@Body() body: { schema?: unknown } | undefined) {
    return this.svc.validateOnly(body?.schema)
  }

  /** 批 6：读 Schema 前先做页面可见性守卫（无权 403 PAGE_FORBIDDEN）；写路径属管理面不设页面可见性 */
  @Get(':id/schema')
  async getSchema(
    @Param('id') id: string,
    @Query('version') version: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const user = this.user(req)
    if (!(await this.rbac.canSeePage(user, id))) {
      throw new ForbiddenException({
        code: 'PAGE_FORBIDDEN',
        message: `无权访问页面 ${id}`,
      })
    }
    return this.svc.getSchema(id, version)
  }

  @Put(':id/schema')
  saveDraft(
    @Param('id') id: string,
    @Body() body: SaveDraftBody | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.svc.saveDraft(id, body, this.user(req))
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @Param('id') id: string,
    @Body() body: PublishBody | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.svc.publish(id, body, this.user(req))
  }

  @Post(':id/rollback')
  @HttpCode(200)
  rollback(
    @Param('id') id: string,
    @Body() body: RollbackBody | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.svc.rollback(id, body, this.user(req))
  }

  /** 版本历史列表（批 5：倒序元数据；与 :id/schema 静态尾段不同，无路由歧义） */
  @Get(':id/versions')
  listVersions(@Param('id') id: string) {
    return this.svc.listVersions(id)
  }

  /**
   * 删除页面（2026-10-20 补）：不可逆，故限 `'*'` 通配角色（与 `PUT /apps/config` 同一写权限口径）。
   * 删除会连同全部历史版本一起消失 —— 前端必须做两步确认。
   */
  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    const user = this.user(req)
    const perms = await this.rbac.grantedPerms(user)
    if (!perms.includes('*')) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '仅管理员可删除页面' })
    }
    return this.svc.removePage(id)
  }

  /** 守卫已挂载 req.user；此处兜底，防止未来重构漏挂守卫导致 undefined 泄漏 */
  private user(req: AuthedRequest): AuthUser {
    if (!req.user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '缺少登录态' })
    }
    return req.user
  }
}
