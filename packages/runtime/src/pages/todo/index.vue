<!--
  待办中心列表页（Phase 3 批 2，菜单 target:'todoList' 的壳内置落点）。

  - 数据：GET /flows/tasks/todo（服务端 canDecide 权威过滤，无需前端再判权限）
  - onShow 重拉：审批详情页处理完返回后列表即时刷新
  - 点行 → /pages/todo/detail?instanceId=（详情页按实例取记录 + 物料渲染审批条/时间轴）
  - 401 → 清会话回登录（与菜单页同款守卫，错误不静默）
-->
<template>
  <view class="todo">
    <!-- 加载中 -->
    <view v-if="loading" class="todo__state">
      <text class="todo__state-text">加载待办…</text>
    </view>

    <!-- 错误：红字 + 重试（401 附去登录） -->
    <view v-else-if="error" class="todo__state">
      <text class="todo__err">{{ error }}</text>
      <view class="todo__acts">
        <button class="todo__btn" size="mini" @tap="load">重试</button>
        <button v-if="needLogin" class="todo__btn todo__btn--ghost" size="mini" @tap="goLogin">
          去登录
        </button>
      </view>
    </view>

    <!-- 空态 -->
    <view v-else-if="list.length === 0" class="todo__state">
      <text class="todo__empty">暂无待办，所有任务都处理完了</text>
    </view>

    <!-- 待办列表 -->
    <view v-else class="todo__list">
      <view
        v-for="t in list"
        :key="t.taskId"
        class="todo__cell"
        hover-class="todo__cell--hover"
        @tap="open(t)"
      >
        <view class="todo__main">
          <view class="todo__head">
            <text class="todo__flow">{{ t.flowName }}</text>
            <text class="todo__node">{{ t.nodeName }}</text>
          </view>
          <text class="todo__meta">发起：{{ t.createdBy }} · {{ fmtTime(t.createdAt) }}</text>
        </view>
        <text class="todo__arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import type { TodoTask } from '@/api'
import { ApiError, clearSession, fetchTodoTasks, getToken } from '@/api'
import { fmtTime } from '@/flow-time'

const list = ref<TodoTask[]>([])
const loading = ref(true)
const error = ref('')
const needLogin = ref(false)

/** 每次进入都重拉（详情处理完 navigateBack 回来即刷新） */
onShow(() => void load())

async function load(): Promise<void> {
  error.value = ''
  needLogin.value = false
  if (!getToken()) {
    goLogin()
    return
  }
  loading.value = true
  try {
    list.value = await fetchTodoTasks()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      clearSession()
      needLogin.value = true
      error.value = '登录已过期'
    } else {
      error.value = e instanceof ApiError ? e.message : '加载待办失败'
    }
  } finally {
    loading.value = false
  }
}

function open(t: TodoTask): void {
  uni.navigateTo({
    url: `/pages/todo/detail?instanceId=${encodeURIComponent(t.instanceId)}&taskId=${encodeURIComponent(t.taskId)}`,
  })
}

function goLogin(): void {
  uni.redirectTo({ url: '/pages/login/index' })
}
</script>

<style scoped>
.todo {
  min-height: 100vh;
  background: var(--lc-bg-subtle);
  padding: var(--lc-space-3);
  box-sizing: border-box;
}
.todo__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: var(--lc-space-12) 0;
}
.todo__state-text {
  color: var(--lc-text-secondary);
  font-size: 27rpx;
}
.todo__err {
  color: var(--lc-status-danger);
  font-size: 27rpx;
}
.todo__empty {
  color: var(--lc-text-secondary);
  font-size: 27rpx;
}
.todo__acts {
  display: flex;
  gap: 20rpx;
}
.todo__btn {
  background: var(--lc-action-primary);
  color: var(--lc-text-on-brand);
}
.todo__btn--ghost {
  background: var(--lc-bg-surface);
  color: var(--lc-action-primary);
}
.todo__list {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
}
.todo__cell {
  display: flex;
  align-items: center;
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-md);
  padding: 26rpx var(--lc-space-3);
}
.todo__cell--hover {
  background: var(--lc-bg-subtle);
}
.todo__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.todo__head {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.todo__flow {
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.todo__node {
  font-size: var(--lc-font-micro);
  color: var(--lc-action-primary);
  background: var(--lc-action-primary-subtle);
  border-radius: 999rpx;
  padding: 4rpx var(--lc-space-2);
}
.todo__meta {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.todo__arrow {
  font-size: 40rpx;
  color: var(--lc-icon-muted);
  padding-left: var(--lc-space-2);
}
</style>
