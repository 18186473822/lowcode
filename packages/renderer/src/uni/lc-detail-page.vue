<!--
  lc-detail-page.vue —— type=detail 标准详情页（Phase 2 批 2）

  - 由路由参数 rid（列表点行携带）定位单条记录：GET records?filter={"id":rid}（服务端等值过滤）。
  - 展示字段：schema.detail.fields 顺序 → 缺省模型全部字段；展示名取模型定义。
  - 交互极简：返回按钮 → emit('back')（或配 backPageId → emit('navigate') 由壳层跳转）。
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

    <!-- 字段列表 -->
    <view v-else-if="item" class="lc-detail-page__body">
      <view v-for="f in fields" :key="f.key" class="lc-dcell">
        <text class="lc-dcell__label">{{ f.name }}</text>
        <text class="lc-dcell__value">{{ displayCell(item[f.key]) }}</text>
      </view>
      <view class="lc-detail-page__actions">
        <button class="lc-detail-page__back" size="mini" @tap="onBack">返回</button>
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
}>()

const cfg = computed(() => props.schema.detail)
const loading = ref(true)
const error = ref('')
/** 分类用原始错误（含状态码）；null = 无异常 */
const rawError = ref<unknown>(null)
const item = ref<Record<string, unknown> | null>(null)
const modelDef = ref<ModelSchema | null>(null)

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
  padding: var(--lc-space-4) 0 0;
}

.lc-detail-page__back {
  background: var(--lc-bg-surface);
  color: var(--lc-action-primary);
  border: 1rpx solid var(--lc-action-primary);
  border-radius: 999rpx;
}
</style>
