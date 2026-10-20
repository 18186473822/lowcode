<!--
  lc-list-page.vue —— type=list 标准列表页（Phase 2 批 2）

  - 配置驱动（schema.list：modelId / columns / sort / pagination.size / search / detailPageId），
    不走 NodeSchema 树（协议 list 页的 root 仅作设计器占位，运行时忽略）。
  - 数据经 options.host.request 直连 records 查询（filter/sort/page 服务端契约），
    分页「加载更多」追加；搜索为前端 contains 过滤（服务端 filter 仅等值，批 2 不做表达式过滤）。
  - 点行 → emit('navigate', {pageId: detailPageId, params: {rid}})，壳层（runtime view）接线跳转 ——
    renderer 不依赖 uni API（沿 D-A2 分层：跨端能力只经 host / 事件上抛）。
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
        class="lc-row"
        @tap="onRowTap(row)"
      >
        <view v-for="c in cols" :key="c.key" class="lc-row__cell">
          <text class="lc-row__label">{{ c.name }}</text>
          <text class="lc-row__value">{{ displayCell(row[c.key]) }}</text>
        </view>
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
import { computed, onMounted, ref } from 'vue'
import type { FieldSchema, ModelSchema, PageSchema } from '@lc/schema'
import type { PageControllerOptions } from '@lc/renderer'
import { classifyError, type StateKind } from '../core/state-kind'
import { displayCell } from './display'
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
  const dp = cfg.value?.detailPageId
  if (!dp) return
  emit('navigate', { pageId: dp, params: { rid: String(row.id ?? '') } })
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
  line-height: 1.5;
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
