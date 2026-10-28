<!--
  PortalBanner 物料 —— 门户轮播图（2026-10-28 门户组件库批 2）。

  接口对齐 lc-node：`<lc-portal-banner v-bind="model.props" @item-click="onItem" />`

  为什么不用 uni `<swiper>`：设计器画布是纯 Vue 工程，`swiper` 既非浏览器原生标签、
  也不在设计器 shim 名单里 —— 画布会渲染成未知行内元素，轮播在「所见即所得」里失效。
  这里用「绝对定位叠层 + 透明度切换 + 定时器 + 触摸位移」自实现，三端同构：
  小程序 / H5 / 设计器画布行为一致（代价是没有原生轮播的惯性动效）。

  文字**不压在图片上**：压图必须用「恒白文字 + 深色蒙层」才能兼顾亮/暗主题，
  而暗色主题下 `--lc-text-inverse` 是深色 —— 直接叠字会看不清。改为图片在上、
  说明条在下（surface 底 + 常规文字令牌），两套主题都过对比度。

  - items: `{ title?, desc?, image?, pageId?, url? }[]`；`image` 留空显示令牌色占位块
  - 圆点可点；左右滑动超过 40px 切换；点击当前项 emit itemClick(index)

  高度为什么用**百分比内边距**而不是内联 `height: 300rpx`：
   小程序的 rpx 是**编译期**单位（CSS 由构建转换），浏览器不认识内联样式里的 `rpx`，
   设计器画布会直接丢掉这条声明 → 轮播高度变 0（这是实测踩到的坑）。而 rpx 的语义
   就是「屏宽/750」，所以 `padding-top: height/750*100%` 在 H5 / 小程序 / 画布三端
   等价，且随宽度自适应。
-->
<template>
  <view class="lc-banner" :style="rootStyle" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <view
      v-for="(item, i) in list"
      :key="i"
      class="lc-banner__slide"
      :class="{ 'lc-banner__slide--active': i === index }"
      @tap="onTap(i)"
    >
      <image v-if="item.image" class="lc-banner__img" :src="item.image" mode="aspectFill" />
      <!-- 无图占位：只铺令牌色，不重复标题（标题/说明统一由下方说明条承担） -->
      <view v-else class="lc-banner__fallback" :class="`lc-banner__fallback--${i % 4}`" />
      <view v-if="item.title || item.desc" class="lc-banner__caption">
        <text v-if="item.title" class="lc-banner__title">{{ item.title }}</text>
        <text v-if="item.desc" class="lc-banner__desc">{{ item.desc }}</text>
      </view>
    </view>

    <view v-if="!list.length" class="lc-banner__empty">
      <text class="lc-banner__empty-text">在右栏「轮播项」里配置图片或标题</text>
    </view>

    <view v-if="showDots" class="lc-banner__dots">
      <view
        v-for="(_, i) in list"
        :key="i"
        class="lc-banner__dot"
        :class="{ 'lc-banner__dot--active': i === index }"
        @tap.stop="go(i)"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { asArray } from '../props-utils'

interface BannerItem {
  title?: string
  desc?: string
  image?: string
  pageId?: string
  url?: string
}

const props = withDefaults(
  defineProps<{
    /** 轮播项（数组，或 json setter 早期写入的 JSON 文本） */
    items?: unknown
    /** 高度（rpx，缺省 300） */
    height?: number | string
    /** 自动切换间隔（ms，缺省 3000；<=0 不切换） */
    interval?: number
    /** 是否自动播放（缺省 true） */
    autoplay?: boolean
    /** 是否显示圆点（缺省 true） */
    indicator?: boolean
  }>(),
  { height: 300, interval: 3000, autoplay: true, indicator: true },
)

const emit = defineEmits<{ itemClick: [index: number] }>()

const list = computed<BannerItem[]>(() =>
  asArray<BannerItem>(props.items).filter((it) => it && typeof it === 'object'),
)

const index = ref(0)

