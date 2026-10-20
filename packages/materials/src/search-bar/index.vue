<!--
  SearchBar 物料 —— 搜索框（Phase 2 批 3，企业高频导航/筛选件）。
  接口对齐 lc-node：`<lc-search-bar v-bind="model.props" @update="onChange" @confirm="onConfirm" />`
   - value: string（受控）；输入 emit update（联动 formData），回车/点搜索 emit confirm（触发动作，如数据源刷新）
-->
<template>
  <view class="lc-search-bar">
    <view class="lc-search-bar__box">
      <text class="lc-search-bar__icon">🔍</text>
      <input
        class="lc-search-bar__input"
        type="text"
        :value="stringValue"
        :placeholder="placeholder || '搜索'"
        :disabled="disabled"
        confirm-type="search"
        @input="onInput"
        @confirm="emit('confirm')"
      />
      <text v-if="stringValue" class="lc-search-bar__clear" @click.stop="onClear">×</text>
    </view>
    <view v-if="showButton" class="lc-search-bar__btn" @click="emit('confirm')">
      <text class="lc-search-bar__btn-text">搜索</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name?: string
  value?: unknown
  placeholder?: string
  /** 右侧常驻搜索按钮 */
  showButton?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
  (e: 'confirm'): void
}>()

const stringValue = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value)))

function onInput(e: unknown): void {
  const d = (e as { detail?: { value?: string } }).detail
  const raw = d?.value ?? (e as { target?: { value?: string } }).target?.value ?? ''
  emit('update', { name: props.name, value: raw })
}

function onClear(): void {
  emit('update', { name: props.name, value: '' })
}
</script>

<style scoped>
.lc-search-bar {
  display: flex;
  align-items: center;
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-search-bar__box {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--lc-bg-canvas);
  border-radius: 28rpx;
  padding: 10rpx 20rpx;
}
.lc-search-bar__icon {
  font-size: var(--lc-font-body-sm);
  margin-right: 10rpx;
}
.lc-search-bar__input {
  flex: 1;
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-search-bar__clear {
  font-size: 34rpx;
  color: var(--lc-text-tertiary);
  padding: 0 6rpx;
}
.lc-search-bar__btn {
  margin-left: var(--lc-space-2);
  padding: 10rpx var(--lc-space-1);
}
.lc-search-bar__btn-text {
  font-size: var(--lc-font-body);
  color: var(--lc-action-primary);
}
</style>
