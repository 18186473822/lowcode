<!--
  Picker 物料 —— 通用单列选择（Phase 2 批 3，补 Select 之外的轻量选择形态；亦作 relation 类字段的通用选择基底）。
  接口对齐 lc-node：`<lc-picker v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: options[].value 任一值（受控）；内部按 value 反查下标交给 uni `<picker>`（change 载荷为下标）
   - 与 Select 的分工：Select 是表单原生下拉展开；Picker 是移动端滚轮弹层（更贴 uni 交互）
-->
<template>
  <view class="lc-picker">
    <view v-if="label" class="lc-picker__label-row">
      <text class="lc-picker__label">{{ label }}</text>
      <text v-if="required" class="lc-picker__required">*</text>
    </view>
    <picker :range="labels" :value="index < 0 ? 0 : index" :disabled="disabled" @change="onChange">
      <view
        class="lc-picker__cell"
        :class="{ 'lc-picker__cell--error': !!error, 'lc-picker__cell--disabled': disabled }"
      >
        <text :class="index >= 0 ? 'lc-picker__value' : 'lc-picker__placeholder'">
          {{ index >= 0 ? labels[index] : placeholder || '请选择' }}
        </text>
        <text class="lc-picker__arrow">›</text>
      </view>
    </picker>
    <view v-if="error" class="lc-picker__error">
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
  options?: Opt[]
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const optionList = computed<Opt[]>(() => (Array.isArray(props.options) ? props.options : []))
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
.lc-picker {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-picker__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-picker__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-picker__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-picker__cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  min-height: 44rpx;
}
.lc-picker__cell--error {
  border-color: var(--lc-status-danger);
}
.lc-picker__cell--disabled {
  background: var(--lc-bg-canvas);
}
.lc-picker__value {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-picker__placeholder {
  font-size: var(--lc-font-body);
  color: var(--lc-text-tertiary);
}
.lc-picker__arrow {
  font-size: var(--lc-font-h3);
  color: var(--lc-text-tertiary);
  margin-left: 12rpx;
}
.lc-picker__error {
  margin-top: 6rpx;
}
.lc-picker__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
