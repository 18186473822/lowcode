/**
 * clipboard.test.ts —— 复制/剪切/粘贴（Phase 2 批 4，phase2-plan §8 / DoD ②）
 *
 * 覆盖：root 禁拷、remapIds 递归换 id、粘贴三定位规则（容器内/同级后/root 末尾）、
 * 跨页剪贴板保留（DoD ②「剪贴板跨页粘贴」）、粘贴后选中新根、校验无重复 id。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { validatePage } from '@lc/schema'
import { useDesignerStore } from '../src/store/store'
import { findNode, cloneSubtree, remapIds, pasteNode } from '../src/core/schema-ops'
import { demoPage } from '../src/fixtures/demo-page'

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 收集子树全部 id */
function collectIds(id: string, schema: ReturnType<typeof demoPage>): string[] {
  const node = findNode(schema, id)
  if (!node) return []
  const out = [node.id]
  for (const c of node.children ?? []) out.push(...collectIds(c.id, schema))
  return out
}

describe('schema-ops 纯函数：cloneSubtree / remapIds / pasteNode', () => {
  it('cloneSubtree 深拷贝（改副本不伤源）', () => {
    const page = demoPage()
    const node = findNode(page, 'n-text')!
    const copy = cloneSubtree(node)
    ;(copy.props as { text?: string }).text = '被改'
    expect((findNode(page, 'n-text')!.props as { text?: string }).text).toBe('标题')
    expect(copy.id).toBe(node.id) // clone 不换 id（换 id 是粘贴时的 remap 职责）
  })

  it('remapIds 递归重映射整棵子树（结构/props 保留、id 全新且不重复）', () => {
    const page = demoPage()
    const fg = findNode(page, 'n-fg')!
    const before = collectIds('n-fg', page)
    expect(before.length).toBeGreaterThan(1) // fg + 组内子节点
    const remapped = remapIds(fg)
    const newIds = [remapped.id, ...(remapped.children ?? []).map((c) => c.id)]
    expect(newIds).toHaveLength(before.length)
    for (const id of newIds) expect(before).not.toContain(id) // 与原树零交集
    expect(remapped.componentName).toBe(fg.componentName)
    expect(remapped.children?.[0]?.componentName).toBe(fg.children?.[0]?.componentName)
  })

  it('pasteNode 定位三规则', () => {
    const page = demoPage()
    const clip = cloneSubtree(findNode(page, 'n-tag')!)

    // 规则①：选中容器 n-fg → 组内末尾
    const r1 = pasteNode(page, clip, 'n-fg')
    expect(r1.id).toBeTruthy()
    expect(findNode(r1.schema, 'n-fg')!.children!.at(-1)!.id).toBe(r1.id)

    // 规则②：选中叶子 n-text → 同级之后（root.children[1]）
    const r2 = pasteNode(page, clip, 'n-text')
    const kids = r2.schema.root.children!
    expect(kids[1]!.id).toBe(r2.id)
    expect(kids[2]!.id).toBe('n-input')

    // 规则③：无选中 → root 末尾
    const r3 = pasteNode(page, clip)
    expect(r3.schema.root.children!.at(-1)!.id).toBe(r3.id)
  })

  it('pasteNode 粘贴根 id 与剪贴板原 id 不同（防重复 id 门禁）', () => {
    const page = demoPage()
    const clip = cloneSubtree(findNode(page, 'n-text')!)
    const r = pasteNode(page, clip, undefined)
    expect(r.id).not.toBe(clip.id)
    expect(validatePage(r.schema).errors.filter((e) => e.message.includes('重复'))).toHaveLength(0)
  })
})

