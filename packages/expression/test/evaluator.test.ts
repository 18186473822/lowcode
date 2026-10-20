import { describe, it, expect } from 'vitest'
import { evalExpr, safeEval, parseCached, cacheSize, clearCache, ExpressionError } from '../src/index.js'

const scope = () => ({
  formData: { amount: '100', name: '张三', type: 'travel', items: [{ p: 1 }, { p: 3 }, { p: 5 }] },
  user: { name: '李四', deptId: 'd01' },
  urlParams: { orderId: 'O001' },
})

describe('求值 —— 算术', () => {
  it('基本四则运算', () => {
    expect(evalExpr('1 + 2 * 3 - 4 / 2')).toBe(5)
    expect(evalExpr('(1 + 2) * 3')).toBe(9)
    expect(evalExpr('10 % 3')).toBe(1)
    expect(evalExpr('-5 + 2')).toBe(-3)
  })

  it('字符串数字自动按数值相加（表单 input 返回字符串的常见场景）', () => {
    expect(evalExpr('"1" + "2"')).toBe(3)
    expect(evalExpr('1 + "2"')).toBe(3)
    expect(evalExpr('formData.amount * 1', scope())).toBe(100)
    expect(evalExpr('formData.amount + 1', scope())).toBe(101)
  })

  it('不可数字化时退化为字符串拼接', () => {
    expect(evalExpr('"a" + "b"')).toBe('ab')
    expect(evalExpr('"金额：" + 100')).toBe('金额：100')
    expect(evalExpr('null + ""')).toBe('')
  })

  it('除零返回 Infinity 而非抛错', () => {
    expect(evalExpr('1 / 0')).toBe(Infinity)
    expect(evalExpr('1 % 0')).toBeNaN()
  })

  it('非数字字符串参与减法按 0 处理', () => {
    expect(evalExpr('"abc" - 1')).toBe(-1)
  })
})

describe('求值 —— 比较与逻辑', () => {
  it('数值型字符串按数值比较', () => {
    expect(evalExpr('"100" > "20"')).toBe(true)
    expect(evalExpr('"100" >= 100')).toBe(true)
    expect(evalExpr('formData.amount > 50', scope())).toBe(true)
  })

  it('非数值按字符串比较', () => {
    expect(evalExpr('"abc" < "abd"')).toBe(true)
  })

  it('宽松相等做类型归一', () => {
    expect(evalExpr('"1" == 1')).toBe(true)
    expect(evalExpr('"1" === 1')).toBe(false)
    expect(evalExpr('null == undefined')).toBe(true)
    expect(evalExpr('null === undefined')).toBe(false)
    expect(evalExpr('"" == null')).toBe(false)
  })

  it('逻辑短路并返回操作数本身', () => {
    expect(evalExpr('0 || "默认"')).toBe('默认')
    expect(evalExpr('"值" || "默认"')).toBe('值')
    expect(evalExpr('a && b', { a: 1, b: 2 })).toBe(2)
    expect(evalExpr('0 && b', { b: 2 })).toBe(0)
  })

  it('?? 只对 null/undefined 生效', () => {
    expect(evalExpr('null ?? "x"')).toBe('x')
    expect(evalExpr('undefined ?? "x"')).toBe('x')
    expect(evalExpr('0 ?? "x"')).toBe(0)
    expect(evalExpr('"" ?? "x"')).toBe('')
  })

  it('三元表达式', () => {
    expect(evalExpr('1 > 0 ? "是" : "否"')).toBe('是')
    expect(evalExpr('formData.type === "travel" ? 1 : 2', scope())).toBe(1)
  })

  it('可选链在中间层为空时不抛错', () => {
    expect(evalExpr('a?.b?.c', {})).toBeUndefined()
    expect(evalExpr('formData.missing?.deep', scope())).toBeUndefined()
    expect(evalExpr('null?.anything()')).toBeUndefined()
  })

  it('链式取值中间层为空返回 undefined（业务友好）', () => {
    expect(evalExpr('formData.notExist.deeper', scope())).toBeUndefined()
  })
})

