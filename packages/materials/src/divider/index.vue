<!--
  Divider 物料 —— 分割线（可带文字）。归位于 `packages/materials`（Phase 1 第 1 批）。
  接口对齐 lc-node：`<lc-divider v-bind="model.props" />`（纯展示，无事件）
-->
<template>
  <view class="lc-divider" :class="`lc-divider--${direction || 'center'}`">
    <view class="lc-divider__line lc-divider__line--left" />
    <text v-if="text" class="lc-divider__text">{{ text }}</text>
    <view class="lc-divider__line lc-divider__line--right" />
  </view>
</template>

<script setup lang="ts">
defineProps<{
  text?: string
  direction?: 'left' | 'center' | 'right'
}>()
</script>

<style scoped>
.lc-divider {
  display: flex;
  align-items: center;
  padding: var(--lc-space-3);
}
.lc-divider__line {
  flex: 1;
  height: 1rpx;
  background: var(--lc-border-default);
}
/* direction 生效点：居左/居右时把对侧线收成短线，默认 center 两侧等分 */
.lc-divider--left .lc-divider__line--left,
.lc-divider--right .lc-divider__line--right {
  flex: 0 0 32rpx;
}
.lc-divider__text {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
  padding: 0 var(--lc-space-2);
}
</style>