describe('store 剪贴板 —— DoD ②：跨页粘贴', () => {
  it('复制 → 换页（newPage）→ 剪贴板保留 → 粘贴成功（内容同、id 新）', async () => {
    const store = useDesignerStore()
    store.select('n-tag')
    expect(store.copyById('n-tag')).toBe(true)
    const clipSnapshot = { componentName: store.clipboard!.componentName, props: { ...store.clipboard!.props } }

    expect(store.newPage('p_cross')).toBe(true)
    await nextTick()
    expect(store.clipboard).not.toBeNull() // 换页不清剪贴板

    const beforeLen = store.schema.root.children!.length
    expect(store.paste()).toBe(true)
    const pasted = store.schema.root.children!.at(-1)!
    expect(store.schema.root.children).toHaveLength(beforeLen + 1)
    expect(pasted.id).not.toBe('n-tag')
    expect(pasted.componentName).toBe(clipSnapshot.componentName)
    expect(pasted.props).toMatchObject(clipSnapshot.props as Record<string, unknown>)
    expect(store.selectedId).toBe(pasted.id) // 选中新粘贴根
  })

  it('复制 → 打开另一页（openPage 路径：replaceSchema）→ 仍可粘贴', async () => {
    const store = useDesignerStore()
    expect(store.copyById('n-input')).toBe(true)
    // 模拟 openPage 的整体替换（api 未注入时直接 replaceSchema 同路径）
    store.replaceSchema(demoPage())
    await nextTick()
    expect(store.paste()).toBe(true)
    expect(store.schema.root.children!.at(-1)!.componentName).toBe('Input')
  })

  it('root 不可复制；空剪贴板粘贴 no-op；无效 id 复制失败', async () => {
    const store = useDesignerStore()
    expect(store.copyById('root')).toBe(false)
    expect(store.clipboard).toBeNull()
    expect(store.paste()).toBe(false)
    expect(store.copyById('n_not_exists')).toBe(false)
    // root 粘贴按钮的禁用态来源：isRootSelected —— paste 空剪贴板已证 no-op
    expect(store.copyById('')).toBe(false)
  })

  it('容器内粘贴（选中 n-fg）→ 组内末尾 + 选中新根', async () => {
    const store = useDesignerStore()
    store.copyById('n-tag')
    store.select('n-fg')
    const fgBefore = findNode(store.schema, 'n-fg')!.children!.length
    expect(store.paste()).toBe(true)
    const fg = findNode(store.schema, 'n-fg')!
    expect(fg.children).toHaveLength(fgBefore + 1)
    expect(store.selectedId).toBe(fg.children!.at(-1)!.id)
    expect(store.selectedId).not.toBe('n-tag')
  })

  it('叶子后粘贴（选中 n-text）→ 插同级下一位', async () => {
    const store = useDesignerStore()
    store.copyById('n-tag')
    store.select('n-text')
    expect(store.paste()).toBe(true)
    const kids = store.schema.root.children!
    expect(kids[1]!.id).toBe(store.selectedId)
    expect(kids[2]!.id).toBe('n-input')
  })

  it('剪切 = 复制 + 删除；剪切后粘贴内容回来（id 新）', async () => {
    const store = useDesignerStore()
    const before = store.schema.root.children!.length
    expect(store.cutById('n-tag')).toBe(true)
    await nextTick()
    expect(store.schema.root.children).toHaveLength(before - 1)
    expect(findNode(store.schema, 'n-tag')).toBeNull()
    expect(store.clipboard!.componentName).toBe('Tag')

    store.clearSelect() // 无选中 → 规则③ root 末尾
    expect(store.paste()).toBe(true)
    expect(store.schema.root.children).toHaveLength(before)
    expect(store.schema.root.children!.at(-1)!.componentName).toBe('Tag')
    expect(store.canUndo).toBe(true) // 剪切/粘贴均可撤销
  })

  it('粘贴不进撤销栈的例外不存在：粘贴是编辑，undo 可回退', async () => {
    const store = useDesignerStore()
    store.copyById('n-tag')
    const before = store.schema.root.children!.length
    store.paste()
    await nextTick()
    store.undo()
    await nextTick()
    expect(store.schema.root.children).toHaveLength(before)
  })
})
