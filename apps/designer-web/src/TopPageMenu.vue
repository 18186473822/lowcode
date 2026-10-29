<!--
  TopPageMenu.vue —— 顶栏「页面」菜单（2026-10-28）

  背景：原先顶栏把「页面下拉 + pageId 输入 + 打开 + 新建 + 删除」五个控件平铺，
  1076px 窗口下 actions 被 flex 压缩，下拉与删除按钮互相重叠。这里合并成一个菜单：

    [页面 ▾]  → 打开 / 新建（先选模型）/ 页面列表 / 删除当前页
                + 工作区入口（画布 / 模型 / 权限 / 主题 / Webhook / 物料市场）

  2026-10-28 调整：原「工作台」菜单取消，六个管理视图并入本菜单 —— 它们都服务于
  「在模型基础上设计页面」，放在页面菜单里比再开一个一级菜单更符合操作顺序。

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
      :title="triggerTitle"
      @click="toggle"
    >
      <span v-if="store.view === 'page'" class="top-page__title">{{ currentName }}</span>
      <span v-else class="top-page__title">{{ viewLabel }}</span>
      <span v-if="store.view === 'page'" class="top-page__type">{{ currentTypeLabel }}</span>
      <span v-else class="top-page__type">工作区</span>
      <span v-if="store.view === 'page'" class="top-page__state">{{ store.currentVersion > 0 ? `v${store.currentVersion}` : '草稿' }}</span>
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

      <!-- 页面级操作：本菜单只在设计器内出现（门户首页不渲染），所以这里始终有「当前页」语义 -->
      <div class="top-page__open">
        <input
          v-model="draftId"
          class="top-page__input"
          type="text"
          placeholder="输入 pageId 打开"
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
          class="top-btn top-btn--primary"
          type="button"
          data-testid="new-page"
          title="先选数据模型，一次生成列表 / 表单 / 详情并自动串联"
          @click="openNewPage"
        >新建页面</button>
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

      <!-- 门户设计是**一级首页**，不是并列的工作区：单列为「返回」入口放在工作区之上 -->
      <button
        class="top-page__nav top-page__nav--home"
        type="button"
        data-testid="back-to-portal"
        @click="switchView('portal')"
      >
        <span class="top-page__nav-label">← 返回门户设计</span>
      </button>

      <div class="top-page__divider" aria-hidden="true" />

      <!-- 工作区入口：服务于「在模型基础上设计页面」的工具，当前视图带 ✓ -->
      <div class="top-page__group" role="group" aria-label="工作区">
        <span class="top-page__group-label">工作区</span>
        <button
          v-for="v in WORKSPACE_VIEWS"
          :key="v.value"
          class="top-page__nav"
          :class="{ 'top-page__nav--on': store.view === v.value }"
          type="button"
          :data-testid="v.testid"
          :aria-current="store.view === v.value ? 'page' : undefined"
          @click="switchView(v.value)"
        >
          <span class="top-page__nav-label">{{ v.label }}</span>
          <span v-if="store.view === v.value" class="top-page__check" aria-hidden="true">✓</span>
        </button>
      </div>

      <div class="top-page__divider" aria-hidden="true" />

      <div class="top-page__group-head">
        <span class="top-page__group-label">已保存的页面</span>
        <span class="top-page__count">{{ store.pages.length }}</span>
      </div>
      <p v-if="store.pagesError" class="top-page__hint top-page__hint--error">
        {{ store.pagesError }}
      </p>
      <p v-else-if="store.pagesLoading" class="top-page__hint">加载中…</p>
      <div v-else-if="!store.pages.length" class="top-page__empty">
        <strong>还没有已保存的页面</strong>
        <span>点「新建页面」选模型，一次生成列表 / 表单 / 详情并自动串联。</span>
      </div>
      <!-- 按模型分组：一个模型 = 一组标准页（云程「模块」口径），未绑定的单独一组 -->
      <div v-else class="top-page__list" role="listbox" aria-label="页面列表">
        <div v-for="g in pageGroups" :key="g.key" class="top-page__model-group">
          <div class="top-page__model-head">
            <span class="top-page__model-name">{{ g.label }}</span>
            <span class="top-page__count">{{ g.items.length }}</span>
          </div>
          <button
            v-for="p in g.items"
            :key="p.id"
            class="top-page__item"
            :class="{ 'top-page__item--on': p.id === store.pageId }"
            type="button"
            role="option"
            :aria-selected="p.id === store.pageId"
            :title="`${p.name}（${p.id}）${p.modelId ? ` · 模型 ${p.modelId}` : ' · 未绑定模型'}`"
            @click="openById(p.id)"
          >
            <span class="top-page__item-main">
              <span class="top-page__item-name">{{ p.name }}</span>
              <span class="top-page__item-id">{{ p.id }}</span>
            </span>
            <span class="top-page__item-type">{{ typeLabel(p.type) }}</span>
            <span class="top-page__item-meta">
              {{ p.currentVersion ? `v${p.currentVersion}` : '草稿' }}
            </span>
            <span v-if="p.id === store.pageId" class="top-page__check" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 新建页面：模型优先，一次生成成组页面（列表 / 表单 / 详情） -->
    <new-page-dialog v-if="newOpen" @close="newOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDesignerStore, type PageListItem } from '@lc/designer'
