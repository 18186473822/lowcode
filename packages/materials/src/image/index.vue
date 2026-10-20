<!--
  Image 物料 —— 图片展示。归位于 `packages/materials`（Phase 1 第 1 批）。
  接口对齐 lc-node：`<lc-image v-bind="model.props" />`（纯展示，无事件）
   - src 支持 `$expr:` 求值注入（resolve 已处理）；mode 对齐 uni image 的 mode 枚举
-->
<template>
  <view class="lc-image" :style="wrapStyle">
    <image
      class="lc-image__img"
      :src="src || ''"
      :mode="mode || 'aspectFill'"
      :lazy-load="lazyLoad"
      @error="onError"
    />
    <view v-if="loadError" class="lc-image__fallback">
      <text>图片加载失败</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  src?: string
  mode?: string
  width?: number | string
  height?: number | string
  radius?: number | string
  lazyLoad?: boolean
}>()

const loadError = ref(false)

watch(
  () => props.src,
  () => {
    loadError.value = false
  },
)

const wrapStyle = computed(() => {
  const s: string[] = []
  if (props.width != null) s.push(`width: ${typeof props.width === 'number' ? `${props.width}rpx` : props.width}`)
  if (props.height != null) s.push(`height: ${typeof props.height === 'number' ? `${props.height}rpx` : props.height}`)
  if (props.radius != null) {
    s.push(`border-radius: ${typeof props.radius === 'number' ? `${props.radius}rpx` : props.radius}`)
  }
  return s.join(';')
})

function onError(): void {
  loadError.value = true
}
</script>

<style scoped>
.lc-image {
  padding: var(--lc-space-2) var(--lc-space-3);
  box-sizing: border-box;
}
.lc-image__img {
  width: 100%;
  height: 100%;
  min-height: 200rpx;
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-canvas);
}
.lc-image__fallback {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  top: 16rpx;
  bottom: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lc-bg-canvas);
  border-radius: var(--lc-radius-sm);
}
.lc-image__fallback text {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
</style>
