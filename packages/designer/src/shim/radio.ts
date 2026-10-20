/**
 * radio.ts —— uni <radio-group> / <radio> 的 PC shim（D-A1）
 *
 * 关键：shim 用**原生 `<input type="radio">`** —— 物料把 radio 包在 `<label>` 里，
 * 原生 label↔input 关联让「点文字也能选中」由浏览器标准行为兜住（自定义 div 做不到）。
 *
 * uni 契约：`radio-group` 的 `@change` 载荷 `{ detail: { value: 字符串值 } }` ——
 * 原生 change 事件冒泡到 group，group 取 `target.value`（string）转发；
 * 物料 lc-radio 用 `options.find(o => String(o.value) === raw)` 反查恢复原始类型。
 * 视觉互斥由物料受控 `:checked` 保证（formData 单值 → 只有一个 checked），不依赖 name。
 */
import { defineComponent, h } from 'vue'

export const RadioShim = defineComponent({
  name: 'radio',
  props: {
    value: { type: [String, Number, Boolean], default: '' },
    checked: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    color: { type: String, default: '' },
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        type: 'radio',
        class: 'lc-shim-radio',
        value: String(props.value),
        checked: props.checked,
        disabled: props.disabled,
        style: props.color ? { accentColor: props.color } : undefined,
        // 自身 change 也按 uni 载荷转发（radio 单独监听场景；group 靠冒泡收集）
        onChange: () => emit('change', { detail: { value: props.value } }),
      })
  },
})

export const RadioGroupShim = defineComponent({
  name: 'radio-group',
  emits: ['change'],
  setup(_, { emit, slots }) {
    function onChange(e: Event): void {
      const t = e.target as HTMLInputElement | null
      if (t && t.type === 'radio') emit('change', { detail: { value: t.value } })
    }
    return () => h('div', { class: 'lc-shim-radio-group', onChange }, slots.default?.())
  },
})
