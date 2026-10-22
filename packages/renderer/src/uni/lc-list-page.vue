<!--
  lc-list-page.vue —— type=list 标准列表页（Phase 2 批 2）

  - 配置驱动（schema.list：modelId / columns / sort / pagination.size / search / detailPageId），
    不走 NodeSchema 树（协议 list 页的 root 仅作设计器占位，运行时忽略）。
  - 数据经 options.host.request 直连 records 查询（filter/sort/page 服务端契约），
    分页「加载更多」追加；搜索为前端 contains 过滤（服务端 filter 仅等值，批 2 不做表达式过滤）。
  - 点行 → emit('navigate', {pageId: detailPageId, params: {rid}})，壳层（runtime view）接线跳转 ——
    renderer 不依赖 uni API（沿 D-A2 分层：跨端能力只经 host / 事件上抛）。
  - Phase 4 写操作：list.editable 展开行内编辑器（只编辑展示列），list.deletable 勾选批量删除；
    每个写请求都携带该行 revision 构造的 If-Match，409 不覆盖他人修改。
  - 错误不静默：records 失败红字 + 重试；模型定义失败降级（列展示名回退 key）。
-->
<template>
  <view class="lc-list-page">
    <!-- 搜索（search.fields 批 2 不区分字段：对可见列做包含过滤） -->
    <view v-if="cfg?.search" class="lc-list-page__search">
      <input
        v-model="keyword"
        class="lc-list-page__input"
        type="text"
        :placeholder="cfg.search.placeholder ?? '搜索'"
        confirm-type="search"
      />
    </view>

    <!-- Phase 4：批量选择与删除（只对当前可见行全选；搜索时清理不可见行的选择） -->
    <view
      v-if="cfg?.deletable && rows.length > 0"
      class="lc-list-page__batch"
      data-testid="list-batch-bar"
    >
      <button
        class="lc-list-page__batch-btn"
        size="mini"
        data-testid="list-select-all"
        @tap.stop="toggleSelectAll"
      >
        {{ allVisibleSelected ? '取消全选' : '全选' }}
      </button>
      <text class="lc-list-page__batch-count">已选 {{ selectedCount }} 条</text>
      <button
        class="lc-list-page__batch-delete"
        size="mini"
        :loading="batchDeleting"
        :disabled="batchDeleting || selectedCount === 0"
        data-testid="list-batch-delete"
        @tap.stop="batchDelete"
      >
        批量删除
      </button>
    </view>

    <!-- 行操作/加载失败：就地提示，不把已加载数据整页打掉 -->
    <view v-if="opError" class="lc-list-page__inline-err" data-testid="list-op-error">
      <text class="lc-list-page__inline-err-text">{{ opError }}</text>
      <button class="lc-list-page__retry" size="mini" @tap.stop="opError = ''">关闭</button>
    </view>

    <!-- 加载中（首屏）→ 骨架屏；已有数据时的翻页加载由「加载更多」按钮自身承载 -->
    <lc-state-view
      v-if="loading && rows.length === 0"
      kind="loading"
      testid="list-loading"
    />

    <!-- 异常（§5 分类）：401 / 403 / 网络 / 其他 —— 每种都带出口 -->
    <lc-state-view
      v-else-if="state && rows.length === 0"
      :kind="state.kind"
      :title="state.title"
      :text="state.text"
      :action-text="state.actionText"
      :testid="`list-${state.kind}`"
      @action="onStateAction"
    />

    <!-- 空态：给出口，不只写「暂无数据」 -->
    <lc-state-view
      v-else-if="!state && visibleRows.length === 0"
      kind="empty"
      title="还没有数据"
      :text="emptyText"
      action-text="重新加载"
      testid="list-empty"
      @action="reload"
    />

    <!-- 行 -->
    <view v-else class="lc-list-page__rows">
      <view
        v-for="(row, i) in visibleRows"
        :key="String(row.id ?? i)"
        :class="['lc-row', { 'lc-row--editing': editingId === rowId(row) }]"
        @tap="onRowTap(row)"
      >
        <view v-if="cfg?.editable || cfg?.deletable" class="lc-row__top" @tap.stop>
          <view
            v-if="cfg?.deletable"
            :class="['lc-row__check', { 'lc-row__check--on': isSelected(row) }]"
            :data-testid="`list-select-${rowId(row)}`"
            role="checkbox"
            :aria-checked="isSelected(row)"
            @tap.stop="toggleSelect(row)"
          >
            <text v-if="isSelected(row)" class="lc-row__check-mark">✓</text>
          </view>
          <view v-else class="lc-row__top-spacer" />
          <button
            v-if="cfg?.editable"
            class="lc-row__edit"
            size="mini"
            :loading="editLoadingId === rowId(row)"
            :disabled="!!savingId || batchDeleting"
            :data-testid="`list-edit-${rowId(row)}`"
            @tap.stop="startEdit(row)"
          >
            编辑
          </button>
        </view>

        <view v-for="c in cols" :key="c.key" class="lc-row__cell">
          <text class="lc-row__label">{{ c.name }}</text>
          <text class="lc-row__value">{{ displayCell(row[c.key]) }}</text>
        </view>

        <!-- 行内编辑：复用详情页编辑器；容器阻止冒泡，编辑态禁止行跳转（onRowTap 里再兜底） -->
        <view
          v-if="editingId === rowId(row) && editRecord"
          class="lc-row__editor"
          @tap.stop
        >
          <view
            v-if="editError"
            class="lc-list-page__inline-err lc-row__editor-err"
            data-testid="list-edit-error"
          >
            <text class="lc-list-page__inline-err-text">{{ editError }}</text>
            <button
              v-if="editConflict"
              class="lc-list-page__retry"
              size="mini"
              :loading="editLoadingId === editingId"
              data-testid="list-edit-reload"
              @tap.stop="reloadEditing"
            >
              重新加载
            </button>
            <button
              v-else
              class="lc-list-page__retry"
              size="mini"
              @tap.stop="editError = ''"
            >
              关闭
            </button>
          </view>

          <lc-record-editor
            :key="editKey"
            :model="modelDef"
            :record="editRecord"
            :fields="editFields"
            :saving="savingId === editingId"
            :errors="editErrors"
            @save="onSaveRow"
            @cancel="cancelEdit"
          />
        </view>
      </view>

      <!-- 批量删除部分失败：保留未删行与选择，刷新后可用最新 revision 重试 -->
      <view v-if="batchError" class="lc-list-page__inline-err" data-testid="list-batch-error">
        <text class="lc-list-page__inline-err-text">{{ batchError }}</text>
        <button
          class="lc-list-page__retry"
          size="mini"
          :loading="loading"
          data-testid="list-batch-refresh"
          @tap.stop="refreshBatch"
        >
          刷新
        </button>
      </view>

      <!-- 翻页失败：不破坏已加载内容，就地给重试（§5「已加载内容不丢失」） -->
      <view v-if="state && rows.length > 0" class="lc-list-page__inline-err" data-testid="list-inline-error">
        <text class="lc-list-page__inline-err-text">{{ state.title }}：{{ state.text }}</text>
        <button class="lc-list-page__retry" size="mini" @tap="retryLoadMore">重试</button>
      </view>

      <view v-if="hasMore" class="lc-list-page__more">
        <button class="lc-list-page__more-btn" size="mini" :loading="loading" @tap="loadMore">
          加载更多（已显示 {{ rows.length }}/{{ total }}）
        </button>
      </view>
      <view v-else class="lc-list-page__total">
        <text class="lc-list-page__total-text">共 {{ total }} 条</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { FieldSchema, ModelSchema, PageSchema } from '@lc/schema'
