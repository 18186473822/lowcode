<!--
  RbacPanel.vue —— 权限管理视图（Phase 2 批 6 / D-P2-12）
  - 角色管理：列表 + 新建（key → 编辑态）+ 行编辑（name + perms 逗号分隔文本，门禁红字）；
  - 页面授权：全页面行 × 角色勾选矩阵（勾任意 = 仅这些可见；全取消 = 恢复全员可见）；
  - 所有编辑经 store（→ 服务端 RbacService 单一事实源）；错误不静默。
-->
<template>
  <div class="lc-rbac-panel">
    <h3 class="panel-title">权限管理</h3>

    <panel-state
      v-if="store.rbacError"
      kind="error"
      testid="rbac-error"
      :title="store.rbacError"
      text="角色与页面授权都没拉到，此时的矩阵不代表真实权限，请勿据此改配置。"
      action-text="重试"
      inline
      @action="onRetry"
    />
    <panel-state
      v-else-if="store.rbacLoading"
      kind="skeleton"
      testid="rbac-loading"
      :rows="4"
    />

    <!-- 角色编辑视图（与上方的错误 / 加载态互斥：错误 > 加载 > 内容） -->
    <template v-else-if="store.editingRole">
      <div class="rbac-role-edit">
        <h4 class="rbac-sub">
          角色 <code class="rbac-key">{{ store.editingRole.key }}</code>
        </h4>
        <label class="setter">
          <span class="setter__label">展示名</span>
          <input
            class="setter__input"
            type="text"
            :value="store.editingRole.name"
            placeholder="如 普通员工"
            data-testid="role-name"
            @input="store.setRoleProp({ name: val($event) })"
          />
        </label>
        <label class="setter">
          <span class="setter__label">权限点</span>
          <input
            class="setter__input"
            type="text"
            :value="store.editingRole.perms.join(', ')"
            placeholder="逗号分隔，如 emp_submit, emp_approve 或 *"
            data-testid="role-perms"
            @input="store.setRolePerms(val($event))"
          />
          <span class="setter__help">逗号分隔；* = 通配全部权限点</span>
        </label>
        <div class="rbac-actions">
          <button
            class="op-btn op-btn--primary"
            :class="{ 'op-btn--loading': store.rbacSaving }"
            type="button"
            data-testid="save-role"
            :disabled="store.rbacSaving"
            @click="store.saveRole()"
          >{{ store.rbacSaving ? '保存中…' : '保存角色' }}</button>
          <button class="op-btn" type="button" data-testid="back-roles" @click="store.closeRole()">
            返回
          </button>
        </div>
        <ul v-if="store.roleErrors.length" class="rbac-errors" data-testid="role-errors">
          <li v-for="(e, i) in store.roleErrors" :key="i" class="panel-err">{{ e }}</li>
        </ul>
      </div>
    </template>

    <!-- 角色列表 + 页面矩阵 -->
    <template v-else>
      <div class="rbac-new">
        <input
          ref="newKeyRef"
          v-model="newKey"
          class="setter__input"
          type="text"
          placeholder="新角色 key，如 employee"
          aria-label="新角色 key"
          data-testid="new-role-key"
          @keydown.enter="onNewRole"
        />
        <button class="op-btn op-btn--primary" type="button" data-testid="new-role" @click="onNewRole">
          新建角色
        </button>
      </div>

      <ul v-if="store.rbacRoles.length" class="rbac-roles" data-testid="role-list">
        <li v-for="r in store.rbacRoles" :key="r.key" class="rbac-role" :data-testid="`role-${r.key}`">
          <button class="rbac-role__open" type="button" :data-testid="`edit-role-${r.key}`" @click="store.editRole(r.key)">
            <strong class="rbac-role__name">{{ r.name || r.key }}</strong>
            <code class="rbac-key">{{ r.key }}</code>
            <span class="rbac-role__perms">{{ r.perms.join(', ') || '（无权限点）' }}</span>
          </button>
        </li>
      </ul>
      <panel-state
        v-else
        kind="empty"
        testid="role-empty"
        title="还没有角色"
        text="角色决定谁能看到哪些页面、能用哪些按钮。先在上方输入一个 key（如 employee）再点「新建角色」。"
        action-text="去输入 key"
        inline
        @action="focusNewKey"
      />

      <!-- 页面授权矩阵 -->
      <h4 class="rbac-sub">页面可见性</h4>
      <p class="rbac-hint">勾选角色 = 仅这些角色可见该页；全部取消 = 恢复全员可见。</p>
      <div v-if="store.rbacPages.length" class="rbac-matrix" data-testid="page-matrix">
        <div v-for="p in store.rbacPages" :key="p.id" class="rbac-matrix__row" :data-testid="`page-${p.id}`">
          <span class="rbac-matrix__name" :title="p.id">{{ p.name || p.id }}</span>
          <span class="rbac-matrix__roles">
            <label
              v-for="r in store.rbacRoles"
              :key="r.key"
              class="rbac-matrix__cell"
              :data-testid="`cell-${p.id}-${r.key}`"
            >
              <input
                type="checkbox"
                :checked="(store.pageAuth[p.id] ?? []).includes(r.key)"
                :aria-label="`${p.name || p.id} 对 ${r.key} 可见`"
                @change="store.togglePageRole(p.id, r.key, ($event.target as HTMLInputElement).checked)"
              />
              {{ r.key }}
            </label>
          </span>
        </div>
      </div>
      <panel-state
        v-else
        kind="empty"
        testid="page-empty"
        title="还没有可授权的页面"
        text="先回到画布视图创建并保存至少一个页面，这里才会出现授权矩阵。"
        inline
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDesignerStore } from '../store/store'
import PanelState from '../components/PanelState.vue'

