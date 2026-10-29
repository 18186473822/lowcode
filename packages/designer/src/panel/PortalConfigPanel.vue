<!--
  PortalConfigPanel.vue —— 门户配置（2026-10-29 P1）

  云程把「移动门户」拆成两个页签：页面清单 + 门户配置（底部栏）。本期决策**不自绘 tabBar**
  （小程序 tabBar 是 pages.json 静态配置、运行时不可改），所以这里配置的是「应用菜单」：
  顺序即运行时首页的展示顺序，入口页决定登录后落到哪一页。

  编辑模型：本地 draft → 保存时整体 patch（`menus` 整组替换，服务端不逐项合并）。
  保存成功用服务端回传的配置覆盖 draft —— 归一化（去空白、丢契约外字段）以服务端为准。
-->
<template>
  <section class="portal-config" data-testid="portal-config">
    <header class="portal-config__head">
      <h3 class="panel-title">门户配置</h3>
      <p class="panel-note">
        入口页决定登录后先看到哪一页；应用菜单决定运行时首页的顺序与命名。
        本期不做自绘底部栏（小程序 tabBar 不可运行时改），入口页在运行时首页**置顶并标「主页」**，不自动跳转。
      </p>
    </header>

    <div class="portal-config__group">
      <span class="portal-config__label">应用信息</span>
      <div class="portal-config__row">
        <label class="portal-config__field">
          <span class="portal-config__key">应用名</span>
          <input
            v-model="draft.name"
            class="setter__input"
            type="text"
            maxlength="32"
            placeholder="如 请假管理"
            data-testid="cfg-name"
          />
        </label>
        <label class="portal-config__field portal-config__field--narrow">
          <span class="portal-config__key">图标</span>
          <input
            v-model="draft.icon"
            class="setter__input"
            type="text"
            maxlength="2"
            placeholder="单字"
            data-testid="cfg-icon"
          />
        </label>
      </div>
    </div>

    <div class="portal-config__group">
      <span class="portal-config__label">入口页</span>
      <select v-model="draft.entryPageId" class="setter__input" data-testid="cfg-entry">
        <option value="">未设置（运行时落到「应用入口」）</option>
        <option v-for="p in pageOptions" :key="p.id" :value="p.id">
          {{ p.name }}（{{ p.id }}）
        </option>
      </select>
      <p class="portal-config__hint">
        {{ entryHint }}
      </p>
    </div>

    <div class="portal-config__group">
      <div class="portal-config__group-head">
        <span class="portal-config__label">应用菜单</span>
        <span class="portal-config__count">{{ draft.menus.length }} 项</span>
      </div>

      <p v-if="!draft.menus.length" class="portal-config__empty" data-testid="cfg-menu-empty">
        还没有菜单。添加后按这里的顺序出现在运行时首页；未配置时运行时列出全部页面。
      </p>

      <ul v-else class="portal-config__menus">
        <li
          v-for="(m, i) in draft.menus"
          :key="m.id"
          class="portal-config__menu"
          :data-testid="`cfg-menu-${i}`"
        >
          <span class="portal-config__seq">{{ i + 1 }}</span>

          <input
            v-model="m.name"
            class="setter__input portal-config__m-name"
            type="text"
            maxlength="32"
            placeholder="菜单名称"
            :aria-label="`第 ${i + 1} 项名称`"
            :data-testid="`cfg-menu-name-${i}`"
          />

          <select
            v-model="m.type"
            class="setter__input portal-config__m-type"
            :aria-label="`第 ${i + 1} 项类型`"
            :data-testid="`cfg-menu-type-${i}`"
            @change="onTypeChange(m)"
          >
            <option v-for="t in MENU_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>

          <select
            v-if="m.type === 'portal' || m.type === 'page'"
            v-model="m.pageId"
            class="setter__input portal-config__m-target"
            :aria-label="`第 ${i + 1} 项目标页面`"
            :data-testid="`cfg-menu-page-${i}`"
          >
            <option v-for="p in pageOptions" :key="p.id" :value="p.id">{{ p.name }}（{{ p.id }}）</option>
          </select>

          <select
            v-else-if="m.type === 'builtin'"
            v-model="m.target"
            class="setter__input portal-config__m-target"
            :aria-label="`第 ${i + 1} 项内置页`"
            :data-testid="`cfg-menu-target-${i}`"
          >
            <option v-for="b in BUILTIN_TARGETS" :key="b.value" :value="b.value">{{ b.label }}</option>
          </select>

          <input
            v-else
            v-model="m.url"
            class="setter__input portal-config__m-target"
            type="text"
            placeholder="https://"
            :aria-label="`第 ${i + 1} 项外链`"
            :data-testid="`cfg-menu-url-${i}`"
          />

          <span v-if="isHome(m)" class="portal-config__pill" data-testid="cfg-menu-home">主页</span>

          <span class="portal-config__ops">
            <button
              class="portal-config__op"
              type="button"
              :disabled="i === 0"
              title="上移"
              :data-testid="`cfg-menu-up-${i}`"
              @click="move(i, -1)"
            >↑</button>
            <button
              class="portal-config__op"
              type="button"
              :disabled="i === draft.menus.length - 1"
              title="下移"
              :data-testid="`cfg-menu-down-${i}`"
              @click="move(i, 1)"
            >↓</button>
            <button
              class="portal-config__op portal-config__op--danger"
              type="button"
              title="删除"
              :data-testid="`cfg-menu-remove-${i}`"
              @click="remove(i)"
            >删除</button>
          </span>
        </li>
      </ul>

      <button class="op-btn" type="button" data-testid="cfg-menu-add" @click="addMenu">
        ＋ 添加菜单
      </button>
    </div>

    <div v-if="store.flowsSupported" class="portal-config__group">
      <div class="portal-config__group-head">
        <span class="portal-config__label">流程入口</span>
        <span class="portal-config__count">{{ store.flows.length }} 个流程</span>
      </div>
      <p class="portal-config__hint">
        给流程选一张「发起表单页」，门户的「常用流程」物料就会列出它；选「不绑定」则该流程不从门户发起。
      </p>

      <p v-if="store.flowsError" class="panel-err" data-testid="cfg-flow-error">{{ store.flowsError }}</p>
      <p v-else-if="store.flowsLoading" class="portal-config__hint">加载流程…</p>
      <p v-else-if="!store.flows.length" class="portal-config__empty" data-testid="cfg-flow-empty">
        还没有流程定义。流程经 <code>PUT /flows/:id</code> 创建后，这里就能绑启动页。
      </p>
      <ul v-else class="portal-config__flows">
        <li
          v-for="f in store.flows"
          :key="f.flowId"
          class="portal-config__flow"
          :data-testid="`cfg-flow-${f.flowId}`"
        >
          <span class="portal-config__flow-main">
            <span class="portal-config__flow-name">{{ f.name }}</span>
            <span class="portal-config__hint">{{ f.modelId ? `模型 · ${f.modelId}` : f.flowId }}</span>
          </span>
          <select
            class="setter__input portal-config__flow-page"
            :value="f.startPageId ?? ''"
            :aria-label="`${f.name} 的启动页`"
            :data-testid="`cfg-flow-page-${f.flowId}`"
            :disabled="!!flowBusy[f.flowId]"
            @change="onFlowPage(f, $event)"
          >
            <option value="">不绑定</option>
            <option v-for="p in pageOptions" :key="p.id" :value="p.id">{{ p.name }}（{{ p.id }}）</option>
          </select>
        </li>
      </ul>
    </div>

    <footer class="portal-config__foot">
      <button
        class="op-btn op-btn--primary"
        type="button"
        data-testid="cfg-save"
        :disabled="!dirty || store.appSaving || localIssues.length > 0"
        @click="save"
      >{{ store.appSaving ? '保存中…' : '保存' }}</button>
      <span v-if="store.appSaveError" class="panel-err" data-testid="cfg-error">{{ store.appSaveError }}</span>
      <span v-else-if="localIssues.length" class="panel-err" data-testid="cfg-issues">{{ localIssues[0] }}</span>
      <span v-else-if="dirty" class="portal-config__hint" data-testid="cfg-dirty">有未保存的修改</span>
      <span v-else class="portal-config__hint" data-testid="cfg-synced">已同步</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import type { AppMenuItem } from '@lc/schema'