import NewPageDialog from './NewPageDialog.vue'

const store = useDesignerStore()

const open = ref(false)
/** 模型优先的新建页面弹层 */
const newOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const draftId = ref(store.pageId)
/** 删除两步确认的第一态（10 秒未确认自动复位） */
const deleteArmed = ref(false)
let deleteTimer: number | undefined

/** 工作区入口（原「工作台」菜单）：**门户设计是首页**（先选门户 → 再进页面设计） */
const VIEWS = [
  { value: 'portal', label: '门户设计', testid: 'toggle-portal' },
  { value: 'page', label: '页面画布', testid: 'toggle-page' },
  { value: 'model', label: '数据模型', testid: 'toggle-models' },
  { value: 'rbac', label: '权限管理', testid: 'toggle-rbac' },
  { value: 'theme', label: '主题配置', testid: 'toggle-theme-panel' },
  { value: 'webhook', label: 'Webhook 集成', testid: 'toggle-webhook' },
  { value: 'market', label: '物料市场', testid: 'toggle-market' },
] as const

/** 工作区 = 除一级首页（门户设计）以外的入口；门户设计单独做成「返回」按钮 */
const WORKSPACE_VIEWS = VIEWS.filter((v) => v.value !== 'portal')

const TYPE_LABEL: Record<string, string> = {
  form: '表单',
  list: '列表',
  detail: '详情',
  portal: '门户',
  custom: '自定义',
}

const currentName = computed(() => {
  const hit = store.pages.find((p) => p.id === store.pageId)
  return hit?.name ?? (store.pageId || '选择页面')
})
/** 非画布视图时顶栏触发器显示工作区名（否则会一直挂着某个看不见的页面名） */
const viewLabel = computed(() => VIEWS.find((v) => v.value === store.view)?.label ?? '工作区')
const currentTypeLabel = computed(() => TYPE_LABEL[store.schema.type] ?? '页面')
/** 当前页绑定的模型：表单取提交模型，列表 / 详情取各自配置 */
const currentModelId = computed(() => {
  const s = store.schema
  if (s.type === 'list') return s.list?.modelId || ''
  if (s.type === 'detail') return s.detail?.modelId || ''
  return store.submitModelId ?? ''
})
const triggerTitle = computed(() => {
  if (store.view !== 'page') return `当前工作区：${viewLabel.value}（点此切换页面 / 工作区）`
  if (!store.pageId) return '选择或新建页面'
  return `当前页面：${store.pageId} · ${currentTypeLabel.value}${currentModelId.value ? ` · 模型 ${currentModelId.value}` : ' · 未绑定模型'}`
})
const canDelete = computed(
  () => !store.pagesLoading && store.pages.some((p) => p.id === store.pageId),
)

/** 模型 id → 展示名（模型列表随菜单打开拉一次；拉不到就退回 id） */
const modelNames = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const m of store.models) map[m.id] = m.name
  return map
})

interface PageGroup {
  key: string
  label: string
  items: PageListItem[]
}

/**
 * 页面按模型分组（云程「模块」口径）：同一模型生成的列表 / 表单 / 详情归到一组。
 * 未绑定模型的页面单独一组，固定排在最后。
 */
const pageGroups = computed<PageGroup[]>(() => {
  const groups = new Map<string, PageListItem[]>()
  for (const p of store.pages) {
    const key = p.modelId || ''
    const hit = groups.get(key)
    if (hit) hit.push(p)
    else groups.set(key, [p])
  }
  const rows: PageGroup[] = [...groups.entries()].map(([key, items]) => ({
    key,
    label: key ? `模型 ${modelNames.value[key] ?? key}` : '未绑定模型',
    items,
  }))
  rows.sort((a, b) => {
    if (!a.key) return 1
    if (!b.key) return -1
    return a.label.localeCompare(b.label, 'zh-Hans-CN')
  })
  return rows
})

