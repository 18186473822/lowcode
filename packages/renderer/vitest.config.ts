// @lc/renderer 包级 vitest 配置：
//  - plugin-vue：让 vitest 能编译 src/uni/*.vue（组件层冒烟测试）
//  - environmentMatchGlobs：仅 `test/uni/**`（组件测试）用 jsdom；其余纯逻辑测试
//    保持默认 node 环境（更快且行为不变）。
// 注：根聚合 `pnpm coverage`（config/vitest.projects.ts）引用本目录时会自动加载本配置。
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environmentMatchGlobs: [['test/uni/**', 'jsdom']],
    // B-45：workspace 聚合模式下根配置的 rpcTimeout 不下发到 worker（实证 180/600 均无效，
    // worker 走默认 ~10s）—— v8 coverage 收集阻塞 main 应答 >10s 即报 `snapshotSaved` 超时
    // 污染 exit code。项目配置是 worker 实际持有的配置，放这里才生效。
    rpcTimeout: 600_000,
  },
})
