<!--
  lc-detail-page.vue —— type=detail 标准详情页（Phase 2 批 2 / Phase 4 记录写操作）

  - 由路由参数 rid（列表点行携带）定位单条记录：GET records?filter={"id":rid}（服务端等值过滤）。
  - 展示字段：schema.detail.fields 顺序 → 缺省模型全部字段；展示名取模型定义。
  - 交互：返回按钮 → emit('back')（或配 backPageId → emit('navigate') 由壳层跳转）。
  - 写操作：detail.editable / deletable 显式开启；PUT/DELETE 均带 If-Match，409 不覆盖他人修改。
  - 记录不存在 / 拉取失败均红字可见（错误不静默）。
-->
<template>
  <view class="lc-detail-page">
    <!-- 加载中 → 骨架屏 -->
    <lc-state-view v-if="loading" kind="loading" testid="detail-loading" />

    <!-- 异常（§5 分类）：401 / 403 / 记录不存在 / 网络 / 其他，各自带出口 -->
    <lc-state-view
      v-else-if="state"
      :kind="state.kind"
      :title="state.title"
      :text="state.text"
      :action-text="state.actionText"
      :testid="`detail-${state.kind}`"
      @action="onStateAction"
    />

    <view v-else-if="item" class="lc-detail-page__body">
      <!-- 写操作失败（保存/删除）：版本冲突必须显式说明「本次未生效」，且只能重新加载后重试 -->
      <view v-if="opError" class="lc-detail-page__op-err" data-testid="detail-op-error">
        <text class="lc-detail-page__op-err-text">{{ opError }}</text>
        <button
          v-if="conflict"
          class="lc-detail-page__reload"
          size="mini"
          data-testid="detail-reload-latest"
          @tap="reloadLatest"
        >
          重新加载
        </button>
      </view>

      <!-- Phase 4：记录编辑态（只覆盖可写展示字段；PUT 部分合并 + If-Match） -->
      <lc-record-editor
        v-if="editing"
        :model="modelDef"
        :record="item"
        :fields="cfg?.fields"
        :saving="saving"
        :errors="fieldErrors"
        @save="onSave"
        @cancel="cancelEdit"
      />

      <template v-else>
        <view v-for="f in fields" :key="f.key" class="lc-dcell">
          <text class="lc-dcell__label">{{ f.name }}</text>
          <text class="lc-dcell__value">{{ displayCell(item[f.key]) }}</text>
        </view>

        <view class="lc-detail-page__actions">
          <button class="lc-detail-page__back" size="mini" @tap="onBack">返回</button>
          <button
            v-if="editable"
            class="lc-detail-page__edit"
            size="mini"
            data-testid="detail-edit"
            @tap="startEdit"
          >
            编辑
          </button>
          <button
            v-if="deletable"
            class="lc-detail-page__delete"
            size="mini"
            :loading="deleting"
            :disabled="deleting"
            data-testid="detail-delete"
            @tap="onDelete"
          >
            删除
          </button>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
  /** 路由参数 rid（列表点行携带的记录主键）；缺省时给「缺少 rid」红字 */
  recordId: string
}>()

const emit = defineEmits<{
  /** 返回（壳层 navigateBack） */
  back: []
  /** 配置了 backPageId：按目标页跳转（替代历史栈返回） */
  navigate: [target: { pageId: string; params: Record<string, unknown> }]
  /** §5 状态出口：no-auth / forbidden 上抛壳层（renderer 不依赖 uni API，沿 D-A2） */
  'state-action': [kind: StateKind]
  /** 记录保存成功（壳层可用于刷新返回后的列表） */
  saved: [payload: { id: string; revision: number }]
  /** 记录删除成功（壳层可用于刷新返回后的列表） */
  deleted: [payload: { id: string }]
}>()

const cfg = computed(() => props.schema.detail)
const loading = ref(true)
const error = ref('')
/** 分类用原始错误（含状态码）；null = 无异常 */
const rawError = ref<unknown>(null)
const item = ref<Record<string, unknown> | null>(null)
const modelDef = ref<ModelSchema | null>(null)

