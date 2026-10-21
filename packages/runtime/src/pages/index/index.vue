<template>
  <view class="menu">
    <!-- 顶栏：当前用户 + 退出 -->
    <view class="menu__top">
      <view class="menu__who">
        <text class="menu__hello">你好，{{ me }}</text>
        <text class="menu__sub">选择页面开始使用</text>
      </view>
      <text class="menu__logout" @tap="onLogout">退出</text>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="menu__state">
      <text class="menu__state-text">加载应用菜单…</text>
    </view>

    <!-- 失败：红字 + 重试，不静默 -->
    <view v-else-if="error" class="menu__state">
      <text class="menu__err">{{ error }}</text>
      <button class="menu__retry" size="mini" @tap="load">重试</button>
    </view>

    <!-- 应用分组列表 -->
    <view v-else>
      <view v-for="app in apps" :key="app.id" class="menu__group">
        <text class="menu__group-name">{{ app.name }}</text>
        <view class="menu__card">
          <view
            v-for="p in app.pages"
            :key="p.id"
            class="menu__cell"
            hover-class="menu__cell--hover"
            @tap="openPage(p.id)"
          >
            <view class="menu__cell-main">
              <text class="menu__cell-name">{{ p.name }}</text>
              <text class="menu__cell-meta">v{{ p.currentVersion }} · {{ p.updatedAt.slice(0, 10) }}</text>
            </view>
            <text class="menu__badge" :class="'menu__badge--' + p.status">
              {{ p.status === 'published' ? '已发布' : '草稿' }}
            </text>
          </view>
          <view v-if="app.pages.length === 0" class="menu__cell">
            <text class="menu__cell-meta">暂无页面，请先在设计器中创建并保存</text>
          </view>
        </view>
      </view>

      <!-- 工作台：壳内置能力（Phase 3 批 2 待办中心） -->
      <view class="menu__group">
        <text class="menu__group-name">工作台</text>
        <view class="menu__card">
          <view class="menu__cell" hover-class="menu__cell--hover" @tap="openTodo">
            <view class="menu__cell-main">
              <text class="menu__cell-name">待办中心</text>
              <text class="menu__cell-meta">我的审批任务（同意 / 驳回 / 流转时间轴）</text>
            </view>
            <text class="menu__arrow">›</text>
          </view>
        </view>
      </view>

      <!-- 壳自带的静态演示入口 -->
      <view class="menu__group">
        <text class="menu__group-name">内置演示</text>
        <view class="menu__card">
          <view class="menu__cell" hover-class="menu__cell--hover" @tap="openDemo">
            <view class="menu__cell-main">
              <text class="menu__cell-name">物料 12 个静态演示</text>
              <text class="menu__cell-meta">Phase 1 手写 JSON 渲染验证页</text>
            </view>
            <text class="menu__arrow">›</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import type { BootstrapApp, SessionUser } from '@/api'
import { ApiError, bootstrap, clearSession, displayName, getUser, getToken } from '@/api'
import { applyAppTheme } from '@/theme'

const apps = ref<BootstrapApp[]>([])
const user = ref<SessionUser | null>(null)
const loading = ref(true)
const error = ref('')

const me = computed(() => displayName(user.value ?? getUser()))

/** 每次进入页面都校验登录态并拉菜单（登录页跳回后立即生效） */
onShow(() => {
  void load()
})

async function load(): Promise<void> {
  error.value = ''
  if (!getToken()) {
    redirectToLogin()
    return
  }

  loading.value = true
  try {
    const data = await bootstrap()
    user.value = data.user
    apps.value = data.apps
    // 批 3 D-P3-8：配置主题落地（primary/radius 变量 + 显式 dark；无配置则 no-op）
    applyAppTheme(data.theme)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // 令牌过期/无效 → 清会话回登录页
      clearSession()
      redirectToLogin()
      return
    }
    error.value = e instanceof ApiError ? e.message : '加载菜单失败'
  } finally {
    loading.value = false
  }
}

function openPage(pageId: string): void {
  uni.navigateTo({ url: `/pages/view/index?pageId=${encodeURIComponent(pageId)}` })
}

function openDemo(): void {
  uni.navigateTo({ url: '/pages-demo/index' })
}

/** 待办中心（内置页，批 2） */
function openTodo(): void {
  uni.navigateTo({ url: '/pages/todo/index' })
}

function onLogout(): void {
  clearSession()
  redirectToLogin()
}

function redirectToLogin(): void {
  uni.redirectTo({ url: '/pages/login/index' })
}
</script>

<style scoped>
.menu {
  min-height: 100vh;
  padding: var(--lc-space-4) var(--lc-space-4) var(--lc-space-8);
  box-sizing: border-box;
}
.menu__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--lc-gradient-brand);
  border-radius: 20rpx;
  padding: 36rpx var(--lc-space-4);
  margin-bottom: 36rpx;
}
.menu__who {
  display: flex;
  flex-direction: column;
}
.menu__hello {
  color: var(--lc-text-on-brand);
  font-size: 34rpx;
  font-weight: var(--lc-weight-semibold);
}
.menu__sub {
  margin-top: var(--lc-space-1);
  color: var(--lc-text-on-brand-muted);
  font-size: var(--lc-font-caption);
}
.menu__logout {
  color: var(--lc-text-on-brand);
  font-size: var(--lc-font-body-sm);
  padding: 12rpx var(--lc-space-3);
  border: 1rpx solid var(--lc-text-on-brand-muted);
  border-radius: 999rpx;
}
.menu__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}
.menu__state-text {
  color: var(--lc-text-tertiary);
  font-size: var(--lc-font-body);
}
.menu__err {
  color: var(--lc-status-danger);
  font-size: var(--lc-font-body);
  margin-bottom: var(--lc-space-3);
}
.menu__retry {
  background: var(--lc-action-primary);
  color: var(--lc-text-on-brand);
  border-radius: 999rpx;
}
.menu__group {
  margin-bottom: var(--lc-space-5);
}
.menu__group-name {
  display: block;
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
  margin-bottom: var(--lc-space-2);
}
.menu__card {
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-md);
  overflow: hidden;
}
.menu__cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx 28rpx;
  border-bottom: 1rpx solid var(--lc-border-default);
}
.menu__cell:last-child {
  border-bottom: none;
}
.menu__cell--hover {
  background: var(--lc-bg-canvas);
}
.menu__cell-main {
  display: flex;
  flex-direction: column;
}
.menu__cell-name {
  font-size: var(--lc-font-body-lg);
  color: var(--lc-text-primary);
}
.menu__cell-meta {
  margin-top: 6rpx;
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.menu__badge {
  font-size: var(--lc-font-micro);
  padding: 6rpx var(--lc-space-2);
  border-radius: 999rpx;
}
.menu__badge--published {
  background: var(--lc-status-success-bg);
  color: var(--lc-status-success);
}
.menu__badge--draft {
  background: var(--lc-bg-surface)4e0;
  color: var(--lc-status-warning);
}
.menu__arrow {
  font-size: 40rpx;
  color: var(--lc-border-strong);
}
</style>
