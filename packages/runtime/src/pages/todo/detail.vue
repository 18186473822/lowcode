<!--
  审批详情页（Phase 3 批 2，待办中心内页）。

  - 入参：`?instanceId=`（必）+ `taskId=`（可选，仅供「本任务」语义留档）
  - 结构：实例状态头 + 记录字段 + **ApprovalBar / Timeline 物料**（easycom 解析，
    与低代码详情页里拖入的同一份组件 —— 一条审批 UI 两处复用，本页即物料的
    H5 实测现场）+ 字段区
  - decided 事件：物料自身已重拉，本页再刷实例头与记录字段（记录 status 会变）；
    Timeline 用 key 重建强制重拉（recordId/flowId 未变，watch 不触发）
  - 宿主注入（D-P3-4）：本页是独立 uni 页（不经 lc-renderer），物料的 inject 依赖
    **本页自己 provide**——与 view 页 options.host 同源（createUniHost）。
-->
<template>
  <view class="ad">
    <!-- 加载中 -->
    <view v-if="loading" class="ad__state">
      <text class="ad__state-text">加载审批…</text>
    </view>

    <!-- 错误：红字 + 返回/重试 -->
    <view v-else-if="error" class="ad__state">
      <text class="ad__err">{{ error }}</text>
      <view class="ad__acts">
        <button class="ad__btn" size="mini" @tap="load">重试</button>
        <button class="ad__btn ad__btn--ghost" size="mini" @tap="goBack">返回</button>
      </view>
    </view>

    <template v-else-if="inst">
      <!-- 实例状态头 -->
      <view class="ad__head" :class="`ad__head--${inst.status}`">
        <text class="ad__head-title">{{ headTitle }}</text>
        <text class="ad__head-sub">{{ headSub }}</text>
      </view>

      <!-- 记录字段 -->
      <view class="ad__card">
        <text class="ad__card-title">申请内容</text>
        <view v-if="recError" class="ad__rec-err">{{ recError }}</view>
        <view v-else-if="!record" class="ad__rec-loading">加载记录…</view>
        <template v-else>
          <view v-for="f in fields" :key="f.key" class="ad__cell">
            <text class="ad__cell-label">{{ f.name }}</text>
            <text class="ad__cell-value">{{ display(record[f.key]) }}</text>
          </view>
          <view v-if="fields.length === 0" class="ad__rec-loading">该模型暂无字段定义</view>
        </template>
      </view>

      <!-- 审批操作（物料自查可审性；不可审显示状态条） -->
      <view class="ad__card ad__card--flush">
        <lc-approval-bar
          :record-id="inst.recordId"
          :model-id="inst.modelId"
          :flow-id="inst.flowId"
          @decided="onDecided"
        />
      </view>

      <!-- 流转时间轴（key 重建 → decided 后重拉） -->
      <view class="ad__card ad__card--flush">
        <text class="ad__card-title ad__card-title--inset">流转记录</text>
        <lc-timeline
          :key="tlKey"
          :record-id="inst.recordId"
          :model-id="inst.modelId"
          :flow-id="inst.flowId"
        />
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { LC_FLOW_HOST_KEY, type LcFlowHost } from '@lc/materials'
import type { FlowInstance } from '@/api'
import { ApiError, fetchFlowInstance, fetchModelDef, fetchRecordById } from '@/api'
import { createUniHost } from '@/host'

// 审批物料（ApprovalBar/Timeline）经 inject 取宿主 —— 本页不经过 lc-renderer，自行 provide
provide(LC_FLOW_HOST_KEY, createUniHost() as LcFlowHost)

const instanceId = ref('')
const inst = ref<FlowInstance | null>(null)
const fields = ref<Array<{ key: string; name: string }>>([])
const record = ref<Record<string, unknown> | null>(null)
const recError = ref('')
const loading = ref(true)
const error = ref('')
/** Timeline 重建键（decided 后 +1 强制重拉流转记录） */
const tlKey = ref(0)

const headTitle = computed(() => {
  const i = inst.value
  if (!i) return ''
  if (i.status === 'approved') return '审批已通过'
  if (i.status === 'rejected') return '审批已驳回'
  const cur = i.currentNodeId ? i.tasks.find((t) => t.status === 'pending' && t.nodeId === i.currentNodeId) : null
  return `待「${cur?.nodeName ?? '审批'}」处理`
})