/** 记录编辑/删除为**显式开关**，存量详情页保持只读（安全默认） */
const editable = computed(() => cfg.value?.editable === true)
const deletable = computed(() => cfg.value?.deletable === true)

const editing = ref(false)
const saving = ref(false)
const deleting = ref(false)
/** 写操作失败提示（保存/删除共用；与加载失败 state 区分） */
const opError = ref('')
/** 409 版本冲突：只允许「重新加载」放弃本地草稿后重试，不自动覆盖他人修改 */
const conflict = ref(false)
/** 服务端 400 RECORD_INVALID 的字段级错误（key → message） */
const fieldErrors = ref<Record<string, string>>({})

/** §5 异常分类：401 / 403 / 404 / 网络 / 其他 → 各自的状态、标题、说明与出口。
 *  404 用记录级文案（取不到的是「记录」而非「页面」），避免说成「页面不存在」。 */
const state = computed(() =>
  rawError.value === null
    ? null
    : classifyError(rawError.value, {
        pageId: props.schema.id,
        notFoundTitle: '记录不存在',
        notFoundText: '这条记录可能已被删除，或链接已失效。返回列表看看其他记录。',
      }),
)

/** 出口：error → 重新拉取；no-auth / forbidden → 壳层处理 */
function onStateAction(): void {
  const kind = state.value?.kind
  if (kind === 'no-auth' || kind === 'forbidden') {
    emit('state-action', kind)
    return
  }
  void fetchRecord()
}

/** 展示字段：detail.fields 配置顺序 → 缺省模型全部字段 → 模型定义缺失时从记录键回退（对称 list 的列降级） */
const fields = computed<Array<{ key: string; name: string }>>(() => {
  const all = modelDef.value?.fields ?? []
  const keys = cfg.value?.fields
  if (keys && keys.length > 0) {
    return keys
      .map((k) => all.find((f) => f.key === k))
      .filter((f): f is FieldSchema => !!f)
      .map((f) => ({ key: f.key, name: f.name }))
  }
  if (all.length > 0) return all.map((f) => ({ key: f.key, name: f.name }))
  return Object.keys(item.value ?? {}).map((k) => ({ key: k, name: k }))
})

async function fetchModel(): Promise<void> {
  const modelId = cfg.value?.modelId
  if (!modelId) return
  try {
    const res = await props.options.host.request({ method: 'GET', url: `/api/v1/models/${modelId}` })
    if (res.statusCode === 200 && res.data) modelDef.value = res.data as ModelSchema
  } catch {
    /* 定义失败降级：字段名回退见 fields 计算（空时记录仍可红字流程兜底） */
  }
}

