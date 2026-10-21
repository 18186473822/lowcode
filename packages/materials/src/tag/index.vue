<!--
  Tag 物料 —— 标签（Phase 2 批 3，基础展示件）。
  接口对齐 lc-node：`<lc-tag v-bind="model.props" />`（纯展示）
   - type: primary/success/warning/danger/info（预设色）；text 直显
-->
<template>
  <view class="lc-tag" :class="`lc-tag--${type || 'info'}`">
    <text class="lc-tag__text">{{ text }}</text>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  text?: string
  /** 预设色：primary / success / warning / danger / info */
  type?: string
}>()
</script>

<style scoped>
.lc-tag {
  display: inline-flex;
  align-items: center;
  padding: 4rpx var(--lc-space-2);
  border-radius: var(--lc-radius-xs);
  margin: var(--lc-space-1) var(--lc-space-3);
}
.lc-tag__text {
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-readable);
}
.lc-tag--primary {
  background: var(--lc-action-primary-subtle);
  color: var(--lc-action-primary);
}
.lc-tag--success {
  background: var(--lc-status-success-bg);
  color: var(--lc-status-success);
}
.lc-tag--warning {
  background: var(--lc-status-warning-bg);
  color: var(--lc-status-warning);
}
.lc-tag--danger {
  background: var(--lc-status-danger-bg);
  color: var(--lc-status-danger);
}
.lc-tag--info {
  background: var(--lc-border-default);
  color: var(--lc-text-secondary);
}
</style>