import type { PageControllerOptions } from '@lc/renderer'
import { recordEtag } from '../core/record-edit'
import { classifyError, type StateKind } from '../core/state-kind'
import { displayCell } from './display'
import LcRecordEditor from './lc-record-editor.vue'
import LcStateView from './lc-state-view.vue'

const props = defineProps<{
  schema: PageSchema
  options: PageControllerOptions
}>()

const emit = defineEmits<{
  /** 点行请求壳层跳转（pageId = 低代码页面 id；rid = 记录主键） */
  navigate: [target: { pageId: string; params: Record<string, unknown> }]
  /** §5 状态出口：no-auth → 壳层引导登录；forbidden → 壳层回菜单。
   *  跨端能力只经事件上抛（沿 D-A2 分层，renderer 不依赖 uni API）。 */
  'state-action': [kind: StateKind]
}>()

const cfg = computed(() => props.schema.list)

/* ---------------- 数据 ---------------- */
const rows = ref<Array<Record<string, unknown>>>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')
/** 分类用的原始错误（含状态码）；`null` = 无异常。message 仅用于兜底展示 */
const rawError = ref<unknown>(null)
const keyword = ref('')
/** 模型定义（列展示名与缺省列；加载失败降级，不阻塞记录渲染） */
const modelDef = ref<ModelSchema | null>(null)