async function fetchRecord(): Promise<void> {
  const c = cfg.value
  // early-return 必须先收 loading（否则卡死骨架屏，错误不可见）
  if (!c?.modelId) {
    loading.value = false
    error.value = '详情配置缺少 modelId'
    rawError.value = new Error('详情配置缺少 modelId')
    return
  }
  if (!props.recordId) {
    loading.value = false
    error.value = '缺少记录 id（rid）'
    rawError.value = new Error('缺少记录 id（rid）')
    return
  }
  loading.value = true
  error.value = ''
  rawError.value = null
  try {
    const usp = new URLSearchParams()
    usp.set('filter', JSON.stringify({ id: props.recordId }))
    usp.set('size', '1')
    const res = await props.options.host.request({
      method: 'GET',
      url: `/api/v1/models/${c.modelId}/records?${usp.toString()}`,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      error.value = `记录加载失败（${res.statusCode}）`
      rawError.value = { statusCode: res.statusCode }
      return
    }
    const data = (res.data ?? {}) as { items?: Array<Record<string, unknown>> }
    const first = Array.isArray(data.items) ? data.items[0] : undefined
    if (!first) {
      // 记录不存在是「内容级」结论，不是异常 —— 用 not-found 态（不给重试）
      error.value = '记录不存在或已被删除'
      rawError.value = { statusCode: 404 }
      return
    }
    item.value = first
  } catch (e) {
    error.value = e instanceof Error ? e.message : '记录加载失败'
    rawError.value = e
  } finally {
    loading.value = false
  }
}

function onBack(): void {
  const bp = cfg.value?.backPageId
  if (bp) emit('navigate', { pageId: bp, params: {} })
  else emit('back')
}

/** 记录 id：优先用服务端返回的 id，降级路由参数（列表过滤用的就是 rid） */
function currentRecordId(): string {
  return String(item.value?.id ?? props.recordId)
}

/** 写接口返回体（Nest 异常已统一投影为 `{ code, message, errors? }`） */
interface WriteErrorBody {
  code?: string
  message?: string
  currentRevision?: number
  errors?: Array<{ path?: string; message?: string }>
}

/**
 * 写操作失败统一处理。
 *
 * 409 不自动重试、不自动覆盖：保留用户草稿并提示「本次未生效」，由用户显式重新加载。
 * 400 把 `errors[].path/message` 映射到编辑器字段；401 交给壳层去登录。
 */
function handleWriteFailure(res: { statusCode: number; data: unknown }, verb: string): void {
  const body = (res.data ?? {}) as WriteErrorBody
  fieldErrors.value = {}

  if (res.statusCode === 409 || body.code === 'VERSION_CONFLICT') {
    conflict.value = true
    const rev = typeof body.currentRevision === 'number' ? `（服务端当前版本 ${body.currentRevision}）` : ''
    opError.value = `这条记录已被其他请求修改，本次${verb}未生效${rev}。请重新加载最新数据后再操作。`
    return
  }

  if (res.statusCode === 400 && Array.isArray(body.errors)) {
    const next: Record<string, string> = {}
    for (const issue of body.errors) {
      if (issue.path && issue.message) next[issue.path] = issue.message
    }
    fieldErrors.value = next
    opError.value = `本次${verb}未生效：${body.message || '记录校验未通过'}`
    return
  }

  if (res.statusCode === 0) {
    opError.value = `${verb}失败：网络不可用，请稍后重试`
    return
  }

  if (res.statusCode === 401) {
    opError.value = '登录已失效，请重新登录'
    emit('state-action', 'no-auth')
    return
  }

  if (res.statusCode === 403) {
    opError.value = body.message || `没有${verb}权限`
    return
  }

  if (res.statusCode === 404) {
    opError.value = '记录不存在，可能已被删除'
    return
  }

  opError.value = `${verb}失败（${res.statusCode}）：${body.message || '未知错误'}`
}

/** 进入编辑：模型定义未就绪时先等一次；加载失败则明确拒绝，避免把整条记录降级成文本字段 */
async function startEdit(): Promise<void> {
  if (saving.value || deleting.value) return
  opError.value = ''
  conflict.value = false
  fieldErrors.value = {}
  if (!modelDef.value) await fetchModel()
  if (!modelDef.value) {
    opError.value = '模型定义加载失败，暂时无法编辑，请返回后重试'
    return
  }
  editing.value = true
}

function cancelEdit(): void {
  editing.value = false
  fieldErrors.value = {}
  opError.value = ''
  conflict.value = false
}

/** 保存：PUT 部分合并 + If-Match（revision 来自记录响应体，不依赖 ETag 响应头） */
async function onSave(payload: Record<string, unknown>): Promise<void> {
  const c = cfg.value
  const rec = item.value
  if (!c?.modelId || !rec || saving.value) return

  const rid = currentRecordId()
  saving.value = true
  opError.value = ''
  conflict.value = false
  fieldErrors.value = {}

  try {
    const res = await props.options.host.request({
      method: 'PUT',
      url: `/api/v1/models/${encodeURIComponent(c.modelId)}/records/${encodeURIComponent(rid)}`,
      headers: { 'if-match': recordEtag(c.modelId, rid, rec.revision) },
      data: payload,
    })
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        item.value = res.data as Record<string, unknown>
      }
      editing.value = false
      const revision = Number(item.value?.revision ?? 0)
      void props.options.host.toast({ text: '已保存', icon: 'success' })
      emit('saved', { id: rid, revision })
      return
    }
    handleWriteFailure(res, '保存')
  } catch (e) {
    opError.value = `保存失败：${e instanceof Error ? e.message : '网络异常'}`
  } finally {
    saving.value = false
  }
}

