/**
 * schema-ops 单测 —— 设计器批 2（方案 4.3：纯函数 + 全单测，≥90% 覆盖）
 */
import { describe, it, expect } from 'vitest'
import type { PageSchema, NodeSchema, MaterialSchema } from '@lc/schema'
import {
  generateNodeId,
  findNode,
  findParent,
  ancestorIds,
  insertNode,
  removeNode,
  moveNode,
  moveSibling,
  updateProp,
  updateActions,
  readNodeValue,
  setSubmitModel,
  readSubmitModel,
  setRequiredRule,
  readRequiredRule,
  setNodePerm,
} from '../src/core/schema-ops'

/** 最小树：root(a: [b, c(d), e]) */
function tree(): PageSchema {
  const n = (id: string, extra: Partial<NodeSchema> = {}): NodeSchema =>
    ({ id, componentName: 'Text', props: { text: id }, ...extra }) as NodeSchema
  return {
    schemaVersion: '1.0',
    id: 'p1',
    name: 't',
    type: 'form',
    root: n('root', {
      componentName: 'Page',
      children: [n('a'), n('c', { children: [n('d')] }), n('e')],
    }),
  } as PageSchema
}

const container: Pick<MaterialSchema, 'name' | 'defaultProps' | 'isContainer'> = {
  name: 'FormGroup',
  defaultProps: { title: '组' },
  isContainer: true,
}
const leaf: Pick<MaterialSchema, 'name' | 'defaultProps' | 'isContainer'> = {
  name: 'Input',
  defaultProps: { label: '姓名', options: { deep: 1 } },
}

function ids(schema: PageSchema, parentId = schema.root.id): string[] {
  return (findNode(schema, parentId)?.children ?? []).map((c) => c.id)
}

describe('generateNodeId', () => {
  it('连续生成不重复，前缀 n_', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateNodeId()))
    expect(set.size).toBe(200)
    expect([...set][0]!).toMatch(/^n_/)
  })
})

describe('查询：findNode / findParent / ancestorIds', () => {
  it('findNode 深度查找（含 root 与命中 null）', () => {
    const s = tree()
    expect(findNode(s, 'd')?.componentName).toBe('Text')
    expect(findNode(s, 'root')?.componentName).toBe('Page')
    expect(findNode(s, 'nope')).toBeNull()
  })
  it('findParent 返回父与索引；root 无父返回 null', () => {
    const s = tree()
    expect(findParent(s, 'd')).toEqual({ parent: findNode(s, 'c'), index: 0 })
    expect(findParent(s, 'root')).toBeNull()
    expect(findParent(s, 'nope')).toBeNull()
  })
  it('ancestorIds 返回 root→直父链；root 的链为空', () => {
    const s = tree()
    expect(ancestorIds(s, 'd')).toEqual(['root', 'c'])
    expect(ancestorIds(s, 'a')).toEqual(['root'])
    expect(ancestorIds(s, 'root')).toEqual([])
    expect(ancestorIds(s, 'nope')).toEqual([])
  })
})

describe('insertNode', () => {
  it('默认插入 root 末尾；defaultProps 深拷贝 + 容器带 children 初值', () => {
    const s = tree()
    const r = insertNode(s, container)
    expect(r.id).toMatch(/^n_/)
    const created = findNode(r.schema, r.id!)!
    expect(created.componentName).toBe('FormGroup')
    expect(created.props!.title).toBe('组')
    expect(created.children).toEqual([])
    expect(ids(r.schema)).toEqual(['a', 'c', 'e', r.id])
    // 原 schema 不变（纯函数）
    expect(ids(s)).toEqual(['a', 'c', 'e'])
  })

  it('非容器不带 children 字段；defaultProps 是深拷贝（改新节点不碰原对象）', () => {
    const r = insertNode(tree(), leaf)
    const created = findNode(r.schema, r.id!)!
    expect(created.children).toBeUndefined()
    ;(created.props!.options as { deep: number }).deep = 99
    const again = insertNode(tree(), leaf)
    expect((findNode(again.schema, again.id!)!.props!.options as { deep: number }).deep).toBe(1)
  })

  it('指定 parentId/index 插入中间；index 越界夹取到边界', () => {
    const s = tree()
    const mid = insertNode(s, leaf, { parentId: 'root', index: 1 })
    expect(ids(mid.schema)).toEqual(['a', mid.id, 'c', 'e'])
    const over = insertNode(s, leaf, { parentId: 'root', index: 99 })
    expect(ids(over.schema).at(-1)).toBe(over.id)
    const neg = insertNode(s, leaf, { parentId: 'root', index: -5 })
    expect(ids(neg.schema)[0]).toBe(neg.id)
  })

  it('插入指定容器内部；parentId 不存在 → no-op 返回新树与空 id', () => {
    const s = tree()
    const into = insertNode(s, leaf, { parentId: 'c' })
    expect(ids(into.schema, 'c')).toEqual(['d', into.id])
    const bad = insertNode(s, leaf, { parentId: 'nope' })
    expect(bad.id).toBe('')
    expect(ids(bad.schema)).toEqual(['a', 'c', 'e'])
  })
})

