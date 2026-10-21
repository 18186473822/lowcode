<!--
  Rate 物料 —— 评分（Phase 2 批 3，反馈/表单件）。
  接口对齐 lc-node：`<lc-rate v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: number（受控，0~max）；点第 n 颗星 → emit update n（已点同值再点 = 清零）
-->
<template>
  <view class="lc-rate">
    <view v-if="label" class="lc-rate__label-row">
      <text class="lc-rate__label">{{ label }}</text>
      <text v-if="required" class="lc-rate__required">*</text>
    </view>
    <view class="lc-rate__stars">
      <text
        v-for="n in maxStars"
        :key="n"
        class="lc-rate__star"
        :class="{ 'lc-rate__star--on': n <= current }"
        @click="onPick(n)"
      >★</text>
    </view>
    <view v-if="error" class="lc-rate__error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name?: string
    label?: string
    value?: unknown
    /** 星数，默认 5 */
    max?: number
    required?: boolean
    disabled?: boolean
    error?: string
  }>(),
  { max: 5 },
)

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const maxStars = computed(() => Math.max(1, Number(props.max) || 5))
const current = computed(() => {
  const n = Number(props.value ?? 0)
  return Number.isNaN(n) ? 0 : n
})

function onPick(n: number): void {
  if (props.disabled) return
  emit('update', { name: props.name, value: n === current.value ? 0 : n })
}
</script>

<style scoped>
.lc-rate {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-rate__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-rate__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-rate__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-rate__stars {
  display: flex;
}
.lc-rate__star {
  font-size: var(--lc-font-h1);
  color: var(--lc-text-tertiary);
  margin-right: var(--lc-space-2);
  line-height: var(--lc-leading-compact);
}
.lc-rate__star--on {
  color: var(--lc-status-warning);
}
.lc-rate__error {
  margin-top: 6rpx;
}
.lc-rate__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
