<!--
  MaterialPanel.vue —— 物料面板（PLANS.md §1 4.4 D-A4 + 2026-10-29 重设计）

  数据源 = `@lc/materials` 的 META_LIST（排除 Page）。
  - 搜索：按名称 / 物料名 / 分组过滤；有输入时分组自动展开。
  - 分组可折叠，行高 32 的扁平列表（不再是 2 列虚线卡片）。
  - 两种添加入口：点击行 / 行尾「＋」直接追加到页面；HTML5 拖拽仍可用于精确落点。
-->
<template>
  <div class="lc-material-panel">
    <div class="mat-search">
      <svg
        class="mat-search__icon"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" />
      </svg>
      <input
        v-model="query"
        class="mat-search__input"
        type="search"
        data-testid="material-search"
        aria-label="搜索物料"
        placeholder="搜索物料"
        autocomplete="off"
        spellcheck="false"
        @keydown.esc="query = ''"
      />
      <button
        v-if="query"
        class="mat-search__clear"
        type="button"
        data-testid="material-search-clear"
        aria-label="清除搜索"
        @click="query = ''"
      >×</button>
    </div>

    <div class="mat-meta" aria-live="polite">
      <span>{{ resultCount }} 个物料</span>
      <span v-if="query" class="mat-meta__query">「{{ query }}」</span>
      <span v-else class="mat-meta__hint">点击添加，或拖入画布</span>
    </div>

    <section v-for="group in groups" :key="group.key" class="lc-material-panel__group">
      <button
        class="mat-group"
        type="button"
        :aria-expanded="!isCollapsed(group.key)"
        :data-testid="`material-group-${group.key}`"
        @click="toggleGroup(group.key)"
      >
        <svg
          class="mat-group__chevron"
          :class="{ 'mat-group__chevron--closed': isCollapsed(group.key) }"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
        <span class="lc-material-panel__group-title">{{ group.label }}</span>
        <span class="mat-group__count">{{ group.items.length }}</span>
      </button>

      <ul
        v-show="!isCollapsed(group.key)"
        class="lc-material-panel__list"
      >
        <li
          v-for="m in group.items"
          :key="m.name"
          class="lc-material-panel__item"
          draggable="true"
          role="button"
          tabindex="0"
          :aria-label="`${m.title}（点击添加到页面，或拖入画布）`"
          :title="`点击添加到页面，或拖入画布：${m.title}`"
          :data-testid="`material-add-${m.name}`"
          @dragstart="onDragStart($event, m)"
          @click="add(m)"
          @keydown.enter.prevent="add(m)"
          @keydown.space.prevent="add(m)"
        >
          <!-- 图标统一 16×16 线性规格（见 canvas/material-icons.ts）；颜色随组件 currentColor -->
          <svg
            class="lc-material-panel__icon"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            v-html="materialIcon(m.name)"
          />
          <span class="lc-material-panel__label">{{ m.title }}</span>
          <svg
            class="lc-material-panel__add"
            viewBox="0 0 16 16"
            width="12"
            height="12"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          >
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </li>
      </ul>
    </section>

    <panel-state
      v-if="!groups.length"
      kind="empty"
      testid="material-empty"
      :title="query ? '没有匹配的物料' : '没有可用物料'"
      :text="query
        ? '换个关键词试试；搜索会同时匹配物料名称与分组。'
        : '物料注册表为空，通常是构建期问题 —— 检查 @lc/materials 的 META_LIST 是否注册成功。'"
      :action-text="query ? '清除搜索' : undefined"
      inline
      @action="query = ''"
    />
    <p v-else class="panel-note">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { DragEvent as VueDragEvent } from 'vue'
import type { MaterialCategory, MaterialSchema } from '@lc/schema'
import { META_LIST, META_MAP } from '@lc/materials'
import { LC_MATERIAL_MIME } from '../core/dnd'
import { materialIcon } from '../canvas/material-icons'
import { useDesignerStore } from '../store/store'
import PanelState from '../components/PanelState.vue'