describe('求值 —— 作用域', () => {
  it('可读取 formData / user / urlParams', () => {
    const s = scope()
    expect(evalExpr('formData.name', s)).toBe('张三')
    expect(evalExpr('user.deptId', s)).toBe('d01')
    expect(evalExpr('urlParams.orderId', s)).toBe('O001')
  })

  it('未定义变量返回 undefined 并回调（不抛错）', () => {
    const unknown: string[] = []
    const v = evalExpr('notDeclared', {}, { onUnknownVar: (n) => unknown.push(n) })
    expect(v).toBeUndefined()
    expect(unknown).toEqual(['notDeclared'])
  })

  it('空表达式返回 undefined', () => {
    expect(evalExpr('')).toBeUndefined()
    expect(evalExpr('   ')).toBeUndefined()
  })

  it('下标访问', () => {
    expect(evalExpr('formData["name"]', scope())).toBe('张三')
  })
})

describe('内置函数', () => {
  it('字符串类', () => {
    expect(evalExpr('len("abc")')).toBe(3)
    expect(evalExpr('len([1,2])')).toBe(2)
    expect(evalExpr('upper("ab")')).toBe('AB')
    expect(evalExpr('lower("AB")')).toBe('ab')
    expect(evalExpr('trim("  x ")')).toBe('x')
    expect(evalExpr('contains("hello", "ell")')).toBe(true)
    expect(evalExpr('startsWith("abc", "a")')).toBe(true)
    expect(evalExpr('split("a,b", ",")')).toEqual(['a', 'b'])
    expect(evalExpr('replace("a-b-c", "-", "+")')).toBe('a+b+c')
  })

  it('数值与格式化', () => {
    expect(evalExpr('round(1.6)')).toBe(2)
    expect(evalExpr('round(2.5)')).toBe(3)
    expect(evalExpr('fixed(1.5, 2)')).toBe('1.50')
    expect(evalExpr('abs(-3)')).toBe(3)
    expect(evalExpr('floor(1.9)')).toBe(1)
    expect(evalExpr('ceil(1.1)')).toBe(2)
    expect(evalExpr('fmtMoney(1234567.5)')).toBe('1,234,567.50')
    expect(evalExpr('fmtMoney(1234567.5, "元")')).toBe('1,234,567.50元')
    expect(evalExpr('fmtPercent(0.856, 1)')).toBe('85.6%')
    expect(evalExpr('num("12.5")')).toBe(12.5)
    expect(evalExpr('num("abc")')).toBe(0)
  })

  it('聚合类', () => {
    expect(evalExpr('sum([1,2,3])')).toBe(6)
    expect(evalExpr('sum(formData.items, "p")', scope())).toBe(9)
    expect(evalExpr('avg([1,2,3])')).toBe(2)
    expect(evalExpr('count([1,2,3])')).toBe(3)
    expect(evalExpr('max([3,9,1])')).toBe(9)
    expect(evalExpr('min([3,9,1])')).toBe(1)
    expect(evalExpr('sum([])')).toBe(0)
    expect(evalExpr('avg([])')).toBe(0)
  })

  it('日期类', () => {
    expect(evalExpr('formatDate("2026-03-05", "YYYY/MM/DD")')).toBe('2026/03/05')
    expect(evalExpr('dateDiff("2026-01-01", "2026-01-11", "day")')).toBe(10)
    expect(typeof evalExpr('now()')).toBe('number')
    expect(evalExpr('today()')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('结构与逻辑类', () => {
    expect(evalExpr('jsonStringify({a:1})')).toBe('{"a":1}')
    expect(evalExpr('jsonParse("{\\"a\\":1}").a')).toBe(1)
    expect(evalExpr('jsonParse("not json")')).toBeNull()
    expect(evalExpr('ifNull(null, "x")')).toBe('x')
    expect(evalExpr('ifNull(0, "x")')).toBe(0)
    expect(evalExpr('coalesce(null, undefined, "", "y")')).toBe('y')
    expect(evalExpr('in("a", ["a","b"])')).toBe(true)
    expect(evalExpr('notIn("c", ["a","b"])')).toBe(true)
    expect(evalExpr('between(5, 1, 10)')).toBe(true)
    expect(evalExpr('keys({a:1,b:2})')).toEqual(['a', 'b'])
    expect(evalExpr('values({a:1,b:2})')).toEqual([1, 2])
  })

  it('未知内置函数报 E_EXPR_UNKNOWN_FN', () => {
    expect(() => evalExpr('notAFn(1)')).toThrowError(ExpressionError)
    try {
      evalExpr('notAFn(1)')
    } catch (e) {
      expect((e as ExpressionError).code).toBe('E_EXPR_UNKNOWN_FN')
    }
  })
})

describe('数组方法（白名单内）', () => {
  it('filter / map / reduce / some / every', () => {
    expect(evalExpr('[1,2,3,4].filter(x => x > 2)')).toEqual([3, 4])
    expect(evalExpr('[1,2,3].map(x => x * 2)')).toEqual([2, 4, 6])
    expect(evalExpr('[1,2,3].reduce((s, x) => s + x, 0)')).toBe(6)
    expect(evalExpr('[1,2,3].some(x => x > 2)')).toBe(true)
    expect(evalExpr('[1,2,3].every(x => x > 0)')).toBe(true)
    expect(evalExpr('[1,2,3].includes(2)')).toBe(true)
    expect(evalExpr('[3,1,2].sort()')).toEqual([1, 2, 3])
    expect(evalExpr('[1,2,3].slice(1)')).toEqual([2, 3])
    expect(evalExpr('["a","b"].join("-")')).toBe('a-b')
    expect(evalExpr('[1,2,3].indexOf(2)')).toBe(1)
  })

  it('基于数据源对象数组的高阶过滤（联动典型场景）', () => {
    const s = {
      ds: { list: [{ pid: 'A', v: 1 }, { pid: 'B', v: 2 }, { pid: 'A', v: 3 }] },
      formData: { city: 'A' },
    }
    expect(evalExpr('ds.list.filter(i => i.pid === formData.city).length', s)).toBe(2)
    expect(evalExpr('ds.list.filter(i => i.pid === formData.city).map(i => i.v)', s)).toEqual([1, 3])
    expect(evalExpr('sum(ds.list.map(i => i.v))', s)).toBe(6)
  })

  it('字符串方法', () => {
    expect(evalExpr('"Hello World".toUpperCase()')).toBe('HELLO WORLD')
    expect(evalExpr('"abc".includes("b")')).toBe(true)
    expect(evalExpr('"a-b".split("-")')).toEqual(['a', 'b'])
    expect(evalExpr('"5".padStart(3, "0")')).toBe('005')
    expect(evalExpr('"abc".slice(1)')).toBe('bc')
  })

  it('数值方法', () => {
    expect(evalExpr('(1.5).toFixed(2)')).toBe('1.50')
  })

  it('数组 length 属性', () => {
    expect(evalExpr('[1,2,3].length')).toBe(3)
    expect(evalExpr('"abc".length')).toBe(3)
  })
})

describe('箭头函数', () => {
  it('闭包捕获外层作用域', () => {
    const f = evalExpr('x => x + offset', { offset: 10 }) as (x: number) => number
    expect(f(5)).toBe(15)
  })

  it('参数遮蔽外层同名变量', () => {
    const f = evalExpr('formData => formData', { formData: 'outer' }) as (x: unknown) => unknown
    expect(f('inner')).toBe('inner')
  })

  it('立即调用', () => {
    expect(evalExpr('((x) => x * 3)(4)')).toBe(12)
  })
})

describe('缓存与降级', () => {
  it('同一表达式解析结果复用', () => {
    clearCache()
    const before = cacheSize()
    const a = parseCached('1 + 1')
    const b = parseCached('1 + 1')
    expect(a).toBe(b)
    expect(cacheSize()).toBe(before + 1)
  })

  it('缓存不会无限增长', () => {
    clearCache()
    for (let i = 0; i < 600; i++) parseCached(`${i} + 1`)
    expect(cacheSize()).toBeLessThanOrEqual(500)
  })

  it('safeEval 出错返回 fallback 而非抛出', () => {
    expect(safeEval('a +', {}, 'FALLBACK')).toBe('FALLBACK')
    expect(safeEval('1 + 1')).toBe(2)
  })

  it('非字符串入参抛 E_EXPR_SYNTAX', () => {
    expect(() => evalExpr(123 as any)).toThrowError(ExpressionError)
  })
})
