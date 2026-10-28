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
      :aria-label="label"
      :data-testid="testid"
      @click="toggle"
    >{{ label }}<span class="top-more__caret" aria-hidden="true">▾</span></button>

    <div v-if="open" class="top-more__menu" role="menu" :style="menuStyle" @click="close">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

withDefaults(defineProps<{ inline: boolean; label?: string; testid?: string }>(), {
  label: '更多',
  testid: 'top-more',
})

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

/** 按触发按钮的视口位置定位菜单（右上对齐） */
function place(): void {
  const el = rootRef.value?.querySelector('.top-more__trigger')
  if (!(el instanceof HTMLElement) || typeof window === 'undefined') return
  const r = el.getBoundingClientRect()
  const bar = rootRef.value?.closest('.designer__top') as HTMLElement | null
  const top = Math.max(r.bottom + 4, (bar?.getBoundingClientRect().bottom ?? 0) + 4)
  menuStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
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
/** 窗口尺寸变化只重新定位，不关闭（用户拉窗口时菜单不应凭空消失） */
function onResize(): void {
  if (open.value) place()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocDown)
  document.addEventListener('keydown', onKey)
  // 顶栏已改为不滚动（控件按优先级折叠）；页面主体滚动不影响 fixed 菜单，无需监听 scroll。
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocDown)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.top-more {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}
.top-more--inline {
  gap: var(--lc-space-2);
}
.top-more__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--lc-space-1);
}
.top-more__caret {
  font-size: 10px;
  line-height: var(--lc-leading-label);
  color: var(--lc-topbar-text-muted);
}
.top-more__menu {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  min-width: 196px;
  max-width: 288px;
  max-height: min(70vh, 560px);
  overflow-y: auto;
  overscroll-behavior: contain;
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
  flex: 0 0 auto;
  justify-content: flex-start;
  padding: var(--lc-space-1-5) var(--lc-space-2);
  border-color: transparent;
  text-align: left;
}
.top-more__menu :slotted(.top-btn:not(.top-btn--primary)) {
  background: none;
}
.top-more__menu :slotted(.top-btn:not(.top-btn--primary):hover:not(:disabled)) {
  background: var(--lc-topbar-input-bg);
  border-color: var(--lc-topbar-btn-border);
}
.top-more__menu :slotted(.top-sep) {
  width: 100%;
  height: var(--lc-border-width);
  margin: var(--lc-space-1) 0;
}

/* 分组：标题 + 一组菜单项（2026-10-28 菜单项增多后按语义分区，避免一长串按钮） */
.top-more__menu :slotted(.top-menu__group) {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.top-more__menu :slotted(.top-menu__label) {
  padding: var(--lc-space-1) var(--lc-space-2) var(--lc-space-0-5);
  font-size: var(--lc-font-micro);
  font-weight: var(--lc-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--lc-topbar-text-muted);
  cursor: default;
}
.top-more__menu :slotted(.top-menu__divider) {
  height: var(--lc-border-width);
  margin: var(--lc-space-1) 0;
  background: var(--lc-topbar-sep);
}
.top-more__menu :slotted(.top-menu__check) {
  margin-left: auto;
  padding-left: var(--lc-space-2);
  color: var(--lc-brand-300);
  font-size: var(--lc-font-micro);
}
</style>
