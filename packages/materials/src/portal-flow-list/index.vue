<!--
  PortalFlowList 物料 —— 常用流程（2026-10-29 P2 收尾）

  接口对齐 lc-node：`<lc-portal-flow-list v-bind="model.props" />`

  口径：列出**可以发起的流程**（`FlowSchema.startPageId` 指向启动表单页），点击进入该页填写并提交，
  由表单的 `flow.start` 动作真正起流程 —— 复用现有运行时页面，不新增「流程启动页」。

  为什么依赖 `startPageId`：流程定义本来就只能经 `PUT /flows/:id` 创建（无流程编辑 UI），
  所以「流程 → 启动页」的绑定也放在同一份定义里，不在物料侧重复维护。
  没配 `startPageId` 的流程不出现在这里（配了也没法发起，显示出来只会点空）。

  取数走 `LcFlowHost.request`（与 PortalTodo 同一通道），静态 `items` 优先（设计期预览用）。
-->
<template>
  <view class="lc-portal-flow">
    <view class="lc-portal-flow__head">
      <text class="lc-portal-flow__title">{{ title || '常用流程' }}</text>
      <text v-if="rows.length" class="lc-portal-flow__count">{{ rows.length }}</text>
    </view>

    <view v-if="error" class="lc-portal-flow__state">
      <text class="lc-portal-flow__err">{{ error }}</text>
    </view>
    <view v-else-if="loading" class="lc-portal-flow__state">
      <text class="lc-portal-flow__state-text">加载流程…</text>
    </view>
    <view v-else-if="!rows.length" class="lc-portal-flow__state">
      <text class="lc-portal-flow__state-text">{{ emptyText }}</text>
    </view>

    <view v-else class="lc-portal-flow__list">
      <view
        v-for="(row, i) in rows"
        :key="row.flowId || i"
        class="lc-portal-flow__row"
        @tap="onTap(row)"
      >
        <view class="lc-portal-flow__main">
          <text class="lc-portal-flow__name">{{ row.name }}</text>
          <text v-if="row.meta" class="lc-portal-flow__meta">{{ row.meta }}</text>
        </view>
        <text class="lc-portal-flow__go">发起</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { LC_FLOW_HOST_KEY, type LcFlowHost } from '../keys'
import { asArray } from '../props-utils'

interface FlowRow {
  flowId?: string
  name?: string
  startPageId?: string
  meta?: string
}

const props = withDefaults(
  defineProps<{
    title?: string
    /** 最多展示几条（1~20，缺省 5） */
    limit?: number
    /** 是否拉取 `/flows`（关掉只用静态数据） */
    autoLoad?: boolean
    /** 静态数据（设计期预览 / 后端不可用时兜底） */
    items?: unknown
  }>(),
  { title: '常用流程', limit: 5, autoLoad: true },
)

const emit = defineEmits<{ itemClick: [row: FlowRow] }>()

const host = inject<LcFlowHost | null>(LC_FLOW_HOST_KEY, null)
const fetched = ref<FlowRow[]>([])
const loading = ref(false)
const error = ref('')

const staticRows = computed<FlowRow[]>(() => asArray<FlowRow>(props.items).filter((r) => r && r.name))

const rows = computed<FlowRow[]>(() => {
  const limit = Math.min(20, Math.max(1, Number(props.limit) || 5))
  const source = staticRows.value.length ? staticRows.value : fetched.value
  return source.slice(0, limit)
})

const emptyText = computed(() =>
  props.autoLoad && !staticRows.value.length
    ? '暂无可发起的流程（流程定义需配置 startPageId）'
    : '暂无流程',
)

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  if (!host || !props.autoLoad || staticRows.value.length) return
  loading.value = true
  error.value = ''
  try {
    const res = await host.request({ method: 'GET', url: '/api/v1/flows' })
    if (res.statusCode === 401) {
      error.value = '登录已过期，请重新登录'
      return
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      error.value = `流程加载失败（${res.statusCode}）`
      return
    }
    const flows = (res.data as { flows?: Array<Record<string, unknown>> } | null)?.flows
    fetched.value = (Array.isArray(flows) ? flows : [])
      .filter((f) => typeof f.startPageId === 'string' && f.startPageId.trim())
      .map((f) => ({
        flowId: String(f.flowId ?? ''),
        name: String(f.name ?? f.flowId ?? '未命名流程'),
        startPageId: String(f.startPageId),
        meta: typeof f.modelId === 'string' ? `表单 · ${f.modelId}` : '',
      }))
  } catch {
    error.value = '流程加载失败'
  } finally {
    loading.value = false
  }
}

function onTap(row: FlowRow): void {
  emit('itemClick', row)
  const pageId = (row.startPageId ?? '').trim()
  if (!pageId) return
  // 画布里的 uni 是 PC polyfill（无 navigateTo）→ 天然 no-op
  const api = (globalThis as { uni?: { navigateTo?: (o: { url: string }) => void } }).uni
  if (api && typeof api.navigateTo === 'function') {
    api.navigateTo({ url: `/pages/view/index?pageId=${encodeURIComponent(pageId)}` })
  }
}
</script>

<style scoped>
.lc-portal-flow {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
  padding: var(--lc-space-3);
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-md);
}
.lc-portal-flow__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.lc-portal-flow__title {
  font-size: var(--lc-font-body-sm);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-portal-flow__count {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.lc-portal-flow__state {
  padding: var(--lc-space-4) var(--lc-space-2);
  text-align: center;
}
.lc-portal-flow__state-text {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  line-height: var(--lc-leading-readable);
}
.lc-portal-flow__err {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-danger);
}
.lc-portal-flow__list {
  display: flex;
  flex-direction: column;
}
.lc-portal-flow__row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  padding: var(--lc-space-2) 0;
  border-bottom: 1rpx solid var(--lc-border-default);
}
.lc-portal-flow__row:last-child {
  border-bottom: none;
}
.lc-portal-flow__row:active {
  opacity: 0.8;
}
.lc-portal-flow__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.lc-portal-flow__name {
  overflow: hidden;
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-portal-flow__meta {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.lc-portal-flow__go {
  flex-shrink: 0;
  padding: 0 var(--lc-space-2);
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-label);
  color: var(--lc-action-primary);
  background: var(--lc-status-info-bg);
  border-radius: var(--lc-radius-xs);
}
</style>
