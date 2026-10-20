/**
 * shim 测试 —— D-A1 方案 A（B-22 修正版）的落地断言：
 *  ① 直出组：view/text/image/switch 是 SVG 标签 → Vue 直出原生元素（组件 shim 无效是**预期**），
 *     由 CSS 兜底（view/text）与增强器（image/switch）接管；
 *  ② 组件 shim 组：picker/radio/radio-group 不在保留名单 → 组件解析生效；
 *  ③ 事件载荷与 uni 同构（`{ detail: { value } }`）→ 物料零改动的前提；
 *  ④ 增强器：image 背景同步、switch 点击派发 uni 契约 change（不替换节点，Vue diff 安全）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, createApp } from 'vue'
import { UNI_SHIMS, registerUniShim, installUniApi } from '../src/shim/index'
import { installEnhancer } from '../src/shim/enhance'
import { registerMaterials } from '../src/material-map'
import { PickerShim } from '../src/shim/picker'
import { RadioShim, RadioGroupShim } from '../src/shim/radio'
import UniTemplate from './fixtures/uni-template.vue'

describe('B-22 —— 直出组 vs 组件 shim 组', () => {
  it('view/text/image/switch 直出原生元素；picker/radio 解析到 shim 组件', () => {
    const w = mount(UniTemplate, { global: { components: UNI_SHIMS } })

    // 直出组（SVG 标签，Vue 保留元素）——组件 shim 无效是预期，靠 CSS/增强器兜底
    expect(w.find('view.r2-root').exists()).toBe(true)
    expect(w.find('text.r2-text').text()).toBe('文本')
    expect(w.find('switch.r2-switch').exists()).toBe(true)
    expect(w.find('image.r2-image').exists()).toBe(true)

    // 组件 shim 组（非保留标签）
    expect(w.find('.lc-shim-picker').exists()).toBe(true)
    expect(w.find('input[type="radio"][value="a"]').exists()).toBe(true)
    expect(w.find('picker').exists()).toBe(false)
    expect(w.find('radio-group').exists()).toBe(false)

    w.unmount()
  })

  it('registerUniShim 幂等注入 window.uni（chooseImage/previewImage 可用）', () => {
    void registerUniShim
    delete (window as unknown as { uni?: unknown }).uni
    installUniApi()
    installUniApi() // 幂等：不覆盖
    expect(typeof window.uni?.chooseImage).toBe('function')
    expect(typeof window.uni?.previewImage).toBe('function')
  })
})

describe('增强器（image / switch，不替换节点）', () => {
  const Host = defineComponent({
    props: { on: { type: Boolean, default: false } },
    setup(props) {
      return () =>
        h('div', { class: 'enh-root' }, [
          h('image', { class: 'e-img', src: '/a.png', mode: 'aspectFill' }),
          h('switch', { class: 'e-sw', checked: props.on }),
          // disabled/checked 显式传 false —— Vue 对未知元素会写 "false" attribute，
          // 增强器必须排除（B-22 续：浏览器实测 disabled="false" 曾致误判禁用）
          h('switch', { class: 'e-sw-off', disabled: false, checked: false }),
          h('switch', { class: 'e-sw-disabled', disabled: true, checked: false }),
        ])
    },
  })

  it('image：src 同步为背景图；src 变化（attribute 观察）自动更新', async () => {
    const w = mount(Host)
    const dispose = installEnhancer(w.element as HTMLElement)
    await nextTick()

    const img = w.find('.e-img').element as HTMLElement
    expect(img.style.backgroundImage).toContain('/a.png')
    expect(img.style.backgroundSize).toBe('cover') // aspectFill → cover

    // $expr 换图走 attribute 更新 → observer 同步
    img.setAttribute('src', '/b.png')
    await nextTick()
    expect(img.style.backgroundImage).toContain('/b.png')

    dispose()
    w.unmount()
  })

  it('switch：点击切 checked + 派发 uni 契约 change { detail: { value } }；disabled 不响应', async () => {
    const w = mount(Host, { props: { on: false } })
    const dispose = installEnhancer(w.element as HTMLElement)
    await nextTick()

    const sw = w.find('.e-sw').element as HTMLElement
    const events: CustomEvent[] = []
    sw.addEventListener('change', (e) => events.push(e as CustomEvent))

    sw.click()
    expect(sw.hasAttribute('checked')).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]!.detail).toEqual({ value: true })

    sw.click()
    expect(sw.hasAttribute('checked')).toBe(false)
    expect(events[1]!.detail).toEqual({ value: false })

    // disabled：无事件、attribute 不被增强器改动（初始值由 Vue 写入 checked="false"）
    const dis = w.find('.e-sw-disabled').element as HTMLElement
    const disBefore = dis.getAttribute('checked')
    const disEvents: unknown[] = []
    dis.addEventListener('change', (e) => disEvents.push(e))
    dis.click()
    expect(disEvents).toHaveLength(0)
    expect(dis.getAttribute('checked')).toBe(disBefore)

    // disabled="false"（Vue 写 "false" attribute）不误判禁用 —— 点击正常切换
    const off = w.find('.e-sw-off').element as HTMLElement
    expect(off.getAttribute('disabled')).toBe('false')
    const offEvents: CustomEvent[] = []
    off.addEventListener('change', (e) => offEvents.push(e as CustomEvent))
    off.click()
    expect(offEvents).toHaveLength(1)
    expect(off.hasAttribute('checked')).toBe(true)

    dispose()
    w.unmount()
  })
})

describe('事件载荷与 uni 同构', () => {
  it('picker：点开下拉 → 选项 click → change { detail: { value: 下标 } } 且收起', async () => {
    const w = mount(PickerShim, {
      props: { range: ['甲', '乙', '丙'], value: 1 },
      slots: { default: '请选择' },
    })
    expect(w.find('.lc-shim-picker__dropdown').exists()).toBe(false)
    await w.find('.lc-shim-picker__cell').trigger('click')
    expect(w.findAll('.lc-shim-picker__option')).toHaveLength(3)
    expect(w.findAll('.lc-shim-picker__option')[1]!.classes()).toContain(
      'lc-shim-picker__option--active',
    )
    await w.findAll('.lc-shim-picker__option')[2]!.trigger('click')
    expect(w.emitted('change')?.[0]).toEqual([{ detail: { value: 2 } }])
    expect(w.find('.lc-shim-picker__dropdown').exists()).toBe(false)
    w.unmount()
  })

  it('picker：disabled 不响应点击', async () => {
    const w = mount(PickerShim, { props: { range: ['甲'], disabled: true } })
    await w.find('.lc-shim-picker__cell').trigger('click')
    expect(w.find('.lc-shim-picker__dropdown').exists()).toBe(false)
    w.unmount()
  })

  it('radio-group：点原生 radio → 冒泡收集 → change { detail: { value: 字符串值 } }', async () => {
    const w = mount(RadioGroupShim, {
      global: { components: { radio: RadioShim } },
      slots: {
        default: () => [
          h(RadioShim, { value: 'pending', checked: true }),
          h(RadioShim, { value: 'approved', checked: false }),
        ],
      },
    })
    const radios = w.findAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    // 受控 checked 落在 DOM property（原生 input）
    expect((radios[0]!.element as HTMLInputElement).checked).toBe(true)
    await radios[1]!.setValue() // input.setValue 对 radio 触发 change
    expect(w.emitted('change')?.[0]).toEqual([{ detail: { value: 'approved' } }])
    w.unmount()
  })
})

describe('注册链与 uni API（designer-web 入口同路径）', () => {
  it('registerUniShim + registerMaterials 作为 Vue 插件完成全量注册（注册链回归）', async () => {
    const app = createApp(UniTemplate)
    expect(() => {
      registerUniShim(app)
      registerMaterials(app)
    }).not.toThrow()
    const vm = app.mount(document.createElement('div'))
    await nextTick()
    // 组件 shim 解析生效 + uni API 已注入
    expect(vm.$el.querySelector('.lc-shim-picker')).toBeTruthy()
    expect(typeof window.uni?.chooseImage).toBe('function')
    app.unmount()
  })

  it('previewImage：创建全屏遮罩（含 img），点击后移除；chooseImage：创建 file input 并触发', () => {
    installUniApi()
    // previewImage
    window.uni!.previewImage({ urls: ['/a.png'], current: 0 })
    const mask = document.body.lastElementChild as HTMLElement
    expect(mask.querySelector('img')?.getAttribute('src')).toBe('/a.png')
    mask.click()
    expect(mask.isConnected).toBe(false)
    // chooseImage：挂 input[type=file] 到 DOM 并 click（jsdom 无文件系统，onchange 不触发）
    window.uni!.chooseImage({ count: 3 })
    const input = document.querySelector('body > input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.multiple).toBe(true)
    input.remove()
  })
})
