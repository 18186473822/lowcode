<!--
  NumberInput 物料 —— 数字输入。归位于 `packages/materials`（Phase 1 第 1 批）。
  接口对齐 lc-node：`<lc-number-input v-bind="model.props" :error="model.error" @update="onChange" />`
   - uni input type=number 的 detail.value 是字符串 → 本组件转数值后 emit（空串保持 ''，NaN 回退 ''）
   - min / max / step 交给校验规则（rules: [{type:'range'}]）执行，本组件只做输入与类型转换
-->
<template>
  <view class="lc-number">
    <view v-if="label" class="lc-number__label-row">
      <text class="lc-number__label">{{ label }}</text>
      <text v-if="required" class="lc-number__required">*</text>
      <text v-if="unit" class="lc-number__unit">（{{ unit }}）</text>
    </view>
    <view class="lc-number__field-row">
      <input
        class="lc-number__field"
        :class="{ 'lc-number__field--error': !!error }"
        type="digit"
        :value="displayValue"
        :placeholder="placeholder || '请输入数字'"
        :disabled="disabled"
        @input="onInput"
      />
      <text v-if="unit" class="lc-number__suffix">{{ unit }}</text>
    </view>
    <view v-if="error" class="lc-number__error">
      <text>{{ error }}</text>
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
  unit?: string
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const displayValue = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)))

function onInput(e: Event): void {
  // uni：e.detail.value；PC 原生（uni-shim）：回退 e.target.value（D-A1 双端兼容）
  const d = (e as unknown as { detail?: { value?: string } }).detail
  const raw = d?.value ?? (e.target as HTMLInputElement | null)?.value ?? ''
  // 空输入保持 ''（未填写语义，交给 required 规则）；非法片段回退 ''（不让脏值进 formData）
  const num = raw.trim() === '' ? '' : Number(raw)
  emit('update', { name: props.name, value: Number.isNaN(num) ? '' : num })
}
</script>

<style scoped>
.lc-number {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-number__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-number__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-number__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-number__unit {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
.lc-number__field-row {
  display: flex;
  align-items: center;
}
.lc-number__field {
  flex: 1;
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  font-size: var(--lc-font-body);
  min-height: 44rpx;
}
.lc-number__field--error {
  border-color: var(--lc-status-danger);
}
.lc-number__suffix {
  margin-left: 12rpx;
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-number__error {
  margin-top: 6rpx;
}
.lc-number__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
