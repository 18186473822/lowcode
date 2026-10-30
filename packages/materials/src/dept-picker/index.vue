<!--
  DeptPicker 物料 —— 部门选择（Phase 2 批 3，对齐 FieldType `dept`；方案缺口清单项）。
  接口对齐 lc-node：`<lc-dept-picker v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: 选中部门 value（受控）；candidates: 候选部门 `{label, value}[]`
   - **首版静态候选**（组织架构服务未有，接服务后由数据源表达式注入 candidates，见台账未做项）
-->
<template>
  <view class="lc-dept-picker">
    <view v-if="label" class="lc-dept-picker__label-row">
      <text class="lc-dept-picker__label">{{ label }}</text>
      <text v-if="required" class="lc-dept-picker__required">*</text>
    </view>
    <picker :range="labels" :value="index < 0 ? 0 : index" :disabled="disabled" @change="onChange">
      <view
        class="lc-dept-picker__cell"
        :class="{ 'lc-dept-picker__cell--error': !!error, 'lc-dept-picker__cell--disabled': disabled }"
      >
        <text class="lc-dept-picker__icon">🏢</text>
        <text :class="index >= 0 ? 'lc-dept-picker__value' : 'lc-dept-picker__placeholder'">
          {{ index >= 0 ? labels[index] : placeholder || '请选择部门' }}
        </text>
        <text class="lc-dept-picker__arrow">›</text>
      </view>
    </picker>
    <view v-if="error" class="lc-dept-picker__error">
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
  placeholder?: string
  /** 候选部门（首版静态；可由数据源表达式注入） */
  candidates?: Opt[]
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const optionList = computed<Opt[]>(() => (Array.isArray(props.candidates) ? props.candidates : []))
const labels = computed(() => optionList.value.map((o) => String(o.label)))
const index = computed(() =>
  props.value === undefined || props.value === null
    ? -1
    : optionList.value.findIndex((o) => String(o.value) === String(props.value)),
)

function onChange(e: unknown): void {
  const d = (e as { detail?: { value?: number } }).detail
  const opt = optionList.value[d?.value ?? -1]
  if (!opt) return
  emit('update', { name: props.name, value: opt.value })
}
</script>

<style scoped>
.lc-dept-picker {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-dept-picker__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-dept-picker__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-dept-picker__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-dept-picker__cell {
  display: flex;
  align-items: center;
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  min-height: 44rpx;
}
.lc-dept-picker__cell--error {
  border-color: var(--lc-status-danger);
}
.lc-dept-picker__cell--disabled {
  background: var(--lc-bg-canvas);
}
.lc-dept-picker__icon {
  font-size: var(--lc-font-body);
  margin-right: 12rpx;
}
.lc-dept-picker__value {
  flex: 1;
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-dept-picker__placeholder {
  flex: 1;
  font-size: var(--lc-font-body);
  color: var(--lc-input-placeholder);
}
.lc-dept-picker__arrow {
  font-size: var(--lc-font-h3);
  color: var(--lc-icon-muted);
  margin-left: 12rpx;
}
.lc-dept-picker__error {
  margin-top: 6rpx;
}
.lc-dept-picker__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