describe('removeNode', () => {
  it('删除中间节点（含子树一并移除）', () => {
    const s = tree()
    const r = removeNode(s, 'c')
    expect(r.id).toBe('c')
    expect(ids(r.schema)).toEqual(['a', 'e'])
    expect(findNode(r.schema, 'd')).toBeNull()
    expect(ids(s)).toEqual(['a', 'c', 'e']) // 原树不变
  })

  it('root 永不可删；不存在的 id no-op', () => {
    const s = tree()
    const root = removeNode(s, 'root')
    expect(root.id).toBe('')
    expect(root.schema.root.id).toBe('root')
    expect(ids(root.schema)).toEqual(['a', 'c', 'e'])
    const miss = removeNode(s, 'nope')
    expect(miss.id).toBe('')
    expect(ids(miss.schema)).toEqual(['a', 'c', 'e'])
  })

  it('容器内最后一个子节点删除后容器保留', () => {
    const s = tree()
    const r = removeNode(s, 'd')
    expect(ids(r.schema, 'c')).toEqual([])
    expect(ids(r.schema)).toContain('c')
  })
})

describe('moveNode', () => {
  it('同父换位（1 → 0）', () => {
    const s = tree()
    const r = moveNode(s, 'e', 'root', 0)
    expect(ids(r.schema)).toEqual(['e', 'a', 'c'])
    expect(ids(s)).toEqual(['a', 'c', 'e'])
  })

  it('跨容器（root 末 → c 内部 index 0）', () => {
    const r = moveNode(tree(), 'a', 'c', 0)
    expect(ids(r.schema)).toEqual(['c', 'e'])
    expect(ids(r.schema, 'c')).toEqual(['a', 'd'])
  })

  it('非法目标 no-op：拖到自己 / 拖进自己的子孙 / root 被移 / 目标父不存在', () => {
    const s = tree()
    for (const [node, parent] of [
      ['a', 'a'],
      ['c', 'd'],
      ['root', 'root'],
    ] as const) {
      const r = moveNode(s, node, parent, 0)
      expect(r.id).toBe('')
      expect(ids(r.schema)).toEqual(['a', 'c', 'e'])
    }
    const bad = moveNode(s, 'a', 'nope', 0)
    expect(ids(bad.schema)).toEqual(['a', 'c', 'e'])
  })

  it('moveNode 的 index 越界夹取', () => {
    const r = moveNode(tree(), 'a', 'root', 99)
    expect(ids(r.schema)).toEqual(['c', 'e', 'a'])
  })
})

describe('moveSibling（上移/下移）', () => {
  it('下移一位 / 上移一位', () => {
    expect(ids(moveSibling(tree(), 'a', 1).schema)).toEqual(['c', 'a', 'e'])
    expect(ids(moveSibling(tree(), 'e', -1).schema)).toEqual(['a', 'e', 'c'])
  })
  it('越界 no-op（第一个再上移、最后再下移）；非兄弟位置 no-op', () => {
    const s = tree()
    expect(ids(moveSibling(s, 'a', -1).schema)).toEqual(['a', 'c', 'e'])
    expect(ids(moveSibling(s, 'e', 1).schema)).toEqual(['a', 'c', 'e'])
    expect(ids(moveSibling(s, 'd', 1).schema)).toEqual(['a', 'c', 'e']) // d 的父是 c，单子无位移
    expect(moveSibling(s, 'root', 1).id).toBe('')
    expect(moveSibling(s, 'nope', 1).id).toBe('')
  })
})

