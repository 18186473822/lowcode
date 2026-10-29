<!--
  PortalPanel.vue —— 移动门户清单（2026-10-28）

  对应云程「门户设计 → 移动门户」：一个门户 = 一张 `type=portal` 的页面，
  清单里管名称 / 编码 / 类型 / 排序 / 备注，操作列进在线设计器。

  设计口径：
  - **系统内置页**（应用入口 / 我的待办）由运行体内置路由提供，不占页面表，
    因此只在清单里展示、不可编辑删除（截图里可编辑是另一套内置页实现，我们没有）。
  - 排序 / 备注写在 `schema.portal.order` / `portal.remark`，不新增服务端字段；
    清单加载时逐页读 schema（门户页通常个位数）。
  - 新增 = 建 `portal` 空骨架并直接落盘；编码已存在时**拒绝**（saveSchema 是 upsert）。
  - 编辑走 If-Match（getSchema 拿 revision），409 只提示、不自动覆盖。
-->
<template>
  <div class="lc-portal-panel" data-testid="portal-panel">
    <header class="portal-head">
      <div class="portal-head__text">
        <h3 class="panel-title">移动门户</h3>
        <p class="portal-head__note">
          一个门户 = 一张 <code>portal</code> 页；卡片在「页面设计」右侧属性面板配置，
          运行时按手机壳效果渲染。
        </p>
      </div>
      <button class="op-btn op-btn--primary" type="button" data-testid="portal-new" @click="openCreate">
        ＋ 新增
      </button>
    </header>

    <!-- 查询：点「查询」才应用，重置清空草稿与条件 -->
    <div class="portal-filter" role="group" aria-label="门户查询">
      <label class="portal-filter__field">
        <span class="portal-filter__label">页面名称</span>
        <input
          v-model="q.name"
          class="setter__input"
          type="text"
          placeholder="模糊匹配"
          data-testid="portal-q-name"
          @keydown.enter="applyQuery"
        />
      </label>
      <label class="portal-filter__field">
        <span class="portal-filter__label">页面编码</span>
        <input
          v-model="q.id"
          class="setter__input"
          type="text"
          spellcheck="false"
          placeholder="如 default_home"
          data-testid="portal-q-id"
          @keydown.enter="applyQuery"
        />
      </label>
      <div class="portal-filter__actions">
        <button class="op-btn op-btn--primary" type="button" data-testid="portal-search" @click="applyQuery">
          查询
        </button>
        <button class="op-btn" type="button" data-testid="portal-reset" @click="resetQuery">重置</button>
      </div>
    </div>

    <div class="portal-toolbar">
      <button
        class="op-btn op-btn--danger"
        type="button"
        data-testid="portal-delete"
        :disabled="!selectedIds.length || deleting"
        :title="selectedIds.length ? `删除选中的 ${selectedIds.length} 个门户页` : '先勾选要删除的门户页'"
        @click="removeSelected"
      >{{ deleteArmed ? `确认删除 ${selectedIds.length} 个？` : '删除' }}</button>
      <span class="portal-toolbar__hint">勾选后删除（含历史版本，不可恢复）；系统内置页不可删。</span>
      <button
        class="op-btn portal-toolbar__refresh"
        type="button"
        data-testid="portal-refresh"
        @click="reload"
      >刷新</button>
    </div>

    <!-- 下钻失败提示独立于下面的加载/表格分支：不能插进 v-if/v-else-if/v-else 链中间 -->
    <p v-if="designError" class="panel-err portal-design-err" data-testid="portal-design-error">{{ designError }}</p>
    <p v-if="pendingSwitchTo" class="portal-hint portal-dirty-hint" data-testid="portal-dirty-hint">
      当前页有未保存的修改：再点一次「页面设计」会丢弃这些修改。
    </p>

    <p v-if="store.portalError" class="panel-err" data-testid="portal-error">{{ store.portalError }}</p>
    <p v-else-if="store.portalLoading" class="portal-hint" data-testid="portal-loading">加载中…</p>

    <div v-else class="portal-table-wrap">
      <table class="portal-table" data-testid="portal-table">
        <thead>
          <tr>
            <th class="portal-col-check">
              <input
                type="checkbox"
                :checked="allDesignSelected"
                :disabled="!designRows.length"
                aria-label="全选在线设计页"
                data-testid="portal-check-all"
                @change="toggleAll"
              />
            </th>
            <th class="portal-col-idx">序号</th>
            <th>页面名称</th>
            <th>页面编码</th>
            <th class="portal-col-type">页面类型</th>
            <th class="portal-col-order">排序</th>
            <th>备注</th>
            <th class="portal-col-ops">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in pagedRows" :key="row.key">
            <!-- 系统内置：运行体路由，不占页面表 -->
            <tr v-if="row.kind === 'builtin'" class="portal-row portal-row--builtin">
              <td class="portal-col-check">
                <input type="checkbox" disabled aria-label="系统内置页不可选" />
              </td>
              <td class="portal-col-idx">{{ row.idx }}</td>
              <td><span class="portal-name">{{ row.name }}</span></td>
              <td><code class="portal-id">{{ row.id }}</code></td>
              <td class="portal-col-type">
                <span class="portal-badge portal-badge--builtin">系统内置</span>
              </td>
              <td class="portal-col-order portal-muted">—</td>
              <td class="portal-muted">{{ row.note }}</td>
              <td class="portal-col-ops portal-muted" title="由运行体内置路由提供，不占页面表，故不可编辑 / 删除">
                —
              </td>
            </tr>

            <!-- 在线设计：page 表里 type=portal 的行 -->
            <tr v-else class="portal-row" :data-testid="`portal-row-${row.page.id}`">
              <td class="portal-col-check">
                <input
                  type="checkbox"
                  :checked="selected.has(row.page.id)"
                  :aria-label="`选择 ${row.page.name}`"
                  :data-testid="`portal-check-${row.page.id}`"
                  @change="toggleOne(row.page.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="portal-col-idx">{{ row.idx }}</td>
              <td><span class="portal-name">{{ row.page.name }}</span></td>
              <td><code class="portal-id">{{ row.page.id }}</code></td>
              <td class="portal-col-type">
                <span class="portal-badge portal-badge--design">在线设计</span>
              </td>
              <td class="portal-col-order">{{ row.page.order ?? '—' }}</td>
              <td class="portal-remark" :title="row.page.remark">{{ row.page.remark || '—' }}</td>
              <td class="portal-col-ops">
                <button
                  class="portal-link"
                  type="button"
                  :data-testid="`portal-design-${row.page.id}`"
                  @click="design(row.page.id)"
                >页面设计</button>
                <button
                  class="portal-link"
                  type="button"
                  :data-testid="`portal-edit-${row.page.id}`"
                  @click="openEdit(row.page)"
                >编辑</button>
                <button
                  class="portal-link portal-link--danger"
                  type="button"
                  :data-testid="`portal-remove-${row.page.id}`"
                  @click="removeOne(row.page.id)"
                >删除</button>
              </td>
            </tr>
          </template>

          <tr v-if="!total">
            <td class="portal-empty" colspan="8" data-testid="portal-empty">
              没有匹配的门户页。点右上角「＋ 新增」创建第一个门户。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页：共 N 条 · 每页条数 · 上一页 / 页码 / 下一页 · 跳页 -->
    <div class="portal-pager" data-testid="portal-pager">
      <span class="portal-pager__total">共 <strong>{{ total }}</strong> 条</span>
      <select v-model.number="pageSize" class="portal-pager__size" aria-label="每页条数">
        <option :value="10">10 条/页</option>
        <option :value="20">20 条/页</option>
        <option :value="50">50 条/页</option>
      </select>
      <button class="portal-pager__btn" type="button" :disabled="page <= 1" @click="page--">上一页</button>
      <span class="portal-pager__now">{{ page }} / {{ pageCount }}</span>
      <button class="portal-pager__btn" type="button" :disabled="page >= pageCount" @click="page++">下一页</button>
      <label class="portal-pager__jump">
        前往
        <input
          v-model.number="jumpTo"
          class="portal-pager__input"
          type="number"
          min="1"
          :max="pageCount"
          aria-label="跳转页码"
          @keydown.enter="goTo"
        />
        页
      </label>
    </div>

    <!-- 新增 / 编辑：同一套字段，编码新增后不可改（改编码 = 换页面） -->
    <div v-if="form.open" class="portal-mask" @click.self="closeForm">
      <div
        class="portal-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="form.editing ? '编辑门户页' : '新增门户页'"
      >
        <div class="portal-dialog__head">
          <strong>{{ form.editing ? '编辑门户页' : '新增门户页' }}</strong>
          <button class="portal-dialog__close" type="button" aria-label="关闭" @click="closeForm">×</button>
        </div>
        <div class="portal-dialog__body">
          <label class="setter">
            <span class="setter__label">页面编码</span>
            <input
              v-model="form.id"
              class="setter__input portal-mono"
              type="text"
              spellcheck="false"
              :disabled="form.editing"
              placeholder="如 default_home"
              data-testid="portal-form-id"
            />
            <span class="setter__help">
              {{ form.editing ? '编码是页面主键，创建后不可改；要换编码请另建页面' : '字母或下划线开头，最长 64 位；同时作为运行时 pageId' }}
            </span>
          </label>
          <label class="setter">
            <span class="setter__label">页面名称</span>
            <input
              v-model="form.name"
              class="setter__input"
              type="text"
              placeholder="如 门户首页（留空 = 用编码）"
              data-testid="portal-form-name"
            />
          </label>
          <label class="setter">
            <span class="setter__label">排序</span>
            <input
              v-model="form.order"
              class="setter__input"
              type="number"
              step="1"
              placeholder="小的在前；留空 = 排在最后"
              data-testid="portal-form-order"
            />
          </label>
          <label class="setter">
            <span class="setter__label">备注</span>
            <input
              v-model="form.remark"
              class="setter__input"
              type="text"
              placeholder="运营说明，运行时不展示"
              data-testid="portal-form-remark"
            />
          </label>

          <p v-if="form.error" class="panel-err" data-testid="portal-form-error">{{ form.error }}</p>
        </div>
        <div class="portal-dialog__foot">
          <button class="op-btn" type="button" @click="closeForm">取消</button>
          <button
            class="op-btn op-btn--primary"
            type="button"
            data-testid="portal-form-submit"
            :disabled="form.saving"
            @click="submitForm"
          >{{ form.saving ? '保存中…' : form.editing ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useDesignerStore, type PortalListItem } from '../store/store'

const store = useDesignerStore()

/** 运行体内置页：与页面表无关，只做清单展示（不可编辑 / 删除） */
const BUILTINS = [
  { id: 'default_apps', name: '应用入口', note: '运行时首页（应用入口）' },
  { id: 'default_todo', name: '我的待办', note: '运行时待办页（/todo）' },
] as const

/** 查询草稿（点「查询」才写进 applied） */
const q = reactive({ name: '', id: '' })
const applied = reactive({ name: '', id: '' })

const page = ref(1)
const pageSize = ref(10)
const jumpTo = ref(1)
const selected = ref<Set<string>>(new Set())
const deleteArmed = ref(false)
const deleting = ref(false)
/** 下钻失败（openPage 报错）：留在清单就地提示，不带着旧内容进画布 */
const designError = ref('')
/** 脏态换页的「上膛」目标：等于某个 pageId 时，再点一次才真的丢弃并打开 */
const pendingSwitchTo = ref('')
let disarmTimer: ReturnType<typeof setTimeout> | undefined

function match(name: string, id: string): boolean {
  const n = applied.name.trim().toLowerCase()
  const i = applied.id.trim().toLowerCase()
  if (n && !name.toLowerCase().includes(n)) return false
  if (i && !id.toLowerCase().includes(i)) return false
  return true
}

interface BuiltinRow {
  kind: 'builtin'
  key: string
  id: string
  name: string
  note: string
  idx: number
}
interface DesignRow {
  kind: 'design'
  key: string
  page: PortalListItem
  idx: number
}

/** 在线设计页：store 已按 order 排好，这里只做过滤 */
const designRows = computed(() =>
  store.portalPages.filter((p) => p.type === 'portal' && match(p.name, p.id)),
)

/**
 * 系统内置行固定排最前（与云程截图一致），再拼在线设计页；
 * 分页按**合并后的行序**切，避免内置行在每页重复出现。
 */
const allRows = computed<Array<BuiltinRow | DesignRow>>(() => {
  const builtin = BUILTINS.filter((b) => match(b.name, b.id)).map<BuiltinRow>((b, i) => ({
    kind: 'builtin',
    key: `builtin:${b.id}`,
    id: b.id,
    name: b.name,
    note: b.note,
    idx: i + 1,
  }))
  const design = designRows.value.map<DesignRow>((p, i) => ({
    kind: 'design',
    key: `page:${p.id}`,
    page: p,
    idx: builtin.length + i + 1,
  }))
  return [...builtin, ...design]
})

const total = computed(() => allRows.value.length)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pagedRows = computed(() =>
  allRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
)

const allDesignSelected = computed(
  () => designRows.value.length > 0 && designRows.value.every((p) => selected.value.has(p.id)),
)
const selectedIds = computed(() => [...selected.value])

watch([total, pageSize], () => {
  if (page.value > pageCount.value) page.value = pageCount.value
  jumpTo.value = page.value
})
watch(page, (v) => {
  jumpTo.value = v
})
// 勾选集合只保留仍存在的行（删除 / 刷新后不残留）
watch(
  () => store.portalPages.map((p) => p.id).join(','),
  () => {
    const alive = new Set(store.portalPages.map((p) => p.id))
    selected.value = new Set([...selected.value].filter((id) => alive.has(id)))
  },
)

function applyQuery(): void {
  applied.name = q.name
  applied.id = q.id
  page.value = 1
}
function resetQuery(): void {
  q.name = ''
  q.id = ''
  applyQuery()
}
async function reload(): Promise<void> {
  pendingSwitchTo.value = ''
  designError.value = ''
  await store.loadPortalPages()
  page.value = 1
}

function toggleOne(id: string, on: boolean): void {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
  deleteArmed.value = false
}
function toggleAll(e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  selected.value = on ? new Set(designRows.value.map((p) => p.id)) : new Set()
  deleteArmed.value = false
}

/** 两步删除：第一次只「上膛」，5 秒不点自动复位 */
function armDelete(): void {
  deleteArmed.value = true
  clearTimeout(disarmTimer)
  disarmTimer = setTimeout(() => (deleteArmed.value = false), 5000)
}

async function removeOne(id: string): Promise<void> {
  // 单行删除也走两步：第一次点只是选中，再点才删
  if (!selected.value.has(id)) {
    selected.value = new Set([id])
    armDelete()
    return
  }
  if (!deleteArmed.value) {
    armDelete()
    return
  }
  await doDelete([id])
}

async function removeSelected(): Promise<void> {
  if (!selectedIds.value.length) return
  if (!deleteArmed.value) {
    armDelete()
    return
  }
  await doDelete(selectedIds.value)
}

async function doDelete(ids: string[]): Promise<void> {
  deleting.value = true
  deleteArmed.value = false
  clearTimeout(disarmTimer)
  try {
    for (const id of ids) {
      const ok = await store.deletePage(id)
      if (!ok) break
    }
    selected.value = new Set()
    await store.loadPortalPages()
  } finally {
    deleting.value = false
  }
}

/**
 * 页面设计（下钻到画布）：**先取 schema 成功，再切视图**。
 *
 * 旧实现是 `switchView('page')` → `openPage(id)`，有两个坑：
 * 1. 切视图那一刻画布用的还是上一次的 schema —— 慢网下先闪一帧旧页面 / 空画布；
 * 2. openPage 失败（页被别处删掉 / 网络错）时用户已经停在画布，`pageLoaded` 仍为 true，
 *    点「保存」会把旧内容写进新 pageId —— 跨页数据污染，且界面上看不出来。
 *
 * 另：换页会整体替换 schema，脏态下必须确认，否则未保存的修改被静默丢弃。
 */
async function design(id: string): Promise<void> {
  designError.value = ''
  // 回到「上次编辑的那一页」= 继续编辑：保留内存里未保存的 schema，不重新拉服务端覆盖
  if (id === store.pageId && store.pageLoaded) {
    pendingSwitchTo.value = ''
    await store.switchView('page')
    return
  }
  // 换页会整体替换 schema，脏态下先「上膛」、第二次点击才真丢。
  // 注意必须连 pageLoaded 一起判：`saveState` 的初始值就是 `dirty`（还没有页面可保存），
  // 只看它会在一进门户、还没打开过任何页时误弹确认。
  if (store.pageLoaded && store.saveState === 'dirty' && pendingSwitchTo.value !== id) {
    pendingSwitchTo.value = id
    return
  }
  pendingSwitchTo.value = ''
  const opened = await store.openPage(id)
  if (!opened) {
    // 失败留在清单：进画布只会让人对着旧内容继续编辑
    designError.value = store.statusText || `打开页面失败：${id}`
    return
  }
  await store.switchView('page')
}

/* ---------------- 新增 / 编辑弹层 ---------------- */

const form = reactive({
  open: false,
  editing: false,
  id: '',
  name: '',
  /** number 型 input 的 v-model 会自动转数字，故两种类型都收 */
  order: '' as string | number,
  remark: '',
  error: '',
  saving: false,
})

function openCreate(): void {
  Object.assign(form, {
    open: true,
    editing: false,
    id: '',
    name: '',
    order: '',
    remark: '',
    error: '',
    saving: false,
  })
}

function openEdit(p: PortalListItem): void {
  Object.assign(form, {
    open: true,
    editing: true,
    id: p.id,
    name: p.name,
    order: p.order === undefined ? '' : String(p.order),
    remark: p.remark ?? '',
    error: '',
    saving: false,
  })
}

function closeForm(): void {
  form.open = false
  form.saving = false
}

/** 空 = 不设置；非数字 = 报错（不静默变成 0）。注意 number 型 input 的 v-model 会自动转 number，两种都要收 */
function parseOrder(raw: string | number): { ok: true; value: number | undefined } | { ok: false } {
  const s = String(raw).trim()
  if (!s) return { ok: true, value: undefined }
  const n = Number(s)
  if (!Number.isFinite(n)) return { ok: false }
  return { ok: true, value: Math.trunc(n) }
}

async function submitForm(): Promise<void> {
  if (form.saving) return
  form.error = ''
  const order = parseOrder(form.order)
  if (!order.ok) {
    form.error = '排序必须是数字'
    return
  }
  form.saving = true
  try {
    const ok = form.editing
      ? await store.updatePortalMeta(form.id, {
          name: form.name,
          order: order.value === undefined ? null : order.value,
          remark: form.remark.trim() || null,
        })
      : await store.createPortalPage({
          id: form.id,
          name: form.name,
          order: order.value,
          remark: form.remark,
        })
    if (!ok) {
      form.error = store.statusText || '保存失败'
      return
    }
    form.open = false
    page.value = 1
  } finally {
    form.saving = false
  }
}

function goTo(): void {
  const n = Math.trunc(Number(jumpTo.value))
  page.value = Number.isFinite(n) ? Math.min(pageCount.value, Math.max(1, n)) : 1
}
</script>

<style scoped>
.lc-portal-panel {
  max-width: 1080px;
}

.portal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--lc-space-3);
}
.portal-head__text {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
}
.portal-head__note {
  margin: 0;
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-tertiary);
}
.portal-head__note code {
  font-family: var(--lc-font-mono);
  color: var(--lc-text-secondary);
}

