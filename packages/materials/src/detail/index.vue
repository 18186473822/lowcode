<!--
  Detail 物料 —— 描述组（Phase 2 批 3，方案缺口清单「Detail 描述组」项；FieldType `json` 的只读展示形态）。
  接口对齐 lc-node：`<lc-detail v-bind="model.props" />`（纯展示，无字段契约）
   - items: `{label, value}[]`（属性面板 textarea JSON 编辑；值经 display 语义转串展示）
-->
<template>
  <view class="lc-detail">
    <view v-for="(item, i) in itemList" :key="i" class="lc-detail__row">
      <text class="lc-detail__label">{{ item.label }}</text>
      <text class="lc-detail__value">{{ display(item.value) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { asArray } from '../props-utils'

interface DetailItem {
  label: string
  value: unknown
}

const props = defineProps<{
  /** 数组，或 JSON 文本（历史 schema / 手写配置都能渲染） */
  items?: unknown
}>()

const itemList = computed<DetailItem[]>(() => asArray<DetailItem>(props.items))

/** 只读值格式化（对齐 uni/display 的语义：空占位、布尔中文、对象 JSON） */
function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
</script>

<style scoped>
.lc-detail {
  padding: var(--lc-space-1) var(--lc-space-3);
}
.lc-detail__row {
  display: flex;
  align-items: flex-start;
  padding: var(--lc-space-2) 0;
  border-bottom: 1rpx solid var(--lc-border-default);
}
.lc-detail__label {
  width: 200rpx;
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-tertiary);
  flex-shrink: 0;
}
.lc-detail__value {
  flex: 1;
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
  word-break: break-all;
}
</style>
