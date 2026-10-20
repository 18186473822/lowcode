<!--
  Textarea 物料 —— 多行文本。归位于 `packages/materials`（Phase 1 第 1 批）。
  接口对齐 lc-node：`<lc-textarea v-bind="model.props" :error="model.error" @update="onChange" />`
   - emit('update', { name, value }) → controller.setField（契约见 packages/materials/README.md）
-->
<template>
  <view class="lc-textarea">
    <view v-if="label" class="lc-textarea__label-row">
      <text class="lc-textarea__label">{{ label }}</text>
      <text v-if="required" class="lc-textarea__required">*</text>
    </view>
    <textarea
      class="lc-textarea__field"
      :class="{ 'lc-textarea__field--error': !!error }"
      :value="displayValue"
      :placeholder="placeholder || '请输入'"
      :maxlength="maxLength || 140"
      :disabled="disabled"
      @input="onInput"
    />
    <view class="lc-textarea__foot">
      <view v-if="error" class="lc-textarea__error">
        <text>{{ error }}</text>
      </view>
      <text v-if="maxLength" class="lc-textarea__count">{{ displayValue.length }}/{{ maxLength }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name?: string
  label?: string
  placeholder?: string
  value?: unknown
  required?: boolean
  disabled?: boolean
  maxLength?: number
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const displayValue = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)))

function onInput(e: Event): void {
  // uni：e.detail.value；PC 原生（uni-shim）：回退 e.target.value（D-A1 双端兼容）
  const d = (e as unknown as { detail?: { value?: string } }).detail
  emit('update', { name: props.name, value: d?.value ?? (e.target as HTMLTextAreaElement | null)?.value ?? '' })
}
</script>

<style scoped>
.lc-textarea {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-textarea__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-textarea__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-textarea__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-textarea__field {
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  font-size: var(--lc-font-body);
  min-height: 160rpx;
  width: 100%;
  box-sizing: border-box;
}
.lc-textarea__field--error {
  border-color: var(--lc-status-danger);
}
.lc-textarea__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6rpx;
}
.lc-textarea__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
.lc-textarea__count {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
</style>
