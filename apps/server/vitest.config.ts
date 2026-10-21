// apps/server 包级 vitest 配置：e2e 测试（真实 Nest 启动）→ 默认 node 环境，无插件。
// 存在意义（B-45）：workspace 聚合（pnpm coverage）下 worker 的 RPC 超时**只读项目配置**，
// 根 vitest.config.ts 的 rpcTimeout 不下发到 worker —— 放宽到 600s 防 v8 coverage
// 收集阻塞期 worker 误报 `Timeout calling "snapshotSaved"` 污染整体 exit code。
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    rpcTimeout: 600_000,
    // 本机 apps/server/.env 为 MySQL 开发连接；单测必须保持 JSON 路径。
    // 仅靠 test.env 会被 Vitest 自动加载的 .env 覆盖（2026-10-21 实测把测试页写进 lowcode），
    // 因此再用 setupFiles 在测试模块导入前强制 LC_STORAGE=json 并移除 DATABASE_URL。
    env: {
      LC_STORAGE: 'json',
    },
    setupFiles: ['./test/setup-json-storage.ts'],
  },
})
