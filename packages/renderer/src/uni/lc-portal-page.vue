<!--
  lc-portal-page.vue —— type=portal 标准门户页（Phase 3 批 4，D-P3-11）

  - 配置驱动（schema.portal：title / columns / cards）的**卡片导航**区 +
    NodeSchema 树（拖入的图表/统计/KPI）**自由拖拽区**——两者共存。
  - 点卡：配 url → emit('open-url')；配 pageId → emit('navigate', {pageId})；
    壳层（runtime view）接线跳转 —— renderer 不依赖 uni API（沿 D-A2 分层）。
  - 卡片可空 = 纯拖拽门户（validate 不强制配置）。
-->
<template>
  <view class="lc-portal-page">
    <view v-if="cards.length" class="lc-portal-page__hero">
      <text v-if="title" class="lc-portal-page__title">{{ title }}</text>
      <view class="lc-portal-page__grid">
        <view
          v-for="(card, i) in cards"
          :key="i"
          class="lc-card"
          :style="{ width: cardWidth }"
          @tap="onCard(card)"
        >
          <view class="lc-card__tile" :class="`lc-card__tile--${i % 4}`">
            <text v-if="glyph(card.icon)" class="lc-card__glyph">{{ glyph(card.icon) }}</text>
          </view>
          <text class="lc-card__title">{{ card.title }}</text>
          <text v-if="card.desc" class="lc-card__desc">{{ card.desc }}</text>
          <text v-if="card.badge" class="lc-card__badge">{{ card.badge }}</text>
        </view>
      </view>
    </view>

    <!-- 自由拖拽区：图表 / 指标卡 / 任意物料树（portal 页运行时渲染 root 树） -->
    <lc-renderer
      :schema="schema"
      :options="options"
      :mode="mode"
      :selected-id="selectedId"
      @select="emit('select', $event)"
    />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PageSchema, PortalCard } from '@lc/schema'
import type { PageControllerOptions } from '@lc/renderer'
import LcRenderer from './lc-renderer.vue'

const props = defineProps<{
  schema: PageSchema
  options: PageControllerOptions
  /** design = 设计画布复用本组件（卡片区可见 + 下方拖拽区可选中）；缺省运行时 */
  mode?: 'runtime' | 'design'
  /** design 态选中节点（与 lc-renderer 同口径） */
  selectedId?: string
}>()

const emit = defineEmits<{
  /** 点卡跳转低代码页面（pageId） */
  navigate: [target: { pageId: string; params: Record<string, unknown> }]
  /** 点卡打开外部地址（卡配 url 时；壳层负责端能力） */
  'open-url': [url: string]
  /** design 态：选中拖拽区节点（透传内层 lc-renderer） */
  select: [id: string]
}>()

const cfg = computed(() => props.schema.portal)
const cards = computed<PortalCard[]>(() => cfg.value?.cards ?? [])
const title = computed(() => cfg.value?.title ?? props.schema.name ?? '')

/** 卡片宽度：按 columns 均分（flex 换行，兼容 MP；不用 grid 以免端差异） */
const cardWidth = computed(() => {
  const cols = Math.max(1, Math.min(6, Math.floor(cfg.value?.columns ?? 2)))
  return `${100 / cols}%`
})

/** 内置字符图标集（与 Icon 物料同款；未知值退化为首字符） */
const BUILTIN: Record<string, string> = {
  success: '✓',
  warn: '⚠',
  error: '✕',
  info: 'ℹ',
  home: '⌂',
  user: '👤',
  set: '⚙',
  date: '📅',
  search: '🔍',
  more: '⋯',
  back: '‹',
}
function glyph(name?: string): string {
  const n = (name ?? '').trim()
  if (!n) return ''
  return BUILTIN[n] ?? n.slice(0, 1)
}

function onCard(card: PortalCard): void {
  // 设计态点卡不跳转：此时用户是在摆卡片，误触跳走会丢当前编辑上下文
  if (props.mode === 'design') return
  if (card.url) {
    emit('open-url', card.url)
    return
  }
  if (card.pageId) {
    emit('navigate', { pageId: card.pageId, params: {} })
  }
}
</script>

<style scoped>
.lc-portal-page {
  display: flex;
  flex-direction: column;
  min-height: 200rpx;
}
.lc-portal-page__hero {
  padding: var(--lc-space-3) var(--lc-space-3) var(--lc-space-1);
}
.lc-portal-page__title {
  display: block;
  margin-bottom: var(--lc-space-2);
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-bold);
  color: var(--lc-text-primary);
}
.lc-portal-page__grid {
  display: flex;
  flex-wrap: wrap;
  margin: calc(var(--lc-space-1) * -1);
}
.lc-card {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--lc-space-2) var(--lc-space-1);
}
/* 图标块：四色轮换（与云程「常用流程」宫格一致），配色全部走令牌 */
.lc-card__tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84rpx;
  height: 84rpx;
  border-radius: var(--lc-radius-md);
}
.lc-card__tile--0 {
  color: var(--lc-status-danger);
  background: var(--lc-status-danger-bg);
}
.lc-card__tile--1 {
  color: var(--lc-status-warning);
  background: var(--lc-status-warning-bg);
}
.lc-card__tile--2 {
  color: var(--lc-action-primary);
  background: var(--lc-status-info-bg);
}
.lc-card__tile--3 {
  color: var(--lc-status-success);
  background: var(--lc-status-success-bg);
}
.lc-card:active .lc-card__tile {
  opacity: 0.8;
}
.lc-card__glyph {
  font-size: var(--lc-font-h2);
  line-height: var(--lc-leading-label);
}
.lc-card__title {
  margin-top: var(--lc-space-1);
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
  text-align: center;
}
.lc-card__badge {
  position: absolute;
  top: var(--lc-space-1);
  right: var(--lc-space-2);
  min-width: 32rpx;
  padding: 0 var(--lc-space-1);
  border-radius: 999rpx;
  background: var(--lc-status-danger-bg);
  color: var(--lc-status-danger);
  font-size: var(--lc-font-micro);
  text-align: center;
}
.lc-card__desc {
  display: block;
  margin-top: var(--lc-space-0-5);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-secondary);
  text-align: center;
}
</style>