/* ---------------- Phase 4：行内编辑 / 批量删除 ---------------- */
/** 行操作错误（加载单条/模型失败）；不覆盖列表本身的加载状态 */
const opError = ref('')
/** 当前展开编辑的行 id；空 = 无 */
const editingId = ref('')
const editRecord = ref<Record<string, unknown> | null>(null)
/** 正在拉取单条最新记录的行 id */
const editLoadingId = ref('')
const savingId = ref('')
const editError = ref('')
const editConflict = ref(false)
const editErrors = ref<Record<string, string>>({})
/** 重新加载后强制重挂载编辑器，丢弃其内部草稿 */
const editEpoch = ref(0)
const editKey = computed(() => `${editingId.value}:${editEpoch.value}`)
/** 行内编辑只覆盖展示列；columns 缺省时交给编辑器使用模型全部字段 */
const editFields = computed<string[] | undefined>(() =>
  cfg.value?.columns?.length ? cfg.value.columns : undefined,
)

/** 批量删除选择（只记录 id；行数据可能因翻页/刷新替换） */
const selectedIds = ref<string[]>([])
const batchDeleting = ref(false)
const batchError = ref('')

/**
 * §5 异常分类：401 / 403 / 网络中断 / 其他 → 各自的状态、标题、说明与出口。
 * 只在**没有已加载数据**时整页替换；有数据时走页内重试条（见模板）。
 */
const state = computed(() =>
  rawError.value === null ? null : classifyError(rawError.value, { pageId: props.schema.id }),
)

/** 空态说明：区分「模型下没记录」与「没配模型」两种原因 */
const emptyText = computed(() =>
  cfg.value?.modelId
    ? '当前模型下还没有记录。可以调整搜索条件，或去新增一条。'
    : '这个列表还没有配置数据模型，暂时取不到数据。',
)

/** 状态出口动作：
 *  - error（含网络中断 / 5xx）→ 本地重试，不劳烦壳层；
 *  - no-auth / forbidden → 上抛壳层跳登录 / 回菜单（renderer 不直接调 uni API，沿 D-A2 分层）。 */
function onStateAction(): void {
  const kind = state.value?.kind
  if (kind === 'no-auth' || kind === 'forbidden') {
    emit('state-action', kind)
    return
  }
  reload()
}

/** 每页条数（协议 pagination.size 缺省 10，与服务端 DEFAULT_SIZE 对齐） */
function pageSize(): number {
  return cfg.value?.pagination?.size ?? 10
}

/** 列：配置 columns 优先 → 缺省模型全部字段 → 再降级记录首行的键（模型与列都空时仍可见数据） */
const cols = computed<Array<{ key: string; name: string }>>(() => {
  const fields: FieldSchema[] = modelDef.value?.fields ?? []
  const keys = cfg.value?.columns?.length
    ? cfg.value.columns
    : fields.length > 0
      ? fields.map((f) => f.key)
      : Object.keys(rows.value[0] ?? {})
  return keys.map((key) => ({ key, name: fields.find((f) => f.key === key)?.name ?? key }))
})

