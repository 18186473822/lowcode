<!--
  Cell 物料 —— 单元格（Phase 2 批 3，方案缺口清单「Cell」项）。
  接口对齐 lc-node：`<lc-cell v-bind="model.props" @click="onTap" />`
   - 纯展示 + 点击事件（点击触发节点 actions，如 navigate；设计态由遮罩拦截）
-->
<template>
  <view class="lc-cell" :class="{ 'lc-cell--border': border !== false }" @click="emit('click')">
    <text v-if="icon" class="lc-cell__icon">{{ icon }}</text>
    <text class="lc-cell__label">{{ label }}</text>
    <text class="lc-cell__value">{{ value === null || value === undefined || value === '' ? '—' : String(value) }}</text>
    <text v-if="arrow" class="lc-cell__arrow">›</text>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    value?: unknown
    /** 前置图标字符（可选） */
    icon?: string
    /** 右侧箭头（通常配跳转动作） */
    arrow?: boolean
    /** 底部分割线 */
    border?: boolean
  }>(),
  { arrow: true, border: true },
)

const emit = defineEmits<{ click: [] }>()
</script>

<style scoped>
.lc-cell {
  display: flex;
  align-items: center;
  padding: var(--lc-space-3);
  background: var(--lc-bg-surface);
}
.lc-cell--border {
  border-bottom: 1rpx solid var(--lc-border-default);
}
.lc-cell__icon {
  font-size: var(--lc-font-body-lg);
  margin-right: 12rpx;
}
.lc-cell__label {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-cell__value {
  flex: 1;
  text-align: right;
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-tertiary);
  margin-left: var(--lc-space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-cell__arrow {
  font-size: var(--lc-font-h3);
  color: var(--lc-icon-muted);
  margin-left: var(--lc-space-1);
}
</style>
