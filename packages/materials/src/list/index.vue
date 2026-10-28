<!--
  List 物料 —— 列表（Phase 2 批 3，方案缺口清单「List 列表」项）。
  接口对齐 lc-node：`<lc-list v-bind="model.props" @item-click="onItem" />`
   - items: `{title, desc?}[]`（属性面板 textarea JSON 编辑；与标准页 lc-list-page 的模型驱动列表分工——
     本物料是**静态数据列表**，用于导航菜单/快捷入口等场景）
   - 点击行 emit itemClick(index)，由节点 actions 响应（如 navigate）
-->
<template>
  <view class="lc-list">
    <view v-for="(item, i) in itemList" :key="i" class="lc-list__row" @click="emit('itemClick', i)">
      <view class="lc-list__main">
        <text class="lc-list__title">{{ item.title }}</text>
        <text v-if="item.desc" class="lc-list__desc">{{ item.desc }}</text>
      </view>
      <text class="lc-list__arrow">›</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { asArray } from '../props-utils'

interface ListItem {
  title: string
  desc?: string
}

const props = defineProps<{
  /** 数组，或 JSON 文本（历史 schema / 手写配置都能渲染） */
  items?: unknown
}>()

const emit = defineEmits<{ itemClick: [index: number] }>()

const itemList = computed<ListItem[]>(() => asArray<ListItem>(props.items))
</script>

<style scoped>
.lc-list {
  background: var(--lc-bg-surface);
}
.lc-list__row {
  display: flex;
  align-items: center;
  padding: var(--lc-space-3);
  border-bottom: 1rpx solid var(--lc-border-default);
}
.lc-list__main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.lc-list__title {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-list__desc {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
  margin-top: 6rpx;
}
.lc-list__arrow {
  font-size: var(--lc-font-h3);
  color: var(--lc-icon-muted);
  margin-left: 12rpx;
}
</style>
