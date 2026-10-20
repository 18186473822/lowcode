/**
 * keyboard.test.ts —— 全局快捷键意图分发（Phase 2 批 4，phase2-plan §8）
 * resolveKeyIntent 是纯函数；事件经真实 dispatch 到目标元素取得 `e.target`（输入态排除语义）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveKeyIntent, type DesignerKeyIntent } from '../src/core/keyboard'

function intentOf(init: KeyboardEventInit, target?: HTMLElement): DesignerKeyIntent | null {
  const el = target ?? document.body
  let out: DesignerKeyIntent | null = null
  el.addEventListener(
    'keydown',
    (ev) => {
      out = resolveKeyIntent(ev)
    },
    { once: true },
  )
  el.dispatchEvent(new KeyboardEvent('keydown', init))
  return out
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('resolveKeyIntent —— 键位映射', () => {
  it('Delete / Backspace → delete', () => {
    expect(intentOf({ key: 'Delete' })).toBe('delete')
    expect(intentOf({ key: 'Backspace' })).toBe('delete')
  })

  it('Ctrl+Z → undo；Ctrl+Shift+Z 与 Ctrl+Y → redo', () => {
    expect(intentOf({ key: 'z', ctrlKey: true })).toBe('undo')
    expect(intentOf({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('redo')
    expect(intentOf({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('redo') // 大写键名兼容
    expect(intentOf({ key: 'y', ctrlKey: true })).toBe('redo')
  })

  it('Meta（macOS Cmd）与 Ctrl 等价', () => {
    expect(intentOf({ key: 'z', metaKey: true })).toBe('undo')
    expect(intentOf({ key: 'v', metaKey: true })).toBe('paste')
  })

  it('Ctrl+C / X / V → copy / cut / paste', () => {
    expect(intentOf({ key: 'c', ctrlKey: true })).toBe('copy')
    expect(intentOf({ key: 'x', ctrlKey: true })).toBe('cut')
    expect(intentOf({ key: 'v', ctrlKey: true })).toBe('paste')
  })

  it('无修饰普通键与未绑定组合 → null（不拦截）', () => {
    expect(intentOf({ key: 'a' })).toBeNull()
    expect(intentOf({ key: 'a', ctrlKey: true })).toBeNull()
    expect(intentOf({ key: 'F5' })).toBeNull()
  })
})

describe('resolveKeyIntent —— 输入态一律不拦截（文本原生行为优先）', () => {
  it('INPUT 里的 Delete / Ctrl+Z（原生文本撤销）/ Ctrl+V 全部 null', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(intentOf({ key: 'Delete' }, input)).toBeNull()
    expect(intentOf({ key: 'Backspace' }, input)).toBeNull()
    expect(intentOf({ key: 'z', ctrlKey: true }, input)).toBeNull()
    expect(intentOf({ key: 'v', ctrlKey: true }, input)).toBeNull()
  })

  it('TEXTAREA / contenteditable 同样不拦截', () => {
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    expect(intentOf({ key: 'Delete' }, ta)).toBeNull()

    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)
    expect(intentOf({ key: 'Delete' }, div)).toBeNull()
  })

  it('非输入目标（body/普通元素）正常分发', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    expect(intentOf({ key: 'Delete' }, div)).toBe('delete')
    expect(intentOf({ key: 'z', ctrlKey: true }, div)).toBe('undo')
  })
})