/** 前端搜索过滤（包含匹配可见列） */
const visibleRows = computed<Array<Record<string, unknown>>>(() => {
  const kw = keyword.value.trim()
  if (!kw) return rows.value
  return rows.value.filter((r) => cols.value.some((c) => String(r[c.key] ?? '').includes(kw)))
})

const hasMore = computed(() => rows.value.length < total.value)

/* ---------------- 选择 / 批量删除 ---------------- */

function rowId(row: Record<string, unknown>): string {
  return row.id === undefined || row.id === null ? '' : String(row.id)
}

const selectedCount = computed(() => selectedIds.value.length)
const allVisibleSelected = computed(
  () =>
    visibleRows.value.length > 0 &&
    visibleRows.value.every((r) => selectedIds.value.includes(rowId(r))),
)

function isSelected(row: Record<string, unknown>): boolean {
  return selectedIds.value.includes(rowId(row))
}

function toggleSelect(row: Record<string, unknown>): void {
  const id = rowId(row)
  if (!id || batchDeleting.value) return
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((x) => x !== id)
    : [...selectedIds.value, id]
}

/** 全选只作用于当前可见行；搜索隐藏的行不允许被“全选”带进删除集合 */
function toggleSelectAll(): void {
  if (batchDeleting.value) return
  const visibleIds = visibleRows.value.map(rowId).filter(Boolean)
  if (visibleIds.length === 0) return
  if (allVisibleSelected.value) {
    selectedIds.value = selectedIds.value.filter((id) => !visibleIds.includes(id))
    return
  }
  const next = new Set(selectedIds.value)
  for (const id of visibleIds) next.add(id)
  selectedIds.value = [...next]
}

/** 搜索条件变化时清掉已不可见的选中行，避免误删用户看不到的记录 */
watch(keyword, () => {
  const visible = new Set(visibleRows.value.map(rowId).filter(Boolean))
  selectedIds.value = selectedIds.value.filter((id) => visible.has(id))
})


async function fetchModel(): Promise<void> {
  const modelId = cfg.value?.modelId
  if (!modelId) return
  try {
    const res = await props.options.host.request({ method: 'GET', url: `/api/v1/models/${modelId}` })
    if (res.statusCode === 200 && res.data) modelDef.value = res.data as ModelSchema
  } catch {
    /* 定义加载失败降级：列名回退 key（记录数据不依赖它） */
  }
}

