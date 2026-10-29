/**
 * outline.test.ts —— 大纲树面板（Phase 2 批 4，PLANS.md §2）
 *
 * 覆盖：树行与 schema 节点一致（demo 32 行 = root + 30 物料 + 组内子节点）、
 * 点击 ↔ 选中双向联动、选中高亮、折叠/展开、选中自动展开父链、行内删除、root 保护。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import OutlineTree from '../src/panel/OutlineTree.vue'
import { useDesignerStore } from '../src/store/store'
import { findNode } from '../src/core/schema-ops'

beforeEach(() => {
  setActivePinia(createPinia())
})

function mountTree() {
  return mount(OutlineTree)
}

describe('OutlineTree —— 树行与 schema 一致', () => {
  it('demo 全量渲染：34 行（root + 32 物料 + 组内子节点）+ 计数 33 个组件', async () => {
    const store = useDesignerStore()
    const fgChild = findNode(store.schema, 'n-fg')!.children![0]!
    const w = mountTree()
    await nextTick()

    const rows = w.findAll('.lc-outline__row')
    expect(rows).toHaveLength(34)
    expect(w.find('.lc-outline__count').text()).toBe('33 个组件')
    // root 行 label 固定「页面」且排第一
    expect(rows[0]!.text()).toContain('页面')
    expect(rows[0]!.text()).toContain('Page')
    // 新物料在树（批 3 扩容回归）：抽样标签
    const text = w.text()
    expect(text).toContain('日期选择')
    expect(text).toContain('标签页')
    expect(text).toContain(fgChild.componentName)
    w.unmount()
  })

  it('点击行 → store 选中；选中行高亮；画布改选中 → 树高亮跟随（双向联动）', async () => {
    const store = useDesignerStore()
    const w = mountTree()
    await nextTick()

    await w.find('[data-testid="outline-row-n-tag"]').trigger('click')
    expect(store.selectedId).toBe('n-tag')
    expect(w.find('[data-testid="outline-row-n-tag"]').classes()).toContain('lc-outline__row--active')

    // 画布侧改选中 → 树高亮跟随
    store.select('n-input')
    await nextTick()
    expect(w.find('[data-testid="outline-row-n-input"]').classes()).toContain(
      'lc-outline__row--active',
    )
    expect(w.find('[data-testid="outline-row-n-tag"]').classes()).not.toContain(
      'lc-outline__row--active',
    )
    w.unmount()
  })
})

describe('OutlineTree —— 折叠与自动展开', () => {
  it('折叠容器 → 子行消失、计数不变；再展开恢复', async () => {
    const store = useDesignerStore()
    const fgChildId = findNode(store.schema, 'n-fg')!.children![0]!.id
    const w = mountTree()
    await nextTick()
    expect(w.findAll('.lc-outline__row')).toHaveLength(34)

    await w.find('[data-testid="outline-row-n-fg"] .lc-outline__toggle').trigger('click')
    expect(w.findAll('.lc-outline__row')).toHaveLength(33)
    expect(w.find(`[data-testid="outline-row-${fgChildId}"]`).exists()).toBe(false)
    expect(w.find('.lc-outline__count').text()).toBe('33 个组件') // 计数不受折叠影响

    await w.find('[data-testid="outline-row-n-fg"] .lc-outline__toggle').trigger('click')
    expect(w.findAll('.lc-outline__row')).toHaveLength(34)
    w.unmount()
  })

  it('折叠父容器后选中其子节点 → 父链自动展开（选中行可见）', async () => {
    const store = useDesignerStore()
    const fgChildId = findNode(store.schema, 'n-fg')!.children![0]!.id
    const w = mountTree()
    await nextTick()

    await w.find('[data-testid="outline-row-n-fg"] .lc-outline__toggle').trigger('click')
    expect(w.find(`[data-testid="outline-row-${fgChildId}"]`).exists()).toBe(false)

    store.select(fgChildId) // 模拟画布点选组内节点
    await nextTick()
    expect(w.find(`[data-testid="outline-row-${fgChildId}"]`).exists()).toBe(true)
    expect(w.find(`[data-testid="outline-row-${fgChildId}"]`).classes()).toContain(
      'lc-outline__row--active',
    )
    w.unmount()
  })
})

describe('OutlineTree —— 删除联动与 root 保护', () => {
  it('行内删除按钮 → 移除节点（树行与 schema 同步减少）', async () => {
    const store = useDesignerStore()
    const w = mountTree()
    await nextTick()

    await w.find('[data-testid="outline-row-n-tag"] .lc-outline__del').trigger('click')
    expect(findNode(store.schema, 'n-tag')).toBeNull()
    await nextTick()
    expect(w.findAll('.lc-outline__row')).toHaveLength(33)
    expect(w.find('.lc-outline__count').text()).toBe('32 个组件')
    w.unmount()
  })

  it('root 行无删除按钮（页面不可删）', async () => {
    const w = mountTree()
    await nextTick()
    expect(w.find('[data-testid="outline-row-root"] .lc-outline__del').exists()).toBe(false)
    w.unmount()
  })
})

/* ---------------- 2026-10-29 P3：树内拖拽排序 ---------------- */

