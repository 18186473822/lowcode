import { describe, it, expect } from 'vitest'
import { tokenize, parse, ExpressionError, astToString } from '../src/index.js'

describe('tokenizer', () => {
  it('解析数字（整数/小数/科学计数）', () => {
    expect(tokenize('1').map((t) => t.t)).toEqual(['num', 'eof'])
    expect(tokenize('1.5')[0].value).toBe(1.5)
    expect(tokenize('1e3')[0].value).toBe(1000)
    expect(tokenize('1.2e-2')[0].value).toBeCloseTo(0.012)
  })

  it('数字后跟标识符报错', () => {
    expect(() => tokenize('1abc')).toThrowError(ExpressionError)
  })

  it('解析字符串与转义', () => {
    expect(tokenize('"a\\nb"')[0].value).toBe('a\nb')
    expect(tokenize("'他\\u0041'")[0].value).toBe('他A')
    expect(tokenize('"say \\"hi\\""')[0].value).toBe('say "hi"')
  })

  it('字符串未闭合报错', () => {
    expect(() => tokenize('"abc')).toThrowError(/字符串未闭合/)
  })

  it('运算符最长匹配：=== 优先于 == 优先于 =', () => {
    const ops = tokenize('a === b == c').filter((t) => t.t === 'op').map((t) => t.v)
    expect(ops).toEqual(['===', '=='])
  })

  it('?? ?. 能被正确切分', () => {
    const ops = tokenize('a ?? b?.c').filter((t) => t.t === 'op').map((t) => t.v)
    expect(ops).toEqual(['??', '?.'])
  })

  it('关键字 true/false/null/undefined 作为标识符', () => {
    const words = tokenize('true null undefined')
      .filter((t) => t.t !== 'eof')
      .map((t) => t.v)
    expect(words).toEqual(['true', 'null', 'undefined'])
  })

  it('无法识别的字符报错并带列号', () => {
    try {
      tokenize('a # b')
      throw new Error('should not reach')
    } catch (e) {
      expect((e as ExpressionError).message).toContain('无法识别的字符')
      expect((e as ExpressionError).pos).toBe(2)
    }
  })
})

describe('parser —— 优先级', () => {
  const s = (n: any): string => astToString(n)

  it('算术优先级：* 高于 +', () => {
    expect(s(parse('1 + 2 * 3'))).toBe('(1 + (2 * 3))')
  })

  it('括号改变优先级', () => {
    expect(s(parse('(1 + 2) * 3'))).toBe('((1 + 2) * 3)')
  })

  it('比较低于算术', () => {
    expect(s(parse('a + 1 > b'))).toBe('((a + 1) > b)')
  })

  it('&& 低于 ==', () => {
    expect(s(parse('a == 1 && b == 2'))).toBe('((a == 1) && (b == 2))')
  })

  it('?? 低于 ||', () => {
    expect(s(parse('a ?? b || c'))).toBe('(a ?? (b || c))')
  })

  it('三元可嵌套（右结合）', () => {
    expect(s(parse('a ? b : c ? d : e'))).toBe('(a ? b : (c ? d : e))')
  })

  it('一元 ! 优先于比较', () => {
    expect(s(parse('!a == b'))).toBe('((!a) == b)')
  })

  it('一元负号作用于整个乘积', () => {
    expect(s(parse('-a * b'))).toBe('((-a) * b)')
  })
})

describe('parser —— 成员与调用', () => {
  it('点成员', () => {
    const n: any = parse('formData.amount')
    expect(n.type).toBe('Member')
    expect(n.computed).toBe(false)
    expect(n.property.name).toBe('amount')
  })

  it('计算成员', () => {
    const n: any = parse('a[b]')
    expect(n.computed).toBe(true)
  })

  it('链式调用', () => {
    const n: any = parse('a.b().c(1, 2)')
    // 最外层是对 c 的调用，其 callee 才是成员访问
    expect(n.type).toBe('Call')
    expect(n.callee.type).toBe('Member')
    expect(n.callee.object.type).toBe('Call')
    expect(n.callee.object.callee.type).toBe('Member')
    expect(n.args).toHaveLength(2)
  })

  it('可选成员与可选调用', () => {
    expect((parse('a?.b') as any).optional).toBe(true)
    expect((parse('a?.()') as any).optional).toBe(true)
  })

  it('调用参数可含三元', () => {
    const n: any = parse('f(a ? 1 : 2, b)')
    expect(n.args).toHaveLength(2)
    expect(n.args[0].type).toBe('Conditional')
  })
})

describe('parser —— 字面量', () => {
  it('数组字面量（含尾逗号）', () => {
    const n: any = parse('[1, 2, 3,]')
    expect(n.type).toBe('Array')
    expect(n.elements).toHaveLength(3)
  })

  it('对象字面量（标识符键与字符串键）', () => {
    const n: any = parse('{ a: 1, "b-c": 2 }')
    expect(n.type).toBe('Object')
    expect(n.properties.map((p: any) => p.key)).toEqual(['a', 'b-c'])
  })

  it('空数组与空对象', () => {
      expect((parse('[]') as any).elements).toHaveLength(0)
    expect((parse('{}') as any).properties).toHaveLength(0)
  })

  it('字面量关键字', () => {
    expect((parse('null') as any).value).toBeNull()
    expect((parse('undefined') as any).value).toBeUndefined()
    expect((parse('true') as any).value).toBe(true)
  })
})

describe('parser —— 箭头函数与括号回溯', () => {
  it('单参数无括号箭头', () => {
    const n: any = parse('x => x + 1')
    expect(n.type).toBe('Arrow')
    expect(n.params).toEqual(['x'])
  })

  it('多参数箭头', () => {
    const n: any = parse('(a, b) => a + b')
    expect(n.type).toBe('Arrow')
    expect(n.params).toEqual(['a', 'b'])
  })

  it('单参数带括号箭头', () => {
    const n: any = parse('(x) => x * 2')
    expect(n.type).toBe('Arrow')
    expect(n.params).toEqual(['x'])
  })

  it('普通括号表达式不被误判为参数列表', () => {
    const n: any = parse('(a + b) * 2')
    expect(n.type).toBe('Binary')
    expect(n.operator).toBe('*')
    expect(n.left.type).toBe('Binary')
  })

  it('括号内成员表达式', () => {
    const n: any = parse('(a.b)')
    expect(n.type).toBe('Member')
  })

  it('箭头函数在高阶调用中', () => {
    const n: any = parse('list.filter(i => i.p > 100)')
    expect(n.type).toBe('Call')
    expect(n.args[0].type).toBe('Arrow')
  })
})

describe('parser —— 语法错误', () => {
  it('空表达式', () => {
    expect(() => parse('')).toThrowError(/表达式为空/)
    expect(() => parse('   ')).toThrowError(/表达式为空/)
  })

  it('未闭合括号', () => {
    expect(() => parse('(a + b')).toThrowError(ExpressionError)
  })

  it('三元缺冒号', () => {
    expect(() => parse('a ? b')).toThrowError(/缺少「:」/)
  })

  it('多余字符', () => {
    expect(() => parse('a b')).toThrowError(/意外结束/)
  })

  it('点号后非标识符', () => {
    expect(() => parse('a.1')).toThrowError(ExpressionError)
  })

  it('错误信息带列号', () => {
    try {
      parse('a + @')
      throw new Error('should not reach')
    } catch (e) {
      expect((e as ExpressionError).pos).toBe(4)
      expect((e as ExpressionError).location).toContain('列')
    }
  })
})
