import { SCHEMA_VERSION, VERSION_HISTORY, compareVersion, isValidVersion } from '../version.js'
import type { PageSchema } from '../types/page.js'

/** 一次版本跃迁：from → to，run 返回迁移后的新对象（不得原地修改入参）。 */
export interface Migration {
  from: string
  to: string
  run: (schema: any) => any
  /** 变更说明，用于 changelog */
  note?: string
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly from?: string,
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

/**
 * 迁移注册表。
 *
 * 铁律（见《落地方案》3.7）：
 *  - 迁移只增不删，历史迁移一旦发布不可修改；
 *  - 每条迁移必须有单测；
 *  - 目标版本必须比源版本新。
 */
export class MigrationRegistry {
  private readonly chain: Migration[] = []

  register(m: Migration): this {
    if (compareVersion(m.to, m.from) <= 0) {
      throw new MigrationError(`迁移目标版本必须大于源版本：${m.from} → ${m.to}`, 'E_MIGRATION_ORDER')
    }
    if (this.chain.some((x) => x.from === m.from)) {
      throw new MigrationError(`源版本 ${m.from} 已存在迁移，不允许重复注册`, 'E_MIGRATION_DUPLICATE')
    }
    this.chain.push(m)
    this.chain.sort((a, b) => compareVersion(a.from, b.from))
    return this
  }

  get size(): number {
    return this.chain.length
  }

  /**
   * 将任意已知版本的 Schema 迁移到 SCHEMA_VERSION。
   * @returns 迁移后的对象与已应用的迁移说明
   */
  migrate<T = any>(schema: { schemaVersion?: string }): { schema: T; applied: string[] } {
    if (!schema || typeof schema !== 'object') {
      throw new MigrationError('Schema 不是对象，无法迁移', 'E_MIGRATION_INPUT')
    }
    const from = schema.schemaVersion
    if (from === undefined) {
      throw new MigrationError('缺少 schemaVersion，无法判断迁移路径', 'E_MIGRATION_NO_VERSION')
    }
    if (!isValidVersion(from)) {
      throw new MigrationError(`schemaVersion 格式不合法：${String(from)}`, 'E_MIGRATION_BAD_VERSION', String(from))
    }
    if (from === SCHEMA_VERSION) return { schema: schema as T, applied: [] }

    // 版本高于当前协议 → 平台不认识该未来版本
    if (compareVersion(from, SCHEMA_VERSION) > 0) {
      throw new MigrationError(`平台不支持的协议版本：${from}`, 'E_MIGRATION_UNKNOWN_VERSION', from)
    }

    let cur: any = schema
    let curVersion = from
    const applied: string[] = []

    while (curVersion !== SCHEMA_VERSION) {
      const step = this.chain.find((m) => m.from === curVersion)
      if (!step) {
        throw new MigrationError(
          `缺少 ${curVersion} → 下一版本 的迁移函数（请在 schema 包中注册）`,
          'E_MIGRATION_MISSING',
          curVersion,
        )
      }
      const next = step.run(structuredCloneSafe(cur))
      if (!next || typeof next !== 'object') {
        throw new MigrationError(`迁移 ${step.from} → ${step.to} 返回了非法值`, 'E_MIGRATION_RESULT', step.from)
      }
      cur = next
      curVersion = step.to
      cur.schemaVersion = step.to
      applied.push(`${step.from} → ${step.to}${step.note ? `（${step.note}）` : ''}`)
    }

    return { schema: cur as T, applied }
  }
}

/** 深拷贝：优先 structuredClone，降级 JSON（协议内不应含函数）。 */
function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(v)
    } catch {
      /* 含不可克隆值时降级 */
    }
  }
  return JSON.parse(JSON.stringify(v)) as T
}

/** 平台默认迁移链（当前历史版本仅 1.0.0，链为空；新版本在此追加）。 */
export const defaultRegistry = new MigrationRegistry()

/** 便捷函数：迁移任意 Schema 到当前协议版本。 */
export function migrate<T = any>(
  schema: { schemaVersion?: string },
  registry: MigrationRegistry = defaultRegistry,
): { schema: T; applied: string[] } {
  return registry.migrate<T>(schema)
}

/** 生成一个合法的空页面 Schema（设计器「新建页面」与单测共用）。 */
export function createEmptyPage(id: string, name: string): PageSchema {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    type: 'custom',
    meta: { navigationBar: { display: true, title: name, style: 'default' } },
    root: {
      id: `node_${id}_root`,
      componentName: 'Page',
      props: { padding: '24rpx', background: '#f5f6f7' },
      children: [],
    },
    dataSources: [],
    defaultFormData: {},
  }
}

/** 当前协议版本历史（对外暴露以便设计器显示）。 */
export const KNOWN_VERSIONS = VERSION_HISTORY
