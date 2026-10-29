<!--
  ModelPanel.vue —— 数据模型管理视图（Phase 2 批 1 / D-P2-1）
  - 列表视图：GET /models 摘要 + 新建（输入 id → 空白骨架进编辑器）；
  - 编辑视图：模型 name/code + 字段表格（行增删/上下移/key·展示名·type·required·enum options）；
  - 所有编辑经 store → core/model-ops 纯函数（视图只发意图，沿 D-A3 纪律）；
  - 保存门禁 = model-ops.modelErrors（协议 validateModel 同源 + id 格式），errors 可见不静默。
-->
<template>
  <div class="lc-model-panel ws-page">
    <!-- 列表视图（未选中编辑对象） -->
    <template v-if="!store.editingModel">
      <header class="ws-head">
        <div class="ws-head__text">
          <h3 class="ws-title">数据模型</h3>
          <p class="ws-note">表单页与列表页的数据源。先建模型，再用「新建页面」按模型生成成组页面。</p>
        </div>
        <div class="ws-actions">
          <div class="ws-create">
            <input
              ref="newIdRef"
              v-model="newId"
              class="setter__input"
              type="text"
              placeholder="新模型 id，如 m_leave"
              aria-label="新模型 id"
              data-testid="new-model-id"
              @keydown.enter="onNew"
            />
            <button class="op-btn op-btn--primary" type="button" data-testid="new-model" @click="onNew">
              新建
            </button>
          </div>
        </div>
      </header>
      <panel-state
        v-if="store.modelError"
        kind="error"
        testid="model-list-error"
        :title="store.modelError"
        text="模型列表拉取失败，新建与编辑都会落空。恢复连接后重试即可。"
        action-text="重试"
        inline
        @action="onRetry"
      />
      <panel-state
        v-else-if="store.modelsLoading"
        kind="skeleton"
        testid="model-list-loading"
        :rows="3"
      />
      <template v-else>
        <section class="ws-section">
          <div class="ws-section__head">
            <h4 class="ws-section__title">全部模型</h4>
            <span class="ws-section__meta">{{ store.models.length }} 个</span>
          </div>
          <ul v-if="store.models.length" class="model-list ws-list" data-testid="model-list">
            <li v-for="m in store.models" :key="m.id" class="model-item">
              <button class="model-item__open ws-row" type="button" :data-testid="`open-model-${m.id}`" @click="store.openModel(m.id)">
                <strong class="model-item__name ws-name">{{ m.name || m.id }}</strong>
                <code class="model-item__id ws-id">{{ m.id }}</code>
                <span class="model-item__meta ws-meta">{{ m.fieldCount ?? '?' }} 字段</span>
                <span class="ws-chevron" aria-hidden="true">→</span>
              </button>
            </li>
          </ul>
          <panel-state
            v-else
            kind="empty"
            testid="model-empty"
            title="还没有数据模型"
            text="先在上方输入一个 id（如 m_employee）再点「新建」。模型建好后，可在页面菜单里按模型生成列表 / 表单 / 详情三页。"
            action-text="去输入 id"
            inline
            @action="focusNewId"
          />
        </section>
      </template>
    </template>

    <!-- 编辑视图 -->
    <template v-else>
      <header class="ws-head">
        <div class="ws-head__text">
          <h3 class="ws-title">
            模型 <code class="model-head__id">{{ store.editingModel.id }}</code>
            <span v-if="store.modelDirty" class="model-dirty" data-testid="model-dirty">未保存</span>
          </h3>
          <p class="ws-note">字段 key 与物理表列名一致；保存前会按与服务端同源的规则校验，错误就地列出。</p>
        </div>
        <div class="ws-actions">
          <button class="op-btn" type="button" data-testid="back-list" @click="store.closeModel()">
            ← 返回列表
          </button>
        </div>
      </header>

      <label class="setter">
        <span class="setter__label">名称</span>
        <input
          class="setter__input"
          type="text"
          :value="store.editingModel.name"
          placeholder="模型展示名"
          data-testid="model-name"
          @input="store.setModelProp({ name: val($event) })"
        />
      </label>
      <label class="setter">
        <span class="setter__label">物理表名</span>
        <input
          class="setter__input"
          type="text"
          :value="store.editingModel.code"
          placeholder="小写字母/数字/下划线"
          data-testid="model-code"
          @input="store.setModelProp({ code: val($event) })"
        />
        <span class="setter__help">小写字母/数字/下划线，字母开头</span>
      </label>

      <!-- 模型 → 页面 反向索引（模型即模块）：生成成组页面时自动写入，可一键打开 -->
      <div class="model-pages" data-testid="model-pages">
        <div class="model-fields__head"><span>默认页面</span></div>
        <div
          v-for="link in pageLinks"
          :key="link.key"
          class="model-pages__row"
        >
          <span class="model-pages__label">{{ link.label }}</span>
          <code class="model-pages__id">{{ link.id || '未生成' }}</code>
          <button
            v-if="link.id"
            class="model-pages__open"
            type="button"
            :data-testid="`open-${link.key}`"
            @click="openLinked(link.id)"
          >打开</button>
        </div>
        <span class="setter__help">
          「新建页面」按模型生成成组页面时自动回写；不是模型字段，删除页面时会一并清掉。
        </span>
      </div>

      <!-- 批 6 / 行级 + CRUD 权限（dataScope 下拉 + permissions 角色勾选） -->
      <div class="model-perms" data-testid="model-perms">
        <div class="model-fields__head"><span>数据权限</span></div>
        <label class="setter">
          <span class="setter__label">数据范围</span>
          <span class="setter__ctl">
            <select
              class="setter__select"
              data-testid="model-data-scope"
              :value="store.editingModel.dataScope ?? 'all'"
              @change="onDataScope($event)"
            >
              <option value="all">全部（all）</option>
              <option value="self">仅本人（self）</option>
              <option value="dept" disabled>本部门（dept）· 需组织服务</option>
              <option value="deptAndChild" disabled>本部门及下级 · 需组织服务</option>
            </select>
          </span>
          <span class="setter__help">self = 列表只返回本人创建的行；dept 系暂无组织服务，按 self 保守降级</span>
        </label>

        <div class="model-perms__row" v-for="act in PERM_ACTIONS" :key="act">
          <span class="model-perms__label">{{ PERM_LABELS[act] }}</span>
          <span class="model-perms__roles">
            <label
              v-for="r in store.rbacRoles"
              :key="r.key"
              class="model-perms__cell"
              :data-testid="`perm-${act}-${r.key}`"
            >
              <input
                type="checkbox"
                :checked="(store.editingModel.permissions?.[act] ?? []).includes(r.key)"
                :aria-label="`${PERM_LABELS[act]} 授予 ${r.key}`"
                @change="store.toggleModelPerm(act, r.key, ($event.target as HTMLInputElement).checked)"
              />
              {{ r.key }}
            </label>
            <span v-if="!store.rbacRoles.length" class="model-perms__empty">（先在「权限管理」建角色）</span>
          </span>
        </div>
        <p class="model-perms__help">勾选角色 = 允许该动作；全不勾 = 不限制（向后兼容）。</p>
      </div>

      <div class="model-fields__head">
        <span>字段（{{ store.editingModel.fields.length }}）</span>
        <button class="op-btn" type="button" data-testid="add-field" @click="onAddField">＋ 加字段</button>
      </div>

      <div
        v-for="(f, i) in store.editingModel.fields"
        :key="f.key"
        class="model-field"
        :data-testid="`field-${f.key}`"
      >
        <div class="model-field__row">
          <input
            class="setter__input model-field__key"
            type="text"
            :value="f.key"
            placeholder="key"
            :aria-label="`字段 ${f.key} 的 key`"
            @input="store.editModelField(f.key, { key: val($event) })"
          />
          <input
            class="setter__input model-field__name"
            type="text"
            :value="f.name"
            placeholder="展示名"
            :aria-label="`字段 ${f.key} 的展示名`"
            @input="store.editModelField(f.key, { name: val($event) })"
          />
        </div>
        <div class="model-field__row">
          <select
            class="setter__select model-field__type"
            :value="f.type"
            :aria-label="`字段 ${f.key} 的类型`"
            @change="store.editModelField(f.key, { type: val($event) as FieldType })"
          >
            <option v-for="t in FIELD_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
          <label class="model-field__req">
            <input
              type="checkbox"
              :checked="f.required === true"
              @change="store.editModelField(f.key, { required: ($event.target as HTMLInputElement).checked })"
            />
            必填
          </label>
          <button
            class="op-btn op-btn--icon"
            type="button"
            title="上移"
            :disabled="i === 0"
            @click="store.moveModelField(f.key, -1)"
          >↑</button>
          <button
            class="op-btn op-btn--icon"
            type="button"
            title="下移"
            :disabled="i === store.editingModel.fields.length - 1"
            @click="store.moveModelField(f.key, 1)"
          >↓</button>
          <button
            class="op-btn op-btn--danger op-btn--icon"
            type="button"
            title="删除字段"
            @click="store.removeModelField(f.key)"
          >✕</button>
        </div>
        <input
          v-if="f.type === 'enum'"
          class="setter__input model-field__opts"
          type="text"
          :value="formatOptions(f.options)"
          placeholder="选项：标签|值,标签|值"
          :aria-label="`字段 ${f.key} 的枚举选项`"
          @change="onOptions(f.key, $event)"
        />
      </div>

      <panel-state
        v-if="store.editingModel.fields.length === 0"
        kind="empty"
        testid="field-empty"
        title="还没有字段"
        text="用上方「＋ 加字段」逐条添加；字段 key 要与物理表列名一致。"
        inline
      />

      <div class="model-actions">
        <button
          class="op-btn op-btn--primary"
          :class="{ 'op-btn--loading': store.modelSaving }"
          type="button"
          data-testid="save-model"
          :disabled="store.modelSaving"
          @click="store.saveModel()"
        >{{ store.modelSaving ? '保存中…' : '保存模型' }}</button>
      </div>

      <ul v-if="store.modelErrors.length" class="model-errors" data-testid="model-errors">
        <li v-for="(e, i) in store.modelErrors" :key="i" class="panel-err">{{ e }}</li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FieldType } from '@lc/schema'
