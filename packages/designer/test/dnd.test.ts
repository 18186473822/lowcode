/**
 * LcCanvas DnD 测试 —— 设计器批 2（D-A5：dragover 锚点 → 指示线 → drop 分发来源）
 *
 * jsdom 无真实拖拽与布局：getBoundingClientRect 全 0 → computeAnchor 走 fallback（root into），
 * 正好覆盖「画布空白拖入 root 末尾」主链路；精确锚点几何已由 anchor.test 纯单测覆盖，
 * 浏览器实测（台账）验证真实坐标下的指示线位置。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { RuntimeHost } from '@lc/renderer'
import LcCanvas from '../src/canvas/LcCanvas.vue'
import { UNI_SHIMS } from '../src/shim/index'
import { MATERIAL_MAP } from '../src/material-map'
import { demoPage } from '../src/fixtures/demo-page'
import { LC_MATERIAL_MIME, LC_NODE_MIME } from '../src/core/dnd'

const globalComponents = { ...UNI_SHIMS, ...MATERIAL_MAP }

function makeHost() {
  return {
    toast: vi.fn(async (..._args: unknown[]) => {}),
    navigate: vi.fn(async (..._args: unknown[]) => {}),
    back: vi.fn(async (..._args: unknown[]) => {}),
    confirm: vi.fn(async () => true),
    request: vi.fn(async () => ({ statusCode: 200, data: {} })),
  }
}

/** jsdom 可用的 dataTransfer 桩（setData 记录 + getData 按表读取） */
function makeDT(initial: Record<string, string> = {}) {
  const store = { ...initial }
  return {
    setData: vi.fn((k: string, v: string) => {
      store[k] = v
    }),
    getData: (k: string) => store[k] ?? '',
    dropEffect: 'none',
    effectAllowed: 'all',
    _store: store,
  }
}

function mountCanvas() {
  const w = mount(LcCanvas, {
    props: { schema: demoPage(), options: { host: makeHost() as unknown as RuntimeHost } },
    global: { components: globalComponents },
  })
  // B-25 自研 mouse 拖拽的 move/up 挂在 window：VTU 默认 detached 挂载会切断到 window 的
  // 冒泡链，手动 append 进 document 树还原真实浏览器语义。
  // （不用 VTU 的 attachTo：其 2.5.1 实现依赖 Vue 3.5 的 app.onUnmount，本仓 Vue 3.4 不兼容。）
  document.body.appendChild(w.element)
  return w
}

// mountCanvas 手动 append 的残留元素兜底清理（app 已随 unmount 销毁，只清 DOM）
afterEach(() => {
  document.body.innerHTML = ''
})