const headSub = computed(() => {
  const i = inst.value
  if (!i) return ''
  return `发起人：${i.createdBy}`
})

onLoad((opt) => {
  const id = typeof opt?.instanceId === 'string' ? opt.instanceId : ''
  if (!id) {
    error.value = '缺少 instanceId 参数'
    loading.value = false
    return
  }
  instanceId.value = id
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const i = await fetchFlowInstance(instanceId.value)
    inst.value = i
    // 记录与模型并行拉；失败只标字段区错误（头部与审批条不受影响）
    recError.value = ''
    record.value = null
    fields.value = []
    const [mdl, rec] = await Promise.all([
      fetchModelDef(i.modelId).catch(() => null),
      fetchRecordById(i.modelId, i.recordId).catch(() => null),
    ])
    fields.value = mdl?.fields ?? []
    record.value = rec
    if (!rec) recError.value = '记录加载失败（可能已被删除）'
    uni.setNavigationBarTitle({ title: '审批详情' })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      error.value = '流程实例不存在或已被清理'
    } else if (e instanceof ApiError && e.status === 401) {
      error.value = '登录已过期，请重新登录'
    } else {
      error.value = e instanceof ApiError ? e.message : '加载审批失败'
    }
  } finally {
    loading.value = false
  }
}

/** 物料审批完成：重拉实例头与记录字段（记录 status 已回写），Timeline 重建重拉 */
function onDecided(): void {
  tlKey.value += 1
  void load()
}

/** 只读值格式化（与 lc-detail-page displayCell 同口径） */
function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function goBack(): void {
  uni.navigateBack({
    delta: 1,
    fail: () => void uni.redirectTo({ url: '/pages/todo/index' }),
  })
}
</script>

<style scoped>
.ad {
  min-height: 100vh;
  background: var(--lc-bg-subtle);
  padding: var(--lc-space-3);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.ad__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: var(--lc-space-12) 0;
}
.ad__state-text {
  color: var(--lc-text-secondary);
  font-size: 27rpx;
}
.ad__err {
  color: var(--lc-status-danger);
  font-size: 27rpx;
  text-align: center;
  padding: 0 var(--lc-space-5);
}
.ad__acts {
  display: flex;
  gap: 20rpx;
}
.ad__btn {
  background: var(--lc-action-primary);
  color: var(--lc-text-on-brand);
}
.ad__btn--ghost {
  background: var(--lc-bg-surface);
  color: var(--lc-action-primary);
}
.ad__head {
  border-radius: var(--lc-radius-md);
  padding: 30rpx 28rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.ad__head--running {
  background: var(--lc-action-primary-subtle);
}
.ad__head--approved {
  background: var(--lc-status-success-bg);
}
.ad__head--rejected {
  background: var(--lc-status-danger-bg);
}
.ad__head-title {
  font-size: var(--lc-font-h3);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.ad__head-sub {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.ad__card {
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-md);
  padding: 26rpx var(--lc-space-3);
}
.ad__card--flush {
  padding: var(--lc-space-2) 0;
}
.ad__card-title {
  display: block;
  font-size: 27rpx;
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
  margin-bottom: var(--lc-space-2);
}
.ad__card-title--inset {
  padding: var(--lc-space-1) var(--lc-space-3) 0;
}
.ad__cell {
  display: flex;
  justify-content: space-between;
  gap: var(--lc-space-3);
  padding: var(--lc-space-2) 0;
  border-bottom: 1rpx solid var(--lc-border-default);
}
.ad__cell:last-child {
  border-bottom: none;
}
.ad__cell-label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
  flex-shrink: 0;
}
.ad__cell-value {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-primary);
  text-align: right;
  word-break: break-all;
}
.ad__rec-err {
  color: var(--lc-status-danger);
  font-size: 25rpx;
  padding: 12rpx 0;
}
.ad__rec-loading {
  color: var(--lc-text-secondary);
  font-size: 25rpx;
  padding: 12rpx 0;
}
</style>
