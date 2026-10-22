<!--
  lc-state-view.vue —— 移动端状态视图（design-system.md §5 异常状态族）

  设计器侧对应 `packages/designer/src/components/PanelState.vue`；两端共用同一套令牌与
  同一套「图标 + 标题 + 说明 + 出口」结构，差异只在容器形态（Web 就地占位 / 移动端整页）。

  五态：
    empty      空状态 —— 必须有出口，禁止只写「暂无数据」
    loading    加载中 —— 骨架屏优先（1.2s 线性循环），不用整屏转圈
    error      错误   —— 就地显示 + 重试；文案含可核对信息（接口 / 状态码）
    no-auth    401    —— 阻断式，引导重新登录
    forbidden  403    —— 页面级占位 + 返回入口（越权操作由上层隐藏，不置灰）

  图标用内联 SVG（`currentColor` 上色，颜色随令牌走）。
  ⚠️ 已知限制：内联 SVG 仅 H5 支持；mp-weixin 端图标不渲染，但标题/说明/出口仍完整
     （不会退化成「无声失败」）。若要全端覆盖，需改为 base64 data-URI + <image>。
-->
<template>
  <view
    class="lc-state"
    :class="[`lc-state--${kind}`, { 'lc-state--inline': inline }]"
    :data-testid="testid"
  >
    <!-- 骨架屏 -->
    <view v-if="kind === 'loading'" class="lc-state__skeleton" aria-hidden="true">
      <view class="lc-state__bar lc-state__bar--title" />
      <view class="lc-state__bar lc-state__bar--mid" />
      <view class="lc-state__bar lc-state__bar--short" />
    </view>

    <template v-else>
      <view class="lc-state__icon" aria-hidden="true">
        <!-- 空 -->
        <svg
          v-if="kind === 'empty'"
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="4" y="7" width="24" height="18" rx="3" stroke="currentColor" stroke-width="1.8" />
          <path d="M4 13h24" stroke="currentColor" stroke-width="1.8" />
          <path d="M11 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <!-- 错误 -->
        <svg
          v-else-if="kind === 'error'"
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="1.8" />
          <path d="M16 9.6v7.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <circle cx="16" cy="21.6" r="1.4" fill="currentColor" />
        </svg>
        <!-- 401 未登录 -->
        <svg
          v-else-if="kind === 'no-auth'"
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="6" y="14" width="20" height="12" rx="3" stroke="currentColor" stroke-width="1.8" />
          <path d="M10.5 14v-3a5.5 5.5 0 0 1 11 0v3" stroke="currentColor" stroke-width="1.8" />
          <circle cx="16" cy="20" r="1.6" fill="currentColor" />
        </svg>
        <!-- 403 无权限 -->
        <svg
          v-else-if="kind === 'forbidden'"
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="1.8" />
          <path d="M8 8l16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <!-- 404 -->
        <svg
          v-else
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="1.8" />
          <path d="M12 12l8 8M20 12l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </view>

      <text v-if="title" class="lc-state__title">{{ title }}</text>
      <text v-if="text" class="lc-state__text">{{ text }}</text>

      <button
        v-if="actionText"
        class="lc-state__action"
        type="button"
        :data-testid="testid ? `${testid}-action` : undefined"
        @tap="emit('action')"
      >{{ actionText }}</button>
    </template>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    kind: 'empty' | 'error' | 'loading' | 'no-auth' | 'forbidden' | 'not-found'
    title?: string
    text?: string
    actionText?: string
    /** 紧凑内边距，用于嵌在已有内容里 */
    inline?: boolean
    testid?: string
  }>(),
  { inline: false },
)

const emit = defineEmits<{ action: [] }>()
</script>

<style scoped>
.lc-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-16) var(--lc-space-4);
}
.lc-state--inline {
  padding: var(--lc-space-8) var(--lc-space-2);
}
.lc-state__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--lc-icon-muted);
}
.lc-state--error .lc-state__icon,
.lc-state--not-found .lc-state__icon {
  color: var(--lc-status-danger);
}
.lc-state--no-auth .lc-state__icon,
.lc-state--forbidden .lc-state__icon {
  color: var(--lc-status-warning);
}
.lc-state__title {
  margin: 0;
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-state--error .lc-state__title,
.lc-state--not-found .lc-state__title {
  color: var(--lc-status-danger);
}
.lc-state--no-auth .lc-state__title,
.lc-state--forbidden .lc-state__title {
  color: var(--lc-status-warning);
}
.lc-state__text {
  margin: 0;
  font-size: var(--lc-font-body-sm);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-secondary);
  text-align: center;
}
.lc-state__action {
  margin-top: var(--lc-space-2);
  padding: var(--lc-space-2) var(--lc-space-6);
  border: 1px solid var(--lc-action-primary);
  border-radius: var(--lc-radius-pill);
  background: var(--lc-bg-surface);
  color: var(--lc-action-primary);
  font-size: var(--lc-font-body-sm);
}
.lc-state__action::after {
  border: none;
}

/* 骨架屏：1.2s 线性循环（§2.4） */
.lc-state__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
  width: 100%;
  padding: var(--lc-space-2) 0;
}
.lc-state__bar {
  height: 12px;
  border-radius: var(--lc-radius-xs);
  background: var(--lc-bg-subtle);
  animation: lc-state-pulse 1.2s linear infinite;
}
.lc-state__bar--title {
  height: 16px;
  background: var(--lc-border-default);
}
.lc-state__bar--mid {
  width: 82%;
}
.lc-state__bar--short {
  width: 62%;
}
@keyframes lc-state-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lc-state__bar {
    animation: none;
  }
}
</style>
