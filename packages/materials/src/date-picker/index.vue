<!--
  DatePicker 物料 —— 日期选择（Phase 2 批 3，对齐 FieldType `date`）。
  接口对齐 lc-node：`<lc-date-picker v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: 'YYYY-MM-DD'（受控，`$expr: formData.xxx`）；选择走 uni `<picker mode="date">`
     （设计器 PickerShim 与 uni 同构 change 载荷 `{ detail: { value } }`，物料零分支）
-->
<template>
  <view class="lc-date-picker">
    <view v-if="label" class="lc-date-picker__label-row">
      <text class="lc-date-picker__label">{{ label }}</text>
      <text v-if="required" class="lc-date-picker__required">*</text>
    </view>
    <picker
      mode="date"
      :value="stringValue"
      :start="start"
      :end="end"
      :fields="fields || 'day'"
      :disabled="disabled"
      @change="onChange"
    >
      <view
        class="lc-date-picker__cell"
        :class="{ 'lc-date-picker__cell--error': !!error, 'lc-date-picker__cell--disabled': disabled }"
      >
        <text :class="stringValue ? 'lc-date-picker__value' : 'lc-date-picker__placeholder'">
          {{ stringValue || placeholder || '请选择日期' }}
        </text>
        <text class="lc-date-picker__arrow">›</text>
      </view>
    </picker>
    <view v-if="error" class="lc-date-picker__error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name?: string
  label?: string
  value?: unknown
  placeholder?: string
  /** 可选最早日期（picker start，YYYY-MM-DD） */
  start?: string
  /** 可选最晚日期（picker end，YYYY-MM-DD） */
  end?: string
  /** 展示粒度 year / month / day */
  fields?: string
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const stringValue = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)))

function onChange(e: unknown): void {
  // uni/PC shim 同构：{ detail: { value: 'YYYY-MM-DD' } }
  const d = (e as { detail?: { value?: string } }).detail
  emit('update', { name: props.name, value: d?.value ?? '' })
}
</script>

<style scoped>
.lc-date-picker {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-date-picker__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-date-picker__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-date-picker__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-date-picker__cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  min-height: 44rpx;
}
.lc-date-picker__cell--error {
  border-color: var(--lc-status-danger);
}
.lc-date-picker__cell--disabled {
  background: var(--lc-bg-canvas);
  color: var(--lc-text-tertiary);
}
.lc-date-picker__value {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-date-picker__placeholder {
  font-size: var(--lc-font-body);
  color: var(--lc-text-tertiary);
}
.lc-date-picker__arrow {
  font-size: var(--lc-font-h3);
  color: var(--lc-text-tertiary);
  margin-left: 12rpx;
}
.lc-date-picker__error {
  margin-top: 6rpx;
}
.lc-date-picker__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
