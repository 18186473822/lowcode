<!--
  PortalNotice 物料 —— 门户公告条（2026-10-28 门户组件库批 2）。

  接口对齐 lc-node：`<lc-portal-notice v-bind="model.props" @item-click="onItem" />`

  - items: `string[]` 或 `{ text, pageId? }[]`（json setter / JSON 文本都吃）；
    空则回退 `text` 单条文案 —— 只配一句话也能用。
  - 多条时按 `interval` 轮换（缺省 4s），左侧「公告」标签 + 右侧箭头；
  - 点击 emit itemClick(index)，动作绑定后由节点响应。

  配色只用令牌：底 = 警示浅底，标签 = 警示色（该「前景/背景」组合已在
  check-contrast 基线内，4.5:1 达标），正文用 text-primary。
-->
<template>
  <view class="lc-notice" @tap="onTap">
    <text class="lc-notice__label">{{ title || '公告' }}</text>
    <view class="lc-notice__body">
      <text v-if="current" class="lc-notice__text">{{ current }}</text>
      <text v-else class="lc-notice__empty">在右栏配置公告内容</text>
    </view>
    <text v-if="more" class="lc-notice__arrow">›</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { asArray } from '../props-utils'

type NoticeItem = string | { text?: string; pageId?: string }

const props = withDefaults(
  defineProps<{
    /** 公告项：字符串数组或 `{text,pageId}` 数组（也接受 JSON 文本） */
    items?: unknown
    /** 单条兜底文案（items 为空时使用） */
    text?: string
    /** 左侧标签（缺省「公告」） */
    title?: string
    /** 多条轮换间隔（ms，缺省 4000；<=0 不轮换） */
    interval?: number
    /** 是否显示右侧箭头（缺省 true） */
    more?: boolean
  }>(),
  { title: '公告', interval: 4000, more: true },
)

const emit = defineEmits<{ itemClick: [index: number] }>()

/** 归一为纯文本数组（`{text}` 取 text），过滤空串 */
const texts = computed<string[]>(() => {
  const rows = asArray<NoticeItem>(props.items)
    .map((it) => (typeof it === 'string' ? it : String(it?.text ?? '')))
    .map((t) => t.trim())
    .filter(Boolean)
  if (rows.length) return rows
  const single = (props.text ?? '').trim()
  return single ? [single] : []
})

const index = ref(0)
const current = computed(() => texts.value[index.value] ?? '')

let timer: ReturnType<typeof setInterval> | null = null

function stop(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function start(): void {
  stop()
  const total = texts.value.length
  if (total < 2 || !(props.interval > 0)) return
  timer = setInterval(() => {
    index.value = (index.value + 1) % total
  }, props.interval)
}

function onTap(): void {
  emit('itemClick', index.value)
}

onMounted(start)
onUnmounted(stop)

watch(
  () => [texts.value.length, props.interval] as const,
  () => {
    if (index.value >= texts.value.length) index.value = 0
    start()
  },
)
</script>

<style scoped>
.lc-notice {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  box-sizing: border-box;
  margin: var(--lc-space-2) var(--lc-space-3);
  padding: var(--lc-space-2) var(--lc-space-3);
  border-radius: var(--lc-radius-md);
  background: var(--lc-status-warning-bg);
}
.lc-notice__label {
  flex-shrink: 0;
  padding-right: var(--lc-space-2);
  border-right: 1rpx solid var(--lc-status-warning);
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-status-warning);
}
.lc-notice__body {
  flex: 1;
  min-width: 0;
}
.lc-notice__text {
  display: block;
  overflow: hidden;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.lc-notice__empty {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
.lc-notice__arrow {
  flex-shrink: 0;
  font-size: var(--lc-font-body-lg);
  color: var(--lc-text-secondary);
}
</style>