/** 删除：确认后 DELETE + If-Match；409 同样不重试，重新加载后再决定 */
async function onDelete(): Promise<void> {
  const c = cfg.value
  const rec = item.value
  if (!deletable.value || !c?.modelId || !rec || deleting.value) return

  const ok = await props.options.host.confirm({
    text: '删除后这条记录将不再显示，确定继续吗？',
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!ok) return

  const rid = currentRecordId()
  deleting.value = true
  opError.value = ''
  conflict.value = false
  fieldErrors.value = {}

  try {
    const res = await props.options.host.request({
      method: 'DELETE',
      url: `/api/v1/models/${encodeURIComponent(c.modelId)}/records/${encodeURIComponent(rid)}`,
      headers: { 'if-match': recordEtag(c.modelId, rid, rec.revision) },
    })
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void props.options.host.toast({ text: '已删除', icon: 'success' })
      emit('deleted', { id: rid })
      onBack()
      return
    }
    handleWriteFailure(res, '删除')
  } catch (e) {
    opError.value = `删除失败：${e instanceof Error ? e.message : '网络异常'}`
  } finally {
    deleting.value = false
  }
}

/** 冲突后显式放弃本地草稿并拉取最新版本（绝不自动把本地修改合并到新版本上） */
async function reloadLatest(): Promise<void> {
  editing.value = false
  conflict.value = false
  opError.value = ''
  fieldErrors.value = {}
  item.value = null
  await fetchRecord()
}

onMounted(() => {
  void fetchModel()
  void fetchRecord()
})
</script>

<style scoped>
.lc-detail-page {
  min-height: 200rpx;
}

/* 状态视图（loading / 401 / 403 / 记录不存在 / 网络 / 其他）统一走 lc-state-view 共享组件 */

.lc-detail-page__body {
  padding: var(--lc-space-1) var(--lc-space-3) var(--lc-space-4);
}

.lc-dcell {
  display: flex;
  justify-content: space-between;
  gap: var(--lc-space-3);
  padding: 22rpx var(--lc-space-3);
  border-bottom: 1rpx solid var(--lc-border-default);
  background: var(--lc-bg-surface);
}

.lc-dcell:first-child {
  border-radius: var(--lc-radius-md) var(--lc-radius-md) 0 0;
}

.lc-dcell__label {
  flex-shrink: 0;
  color: var(--lc-text-secondary);
  font-size: var(--lc-font-body-sm);
}

.lc-dcell__value {
  flex: 1;
  color: var(--lc-text-primary);
  font-size: var(--lc-font-body-sm);
  text-align: right;
  word-break: break-all;
}

.lc-detail-page__actions {
  display: flex;
  justify-content: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-4) 0 0;
}

.lc-detail-page__op-err {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-2);
  margin-top: var(--lc-space-3);
  padding: var(--lc-space-2) var(--lc-space-3);
  border: 1rpx solid var(--lc-status-danger);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
}

.lc-detail-page__op-err-text {
  flex: 1;
  color: var(--lc-status-danger);
  font-size: var(--lc-font-body-sm);
  line-height: var(--lc-leading-ui);
}

.lc-detail-page__reload {
  flex-shrink: 0;
  background: var(--lc-bg-surface);
  color: var(--lc-action-primary);
  border: 1rpx solid var(--lc-action-primary);
  border-radius: var(--lc-radius-pill);
}

.lc-detail-page__back {
  background: var(--lc-bg-surface);
  color: var(--lc-action-primary);
  border: 1rpx solid var(--lc-action-primary);
  border-radius: 999rpx;
}

.lc-detail-page__edit {
  background: var(--lc-action-primary);
  color: var(--lc-text-inverse);
  border-radius: 999rpx;
}

.lc-detail-page__delete {
  background: var(--lc-bg-surface);
  color: var(--lc-status-danger);
  border: 1rpx solid var(--lc-status-danger);
  border-radius: 999rpx;
}
</style>
