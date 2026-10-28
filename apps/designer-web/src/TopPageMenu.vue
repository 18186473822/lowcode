<!--
  TopPageMenu.vue —— 顶栏「页面」菜单（2026-10-28）

  背景：原先顶栏把「页面下拉 + pageId 输入 + 打开 + 新建 + 删除」五个控件平铺，
  1076px 窗口下 actions 被 flex 压缩，下拉与删除按钮互相重叠。这里合并成一个菜单：

    [页面 ▾]  → 输入 pageId 打开 / 新建空白页 / 页面列表 / 删除当前页

  交互沿用 TopMoreMenu：fixed + 视口坐标（顶栏不能再被滚动容器裁切）、
  点外部 / Esc / 滚动 / 改窗口尺寸都会关闭。
-->
<template>
  <div ref="rootRef" class="top-page">
    <button
      class="top-btn top-page__trigger"
      type="button"
      data-testid="page-select"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :title="store.pageId ? `当前页面：${store.pageId}` : '选择或新建页面'"
      @click="toggle"
    >
      <span class="top-page__title">{{ currentName }}</span>
      <span class="top-page__state">{{ store.currentVersion > 0 ? `v${store.currentVersion}` : '草稿' }}</span>
      <span class="top-page__caret" aria-hidden="true">▾</span>
    </button>

    <div
      v-if="open"
      class="top-page__panel"
      role="dialog"
      aria-label="页面管理"
      :style="panelStyle"
      @click.stop
    >
      <div class="top-page__head">
        <span class="top-page__heading">页面</span>
        <button
          class="top-page__link"
          type="button"
          :disabled="store.pagesLoading"
          @click="refresh"
        >{{ store.pagesLoading ? '加载中…' : '刷新列表' }}</button>
      </div>

      <div class="top-page__open">
        <input
          v-model="draftId"
          class="top-page__input"
          type="text"
          placeholder="输入 pageId 打开或新建"
          aria-label="页面 ID"
          spellcheck="false"
          @keydown.enter.prevent="openById(undefined, true)"
        />
        <button
          class="top-btn"
          type="button"
          :disabled="!draftId.trim()"
          title="打开或重新加载（同一页也会取最新版本）"
          @click="openById(undefined, true)"
        >打开</button>
      </div>

      <div class="top-page__ops">
        <button
          class="top-btn"
          type="button"
          data-testid="new-page"
          :disabled="!draftId.trim()"
          title="以输入框中的 pageId 新建空白页（保存后建档）"
          @click="createNew"
        >新建空白页</button>
        <button
          class="top-btn top-btn--danger"
          type="button"
          data-testid="delete-page"
          :disabled="!canDelete"
          :title="canDelete ? `删除 ${store.pageId}（含全部历史版本）` : '当前页尚未保存到服务端'"
          @click="removeCurrent"
        >{{ deleteArmed ? '确认删除？' : '删除当前页' }}</button>
      </div>

      <div class="top-page__divider" aria-hidden="true" />

      <p v-if="store.pagesError" class="top-page__hint top-page__hint--error">
        {{ store.pagesError }}
      </p>
      <p v-else-if="store.pagesLoading" class="top-page__hint">加载中…</p>
      <div v-else-if="!store.pages.length" class="top-page__empty">
        <strong>还没有已保存的页面</strong>
        <span>输入 pageId 后点「新建空白页」，保存即建档；也可以直接打开一个已有 ID。</span>
      </div>
      <div v-else class="top-page__list" role="listbox" aria-label="页面列表">
        <button
          v-for="p in store.pages"
          :key="p.id"
          class="top-page__item"
          :class="{ 'top-page__item--on': p.id === store.pageId }"
          type="button"
          role="option"
          :aria-selected="p.id === store.pageId"
          :title="`${p.name}（${p.id}）`"
          @click="openById(p.id)"
        >
          <span class="top-page__item-main">
            <span class="top-page__item-name">{{ p.name }}</span>
            <span class="top-page__item-id">{{ p.id }}</span>
          </span>
          <span class="top-page__item-meta">
            {{ p.currentVersion ? `v${p.currentVersion}` : '草稿' }}
          </span>
          <span v-if="p.id === store.pageId" class="top-page__check" aria-hidden="true">✓</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDesignerStore } from '@lc/designer'

