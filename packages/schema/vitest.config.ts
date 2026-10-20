// @lc/schema 包级 vitest 配置：纯逻辑测试 → 默认 node 环境，无插件。
// 存在意义（B-45）：workspace 聚合（pnpm coverage）下 worker 的 RPC 超时**只读项目配置**，
// 根 vitest.config.ts 的 rpcTimeout 不下发到 worker —— 此前本包无本地配置，
// v8 coverage 收集阻塞 main 应答 >10s 时 worker 报 `Timeout calling "snapshotSaved"`
// 污染整体 exit code（测试本身全过）；项目配置放宽到 600s 消除误报。
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    rpcTimeout: 600_000,
  },
})
