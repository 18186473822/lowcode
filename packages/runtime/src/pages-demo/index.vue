<template>
  <view class="page">
    <view class="page__banner">
      <text class="page__banner-text">Phase 1 · 物料 12 个演示（手写 JSON → 全物料渲染）</text>
    </view>
    <!-- lc-renderer 由 easycom 精确规则解析到 @lc/renderer/uni/lc-renderer.vue -->
    <lc-renderer :schema="demoPage" :options="options" />
  </view>
</template>

<script setup lang="ts">
import type { PageControllerOptions } from '@lc/renderer'
import { demoPage } from '@/demo/static-page'
import { createUniHost } from '@/host'

const options: PageControllerOptions = {
  host: createUniHost(),
  user: { name: '张三', dept: '研发部' },
  onExprError: (info) => console.error('[lc-runtime] expr error:', info),
  onActionResult: (r) => console.log('[lc-runtime] action result:', r),
  onUnsupported: (type) => console.warn('[lc-runtime] unsupported action:', type),
}
</script>

<style scoped>
.page {
  min-height: 100vh;
}
.page__banner {
  background: var(--lc-gradient-brand);
  padding: var(--lc-space-4) var(--lc-space-3);
}
.page__banner-text {
  color: var(--lc-text-on-brand);
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
}
</style>
