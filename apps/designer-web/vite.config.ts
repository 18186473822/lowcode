import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * rpx → px（PLANS.md §1 D-A1）：uni 设计稿 750 宽，画布按 375px 渲染 → 1rpx = 0.5px。
 * 作用于全部 CSS；designer 自身样式只用 px 不会命中 rpx 正则，物料的 rpx 统一换算。
 */
function rpxToPx() {
  return {
    name: 'rpx-to-px',
    postcssPlugin: 'rpx-to-px',
    Declaration(decl: { value: string }): void {
      if (decl.value.includes('rpx')) {
        decl.value = decl.value.replace(
          /(-?\d*\.?\d+)rpx/g,
          (_, n: string) => `${parseFloat(n) * 0.5}px`,
        )
      }
    },
  }
}

export default defineConfig({
  plugins: [vue()],
  css: {
    postcss: {
      plugins: [rpxToPx()],
    },
  },
  server: {
    // 5173 可能被 runtime H5 dev 占用，设计器固定 5174
    port: 5174,
    // 显式绑 IPv4：缺省 host=localhost 会绑 ::1，本机 IPv6 回环被拦（EACCES）时
    // dev 页面直接 502、任何客户端都连不上（教训 B-29，与服务端测试同根因）。
    // 用 http://127.0.0.1:5174 访问。
    host: '127.0.0.1',
    // 批 3：/api 代理到 NestJS（默认 3000），避免跨域；
    // 同样用 127.0.0.1 —— vite→server 走 IPv4，绕开被拦的 ::1。
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
