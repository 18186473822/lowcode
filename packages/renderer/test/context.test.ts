import { describe, it, expect, vi } from 'vitest'
import { createPageContext } from '../src/core/context.js'

describe('createPageContext', () => {
  it('初始化默认数据，scope 顶层键为 own 属性（表达式要求）', () => {
    const ctx = createPageContext({ defaultFormData: { amount: 1 }, user: { name: '张三' } })
    expect(ctx.get('amount')).toBe(1)
    expect(Object.prototype.hasOwnProperty.call(ctx.scope, 'formData')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(ctx.scope, 'user')).toBe(true)
    expect((ctx.scope as any).user.name).toBe('张三')
  })

  it('set 写入并触发 onFieldChange，返回根名', () => {
    const ctx = createPageContext({ defaultFormData: {} })
    const seen: Array<{ name: string; root: string }> = []
    const off = ctx.onFieldChange((i) => seen.push({ name: i.name, root: i.root }))

    ctx.set('a.b', 5)
    ctx.set('items[0].n', 'x')
    expect(ctx.get('a.b')).toBe(5)
    expect((ctx.get('items') as any)[0].n).toBe('x')
    expect(seen).toEqual([
      { name: 'a.b', root: 'formData' },
      { name: 'items[0].n', root: 'formData' },
    ])

    off()
    ctx.set('c', 1)
    expect(seen).toHaveLength(2)
  })

  it('patch 批量写入，同根合并为一次通知', () => {
    const ctx = createPageContext({ defaultFormData: {} })
    const listener = vi.fn()
    ctx.onFieldChange(listener)

    ctx.patch({ name: '张三', age: 18, other: 1 })

    expect(ctx.get('name')).toBe('张三')
    expect(ctx.get('age')).toBe(18)
    // name+age 同为 formData 根 → 合并成 1 次；other 也是 formData 根 → 全部合并成 1 次
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].root).toBe('formData')
  })

  it('reset 清空并恢复默认值', () => {
    const ctx = createPageContext({ defaultFormData: { a: 1 } })
    ctx.set('a', 9)
    ctx.reset()
    expect(ctx.get('a')).toBe(1)

    ctx.reset({ z: 3 })
    expect(ctx.get('z')).toBe(3)
    expect(ctx.get('a')).toBeUndefined()
  })

  it('withLocals 派生局部作用域，不污染原 scope', () => {
    const ctx = createPageContext({ defaultFormData: { v: 1 } })
    const local = ctx.withLocals({ item: { id: 9 }, index: 0 })
    expect((local as any).item.id).toBe(9)
    expect((local as any).formData.v).toBe(1)
    expect(Object.prototype.hasOwnProperty.call(ctx.scope, 'item')).toBe(false)
  })

  it('单个订阅者抛错不影响其他订阅者', () => {
    const ctx = createPageContext()
    ctx.onFieldChange(() => {
      throw new Error('boom')
    })
    const ok = vi.fn()
    ctx.onFieldChange(ok)
    expect(() => ctx.set('a', 1)).not.toThrow()
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('空名 set 直接忽略', () => {
    const ctx = createPageContext({ defaultFormData: { a: 1 } })
    const listener = vi.fn()
    ctx.onFieldChange(listener)
    ctx.set('', 9)
    expect(ctx.get('a')).toBe(1)
    expect(listener).not.toHaveBeenCalled()
  })
})