const store = useDesignerStore()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const draftId = ref(store.pageId)
/** 删除两步确认的第一态（10 秒未确认自动复位） */
const deleteArmed = ref(false)
let deleteTimer: number | undefined

const currentName = computed(() => {
  const hit = store.pages.find((p) => p.id === store.pageId)
  return hit?.name ?? (store.pageId || '选择页面')
})
const canDelete = computed(
  () => !store.pagesLoading && store.pages.some((p) => p.id === store.pageId),
)

/** 按触发按钮的视口位置定位面板（右上对齐，左边不越界） */
function place(): void {
  const el = rootRef.value?.querySelector('.top-page__trigger')
  if (!(el instanceof HTMLElement) || typeof window === 'undefined') return
  const r = el.getBoundingClientRect()
  const bar = rootRef.value?.closest('.designer__top') as HTMLElement | null
  const top = Math.max(r.bottom + 4, (bar?.getBoundingClientRect().bottom ?? 0) + 4)
  const width = 348
  const right = Math.max(
    8,
    Math.min(window.innerWidth - r.right, window.innerWidth - width - 8),
  )
  panelStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    right: `${Math.round(right)}px`,
    maxHeight: `${Math.max(260, Math.round(window.innerHeight - top - 20))}px`,
  }
}

function clearDeleteArm(): void {
  deleteArmed.value = false
  if (deleteTimer !== undefined) {
    window.clearTimeout(deleteTimer)
    deleteTimer = undefined
  }
}

function toggle(): void {
  open.value = !open.value
  if (open.value) {
    draftId.value = store.pageId
    clearDeleteArm()
    place()
    void store.loadPages()
  }
}

function close(): void {
  open.value = false
  clearDeleteArm()
}

function refresh(): void {
  void store.loadPages(true)
}

/** 打开指定页面；成功后关闭面板，失败保留（底部状态栏同时给出原因）。force=true 时同一页也重载（409 后取最新版本）。 */
async function openById(id?: string, force = false): Promise<void> {
  const target = (id ?? draftId.value).trim()
  if (!target) return
  if (target === store.pageId && !force) {
    close()
    return
  }
  const ok = await store.openPage(target)
  if (ok) close()
}

/** 新建：只换本地草稿，建档由随后的「保存」完成（与 store.newPage 语义一致） */
function createNew(): void {
  const target = draftId.value.trim()
  if (!target) return
  if (store.newPage(target)) close()
}

/** 删除当前页：两步确认；删除后刷新列表（store 会自动切到剩余页 / 新草稿） */
async function removeCurrent(): Promise<void> {
  if (!canDelete.value) return
  if (!deleteArmed.value) {
    deleteArmed.value = true
    store.statusText = `再次点击「确认删除？」将删除 ${store.pageId}（含全部历史版本，不可恢复）`
    deleteTimer = window.setTimeout(() => {
      deleteArmed.value = false
      deleteTimer = undefined
    }, 10_000)
    return
  }
  const id = store.pageId
  clearDeleteArm()
  close()
  if (await store.deletePage(id)) void store.loadPages(true)
}

function onDocDown(e: MouseEvent): void {
  if (!open.value) return
  if (!rootRef.value?.contains(e.target as Node)) close()
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) close()
}
/** 窗口尺寸变化只重新定位，不关闭（用户拉窗口时菜单不应凭空消失） */
function onResize(): void {
  if (open.value) place()
}

watch(() => store.pageId, clearDeleteArm)

onMounted(() => {
  document.addEventListener('mousedown', onDocDown)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocDown)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  clearDeleteArm()
})
</script>