const CATEGORY_LABELS: Record<string, string> = {
  basic: '基础',
  layout: '布局',
  form: '表单',
  data: '数据',
  nav: '导航',
  feedback: '反馈',
  biz: '业务',
}

/**
 * 门户页（type=portal）的物料分组（2026-10-28 批 2）：
 * 门户是移动端首屏，表单控件/布局容器在这里没有落点，故**收敛为两组**：
 *   基础组件 = 纯展示（不依赖业务数据）
 *   业务组件 = 运行时接业务数据/流程的物料（数据卡、待办、图表、审批…）
 * 其余页型保持原 category 分组不变。
 */
const PORTAL_GROUPS: Array<{ key: string; label: string; names: string[] }> = [
  {
    key: 'portal-basic',
    label: '基础组件',
    names: ['PortalBanner', 'PortalNotice', 'PortalGrid', 'Text', 'Image', 'Icon', 'Tag', 'Divider', 'Progress'],
  },
  {
    key: 'portal-biz',
    label: '业务组件',
    names: [
      'PortalPageEntry',
      'PortalFlowList',
      'PortalStat',
      'PortalTodo',
      'Chart',
      'Statistic',
      'List',
      'Cell',
      'Detail',
      'Timeline',
      'ApprovalBar',
    ],
  },
]

interface PanelGroup {
  key: string
  label: string
  items: MaterialSchema[]
}

const store = useDesignerStore()

const isPortal = computed(() => store.schema?.type === 'portal')

/** 分组（排除 Page —— root 不可拖，属性面板仍可通过选中 root 展示） */
const allGroups = computed<PanelGroup[]>(() => {
  if (isPortal.value) {
    return PORTAL_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      items: g.names.map((n) => META_MAP[n]).filter((m): m is MaterialSchema => !!m),
    })).filter((g) => g.items.length > 0)
  }

  const map = new Map<MaterialCategory, MaterialSchema[]>()
  for (const m of META_LIST) {
    if (m.name === 'Page') continue
    const arr = map.get(m.category) ?? []
    arr.push(m)
    map.set(m.category, arr)
  }
  return [...map.entries()].map(([category, items]) => ({
    key: category,
    label: CATEGORY_LABELS[category] ?? category,
    items,
  }))
})

const query = ref('')
const collapsed = reactive<Record<string, boolean>>({})

/** 搜索：名称 / 物料名 / 分组名，三者命中其一即保留 */
const groups = computed<PanelGroup[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allGroups.value
  return allGroups.value
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.items.length > 0)
})

const resultCount = computed(() => groups.value.reduce((sum, g) => sum + g.items.length, 0))

/** 分组折叠：搜索中强制展开，避免「搜到了但折叠着」 */
function isCollapsed(key: string): boolean {
  return !query.value.trim() && collapsed[key] === true
}

function toggleGroup(key: string): void {
  collapsed[key] = !collapsed[key]
}

const note = computed(() =>
  isPortal.value
    ? '门户页只列基础/业务组件：点击或拖入画布，内容落在卡片区下方。'
    : '点击行直接追加到页面，拖拽可精确控制落点；选中后可在右栏配置属性。',
)

/** 点击添加：与拖拽走同一个 store 动作（追加 root 末尾并选中新节点） */
function add(m: MaterialSchema): void {
  store.insertMaterial(m.name)
}

function onDragStart(e: VueDragEvent, m: MaterialSchema): void {
  const dt = e.dataTransfer
  if (!dt) return
  dt.setData(LC_MATERIAL_MIME, m.name)
  dt.setData('text/plain', m.title) // Firefox 要求 text/plain 才放行拖拽
  dt.effectAllowed = 'copy'
}
</script>

<style scoped>
/* 令牌来源：@lc/designer/tokens.css（宿主 apps/designer-web 引入）；本文件不出现硬编码色值 */

