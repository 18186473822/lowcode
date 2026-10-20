import { describe, it, expect, vi } from 'vitest'
import type { NodeSchema, PageSchema } from '@lc/schema'
import { buildTree } from '../src/core/build.js'
import { resolveTree, flatten, findFirstErrorNode } from '../src/core/resolve.js'
import { createPageContext } from '../src/core/context.js'

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

function makeTree(p: NodeSchema) {
  return buildTree(p)
}

describe('resolveTree — condition', () => {
  const tree = makeTree(
    node({
      id: 'root',
      componentName: 'Page',
      children: [
        node({ id: 'a', componentName: 'Text', condition: 'formData.show', children: [] }),
        node({ id: 'b', componentName: 'Text', condition: false, children: [] }),
        node({ id: 'c', componentName: 'Text', children: [] }),
      ],
    }),
  )

  it('condition 为 true / 无 condition 时可见', () => {
    const ctx = createPageContext({ defaultFormData: { show: true } })
    const out = resolveTree(tree, { scope: ctx.scope })
    expect(out[0].visible).toBe(true)
    expect(out[0].children[1].visible).toBe(false) // condition: false
    expect(out[0].children[2].visible).toBe(true)
  })

  it('condition 为 false 时不可见', () => {
    const ctx = createPageContext({ defaultFormData: { show: false } })
    const out = resolveTree(tree, { scope: ctx.scope })
    expect(out[0].children[0].visible).toBe(false)
  })

  it('表达式写错时默认可见并回调（不白屏）', () => {
    const ctx = createPageContext({ defaultFormData: {} })
    const onExprError = vi.fn()
    const bad = makeTree(
      node({ id: 'root', componentName: 'Page', children: [node({ id: 'x', componentName: 'T', condition: 'nope()', children: [] })] }),
    )
    const out = resolveTree(bad, { scope: ctx.scope, onExprError })
    expect(out[0].children[0].visible).toBe(true)
    expect(out[0].children[0].exprError).toBe(true)
    expect(onExprError).toHaveBeenCalledTimes(1)
  })
})

describe('resolveTree — 父子可见性传播', () => {
  it('父不可见时子节点不解算（children 为空）', () => {
    const tree = makeTree(
      node({
        id: 'root',
        componentName: 'Page',
        children: [
          node({
            id: 'parent',
            componentName: 'View',
            condition: false,
            children: [node({ id: 'child', componentName: 'Text', children: [] })],
          }),
        ],
      }),
    )
    const ctx = createPageContext()
    const out = resolveTree(tree, { scope: ctx.scope })
    expect(out[0].children[0].visible).toBe(false)
    expect(out[0].children[0].children).toEqual([])
  })
})

describe('resolveTree — loop 展开', () => {
  it('按数组展开，注入 item / index 局部变量', () => {
    const tree = makeTree(
      node({
        id: 'root',
        componentName: 'Page',
        children: [
          node({
            id: 'row',
            componentName: 'View',
            loop: '$expr: formData.list',
            children: [node({ id: 'txt', componentName: 'Text', props: { t: '$expr: item.name' }, children: [] })],
          }),
        ],
      }),
    )
    const ctx = createPageContext({
      defaultFormData: { list: [{ name: 'A' }, { name: 'B' }] },
    })
    const out = resolveTree(tree, { scope: ctx.scope })
    const rows = out[0].children
    expect(rows).toHaveLength(2)
    expect(rows[0].item).toEqual({ name: 'A' })
    expect(rows[0].index).toBe(0)
    expect(rows[1].index).toBe(1)
    expect(rows[0].children[0].props['t']).toBe('A')
    expect(rows[1].children[0].props['t']).toBe('B')
    // 原 scope 不被污染
    expect(Object.prototype.hasOwnProperty.call(ctx.scope, 'item')).toBe(false)
  })

  it('自定义 loopArgs', () => {
    const tree = makeTree(
      node({
        id: 'root',
        componentName: 'Page',
        children: [
          node({
            id: 'row',
            componentName: 'View',
            loop: '$expr: formData.list',
            loopArgs: ['it', 'i'],
            children: [node({ id: 't', componentName: 'Text', props: { v: '$expr: i' }, children: [] })],
          }),
        ],
      }),
    )
    const ctx = createPageContext({ defaultFormData: { list: ['x', 'y'] } })
    const out = resolveTree(tree, { scope: ctx.scope })
    const texts = out[0].children.map((row) => row.children[0].props['v'])
    expect(texts).toEqual([0, 1])
    expect(out[0].children[0].index).toBe(0)
    expect(out[0].children[1].index).toBe(1)
  })

  it('loop 非数组时按单节点处理', () => {
    const tree = makeTree(
      node({
        id: 'root',
        componentName: 'Page',
        children: [node({ id: 'row', componentName: 'View', loop: '$expr: formData.x', children: [] })],
      }),
    )
    const ctx = createPageContext({ defaultFormData: { x: 123 } })
    const out = resolveTree(tree, { scope: ctx.scope })
    expect(out[0].children).toHaveLength(1)
    expect(out[0].children[0].visible).toBe(true)
  })

  it('展开数超限截断并回调', () => {
    const onLoopOverflow = vi.fn()
    const tree = makeTree(
      node({
        id: 'root',
        componentName: 'Page',
        children: [node({ id: 'row', componentName: 'View', loop: '$expr: formData.big', children: [] })],
      }),
    )
    const big = Array.from({ length: 20 }, (_, i) => i)
    const ctx = createPageContext({ defaultFormData: { big } })
    const out = resolveTree(tree, { scope: ctx.scope, maxLoopItems: 5, onLoopOverflow })
    expect(out[0].children).toHaveLength(5)
    expect(onLoopOverflow).toHaveBeenCalledWith({ nodeId: 'row', limit: 5, actual: 20 })
  })
})

