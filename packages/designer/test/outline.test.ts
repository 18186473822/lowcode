/**
 * outline.test.ts —— 大纲树面板（Phase 2 批 4，phase2-plan §8）
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