describe('updateProp（key 三段约定）', () => {
  it('无前缀 = props；显式 props. 前缀等价', () => {
    let s = tree()
    s = updateProp(s, 'a', 'label', '标题').schema
    expect(findNode(s, 'a')!.props!.label).toBe('标题')
    s = updateProp(s, 'a', 'props.label', '标题2').schema
    expect(findNode(s, 'a')!.props!.label).toBe('标题2')
    expect((tree().root.children![0] as NodeSchema).props!.label).toBeUndefined() // 原树不变
  })

  it('style.xxx 写入 style（含嵌套路径自动建对象）', () => {
    let s = tree()
    s = updateProp(s, 'a', 'style.color', 'red').schema
    expect(findNode(s, 'a')!.style).toEqual({ color: 'red' })
    s = updateProp(s, 'a', 'style.border.width', 2).schema
    expect(findNode(s, 'a')!.style).toEqual({ color: 'red', border: { width: 2 } })
  })

  it('props 嵌套路径自动建对象；空 key / 不存在节点 no-op', () => {
    let s = tree()
    s = updateProp(s, 'a', 'cfg.a.b', 1).schema
    expect(findNode(s, 'a')!.props!.cfg).toEqual({ a: { b: 1 } })
    expect(updateProp(s, 'a', '', 1).schema).toEqual(s)
    expect(updateProp(s, 'a', 'style', {}).id).toBe('a')
    const miss = updateProp(s, 'nope', 'x', 1)
    expect(miss.id).toBe('')
    expect(updateProp(s, 'a', 'style', 1).schema).toEqual(s) // 'style' 裸键 no-op
  })

  it('value 是对象时深拷贝进 schema', () => {
    const obj = { list: [1, 2] }
    const r = updateProp(tree(), 'a', 'cfg', obj)
    ;(obj.list as number[]).push(3)
    expect(findNode(r.schema, 'a')!.props!.cfg).toEqual({ list: [1, 2] })
  })
})

describe('updateActions', () => {
  it('整组替换 actions（深拷贝）；不存在节点 no-op', () => {
    const actions = [{ type: 'toast', title: 't' }] as unknown as Parameters<typeof updateActions>[2]
    const r = updateActions(tree(), 'a', actions)
    expect(findNode(r.schema, 'a')!.actions).toEqual(actions)
    expect(findNode(r.schema, 'a')!.actions).not.toBe(actions)
    expect(updateActions(tree(), 'nope', actions).id).toBe('')
  })
})

describe('setNodePerm（批 6：节点权限点，顶层非 props）', () => {
  it('写顶层 perm 并 trim；不碰 props', () => {
    const r = setNodePerm(tree(), 'a', '  emp_submit ')
    expect(r.id).toBe('a')
    expect(findNode(r.schema, 'a')!.perm).toBe('emp_submit')
    expect(findNode(r.schema, 'a')!.props).toEqual({ text: 'a' })
  })

  it('空串/纯空白 = 清除（perm 写 undefined，节点全员可见）', () => {
    const set = setNodePerm(tree(), 'a', 'x_perm')
    expect(findNode(set.schema, 'a')!.perm).toBe('x_perm')
    const cleared = setNodePerm(set.schema, 'a', '')
    expect(findNode(cleared.schema, 'a')!.perm).toBeUndefined()
    const blank = setNodePerm(set.schema, 'a', '   ')
    expect(findNode(blank.schema, 'a')!.perm).toBeUndefined()
  })

  it('不存在节点 no-op（id 空，schema 为克隆体不报错）', () => {
    const r = setNodePerm(tree(), 'nope', 'x')
    expect(r.id).toBe('')
  })
})

