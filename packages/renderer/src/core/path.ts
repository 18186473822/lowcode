/**
 * 路径工具：支持 `a.b.c` 与 `a[0]` 两种写法（表单字段名的通用寻址）。
 */

/** 把路径拆成片段：`a.b[0].c` → ['a','b','0','c'] */
export function splitPath(path: string): string[] {
  const out: string[] = []
  const re = /([^.[\]]+)|\[(\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(path)) !== null) {
    out.push(m[1] ?? m[2])
  }
  return out
}

/** 按路径读取，中间层不存在时返回 undefined（不抛错）。 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  let cur: any = obj
  for (const key of splitPath(path)) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = cur[key]
  }
  return cur
}

/**
 * 按路径写入，中间层不存在时自动创建普通对象。
 * 数字段自动创建数组（如 `items[0].name`）。
 * @returns 是否成功写入
 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): boolean {
  const keys = splitPath(path)
  if (keys.length === 0) return false
  let cur: any = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextKey = keys[i + 1]
    if (cur[key] === null || cur[key] === undefined || typeof cur[key] !== 'object') {
      cur[key] = /^\d+$/.test(nextKey) ? [] : {}
    }
    cur = cur[key]
  }
  cur[keys[keys.length - 1]] = value
  return true
}

/** 取路径的根段：`formData.amount` → `formData` */
export function rootOf(path: string): string {
  const keys = splitPath(path)
  return keys[0] ?? path
}