/* 查询区：输入框 + 查询 / 重置 */
.portal-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--lc-space-3);
  margin-top: var(--lc-space-3);
  padding: var(--lc-space-3);
  background: var(--lc-bg-subtle);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
}
.portal-filter__field {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  flex: 1 1 260px;
}
.portal-filter__label {
  flex-shrink: 0;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}
.portal-filter__actions {
  display: flex;
  gap: var(--lc-space-2);
  margin-left: auto;
}

.portal-toolbar {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  margin-top: var(--lc-space-3);
}
.portal-toolbar__hint {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.portal-toolbar__refresh {
  margin-left: auto;
}

.portal-hint {
  margin: var(--lc-space-3) 0 0;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
.portal-design-err {
  margin: var(--lc-space-2) 0 0;
}
.portal-dirty-hint {
  margin: var(--lc-space-2) 0 0;
  color: var(--lc-text-danger);
}

.portal-table-wrap {
  margin-top: var(--lc-space-2);
  overflow-x: auto;
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
}
.portal-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--lc-font-caption);
}
.portal-table th,
.portal-table td {
  padding: var(--lc-space-2) var(--lc-space-3);
  text-align: left;
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-table th {
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-label);
  background: var(--lc-bg-subtle);
  white-space: nowrap;
}
.portal-table tbody tr:last-child td {
  border-bottom: 0;
}
.portal-row:hover {
  background: var(--lc-bg-subtle);
}
.portal-col-check {
  width: 40px;
}
.portal-col-idx {
  width: 56px;
  color: var(--lc-text-tertiary);
}
.portal-col-type {
  width: 108px;
}
.portal-col-order {
  width: 72px;
}
.portal-col-ops {
  width: 200px;
  white-space: nowrap;
}
.portal-name {
  color: var(--lc-text-primary);
}
.portal-id {
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-secondary);
}
.portal-remark {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--lc-text-secondary);
}
.portal-muted {
  color: var(--lc-text-tertiary);
}
.portal-empty {
  padding: var(--lc-space-6) var(--lc-space-3);
  text-align: center;
  color: var(--lc-text-tertiary);
}