describe('readNodeValue（与 updateProp 对称的读，批 3）', () => {
  it('无前缀 / props. 前缀 → props；style.* → style；event → actions', () => {
    const n = {
      id: 'x',
      componentName: 'Input',
      props: { label: '标签', cfg: { a: { b: 7 } } },
      style: { color: 'red' },
      actions: [{ type: 'setForm', key: 'k', value: 1 }],
    } as unknown as NodeSchema
    expect(readNodeValue(n, 'label')).toBe('标签')
    expect(readNodeValue(n, 'props.label')).toBe('标签')
    expect(readNodeValue(n, 'cfg.a.b')).toBe(7) // 嵌套路径
    expect(readNodeValue(n, 'style.color')).toBe('red')
    expect(readNodeValue(n, 'style')).toEqual({ color: 'red' })
    expect(readNodeValue(n, 'event')).toEqual([{ type: 'setForm', key: 'k', value: 1 }])
  })

  it('缺失路径 / 中途非对象 / 空 key → undefined（不抛错）', () => {
    const n = { id: 'x', componentName: 'Input', props: { label: 'L' } } as unknown as NodeSchema
    expect(readNodeValue(n, 'nope')).toBeUndefined()
    expect(readNodeValue(n, 'label.sub')).toBeUndefined() // 中途遇到字符串
    expect(readNodeValue(n, 'style.color')).toBeUndefined() // style 不存在
    expect(readNodeValue(n, '')).toBeUndefined()
  })

  it('与 updateProp 写后回读一致（对称性）', () => {
    let s = tree()
    s = updateProp(s, 'a', 'style.border.width', 2).schema
    expect(readNodeValue(findNode(s, 'a')!, 'style.border.width')).toBe(2)
    s = updateProp(s, 'a', 'cfg.x', 'v').schema
    expect(readNodeValue(findNode(s, 'a')!, 'cfg.x')).toBe('v')
    expect(readNodeValue(findNode(s, 'nope') ?? n0(), 'label')).toBeUndefined()
  })
})

/** readNodeValue 对「节点不存在」场景：调用方保证节点存在，这里只兜底对象形态 */
function n0(): NodeSchema {
  return { id: 'n0', componentName: 'Text', props: {} } as NodeSchema
}

/* ------------------------------------------------------------------ */
/* 批 4：页面级提交模型（决策 D-A11）                                   */
/* ------------------------------------------------------------------ */

describe('setSubmitModel / readSubmitModel（提交目标模型）', () => {
  it('未配置 → readSubmitModel null；设置后写入 ds_submit + submit.dataSourceId', () => {
    const s = tree()
    expect(readSubmitModel(s)).toBeNull()

    const r = setSubmitModel(s, 'm_emp')
    expect(r.id).toBe('root') // 页面级操作：对象即页面 → store 沿用 `if (!r.id) return`
    expect(readSubmitModel(r.schema)).toBe('m_emp')

    const ds = r.schema.dataSources!.find((d) => d.id === 'ds_submit')!
    expect(ds).toMatchObject({ type: 'model', method: 'POST', modelId: 'm_emp' })
    expect(r.schema.submit?.dataSourceId).toBe('ds_submit')
  })

  it('换模型：原位替换（数组长度与顺序不变）+ submit 其余字段保留', () => {
    const s = setSubmitModel(tree(), 'm_a').schema
    s.submit!.successToast = '提交成功'
    s.submit!.successAction = { type: 'back' } as never

    const r = setSubmitModel(s, 'm_b')
    expect(r.schema.dataSources).toHaveLength(1)
    expect(readSubmitModel(r.schema)).toBe('m_b')
    expect(r.schema.submit).toMatchObject({
      dataSourceId: 'ds_submit',
      successToast: '提交成功',
      successAction: { type: 'back' },
    })
  })

  it('清除：只删 ds_submit 与 submit，用户自建数据源原样保留', () => {
    const s = setSubmitModel(tree(), 'm_a').schema
    s.dataSources!.push({ id: 'other', name: '其他', type: 'static', data: {} })

    const r = setSubmitModel(s, null)
    expect(r.schema.dataSources!.map((d) => d.id)).toEqual(['other'])
    expect(r.schema.submit).toBeUndefined()
    expect(readSubmitModel(r.schema)).toBeNull()
  })

  it('重复设置同一模型 → ds_submit 仍只有一条', () => {
    let s = tree()
    s = setSubmitModel(s, 'm1').schema
    s = setSubmitModel(s, 'm1').schema
    expect(s.dataSources!.filter((d) => d.id === 'ds_submit')).toHaveLength(1)
  })

  it('纯函数：入参 schema 零副作用', () => {
    const s = tree()
    setSubmitModel(s, 'm_x')
    expect(s.dataSources).toBeUndefined()
    expect(s.submit).toBeUndefined()
  })

  it('读路径兜底：ds 非 model 类型 / 缺 modelId / ds 不存在 → 均 null', () => {
    const http = tree()
    http.dataSources = [{ id: 'api', name: '接口', type: 'http', method: 'GET', url: '/x' }]
    http.submit = { dataSourceId: 'api' }
    expect(readSubmitModel(http)).toBeNull()

    const noModel = tree()
    noModel.dataSources = [{ id: 'ds_submit', name: '提交', type: 'model' }]
    noModel.submit = { dataSourceId: 'ds_submit' }
    expect(readSubmitModel(noModel)).toBeNull()

    const missing = tree()
    missing.submit = { dataSourceId: 'not-exist' }
    expect(readSubmitModel(missing)).toBeNull()
  })
})

