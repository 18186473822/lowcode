/**
 * props-utils.ts —— 物料 props 的容错读取工具（2026-10-28 门户组件库批 2）。
 *
 * 为什么单独成文件：`json` setter 写回的是**数组/对象**，但历史上 JSON 文本域
 * （以及手工编辑的 schema）会把同一份配置存成**字符串**。物料侧统一走 `asArray`，
 * 两种形态都能渲染，避免「面板改完画布空白」这类静默丢配置。
 *
 * 纯函数、零 uni API —— H5 / 小程序 / 设计器画布三端同构。
 */

/**
 * 容错取数组：
 * - 数组 → 原样返回（同一引用，不复制，避免多余渲染）；
 * - JSON 文本 → 尝试解析，解析结果仍是数组才采用；
 * - 空串 / 非法 JSON / 其他类型 → `[]`。
 */
export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      const parsed: unknown = JSON.parse(text)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

/** 数字千分位（避免 toLocaleString 在部分小程序端不支持 locale 参数） */
export function groupDigits(value: number): string {
  const [int, dec] = String(value).split('.')
  const grouped = (int ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${grouped}.${dec}` : grouped
}
