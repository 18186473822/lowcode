/**
 * 协议版本常量与版本比较工具。
 *
 * 铁律（见《落地方案》3.7）：
 *  1. 任何 PageSchema / ModelSchema 必须携带 schemaVersion；
 *  2. 运行时加载任何 Schema 必先 migrate()；
 *  3. 迁移函数只增不删，且必须有单测。
 */
export const SCHEMA_VERSION = '1.0.0'

/** 受支持的协议版本历史（升序）。新版本追加到末尾，不要修改历史项。 */
export const VERSION_HISTORY: readonly string[] = ['1.0.0']

export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

export function isValidVersion(v: unknown): v is string {
  return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)
}

/** 该版本是否在历史记录中（即平台能识别并迁移它） */
export function isKnownVersion(v: string): boolean {
  return VERSION_HISTORY.includes(v)
}