async function fetchPage(p: number): Promise<void> {
  const c = cfg.value
  if (!c?.modelId) {
    error.value = '列表配置缺少 modelId'
    rawError.value = new Error('列表配置缺少 modelId')
    return
  }
  loading.value = true
  error.value = ''
  rawError.value = null
  const usp = new URLSearchParams()
  usp.set('page', String(p))
  usp.set('size', String(pageSize()))
  const sort0 = c.sort?.[0]
  if (sort0) usp.set('sort', `${sort0.field}:${sort0.order}`)
  try {
    const res = await props.options.host.request({
      method: 'GET',
      url: `/api/v1/models/${c.modelId}/records?${usp.toString()}`,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      error.value = `列表加载失败（${res.statusCode}）`
      // 带结构化状态码，分类器才能识别 401/403（host 网络失败时 statusCode 为 0）
      rawError.value = { statusCode: res.statusCode }
      return
    }
    const data = (res.data ?? {}) as { items?: Array<Record<string, unknown>>; total?: number; page?: number }
    const items = Array.isArray(data.items) ? data.items : []
    rows.value = p === 1 ? items : [...rows.value, ...items]
    total.value = typeof data.total === 'number' ? data.total : rows.value.length
    page.value = typeof data.page === 'number' ? data.page : p
    if (p === 1) {
      // 全量刷新后只保留仍存在的选择；已删除/被过滤掉的 id 不再参与批量操作
      const loaded = new Set(rows.value.map(rowId).filter(Boolean))
      selectedIds.value = selectedIds.value.filter((id) => loaded.has(id))
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '列表加载失败'
    rawError.value = e
  } finally {
    loading.value = false
  }
}

function reload(): void {
  void fetchPage(1)
}

/** 批量删除部分失败后的刷新：先清掉旧批次错误，再拉最新 revision */
function refreshBatch(): void {
  batchError.value = ''
  reload()
}

function loadMore(): void {
  if (loading.value || !hasMore.value) return
  void fetchPage(page.value + 1)
}

/** 翻页失败后的重试：续拉**下一页**而非重置回第一页（保留已加载内容与滚动位置） */
function retryLoadMore(): void {
  if (loading.value) return
  void fetchPage(page.value + 1)
}

function onRowTap(row: Record<string, unknown>): void {
  // 编辑态下整行不跳转，避免点编辑器空白处误进详情页
  if (editingId.value) return
  const dp = cfg.value?.detailPageId
  if (!dp) return
  emit('navigate', { pageId: dp, params: { rid: String(row.id ?? '') } })
}

/* ---------------- 行内编辑 ---------------- */

interface WriteErrorBody {
  code?: string
  message?: string
  currentRevision?: number
  errors?: Array<{ path?: string; message?: string }>
}

/** 拉单条最新记录：列表行可能只含展示列，编辑前必须补齐字段与 revision */
async function fetchRecordForEdit(
  id: string,
): Promise<{ statusCode: number; item?: Record<string, unknown>; message?: string }> {
  const modelId = cfg.value?.modelId
  if (!modelId) return { statusCode: 0, message: '列表配置缺少 modelId' }
  const usp = new URLSearchParams()
  usp.set('filter', JSON.stringify({ id }))
  usp.set('size', '1')
  const res = await props.options.host.request({
    method: 'GET',
    url: `/api/v1/models/${encodeURIComponent(modelId)}/records?${usp.toString()}`,
  })
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = (res.data ?? {}) as { message?: string }
    return { statusCode: res.statusCode, message: body.message }
  }
  const data = (res.data ?? {}) as { items?: Array<Record<string, unknown>> }
  const item = Array.isArray(data.items) ? data.items[0] : undefined
  return { statusCode: res.statusCode, item }
}

async function startEdit(row: Record<string, unknown>): Promise<void> {
  const id = rowId(row)
  if (!cfg.value?.modelId || !id || savingId.value || batchDeleting.value) return
  if (editLoadingId.value || editingId.value === id) return

  opError.value = ''
  batchError.value = ''
  editError.value = ''
  editConflict.value = false
  editErrors.value = {}
  editLoadingId.value = id

  try {
    // 模型定义失败时编辑器会按记录键降级；这里只尝试补一次，不阻塞编辑
    if (!modelDef.value) await fetchModel()
    const found = await fetchRecordForEdit(id)
    if (found.statusCode === 401) {
      emit('state-action', 'no-auth')
      opError.value = '登录已失效，请重新登录'
      return
    }
    if (found.statusCode === 404 || (found.statusCode === 200 && !found.item)) {
      opError.value = '记录不存在，可能已被删除'
      reload()
      return
    }
    if (found.statusCode < 200 || found.statusCode >= 300 || !found.item) {
      opError.value = `加载记录失败（${found.statusCode}）${found.message ? `：${found.message}` : ''}`
      return
    }
    editRecord.value = found.item
    editingId.value = id
    editEpoch.value += 1
  } catch (e) {
    opError.value = `加载记录失败：${e instanceof Error ? e.message : '网络异常'}`
  } finally {
    editLoadingId.value = ''
  }
}

function cancelEdit(): void {
  if (savingId.value) return
  editingId.value = ''
  editRecord.value = null
  editError.value = ''
  editConflict.value = false
  editErrors.value = {}
}

function handleEditFailure(res: { statusCode: number; data: unknown }, verb: string): void {
  const body = (res.data ?? {}) as WriteErrorBody
  editErrors.value = {}

  if (res.statusCode === 409 || body.code === 'VERSION_CONFLICT') {
    editConflict.value = true
    const rev = typeof body.currentRevision === 'number' ? `（服务端当前版本 ${body.currentRevision}）` : ''
    editError.value = `这条记录已被其他请求修改，本次${verb}未生效${rev}。请重新加载最新数据后再试。`
    return
  }

  if (res.statusCode === 400 && Array.isArray(body.errors)) {
    const next: Record<string, string> = {}
    for (const issue of body.errors) {
      if (issue.path && issue.message) next[issue.path] = issue.message
    }
    editErrors.value = next
    editError.value = `本次${verb}未生效：${body.message || '记录校验未通过'}`
    return
  }

  if (res.statusCode === 0) {
    editError.value = `${verb}失败：网络不可用，请稍后重试`
    return
  }
  if (res.statusCode === 401) {
    editError.value = '登录已失效，请重新登录'
    emit('state-action', 'no-auth')
    return
  }
  if (res.statusCode === 403) {
    editError.value = body.message || `没有${verb}权限`
    return
  }
  if (res.statusCode === 404) {
    editError.value = '记录不存在，可能已被删除'
    return
  }
  editError.value = `${verb}失败（${res.statusCode}）：${body.message || '未知错误'}`
}

/** 保存：PUT 部分合并 + If-Match；成功后用服务端返回记录替换当前行 */
async function onSaveRow(payload: Record<string, unknown>): Promise<void> {
  const c = cfg.value
  const rec = editRecord.value
  const id = editingId.value
  if (!c?.modelId || !rec || !id || savingId.value) return

  savingId.value = id
  editError.value = ''
  editConflict.value = false
  editErrors.value = {}

  try {
    const res = await props.options.host.request({
      method: 'PUT',
      url: `/api/v1/models/${encodeURIComponent(c.modelId)}/records/${encodeURIComponent(id)}`,
      headers: { 'if-match': recordEtag(c.modelId, id, rec.revision) },
      data: payload,
    })
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const updated =
        res.data && typeof res.data === 'object' && !Array.isArray(res.data)
          ? (res.data as Record<string, unknown>)
          : { ...rec, ...payload, revision: Number(rec.revision ?? 0) + 1 }
      const index = rows.value.findIndex((r) => rowId(r) === id)
      if (index >= 0) rows.value[index] = { ...rows.value[index], ...updated }
      editingId.value = ''
      editRecord.value = null
      void props.options.host.toast({ text: '已保存', icon: 'success' })
      return
    }
    handleEditFailure(res, '保存')
  } catch (e) {
    editError.value = `保存失败：${e instanceof Error ? e.message : '网络异常'}`
  } finally {
    savingId.value = ''
  }
}

