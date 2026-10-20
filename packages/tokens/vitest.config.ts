/**
 * vitest 配置 —— @lc/tokens
 *
 * 令牌包没有 DOM 依赖，测试读的是磁盘上的 tokens.css 文本，故用 node 环境。
 * 刻意不继承任何构建配置（令牌是纯文本 + 常量，不需要打包）。
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // B-45：workspace 聚合下 worker 的 RPC 超时只认项目配置（根配置不下发），
    // 放宽防 v8 coverage 收集阻塞期误报 `snapshotSaved` 超时污染 exit code。
    rpcTimeout: 600_000,
  },
})
