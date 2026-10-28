<!--
  PortalStat 物料 —— 门户数据卡（2026-10-28 门户组件库批 2）。

  接口对齐 lc-node：`<lc-portal-stat v-bind="model.props" />`（纯展示）

  形态：主标题 + 副标题（说明区间/口径）+ 数字格（2~4 列，value/label/unit）。
  与 Statistic 物料的分工：
    - Statistic = 单个 KPI（一个数值 + 趋势箭头）；
    - PortalStat = 门户首屏的「数据概览卡」，一卡多指标，不做趋势。

  - items: `{ label, value, unit? }[]`（json setter；也吃 JSON 文本）
  - columns: 1~4，缺省 3；数字统一千分位，非数值原样显示
-->
<template>
  <view class="lc-portal-stat">
    <view class="lc-portal-stat__head">
      <text class="lc-portal-stat__title">{{ title || '数据概览' }}</text>
      <text v-if="subtitle" class="lc-portal-stat__subtitle">{{ subtitle }}</text>
    </view>

    <view v-if="cells.length" class="lc-portal-stat__grid">
      <view v-for="(cell, i) in cells" :key="i" class="lc-portal-stat__cell" :style="{ width: cellWidth }">
        <view class="lc-portal-stat__tile">
          <view class="lc-portal-stat__value-row">
            <text class="lc-portal-stat__value">{{ fmt(cell.value) }}</text>
            <text v-if="cell.unit" class="lc-portal-stat__unit">{{ cell.unit }}</text>
          </view>
          <text class="lc-portal-stat__label">{{ cell.label }}</text>
        </view>
      </view>
    </view>

    <view v-else class="lc-portal-stat__empty">
      <text class="lc-portal-stat__empty-text">在右栏「数字格」里配置指标</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { asArray, groupDigits } from '../props-utils'

interface StatCell {
  label?: string
  value?: unknown
  unit?: string
}

const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    /** 数字格（数组或 JSON 文本） */
    items?: unknown
    /** 每行列数 1~4（缺省 3） */
    columns?: number
  }>(),
  { title: '数据概览', columns: 3 },
)

const cells = computed<StatCell[]>(() =>
  asArray<StatCell>(props.items).filter((it) => it && typeof it === 'object'),
)

const cellWidth = computed(() => {
  const n = Math.floor(Number(props.columns))
  const cols = Number.isFinite(n) ? Math.max(1, Math.min(4, n)) : 3
  return `${100 / cols}%`
})

/** 数值千分位；非数值（含 `$expr` 求值失败的空值）原样显示 */
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? groupDigits(n) : String(v)
}
</script>

<style scoped>
.lc-portal-stat {
  box-sizing: border-box;
  margin: var(--lc-space-2) var(--lc-space-3);
  padding: var(--lc-space-3);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
  background: var(--lc-bg-surface);
}
.lc-portal-stat__head {
  display: flex;
  align-items: baseline;
  gap: var(--lc-space-2);
  margin-bottom: var(--lc-space-2);
}
.lc-portal-stat__title {
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-portal-stat__subtitle {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
/* 数字格：百分比宽度 + flex 换行（grid 在小程序端有兼容差异，不用） */
.lc-portal-stat__grid {
  display: flex;
  flex-wrap: wrap;
  margin: calc(var(--lc-space-0-5) * -1);
}
.lc-portal-stat__cell {
  box-sizing: border-box;
  padding: var(--lc-space-0-5);
}
.lc-portal-stat__tile {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  padding: var(--lc-space-2);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-subtle);
}
.lc-portal-stat__value-row {
  display: flex;
  align-items: baseline;
  gap: var(--lc-space-1);
}
.lc-portal-stat__value {
  font-size: var(--lc-font-h2);
  font-weight: var(--lc-weight-bold);
  color: var(--lc-text-primary);
}
/* 小字放在 `bg-subtle` 浅底上：`text-secondary` 实测亮色只有 **4.37:1**（< 4.5），
   换 `text-label`（亮 9.77 / 暗 9.74），既达 AA 又不抢数字。 */
.lc-portal-stat__unit {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-label);
}
.lc-portal-stat__label {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}
.lc-portal-stat__empty {
  padding: var(--lc-space-4) 0;
  text-align: center;
}
.lc-portal-stat__empty-text {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
</style>
