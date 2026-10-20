import { describe, it, expect } from 'vitest'
import type { PageSchema, NodeSchema } from '@lc/schema'
import { buildTree, buildTreeWithReport } from '../src/core/build.js'
import { Linkage, extractExpr, resolveProps } from '../src/core/linkage.js'
import { createPageContext } from '../src/core/context.js'

function node(partial: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return partial as NodeSchema
}

const page: PageSchema = {
  schemaVersion: '1.0',
  id: 'p1',
  name: '测试页',
  type: 'form',
  root: node({
    id: 'root',
    componentName: 'Page',
    children: [
      node({
        id: 'n1',
        componentName: 'Input',
        props: { name: 'amount' },
        condition: 'formData.show',
        children: [],
      }),
      node({
        id: 'n2',
        componentName: 'Text',
        props: { text: '$expr: "合计：" + formData.total' },
        actions: [{ type: 'expression', event: 'click', value: 'formData.total + 1' }],
        children: [],
      }),
      node({
        id: 'n3',
        componentName: 'View',
        loop: '$expr: formData.list',
        loopArgs: ['item', 'i'],
        children: [
          node({ id: 'n3-1', componentName: 'Text', props: {}, children: [] }),
        ],
      }),
    ],
  }),
  defaultFormData: {},
  // 生命周期值是表达式（不支持赋值，见已知限制），此处只引用字段以收集依赖
  lifecycle: { onInit: 'formData.step', onMount: 'formData.mountedAt' },
}

describe('buildTree', () => {
  it('归一化出完整树，props 深拷贝不污染原 Schema', () => {
    const tree = buildTree(page.root)
    expect(tree.id).toBe('root')
    expect(tree.children).toHaveLength(3)
    expect(tree.children[1].props['text']).toContain('合计')

    // 深拷贝验证
    const src = node({ id: 'x', componentName: 'T', props: { deep: { v: 1 } } })
    const t = buildTree(src)
    ;(t.props.deep as any).v = 999
    expect((src.props!.deep as any).v).toBe(1)
  })

  it('跳过缺 id / 缺 componentName 的脏节点并记录', () => {
    const bad = node({
      id: 'root',
      componentName: 'Page',
      children: [
        { id: '', componentName: 'Text' } as NodeSchema,
        { id: 'noComp' } as unknown as NodeSchema,
        { notAnObject: true } as unknown as NodeSchema,
        node({ id: 'ok', componentName: 'Text', children: [] }),
      ],
    })
    const { root, skipped } = buildTreeWithReport(bad)
    expect(root.children).toHaveLength(1)
    expect(root.children[0].id).toBe('ok')
    expect(skipped).toHaveLength(3)
    expect(skipped[0].reason).toContain('id')
    expect(skipped[1].reason).toContain('componentName')
  })

  it('根节点非法时抛错', () => {
    expect(() => buildTree({ id: '', componentName: '' } as NodeSchema)).toThrow()
  })

  it('无 children 时 children 为空数组', () => {
    const t = buildTree(node({ id: 'a', componentName: 'Text' }))
    expect(t.children).toEqual([])
  })
})

describe('extractExpr / resolveProps', () => {
  it('提取 $expr: 前缀', () => {
    expect(extractExpr('$expr: a + 1')).toBe('a + 1')
    expect(extractExpr('$expr:')).toBeNull()
    expect(extractExpr('普通字符串')).toBeNull()
    expect(extractExpr(123)).toBeNull()
  })

  it('resolveProps 求值表达式，未含占位的原样保留', () => {
    const ctx = createPageContext({ defaultFormData: { n: 3 } })
    const out = resolveProps({ a: '$expr: formData.n * 2', b: 'static', c: 7 }, ctx.scope)
    expect(out).toEqual({ a: 6, b: 'static', c: 7 })
  })

  it('表达式写错时该字段置 undefined 并回调，不中断整体', () => {
    const ctx = createPageContext()
    const errs: string[] = []
    const out = resolveProps({ bad: '$expr: 1 +', good: '$expr: 1' }, ctx.scope, (i) => errs.push(i.key))
    expect(errs).toEqual(['bad'])
    expect(out.bad).toBeUndefined()
    expect(out.good).toBe(1)
  })
})

describe('Linkage 依赖收集', () => {
  it('收集 condition / loop / 表达式 props / action / lifecycle 的根依赖', () => {
    const l = new Linkage()
    l.collect(page)

    expect(l.dirtyNodes('formData').has('n1')).toBe(true) // condition
    expect(l.dirtyNodes('formData').has('n2')).toBe(true) // props 表达式 + action
    expect(l.dirtyNodes('formData').has('n3')).toBe(true) // loop
    expect(l.dirtyNodes('formData').has('__lifecycle__')).toBe(true) // lifecycle
    expect(l.rootsOf('n1')).toEqual(new Set(['formData']))
  })

  it('collect 幂等（重复调用不累积）', () => {
    const l = new Linkage()
    l.collect(page)
    l.collect(page)
    // n1(condition) + n2(props/action) + n3(loop) + __lifecycle__ = 4
    expect(l.dirtyNodes('formData')).toHaveLength(4)
  })

  it('数组形式的生命周期钩子逐步收集（回归 B-14）', () => {
    const l = new Linkage()
    l.collect({
      ...page,
      lifecycle: { onInit: ['user.name', 'formData.a + 1'], onMount: 'urlParams.x' },
    } as PageSchema)
    const roots = l.rootsOf('__lifecycle__')
    expect(roots).toEqual(new Set(['user', 'formData', 'urlParams']))
    expect(l.dirtyNodes('user').has('__lifecycle__')).toBe(true)
    expect(l.dirtyNodes('formData').has('__lifecycle__')).toBe(true)
  })

  it('语法错误的表达式不阻断收集', () => {
    const l = new Linkage()
    l.collect({
      id: 'p',
      version: 1,
      name: 'x',
      root: node({ id: 'r', componentName: 'Page', condition: 'formData.a +', children: [] }),
    } as PageSchema)
    expect(l.dirtyNodes('formData').size).toBe(0)
  })

  it('snapshot 输出依赖总览', () => {
    const l = new Linkage()
    l.collect(page)
    const snap = l.snapshot()
    expect(snap.some((s) => s.root === 'formData')).toBe(true)
    expect(snap.find((s) => s.root === 'formData')?.nodeIds.has('__lifecycle__')).toBe(true)
  })
})
