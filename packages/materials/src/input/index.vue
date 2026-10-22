<!--
  Input 物料 —— 单行输入。归位于 `packages/materials`（Phase 1 第 1 批），由 easycom `^lc-(.*)$` → `@lc/materials/src/$1/index.vue` 解析。
  接口对齐 lc-node：`<lc-input v-bind="model.props" :error="model.error" @update="onChange" />`
   - value 由 Schema 的 `$expr: formData.xxx` 求值注入（受控组件）
   - 输入时 emit('update', { name, value }) → controller.setField → 联动/校验/重渲染
-->
<template>
  <view class="lc-input">
    <view v-if="label" class="lc-input__label-row">
      <text class="lc-input__label">{{ label }}</text>
      <text v-if="required" class="lc-input__required">*</text>
    </view>
    <input
      class="lc-input__field"
      :class="{ 'lc-input__field--error': !!error }"
      :value="displayValue"
      :placeholder="placeholder || '请输入'"
      :disabled="disabled"
      @input="onInput"
    />
    <view v-if="error" class="lc-input__error">
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
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const displayValue = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)))

function onInput(e: Event): void {
  // uni 端：input 被编译为 uni-input 组件，事件载荷在 e.detail.value；
  // PC 设计器（uni-shim）：原生 input 事件无 detail，回退 e.target.value（D-A1 双端兼容）
  const d = (e as unknown as { detail?: { value?: string } }).detail
  const raw = d?.value ?? (e.target as HTMLInputElement | null)?.value ?? ''
  emit('update', { name: props.name, value: raw })
}
</script>

<style scoped>
.lc-input {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-input__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-input__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-input__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-input__field {
  position: relative;
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  font-size: var(--lc-font-body);
  min-height: 44rpx;
}
/* 触控目标 44：视觉仍 37，只向下/上各扩 4px（落在 .lc-input 的 8px 内边距里）。
   字段间距 16px，两侧各吃 4px 后仍余 8px，**不会与相邻字段的热区重叠**。
   注：伪元素在 uni H5 生效；小程序端不渲染，属渐进增强（布局与点击均不受影响）。 */
.lc-input__field::after {
  content: '';
  position: absolute;
  inset: calc(var(--lc-space-1) * -1) 0;
}

.lc-input__field--error {
  border-color: var(--lc-status-danger);
}
.lc-input__error {
  margin-top: 6rpx;
}
.lc-input__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
