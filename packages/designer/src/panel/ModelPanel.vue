<!--
  ModelPanel.vue —— 数据模型管理视图（Phase 2 批 1 / D-P2-1）
  - 列表视图：GET /models 摘要 + 新建（输入 id → 空白骨架进编辑器）；
  - 编辑视图：模型 name/code + 字段表格（行增删/上下移/key·展示名·type·required·enum options）；
  - 所有编辑经 store → core/model-ops 纯函数（视图只发意图，沿 D-A3 纪律）；
  - 保存门禁 = model-ops.modelErrors（协议 validateModel 同源 + id 格式），errors 可见不静默。
-->
<template>
  <div class="lc-model-panel">
    <!-- 列表视图（未选中编辑对象） -->
    <template v-if="!store.editingModel">
      <h3 class="panel-title">数据模型</h3>
      <div class="model-new">
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
      <ul v-else-if="store.models.length" class="model-list" data-testid="model-list">
        <li v-for="m in store.models" :key="m.id" class="model-item">
          <button class="model-item__open" type="button" :data-testid="`open-model-${m.id}`" @click="store.openModel(m.id)">
            <strong class="model-item__name">{{ m.name || m.id }}</strong>
            <code class="model-item__id">{{ m.id }}</code>
            <span class="model-item__meta">{{ m.fieldCount ?? '?' }} 字段</span>
          </button>
        </li>
      </ul>
      <panel-state
        v-else
        kind="empty"
        testid="model-empty"
        title="还没有数据模型"
        text="数据模型是表单页与列表页的数据源。先在上方输入一个 id（如 m_employee）再点「新建」。"
        action-text="去输入 id"
        inline
        @action="focusNewId"
      />
    </template>

    <!-- 编辑视图 -->
    <template v-else>
      <h3 class="panel-title">
        模型 <code class="model-head__id">{{ store.editingModel.id }}</code>
        <span v-if="store.modelDirty" class="model-dirty" data-testid="model-dirty">未保存</span>
      </h3>

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
        <button class="op-btn" type="button" data-testid="back-list" @click="store.closeModel()">
          返回列表
        </button>
      </div>

      <ul v-if="store.modelErrors.length" class="model-errors" data-testid="model-errors">
        <li v-for="(e, i) in store.modelErrors" :key="i" class="panel-err">{{ e }}</li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FieldType } from '@lc/schema'
import { useDesignerStore } from '../store/store'
import { FIELD_TYPES, formatOptions, parseOptions } from '../core/model-ops'
import PanelState from '../components/PanelState.vue'

const store = useDesignerStore()
const newId = ref('')
/** 空态出口：把焦点送回新建输入框（不用额外弹窗，焦点即引导） */
const newIdRef = ref<HTMLInputElement | null>(null)

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
.model-new {
  display: flex;
  gap: var(--lc-space-2);
  margin-bottom: var(--lc-space-3);
}

.model-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.model-item + .model-item {
  margin-top: var(--lc-space-1-5);
}

.model-item__open {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  width: 100%;
  padding: var(--lc-space-2) var(--lc-space-2-5);
  text-align: left;
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
  cursor: pointer;
  transition: border-color var(--lc-duration-fast) var(--lc-ease-standard);
}

.model-item__open:hover {
  border-color: var(--lc-action-primary);
}

.model-item__name {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-primary);
}

.model-item__id,
.model-head__id {
  padding: 1px var(--lc-space-1-5);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  border-radius: var(--lc-radius-xs);
  background: var(--lc-bg-subtle);
  color: var(--lc-text-link);
}

.model-item__meta {
  margin-left: auto;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}

.model-dirty {
  margin-left: var(--lc-space-2);
  padding: 1px var(--lc-space-1-5);
  font-size: var(--lc-font-caption);
  border-radius: var(--lc-radius-xs);
  background: var(--lc-status-warning-bg);
  color: var(--lc-status-warning);
}

.model-fields__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 var(--lc-space-2);
  padding-top: var(--lc-space-2-5);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
  border-top: var(--lc-border-width) var(--lc-border-dashed) var(--lc-border-default);
}

.model-field {
  margin-bottom: var(--lc-space-2-5);
  padding: var(--lc-space-2);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-subtle);
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
  margin-top: 14px;
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
  margin: 14px 0;
  padding: var(--lc-space-2-5);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
  background: var(--lc-bg-subtle);
}
.model-perms__row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  margin-top: var(--lc-space-1-5);
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
</style>
