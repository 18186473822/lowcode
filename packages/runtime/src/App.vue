<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { initTheme, applyAppTheme } from './theme'
import { getThemeCache } from './api'

onLaunch(() => {
  // 批 3：系统 dark 跟随 + 应用主题缓存恢复（bootstrap 之前的直达页也有主题）
  initTheme()
  applyAppTheme(getThemeCache() ?? undefined)
  console.log('[lc-runtime] App launch')
})
</script>

<style>
/* 全局基线：统一背景与字号，物料一律 rpx（方案 4.2 规范 3） */
page {
  background: var(--lc-bg-canvas);
  font-size: var(--lc-font-body);
}
</style>
