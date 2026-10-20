/**
 * 标准页（list/detail）单元格值格式化（Phase 2 批 2）。
 * 与表单不同：标准页是**只读展示**，空值给占位而不是空串，布尔给中文。
 */
export function displayCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}
