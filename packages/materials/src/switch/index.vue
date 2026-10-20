<!--
  Switch 物料 —— 开关。归位于 `packages/materials`（Phase 1 第 1 批）。
  接口对齐 lc-node：`<lc-switch v-bind="model.props" :error="model.error" @update="onChange" />`
   - uni switch change 的 detail.value 是 boolean，直接透传（关联 condition 显隐的首选控件）
-->
<template>
  <view class="lc-switch">
    <view class="lc-switch__main">
      <view class="lc-switch__labels">
        <view v-if="label" class="lc-switch__label-row">
          <text class="lc-switch__label">{{ label }}</text>
          <text v-if="required" class="lc-switch__required">*</text>
        </view>
        <text v-if="help" class="lc-switch__help">{{ help }}</text>
      </view>
      <switch class="lc-switch__ctl" :checked="!!value" :disabled="disabled" color="var(--lc-action-primary)" @change="onChange" />
    </view>
    <view v-if="error" class="lc-switch__error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  name?: string
  label?: string
  help?: string
  value?: unknown
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

function onChange(e: Event): void {
  const detail = (e as unknown as { detail?: { value?: boolean } }).detail
  emit('update', { name: props.name, value: detail?.value ?? false })
}
</script>

<style scoped>
.lc-switch {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-switch__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44rpx;
}
.lc-switch__labels {
  flex: 1;
  margin-right: 20rpx;
}
.lc-switch__label-row {
  display: flex;
  align-items: center;
}
.lc-switch__label {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-switch__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-switch__help {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  margin-top: 4rpx;
}
.lc-switch__error {
  margin-top: 6rpx;
}
.lc-switch__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
