<!--
  PanelState.vue —— 面板状态视图（空 / 加载 / 错误）唯一实现

  规范：docs/design-system.md §5「异常状态族」——
    空状态：图标 + 标题 + 说明 + **一个出口**，禁止只写「暂无数据」；
    加载中：优先骨架屏（1.2s 线性循环），不用整屏遮罩转圈；
    错误：  就地错误块 + 「重试」出口，文案含可核对信息，不静默。

  样式在 ../styles/panel.css（共享层，非 scoped），令牌见 ../styles/tokens.css。
-->
<template>
  <div
    class="lc-state"
    :class="[`lc-state--${kind}`, { 'lc-state--inline': inline }]"
    :role="kind === 'error' ? 'alert' : 'status'"
    :aria-busy="kind === 'loading' || kind === 'skeleton' ? 'true' : undefined"
    :data-testid="testid"
  >
    <!-- 骨架屏：延迟出现由调用方控制，这里只负责形态 -->
    <div v-if="kind === 'skeleton'" class="lc-skeleton" aria-hidden="true">
      <div
        v-for="i in rows"
        :key="i"
        class="lc-skeleton__bar"
        :class="{ 'lc-skeleton__bar--title lc-skeleton__bar--short': i === 1, 'lc-skeleton__bar--mid': i === 2 }"
      />
    </div>

    <template v-else>
      <div class="lc-state__icon" aria-hidden="true">
        <div v-if="kind === 'loading'" class="lc-state__spinner" />
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
        <svg
          v-else
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
      </div>

      <p v-if="title" class="lc-state__title">{{ title }}</p>
      <p v-if="text" class="lc-state__text">{{ text }}</p>
      <button
        v-if="actionText"
        class="lc-state__action"
        type="button"
        :data-testid="testid ? `${testid}-action` : undefined"
        @click="emit('action')"
      >
        {{ actionText }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** empty 空状态 / loading 内联转圈 / skeleton 骨架屏 / error 错误块 */
    kind: 'empty' | 'error' | 'loading' | 'skeleton'
    title?: string
    text?: string
    /** 有值即渲染出口按钮（空态与错误态都必须给出口） */
    actionText?: string
    testid?: string
    /** 紧凑内边距，用于窄面板内嵌 */
    inline?: boolean
    /** 骨架条数量 */
    rows?: number
  }>(),
  { rows: 3, inline: false },
)

const emit = defineEmits<{ action: [] }>()
</script>
