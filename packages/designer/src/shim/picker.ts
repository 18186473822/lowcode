/**
 * picker.ts —— uni <picker mode="selector"> 的 PC shim（D-A1）
 *
 * uni 契约：`@change` 载荷 `{ detail: { value: 下标 } }`（物料 lc-select 据下标反查
 * options 恢复原始类型）——shim 完全一致，物料零改动。
 */
import { defineComponent, h, ref, type PropType } from 'vue'

export const PickerShim = defineComponent({
  name: 'picker',
  props: {
    range: { type: Array as PropType<Array<string | number>>, default: () => [] },
    value: { type: Number, default: -1 },
    disabled: { type: Boolean, default: false },
  },
  emits: ['change'],
  setup(props, { emit, slots }) {
    const open = ref(false)

    function pick(i: number): void {
      open.value = false
      emit('change', { detail: { value: i } })
    }

    return () =>
      h('div', { class: 'lc-shim-picker' }, [
        h(
          'div',
          {
            class: ['lc-shim-picker__cell', { 'lc-shim-picker__cell--disabled': props.disabled }],
            onClick: () => {
              if (!props.disabled) open.value = !open.value
            },
          },
          slots.default?.(),
        ),
        open.value
          ? h(
              'ul',
              { class: 'lc-shim-picker__dropdown' },
              props.range.map((label, i) =>
                h(
                  'li',
                  {
                    key: i,
                    class: [
                      'lc-shim-picker__option',
                      { 'lc-shim-picker__option--active': i === props.value },
                    ],
                    onClick: () => pick(i),
                  },
                  String(label),
                ),
              ),
            )
          : null,
      ])
  },
})
