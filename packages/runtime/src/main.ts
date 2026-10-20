import { createSSRApp } from 'vue'
import App from './App.vue'
// 设计令牌必须先于任何组件样式生效。移动端用 rpx 变体（由 tokens.css 派生，见
// scripts/build-tokens-rpx.mjs）—— 单一令牌源，单位按端换算。
import '@lc/tokens/tokens.rpx.css'
import { initTheme } from './theme'

/** uni-app vue3 标准入口（SSR/H5/小程序共用） */
export function createApp(): { app: ReturnType<typeof createSSRApp> } {
  // 主题在挂载前落到根节点，避免首帧闪色；非 H5 端内部自行判空
  initTheme()

  const app = createSSRApp(App)
  return { app }
}
