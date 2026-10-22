<!--
  UserPicker 物料 —— 人员选择（Phase 2 批 3，对齐 FieldType `user`；方案缺口清单项）。
  接口对齐 lc-node：`<lc-user-picker v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: 选中人员 value（受控）；candidates: 候选人 `{label, value}[]`
   - **首版静态候选**（组织架构服务未有，接服务后由数据源表达式注入 candidates，见台账未做项）
-->
<template>
  <view class="lc-user-picker">
    <view v-if="label" class="lc-user-picker__label-row">
      <text class="lc-user-picker__label">{{ label }}</text>
      <text v-if="required" class="lc-user-picker__required">*</text>
    </view>
    <picker :range="labels" :value="index < 0 ? 0 : index" :disabled="disabled" @change="onChange">
      <view
        class="lc-user-picker__cell"
        :class="{ 'lc-user-picker__cell--error': !!error, 'lc-user-picker__cell--disabled': disabled }"
      >
        <text class="lc-user-picker__avatar">{{ index >= 0 ? '👤' : '＋' }}</text>
        <text :class="index >= 0 ? 'lc-user-picker__value' : 'lc-user-picker__placeholder'">
          {{ index >= 0 ? labels[index] : placeholder || '请选择人员' }}
        </text>
        <text class="lc-user-picker__arrow">›</text>
      </view>
    </picker>
    <view v-if="error" class="lc-user-picker__error">
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
  /** 候选人员（首版静态；可由数据源表达式注入） */
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
const index = computed(() => optionList.value.findIndex((o) => o.value === props.value))

function onChange(e: unknown): void {
  const d = (e as { detail?: { value?: number } }).detail
  const opt = optionList.value[d?.value ?? -1]
  if (!opt) return
  emit('update', { name: props.name, value: opt.value })
}
</script>

<style scoped>
.lc-user-picker {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-user-picker__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-user-picker__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-user-picker__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-user-picker__cell {
  display: flex;
  align-items: center;
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  min-height: 44rpx;
}
.lc-user-picker__cell--error {
  border-color: var(--lc-status-danger);
}
.lc-user-picker__cell--disabled {
  background: var(--lc-bg-canvas);
}
.lc-user-picker__avatar {
  font-size: var(--lc-font-body-lg);
  margin-right: 12rpx;
}
.lc-user-picker__value {
  flex: 1;
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-user-picker__placeholder {
  flex: 1;
  font-size: var(--lc-font-body);
  color: var(--lc-input-placeholder);
}
.lc-user-picker__arrow {
  font-size: var(--lc-font-h3);
  color: var(--lc-icon-muted);
  margin-left: 12rpx;
}
.lc-user-picker__error {
  margin-top: 6rpx;
}
.lc-user-picker__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
