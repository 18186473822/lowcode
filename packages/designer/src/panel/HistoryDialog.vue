<!--
  HistoryDialog.vue —— 版本历史弹层（Phase 2 批 5，PLANS.md §2）

  顶栏「历史」按钮驱动 store.historyOpen；手写 modal（fixed 遮罩 + 居中面板，
  不引 Element Plus —— 设计器现状全手写 CSS，EP 实际未使用）。
  行操作：「对比当前草稿」→ store.compareVersion（vN 全文 vs 内存当前 schema）；
  「回滚到此版」→ 行内两步确认（不用 window.confirm，便于组件测试）→ store.rollbackTo。
-->
<template>
  <div
    v-if="store.historyOpen"
    class="lc-history"
    data-testid="history-dialog"
    @click.self="store.closeHistory()"
  >
    <div class="lc-history__panel" role="dialog" aria-label="版本历史">
      <div class="lc-history__head">
        <div class="lc-history__title">
          <strong>版本历史</strong>
          <code class="lc-history__pid">{{ store.pageId }}</code>
          <span v-if="store.currentVersion > 0" class="lc-history__cur" data-testid="history-current">
            当前发布 v{{ store.currentVersion }}
          </span>
        </div>
        <div class="lc-history__head-right">
          <button
            class="lc-history__btn"
            type="button"
            data-testid="history-refresh"
            @click="store.refreshVersions()"
          >刷新</button>
          <button
            class="lc-history__btn lc-history__btn--close"
            type="button"
            data-testid="history-close"
            aria-label="关闭"
            @click="store.closeHistory()"
          >×</button>
        </div>
      </div>

      <!-- 列表三态：加载中 / 失败 / 空历史 -->
      <p v-if="store.versionsLoading" class="lc-history__hint" data-testid="history-loading">加载中…</p>
      <p
        v-else-if="store.versionsError"
        class="lc-history__hint lc-history__hint--err"
        data-testid="history-error"
      >{{ store.versionsError }}</p>
      <p
        v-else-if="store.versions.length === 0"
        class="lc-history__hint"
        data-testid="history-empty"
      >尚无发布版本（点顶栏「发布」固化版本）</p>
      <ul v-else class="lc-history__list" data-testid="history-list">
        <li
          v-for="v in store.versions"
          :key="v.version"
          class="lc-history__row"
          :data-testid="`history-v${v.version}`"
        >
          <span
            class="lc-history__badge"
            :class="{ 'lc-history__badge--cur': v.version === store.currentVersion }"
          >v{{ v.version }}</span>
          <span class="lc-history__meta">{{ formatTime(v.createdAt) }} · {{ v.createdBy }}</span>
          <span v-if="v.note" class="lc-history__note">{{ v.note }}</span>
          <span class="lc-history__actions">
            <template v-if="confirming === v.version">
              <button
                class="lc-history__btn lc-history__btn--danger"
                type="button"
                :data-testid="`confirm-rollback-v${v.version}`"
                @click="doRollback(v.version)"
              >确认回滚到 v{{ v.version }}？</button>
              <button
                class="lc-history__btn"
                type="button"
                data-testid="cancel-rollback"
                @click="confirming = null"
              >取消</button>
            </template>
            <template v-else>
              <button
                class="lc-history__btn"
                type="button"
                :data-testid="`compare-v${v.version}`"
                @click="store.compareVersion(v.version)"
              >对比当前草稿</button>
              <button
                class="lc-history__btn"
                type="button"
                :data-testid="`rollback-v${v.version}`"
                @click="confirming = v.version"
              >回滚到此版</button>
            </template>
          </span>
        </li>
      </ul>

      <!-- diff 区：vN（before）→ 当前画布（after） -->
      <div
        v-if="store.diffVersion !== null"
        class="lc-history__diff"
        data-testid="history-diff"
      >
        <div class="lc-history__diff-head">
          <strong>v{{ store.diffVersion }} → 当前画布</strong>
          <span class="lc-history__diff-count" data-testid="diff-count">{{ store.diffEntries.length }} 处差异</span>
          <button
            class="lc-history__btn"
            type="button"
            data-testid="diff-clear"
            @click="store.clearDiff()"
          >清除</button>
        </div>
        <p
          v-if="store.diffEntries.length === 0"
          class="lc-history__hint"
          data-testid="diff-none"
        >与当前画布无差异</p>
        <ul v-else class="lc-history__entries">
          <li
            v-for="(e, i) in store.diffEntries"
            :key="i"
            class="lc-history__entry"
            :class="`lc-history__entry--${e.kind}`"
            :data-testid="`diff-${e.kind}`"
          >
            <span class="lc-history__kind">{{ kindLabel(e.kind) }}</span>
            <span class="lc-history__node">{{ labelOf(e.componentName) }} <code>{{ e.id }}</code></span>
            <span class="lc-history__desc">{{ describe(e) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { META_MAP } from '@lc/materials'
import type { DiffEntry } from '../core/schema-diff'
import { useDesignerStore } from '../store/store'

const store = useDesignerStore()

/** 行内两步确认的目标版本（null = 未进入确认态） */
const confirming = ref<number | null>(null)

/** 弹层关闭 → 复位确认态（下次打开不残留） */
watch(
  () => store.historyOpen,
  (open) => {
    if (!open) confirming.value = null
  },
)

async function doRollback(v: number): Promise<void> {
  confirming.value = null
  await store.rollbackTo(v)
}

function labelOf(componentName: string): string {
  return META_MAP[componentName]?.title ?? componentName
}

function kindLabel(kind: DiffEntry['kind']): string {
  return { add: '＋ 新增', remove: '－ 删除', change: '～ 修改', move: '⇄ 移动' }[kind]
}

function describe(e: DiffEntry): string {
  if (e.kind === 'add' || e.kind === 'remove') return `父级 ${e.parentId}`
  if (e.kind === 'move') return `位置 ${e.before} → ${e.after}`
  return `${e.field}: ${e.before} → ${e.after}`
}

/** ISO 时间 → `MM-DD HH:mm`（列表紧凑展示） */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<style scoped>
/* 令牌来源：@lc/designer/tokens.css（宿主 apps/designer-web 引入）；本文件不出现硬编码色值 */
.lc-history {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lc-overlay-scrim);
}
.lc-history__panel {
  width: 640px;
  max-width: calc(100vw - var(--lc-space-12));
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-lg);
  box-shadow: var(--lc-shadow-e4);
  overflow: hidden;
}
.lc-history__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--lc-space-3) var(--lc-space-4);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-history__title {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-history__pid {
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-secondary);
  background: var(--lc-bg-subtle);
  padding: 1px var(--lc-space-1-5);
  border-radius: var(--lc-radius-xs);
}
.lc-history__cur {
  font-size: var(--lc-font-micro);
  color: var(--lc-action-primary);
  background: var(--lc-status-info-bg);
  border: var(--lc-border-width) solid var(--lc-brand-200);
  padding: 1px var(--lc-space-1-5);
  border-radius: var(--lc-radius-pill);
}
.lc-history__head-right {
  display: flex;
  gap: var(--lc-space-1-5);
}
.lc-history__list {
  margin: 0;
  padding: var(--lc-space-1) 0;
  list-style: none;
  overflow-y: auto;
  flex: 1;
}
.lc-history__row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-2) var(--lc-space-4);
  font-size: var(--lc-font-caption);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-history__badge {
  min-width: 34px;
  text-align: center;
  font-weight: var(--lc-weight-semibold);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-label);
  background: var(--lc-bg-subtle);
  border-radius: var(--lc-radius-xs);
  padding: var(--lc-space-0-5) var(--lc-space-1);
}
.lc-history__badge--cur {
  color: var(--lc-action-primary-text);
  background: var(--lc-action-primary);
}
.lc-history__meta {
  color: var(--lc-text-secondary);
  white-space: nowrap;
}
.lc-history__note {
  color: var(--lc-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.lc-history__actions {
  margin-left: auto;
  display: flex;
  gap: var(--lc-space-1-5);
  flex-shrink: 0;
}
.lc-history__btn {
  padding: 3px 9px;
  font-family: inherit;
  font-size: var(--lc-font-micro);
  border: var(--lc-border-width) solid var(--lc-border-strong);
  border-radius: var(--lc-radius-xs);
  background: var(--lc-bg-surface);
  color: var(--lc-text-label);
  cursor: pointer;
  transition:
    border-color var(--lc-duration-fast) var(--lc-ease-standard),
    color var(--lc-duration-fast) var(--lc-ease-standard),
    background-color var(--lc-duration-fast) var(--lc-ease-standard);
}
.lc-history__btn:hover {
  border-color: var(--lc-action-primary);
  color: var(--lc-action-primary);
}
.lc-history__btn:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
.lc-history__btn--close {
  font-size: var(--lc-font-body);
  line-height: var(--lc-leading-label);
  padding: var(--lc-space-0-5) var(--lc-space-2);
}
.lc-history__btn--danger {
  border-color: var(--lc-status-danger);
  background: var(--lc-status-danger);
  color: var(--lc-action-primary-text);
}
.lc-history__btn--danger:hover {
  background: var(--lc-danger-600);
  border-color: var(--lc-danger-600);
  color: var(--lc-action-primary-text);
}
.lc-history__hint {
  margin: 0;
  padding: 18px var(--lc-space-4);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
  text-align: center;
  line-height: var(--lc-leading-readable);
}
.lc-history__hint--err {
  color: var(--lc-status-danger);
}
.lc-history__diff {
  border-top: var(--lc-border-width) solid var(--lc-border-default);
  background: var(--lc-bg-subtle);
  max-height: 280px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.lc-history__diff-head {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2-5);
  padding: var(--lc-space-2) var(--lc-space-4);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-history__diff-count {
  color: var(--lc-text-secondary);
  flex: 1;
}
.lc-history__entries {
  margin: 0;
  padding: var(--lc-space-1-5) 0;
  list-style: none;
  overflow-y: auto;
}
.lc-history__entry {
  display: flex;
  align-items: baseline;
  gap: var(--lc-space-2);
  padding: var(--lc-space-1) var(--lc-space-4);
  font-size: var(--lc-font-caption);
}
.lc-history__kind {
  flex-shrink: 0;
  width: 52px;
  font-weight: var(--lc-weight-semibold);
}
.lc-history__node code {
  font-family: var(--lc-font-mono);
  font-size: 10px;
  color: var(--lc-text-tertiary);
}
.lc-history__desc {
  color: var(--lc-text-label);
  word-break: break-all;
}
.lc-history__entry--add .lc-history__kind {
  color: var(--lc-status-success);
}
.lc-history__entry--remove .lc-history__kind {
  color: var(--lc-status-danger);
}
.lc-history__entry--change .lc-history__kind,
.lc-history__entry--move .lc-history__kind {
  color: var(--lc-status-warning);
}
</style>