/** 409 后显式拉最新记录并强制重挂载编辑器（丢弃草稿，绝不自动合并） */
async function reloadEditing(): Promise<void> {
  const id = editingId.value
  if (!id || editLoadingId.value || savingId.value) return
  editLoadingId.value = id
  editError.value = ''
  try {
    const found = await fetchRecordForEdit(id)
    if (found.statusCode >= 200 && found.statusCode < 300 && found.item) {
      editRecord.value = found.item
      editConflict.value = false
      editErrors.value = {}
      editEpoch.value += 1
      void props.options.host.toast({ text: '已加载最新数据', icon: 'none' })
      return
    }
    if (found.statusCode === 401) emit('state-action', 'no-auth')
    editError.value =
      found.statusCode === 404
        ? '记录不存在，可能已被删除'
        : `重新加载失败（${found.statusCode}）${found.message ? `：${found.message}` : ''}`
  } catch (e) {
    editError.value = `重新加载失败：${e instanceof Error ? e.message : '网络异常'}`
  } finally {
    editLoadingId.value = ''
  }
}

/* ---------------- 批量删除 ---------------- */

/**
 * 逐条串行 DELETE（不并发轰炸服务端），每条都带该行 revision 的 If-Match。
 * 409 保留该行、不清选择，提示刷新后用最新 revision 重试；404 视为已删除。
 */