const store = useDesignerStore()
const newKey = ref('')
/** 空态出口：把焦点送回新建输入框（焦点即引导，不额外弹窗） */
const newKeyRef = ref<HTMLInputElement | null>(null)

function focusNewKey(): void {
  newKeyRef.value?.focus()
}

/** 错误态出口：重拉 RBAC 配置（角色 + 页面授权 + 矩阵） */
function onRetry(): void {
  void store.loadRbac()
}

function val(e: Event): string {
  return (e.target as HTMLInputElement).value
}

/** 新建角色：输入 key → 进编辑态（落库由随后的保存完成，沿模型面板同款流程） */
function onNewRole(): void {
  if (!newKey.value.trim()) return
  store.newRole(newKey.value)
  newKey.value = ''
}
</script>

<style scoped>
/* 令牌：../styles/tokens.css
   共用件（.panel-title / .setter* / .op-btn* / .panel-err / .lc-state*）在 ../styles/panel.css，
   本块只保留 RbacPanel 特有的布局类。 */
.rbac-sub {
  margin: 18px 0 var(--lc-space-2);
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-label);
}
.rbac-hint {
  margin: 0 0 var(--lc-space-2);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
  line-height: var(--lc-leading-readable);
}
.rbac-new {
  display: flex;
  gap: var(--lc-space-2);
  margin-bottom: var(--lc-space-3);
}
.rbac-roles {
  margin: 0;
  padding: 0;
  list-style: none;
}
.rbac-role + .rbac-role {
  margin-top: var(--lc-space-1-5);
}
.rbac-role__open {
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
.rbac-role__open:hover {
  border-color: var(--lc-action-primary);
}
.rbac-role__name {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-primary);
}
.rbac-key {
  padding: 1px var(--lc-space-1-5);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  border-radius: var(--lc-radius-xs);
  background: var(--lc-bg-subtle);
  color: var(--lc-text-link);
}
.rbac-role__perms {
  margin-left: auto;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
}
.rbac-matrix {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1-5);
}
.rbac-matrix__row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-1-5) var(--lc-space-2);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
}
.rbac-matrix__name {
  flex: 0 0 40%;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rbac-matrix__roles {
  display: flex;
  flex-wrap: wrap;
  gap: var(--lc-space-2);
}
.rbac-matrix__cell {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}
.rbac-actions {
  display: flex;
  gap: var(--lc-space-2);
  margin-top: var(--lc-space-3);
}
.rbac-errors {
  margin: var(--lc-space-2-5) 0 0;
  padding: 0;
  list-style: none;
}
.rbac-errors .panel-err + .panel-err {
  margin-top: var(--lc-space-1-5);
}
.rbac-role-edit .setter {
  display: grid;
  margin-bottom: var(--lc-space-2-5);
}
</style>
