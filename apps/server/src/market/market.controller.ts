/**
 * 物料市场接口（Phase 4 开放集成第三批）。
 *
 * ```
 * GET    /materials/manifest                 公开，ES256 签名清单（ETag/304）
 * GET    /materials/manifest/key             公开，验签公钥与指纹
 * GET    /materials                          已发布物料目录（管理员可按状态筛选）
 * POST   /materials                          创建草稿（管理员）
 * GET    /materials/:id                      物料详情
 * PUT    /materials/:id                      编辑草稿/驳回/下架物料（管理员，If-Match）
 * POST   /materials/:id/submit               提交审核（管理员）
 * POST   /materials/:id/review               审核通过/驳回（管理员）
 * POST   /materials/:id/publish              发布（管理员，需 approved）
 * POST   /materials/:id/unpublish            下架（管理员）
 * GET    /materials/:id/versions             发布历史（管理员）
 * GET    /materials/installs                 租户安装列表
 * PUT    /materials/installs/:materialId     安装/升级到当前发布版本
 * DELETE /materials/installs/:materialId     卸载
 * ```
 *
 * 路由顺序：静态段（manifest / installs）必须声明在 `:id` 之前，否则会被当作物料 id。
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
import { MarketService, type MarketListQuery } from './market.service.js'
import { parseTenantId } from './market.types.js'

interface HeaderSink {
  setHeader(name: string, value: string): void
  status(code: number): void
}

/** 公开清单接口：不挂 AuthGuard，供设计器/运行时直接拉取。 */
@Controller('materials')
export class MarketManifestController {
  constructor(@Inject(MarketService) private readonly svc: MarketService) {}

  @Get('manifest')
  async manifest(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const { body, etag } = await this.svc.manifest()
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=60')
    if (ifNoneMatch?.trim() === etag) {
      res.status(304)
      return
    }
    return body
  }

  @Get('manifest/key')
  async key(@Res({ passthrough: true }) res: HeaderSink) {
    const key = await this.svc.key()
    res.setHeader('Cache-Control', 'public, max-age=300')
    return key
  }
}

@Controller('materials')
@UseGuards(AuthGuard)
export class MarketController {
  constructor(@Inject(MarketService) private readonly svc: MarketService) {}

  /* ------------------------------ 安装（静态段优先） ------------------------------ */

  @Get('installs')
  listInstalls(@Req() req: AuthedRequest, @Headers('x-lc-tenant') tenant: string | undefined) {
    return this.svc.listInstalls(this.user(req), parseTenantId(tenant))
  }

  @Put('installs/:materialId')
  async install(
    @Param('materialId') materialId: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-lc-tenant') tenantHeader: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const tenant = parseTenantId(tenantHeader)
    const install = await this.svc.install(this.user(req), tenant, materialId, body, ifMatch)
    res.setHeader('ETag', makeEtag('material-install', `${tenant}/${materialId}`, install.revision))
    return install
  }

  @Delete('installs/:materialId')
  @HttpCode(200)
  uninstall(
    @Param('materialId') materialId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-lc-tenant') tenantHeader: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.svc.uninstall(this.user(req), parseTenantId(tenantHeader), materialId, ifMatch)
  }

  /* ------------------------------ 目录 ------------------------------ */

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: MarketListQuery) {
    return this.svc.list(this.user(req), query)
  }

  @Post()
  @HttpCode(200)
  async create(
    @Body() body: unknown,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const item = await this.svc.create(this.user(req), body)
    res.setHeader('ETag', makeEtag('material', item.id, item.revision))
    return item
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const item = (await this.svc.get(this.user(req), id)) as { revision?: number }
    if (typeof item.revision === 'number') {
      res.setHeader('ETag', makeEtag('material', id, item.revision))
    }
    return item
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const item = await this.svc.update(this.user(req), id, body, ifMatch)
    res.setHeader('ETag', makeEtag('material', id, item.revision))
    return item
  }

  @Post(':id/submit')
  @HttpCode(200)
  async submit(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const item = await this.svc.submit(this.user(req), id, ifMatch)
    res.setHeader('ETag', makeEtag('material', id, item.revision))
    return item
  }

  @Post(':id/review')
  @HttpCode(200)
  async review(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const item = await this.svc.review(this.user(req), id, body, ifMatch)
    res.setHeader('ETag', makeEtag('material', id, item.revision))
    return item
  }

  @Post(':id/publish')
  @HttpCode(200)
  async publish(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const item = await this.svc.publish(this.user(req), id, ifMatch)
    res.setHeader('ETag', makeEtag('material', id, item.revision))
    return item
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  async unpublish(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const item = await this.svc.unpublish(this.user(req), id, ifMatch)
    res.setHeader('ETag', makeEtag('material', id, item.revision))
    return item
  }

  @Get(':id/versions')
  versions(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.versions(this.user(req), id)
  }

  private user(req: AuthedRequest): AuthUser {
    if (!req.user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '缺少登录态' })
    }
    return req.user
  }
}
