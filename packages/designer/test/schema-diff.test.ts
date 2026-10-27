/**
 * schema-diff.test.ts —— 批 5 结构化 diff 纯函数（PLANS.md §2 / D-P2-9）。
 *
 * 覆盖：空 diff / add / remove / 子树只报顶层 / change 多键与键消失 /
 * componentName 变化 / move 换父换序 / 输出顺序约定（remove→add→change→move）。
 */
import { describe, it, expect } from 'vitest'
import type { PageSchema, NodeSchema } from '@lc/schema'
import { diffSchema, type DiffEntry } from '../src/core/schema-diff'

/* ---------------- fixture：手工小树（比 demoPage 更可控） ---------------- */

function node(id: string, componentName: string, props: Record<string, unknown> = {}, children?: NodeSchema[]): NodeSchema {
  return { id, componentName, props, ...(children ? { children } : {}) }
}

function page(rootChildren: NodeSchema[], rootProps: Record<string, unknown> = {}): PageSchema {
  return {
    id: 'p_diff',
    name: 'p_diff',
    schemaVersion: '1.0.0',
    root: node('root', 'Page', rootProps, rootChildren),
  } as PageSchema
}

function kinds(entries: DiffEntry[]): string[] {
  return entries.map((e) => e.kind)
}

describe('批 5：diffSchema 结构化 diff', () => {
  it('相同结构与属性 → 空数组', () => {
    const a = page([node('n1', 'n-text', { label: 'hi' })])
    const b = page([node('n1', 'n-text', { label: 'hi' })])
    expect(diffSchema(a, b)).toEqual([])
    expect(diffSchema(a, a)).toEqual([])
  })

  it('add：新节点出现在当前画布 → 一条 add（父 = root）', () => {
    const before = page([])
    const after = page([node('n1', 'n-text', { label: '新' })])
    const entries = diffSchema(before, after)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: 'add',
      id: 'n1',
      componentName: 'n-text',
      parentId: 'root',
    })
  })

  it('add 子树（fg + 子节点）只报顶层 1 条，不逐子报', () => {
    const before = page([])
    const after = page([
      node('n1', 'n-form-item', { label: '表单项' }, [node('n2', 'n-input', {})]),
    ])
    const entries = diffSchema(before, after)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'add', id: 'n1' })
  })

  it('remove：节点在历史版、当前已删 → 1 条 remove；子树不重复报', () => {
    // 被删节点放末位：幸存兄弟 index 不位移，不产生连带 move（位置语义见 move 用例）
    const before = page([
      node('n4', 'n-text', {}),
      node('n1', 'n-form-item', {}, [node('n2', 'n-input', {}), node('n3', 'n-input', {})]),
    ])
    const after = page([node('n4', 'n-text', {})])
    const entries = diffSchema(before, after)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: 'remove',
      id: 'n1',
      componentName: 'n-form-item',
      parentId: 'root',
    })
    // n2/n3 作为 n1 子树并入本条，不单独出现
    expect(entries.find((e) => e.id === 'n2')).toBeUndefined()
  })

  it('父节点保留、单子删除 → remove 报在正确的父级下', () => {
    // 删 n3（末位）：n2 的同级 index 不动，不会产生连带 move
    const before = page([
      node('n1', 'n-form-item', {}, [node('n2', 'n-input', {}), node('n3', 'n-input', {})]),
    ])
    const after = page([node('n1', 'n-form-item', {}, [node('n2', 'n-input', {})])])
    const entries = diffSchema(before, after)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'remove', id: 'n3', parentId: 'n1' })
  })

  it('change：多键差异 + 键消失（after 显示「（无）」）', () => {
    const before = page([
      node('n1', 'n-input', { label: '姓名', placeholder: '请输入', required: true }),
    ])
    const after = page([node('n1', 'n-input', { label: '昵称', clearable: true })])
    const entries = diffSchema(before, after)
    const changes = entries.filter((e) => e.kind === 'change')
    expect(changes.map((e) => (e as { field: string }).field).sort()).toEqual([
      'props.clearable',
      'props.label',
      'props.placeholder',
      'props.required',
    ])
    const label = changes.find((e) => (e as { field: string }).field === 'props.label')!
    expect(label).toMatchObject({ before: '"姓名"', after: '"昵称"' })
    const placeholder = changes.find((e) => (e as { field: string }).field === 'props.placeholder')!
    expect(placeholder).toMatchObject({ before: '"请输入"', after: '（无）' })
    const clearable = changes.find((e) => (e as { field: string }).field === 'props.clearable')!
    expect(clearable).toMatchObject({ before: '（无）', after: 'true' })
  })

  it('change：对象值整体比较（style 不逐键展开，但内部变化能报出）', () => {
    const before = page([node('n1', 'n-text', { style: { color: '#000', fontSize: 14 } })])
    const after = page([node('n1', 'n-text', { style: { color: '#f00', fontSize: 14 } })])
    const entries = diffSchema(before, after)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'change', field: 'props.style' })
  })

  it('change：componentName 变化 → field=componentName', () => {
    const before = page([node('n1', 'n-text', { label: 'x' })])
    const after = page([node('n1', 'n-button', { label: 'x' })])
    const entries = diffSchema(before, after)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: 'change',
      field: 'componentName',
      before: 'n-text',
      after: 'n-button',
    })
  })

  it('move：换父 + 同级换序；root 恒无 move', () => {
    // before: root > [n1 > n2, n3]；after: root > [n3, n1, n2]（n2 换父到 root、n1/n3 换序）
    const before = page([node('n1', 'n-container', {}, [node('n2', 'n-text', {})]), node('n3', 'n-text', {})])
    const after = page([node('n3', 'n-text', {}), node('n1', 'n-container', {}), node('n2', 'n-text', {})])
    const entries = diffSchema(before, after)
    const moves = entries.filter((e) => e.kind === 'move')
    // n2 父 n1→root、n1 root@0→root@1、n3 root@1→root@0 —— 三个 move（无 add/remove）
    expect(moves.map((m) => m.id).sort()).toEqual(['n1', 'n2', 'n3'])
    const n2 = moves.find((m) => m.id === 'n2')!
    expect(n2.before).toBe('n1@0')
    expect(n2.after).toBe('root@2')
    // 无任何以 root 为主体的 move 条目
    expect(moves.find((m) => m.id === 'root')).toBeUndefined()
    expect(kinds(entries)).not.toContain('add')
    expect(kinds(entries)).not.toContain('remove')
  })

  it('组合场景：输出顺序约定 remove → add → change → move', () => {
    // before: [n_keep, n_move, n_del]；after: [n_move, n_keep(改), n_add]
    const before = page([
      node('n_keep', 'n-text', { label: '保留' }),
      node('n_move', 'n-text', { label: '移动' }),
      node('n_del', 'n-text', { label: '旧' }),
    ])
    const after = page([
      node('n_move', 'n-text', { label: '移动' }),
      node('n_keep', 'n-text', { label: '保留改' }),
      node('n_add', 'n-button', { label: '新增' }),
    ])
    const entries = diffSchema(before, after)
    // remove(n_del) → add(n_add) → change(n_keep.props.label) → move(n_keep) → move(n_move)
    expect(kinds(entries)).toEqual(['remove', 'add', 'change', 'move', 'move'])
    expect(entries[0]).toMatchObject({ kind: 'remove', id: 'n_del' })
    expect(entries[1]).toMatchObject({ kind: 'add', id: 'n_add' })
    expect(entries[2]).toMatchObject({ kind: 'change', id: 'n_keep', field: 'props.label' })
    expect(entries[3]).toMatchObject({ kind: 'move', id: 'n_keep' })
    expect(entries[4]).toMatchObject({ kind: 'move', id: 'n_move' })
  })

  it('root 自身 props 变化照常报 change（如表单默认值）', () => {
    const before = page([], { defaultFormData: { name: '' } })
    const after = page([], { defaultFormData: { name: '张三' } })
    const entries = diffSchema(before, after)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: 'change',
      id: 'root',
      field: 'props.defaultFormData',
    })
  })

  it('长值截断到 80 字符（带省略号），不撑爆列表', () => {
    const long = 'x'.repeat(200)
    const before = page([node('n1', 'n-text', { label: 'a' })])
    const after = page([node('n1', 'n-text', { label: long })])
    const entries = diffSchema(before, after)
    const change = entries.find((e) => e.kind === 'change')!
    const afterVal = (change as { after: string }).after
    expect(afterVal.length).toBe(79) // 78 字符 + '…'
    expect(afterVal.endsWith('…')).toBe(true)
  })
})
