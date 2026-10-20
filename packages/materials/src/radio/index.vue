<!--
  Radio 物料 —— 单选。归位于 `packages/materials`（Phase 1 第 1 批）。
  接口对齐 lc-node：`<lc-radio v-bind="model.props" :error="model.error" @update="onChange" />`
   - options: { label, value }[]（设计器 optionList setter 生成）
   - uni radio-group change 的 detail.value 是字符串 → 按 options 反查原始 value 保持类型（number/boolean 不丢）
-->
<template>
  <view class="lc-radio">
    <view v-if="label" class="lc-radio__label-row">
      <text class="lc-radio__label">{{ label }}</text>
      <text v-if="required" class="lc-radio__required">*</text>
    </view>
    <radio-group class="lc-radio__group" :class="{ 'lc-radio__group--vertical': direction === 'vertical' }" @change="onChange">
      <label v-for="(opt, i) in options" :key="i" class="lc-radio__item">
        <radio
          class="lc-radio__dot"
          :value="String(opt.value)"
          :checked="isEqual(opt.value, value)"
          :disabled="disabled"
          color="var(--lc-action-primary)"
        />
        <text class="lc-radio__text">{{ opt.label }}</text>
      </label>
    </radio-group>
    <view v-if="error" class="lc-radio__error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
interface Option {
  label: string
  value: unknown
}

const props = defineProps<{
  name?: string
  label?: string
  value?: unknown
  options?: Option[]
  direction?: 'horizontal' | 'vertical'
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

function isEqual(a: unknown, b: unknown): boolean {
  return String(a) === String(b)
}

function onChange(e: Event): void {
  const raw = (e as unknown as { detail?: { value?: string } }).detail?.value
  // 用字符串值反查 options，恢复原始类型（value 可能是 number / boolean）
  const hit = (props.options ?? []).find((o) => String(o.value) === raw)
  emit('update', { name: props.name, value: hit ? hit.value : (raw ?? '') })
}
</script>

<style scoped>
.lc-radio {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-radio__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-radio__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-radio__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-radio__group {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx 28rpx;
}
.lc-radio__group--vertical {
  flex-direction: column;
  gap: var(--lc-space-2);
}
.lc-radio__item {
  display: flex;
  align-items: center;
}
.lc-radio__dot {
  transform: scale(0.8);
}
.lc-radio__text {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-radio__error {
  margin-top: 6rpx;
}
.lc-radio__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