import { useDesignerStore } from '../store/store'
import { FIELD_TYPES, formatOptions, parseOptions } from '../core/model-ops'
import PanelState from '../components/PanelState.vue'

const store = useDesignerStore()
const newId = ref('')
/** 空态出口：把焦点送回新建输入框（不用额外弹窗，焦点即引导） */
const newIdRef = ref<HTMLInputElement | null>(null)

/** 模型记着的默认页（生成成组页面时回写；这里只读展示 + 一键打开） */
const pageLinks = computed(() => [
  { key: 'list', label: '列表页', id: store.editingModel?.listPageId ?? '' },
  { key: 'form', label: '表单页', id: store.editingModel?.formPageId ?? '' },
])

/** 打开模型关联的页面：先保住未保存的模型改动（切视图会重置编辑态） */
async function openLinked(id: string): Promise<void> {
  if (store.modelDirty && !(await store.saveModel())) return
  await store.switchView('page')
  await store.openPage(id)
}

function focusNewId(): void {
  newIdRef.value?.focus()
}

/** 错误态出口：强制重拉列表（绕过「已加载即跳过」的缓存） */
function onRetry(): void {
  void store.loadModels(true)
}

/* 批 6 / 行级 + CRUD 权限（dataScope + permissions） */
const PERM_ACTIONS = ['create', 'read', 'update', 'delete'] as const
type PermAction = (typeof PERM_ACTIONS)[number]
const PERM_LABELS: Record<PermAction, string> = {
  create: '新增',
  read: '查询',
  update: '更新',
  delete: '删除',
}