import { useDesignerStore, type AppConfigPatch, type FlowListItem } from '../store/store'

const store = useDesignerStore()

/** 运行时可识别的内置页：目前只有待办中心（其余标识在协议里保留、未实现） */
const BUILTIN_TARGETS = [{ value: 'todoList', label: '待办中心' }] as const

const MENU_TYPES = [
  { value: 'portal', label: '门户页' },
  { value: 'page', label: '普通页' },
  { value: 'builtin', label: '内置页' },
  { value: 'url', label: '外链' },
] as const

const draft = reactive({
  name: '',
  icon: '',
  entryPageId: '',
  menus: [] as AppMenuItem[],
})

/** 可作为菜单项 / 入口页的页面（全部已保存页面） */
const pageOptions = computed(() => store.pages)

/** 只把契约内的键放进草稿，保证 dirty 比较不被临时字段干扰 */
function normalizeMenu(m: AppMenuItem): AppMenuItem {
  const out: AppMenuItem = { id: m.id, name: m.name.trim(), type: m.type }
  if (m.icon) out.icon = m.icon
  if (m.pageId) out.pageId = m.pageId
  if (m.target) out.target = m.target
  if (m.url) out.url = m.url
  if (m.badge) out.badge = m.badge
  return out
}

function applyFromStore(): void {
  const cfg = store.appConfig
  draft.name = cfg?.name ?? ''
  draft.icon = cfg?.icon ?? ''
  draft.entryPageId = cfg?.entry?.pageId ?? ''
  draft.menus = (cfg?.menus ?? []).map((m) => ({ ...m }))
}
watch(() => store.appConfig, applyFromStore, { immediate: true })

