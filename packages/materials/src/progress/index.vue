<!--
  Progress 物料 —— 进度条（Phase 2 批 3，反馈展示件）。
  接口对齐 lc-node：`<lc-progress v-bind="model.props" />`（纯展示，percent 可用 `$expr` 联动）
   - percent: 0~100（内部截断）
-->
<template>
  <view class="lc-progress">
    <view class="lc-progress__track">
      <view
        class="lc-progress__bar"
        :style="{ width: `${clamped}%`, background: activeColor || 'var(--lc-action-primary)' }"
      />
    </view>
    <text v-if="showText" class="lc-progress__text">{{ clamped }}%</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    percent?: number | string
    /** 进度条颜色 */
    activeColor?: string
    /** 右侧百分比文本 */
    showText?: boolean
  }>(),
  { showText: true },
)

const clamped = computed(() => {
  const n = Number(props.percent ?? 0)
  if (Number.isNaN(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
})
</script>

<style scoped>
.lc-progress {
  display: flex;
  align-items: center;
  padding: 20rpx var(--lc-space-3);
}
.lc-progress__track {
  flex: 1;
  height: 12rpx;
  background: var(--lc-border-default);
  border-radius: 6rpx;
  overflow: hidden;
}
.lc-progress__bar {
  height: 100%;
  border-radius: 6rpx;
  min-width: 0;
}
.lc-progress__text {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
  margin-left: var(--lc-space-2);
  width: 72rpx;
  text-align: right;
}
</style>
