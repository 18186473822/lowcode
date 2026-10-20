/**
 * RBAC 接口（批 6，全部需 Bearer 令牌）：
 *
 * ```
 * GET  /api/v1/rbac/roles          RBAC 全量配置 {roles:[{key,name,perms}], pages:{pageId:[roleKey]}}
 *                                  （页面授权矩阵的数据源；pages 仅含受限页面，缺省键 = 全员可见）
 * PUT  /api/v1/rbac/roles/:key     upsert 角色（body {name, perms}；非法 400）
 * PUT  /api/v1/rbac/pages/:pageId  upsert 页面授权（body {roles: string[]}；空数组 = 删条目恢复全员可见）
 * ```
 *
 * PUT 显式 `@HttpCode(200)` —— 固化契约，避免 Nest 默认 201（B-16 教训）。
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { RbacService, PERM_RE, ROLE_KEY_RE, WILDCARD } from './rbac.service.js'
import type { RbacConfig } from './rbac.types.js'

interface UpsertRoleBody {
  name?: unknown
  perms?: unknown
}

interface UpsertPageAuthBody {
  roles?: unknown
}

@Controller('rbac')
@UseGuards(AuthGuard)
export class RbacController {
  constructor(@Inject(RbacService) private readonly svc: RbacService) {}

  @Get('roles')
  async listRoles(): Promise<RbacConfig> {
    return this.svc.config()
  }

  @Put('roles/:key')
  @HttpCode(200)
  async upsertRole(@Param('key') key: string, @Body() body: UpsertRoleBody | undefined) {
    if (!ROLE_KEY_RE.test(key)) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: `角色 key 格式不合法：${key}`,
      })
    }
    const { name, perms } = body ?? {}
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'name 必须为非空字符串' })
    }
    // '*' 通配 = 超级角色，合法（种子里 admin 即 ['*']；不放行会导致种子角色一编辑就 400）
    if (
      !Array.isArray(perms) ||
      perms.some((p) => typeof p !== 'string' || (p !== WILDCARD && !PERM_RE.test(p)))
    ) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'perms 必须为权限点字符串数组（字母/下划线开头，可含数字/下划线/连字符，或 "*"）',
      })
    }
    await this.svc.upsertRole(key, name.trim(), perms as string[])
    return { key, saved: true }
  }

  @Put('pages/:pageId')
  @HttpCode(200)
  async upsertPageAuth(@Param('pageId') pageId: string, @Body() body: UpsertPageAuthBody | undefined) {
    const { roles } = body ?? {}
    if (!Array.isArray(roles) || roles.some((r) => typeof r !== 'string' || !ROLE_KEY_RE.test(r))) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'roles 必须为角色 key 字符串数组（空数组 = 恢复全员可见）',
      })
    }
    await this.svc.upsertPageAuth(pageId, roles as string[])
    return { pageId, roles, saved: true }
  }
}
