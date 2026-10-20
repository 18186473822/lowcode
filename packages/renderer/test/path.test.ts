import { describe, it, expect } from 'vitest'
import { splitPath, getByPath, setByPath, rootOf } from '../src/core/path.js'

describe('path 工具', () => {
  it('splitPath 解析 a.b[0].c', () => {
    expect(splitPath('a.b[0].c')).toEqual(['a', 'b', '0', 'c'])
    expect(splitPath('amount')).toEqual(['amount'])
    expect(splitPath('items[2].name')).toEqual(['items', '2', 'name'])
  })

  it('getByPath 链式读取，中间层为空返回 undefined', () => {
    expect(getByPath({ a: { b: 1 } }, 'a.b')).toBe(1)
    expect(getByPath({ a: null }, 'a.b')).toBeUndefined()
    expect(getByPath({}, 'x.y.z')).toBeUndefined()
    expect(getByPath({ items: [{ n: 'v' }] }, 'items[0].n')).toBe('v')
    expect(getByPath(undefined, 'a')).toBeUndefined()
  })

  it('setByPath 自动创建中间层，数字段创建数组', () => {
    const o: Record<string, unknown> = {}
    expect(setByPath(o, 'a.b.c', 1)).toBe(true)
    expect(o).toEqual({ a: { b: { c: 1 } } })

    const o2: Record<string, unknown> = {}
    setByPath(o2, 'items[0].name', 'x')
    expect(Array.isArray((o2 as any).items)).toBe(true)
    expect((o2 as any).items[0].name).toBe('x')

    expect(setByPath(o2, '', 1)).toBe(false)
  })

  it('rootOf 取根段', () => {
    expect(rootOf('formData.amount')).toBe('formData')
    expect(rootOf('items[0]')).toBe('items')
    expect(rootOf('ds')).toBe('ds')
  })
})
