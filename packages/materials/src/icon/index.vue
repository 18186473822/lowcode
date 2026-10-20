<!--
  Icon 物料 —— 图标（Phase 2 批 3，基础展示件）。
  接口对齐 lc-node：`<lc-icon v-bind="model.props" />`（纯展示）
   - name: 内置字符图标集（不引字体包，见台账未做项）；未知 name 退化为首字符
-->
<template>
  <view class="lc-icon">
    <text class="lc-icon__glyph" :style="{ fontSize: `${size || 32}rpx` }">{{ glyph }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** 图标名（内置集：success/warn/error/info/home/user/set/date/search/more/back） */
  name?: string
  /** 字号（rpx） */
  size?: number
}>()

/** 内置字符图标集（通用 unicode 字形，三端字体均覆盖） */
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

const glyph = computed(() => {
  const n = (props.name ?? '').trim()
  if (BUILTIN[n]) return BUILTIN[n]
  return n ? n.slice(0, 1) : '•'
})
</script>

<style scoped>
.lc-icon {
  display: inline-flex;
  align-items: center;
  padding: var(--lc-space-1) var(--lc-space-3);
}
.lc-icon__glyph {
  color: var(--lc-text-primary);
  line-height: 1;
}
</style>
