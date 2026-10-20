<!--
  Timeline 物料 —— 审批流转时间轴（Phase 3 批 2，主方案 8.6 审批物料之一）。

  接口对齐 lc-node：`<lc-timeline v-bind="model.props" />`
   - recordId / modelId / flowId 同 ApprovalBar（defaultProps 绑 `$expr: urlParams.rid`）
   - 数据：GET /flows/instances?recordId= → history 正序（提交在上）逐条渲染；
     action 中文与色调取 flow-utils（事实源 = 服务端 FlowHistoryEntry 注释）
   - 无实例 / 宿主未注入 → 「暂无流转记录」空态，不请求不白屏
-->
<template>
  <view class="lc-tl">
    <view v-if="loading" class="lc-tl__hint">加载时间轴…</view>
    <view v-else-if="error" class="lc-tl__err">{{ error }}</view>
    <view v-else-if="entries.length === 0" class="lc-tl__hint">
      {{ props.recordId ? '暂无流转记录' : '时间轴（需绑定记录 id，如 $expr: urlParams.rid）' }}
    </view>
    <view v-else class="lc-tl__list">
      <view v-for="(e, i) in entries" :key="i" class="lc-tl__item">
        <view class="lc-tl__rail">
          <view class="lc-tl__dot" :class="'lc-tl__dot--' + tone(e.action)"></view>
          <view v-if="i < entries.length - 1" class="lc-tl__line"></view>
        </view>
        <view class="lc-tl__body">
          <view class="lc-tl__head">
            <text class="lc-tl__action">{{ label(e.action) }}</text>
            <text class="lc-tl__time">{{ fmtTime(e.at) }}</text>
          </view>
          <text class="lc-tl__meta">{{ e.nodeName }} · {{ e.actor }}</text>
          <text v-if="e.comment" class="lc-tl__comment">{{ e.comment }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import { LC_FLOW_HOST_KEY, type LcFlowHost } from '@lc/materials'
import {
  ACTION_LABEL,
  ACTION_TONE,
  fetchFlowInstance,
  fmtTime,
  type FlowHistoryEntryLike,
  type FlowInstanceLike,
} from '../flow-utils'

const props = defineProps<{
  /** 记录主键（defaultProps 绑 `$expr: urlParams.rid`；空 = 占位不请求） */
  recordId?: string
  modelId?: string
  flowId?: string
}>()

const host = inject(LC_FLOW_HOST_KEY, undefined)

const loading = ref(true)
const error = ref('')
const inst = ref<FlowInstanceLike | null>(null)

/** history 正序（提交在上，与审批推进同向） */
const entries = computed<FlowHistoryEntryLike[]>(() => inst.value?.history ?? [])

function label(action: string): string {
  return ACTION_LABEL[action] ?? action
}

function tone(action: string): 'ok' | 'no' | 'warn' {
  return ACTION_TONE[action] ?? 'ok'
}

async function load(): Promise<void> {
  if (!props.recordId) {
    loading.value = false
    inst.value = null
    return
  }
  if (!host) {
    loading.value = false
    error.value = '审批宿主未注入（宿主需 provide flow host）'
    return
  }
  loading.value = true
  error.value = ''
  try {
    inst.value = await fetchFlowInstance(host, {
      recordId: props.recordId,
      modelId: props.modelId,
      flowId: props.flowId,
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '时间轴加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
watch(
  () => [props.recordId, props.modelId, props.flowId],
  () => void load(),
)
</script>

<style scoped>
.lc-tl {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-tl__hint {
  text-align: center;
  color: var(--lc-text-tertiary);
  font-size: var(--lc-font-body-sm);
  padding: 20rpx 0;
}
.lc-tl__err {
  text-align: center;
  color: var(--lc-status-danger);
  font-size: var(--lc-font-caption);
}
.lc-tl__list {
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-md);
  padding: var(--lc-space-1) 0;
}
.lc-tl__item {
  display: flex;
  gap: 20rpx;
}
.lc-tl__rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22rpx 0 0;
}
.lc-tl__dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  flex-shrink: 0;
}
.lc-tl__dot--ok {
  background: var(--lc-status-success);
}
.lc-tl__dot--no {
  background: var(--lc-status-danger);
}
.lc-tl__dot--warn {
  background: var(--lc-status-warning);
}
.lc-tl__line {
  width: 2rpx;
  flex: 1;
  min-height: 40rpx;
  background: var(--lc-border-default);
  margin-top: 6rpx;
}
.lc-tl__body {
  flex: 1;
  padding: 18rpx var(--lc-space-3) 18rpx 0;
  border-bottom: 1rpx solid var(--lc-border-default);
  display: flex;
  flex-direction: column;
}
.lc-tl__item:last-child .lc-tl__body {
  border-bottom: none;
}
.lc-tl__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lc-tl__action {
  font-size: var(--lc-font-body);
  font-weight: 600;
  color: var(--lc-text-primary);
}
.lc-tl__time {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.lc-tl__meta {
  margin-top: 6rpx;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.lc-tl__comment {
  margin-top: var(--lc-space-1);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
  background: var(--lc-bg-canvas);
  border-radius: var(--lc-radius-xs);
  padding: 10rpx 14rpx;
}
</style>