async function batchDelete(): Promise<void> {
  const c = cfg.value
  const ids = [...selectedIds.value]
  if (!c?.modelId || ids.length === 0 || batchDeleting.value || savingId.value) return

  const ok = await props.options.host.confirm({
    text: `确定删除选中的 ${ids.length} 条记录？删除后不可恢复。`,
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!ok) return

  batchDeleting.value = true
  batchError.value = ''
  opError.value = ''

  const deleted: string[] = []
  const conflicts: string[] = []
  const failed: string[] = []
  let firstFailure = ''

  try {
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i]
      const row = rows.value.find((r) => rowId(r) === id)
      if (!row) {
        deleted.push(id)
        continue
      }
      try {
        const res = await props.options.host.request({
          method: 'DELETE',
          url: `/api/v1/models/${encodeURIComponent(c.modelId)}/records/${encodeURIComponent(id)}`,
          headers: { 'if-match': recordEtag(c.modelId, id, row.revision) },
        })
        if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 404) {
          deleted.push(id)
          continue
        }
        if (res.statusCode === 409 || (res.data as WriteErrorBody | undefined)?.code === 'VERSION_CONFLICT') {
          conflicts.push(id)
          continue
        }
        if (res.statusCode === 401) {
          emit('state-action', 'no-auth')
          failed.push(...ids.slice(i))
          firstFailure = '登录已失效，请重新登录'
          break
        }
        failed.push(id)
        if (!firstFailure) {
          const body = (res.data ?? {}) as WriteErrorBody
          firstFailure = `${res.statusCode}${body.message ? `：${body.message}` : ''}`
        }
      } catch (e) {
        failed.push(id)
        if (!firstFailure) {
          firstFailure = e instanceof Error ? e.message : '网络异常'
        }
      }
    }

    const removed = new Set(deleted)
    if (deleted.length > 0) {
      rows.value = rows.value.filter((r) => !removed.has(rowId(r)))
      total.value = Math.max(0, total.value - deleted.length)
      if (editingId.value && removed.has(editingId.value)) cancelEdit()
    }
    // 冲突/失败行保留选择，刷新后可直接重试
    selectedIds.value = [...conflicts, ...failed]

    if (conflicts.length === 0 && failed.length === 0) {
      void props.options.host.toast({ text: `已删除 ${deleted.length} 条`, icon: 'success' })
      // 当前页被删空但还有后续数据：立刻回到第一页，避免误显示「还没有数据」
      if (rows.value.length === 0 && total.value > 0) reload()
      return
    }

    const parts: string[] = []
    if (deleted.length > 0) parts.push(`已删除 ${deleted.length} 条`)
    if (conflicts.length > 0) parts.push(`${conflicts.length} 条版本冲突未删除`)
    if (failed.length > 0) parts.push(`${failed.length} 条删除失败`)
    batchError.value = `${parts.join('，')}${firstFailure ? `（${firstFailure}）` : ''}。仅保留未删除行；请刷新获取最新版本后再试。`
    void props.options.host.toast({ text: '部分记录未删除', icon: 'error' })
  } finally {
    batchDeleting.value = false
  }
}

onMounted(() => {
  void fetchModel()
  void fetchPage(1)
})
</script>

<style scoped>
.lc-list-page {
  display: flex;
  flex-direction: column;
  min-height: 200rpx;
}

.lc-list-page__search {
  padding: var(--lc-space-2) var(--lc-space-3) 0;
}

.lc-list-page__input {
  box-sizing: border-box;
  width: 100%;
  padding: 14rpx var(--lc-space-3);
  font-size: var(--lc-font-body);
  border: 1rpx solid var(--lc-border-strong);
  border-radius: 999rpx;
  background: var(--lc-bg-surface);
}