.portal-badge {
  display: inline-block;
  padding: 0 var(--lc-space-1-5);
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-label);
  border-radius: var(--lc-radius-xs);
}
.portal-badge--builtin {
  color: var(--lc-text-label);
  background: var(--lc-status-warning-bg);
}
.portal-badge--design {
  color: var(--lc-action-primary);
  background: var(--lc-status-info-bg);
}

.portal-link {
  padding: 0 var(--lc-space-1);
  font-family: inherit;
  font-size: var(--lc-font-micro);
  color: var(--lc-action-primary);
  background: none;
  border: 0;
  cursor: pointer;
}
.portal-link:hover {
  text-decoration: underline;
}
.portal-link--danger {
  color: var(--lc-text-danger);
}
.portal-link:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}

.portal-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--lc-space-2);
  margin-top: var(--lc-space-3);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.portal-pager__total strong {
  color: var(--lc-text-primary);
}
.portal-pager__size,
.portal-pager__input {
  padding: var(--lc-space-0-5) var(--lc-space-1);
  font-family: inherit;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  background: var(--lc-bg-surface);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-xs);
}
.portal-pager__input {
  width: 56px;
}
.portal-pager__btn {
  padding: var(--lc-space-0-5) var(--lc-space-2);
  font-family: inherit;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
  background: var(--lc-bg-surface);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
}
.portal-pager__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.portal-pager__now {
  font-family: var(--lc-font-mono);
  color: var(--lc-text-primary);
}
.portal-pager__jump {
  display: inline-flex;
  align-items: center;
  gap: var(--lc-space-1);
}

/* 弹层 */
.portal-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--lc-space-4);
  background: var(--lc-overlay-scrim);
}
.portal-dialog {
  display: flex;
  flex-direction: column;
  width: 460px;
  max-width: calc(100vw - var(--lc-space-8));
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-lg);
  box-shadow: var(--lc-shadow-e4);
}
.portal-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--lc-space-3) var(--lc-space-4);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-dialog__close {
  padding: 0 var(--lc-space-2);
  font-size: var(--lc-font-body);
  color: var(--lc-text-secondary);
  background: none;
  border: 0;
  cursor: pointer;
}
.portal-dialog__body {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-3);
  padding: var(--lc-space-4);
}
.portal-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--lc-space-2);
  padding: var(--lc-space-3) var(--lc-space-4);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-mono {
  font-family: var(--lc-font-mono);
}
</style>
