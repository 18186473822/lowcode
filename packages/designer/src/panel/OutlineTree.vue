<!--
  OutlineTree.vue —— 大纲树面板（Phase 2 批 4，phase2-plan §8）

  左栏 Tab「物料 / 大纲」的第二页签：从 store.schema.root 扁平化出树行，
  与画布**双向联动**（点击行 ↔ 画布选中高亮）；行内删除复用 store.removeById。
  不做大纲内拖拽排序（画布/属性面板已有排序入口）。
-->
<template>
  <div class="lc-outline" data-testid="outline-tree">
    <div class="panel-head">
      <h3 class="panel-title">大纲</h3>
      <!-- lc-outline__count 仅作测试钩子保留；样式来自共享的 .panel-head__meta -->
      <span class="panel-head__meta lc-outline__count">{{ nodeCount }} 个组件</span>
    </div>
    <ul class="lc-outline__list">
      <li
        v-for="row in rows"
        :key="row.id"
        class="lc-outline__row"
        :class="{ 'lc-outline__row--active': row.id === store.selectedId }"
        :style="{ paddingLeft: `${8 + row.level * 14}px` }"
        :data-testid="`outline-row-${row.id}`"
        @click="store.select(row.id)"
      >
        <button
          v-if="row.hasChildren"
          class="lc-outline__toggle"
          type="button"
          :aria-label="row.collapsed ? '展开' : '折叠'"
          @click.stop="toggle(row.id)"
        >{{ row.collapsed ? '▸' : '▾' }}</button>
        <span v-else class="lc-outline__toggle lc-outline__toggle--blank" aria-hidden="true" />
        <span class="lc-outline__label">{{ row.label }}</span>
        <span class="lc-outline__type">{{ row.componentName }}</span>
        <button
          v-if="!row.isRoot"
          class="lc-outline__del"
          type="button"
          title="删除该节点"
          @click.stop="store.removeById(row.id)"
        >×        </button>
      </li>
    </ul>
    <panel-state
      v-if="nodeCount === 0"
      kind="empty"
      testid="outline-empty"
      title="页面还是空的"
      text="切到「物料」页签，把组件拖进画布，这里会实时反映节点树。"
      inline
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { META_MAP } from '@lc/materials'
import type { NodeSchema } from '@lc/schema'
import { ancestorIds } from '../core/schema-ops'
import { useDesignerStore } from '../store/store'
import PanelState from '../components/PanelState.vue'

const store = useDesignerStore()

/** 折叠节点 id 集（默认空 = 全展开；Set 的 add/delete 由 Vue reactive 追踪） */
const collapsed = ref<Set<string>>(new Set())

interface TreeRow {
  id: string
  label: string
  componentName: string
  level: number
  isRoot: boolean
  hasChildren: boolean
  collapsed: boolean
}

/** 扁平化树：折叠分支的后代不出现（与画布可见节点口径一致）；root 行 label 固定「页面」 */
const rows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = []
  const walk = (n: NodeSchema, level: number): void => {
    const isRoot = level === 0
    const isCollapsed = collapsed.value.has(n.id)
    out.push({
      id: n.id,
      label: isRoot ? '页面' : (META_MAP[n.componentName]?.title ?? n.componentName),
      componentName: n.componentName,
      level,
      isRoot,
      hasChildren: Array.isArray(n.children) && n.children.length > 0,
      collapsed: isCollapsed,
    })
    if (!isCollapsed && n.children) for (const c of n.children) walk(c, level + 1)
  }
  walk(store.schema.root, 0)
  return out
})

/** 组件总数（不含 root；折叠不影响计数 —— 全树静态统计） */
const nodeCount = computed(() => {
  let count = 0
  const walk = (n: NodeSchema): void => {
    for (const c of n.children ?? []) {
      count += 1
      walk(c)
    }
  }
  walk(store.schema.root)
  return count
})

function toggle(id: string): void {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}

/** 选中变化（画布点选或树内点选）→ 自动展开父链，保证选中行可见 */
watch(
  () => store.selectedId,
  (id) => {
    if (!id) return
    for (const a of ancestorIds(store.schema, id)) collapsed.value.delete(a)
    collapsed.value.delete(store.schema.root.id)
  },
)
</script>

<style scoped>
/* 令牌来源：@lc/designer/tokens.css（宿主 apps/designer-web 引入）；本文件不出现硬编码色值。
   容器背景与左描边由宿主 `.designer__aside--left` 提供，此处不再重复画（否则出现内缩的重复竖线）。
   面板头部改用共享的 `.panel-head` / `.panel-title` / `.panel-head__meta`（见 ../styles/panel.css）。 */
.lc-outline {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.lc-outline__list {
  margin: 0;
  padding: var(--lc-space-1) 0;
  list-style: none;
  overflow-y: auto;
  flex: 1;
}
.lc-outline__row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1);
  padding: 3px var(--lc-space-2) 3px 0;
  cursor: pointer;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
  user-select: none;
}
.lc-outline__row:hover {
  background: var(--lc-bg-subtle);
}
.lc-outline__row--active {
  background: var(--lc-action-primary-subtle);
  color: var(--lc-action-primary);
}
.lc-outline__toggle {
  width: 16px;
  min-width: 16px;
  padding: 0;
  border: none;
  background: none;
  color: var(--lc-text-tertiary);
  font-size: 10px;
  cursor: pointer;
  line-height: var(--lc-leading-label);
}
.lc-outline__toggle--blank {
  cursor: default;
}
.lc-outline__label {
  flex: 0 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lc-outline__type {
  font-size: 10px;
  color: var(--lc-text-tertiary);
  font-family: var(--lc-font-mono);
}
.lc-outline__del {
  margin-left: auto;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: none;
  color: var(--lc-text-tertiary);
  font-size: var(--lc-font-body-sm);
  line-height: var(--lc-leading-label);
  cursor: pointer;
  visibility: hidden;
}
.lc-outline__row:hover .lc-outline__del,
.lc-outline__del:focus-visible {
  visibility: visible;
}
.lc-outline__del:hover {
  color: var(--lc-status-danger);
}
</style>
