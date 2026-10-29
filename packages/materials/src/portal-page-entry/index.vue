<!--
  PortalPageEntry 物料 —— 页面入口 / 业务组件（2026-10-29 P2）

  接口对齐 lc-node：`<lc-portal-page-entry v-bind="model.props" />`

  对应云程「业务组件」：从**已配置的移动页面**里选一个，直接变成一个入口卡。
  与魔方（PortalGrid）的分工：
    - PortalGrid = 多个小格入口，类目式；
    - PortalPageEntry = 单条大卡（图标 + 标题 + 说明），适合「重点业务入口」。

  目标页面用 `pagePicker` setter 从已保存页面里选（不再手敲 pageId）。
  点击行为同 PortalGrid：配了 pageId 直接跳，否则只发 itemClick 给动作绑定。
-->
<template>
  <view class="lc-portal-entry" @tap="onTap">
    <view class="lc-portal-entry__tile">
      <text class="lc-portal-entry__glyph">{{ icon || firstChar(title) }}</text>
    </view>

    <view class="lc-portal-entry__main">
      <text class="lc-portal-entry__title">{{ title || pageId || '未选择页面' }}</text>
      <text v-if="desc" class="lc-portal-entry__desc">{{ desc }}</text>
      <text v-else-if="!pageId" class="lc-portal-entry__desc">在右栏「目标页面」里选一个已保存页面</text>
      <text v-else class="lc-portal-entry__desc">{{ pageId }}</text>
    </view>

    <text class="lc-portal-entry__arrow">›</text>
  </view>
</template>

<script setup lang="ts">
interface EntryPayload {
  pageId?: string
  title?: string
}

const props = withDefaults(
  defineProps<{
    /** 标题（留空回落到页面编码） */
    title?: string
    /** 说明文案 */
    desc?: string
    /** 图标字（单字；留空取标题首字） */
    icon?: string
    /** 目标页面编码（pagePicker） */
    pageId?: string
  }>(),
  { title: '', desc: '', icon: '', pageId: '' },
)

const emit = defineEmits<{ itemClick: [item: EntryPayload] }>()

function firstChar(text?: string): string {
  return (text ?? '').trim().slice(0, 1) || '入'
}

function onTap(): void {
  const pageId = props.pageId.trim()
  emit('itemClick', { pageId, title: props.title })
  if (!pageId) return
  // 画布里的 uni 是 PC polyfill（无 navigateTo）→ 这里天然 no-op
  const api = (globalThis as { uni?: { navigateTo?: (o: { url: string }) => void } }).uni
  if (api && typeof api.navigateTo === 'function') {
    api.navigateTo({ url: `/pages/view/index?pageId=${encodeURIComponent(pageId)}` })
  }
}
</script>

<style scoped>
.lc-portal-entry {
  display: flex;
  align-items: center;
  gap: var(--lc-space-3);
  padding: var(--lc-space-3);
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-md);
}
.lc-portal-entry:active {
  opacity: 0.85;
}
.lc-portal-entry__tile {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 84rpx;
  height: 84rpx;
  color: var(--lc-action-primary);
  background: var(--lc-status-info-bg);
  border-radius: var(--lc-radius-md);
}
.lc-portal-entry__glyph {
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
}
.lc-portal-entry__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.lc-portal-entry__title {
  overflow: hidden;
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-portal-entry__desc {
  overflow: hidden;
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-portal-entry__arrow {
  flex-shrink: 0;
  font-size: var(--lc-font-h2);
  color: var(--lc-border-strong);
}
</style>
