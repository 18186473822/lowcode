import { describe, it, expect } from 'vitest'
import type { PageSchema, NodeSchema, Rule } from '@lc/schema'
import { collectRules, checkRule, isEmpty, validateField, validateAll, toErrorMap } from '../src/core/validator.js'
import { createPageContext } from '../src/core/context.js'

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

function pageWith(children: NodeSchema[]): PageSchema {
  return {
    schemaVersion: '1.0',
    id: 'p',
    name: 't',
    type: 'form',
    root: node({ id: 'root', componentName: 'Page', children }),
  }
}

describe('isEmpty', () => {
  it('空值判定', () => {
    expect(isEmpty(undefined)).toBe(true)
    expect(isEmpty(null)).toBe(true)
    expect(isEmpty('')).toBe(true)
    expect(isEmpty('   ')).toBe(true)
    expect(isEmpty([])).toBe(true)
    expect(isEmpty(0)).toBe(false)
    expect(isEmpty(false)).toBe(false)
    expect(isEmpty('x')).toBe(false)
  })
})

describe('collectRules', () => {
  it('按 name 收集规则，同字段多节点合并', () => {
    const page = pageWith([
      node({ id: 'a', componentName: 'Input', props: { name: 'n', label: '姓名', rules: [{ type: 'required' }] } }),
      node({ id: 'b', componentName: 'Input', props: { name: 'n', label: '姓名', rules: [{ type: 'maxLength', value: 10 }] } }),
      node({ id: 'c', componentName: 'Input', props: { name: 'p', rules: [] } }), // 无规则不收集
      node({ id: 'd', componentName: 'Text', props: {} }), // 无 name 不收集
    ])
    const map = collectRules(page)
    expect([...map.keys()]).toEqual(['n'])
    expect(map.get('n')!.rules).toHaveLength(2)
    expect(map.get('n')!.nodeId).toBe('a')
    expect(map.get('n')!.label).toBe('姓名')
  })

  it('忽略非法规则项', () => {
    const page = pageWith([
      node({ id: 'a', componentName: 'Input', props: { name: 'x', rules: [null, { foo: 1 }, { type: 'required' }] } }),
    ])
    expect(collectRules(page).get('x')!.rules).toHaveLength(1)
  })

  it('空 root 时不报错', () => {
    expect(collectRules(pageWith([])).size).toBe(0)
  })
})

describe('checkRule — 6 种规则', () => {
  const scope = createPageContext({ defaultFormData: { a: 1, b: 2 } }).scope

  it('required', () => {
    expect(checkRule({ type: 'required' }, '', '姓名', scope)).toBe('请填写姓名')
    expect(checkRule({ type: 'required', message: '必填项' }, null, '', scope)).toBe('必填项')
    expect(checkRule({ type: 'required' }, '值', '姓名', scope)).toBeNull()
    expect(checkRule({ type: 'required' }, 0, '数量', scope)).toBeNull() // 0 不算空
  })

  it('pattern：空值跳过，非空匹配', () => {
    const rule: Rule = { type: 'pattern', value: '^\\d{6}$' }
    expect(checkRule(rule, '', '邮编', scope)).toBeNull()
    expect(checkRule(rule, '123456', '邮编', scope)).toBeNull()
    expect(checkRule(rule, '123', '邮编', scope)).toContain('格式不正确')
    expect(checkRule({ ...rule, message: '必须是 6 位数字' }, '123', '邮编', scope)).toBe('必须是 6 位数字')
    expect(checkRule({ type: 'pattern', value: '[' }, 'x', 'f', scope)).toContain('配置错误')
  })

  it('range', () => {
    expect(checkRule({ type: 'range', min: 0, max: 100 }, 50, '年龄', scope)).toBeNull()
    expect(checkRule({ type: 'range', min: 0, max: 100 }, 101, '年龄', scope)).toContain('0 ~ 100')
    expect(checkRule({ type: 'range', min: 0 }, -1, '年龄', scope)).toContain('0 ~')
    expect(checkRule({ type: 'range', max: 10 }, 11, '年龄', scope)).toBeTruthy()
    expect(checkRule({ type: 'range' }, 'abc', '数值', scope)).toContain('必须是数字')
    expect(checkRule({ type: 'range', min: 0 }, '', '数值', scope)).toBeNull()
  })

  it('maxLength：字符串与数组', () => {
    expect(checkRule({ type: 'maxLength', value: 3 }, 'abcd', '备注', scope)).toContain('不能超过 3')
    expect(checkRule({ type: 'maxLength', value: 3 }, 'abc', '备注', scope)).toBeNull()
    expect(checkRule({ type: 'maxLength', value: 2 }, [1, 2, 3], '列表', scope)).toBeTruthy()
    expect(checkRule({ type: 'maxLength', value: 3 }, '', '备注', scope)).toBeNull()
  })

  it('expression：基于 scope 求值', () => {
    expect(checkRule({ type: 'expression', value: 'formData.a < formData.b' }, '', '比较', scope)).toBeNull()
    expect(checkRule({ type: 'expression', value: 'formData.a > formData.b' }, '', '比较', scope)).toContain('校验不通过')
    expect(checkRule({ type: 'expression', value: 'formData.a > formData.b', message: 'A 不能大于 B' }, '', '', scope)).toBe('A 不能大于 B')
    expect(checkRule({ type: 'expression', value: 'formData.a +' }, '', '', scope)).toBe('校验表达式配置错误')
  })

  it('async 由 validateAll 单独处理，此处返回 null', () => {
    expect(checkRule({ type: 'async', dsId: 'd1' }, '', '', scope)).toBeNull()
  })
})