function entryTypeOf(pageId: string): 'portal' | 'page' {
  return pageOptions.value.find((p) => p.id === pageId)?.type === 'portal' ? 'portal' : 'page'
}

const entryHint = computed(() => {
  if (!draft.entryPageId) return '未设置时运行时进入「应用入口」列表。'
  const hit = pageOptions.value.find((p) => p.id === draft.entryPageId)
  return hit
    ? `登录后直接进入「${hit.name}」。`
    : `页面 ${draft.entryPageId} 不在当前页面列表里（可能已删除），保存前请重选。`
})

/** 明显不合法的项先本地拦一道，剩下的交给服务端校验（错误原文经 store.appSaveError 展示） */
const localIssues = computed<string[]>(() => {
  const issues: string[] = []
  if (draft.entryPageId && !pageOptions.value.some((p) => p.id === draft.entryPageId)) {
    issues.push('入口页不在当前页面列表里')
  }
  draft.menus.forEach((m, i) => {
    if (!m.name.trim()) issues.push(`第 ${i + 1} 项菜单名称为空`)
    if ((m.type === 'page' || m.type === 'portal') && !m.pageId) {
      issues.push(`第 ${i + 1} 项未选择目标页面`)
    }
    if (m.type === 'url' && !/^https?:\/\/\S+$/i.test(m.url ?? '')) {
      issues.push(`第 ${i + 1} 项外链必须以 http(s):// 开头`)
    }
  })
  return issues
})

const snapshotOf = (v: { name: string; icon: string; entryPageId: string; menus: AppMenuItem[] }) =>
  JSON.stringify({
    name: v.name.trim(),
    icon: v.icon.trim(),
    entryPageId: v.entryPageId,
    menus: v.menus.map(normalizeMenu),
  })

const dirty = computed(() => snapshotOf(draft) !== snapshotOf({
  name: store.appConfig?.name ?? '',
  icon: store.appConfig?.icon ?? '',
  entryPageId: store.appConfig?.entry?.pageId ?? '',
  menus: store.appConfig?.menus ?? [],
}))

function isHome(m: AppMenuItem): boolean {
  return !!m.pageId && m.pageId === draft.entryPageId
}

function onTypeChange(m: AppMenuItem): void {
  // 换类型必须清掉另一类目标，否则会带着 pageId + url 一起提交
  delete m.pageId
  delete m.target
  delete m.url
  if (m.type === 'page' || m.type === 'portal') {
    const first = pageOptions.value[0]
    if (first) m.pageId = first.id
  } else if (m.type === 'builtin') {
    m.target = BUILTIN_TARGETS[0].value
  } else {
    m.url = 'https://'
  }
}