describe('resolveTree — 权限 / props / 错误挂载', () => {
  it('perm 无权限时节点不可见', () => {
    const tree = makeTree(
      node({ id: 'root', componentName: 'Page', children: [node({ id: 's', componentName: 'Btn', perm: 'admin', children: [] })] }),
    )
    const ctx = createPageContext()
    expect(resolveTree(tree, { scope: ctx.scope, hasPerm: () => false })[0].children[0].visible).toBe(false)
    expect(resolveTree(tree, { scope: ctx.scope, hasPerm: () => true })[0].children[0].visible).toBe(true)
    // 未提供 hasPerm 视为有权限
    expect(resolveTree(tree, { scope: ctx.scope })[0].children[0].visible).toBe(true)
  })

  it('props 中的 $expr 已求值，静态值保留', () => {
    const tree = makeTree(
      node({ id: 'root', componentName: 'Page', children: [node({ id: 't', componentName: 'Text', props: { a: '$expr: formData.n + 1', b: 'keep' }, children: [] })] }),
    )
    const ctx = createPageContext({ defaultFormData: { n: 1 } })
    expect(resolveTree(tree, { scope: ctx.scope })[0].children[0].props).toEqual({ a: 2, b: 'keep' })
  })

  it('校验错误按 nodeId 挂载到节点', () => {
    const tree = makeTree(
      node({ id: 'root', componentName: 'Page', children: [node({ id: 'f1', componentName: 'Input', children: [] })] }),
    )
    const ctx = createPageContext()
    const errors = new Map([['f1', '请填写名称']])
    expect(resolveTree(tree, { scope: ctx.scope, errors })[0].children[0].error).toBe('请填写名称')
  })
})

describe('flatten / findFirstErrorNode', () => {
  const tree = makeTree(
    node({
      id: 'root',
      componentName: 'Page',
      children: [
        node({ id: 'a', componentName: 'T', condition: false, children: [node({ id: 'a1', componentName: 'T', children: [] })] }),
        node({ id: 'b', componentName: 'T', children: [node({ id: 'b1', componentName: 'T', children: [] })] }),
      ],
    }),
  )

  it('flatten 默认只含可见节点；父不可见时子树不解算，故 includeHidden 也不含', () => {
    const ctx = createPageContext()
    const out = resolveTree(tree, { scope: ctx.scope })
    expect(flatten(out).map((n) => n.node.id)).toEqual(['root', 'b', 'b1'])
    // 父 condition=false → 子树不解算（性能取舍，见 resolve.ts 注释）
    expect(flatten(out, true).map((n) => n.node.id)).toEqual(['root', 'a', 'b', 'b1'])
  })

  it('findFirstErrorNode 返回首个错误节点（隐藏子树不参与定位）', () => {
    const ctx = createPageContext()
    const out = resolveTree(tree, { scope: ctx.scope })
    expect(findFirstErrorNode(out, new Map([['b1', 'x']]))?.node.id).toBe('b1')
    expect(findFirstErrorNode(out, new Map([['a1', 'x']]))).toBeNull()
    expect(findFirstErrorNode(out, new Map())).toBeNull()
  })
})
