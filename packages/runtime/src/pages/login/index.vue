<template>
  <view class="login">
    <view class="login__brand">
      <text class="login__title">低代码平台</text>
      <text class="login__sub">企业移动应用搭建 · 运行时壳</text>
    </view>

    <view class="login__card">
      <view class="login__field">
        <text class="login__label">用户名</text>
        <input
          v-model="username"
          class="login__input"
          placeholder="请输入用户名"
          placeholder-class="login__ph"
          confirm-type="next"
        />
      </view>
      <view class="login__field">
        <text class="login__label">密码</text>
        <input
          v-model="password"
          class="login__input"
          password
          placeholder="请输入密码"
          placeholder-class="login__ph"
          confirm-type="done"
          @confirm="onSubmit"
        />
      </view>

      <!-- 失败原因红字展示，不静默吞错 -->
      <text v-if="error" class="login__err">{{ error }}</text>

      <button class="login__btn" :disabled="loading" @tap="onSubmit">
        {{ loading ? '登录中…' : '登 录' }}
      </button>

      <text class="login__hint">演示账号 admin / admin123</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { ApiError, login } from '@/api'

/** 登录成功后的跳转目标（由守卫跳入时经 ?redirect= 传入，默认应用菜单） */
const redirect = ref('/pages/index/index')
const username = ref('admin')
const password = ref('')
const loading = ref(false)
const error = ref('')

onLoad((options) => {
  const raw = options?.redirect
  if (typeof raw === 'string' && raw.startsWith('/pages/')) {
    redirect.value = decodeURIComponent(raw)
  }
})

async function onSubmit(): Promise<void> {
  if (loading.value) return
  error.value = ''

  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名与密码'
    return
  }

  loading.value = true
  try {
    await login(username.value.trim(), password.value)
    uni.redirectTo({ url: redirect.value })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login {
  min-height: 100vh;
  padding: 120rpx 60rpx 0;
  box-sizing: border-box;
  background: var(--lc-gradient-brand);
}
.login__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: var(--lc-space-8);
}
.login__title {
  color: var(--lc-text-on-brand);
  font-size: 48rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
}
.login__sub {
  margin-top: var(--lc-space-2);
  color: var(--lc-text-on-brand-muted);
  font-size: var(--lc-font-body-sm);
}
.login__card {
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-lg);
  padding: var(--lc-space-6) var(--lc-space-5);
}
.login__field {
  margin-bottom: 36rpx;
}
.login__label {
  display: block;
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
  margin-bottom: 12rpx;
}
.login__input {
  height: 88rpx;
  background: var(--lc-bg-canvas);
  border-radius: var(--lc-radius-sm);
  padding: 0 var(--lc-space-3);
  font-size: var(--lc-font-body-lg);
}
.login__ph {
  color: var(--lc-text-tertiary);
}
.login__err {
  display: block;
  color: var(--lc-status-danger);
  font-size: var(--lc-font-body-sm);
  margin: -12rpx 0 var(--lc-space-3);
}
.login__btn {
  margin-top: var(--lc-space-1);
  background: var(--lc-action-primary);
  color: var(--lc-text-on-brand);
  border-radius: var(--lc-radius-sm);
  font-size: var(--lc-font-h3);
  height: 92rpx;
  line-height: 92rpx;
}
.login__btn[disabled] {
  background: var(--lc-brand-300);
  color: var(--lc-text-on-brand);
}
.login__hint {
  display: block;
  text-align: center;
  margin-top: 28rpx;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
</style>
