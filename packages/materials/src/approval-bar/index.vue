<!--
  ApprovalBar 物料 —— 审批操作条（Phase 3 批 2，主方案 8.6 审批物料之一）。

  接口对齐 lc-node：`<lc-approval-bar v-bind="model.props" @decided="..." />`
   - recordId: 记录主键（defaultProps 已带 `$expr: urlParams.rid`，详情页路由即自动绑定，
     resolve 阶段求值；designer 画布 urlParams 恒空 → 求值空 → 空态占位，零请求）
   - modelId / flowId: 多流程场景过滤（可空）
   - 数据通道：inject `LC_FLOW_HOST_KEY`（lc-renderer provide，D-P3-4）——
     未注入或 recordId 空时只渲染占位，不发请求、不白屏
   - 可审判定：当前 pending 任务 ∈ 我的待办（GET tasks/todo 比对）；最终动作以服务端 decide 为准
   - 意见输入：uni.showModal({editable})（H5/MP 真实可用）→ 不可用降级 host.confirm（无意见）
   - emit('decided', {action, status, instanceId})：节点 actions 可联动（如刷新数据源）
-->
<template>
  <view class="lc-ab">
    <!-- 加载中 -->
    <view v-if="loading" class="lc-ab__hint">加载审批状态…</view>

    <!-- 终态 -->
    <view v-else-if="inst && inst.status === 'approved'" class="lc-ab__banner lc-ab__banner--ok">
      <text class="lc-ab__banner-icon">✓</text>
      <text class="lc-ab__banner-text">审批已通过</text>
      <text v-if="decidedBy" class="lc-ab__banner-meta">{{ decidedBy }}</text>
    </view>
    <view v-else-if="inst && inst.status === 'rejected'" class="lc-ab__banner lc-ab__banner--no">
      <text class="lc-ab__banner-icon">✗</text>
      <text class="lc-ab__banner-text">审批已驳回</text>
      <text v-if="decidedBy" class="lc-ab__banner-meta">{{ decidedBy }}</text>
    </view>

    <!-- running + 当前用户可审：节点提示 + 同意 / 驳回 -->
    <view v-else-if="canDecide && currentTask" class="lc-ab__wrap">
      <text class="lc-ab__node">当前节点：{{ currentTask.nodeName }}</text>
      <view class="lc-ab__row">
        <button
          class="lc-ab__btn lc-ab__btn--ok"
          size="mini"
          :disabled="busy"
          @click="onDecide('approve')"
        >
          {{ busy ? '提交中…' : '同意' }}
        </button>
        <button class="lc-ab__btn lc-ab__btn--no" size="mini" :disabled="busy" @click="onDecide('reject')">
          驳回
        </button>
      </view>
    </view>

    <!-- running + 不可审：状态提示 -->
    <view v-else-if="inst && currentTask" class="lc-ab__hint">
      等待「{{ currentTask.nodeName }}」处理
    </view>

    <!-- 未绑定 / 无实例 / 宿主缺失：占位（designer 画布即此态） -->
    <view v-else class="lc-ab__hint lc-ab__hint--muted">
      {{ hint }}
    </view>

    <view v-if="error" class="lc-ab__err">{{ error }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import { LC_FLOW_HOST_KEY, type LcFlowHost } from '@lc/materials'
import { fetchFlowInstance, type FlowInstanceLike, type FlowTaskLike } from '../flow-utils'

const props = defineProps<{
  /** 记录主键（defaultProps 绑 `$expr: urlParams.rid`；空 = 占位不请求） */
  recordId?: string
  modelId?: string
  flowId?: string
}>()

const emit = defineEmits<{
  /** 审批动作完成（服务端 200 后）：actions 可据此配刷新/跳转 */
  decided: [result: { action: 'approve' | 'reject'; status: string; instanceId: string }]
}>()

const host = inject(LC_FLOW_HOST_KEY, undefined)

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const inst = ref<FlowInstanceLike | null>(null)
const canDecide = ref(false)
/** 同一审批动作重试复用 Idempotency-Key；动作/意见变化才换新键 */
const retryKey = ref('')
const retrySignature = ref('')

/** 当前停留节点的 pending 任务 */
const currentTask = computed<FlowTaskLike | null>(() => {
  const i = inst.value
  if (!i || i.status !== 'running' || !i.currentNodeId) return null
  return i.tasks.find((t) => t.status === 'pending' && t.nodeId === i.currentNodeId) ?? null
})

/** 终态最近一次决策人（同意/驳回 actor） */
const decidedBy = computed(() => {
  const i = inst.value
  if (!i) return ''
  const t = [...i.tasks].reverse().find((x) => x.status !== 'pending')
  return t?.decidedBy ?? ''
})

/** 占位文案：绑定缺失（提示配法）vs 该记录确实无流程实例 */
const hint = computed(() => {
  if (!props.recordId) return '审批条（需绑定记录 id，如 $expr: urlParams.rid）'
  return '暂无审批流'
})

async function load(): Promise<void> {
  if (!props.recordId) {
    // 画布 / 未绑定：占位，不发请求
    loading.value = false
    inst.value = null
    canDecide.value = false
    return
  }
  if (!host) {
    loading.value = false
    error.value = '审批宿主未注入（宿主需 provide flow host）'
    return
  }
  loading.value = true
  error.value = ''
  canDecide.value = false
  try {
    inst.value = await fetchFlowInstance(host, {
      recordId: props.recordId,
      modelId: props.modelId,
      flowId: props.flowId,
    })
    const t = currentTask.value
    if (t) {
      const res = await host.request({ method: 'GET', url: '/api/v1/flows/tasks/todo' })
      canDecide.value =
        res.statusCode === 200 &&
        (((res.data as { items?: Array<{ taskId: string }> })?.items ?? []).some(
          (x) => x.taskId === t.id,
        ))
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '审批状态加载失败'
  } finally {
    loading.value = false
  }
}

/** 意见输入：uni.showModal(editable) 可用则用之；否则 host.confirm 降级（无意见）；再否则取消 */
async function askComment(
  action: 'approve' | 'reject',
): Promise<{ confirm: boolean; comment: string }> {
  const title = action === 'approve' ? '同意' : '驳回'
  if (typeof uni !== 'undefined' && typeof uni.showModal === 'function') {
    return new Promise((resolve) => {
      uni.showModal({
        title,
        editable: true,
        placeholderText: '审批意见（可选）',
        success: (r) => resolve({ confirm: !!r.confirm, comment: (r as { content?: string }).content ?? '' }),
        fail: () => resolve({ confirm: false, comment: '' }),
      })
    })
  }
  if (host?.confirm) {
    const confirm = await host.confirm({
      text: action === 'approve' ? '确认同意该申请？' : '确认驳回该申请？',
      confirmText: title,
      cancelText: '取消',
    })
    return { confirm, comment: '' }
  }
  return { confirm: false, comment: '' }
}

/** UUID v4 优先；小程序无 crypto 时退回时间戳 + 随机串（≤128 字符即可） */
function makeIdempotencyKey(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID()
  return `flow-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

async function onDecide(action: 'approve' | 'reject'): Promise<void> {
  const i = inst.value
  const t = currentTask.value
  if (!i || !t || !host || busy.value) return
  const ask = await askComment(action)
  if (!ask.confirm) return

  const signature = `${i.id}|${t.id}|${action}|${ask.comment.trim()}`
  if (retrySignature.value !== signature || !retryKey.value) {
    retryKey.value = makeIdempotencyKey()
    retrySignature.value = signature
  }
  const idempotencyKey = retryKey.value

  busy.value = true
  error.value = ''
  try {
    const res = await host.request({
      method: 'POST',
      url: `/api/v1/flows/instances/${i.id}/tasks/${t.id}`,
      data: { action, comment: ask.comment || undefined },
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    if (res.statusCode !== 200) {
      const body = res.data as { message?: string } | null
      error.value = body?.message ?? `审批失败（${res.statusCode}）`
      return
    }
    // 成功即消费该键；后续新动作重新生成
    retryKey.value = ''
    retrySignature.value = ''
    const after = res.data as FlowInstanceLike
    if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
      uni.showToast({ title: action === 'approve' ? '已同意' : '已驳回', icon: 'success' })
    }
    emit('decided', { action, status: after.status, instanceId: i.id })
    await load()
  } finally {
    busy.value = false
  }
}

onMounted(() => void load())
// 路由参数晚于挂载求值（$expr: urlParams.rid）→ recordId 变化即重拉
watch(
  () => [props.recordId, props.modelId, props.flowId],
  () => void load(),
)
</script>

<style scoped>
.lc-ab {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-ab__hint {
  text-align: center;
  color: var(--lc-text-secondary);
  font-size: var(--lc-font-body-sm);
  padding: 20rpx 0;
}
.lc-ab__hint--muted {
  color: var(--lc-text-tertiary);
}
.lc-ab__wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--lc-space-1);
  padding: var(--lc-space-1) 0;
}
.lc-ab__node {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.lc-ab__row {
  display: flex;
  gap: var(--lc-space-3);
  justify-content: center;
  padding: var(--lc-space-1) 0;
}
.lc-ab__btn {
  min-width: 200rpx;
  border-radius: 999rpx;
  font-size: var(--lc-font-body);
}
.lc-ab__btn--ok {
  background: var(--lc-status-success-bg);
  color: var(--lc-status-success);
  border: 1rpx solid var(--lc-status-success);
}
.lc-ab__btn--no {
  background: var(--lc-status-danger-bg);
  color: var(--lc-status-danger);
  border: 1rpx solid var(--lc-status-danger);
}
.lc-ab__banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 22rpx;
  border-radius: var(--lc-radius-sm);
  font-size: 27rpx;
}
.lc-ab__banner--ok {
  background: var(--lc-status-success-bg);
  color: var(--lc-status-success);
}
.lc-ab__banner--no {
  background: var(--lc-status-danger-bg);
  color: var(--lc-status-danger);
}
.lc-ab__banner-icon {
  font-weight: var(--lc-weight-bold);
}
.lc-ab__banner-meta {
  font-size: var(--lc-font-micro);
  opacity: 0.75;
}
.lc-ab__err {
  margin-top: 12rpx;
  text-align: center;
  color: var(--lc-status-danger);
  font-size: var(--lc-font-caption);
}
</style>