function onDataScope(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  store.setModelDataScope(v as 'all' | 'self')
}

function val(e: Event): string {
  return (e.target as HTMLInputElement).value
}

/** 新建：输入 id → 空白骨架进编辑器（建档由随后的保存完成，沿页面「新建即保存」同款流程） */
function onNew(): void {
  if (!newId.value.trim()) return
  store.newModel(newId.value)
  newId.value = ''
}

function onAddField(): void {
  store.addModelField()
}

/** enum 选项编辑串 → options（失焦提交；解析规则见 model-ops.parseOptions） */
function onOptions(key: string, e: Event): void {
  store.editModelField(key, { options: parseOptions(val(e)) })
}
</script>

<style scoped>
/* 令牌：../styles/tokens.css
   共用件（.panel-title / .setter* / .op-btn* / .panel-err / .lc-state*）在 ../styles/panel.css，
   本块只保留 ModelPanel 特有的布局类。 */
.model-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.model-item__name {
  flex-shrink: 0;
}

.model-item__id,
.model-head__id {
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.model-head__id {
  margin-left: var(--lc-space-1);
  padding: var(--lc-space-0-5) var(--lc-space-1-5);
  border-radius: var(--lc-radius-xs);
  background: var(--lc-bg-subtle);
  color: var(--lc-text-link);
}

.model-dirty {
  margin-left: var(--lc-space-2);
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-regular);
  color: var(--lc-status-warning);
}

