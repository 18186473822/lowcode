/**
 * 启动聚合接口（方案 8.3）：
 *
 * ```
 * GET    /api/v1/apps/bootstrap   应用 + 菜单 + 用户 + 权限点 + 主题（一次请求，Bearer）
 * GET    /api/v1/apps/config      应用配置（批 3：theme 下发，登录即可读）
 * PUT    /api/v1/apps/config      应用配置写入（批 3：patch 语义，仅 '*' 通配角色）
 * ```
 *
 * Phase 2 批 6（D-14 收口）：
 * - 响应加 `perms`（用户权限点，'*' 通配）；
 * - `apps` 按页面可见性白名单过滤（RbacService.canSeePage，无条目 = 全员可见）；
 * - 仍无独立「应用」实体（应用按页面 `appId` 分组，有应用表后替换）。
 *
 * Phase 3 批 3（D-P3-8）：
 * - bootstrap 顶层下发 `theme`（`<DATA_DIR>/apps.json`，无配置则缺键）；
 * - `GET/PUT /apps/config`：读对全体登录用户开放；写仅 `'*'` 通配角色（admin），
 *   校验失败 400 `APP_CONFIG_INVALID`。
 *
 * 菜单只下发页面**元数据**（id/名称/状态/版本），打开页面时再单独拉 Schema。
 */
import { Body, BadRequestException, Controller, ForbiddenException, Get, Inject, Put, Req, UseGuards } from '@nestjs/common'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import { RbacService } from '../rbac/rbac.service.js'
import { AppConfigService, validateAppSettings, validateTheme } from './app-config.service.js'
import { PAGE_REPOSITORY, type PageRecord, type PageRepository } from './page.types.js'

/** 应用配置允许的顶层键（白名单，未知键 400） */
const CONFIG_KEYS = ['theme', 'name', 'icon', 'entry', 'menus']

/** 菜单中的单页投影（不含 Schema 本体与版本历史，菜单要轻） */
interface MenuPage {
  id: string
  name: string
  type: string
  status: PageRecord['status']
  currentVersion: number
  updatedAt: string
}

interface MenuApp {
  id: string
  name: string
  pages: MenuPage[]
}

@Controller('apps')
@UseGuards(AuthGuard)
export class AppController {
  constructor(
    @Inject(PAGE_REPOSITORY) private readonly repo: PageRepository,
    // B-43 规范：Nest 构造注入一律显式 @Inject（vitest 不 emit decorator metadata）
    @Inject(RbacService) private readonly rbac: RbacService,
    @Inject(AppConfigService) private readonly appConfig: AppConfigService,
  ) {}

  /** 应用配置读取（批 3）：登录即可；theme 缺省时整键缺失 */
  @Get('config')
  async config() {
    return this.appConfig.getConfig()
  }

  /**
   * 应用配置写入（批 3 + 2026-10-29 P1）：patch 语义；仅 '*' 通配角色。
   *
   * 支持顶层键 `theme / name / icon / entry / menus`。未知键直接 400 —— 宁可报错
   * 也不把前端笔误静默写进配置。返回**合并后的完整配置**（前端不必再 GET 一次）。
   */
  @Put('config')
  async putConfig(@Req() req: AuthedRequest, @Body() body: Record<string, unknown>) {
    const user = this.mustUser(req)
    const perms = await this.rbac.grantedPerms(user)
    if (!perms.includes('*')) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '仅管理员可修改应用配置' })
    }
    const patch = typeof body === 'object' && body !== null ? body : {}
    const issues: string[] = []
    for (const k of Object.keys(patch)) {
      if (!CONFIG_KEYS.includes(k)) issues.push(`未知配置项：${k}`)
    }
    if ('theme' in patch) issues.push(...validateTheme(patch.theme))
    issues.push(...validateAppSettings(patch))
    if (issues.length > 0) {
      throw new BadRequestException({ code: 'APP_CONFIG_INVALID', message: issues.join('；') })
    }
    return this.appConfig.patch(patch)
  }

  @Get('bootstrap')
  async bootstrap(@Req() req: AuthedRequest) {
    const user = this.mustUser(req)
    const [records, perms, cfg] = await Promise.all([
      this.repo.list(),
      this.rbac.grantedPerms(user),
      this.appConfig.getConfig(),
    ])

    // 按 appId 分组（无应用实体，appId 即应用）；应用按 id 升序，页按 updatedAt 倒序（新编辑的在前）
    const byApp = new Map<string, MenuPage[]>()
    for (const r of records) {
      // 批 6：页面可见性过滤（'*' 恒通 / 无条目全员可见，判定在 RbacService）
      if (!(await this.rbac.canSeePage(user, r.id))) continue
      const page: MenuPage = {
        id: r.id,
        name: r.name,
        type: r.type,
        status: r.status,
        currentVersion: r.currentVersion,
        updatedAt: r.updatedAt,
      }
      const list = byApp.get(r.appId)
      if (list) list.push(page)
      else byApp.set(r.appId, [page])
    }

    const apps: MenuApp[] = [...byApp.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([appId, pages]) => ({
        id: appId,
        name: appId,
        pages: pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      }))

    return {
      user,
      perms,
      apps,
      theme: cfg.theme,
      // 应用设置（2026-10-29 P1）：运行时首页按 menus 顺序渲染，entry 标「主页」
      app: { name: cfg.name, icon: cfg.icon, entry: cfg.entry, menus: cfg.menus },
    }
  }

  private mustUser(req: AuthedRequest) {
    if (!req.user) {
      // AuthGuard 已拦截未登录；此处兜底防 undefined 泄漏
      throw new Error('缺少登录态')
    }
    return req.user
  }
}