function typeLabel(type?: string): string {
  if (!type) return ''
  return TYPE_LABEL[type] ?? type
}

/** 按触发按钮的视口位置定位面板（右上对齐，左边不越界） */
function place(): void {
  const el = rootRef.value?.querySelector('.top-page__trigger')
  if (!(el instanceof HTMLElement) || typeof window === 'undefined') return
  const r = el.getBoundingClientRect()
  const bar = rootRef.value?.closest('.designer__top') as HTMLElement | null
  const top = Math.max(r.bottom + 4, (bar?.getBoundingClientRect().bottom ?? 0) + 4)
  const width = 380
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
    // 分组标题要显示模型名：模型列表可能还没加载过
    void store.loadModels()
  }
}

function close(): void {
  open.value = false
  clearDeleteArm()
}

function refresh(): void {
  void store.loadPages(true)
}

/** 打开指定页面；成功后**切到画布**并关闭面板（在任何工作区里点页面列表都要能看到结果）。 */
async function openById(id?: string, force = false): Promise<void> {
  const target = (id ?? draftId.value).trim()
  if (!target) return
  if (target === store.pageId && !force && store.view === 'page') {
    close()
    return
  }
  const ok = await store.openPage(target)
  if (ok) {
    await store.switchView('page')
    close()
  }
}

/** 新建页面：关闭菜单并打开「先选模型」弹层（不允许无模型建页） */
function openNewPage(): void {
  close()
  newOpen.value = true
}

/** 切换工作区视图（原「工作台」菜单的六个入口）。
 *  切到画布时若还没载入过页面（首屏不再自动打开），按需拉一次当前 pageId —— 否则会看到空画布。 */
async function switchView(v: (typeof VIEWS)[number]['value']): Promise<void> {
  close()
  if (v === 'page' && !store.pageLoaded) await store.openPage()
  await store.switchView(v)
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
  max-width: 300px;
}
.top-page__title {
  max-width: 116px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--lc-weight-medium);
}
.top-page__type {
  flex-shrink: 0;
  font-size: var(--lc-font-micro);
  color: var(--lc-topbar-text-muted);
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
  width: 380px;
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

/* 工作区入口：整行左对齐，当前视图高亮 + ✓ */
.top-page__group {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
}
.top-page__group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-2);
}
.top-page__group-label {
  padding: 0 var(--lc-space-2);
  font-size: var(--lc-font-micro);
  font-weight: var(--lc-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--lc-topbar-text-muted);
}
.top-page__count {
  padding-right: var(--lc-space-2);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-topbar-text-muted);
}
.top-page__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.top-page__nav:hover {
  background: var(--lc-topbar-input-bg);
  border-color: var(--lc-topbar-btn-border);
}
.top-page__nav--on {
  background: var(--lc-topbar-input-bg);
  border-color: var(--lc-action-primary);
}
.top-page__nav:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
.top-page__nav-label {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
}
/* 「返回门户设计」是一级导航（门户 → 页面是上下级，不是并列工作区），比工作区项重一档 */
.top-page__nav--home {
  margin-bottom: var(--lc-space-1);
  font-weight: var(--lc-weight-semibold);
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
/* 列表里的页面类型徽标（分组后模型名已在组头，条目只需区分表单/列表/详情） */
.top-page__item-type {
  flex-shrink: 0;
  padding: 0 var(--lc-space-1);
  font-size: var(--lc-font-micro);
  color: var(--lc-topbar-text-muted);
  border: var(--lc-border-width) solid var(--lc-topbar-btn-border);
  border-radius: var(--lc-radius-xs);
}

/* 按模型分组：组头弱化，组与组之间留一点呼吸 */
.top-page__model-group {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
}
.top-page__model-group + .top-page__model-group {
  margin-top: var(--lc-space-1);
}
.top-page__model-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-2);
  padding: var(--lc-space-0-5) var(--lc-space-2) 0;
}
.top-page__model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--lc-font-micro);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-brand-300);
}
.top-page__check {
  flex-shrink: 0;
  color: var(--lc-brand-300);
  font-weight: var(--lc-weight-semibold);
}
</style>
