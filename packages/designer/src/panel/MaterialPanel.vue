<!--
  MaterialPanel.vue —— 物料面板（PLANS.md §1 4.4 D-A4 + 批 2 验收）

  数据源 = `@lc/materials` 的 META_LIST（排除 Page：root 不可拖 → 面板展示 12 项）。
  按 category 分组展示，HTML5 draggable 发起拖放；drop 接收方在画布（LcCanvas）。
-->
<template>
  <div class="lc-material-panel">
    <div class="panel-head">
      <h3 class="panel-title">物料</h3>
    </div>
    <section v-for="group in groups" :key="group.key" class="lc-material-panel__group">
      <div class="lc-material-panel__group-title">{{ group.label }}</div>
      <ul class="lc-material-panel__list">
        <li
          v-for="m in group.items"
          :key="m.name"
          class="lc-material-panel__item"
          draggable="true"
          role="button"
          tabindex="0"
          :aria-label="`${m.title}（拖入画布）`"
          :title="`拖入画布：${m.title}`"
          @dragstart="onDragStart($event, m)"
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
        </li>
      </ul>
    </section>
    <panel-state
      v-if="!groups.length"
      kind="empty"
      testid="material-empty"
      title="没有可用物料"
      text="物料注册表为空，通常是构建期问题 —— 检查 @lc/materials 的 META_LIST 是否注册成功。"
      inline
    />
    <p class="panel-note">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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
const groups = computed<PanelGroup[]>(() => {
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

const note = computed(() =>
  isPortal.value
    ? '门户页只列基础/业务组件：拖动到画布即可添加到卡片区下方。'
    : '拖动到画布即可添加；选中后可在右栏配置属性。',
)

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
.lc-material-panel__group {
  margin-bottom: var(--lc-space-3);
}
.lc-material-panel__group-title {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
  margin: var(--lc-space-2) 0 var(--lc-space-1-5);
}
.lc-material-panel__list {
  list-style: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--lc-space-1-5);
}
.lc-material-panel__item {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  padding: var(--lc-space-1-5) var(--lc-space-2);
  border: var(--lc-border-width) var(--lc-border-dashed) var(--lc-border-strong);
  border-radius: var(--lc-radius-sm);
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-label);
  background: var(--lc-bg-subtle);
  cursor: grab;
  text-align: left;
  user-select: none;
  transition:
    border-color var(--lc-duration-fast) var(--lc-ease-standard),
    color var(--lc-duration-fast) var(--lc-ease-standard),
    background-color var(--lc-duration-fast) var(--lc-ease-standard);
}
/* 图标默认次级色，悬停跟随父级变主色（层级：图标 < 文字） */
.lc-material-panel__icon {
  flex: 0 0 16px;
  color: var(--lc-icon-muted);
  transition: color var(--lc-duration-fast) var(--lc-ease-standard);
}
.lc-material-panel__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-material-panel__item:hover .lc-material-panel__icon {
  color: var(--lc-action-primary);
}
.lc-material-panel__item:hover {
  border-color: var(--lc-action-primary);
  color: var(--lc-action-primary);
  background: var(--lc-action-primary-subtle);
}
.lc-material-panel__item:active {
  cursor: grabbing;
}
.lc-material-panel__item:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
</style>
