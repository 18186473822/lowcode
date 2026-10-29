<!--
  PortalGrid 物料 —— 魔方 / 九宫格入口（2026-10-29 P2）

  接口对齐 lc-node：`<lc-portal-grid v-bind="model.props" />`

  与门户英雄区 `portal.cards` 的分工：
    - `portal.cards` 是**页面级**配置（大卡片，带描述，由 lc-portal-page 渲染）；
    - PortalGrid 是**画布物料**（小格入口，只要图标 + 名称，可拖到任意位置、可选 3/4 列）。

  点击：
    - 配了 `pageId` → 直接跳 `/pages/view/index?pageId=…`（云程口径：选了页面就能跳）；
    - 没配 → 只发 `itemClick`，由属性面板的「动作绑定」处理。
  设计器画布的安全性：canvas 注入的 `uni` 只有 chooseImage/previewImage/chooseFile，
  没有 `navigateTo` —— 能力探测失败即 no-op，不会把设计器跳走。
-->
<template>
  <view class="lc-portal-grid">
    <text v-if="title" class="lc-portal-grid__title">{{ title }}</text>

    <view v-if="cells.length" class="lc-portal-grid__body">
      <view
        v-for="(item, i) in cells"
        :key="i"
        class="lc-portal-grid__cell"
        :style="{ width: cellWidth }"
        @tap="onTap(item)"
      >
        <view class="lc-portal-grid__tile" :class="`lc-portal-grid__tile--${i % 4}`">
          <text class="lc-portal-grid__glyph">{{ item.icon || firstChar(item.title) }}</text>
        </view>
        <text class="lc-portal-grid__label">{{ item.title }}</text>
      </view>
    </view>

    <view v-else class="lc-portal-grid__empty">
      <text class="lc-portal-grid__empty-text">
        在右栏「入口项」里配置：{"icon":"考","title":"考勤","pageId":"页面编码"}
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { asArray } from '../props-utils'

interface GridItem {
  icon?: string
  title?: string
  pageId?: string
}

const props = withDefaults(
  defineProps<{
    /** 分组标题（可空） */
    title?: string
    /** 入口项（数组或 JSON 文本） */
    items?: unknown
    /** 每行列数：3 或 4（缺省 4） */
    columns?: number
  }>(),
  { title: '', columns: 4 },
)

const emit = defineEmits<{ itemClick: [item: GridItem] }>()

const cells = computed(() =>
  asArray<GridItem>(props.items).filter((it) => it && (it.title || it.icon)),
)
const cols = computed(() => (props.columns === 3 ? 3 : 4))
const cellWidth = computed(() => `${100 / cols.value}%`)

function firstChar(text?: string): string {
  return (text ?? '').trim().slice(0, 1) || '·'
}

function onTap(item: GridItem): void {
  emit('itemClick', item)
  const pageId = typeof item.pageId === 'string' ? item.pageId.trim() : ''
  if (!pageId) return
  // 画布里的 uni 是 PC polyfill（无 navigateTo）→ 这里天然 no-op，不会跳走设计器
  const api = (globalThis as { uni?: { navigateTo?: (o: { url: string }) => void } }).uni
  if (api && typeof api.navigateTo === 'function') {
    api.navigateTo({ url: `/pages/view/index?pageId=${encodeURIComponent(pageId)}` })
  }
}
</script>

<style scoped>
.lc-portal-grid {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
  padding: var(--lc-space-3);
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-md);
}
.lc-portal-grid__title {
  font-size: var(--lc-font-body-sm);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-portal-grid__body {
  display: flex;
  flex-wrap: wrap;
}
.lc-portal-grid__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--lc-space-1);
  padding: var(--lc-space-2) 0;
  box-sizing: border-box;
}
.lc-portal-grid__cell:active {
  opacity: 0.8;
}
.lc-portal-grid__tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76rpx;
  height: 76rpx;
  border-radius: var(--lc-radius-md);
}
.lc-portal-grid__tile--0 {
  color: var(--lc-status-danger);
  background: var(--lc-status-danger-bg);
}
.lc-portal-grid__tile--1 {
  color: var(--lc-status-warning);
  background: var(--lc-status-warning-bg);
}
.lc-portal-grid__tile--2 {
  color: var(--lc-action-primary);
  background: var(--lc-status-info-bg);
}
.lc-portal-grid__tile--3 {
  color: var(--lc-status-success);
  background: var(--lc-status-success-bg);
}
.lc-portal-grid__glyph {
  font-size: var(--lc-font-body);
  font-weight: var(--lc-weight-semibold);
}
.lc-portal-grid__label {
  max-width: 100%;
  overflow: hidden;
  font-size: var(--lc-font-micro);
  color: var(--lc-text-secondary);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-portal-grid__empty {
  padding: var(--lc-space-4) var(--lc-space-2);
  text-align: center;
}
.lc-portal-grid__empty-text {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  line-height: var(--lc-leading-readable);
}
</style>
