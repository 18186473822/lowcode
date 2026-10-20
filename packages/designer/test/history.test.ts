/**
 * history.test.ts —— 撤销/重做双栈（Phase 2 批 4，phase2-plan §8 / DoD ①）
 *
 * 关键语义：
 * - 每个独立 action（一个用户事件）= 一个快照 —— 测试以 `nextTick` 分隔模拟事件间隔
 *   （Vue watch pre flush 会把同 tick 连写合并为一次入栈，真实 UI 天然按事件分隔）；
 * - 换页/重置（replaceSchema/openPage/newPage）**不入栈且清栈**；
 * - setProp 的 required 联动两连写 = **一次**入栈（pre flush 合并）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useDesignerStore } from '../src/store/store'
import { findNode } from '../src/core/schema-ops'

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 一步操作 + 等待 watch flush（等价一次独立用户事件） */
async function step(run: () => void | boolean): Promise<void> {
  run()
  await nextTick()
}

describe('撤销/重做 —— DoD ①：10 步操作准确回退与恢复', () => {
  it('10 步混合操作 → undo×10 回初始 → redo×10 回终态', async () => {
    const store = useDesignerStore()
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
    const initialCount = store.schema.root.children!.length

    // 10 步（覆盖插入/改属性/删除/移动多类入口，不重复单一路径）
    await step(() => void store.insertMaterial('Text'))
    await step(() => void store.insertMaterial('Input'))
    await step(() => void store.setProp(store.selectedId, 'label', '改名单'))
    await step(() => void store.insertMaterial('Button'))
    await step(() => void store.removeById('n-btn')) // 删既有节点
    await step(() => void store.moveById('n-input', 1)) // 移动（n-input 索引 1 → 下移有效；越界 no-op 不换引用不入栈）
    await step(() => void store.setProp('n-input', 'disabled', true))
    await step(() => void store.insertMaterial('Tag'))
    await step(() => void store.removeById(store.selectedId)) // 删刚插入的 Tag
    await step(() => void store.setProp('n-text', 'text', '终态标题'))

    expect(store.undoStack).toHaveLength(10)
    const finalCount = store.schema.root.children!.length
    expect(findNode(store.schema, 'n-btn')).toBeNull() // 第 5 步删除生效
    expect(store.canRedo).toBe(false)

    // undo×10 → 初始结构
    for (let i = 10; i >= 1; i--) {
      expect(store.undo()).toBe(true)
      await nextTick()
      expect(store.undoStack).toHaveLength(i - 1)
    }
    expect(store.canUndo).toBe(false)
    expect(store.schema.root.children).toHaveLength(initialCount)
    expect(findNode(store.schema, 'n-btn')).toBeTruthy() // 删除被撤销
    expect((findNode(store.schema, 'n-text')!.props as { text?: string }).text).toBe('标题') // 改名被撤销
    expect(store.undo()).toBe(false) // 空栈 no-op
    expect(store.canRedo).toBe(true)

    // redo×10 → 终态
    for (let i = 1; i <= 10; i++) {
      expect(store.redo()).toBe(true)
      await nextTick()
      expect(store.redoStack).toHaveLength(10 - i)
    }
    expect(store.canRedo).toBe(false)
    expect(store.schema.root.children).toHaveLength(finalCount)
    expect(findNode(store.schema, 'n-btn')).toBeNull()
    expect((findNode(store.schema, 'n-text')!.props as { text?: string }).text).toBe('终态标题')

    // 撤销链中间任意点重做栈被新编辑清空
    store.undo()
    await nextTick()
    expect(store.canRedo).toBe(true)
    await step(() => void store.insertMaterial('Image'))
    expect(store.canRedo).toBe(false)
  })

  it('setProp 的 required 联动（props.required + props.rules 两连写）只入栈一个快照', async () => {
    const store = useDesignerStore()
    await step(() => store.setProp('n-input', 'required', true))
    expect(store.undoStack).toHaveLength(1)
    await step(() => store.setProp('n-input', 'required', false))
    expect(store.undoStack).toHaveLength(2)
    // 回退一次 → required 关闭态（rules 与星号一起回）
    store.undo()
    await nextTick()
    const node = findNode(store.schema, 'n-input')!
    expect(node.props!['required']).toBe(true)
    expect(Array.isArray(node.props!['rules'])).toBe(true)
  })
})

describe('撤销/重做 —— 换页与重置语义', () => {
  it('newPage / openPage（replaceSchema 路径）：不入栈且清空双栈，undo 不跨页', async () => {
    const store = useDesignerStore()
    await step(() => void store.insertMaterial('Text'))
    expect(store.canUndo).toBe(true)

    expect(store.newPage('p_other')).toBe(true)
    await nextTick()
    expect(store.canUndo).toBe(false) // 清栈
    expect(store.canRedo).toBe(false)
    expect(store.undo()).toBe(false) // 不会把上一页 schema 覆盖过来
    expect(store.schema.root.children).toHaveLength(32) // 新页 demo 初始结构

    // 新页上的编辑照常入栈
    await step(() => void store.insertMaterial('Text'))
    expect(store.undoStack).toHaveLength(1)
  })

  it('undo 恢复后：失效选中被清理，仍存在的选中保留', async () => {
    const store = useDesignerStore()
    await step(() => store.setProp('n-text', 'text', '临时')) // 不改变选中的编辑
    store.select('n-input')
    store.undo() // 恢复到编辑前：n-input 仍在树中 → 选中保留
    await nextTick()
    expect(store.selectedId).toBe('n-input')

    // 删除选中节点 → redo 让删除生效 → 选中清理
    store.select('n-text')
    await step(() => void store.removeById('n-text'))
    await step(() => void store.insertMaterial('Tag')) // 让 redo 栈非空
    // 连续两步：先 undo Tag，再 undo 删除 → 恢复 n-text（选中保留路径已测）
    // 直接验证 redo 后选中清理：
    store.undo()
    await nextTick()
    store.redo()
    await nextTick()
    expect(store.selectedId).not.toBe('n-text')
    expect(store.selectedId === '' || findNode(store.schema, store.selectedId)).toBeTruthy()
  })

  it('replaceSchema 本身不入栈（suspend 语义）', async () => {
    const store = useDesignerStore()
    store.replaceSchema({ ...store.schema, id: 'p_x' } as typeof store.schema)
    await nextTick()
    expect(store.canUndo).toBe(false)
  })
})

describe('撤销/重做 —— 栈上限 50', () => {
  it('连续 60 步编辑后 past 只保留最近 50 个快照（丢最旧）', async () => {
    const store = useDesignerStore()
    for (let i = 0; i < 60; i++) {
      store.setProp('n-text', 'text', `标题${i}`)
      await nextTick()
    }
    expect(store.undoStack).toHaveLength(50)
    // 入栈的是「变更前」快照：第 k 次 setProp 的 prev = 第 k-1 次后的状态（首次 prev 为初始态）。
    // 60 次入栈后裁掉最旧 10 个 → 最旧保留的是第 11 次的 prev = 第 10 次改后的状态 = 标题9
    const oldest = store.undoStack[0]!
    expect((findNode(oldest, 'n-text')!.props as { text?: string }).text).toBe('标题9')
  })
})
