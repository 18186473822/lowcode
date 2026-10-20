import { describe, it, expect } from 'vitest'
import { createEmptyPage, validatePage, type PageSchema } from '../src/index.js'

/** 造一个带生命周期与 loop 的页面 */
function pageWithLifecycle(): PageSchema {
  const p = createEmptyPage('pg_lc', '生命周期页')
  p.root.children = [{ id: 'n1', componentName: 'Input', props: { name: 'a' } }]
  return p
}

describe('validatePage —— 生命周期', () => {
  it('单表达式形式照常校验', () => {
    const p = pageWithLifecycle()
    p.lifecycle = { onInit: 'app.setFormData({ a: 1 })' }
    const r = validatePage(p, { materials: ['Page', 'Input'], checkExpr: () => ({ ok: true }) })
    expect(r.valid).toBe(true)
  })

  it('数组形式逐步校验，语法错误定位到具体 step', () => {
    const p = pageWithLifecycle()
    p.lifecycle = {
      onInit: ['app.setFormData({ a: 1 })', 'user.name +'],
      onMount: 'formData.a',
    }
    const r = validatePage(p, {
      materials: ['Page', 'Input'],
      checkExpr: (e) => (e.endsWith('+') ? { ok: false, message: '意外结束' } : { ok: true }),
    })
    expect(r.valid).toBe(false)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].code).toBe('E_EXPR_SYNTAX')
    expect(r.errors[0].path).toBe('lifecycle.onInit[1]')
    expect(r.errors[0].message).toContain('生命周期 onInit[1]')
  })

  it('空数组 / null / undefined 不报错', () => {
    const p = pageWithLifecycle()
    p.lifecycle = { onInit: [], onMount: null as unknown as string, onSubmit: undefined }
    const r = validatePage(p, { materials: ['Page', 'Input'] })
    expect(r.valid).toBe(true)
  })
})

describe('validatePage —— loop 的 $expr: 前缀', () => {
  function pageWithLoop(loop: string): PageSchema {
    const p = createEmptyPage('pg_loop', '循环页')
    p.root.children = [
      {
        id: 'row',
        componentName: 'View',
        loop,
        children: [{ id: 't', componentName: 'Text', props: {} }],
      },
    ]
    return p
  }

  it('带 $expr: 前缀的 loop 不被误报为语法错误', () => {
    const p = pageWithLoop('$expr: formData.list')
    const r = validatePage(p, {
      materials: ['Page', 'View', 'Text'],
      // 模拟真实表达式引擎：`$expr: formData.list` 这种带前缀的文本必然解析失败
      checkExpr: (e) => (e.includes('$expr:') ? { ok: false, message: '无法识别的字符' } : { ok: true }),
    })
    expect(r.errors.filter((e) => e.code === 'E_EXPR_SYNTAX')).toHaveLength(0)
    expect(r.valid).toBe(true)
  })

  it('不带前缀的 loop 照常校验（真语法错误仍会报）', () => {
    const p = pageWithLoop('formData.list +')
    const r = validatePage(p, {
      materials: ['Page', 'View', 'Text'],
      checkExpr: (e) => (e.endsWith('+') ? { ok: false, message: '意外结束' } : { ok: true }),
    })
    expect(r.errors.some((e) => e.code === 'E_EXPR_SYNTAX' && e.path.endsWith('.loop'))).toBe(true)
  })
})