<style scoped>
.top-page {
  position: relative;
  flex: 0 0 auto;
}

.top-page__trigger {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  max-width: 230px;
}
.top-page__title {
  max-width: 116px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--lc-weight-medium);
}
.top-page__state {
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-topbar-text-muted);
}
.top-page__caret {
  font-size: 10px;
  line-height: var(--lc-leading-label);
  color: var(--lc-topbar-text-muted);
}

.top-page__panel {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
  width: 348px;
  max-width: calc(100vw - var(--lc-space-4));
  padding: var(--lc-space-3);
  overflow: hidden;
  color: var(--lc-topbar-text);
  background: var(--lc-topbar-bg);
  border: var(--lc-border-width) solid var(--lc-topbar-btn-border);
  border-radius: var(--lc-radius-md);
  box-shadow: var(--lc-shadow-e3);
  z-index: 60;
}

.top-page__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.top-page__heading {
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
}
.top-page__link {
  padding: var(--lc-space-0-5) var(--lc-space-1);
  font-family: inherit;
  font-size: var(--lc-font-micro);
  color: var(--lc-topbar-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}
.top-page__link:hover:not(:disabled) {
  color: var(--lc-topbar-text);
}
.top-page__link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.top-page__link:focus-visible,
.top-page__input:focus-visible,
.top-page__item:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}

.top-page__open {
  display: flex;
  gap: var(--lc-space-2);
}
.top-page__input {
  flex: 1;
  min-width: 0;
  padding: 5px var(--lc-space-2);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  color: var(--lc-topbar-text);
  background: var(--lc-topbar-input-bg);
  border: var(--lc-border-width) solid var(--lc-topbar-btn-border);
  border-radius: var(--lc-radius-sm);
}
.top-page__input::placeholder {
  color: var(--lc-topbar-text-muted);
}
.top-page__input:focus {
  outline: none;
  border-color: var(--lc-border-focus);
}
.top-page__input:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}

.top-page__ops {
  display: flex;
  gap: var(--lc-space-2);
}
.top-page__ops .top-btn {
  flex: 1;
}

.top-page__divider {
  height: var(--lc-border-width);
  background: var(--lc-topbar-sep);
}

.top-page__hint {
  padding: var(--lc-space-2) 0;
  font-size: var(--lc-font-caption);
  color: var(--lc-topbar-text-muted);
  text-align: center;
}
.top-page__hint--error {
  color: var(--lc-text-danger);
}
.top-page__empty {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
  padding: var(--lc-space-2) var(--lc-space-1);
  font-size: var(--lc-font-micro);
  color: var(--lc-topbar-text-muted);
  line-height: var(--lc-leading-readable);
}
.top-page__empty strong {
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-medium);
  color: var(--lc-topbar-text);
}

.top-page__list {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  min-height: 0;
  overflow-y: auto;
}
.top-page__item {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  width: 100%;
  padding: var(--lc-space-1-5) var(--lc-space-2);
  font-family: inherit;
  font-size: var(--lc-font-caption);
  text-align: left;
  color: var(--lc-topbar-btn-text);
  background: none;
  border: var(--lc-border-width) solid transparent;
  border-radius: var(--lc-radius-sm);
  cursor: pointer;
}
.top-page__item:hover {
  background: var(--lc-topbar-input-bg);
  border-color: var(--lc-topbar-btn-border);
}
.top-page__item--on {
  background: var(--lc-topbar-input-bg);
  border-color: var(--lc-action-primary);
}
.top-page__item-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.top-page__item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--lc-weight-medium);
}
.top-page__item-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-topbar-text-muted);
}
.top-page__item-meta {
  flex-shrink: 0;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-topbar-text-muted);
}
.top-page__check {
  flex-shrink: 0;
  color: var(--lc-brand-300);
  font-weight: var(--lc-weight-semibold);
}
</style>