/** 高度（rpx）→ 占宽的百分比（rpx ≡ 屏宽/750，故 300rpx = 40% 宽） */
const rootStyle = computed(() => {
  const n = Number(props.height)
  const rpx = Number.isFinite(n) && n > 0 ? n : 300
  return `padding-top: ${(rpx / 750) * 100}%`
})

const showDots = computed(() => props.indicator && list.value.length > 1)

/** 定时器句柄（类型用 ReturnType，避免依赖 DOM/Node 的 setInterval 重载差异） */
let timer: ReturnType<typeof setInterval> | null = null

function stop(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function start(): void {
  stop()
  const total = list.value.length
  if (!props.autoplay || total < 2 || !(props.interval > 0)) return
  timer = setInterval(() => {
    index.value = (index.value + 1) % total
  }, props.interval)
}

function go(i: number): void {
  const total = list.value.length
  if (!total) return
  index.value = ((i % total) + total) % total
}

function onTap(i: number): void {
  emit('itemClick', i)
}

/* ---------------- 触摸滑动（三端同构的最小实现） ---------------- */

let startX = 0

function pointX(e: unknown): number {
  const ev = e as {
    touches?: Array<{ clientX?: number }>
    changedTouches?: Array<{ clientX?: number }>
  }
  const t = ev.touches?.[0] ?? ev.changedTouches?.[0]
  return typeof t?.clientX === 'number' ? t.clientX : 0
}

function onTouchStart(e: unknown): void {
  startX = pointX(e)
}

function onTouchEnd(e: unknown): void {
  if (list.value.length < 2 || !startX) return
  const delta = startX - pointX(e)
  startX = 0
  if (Math.abs(delta) < 40) return
  go(index.value + (delta > 0 ? 1 : -1))
}

/* ---------------- 生命周期 ---------------- */

onMounted(start)
onUnmounted(stop)

// 配置变化要重起定时器：条数变少时把当前页拉回合法范围
watch(
  () => [list.value.length, props.autoplay, props.interval] as const,
  () => {
    if (index.value >= list.value.length) index.value = 0
    start()
  },
)
</script>

<style scoped>
.lc-banner {
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
  margin: var(--lc-space-2) var(--lc-space-3);
  background: var(--lc-bg-subtle);
  border-radius: var(--lc-radius-md);
}
.lc-banner__slide {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--lc-duration-base) var(--lc-ease-standard);
}
.lc-banner__slide--active {
  opacity: 1;
  pointer-events: auto;
}
.lc-banner__img {
  flex: 1;
  width: 100%;
  min-height: 0;
}
/* 无图占位：四色轮换（与门户卡片图标块同源），仅用令牌色 */
.lc-banner__fallback {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.lc-banner__fallback--0 {
  background: var(--lc-status-danger-bg);
}
.lc-banner__fallback--1 {
  background: var(--lc-status-warning-bg);
}
.lc-banner__fallback--2 {
  background: var(--lc-status-info-bg);
}
.lc-banner__fallback--3 {
  background: var(--lc-status-success-bg);
}
.lc-banner__caption {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  padding: var(--lc-space-1-5) var(--lc-space-3);
  background: var(--lc-bg-surface);
  border-top: 1rpx solid var(--lc-border-default);
}
.lc-banner__title {
  font-size: var(--lc-font-body);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-banner__desc {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.lc-banner__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lc-banner__empty-text {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
.lc-banner__dots {
  position: absolute;
  top: var(--lc-space-2);
  right: var(--lc-space-3);
  display: flex;
  gap: var(--lc-space-1);
}
.lc-banner__dot {
  width: 10rpx;
  height: 10rpx;
  border: 1rpx solid var(--lc-bg-surface);
  border-radius: var(--lc-radius-pill);
  background: var(--lc-bg-inverse);
  opacity: 0.5;
}
.lc-banner__dot--active {
  width: 24rpx;
  opacity: 1;
}
</style>
