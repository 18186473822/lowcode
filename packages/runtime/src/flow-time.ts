/**
 * 时间展示格式化（Phase 3 批 2）—— 与 `@lc/materials` 的 flow-utils.fmtTime 同口径：
 * ISO → `MM-DD HH:mm`（跨年补年份；非法值给 —）。
 * runtime 壳层（待办列表/详情）不反向依赖物料包，故本地一份（两行逻辑，重复可接受）。
 */
export function fmtTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number): string => String(n).padStart(2, '0')
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const y = sameYear ? '' : `${d.getFullYear()}-`
  return `${y}${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