function addMenu(): void {
  const id = `m_${Math.random().toString(36).slice(2, 8)}`
  const first = pageOptions.value[0]
  if (first) {
    draft.menus.push({
      id,
      name: first.name,
      type: first.type === 'portal' ? 'portal' : 'page',
      pageId: first.id,
    })
  } else {
    draft.menus.push({ id, name: '新菜单', type: 'builtin', target: BUILTIN_TARGETS[0].value })
  }
}

function move(index: number, dir: -1 | 1): void {
  const to = index + dir
  if (to < 0 || to >= draft.menus.length) return
  const [item] = draft.menus.splice(index, 1)
  if (item) draft.menus.splice(to, 0, item)
}

function remove(index: number): void {
  draft.menus.splice(index, 1)
}

async function save(): Promise<void> {
  if (localIssues.value.length) return
  const patch: AppConfigPatch = {
    name: draft.name.trim() || null,
    icon: draft.icon.trim() || null,
    menus: draft.menus.map(normalizeMenu),
    entry: draft.entryPageId
      ? { type: entryTypeOf(draft.entryPageId), pageId: draft.entryPageId }
      : null,
  }
  await store.saveAppConfig(patch)
}

/* ---------------- 流程入口（2026-10-29）：绑 / 解绑启动页 ---------------- */

/** 按 flowId 记「保存中」，只禁用对应那一行的下拉，不锁整节 */
const flowBusy = reactive<Record<string, boolean>>({})

onMounted(() => {
  void store.loadFlows()
})

async function onFlowPage(f: FlowListItem, e: Event): Promise<void> {
  const pageId = (e.target as HTMLSelectElement).value || null
  flowBusy[f.flowId] = true
  try {
    await store.setFlowStartPage(f.flowId, pageId)
  } finally {
    flowBusy[f.flowId] = false
  }
}
</script>

<style scoped>
.portal-config {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-4);
}
.portal-config__head {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
}

.portal-config__group {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
  padding: var(--lc-space-3);
  background: var(--lc-bg-surface);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
}
.portal-config__group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.portal-config__label {
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-label);
}
.portal-config__count {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.portal-config__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--lc-space-3);
}
.portal-config__field {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  flex: 1 1 220px;
}
.portal-config__field--narrow {
  flex: 0 0 128px;
}
.portal-config__key {
  flex-shrink: 0;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}
.portal-config__hint {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.portal-config__empty {
  margin: 0;
  padding: var(--lc-space-3);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  text-align: center;
  background: var(--lc-bg-subtle);
  border-radius: var(--lc-radius-sm);
}

.portal-config__menus {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.portal-config__menu {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-1-5) var(--lc-space-2);
  background: var(--lc-bg-subtle);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
}
.portal-config__seq {
  width: 16px;
  font-family: var(--lc-font-mono);  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  text-align: center;
}
.portal-config__m-name {
  flex: 1 1 120px;
  min-width: 0;
}
.portal-config__m-type {
  flex: 0 0 92px;
}
.portal-config__m-target {
  flex: 1 1 160px;
  min-width: 0;
}
.portal-config__pill {
  padding: 0 var(--lc-space-1-5);
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-label);
  color: var(--lc-status-success);
  background: var(--lc-status-success-bg);
  border-radius: var(--lc-radius-xs);
}
.portal-config__ops {
  display: flex;
  gap: var(--lc-space-1);
  margin-left: auto;
}
.portal-config__op {
  padding: 0 var(--lc-space-1);
  font-family: inherit;
  font-size: var(--lc-font-micro);
  color: var(--lc-action-primary);
  background: none;
  border: 0;
  cursor: pointer;
}
.portal-config__op:disabled {
  color: var(--lc-text-tertiary);
  cursor: not-allowed;
}
.portal-config__op--danger {
  color: var(--lc-text-danger);
}
.portal-config__op:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}

.portal-config__foot {
  display: flex;
  align-items: center;
  gap: var(--lc-space-3);
}

/* 流程入口：一行一个流程，右侧绑启动页（改完即存，不参与上面的「保存」按钮） */
.portal-config__flows {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.portal-config__flow {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-1-5) var(--lc-space-2);
  background: var(--lc-bg-subtle);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
}
.portal-config__flow-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  min-width: 0;
}
.portal-config__flow-name {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
}
.portal-config__flow-page {
  flex: 0 0 176px;
  min-width: 0;
}
</style>
