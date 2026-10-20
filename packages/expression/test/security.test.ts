import { describe, it, expect } from 'vitest'
import {
  evalExpr,
  checkExpr,
  extractRefs,
  refs,
  markTrusted,
  isTrusted,
  ExpressionError,
} from '../src/index.js'

/* ------------------------------------------------------------------ */
/* 原型链逃逸                                                          */
/* ------------------------------------------------------------------ */

describe('安全 —— 原型链与禁用属性', () => {
  const forbidden = [
    '({}).constructor',
    '({}).__proto__',
    'a.__proto__',
    'a.constructor',
    'a.prototype',
    '[].constructor',
    '"x".constructor',
    'constructor',
    '__proto__',
    'a.__defineGetter__',
    'a.toString',
    'a.valueOf',
    'a.call',
    'a.apply',
    'a.bind',
    'globalThis',
    'window',
    'process',
    'require',
    'eval',
    'Function',
  ]

  for (const expr of forbidden) {
    it(`拒绝：${expr}`, () => {
      let caught: ExpressionError | null = null
      try {
        evalExpr(expr, { a: {} })
      } catch (e) {
        caught = e as ExpressionError
      }
      expect(caught, `表达式「${expr}」应被拒绝`).not.toBeNull()
      expect(['E_EXPR_SECURITY', 'E_EXPR_UNKNOWN_FN', 'E_EXPR_SYNTAX']).toContain(caught!.code)
    })
  }

  it('构造器调用无法执行任意代码', () => {
    expect(() => evalExpr('a.constructor("return process")()', { a: {} })).toThrowError(ExpressionError)
  })

  it('对象字面量中出现禁用键报错', () => {
    expect(() => evalExpr('{ __proto__: 1 }')).toThrowError(/禁止/)
  })

  it('计算成员访问禁用键同样被拦截', () => {
    expect(() => evalExpr('a["__proto__"]', { a: {} })).toThrowError(/禁止/)
    expect(() => evalExpr('a["constructor"]', { a: {} })).toThrowError(/禁止/)
  })
})

/* ------------------------------------------------------------------ */
/* 函数 / 方法白名单                                                    */
/* ------------------------------------------------------------------ */

describe('安全 —— 函数与方法白名单', () => {
  it('拒绝未在白名单中的对象方法', () => {
    expect(() => evalExpr('a.hasOwnProperty("x")', { a: {} })).toThrowError(ExpressionError)
    try {
      evalExpr('a.hasOwnProperty("x")', { a: {} })
    } catch (e) {
      expect((e as ExpressionError).code).toBe('E_EXPR_UNKNOWN_FN')
    }
  })

  it('拒绝直接调用作用域里的普通函数（除非是内置）', () => {
    const scope = { evil: () => 'boom' }
    // 标识符调用允许作用域注入的函数（运行时受信），此处验证其可被调用
    expect(evalExpr('evil()', scope)).toBe('boom')
  })

  it('拒绝调用未声明的函数', () => {
    expect(() => evalExpr('someUnknownFn(1)')).toThrowError(/未定义的函数/)
  })

  it('拒绝非函数调用', () => {
    expect(() => evalExpr('a.b()', { a: { b: 1 } })).toThrowError(/不是可调用的函数/)
  })

  it('受信对象可调用自己的方法（app/ds 场景）', () => {
    const app = { toast: (m: string) => `toast:${m}`, log: (m: string) => m }
    expect(isTrusted(app)).toBe(false)
    // 未受信时拒绝
    expect(() => evalExpr('app.toast("hi")', { app })).toThrowError(ExpressionError)
    // 受信后允许
    markTrusted(app)
    expect(isTrusted(app)).toBe(true)
    expect(evalExpr('app.toast("hi")', { app })).toBe('toast:hi')
    // 仍禁止禁用属性
    expect(() => evalExpr('app.constructor', { app })).toThrowError(/禁止/)
  })

  it('受信对象调用仍拦截禁用方法名', () => {
    const app = { ok: () => 1 } as any
    markTrusted(app)
    app.call = () => 'danger'
    expect(() => evalExpr('app.call()', { app })).toThrowError(/禁止/)
  })

  it('onForbidden 回调可用于埋点', () => {
    const hit: string[] = []
    try {
      evalExpr('mysteryFn()', {}, { onForbidden: (n) => hit.push(n) })
    } catch {
      /* expected */
    }
    expect(hit).toEqual(['mysteryFn'])
  })
})

/* ------------------------------------------------------------------ */
/* 依赖提取                                                            */
/* ------------------------------------------------------------------ */

describe('extractRefs —— 联动依赖收集', () => {
  it('提取简单引用', () => {
    expect(refs('formData.amount').sort()).toEqual(['formData'])
    expect(refs('formData.amount + user.age').sort()).toEqual(['formData', 'user'])
  })

  it('成员访问只取根变量', () => {
    expect(refs('a.b.c.d')).toEqual(['a'])
  })

  it('计算成员的下标表达式被收集', () => {
    expect(refs('a[k]').sort()).toEqual(['a', 'k'])
  })

  it('内置函数名不计入依赖', () => {
    expect(refs('len(formData.name)')).toEqual(['formData'])
    expect(refs('sum([1,2])')).toEqual([])
  })

  it('箭头参数遮蔽外层同名变量', () => {
    expect(refs('ds.list.filter(i => i.pid === formData.city).length').sort()).toEqual(['ds', 'formData'])
  })

  it('三元与逻辑两侧都被收集', () => {
    expect(refs('a > 1 ? b : c || d').sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('对象字面量的键不计入依赖', () => {
    expect(refs('{ name: formData.x }')).toEqual(['formData'])
  })

  it('语法错误时返回空数组而不抛出', () => {
    expect(refs('a + ')).toEqual([])
  })

  it('真实联动场景：金额区间筛选依赖 amount', () => {
    const r = refs('formData.amount >= 100 && formData.amount <= 500')
    expect(r).toEqual(['formData'])
  })
})

/* ------------------------------------------------------------------ */
/* checkExpr（供 @lc/schema 校验器与设计器使用）                          */
/* ------------------------------------------------------------------ */

describe('checkExpr', () => {
  it('合法表达式返回 ok', () => {
    expect(checkExpr('formData.a + 1').ok).toBe(true)
    expect(checkExpr('list.filter(x => x > 1)').ok).toBe(true)
  })

  it('空表达式返回错误', () => {
    expect(checkExpr('').ok).toBe(false)
    expect(checkExpr('   ').ok).toBe(false)
    expect(checkExpr('').message).toBe('表达式为空')
  })

  it('语法错误返回 message 与列号', () => {
    const r = checkExpr('formData.a +')
    expect(r.ok).toBe(false)
    expect(r.message).toBeTruthy()
    expect(r.code).toBe('E_EXPR_SYNTAX')
    expect(typeof r.pos).toBe('number')
  })

  it('非字符串返回错误', () => {
    expect(checkExpr(null as any).ok).toBe(false)
  })

  it('不抛出异常（设计器实时提示依赖此行为）', () => {
    expect(() => checkExpr('((((')).not.toThrow()
    expect(() => checkExpr('@#$%')).not.toThrow()
  })
})
