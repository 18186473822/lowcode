<!--
  Statistic 物料 —— 指标卡（Phase 3 批 4，D-P3-10）。

  接口对齐 lc-node：`<lc-statistic v-bind="model.props" />`（纯展示，value 可用 `$expr` 联动）
  - value 支持数字/数字串（千分位按 precision）；非数值原样显示
  - trend：up/down/flat 箭头配色（纯展示，不参与计算）
-->
<template>
  <view class="lc-stat">
    <text class="lc-stat__label">{{ label }}</text>
    <view class="lc-stat__row">
      <text class="lc-stat__value">{{ display }}</text>
      <text v-if="unit" class="lc-stat__unit">{{ unit }}</text>
      <text v-if="trendGlyph" class="lc-stat__trend" :class="`lc-stat__trend--${trend}`">{{ trendGlyph }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatStatistic } from '../chart/chart-svg'

const props = withDefaults(
  defineProps<{
    label?: string
    /** 指标值（数字或数字串；支持 `$expr`） */
    value?: number | string
    /** 单位后缀 */
    unit?: string
    /** 小数位（缺省 0） */
    precision?: number
    /** 趋势标识（纯展示） */
    trend?: 'up' | 'down' | 'flat'
  }>(),
  { label: '指标', precision: 0 },
)

const display = computed(() => formatStatistic(props.value, { precision: props.precision }))

const trendGlyph = computed(() => {
  if (props.trend === 'up') return '↑'
  if (props.trend === 'down') return '↓'
  if (props.trend === 'flat') return '→'
  return ''
})
</script>

<style scoped>
.lc-stat {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  padding: var(--lc-space-3);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
  background: var(--lc-bg-surface);
}
.lc-stat__label {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.lc-stat__row {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
}
.lc-stat__value {
  font-size: 48rpx;
  font-weight: 700;
  color: var(--lc-text-primary);
}
.lc-stat__unit {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-tertiary);
}
.lc-stat__trend {
  margin-left: 4rpx;
  font-size: var(--lc-font-body);
  font-weight: 700;
}
.lc-stat__trend--up {
  color: var(--lc-status-success);
}
.lc-stat__trend--down {
  color: var(--lc-status-danger);
}
.lc-stat__trend--flat {
  color: var(--lc-text-tertiary);
}
</style>