/** jsdom 没有 DataTransfer，给个最小桩（组件内部另存 dragId，桩只用于 setData/getData 不报错） */
function makeDT() {
  const data: Record<string, string> = {}
  return {
    data,
    setData: (k: string, v: string) => {
      data[k] = v
    },
    getData: (k: string) => data[k] ?? '',
    effectAllowed: '',
    dropEffect: '',
  }
}

/** jsdom 的 rect 全是 0，按需要伪造（ratio 由 clientY / height 决定） */
function fakeRect(el: Element, height = 20): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, height, left: 0, width: 100, bottom: height, right: 100, x: 0, y: 0, toJSON: () => ({}) }),
  })
}

describe('OutlineTree —— 树内拖拽排序（P3）', () => {
  it('拖到容器中段 → into：成为该容器的最后一个子节点', async () => {
    const store = useDesignerStore()
    const fg = findNode(store.schema, 'n-fg')!
    const before = fg.children!.length
    // 拿一个不在 fg 里的顶层节点当源
    const source = store.schema.root.children!.find((c) => c.id !== 'n-fg')!

    const w = mountTree()
    const src = w.get(`[data-testid="outline-row-${source.id}"]`)
    const dst = w.get('[data-testid="outline-row-n-fg"]')
    fakeRect(dst.element)

    const dt = makeDT()
    await src.trigger('dragstart', { dataTransfer: dt })
    await dst.trigger('dragover', { dataTransfer: dt, clientY: 10 })
    expect(dst.classes()).toContain('lc-outline__row--drop-into')
    await dst.trigger('drop', { dataTransfer: dt, clientY: 10 })

    const moved = findNode(store.schema, source.id)!
    expect(findNode(store.schema, 'n-fg')!.children!.map((c) => c.id)).toContain(moved.id)
    expect(findNode(store.schema, 'n-fg')!.children!.length).toBe(before + 1)
    w.unmount()
  })

  it('拖到叶子上半 → before：插到目标前面（顺序真的变了）', async () => {
    const store = useDesignerStore()
    const kids = store.schema.root.children!
    const source = kids[0]!
    const target = kids.find((c) => c.id !== source.id && !(c.children?.length))!

    const w = mountTree()
    const src = w.get(`[data-testid="outline-row-${source.id}"]`)
    const dst = w.get(`[data-testid="outline-row-${target.id}"]`)
    fakeRect(dst.element)

    const dt = makeDT()
    await src.trigger('dragstart', { dataTransfer: dt })
    await dst.trigger('dragover', { dataTransfer: dt, clientY: 2 })
    expect(dst.classes()).toContain('lc-outline__row--drop-before')
    await dst.trigger('drop', { dataTransfer: dt, clientY: 2 })

    const ids = store.schema.root.children!.map((c) => c.id)
    expect(ids.indexOf(source.id)).toBe(ids.indexOf(target.id) - 1)
    w.unmount()
  })

  it('拖到自己的后代上 → 拒绝（不成环）', async () => {
    const store = useDesignerStore()
    const fgChild = findNode(store.schema, 'n-fg')!.children![0]!
    const snapshot = JSON.stringify(store.schema)

    const w = mountTree()
    const src = w.get('[data-testid="outline-row-n-fg"]')
    const dst = w.get(`[data-testid="outline-row-${fgChild.id}"]`)
    fakeRect(dst.element)

    const dt = makeDT()
    await src.trigger('dragstart', { dataTransfer: dt })
    await dst.trigger('dragover', { dataTransfer: dt, clientY: 10 })
    // 不允许：没有落点指示
    expect(dst.classes().some((c) => c.startsWith('lc-outline__row--drop'))).toBe(false)
    await dst.trigger('drop', { dataTransfer: dt, clientY: 10 })
    expect(JSON.stringify(store.schema)).toBe(snapshot)
    w.unmount()
  })

  it('拖拽结束后落点指示清空；root 不可拖', async () => {
    const store = useDesignerStore()
    const kids = store.schema.root.children!
    const w = mountTree()
    const src = w.get(`[data-testid="outline-row-${kids[0]!.id}"]`)
    const dst = w.get(`[data-testid="outline-row-${kids[1]!.id}"]`)
    fakeRect(dst.element)

    const dt = makeDT()
    await src.trigger('dragstart', { dataTransfer: dt })
    await dst.trigger('dragover', { dataTransfer: dt, clientY: 2 })
    expect(dst.classes()).toContain('lc-outline__row--drop-before')
    await src.trigger('dragend')
    expect(dst.classes().some((c) => c.startsWith('lc-outline__row--drop'))).toBe(false)
    // root 行没有 draggable
    expect(w.get('.lc-outline__row').attributes('draggable')).toBe('false')
    w.unmount()
  })
})
