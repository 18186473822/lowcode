<!--
  MoneyInput 物料 —— 金额输入（Phase 2 批 3，对齐 FieldType `money`）。
  接口对齐 lc-node：`<lc-money-input v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: number|string（受控，数字串；千分位/落库格式化留给动作/表达式，物料只做输入与前缀展示）
   - input type="digit"（uni 三端数字键盘；PC 原生可用）
-->
<template>
  <view class="lc-money-input">
    <view v-if="label" class="lc-money-input__label-row">
      <text class="lc-money-input__label">{{ label }}</text>
      <text v-if="required" class="lc-money-input__required">*</text>
    </view>
    <view
      class="lc-money-input__box"
      :class="{ 'lc-money-input__box--error': !!error, 'lc-money-input__box--disabled': disabled }"
    >
      <text class="lc-money-input__prefix">{{ prefix || '¥' }}</text>
      <input
        class="lc-money-input__field"
        type="digit"
        :value="stringValue"
        :placeholder="placeholder || '请输入金额'"
        :disabled="disabled"
        @input="onInput"
      />
      <text v-if="unit" class="lc-money-input__unit">{{ unit }}</text>
    </view>
    <view v-if="error" class="lc-money-input__error">
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
  /** 金额前缀符号，默认 ¥ */
  prefix?: string
  /** 单位后缀（如 元） */
  unit?: string
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const stringValue = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)))

function onInput(e: unknown): void {
  // uni 端：e.detail.value；PC 原生：e.target.value（双端兼容，同 input 物料）
  const d = (e as { detail?: { value?: string } }).detail
  const raw = d?.value ?? (e as { target?: { value?: string } }).target?.value ?? ''
  emit('update', { name: props.name, value: raw })
}
</script>

<style scoped>
.lc-money-input {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-money-input__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-money-input__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-money-input__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-money-input__box {
  display: flex;
  align-items: center;
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  min-height: 44rpx;
}
.lc-money-input__box--error {
  border-color: var(--lc-status-danger);
}
.lc-money-input__box--disabled {
  background: var(--lc-bg-canvas);
}
.lc-money-input__prefix {
  font-size: var(--lc-font-body-lg);
  color: var(--lc-text-primary);
  margin-right: 12rpx;
}
.lc-money-input__field {
  flex: 1;
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-money-input__unit {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
  margin-left: 12rpx;
}
.lc-money-input__error {
  margin-top: 6rpx;
}
.lc-money-input__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
