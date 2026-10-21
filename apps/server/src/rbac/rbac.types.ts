/**
 * RBAC 存储模型与仓储契约（Phase 2 批 6，D-P2-10）。
 *
 * 一份 `<DATA_DIR>/rbac.json` 承载全部授权配置（沿 D-9 JSON 文件风格）：
 *   - `roles` —— 角色定义（key 唯一）；`perms` 为该角色拥有的**权限点**集合，
 *     与节点 `perm` 同格式；`'*'` 为通配（超级角色，拥有全部权限点）；
 *   - `pages` —— 页面可见性白名单：`pageId -> 角色 key[]`。
 *     **无条目 = 全员可见**（向后兼容 Phase 1 行为）；有条目 = 仅条目内角色可见。
 *
 * 用户→角色不动（沿种子用户 UserStore）；页面存储 PageRecord 零改动。
 *
 * Phase 4 起 JSON 与 MySQL 两种实现共用 {@link seedRbacConfig}，避免首启种子漂移。
 */

/** 一条角色定义 */
export interface RoleRecord {
  /** 角色标识（字母/下划线开头，与 RBAC id 白名单一致） */
  key: string
  /** 展示名 */
  name: string
  /** 权限点集合；`'*'` 通配全部 */
  perms: string[]
}

/** RBAC 配置全量（rbac.json 文件形状） */
export interface RbacConfig {
  roles: RoleRecord[]
  /** pageId → 可见角色 key 数组；缺省键 = 全员可见 */
  pages: Record<string, string[]>
}

/**
 * 首启种子：admin 通配超级角色 + designer 受限角色（与 UserStore 种子用户角色对齐）。
 * 只读兜底，不自动写回；需要持久化时由 seed 脚本或首次 `save` 落库。
 */
export function seedRbacConfig(): RbacConfig {
  return {
    roles: [
      { key: 'admin', name: '平台管理员', perms: ['*'] },
      { key: 'designer', name: '设计器用户', perms: [] },
    ],
    pages: {},
  }
}

/** 仓储契约：JSON / MySQL 均实现本接口，上层 RbacService 不感知存储 */
export interface RbacRepository {
  /** 读全量配置；文件不存在返回**种子配置**（admin `['*']` + designer 空角色） */
  load(): Promise<RbacConfig>
  /** 写全量配置 */
  save(config: RbacConfig): Promise<void>
}

/** DI token：RBAC 仓储 */
export const RBAC_REPOSITORY = 'LC:RBAC_REPOSITORY'
