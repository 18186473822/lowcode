<!--
  DateTimePicker 物料 —— 日期时间选择（Phase 2 批 3，对齐 FieldType `datetime`）。
  接口对齐 lc-node：`<lc-date-time-picker v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: 'YYYY-MM-DD HH:mm'（受控）；date 与 time 两个半宽 picker 拼值（任一段变更保留另一段）
-->
<template>
  <view class="lc-datetime-picker">
    <view v-if="label" class="lc-datetime-picker__label-row">
      <text class="lc-datetime-picker__label">{{ label }}</text>
      <text v-if="required" class="lc-datetime-picker__required">*</text>
    </view>
    <view
      class="lc-datetime-picker__row"
      :class="{ 'lc-datetime-picker__row--error': !!error, 'lc-datetime-picker__row--disabled': disabled }"
    >
      <picker mode="date" :value="datePart" :disabled="disabled" @change="onDate">
        <view class="lc-datetime-picker__half">
          <text :class="datePart ? 'lc-datetime-picker__value' : 'lc-datetime-picker__placeholder'">
            {{ datePart || '选择日期' }}
          </text>
        </view>
      </picker>
      <picker mode="time" :value="timePart" :disabled="disabled" @change="onTime">
        <view class="lc-datetime-picker__half lc-datetime-picker__half--right">
          <text :class="timePart ? 'lc-datetime-picker__value' : 'lc-datetime-picker__placeholder'">
            {{ timePart || '选择时间' }}
          </text>
        </view>
      </picker>
    </view>
    <view v-if="error" class="lc-datetime-picker__error">
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
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const stringValue = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)))
/** 'YYYY-MM-DD HH:mm' → 'YYYY-MM-DD'（无值给 ''） */
const datePart = computed(() => (stringValue.value ? stringValue.value.slice(0, 10) : ''))
/** 'YYYY-MM-DD HH:mm' → 'HH:mm'（无值给 ''） */
const timePart = computed(() => (stringValue.value.length >= 16 ? stringValue.value.slice(11, 16) : ''))

function join(date: string, time: string): string {
  if (!date && !time) return ''
  return `${date} ${time}`.trim()
}

function onDate(e: unknown): void {
  const d = (e as { detail?: { value?: string } }).detail
  emit('update', { name: props.name, value: join(d?.value ?? '', timePart.value || '00:00') })
}

function onTime(e: unknown): void {
  const d = (e as { detail?: { value?: string } }).detail
  emit('update', { name: props.name, value: join(datePart.value, d?.value ?? '') })
}
</script>

<style scoped>
.lc-datetime-picker {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-datetime-picker__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-datetime-picker__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-datetime-picker__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-datetime-picker__row {
  display: flex;
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
  overflow: hidden;
}
.lc-datetime-picker__row--error {
  border-color: var(--lc-status-danger);
}
.lc-datetime-picker__row--disabled {
  background: var(--lc-bg-canvas);
}
.lc-datetime-picker__half {
  flex: 1;
  padding: var(--lc-space-2) 20rpx;
}
.lc-datetime-picker__half--right {
  border-left: 1rpx solid var(--lc-border-default);
}
.lc-datetime-picker__value {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-datetime-picker__placeholder {
  font-size: var(--lc-font-body);
  color: var(--lc-text-tertiary);
}
.lc-datetime-picker__error {
  margin-top: 6rpx;
}
.lc-datetime-picker__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
