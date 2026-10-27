/**
 * RBAC 判定服务（批 6，D-P2-11 四层权限的单一事实源）。
 *
 * 四层判定（与 PLANS.md §2 详设一一对应）：
 *  ① 页面级 —— `canSeePage`：pages 无条目 = 全员可见；有条目 = 角色并集含 '*' 或有交集；
 *  ② 按钮级 —— `permsOf`：角色权限点并集（'*' 通配），下发给运行时做 hasPerm 判定
 *     （renderer 既有「无权限整节点不渲染」语义，服务端只发权限点不重复实现渲染判定）；
 *  ③ 模型 CRUD 级 —— `assertModelAction`：model.permissions[action] 未声明 = 通（向后兼容）；
 *     声明 = 与用户角色有交集才放行，否则 403 PERMISSION_DENIED；'*' 恒通；
 *  ④ 数据行级 —— `scopeFiltered` / `assertRowOwned`：model.dataScope：
 *     all/缺省 = 不过滤；self = createdBy === username；dept/deptAndChild 无组织服务
 *     按 self 保守降级（宁少看不多看）；'*' 角色豁免不过滤。
 */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import type { ModelSchema } from '@lc/schema'
import type { AuthUser } from '../common/jwt.service.js'
import { RBAC_REPOSITORY, type RbacConfig, type RbacRepository } from './rbac.types.js'

/** 权限点格式（与协议 NodeSchema.perm 一致：字母/下划线开头，可含数字/下划线/连字符） */
export const PERM_RE = /^[A-Za-z_][\w-]*$/

/** 角色 key 格式（与模型/页面 id 同款白名单） */
export const ROLE_KEY_RE = /^[A-Za-z_][\w-]{0,63}$/

/** 通配符（拥有全部权限点） */
export const WILDCARD = '*'

/* ------------------------------------------------------------------ */
/* 纯函数层（导出便于单测；不依赖存储）                                  */
/* ------------------------------------------------------------------ */

/** 用户的角色并集是否命中白名单（'*' 角色恒命中；白名单含 '*' 亦恒命中） */
export function rolesIntersect(userRoles: string[], allowed: string[]): boolean {
  if (allowed.includes(WILDCARD)) return true
  return userRoles.some((r) => allowed.includes(r))
}

/** ② 权限点判定：权限点集合是否覆盖某 perm（'*' 恒覆盖） */
export function permCovers(perms: string[], perm: string): boolean {
  return perms.includes(WILDCARD) || perms.includes(perm)
}

/** ④ 行级：按 dataScope 判断某行是否对用户可见 */
export function rowVisible(
  dataScope: ModelSchema['dataScope'],
  user: AuthUser,
  rowCreatedBy: string,
  hasWildcard: boolean,
): boolean {
  if (hasWildcard) return true // '*' 角色豁免行级过滤
  if (!dataScope || dataScope === 'all') return true
  // self / dept / deptAndChild（dept 系降级 self，无组织服务）
  return rowCreatedBy === user.username
}

/* ------------------------------------------------------------------ */
/* 服务                                                                */
/* ------------------------------------------------------------------ */

interface ModelLike {
  permissions?: Partial<Record<'create' | 'read' | 'update' | 'delete', string[]>>
  dataScope?: ModelSchema['dataScope']
}

@Injectable()
export class RbacService {
  constructor(@Inject(RBAC_REPOSITORY) private readonly repo: RbacRepository) {}

  /** 读全量配置（控制器与判定共用） */
  async config(): Promise<RbacConfig> {
    return this.repo.load()
  }

  /** ①+② 用户权限点集合：角色 perms 并集（'*' 存在则只留 '*'，语义等价更省带宽） */
  async permsOf(user: AuthUser): Promise<string[]> {
    const config = await this.repo.load()
    const set = new Set<string>()
    for (const role of config.roles) {
      if (!user.roles.includes(role.key)) continue
      for (const p of role.perms) {
        if (p === WILDCARD) return [WILDCARD]
        set.add(p)
      }
    }
    return [...set].sort()
  }

  /** ① 页面可见性：无条目 = 全员可见；有条目 = 角色命中（'*' 恒通） */
  async canSeePage(user: AuthUser, pageId: string): Promise<boolean> {
    const config = await this.repo.load()
    const allowed = config.pages[pageId]
    if (!allowed) return true
    return rolesIntersect(user.roles, allowed)
  }

  /**
   * ③ 模型 CRUD 权限：未声明 = 通（向后兼容既有模型）；
   * 声明 = 角色有交集（'*' 恒通），否则 403。
   */
  async assertModelAction(
    user: AuthUser,
    model: ModelLike,
    action: 'create' | 'read' | 'update' | 'delete',
  ): Promise<void> {
    const allowed = model.permissions?.[action]
    if (!allowed || allowed.length === 0) return // 未声明/空数组 → 不限制（空 = 不启用该动作限制）
    if (rolesIntersect(user.roles, allowed)) return
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: `无权对该数据执行 ${action} 操作`,
    })
  }

  /** ④ 行级：该模型的行过滤是否对用户生效（'*' 豁免 / all 不过滤 → false） */
  async scopeFiltered(user: AuthUser, model: ModelLike): Promise<boolean> {
    if (!model.dataScope || model.dataScope === 'all') return false
    const perms = await this.permsOf(user)
    return !perms.includes(WILDCARD)
  }

  /** ④ 行级：update/delete 命中行归属检查；不可见行 403（不泄漏存在性之外的信息，统一权限错误） */
  async assertRowOwned(
    user: AuthUser,
    model: ModelLike,
    rowCreatedBy: string,
  ): Promise<void> {
    const perms = await this.permsOf(user)
    const visible = rowVisible(model.dataScope, user, rowCreatedBy, perms.includes(WILDCARD))
    if (!visible) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '无权操作该条数据（行级数据权限）',
      })
    }
  }

  /* ------------------------------ 配置管理 ------------------------------ */

  /** ② 下发给运行时/bootstrap 的权限点（permsOf 的对外别名，语义清晰） */
  async grantedPerms(user: AuthUser): Promise<string[]> {
    return this.permsOf(user)
  }

  /** upsert 角色（校验 key 与 perms 格式，非法抛 400） */
  async upsertRole(key: string, name: string, perms: string[]): Promise<void> {
    const config = await this.repo.load()
    const rest = config.roles.filter((r) => r.key !== key)
    config.roles = [...rest, { key, name, perms }].sort((a, b) => a.key.localeCompare(b.key))
    await this.repo.save(config)
  }

  /** upsert 页面授权（roles 为空数组 = 删除条目恢复全员可见） */
  async upsertPageAuth(pageId: string, roles: string[]): Promise<void> {
    const config = await this.repo.load()
    if (roles.length === 0) {
      delete config.pages[pageId]
    } else {
      config.pages[pageId] = [...roles].sort()
    }
    await this.repo.save(config)
  }
}
