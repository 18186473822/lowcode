/**
 * LcCanvas 集成测试 —— 设计器批 1「画布能渲染」的 jsdom 版验收
 *
 * 与 renderer 组件测试（stub 物料）的差异：本文件用 **MATERIAL_MAP 真物料 + UNI_SHIM**，
 * 验证「lc-node PC 编译路径 → 物料 → shim → 受控值联动」整链在 designer-web 同款
 * 环境下可用 —— 覆盖 designer-plan D-A1 的两个落地前提（R2 解析 + 事件双端兼容）。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { NodeSchema } from '@lc/schema'
import type { RuntimeHost } from '@lc/renderer'
import LcCanvas from '../src/canvas/LcCanvas.vue'
import { UNI_SHIMS } from '../src/shim/index'
import { MATERIAL_MAP } from '../src/material-map'
import { demoPage } from '../src/fixtures/demo-page'

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

describe('LcCanvas —— 真物料 + shim 集成（批 1 验收 jsdom 版）', () => {
  it('12 物料全部渲染到位、FormGroup 分组头正确、无「未知组件」', async () => {
    const host = makeHost()
    const w = mount(LcCanvas, {
      props: { schema: demoPage(), options: { host: host as unknown as RuntimeHost } },
      global: { components: globalComponents },
    })
    await flushPromises()

    // 11 个带独立组件的物料（Page/FormGroup 由 lc-node 容器分支消化）
    for (const cls of [
      '.lc-text',
      '.lc-input',
      '.lc-textarea',
      '.lc-number',
      '.lc-radio',
      '.lc-select',
      '.lc-switch',
      '.lc-upload',
      '.lc-image',
      '.lc-divider',
      '.lc-button-wrap',
    ]) {
      expect(w.find(cls).exists(), `物料缺失：${cls}`).toBe(true)
    }
    expect(w.find('.lc-node__group-title').text()).toBe('基本信息')
    expect(w.find('.lc-node__unknown').exists()).toBe(false)
    // 2 个 Text（顶层 + 组内）
    expect(w.findAll('.lc-text')).toHaveLength(2)

    w.unmount()
  })

  it('design 态：渲染选中遮罩，点节点 → select 事件冒泡到画布', async () => {
    const host = makeHost()
    const w = mount(LcCanvas, {
      props: { schema: demoPage(), options: { host: host as unknown as RuntimeHost } },
      global: { components: globalComponents },
    })
    await flushPromises()

    // 遮罩数 = 14 节点（root + 12 children + FormGroup 组内 1）
    expect(w.findAll('.lc-node__mask')).toHaveLength(34) // 批 2：demo 32 物料节点 + root + 组内子节点
    await w.find('[data-node-id="n-sel"]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['n-sel'])
    expect(w.find('[data-node-id="n-sel"]').classes()).toContain('lc-node__mask--selected')

    w.unmount()
  })

  it('真物料受控链路：输入 → setField → $expr 联动文案刷新（D-A1 事件双端兼容）', async () => {
    const host = makeHost()
    const schema = demoPage()
    // 给顶层 Text 换成联动表达式
    const children = schema.root.children as NodeSchema[]
    const t = children[0]!
    t.props = { text: '$expr: "你好," + formData.f1' }

    const w = mount(LcCanvas, {
      props: { schema, options: { host: host as unknown as RuntimeHost } },
      global: { components: globalComponents },
    })
    await flushPromises()
    expect(w.find('.lc-text').text()).toBe('你好,')

    // 原生 input（PC 形态）输入 → 物料 e.target.value 回退读取 → 联动刷新
    const input = w.find('.lc-input__field')
    await input.setValue('张三丰')
    await flushPromises()
    expect(w.find('.lc-text').text()).toBe('你好,张三丰')

    w.unmount()
  })
})