describe('validateField', () => {
  it('按绑定规则依次校验，返回第一个错误', () => {
    const ctx = createPageContext({ defaultFormData: { n: '' } })
    const bindings = collectRules(
      pageWith([
        node({
          id: 'a',
          componentName: 'Input',
          props: { name: 'n', label: '姓名', rules: [{ type: 'required' }, { type: 'maxLength', value: 2 }] },
        }),
      ]),
    )
    expect(validateField('n', '', ctx.scope, bindings)).toBe('请填写姓名')
    expect(validateField('n', '张三丰', ctx.scope, bindings)).toContain('不能超过 2')
    expect(validateField('n', '张三', ctx.scope, bindings)).toBeNull()
    expect(validateField('unknown', 'x', ctx.scope, bindings)).toBeNull()
    expect(validateField('n', '', ctx.scope, new Map())).toBeNull()
  })
})

describe('validateAll', () => {
  const bindings = collectRules(
    pageWith([
      node({ id: 'n1', componentName: 'Input', props: { name: 'name', label: '姓名', rules: [{ type: 'required' }] } }),
      node({ id: 'n2', componentName: 'Input', props: { name: 'age', label: '年龄', rules: [{ type: 'range', min: 0, max: 150 }] } }),
      node({ id: 'n3', componentName: 'Input', props: { name: 'email', label: '邮箱', rules: [{ type: 'expression', value: 'formData.age > 10', message: '年龄需大于 10' }] } }),
    ]),
  )

  it('全部通过时 valid=true', async () => {
    const ctx = createPageContext({ defaultFormData: { name: '张三', age: 20 } })
    const r = await validateAll({ bindings, scope: ctx.scope, getValue: (n) => ctx.get(n) })
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.firstError).toBeUndefined()
  })

  it('多字段错误，firstError 指向第一个', async () => {
    const ctx = createPageContext({ defaultFormData: { name: '', age: 999 } })
    const r = await validateAll({ bindings, scope: ctx.scope, getValue: (n) => ctx.get(n) })
    expect(r.valid).toBe(false)
    expect(r.errors).toHaveLength(2)
    expect(r.errors[0].nodeId).toBe('n1')
    expect(r.firstError!.name).toBe('name')
    expect(r.errors[1].rule).toBe('range')
  })

  it('expression 规则使用 scope', async () => {
    const ctx = createPageContext({ defaultFormData: { name: 'x', age: 5 } })
    const r = await validateAll({ bindings, scope: ctx.scope, getValue: (n) => ctx.get(n) })
    expect(r.errors.map((e) => e.name)).toEqual(['email'])
    expect(r.errors[0].message).toBe('年龄需大于 10')
  })

  it('async 规则需提供 asyncValidator，否则跳过', async () => {
    const asyncBindings = collectRules(
      pageWith([
        node({ id: 'a', componentName: 'Input', props: { name: 'code', rules: [{ type: 'async', dsId: 'ds1' }] } }),
      ]),
    )
    const ctx = createPageContext({ defaultFormData: { code: 'X' } })

    const noValidator = await validateAll({ bindings: asyncBindings, scope: ctx.scope, getValue: (n) => ctx.get(n) })
    expect(noValidator.valid).toBe(true) // 跳过

    const withValidator = await validateAll({
      bindings: asyncBindings,
      scope: ctx.scope,
      getValue: (n) => ctx.get(n),
      asyncValidator: async (rule, c) => {
        expect(rule.dsId).toBe('ds1')
        expect(c.name).toBe('code')
        return c.value === 'X' ? null : '编码无效'
      },
    })
    expect(withValidator.valid).toBe(true)
  })

  it('async 校验失败也计入错误', async () => {
    const asyncBindings = collectRules(
      pageWith([node({ id: 'a', componentName: 'Input', props: { name: 'code', rules: [{ type: 'async', dsId: 'ds1' }] } })]),
    )
    const ctx = createPageContext({ defaultFormData: { code: 'X' } })
    const r = await validateAll({
      bindings: asyncBindings,
      scope: ctx.scope,
      getValue: (n) => ctx.get(n),
      asyncValidator: async () => '编码无效',
    })
    expect(r.valid).toBe(false)
    expect(r.errors[0].rule).toBe('async')
  })

  it('默认从 scope.formData 读值', async () => {
    const ctx = createPageContext({ defaultFormData: { name: '' } })
    const r = await validateAll({ bindings, scope: ctx.scope })
    expect(r.errors.some((e) => e.name === 'name')).toBe(true)
  })
})

describe('toErrorMap', () => {
  it('按 nodeId 建映射', () => {
    const map = toErrorMap([
      { nodeId: 'a', name: 'x', message: 'm1', rule: 'required' },
      { nodeId: 'b', name: 'y', message: 'm2', rule: 'pattern' },
    ])
    expect(map.get('a')).toBe('m1')
    expect(map.get('b')).toBe('m2')
    expect(toErrorMap([]).size).toBe(0)
  })
})
