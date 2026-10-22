<!--
  TopMoreMenu.vue —— 顶栏「更多」溢出菜单（design-system.md §3.2：<1180px 收起次级操作）

  两种形态共用**同一份内容**（默认插槽），避免「宽屏一份、窄屏再抄一份」：

    inline=true   → 原地平铺成一行（宽屏）
    inline=false  → 一个「更多」按钮 + 下拉菜单（窄屏）

  为什么菜单用 `position: fixed` + 视口坐标，而不是 `position: absolute`：
  顶栏为了防中文逐字换行加了 `overflow-x: auto`（见 style.css），而**滚动容器会裁掉
  绝对定位的浮层**。用 fixed + getBoundingClientRect 才能真正脱离裁剪。

  交互：点外部关闭 / Esc 关闭 / 滚动或改窗口尺寸关闭（fixed 定位不会跟着顶栏滚动，必须关掉）。
-->
<template>
  <div v-if="inline" class="top-more top-more--inline">
    <slot />
  </div>

  <div v-else ref="rootRef" class="top-more">
    <button
      class="top-btn top-more__trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-testid="top-more"
      @click="toggle"
    >{{ label }}</button>

    <div v-if="open" class="top-more__menu" role="menu" :style="menuStyle" @click="close">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

withDefaults(defineProps<{ inline: boolean; label?: string }>(), { label: '更多' })

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

/** 按触发按钮的视口位置定位菜单（右上对齐） */
function place(): void {
  const el = rootRef.value?.querySelector('.top-more__trigger')
  if (!(el instanceof HTMLElement) || typeof window === 'undefined') return
  const r = el.getBoundingClientRect()
  menuStyle.value = {
    position: 'fixed',
    top: `${Math.round(r.bottom + 4)}px`,
    right: `${Math.round(window.innerWidth - r.right)}px`,
  }
}

function toggle(): void {
  open.value = !open.value
  if (open.value) place()
}
function close(): void {
  open.value = false
}

function onDocDown(e: MouseEvent): void {
  if (!open.value) return
  if (!rootRef.value?.contains(e.target as Node)) close()
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocDown)
  document.addEventListener('keydown', onKey)
  // fixed 定位不随顶栏滚动 → 滚了就关（capture 才能收到顶栏内部滚动）
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocDown)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
})
</script>

<style scoped>
.top-more {
  position: relative;
  display: flex;
  align-items: center;
}
.top-more--inline {
  gap: var(--lc-space-2);
}
.top-more__menu {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  min-width: 148px;
  padding: var(--lc-space-1);
  border: var(--lc-border-width) solid var(--lc-topbar-btn-border);
  border-radius: var(--lc-radius-md);
  background: var(--lc-topbar-bg);
  box-shadow: var(--lc-shadow-e3);
  z-index: 60;
}

/* 菜单里沿用顶栏按钮配色，但改成整行左对齐（不影响 top-btn--primary 的选中底色） */
.top-more__menu :slotted(.top-btn) {
  width: 100%;
  justify-content: flex-start;
  border-color: transparent;
  text-align: left;
}
.top-more__menu :slotted(.top-btn:not(.top-btn--primary)) {
  background: none;
}
.top-more__menu :slotted(.top-sep) {
  width: 100%;
  height: var(--lc-border-width);
  margin: var(--lc-space-1) 0;
}
</style>
