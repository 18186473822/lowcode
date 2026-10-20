// @lc/designer 包级 vitest 配置：shim / 画布均为组件测试 → 全 jsdom。
// 根聚合（config/vitest.projects.ts）引用本目录时自动加载本配置。
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    // B-45：workspace 聚合下 worker 的 RPC 超时只认项目配置（根配置不下发），
    // 放宽防 v8 coverage 收集阻塞期误报 `snapshotSaved` 超时污染 exit code。
    rpcTimeout: 600_000,
  },
})
