<!--
  Checkbox 物料 —— 多选（Phase 2 批 3，对齐 FieldType `enum` 多选场景）。
  接口对齐 lc-node：`<lc-checkbox v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: Array<string|number>（受控，选中项 value 列表）
   - **纯 view/text 模拟勾选框**（uni checkbox-group 在设计器无 shim —— 零新增 shim，双端渲染一致）
-->
<template>
  <view class="lc-checkbox">
    <view v-if="label" class="lc-checkbox__label-row">
      <text class="lc-checkbox__label">{{ label }}</text>
      <text v-if="required" class="lc-checkbox__required">*</text>
    </view>
    <view class="lc-checkbox__options" :class="`lc-checkbox__options--${direction || 'vertical'}`">
      <view
        v-for="(opt, i) in options"
        :key="i"
        class="lc-checkbox__option"
        :class="{ 'lc-checkbox__option--disabled': disabled }"
        @click="toggle(opt.value)"
      >
        <view class="lc-checkbox__box" :class="{ 'lc-checkbox__box--checked': isChecked(opt.value) }">
          <text v-if="isChecked(opt.value)" class="lc-checkbox__mark">✓</text>
        </view>
        <text class="lc-checkbox__text">{{ opt.label }}</text>
      </view>
    </view>
    <view v-if="error" class="lc-checkbox__error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Opt {
  label: string
  value: string | number
}

const props = defineProps<{
  name?: string
  label?: string
  value?: unknown
  options?: Opt[]
  /** 排列方向 vertical / horizontal */
  direction?: string
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const optionList = computed<Opt[]>(() => (Array.isArray(props.options) ? props.options : []))
const checkedList = computed<Array<string | number>>(() => (Array.isArray(props.value) ? (props.value as Array<string | number>) : []))

function isChecked(v: string | number): boolean {
  // 宽松比较：schema 里 value 可能是 "1"，选项 value 是数字 1（或反之），严格 === 会漏勾
  return checkedList.value.some((x) => String(x) === String(v))
}

function toggle(v: string | number): void {
  if (props.disabled) return
  const next = isChecked(v)
    ? checkedList.value.filter((x) => String(x) !== String(v))
    : [...checkedList.value, v]
  emit('update', { name: props.name, value: next })
}
</script>

<style scoped>
.lc-checkbox {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-checkbox__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-checkbox__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-checkbox__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-checkbox__options--vertical {
  display: flex;
  flex-direction: column;
}
.lc-checkbox__options--horizontal {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
.lc-checkbox__option {
  display: flex;
  align-items: center;
  /* 触控目标 44：原 12rpx(6px) 只能到 33，改成 12px 对称留白 → 约 45。见 radio 同款说明 */
  padding: var(--lc-space-3) 0;
}
.lc-checkbox__options--horizontal .lc-checkbox__option {
  margin-right: 28rpx;
}
.lc-checkbox__option--disabled {
  opacity: 0.5;
}
.lc-checkbox__box {
  width: 32rpx;
  height: 32rpx;
  border: 1rpx solid var(--lc-border-strong);
  border-radius: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12rpx;
  background: var(--lc-bg-surface);
}
.lc-checkbox__box--checked {
  background: var(--lc-action-primary);
  border-color: var(--lc-action-primary);
}
.lc-checkbox__mark {
  color: var(--lc-text-on-brand);
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-label);
}
.lc-checkbox__text {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-checkbox__error {
  margin-top: 6rpx;
}
.lc-checkbox__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
