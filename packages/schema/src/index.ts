/**
 * @lc/schema —— 低代码平台核心协议包
 *
 * 内容：
 *  1. 协议类型（PageSchema / MaterialSchema / ModelSchema / AppSchema / Action / Rule）
 *  2. 校验器（validatePage / validateMaterial / validateModel）
 *  3. 版本迁移（migrate / MigrationRegistry）
 *  4. 工具函数（walkNode / findNode / collectComponentNames / collectFieldNames）
 *
 * 本包零运行时依赖，可被设计器（Web）、运行时（uni-app）、服务端（Node）三端共用。
 */
export * from './version.js'
export * from './types/index.js'
export * from './validate/index.js'
export * from './migrate/index.js'