.lc-model-panel .setter {
  margin-bottom: var(--lc-space-2-5);
}
.lc-model-panel .ws-head + .setter {
  margin-top: var(--lc-space-6);
}

.model-fields__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--lc-space-3);
  margin: var(--lc-space-6) 0 var(--lc-space-3);
  padding-bottom: var(--lc-space-2);
  font-size: var(--lc-font-h3);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.model-fields__head .op-btn {
  flex-shrink: 0;
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-regular);
}

.model-field {
  margin-bottom: 0;
  padding: var(--lc-space-3) 0;
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}

.model-field__row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
}

.model-field__row + .model-field__row {
  margin-top: var(--lc-space-1-5);
}

.model-field__key {
  flex: 0 0 96px;
}

.model-field__name {
  flex: 1;
}

.model-field__type {
  flex: 0 0 96px;
  width: auto;
}

.model-field__req {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}

.model-field__opts {
  margin-top: var(--lc-space-1-5);
}

.model-actions {
  display: flex;
  gap: var(--lc-space-2);
  margin-top: var(--lc-space-6);
}

.model-errors {
  margin: var(--lc-space-2-5) 0 0;
  padding: 0;
  list-style: none;
}

/* 本地改写：列表内错误块去掉自身上下外边距，间距交给列表控制 */
.model-errors .panel-err {
  margin: 0;
}

/* 数据权限（dataScope + permissions） */
.model-perms {
  margin: 0;
}
.model-perms__row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-1-5) 0;
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.model-perms__label {
  flex: 0 0 40px;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}
.model-perms__roles {
  display: flex;
  flex-wrap: wrap;
  gap: var(--lc-space-2);
}
.model-perms__cell {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}
.model-perms__empty,
.model-perms__help {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
.model-perms__help {
  margin: var(--lc-space-2) 0 0;
}

/* 默认页面（模型 → 页面反向索引） */
.model-pages {
  margin: 0;
}
.model-pages__row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-1-5) 0;
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.model-pages__label {
  flex: 0 0 40px;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}
.model-pages__id {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-secondary);
}
.model-pages__open {
  flex-shrink: 0;
  padding: var(--lc-space-1) var(--lc-space-1-5);
  font-family: inherit;
  font-size: var(--lc-font-caption);
  color: var(--lc-action-primary);
  background: none;
  border: 0;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
}
.model-pages__open:hover {
  background: var(--lc-bg-subtle);
}
.model-pages__open:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
</style>
