<!--
  Tabs 物料 —— 标签页（Phase 2 批 3，方案缺口清单「Tabs」项）。
  接口对齐 lc-node：`<lc-tabs v-bind="model.props" @switch="onSwitch" />`
   - items: `{label}[]`（属性面板 textarea JSON 编辑）；activeIndex 受控（父级回写）+ 内部即时高亮
   - 首版为**标签头 + 激活态展示**（面板 children 嵌套容器留后续，见台账未做项）；切换 emit switch(index)
-->
<template>
  <view class="lc-tabs">
    <view class="lc-tabs__bar">
      <view
        v-for="(item, i) in itemList"
        :key="i"
        class="lc-tabs__tab"
        :class="{ 'lc-tabs__tab--active': i === current }"
        @click="onPick(i)"
      >
        <text class="lc-tabs__label">{{ item.label }}</text>
        <view v-if="i === current" class="lc-tabs__underline" />
      </view>
    </view>
    <view v-if="currentLabel" class="lc-tabs__pane">
      <text class="lc-tabs__pane-text">{{ currentLabel }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface TabItem {
  label: string
}

const props = defineProps<{
  items?: TabItem[]
  /** 激活下标（受控；不传内部自管） */
  activeIndex?: number
}>()

const emit = defineEmits<{ switch: [index: number] }>()

const itemList = computed<TabItem[]>(() => (Array.isArray(props.items) ? props.items : []))
const internal = ref(props.activeIndex ?? 0)
watch(
  () => props.activeIndex,
  (v) => {
    if (typeof v === 'number' && v !== internal.value) internal.value = v
  },
)

const current = computed(() => Math.min(internal.value, Math.max(0, itemList.value.length - 1)))
const currentLabel = computed(() => itemList.value[current.value]?.label ?? '')

function onPick(i: number): void {
  if (i === current.value) return
  internal.value = i
  emit('switch', i)
}
</script>

<style scoped>
.lc-tabs {
  background: var(--lc-bg-surface);
}
.lc-tabs__bar {
  display: flex;
  border-bottom: 1rpx solid var(--lc-border-default);
}
.lc-tabs__tab {
  position: relative;
  padding: 20rpx 28rpx;
}
.lc-tabs__label {
  font-size: var(--lc-font-body);
  color: var(--lc-text-secondary);
}
.lc-tabs__tab--active .lc-tabs__label {
  color: var(--lc-action-primary);
  font-weight: 600;
}
.lc-tabs__underline {
  position: absolute;
  left: 28rpx;
  right: 28rpx;
  bottom: 0;
  height: 4rpx;
  background: var(--lc-action-primary);
  border-radius: 2rpx;
}
.lc-tabs__pane {
  padding: var(--lc-space-3);
}
.lc-tabs__pane-text {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-tertiary);
}
</style>