describe('setRequiredRule / readRequiredRule（required 校验开关，批 5 / D-A12）', () => {
  /** 给节点造一个已绑定字段的壳（renderer collectRules 需要 props.name，此处只测写路径） */
  function withName(): PageSchema {
    const s = tree()
    findNode(s, 'a')!.props!['name'] = 'empName'
    return s
  }

  it('开启：props.rules 追加 {type:"required"}，read 返回 true', () => {
    const r = setRequiredRule(withName(), 'a', true)
    expect(r.id).toBe('a')
    expect(findNode(r.schema, 'a')!.props!.rules).toEqual([{ type: 'required' }])
    expect(readRequiredRule(findNode(r.schema, 'a')!)).toBe(true)
  })

  it('重复开启 → no-op（rules 仍只有一条，不重复追加）', () => {
    const s = setRequiredRule(withName(), 'a', true).schema
    const r = setRequiredRule(s, 'a', true)
    expect(findNode(r.schema, 'a')!.props!.rules).toHaveLength(1)
  })

  it('关闭：只移除 required，其他规则（pattern 等）原样保留', () => {
    let s = withName()
    findNode(s, 'a')!.props!.rules = [
      { type: 'pattern', value: '^1\\d{10}$' },
      { type: 'required' },
      { type: 'maxLength', value: 20 },
    ]
    const r = setRequiredRule(s, 'a', false)
    expect(findNode(r.schema, 'a')!.props!.rules).toEqual([
      { type: 'pattern', value: '^1\\d{10}$' },
      { type: 'maxLength', value: 20 },
    ])
    expect(readRequiredRule(findNode(r.schema, 'a')!)).toBe(false)
  })

  it('未配置 rules + 关闭 → no-op，不建空数组（避免 schema 噪音字段）', () => {
    const r = setRequiredRule(withName(), 'a', false)
    expect(findNode(r.schema, 'a')!.props!.rules).toBeUndefined()
    expect(readRequiredRule(findNode(r.schema, 'a')!)).toBe(false)
  })

  it('节点不存在 → id 空（store 统一失败判定）', () => {
    const r = setRequiredRule(withName(), 'not-exist', true)
    expect(r.id).toBe('')
  })

  it('纯函数：入参 schema 零副作用', () => {
    const s = withName()
    setRequiredRule(s, 'a', true)
    expect(findNode(s, 'a')!.props!.rules).toBeUndefined()
  })

  it('rules 非数组（脏数据）→ 按未配置处理，开启时覆盖为合法数组', () => {
    const s = withName()
    ;(findNode(s, 'a')!.props as Record<string, unknown>)['rules'] = 'oops'
    const r = setRequiredRule(s, 'a', true)
    expect(findNode(r.schema, 'a')!.props!.rules).toEqual([{ type: 'required' }])
  })
})