/* 搜索：32 高，灰底，聚焦时白底 + 焦点环 */
.mat-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  height: 32px;
  margin-bottom: var(--lc-space-2);
  padding: 0 var(--lc-space-2);
  background: var(--lc-bg-subtle);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  transition:
    background-color var(--lc-duration-fast) var(--lc-ease-standard),
    border-color var(--lc-duration-fast) var(--lc-ease-standard);
}
.mat-search:focus-within {
  background: var(--lc-bg-surface);
  border-color: var(--lc-input-border-focus);
  box-shadow: var(--lc-focus-ring);
}
.mat-search__icon {
  flex: 0 0 14px;
  color: var(--lc-icon-muted);
}
.mat-search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  font-family: inherit;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  background: none;
  border: none;
  outline: none;
}
.mat-search__input::placeholder {
  color: var(--lc-input-placeholder);
}
/* 原生 search 的清除按钮在 Chromium 里是黑块，统一用自己的 × */
.mat-search__input::-webkit-search-cancel-button {
  display: none;
}
.mat-search__clear {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  padding: 0;
  font-family: inherit;
  font-size: var(--lc-font-body);
  line-height: var(--lc-leading-label);
  color: var(--lc-text-tertiary);
  background: none;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
.mat-search__clear:hover {
  color: var(--lc-text-primary);
  background: var(--lc-bg-surface);
}

.mat-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-2);
  margin-bottom: var(--lc-space-2);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.mat-meta__query {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--lc-text-secondary);
}
.mat-meta__hint {
  white-space: nowrap;
}

/* 分组头：30 高，整行可点；箭头旋转表达展开态 */
.mat-group {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  width: 100%;
  height: 30px;
  margin-top: var(--lc-space-1);
  padding: 0 var(--lc-space-1);
  font-family: inherit;
  text-align: left;
  background: none;
  border: none;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
}
.mat-group:hover {
  background: var(--lc-bg-subtle);
}
.mat-group:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: -1px;
}
.mat-group__chevron {
  flex: 0 0 12px;
  color: var(--lc-text-tertiary);
  transition: transform var(--lc-duration-fast) var(--lc-ease-standard);
}
.mat-group__chevron--closed {
  transform: rotate(-90deg);
}
.mat-group__count {
  margin-left: auto;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}

.lc-material-panel__group {
  margin-bottom: var(--lc-space-1);
}
.lc-material-panel__group-title {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.lc-material-panel__list {
  list-style: none;
}
/* 扁平行：32 高，无虚线卡片；行尾 ＋ 只在悬停/焦点时出现 */
.lc-material-panel__item {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  height: 32px;
  padding: 0 var(--lc-space-1) 0 var(--lc-space-2-5);
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-label);
  background: none;
  border-radius: var(--lc-radius-xs);
  cursor: grab;
  text-align: left;
  user-select: none;
  transition:
    color var(--lc-duration-fast) var(--lc-ease-standard),
    background-color var(--lc-duration-fast) var(--lc-ease-standard);
}
.lc-material-panel__icon {
  flex: 0 0 16px;
  color: var(--lc-icon-muted);
  transition: color var(--lc-duration-fast) var(--lc-ease-standard);
}
.lc-material-panel__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-material-panel__add {
  flex: 0 0 12px;
  color: var(--lc-text-tertiary);
  opacity: 0;
  transition: opacity var(--lc-duration-fast) var(--lc-ease-standard);
}
.lc-material-panel__item:hover,
.lc-material-panel__item:focus-visible {
  color: var(--lc-action-primary);
  background: var(--lc-bg-subtle);
}
.lc-material-panel__item:hover .lc-material-panel__icon,
.lc-material-panel__item:focus-visible .lc-material-panel__icon {
  color: var(--lc-action-primary);
}
.lc-material-panel__item:hover .lc-material-panel__add,
.lc-material-panel__item:focus-visible .lc-material-panel__add {
  opacity: 1;
}
.lc-material-panel__item:active {
  cursor: grabbing;
}
.lc-material-panel__item:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: -1px;
}
</style>
