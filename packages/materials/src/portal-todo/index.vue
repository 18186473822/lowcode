<!--
  PortalTodo 物料 —— 门户待办列表（2026-10-28 门户组件库批 2）。

  接口对齐 lc-node：`<lc-portal-todo v-bind="model.props" @item-click="onItem" />`

  数据来源（优先级从高到低）：
    ① `items` 静态数据 —— 设计期预览 / 无流程引擎时手工配；
    ② `GET /api/v1/flows/tasks/todo` —— 经宿主注入的 `LC_FLOW_HOST_KEY.request`
       拉当前登录人待办（服务端 canDecide 权威过滤，前端不再判权限）。
  未注入宿主（老版本宿主 / 无 host 的宿主）时静默停在空态，不报错、不发请求。

  行字段兼容两套形态：
    - 流程待办：`{flowName, nodeName, createdBy, createdAt}`（服务端投影）；
    - 静态手配：`{title, tag, desc, time}`。
  点击行 emit itemClick(index)（与 List 物料同口径）。
-->
<template>
  <view class="lc-todo">
    <view class="lc-todo__head">
      <text class="lc-todo__title">{{ title || '我的待办' }}</text>
      <text v-if="showCount && list.length" class="lc-todo__count">{{ list.length }}</text>
    </view>

    <view v-if="loading" class="lc-todo__state">
      <text class="lc-todo__state-text">加载待办…</text>
    </view>
    <view v-else-if="error" class="lc-todo__state">
      <text class="lc-todo__err">{{ error }}</text>
    </view>
    <view v-else-if="!list.length" class="lc-todo__state">
      <text class="lc-todo__state-text">暂无待办</text>
    </view>

    <view v-else class="lc-todo__list">
      <view v-for="(row, i) in list" :key="row.taskId || i" class="lc-todo__row" @tap="onTap(i)">
        <view class="lc-todo__main">
          <view class="lc-todo__line">
            <text class="lc-todo__flow">{{ titleOf(row) }}</text>
            <text v-if="tagOf(row)" class="lc-todo__tag">{{ tagOf(row) }}</text>
          </view>
          <text v-if="metaOf(row)" class="lc-todo__meta">{{ metaOf(row) }}</text>
        </view>
        <text class="lc-todo__arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { LC_FLOW_HOST_KEY } from '../keys'
import { asArray } from '../props-utils'

/** 服务端待办项 + 静态手配项的最小并集（字段都 optional，读取时逐级回退） */
interface TodoRow {
  taskId?: string
  flowName?: string
  nodeName?: string
  createdBy?: string
  createdAt?: string
  title?: string
  tag?: string
  desc?: string
  time?: string
}

const props = withDefaults(
  defineProps<{
    title?: string
    /** 最多展示条数（缺省 5，1~50） */
    limit?: number
    /** 静态数据（非空则完全不发请求） */
    items?: unknown
    /** 允许运行时拉取待办（缺省 true） */
    autoLoad?: boolean
    /** 标题右侧显示条数（缺省 true） */
    showCount?: boolean
  }>(),
  { title: '我的待办', limit: 5, autoLoad: true, showCount: true },
)

const emit = defineEmits<{ itemClick: [index: number] }>()

const host = inject(LC_FLOW_HOST_KEY, undefined)

const fetched = ref<TodoRow[]>([])
const loading = ref(false)
const error = ref('')

const staticRows = computed<TodoRow[]>(() =>
  asArray<TodoRow>(props.items).filter((it) => it && typeof it === 'object'),
)

const max = computed(() => {
  const n = Math.floor(Number(props.limit))
  return Number.isFinite(n) ? Math.max(1, Math.min(50, n)) : 5
})

const list = computed<TodoRow[]>(() => {
  const rows = staticRows.value.length ? staticRows.value : fetched.value
  return rows.slice(0, max.value)
})

async function load(): Promise<void> {
  if (!host || !props.autoLoad) return
  loading.value = true
  error.value = ''
  try {
    const res = await host.request({ method: 'GET', url: '/api/v1/flows/tasks/todo' })
    if (res.statusCode === 401) {
      error.value = '登录已过期，请重新登录'
      return
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      error.value = `待办加载失败（${res.statusCode}）`
      return
    }
    const items = (res.data as { items?: TodoRow[] } | null)?.items
    fetched.value = Array.isArray(items) ? items : []
  } catch {
    error.value = '待办加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 配了静态数据就不发请求（设计期预览 / 手工场景）
  if (!staticRows.value.length) void load()
})

function titleOf(row: TodoRow): string {
  return String(row.flowName ?? row.title ?? '待办事项')
}

function tagOf(row: TodoRow): string {
  return String(row.nodeName ?? row.tag ?? '')
}

/** 副行：静态数据优先用 desc；流程待办拼「发起人 · 时间」 */
function metaOf(row: TodoRow): string {
  if (row.desc) return String(row.desc)
  const parts: string[] = []
  if (row.createdBy) parts.push(`发起：${row.createdBy}`)
  const time = row.time ?? fmtTime(row.createdAt)
  if (time) parts.push(time)
  return parts.join(' · ')
}

/** ISO → `MM-DD HH:mm`（小程序端 Date 解析 ISO 可用；非法值原样返回） */
function fmtTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function onTap(i: number): void {
  emit('itemClick', i)
}
</script>

<style scoped>
.lc-todo {
  box-sizing: border-box;
  margin: var(--lc-space-2) var(--lc-space-3);
  padding: var(--lc-space-2) var(--lc-space-3) var(--lc-space-1);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
  background: var(--lc-bg-surface);
}
.lc-todo__head {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  padding-bottom: var(--lc-space-1-5);
  border-bottom: 1rpx solid var(--lc-border-default);
}
.lc-todo__title {
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-todo__count {
  min-width: 32rpx;
  padding: 0 var(--lc-space-1);
  border-radius: var(--lc-radius-pill);
  background: var(--lc-status-danger-bg);
  color: var(--lc-status-danger);
  font-size: var(--lc-font-micro);
  text-align: center;
}
.lc-todo__state {
  padding: var(--lc-space-4) 0;
  text-align: center;
}
.lc-todo__state-text {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
.lc-todo__err {
  font-size: var(--lc-font-caption);
  color: var(--lc-status-danger);
}
.lc-todo__row {
  display: flex;
  align-items: center;
  padding: var(--lc-space-2) 0;
  border-bottom: 1rpx solid var(--lc-border-default);
}
.lc-todo__row:last-child {
  border-bottom: none;
}
.lc-todo__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  min-width: 0;
}
.lc-todo__line {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  min-width: 0;
}
.lc-todo__flow {
  overflow: hidden;
  font-size: var(--lc-font-body);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* 节点名做成中性小胶囊：**不用** action-primary-subtle / action-primary 这对组合 ——
   实测暗色主题下品牌蓝落在深蓝底上只有 **2.91:1**（11px 文本要 4.5:1）。
   bg-subtle + text-label 已过门禁（亮 9.77 / 暗 9.74），且视觉上本就该是
   「流程节点」这种中性信息，不抢标题。*/
.lc-todo__tag {
  flex-shrink: 0;
  padding: 2rpx var(--lc-space-1-5);
  border-radius: var(--lc-radius-pill);
  background: var(--lc-bg-subtle);
  color: var(--lc-text-label);
  font-size: var(--lc-font-micro);
}
.lc-todo__meta {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.lc-todo__arrow {
  flex-shrink: 0;
  padding-left: var(--lc-space-2);
  font-size: var(--lc-font-h3);
  color: var(--lc-icon-muted);
}
</style>