describe('LcCanvas —— 拖放（批 2）', () => {
  it('dragover 产生指示线（jsdom 零布局 → fallback root into），dragleave 清除', async () => {
    const w = mountCanvas()
    await flushPromises()
    expect(w.find('.lc-canvas__hint').exists()).toBe(false)

    await w.find('.lc-canvas').trigger('dragover', { clientX: 0, clientY: 0 })
    const hint = w.find('.lc-canvas__hint')
    expect(hint.exists()).toBe(true)
    expect(hint.classes()).toContain('lc-canvas__hint--into')

    // 子元素间移动（relatedTarget 在画布内）不清；真离开画布才清
    await w.find('.lc-canvas').trigger('dragleave', { relatedTarget: document.body })
    expect(w.find('.lc-canvas__hint').exists()).toBe(false)
    w.unmount()
  })

  it('drop（material 来源）→ emit drop { source: { kind: material } } 且清指示线', async () => {
    const w = mountCanvas()
    await flushPromises()
    const dt = makeDT({ [LC_MATERIAL_MIME]: 'Input', 'text/plain': '单行输入' })

    await w.find('.lc-canvas').trigger('dragover', { clientX: 0, clientY: 0 })
    await w.find('.lc-canvas').trigger('drop', { dataTransfer: dt })

    const payloads = w.emitted('drop')
    expect(payloads).toHaveLength(1)
    expect(payloads![0]![0]).toEqual({
      source: { kind: 'material', name: 'Input' },
      hit: { nodeId: 'root', position: 'into' }, // 零布局 fallback
    })
    expect(w.find('.lc-canvas__hint').exists()).toBe(false)
    w.unmount()
  })

  it('drop（node 来源）→ emit drop { source: { kind: node, id } }', async () => {
    const w = mountCanvas()
    await flushPromises()
    const dt = makeDT({ [LC_NODE_MIME]: 'n-input', 'text/plain': 'n-input' })

    await w.find('.lc-canvas').trigger('dragover', { clientX: 0, clientY: 0 })
    await w.find('.lc-canvas').trigger('drop', { dataTransfer: dt })

    expect(w.emitted('drop')![0]![0]).toEqual({
      source: { kind: 'node', id: 'n-input' },
      hit: { nodeId: 'root', position: 'into' },
    })
    w.unmount()
  })

  it('drop 无拖拽数据（或未经 dragover）→ 不 emit', async () => {
    const w = mountCanvas()
    await flushPromises()
    // 未 dragover：hint 为空 → 直接 drop 不 emit
    await w.find('.lc-canvas').trigger('drop', { dataTransfer: makeDT() })
    expect(w.emitted('drop')).toBeUndefined()

    // dragover 后 drop 空 dataTransfer：两种 MIME 都读不到 → 不 emit
    await w.find('.lc-canvas').trigger('dragover', { clientX: 0, clientY: 0 })
    await w.find('.lc-canvas').trigger('drop', { dataTransfer: makeDT() })
    expect(w.emitted('drop')).toBeUndefined()
    w.unmount()
  })

  it('document dragend 兜底清指示线（拖到画布外松手）', async () => {
    const w = mountCanvas()
    await flushPromises()
    await w.find('.lc-canvas').trigger('dragover', { clientX: 0, clientY: 0 })
    expect(w.find('.lc-canvas__hint').exists()).toBe(true)

    document.dispatchEvent(new Event('dragend'))
    await flushPromises()
    expect(w.find('.lc-canvas__hint').exists()).toBe(false)
    w.unmount()
  })

  it('批 1 回归：点选 select 转发 + 遮罩仍渲染', async () => {
    const w = mountCanvas()
    await flushPromises()
    expect(w.findAll('.lc-node__mask')).toHaveLength(34) // 批 2：demo 32 物料节点 + root + 组内子节点
    await w.find('[data-node-id="n-sel"]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['n-sel'])
    w.unmount()
  })
})

describe('LcCanvas —— 自研 mouse 拖拽换位（B-25：SVG 遮罩的 HTML5 DnD 会话不建立）', () => {
  /** jsdom 里 getBoundingClientRect 全 0 → 锚点 fallback root into（换位主链路可测） */
  it('mousedown → 超阈值 mousemove → mouseup：emit drop { kind: node }', async () => {
    const w = mountCanvas()
    await flushPromises()
    const mask = w.find('[data-node-id="n-input"]')

    await mask.trigger('mousedown', { button: 0, clientX: 10, clientY: 10 })
    // 阈值内移动：不武装、无指示线
    await w.find('.lc-canvas').trigger('mousemove', { clientX: 11, clientY: 11 })
    expect(w.find('.lc-canvas__hint').exists()).toBe(false)
    expect(w.emitted('drop')).toBeUndefined()

    // 超阈值 → 武装 + 指示线
    await w.find('.lc-canvas').trigger('mousemove', { clientX: 40, clientY: 60 })
    expect(w.find('.lc-canvas__hint').exists()).toBe(true)

    await w.find('.lc-canvas').trigger('mouseup')
    const payloads = w.emitted('drop')
    expect(payloads).toHaveLength(1)
    expect(payloads![0]![0]).toEqual({
      source: { kind: 'node', id: 'n-input' },
      hit: { nodeId: 'root', position: 'into' },
    })
    expect(w.find('.lc-canvas__hint').exists()).toBe(false) // mouseup 清指示线
    w.unmount()
  })

  it('未超阈值的 mousedown/mouseup 是普通点击：不 emit drop（点击选中不受影响）', async () => {
    const w = mountCanvas()
    await flushPromises()
    await w.find('[data-node-id="n-ta"]').trigger('mousedown', { button: 0, clientX: 5, clientY: 5 })
    await w.find('.lc-canvas').trigger('mousemove', { clientX: 6, clientY: 6 }) // < 4px
    await w.find('.lc-canvas').trigger('mouseup')
    expect(w.emitted('drop')).toBeUndefined()
    w.unmount()
  })

  it('武装后的 click 被吞（不误触发选中）；非左键 mousedown 不起拖', async () => {
    const w = mountCanvas()
    await flushPromises()
    const mask = w.find('[data-node-id="n-input"]')

    await mask.trigger('mousedown', { button: 0, clientX: 0, clientY: 0 })
    await w.find('.lc-canvas').trigger('mousemove', { clientX: 50, clientY: 50 }) // 武装
    await w.find('.lc-canvas').trigger('mouseup')
    // mouseup 后 click（同元素场景）→ capture 吞掉，不 emit select
    await mask.trigger('click')
    expect(w.emitted('select')).toBeUndefined()
    w.unmount()

    // 右键不起拖
    const w2 = mountCanvas()
    await flushPromises()
    await w2.find('[data-node-id="n-input"]').trigger('mousedown', { button: 2, clientX: 0, clientY: 0 })
    await w2.find('.lc-canvas').trigger('mousemove', { clientX: 60, clientY: 60 })
    await w2.find('.lc-canvas').trigger('mouseup')
    expect(w2.emitted('drop')).toBeUndefined()
    w2.unmount()
  })

  it('拖到自己 → 不 emit（hit.nodeId === sourceId 的自拖无意义）', async () => {
    const w = mountCanvas()
    await flushPromises()
    // jsdom 零布局下锚点 fallback 恒为 root：构造 sourceId = 'root' 场景即自拖
    await w.find('[data-node-id="root"]').trigger('mousedown', { button: 0, clientX: 0, clientY: 0 })
    await w.find('.lc-canvas').trigger('mousemove', { clientX: 40, clientY: 40 })
    await w.find('.lc-canvas').trigger('mouseup')
    expect(w.emitted('drop')).toBeUndefined()
    w.unmount()
  })
})