/* 批量操作栏：固定在选择区上方，不参与行点击 */
.lc-list-page__batch {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-2) var(--lc-space-3) 0;
}
.lc-list-page__batch-btn {
  background: var(--lc-bg-subtle);
  color: var(--lc-action-primary);
  border-radius: var(--lc-radius-pill);
}
.lc-list-page__batch-count {
  flex: 1;
  color: var(--lc-text-secondary);
  font-size: var(--lc-font-caption);
}
.lc-list-page__batch-delete {
  background: var(--lc-status-danger-bg);
  color: var(--lc-status-danger);
  border: 1rpx solid var(--lc-status-danger);
  border-radius: var(--lc-radius-pill);
}
.lc-list-page__batch-delete[disabled] {
  opacity: 0.5;
}

/* 状态视图（loading / 空 / 401 / 403 / 错误）统一走 lc-state-view 共享组件，
   这里只留列表特有的样式。 */

/* 翻页失败的就地重试条：不破坏已加载内容（§5） */
.lc-list-page__inline-err {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-2);
  margin-top: var(--lc-space-2);
  padding: var(--lc-space-2) var(--lc-space-3);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-status-danger-bg);
}
.lc-list-page__inline-err-text {
  flex: 1;
  color: var(--lc-status-danger);
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-ui);
}
.lc-list-page__retry {
  flex-shrink: 0;
  background: var(--lc-bg-surface);
  color: var(--lc-status-danger);
  border: 1rpx solid var(--lc-status-danger);
  border-radius: var(--lc-radius-pill);
}

.lc-list-page__rows {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
  padding: var(--lc-space-2) var(--lc-space-3) var(--lc-space-4);
}

.lc-row {
  padding: 20rpx var(--lc-space-3);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
  background: var(--lc-bg-surface);
}

.lc-row:active {
  background: var(--lc-bg-subtle);
}

.lc-row__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-2);
  min-height: 44rpx;
  padding-bottom: 6rpx;
}

.lc-row__top-spacer {
  flex: 1;
}

.lc-row__check {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 36rpx;
  height: 36rpx;
  border: var(--lc-border-width) solid var(--lc-border-strong);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
}

.lc-row__check--on {
  border-color: var(--lc-action-primary);
  background: var(--lc-action-primary);
}

.lc-row__check-mark {
  color: var(--lc-action-primary-text);
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-label);
}

.lc-row__edit {
  flex-shrink: 0;
  background: var(--lc-action-primary-subtle);
  color: var(--lc-action-primary);
  border-radius: var(--lc-radius-pill);
}

.lc-row--editing {
  border-color: var(--lc-action-primary);
}

.lc-row__editor {
  margin-top: var(--lc-space-2);
  padding-top: var(--lc-space-2);
  border-top: 1rpx solid var(--lc-border-default);
}

.lc-row__editor-err {
  margin-top: 0;
  margin-bottom: var(--lc-space-2);
}

.lc-row__cell {
  display: flex;
  justify-content: space-between;
  gap: var(--lc-space-3);
  padding: 6rpx 0;
}

.lc-row__label {
  flex-shrink: 0;
  color: var(--lc-text-secondary);
  font-size: var(--lc-font-body-sm);
}

.lc-row__value {
  flex: 1;
  color: var(--lc-text-primary);
  font-size: var(--lc-font-body-sm);
  text-align: right;
  word-break: break-all;
}

.lc-list-page__more,
.lc-list-page__total {
  display: flex;
  justify-content: center;
  padding: var(--lc-space-1) 0 0;
}

.lc-list-page__more-btn {
  background: var(--lc-bg-subtle);
  color: var(--lc-action-primary);
  border-radius: 999rpx;
}

.lc-list-page__total-text {
  color: var(--lc-text-tertiary);
  font-size: var(--lc-font-caption);
}
</style>
