<!--
  Select 物料 —— 单选下拉（uni picker selector 模式）。归位于 `packages/materials`（Phase 1 第 1 批）。
  接口对齐 lc-node：`<lc-select v-bind="model.props" :error="model.error" @update="onChange" />`
   - options: { label, value }[]；picker change 的 detail.value 是**下标** → 反查 options 保持原始类型
   - value 未命中时显示 placeholder（不清空已有 formData 值）
-->
<template>
  <view class="lc-select">
    <view v-if="label" class="lc-select__label-row">
      <text class="lc-select__label">{{ label }}</text>
      <text v-if="required" class="lc-select__required">*</text>
    </view>
    <picker
      class="lc-select__picker"
      :class="{ 'lc-select__picker--error': !!error }"
      mode="selector"
      :range="labelList"
      :value="selectedIndex"
      :disabled="disabled"
      @change="onChange"
    >
      <view class="lc-select__cell">
        <text :class="['lc-select__value', { 'lc-select__value--placeholder': selectedIndex < 0 }]">
          {{ selectedIndex >= 0 ? labelList[selectedIndex] : placeholder || '请选择' }}
        </text>
        <text class="lc-select__arrow">›</text>
      </view>
    </picker>
    <view v-if="error" class="lc-select__error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Option {
  label: string
  value: unknown
}

const props = defineProps<{
  name?: string
  label?: string
  value?: unknown
  options?: Option[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const labelList = computed(() => (props.options ?? []).map((o) => o.label))

const selectedIndex = computed(() => {
  const opts = props.options ?? []
  return opts.findIndex((o) => String(o.value) === String(props.value))
})

function onChange(e: Event): void {
  const idx = (e as unknown as { detail?: { value?: number } }).detail?.value ?? -1
  const hit = (props.options ?? [])[idx]
  if (hit) emit('update', { name: props.name, value: hit.value })
}
</script>

<style scoped>
.lc-select {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-select__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-select__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-select__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-select__picker {
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
}
.lc-select__picker--error {
  border-color: var(--lc-status-danger);
}
.lc-select__cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--lc-space-2) 20rpx;
  min-height: 44rpx;
}
.lc-select__value {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-select__value--placeholder {
  color: var(--lc-input-placeholder);
}
.lc-select__arrow {
  font-size: var(--lc-font-h3);
  color: var(--lc-icon-muted);
  transform: rotate(90deg);
}
.lc-select__error {
  margin-top: 6rpx;
}
.lc-select__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
