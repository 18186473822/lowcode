// 根 vitest 配置 —— 只对 `pnpm coverage`（workspace 聚合）生效；
// 日常 `pnpm test` = `pnpm -r test`（各包独立、默认配置，不受本文件影响）。
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 批 6（B-38）：coverage 聚合 5 项目 46 文件时，vitest 2.1.9 满载（24 核默认 23 worker）
    // 稳定出现 2 次 `Timeout calling "snapshotSaved"`（v8 coverage 收集阻塞 main 端 RPC 应答；
    // 测试 795 全过、阈值全过，仅 exit code 被污染）。限并发 + 放宽 RPC 超时消除误报。
    // 批 3（B-45）实证：`--workspace` 模式下**本文件的 test 配置不下发到 worker**
    //   （rpcTimeout 180s/600s 均无效，见轮次实测：总时长 115s/220s 却报 10s 默认超时；
    //    maxWorkers 同理不生效）。根因二：v8 coverage 收集阻塞 main 应答 >10s 即触发，
    //   与并发无关（串行同样触发）→ 限并发治不了。
    // 处置（B-45 根治）：rpcTimeout 下沉到**各项目配置**（worker 实际持有的那份）——
    //   6 包 vitest.config.ts 各设 `rpcTimeout: 600_000`；命令侧加 `--no-file-parallelism`
    //   消除并发 fetch 超时（实测 8 轮中并发 3 轮出 `Timeout calling "fetch"`）。
    //   本文件保留的 workers/rpcTimeout 仅供「不带 --workspace 直接跑根配置」的场景，勿依赖。
    maxWorkers: 8,
    minWorkers: 2,
    rpcTimeout: 600_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      // 只统计「有测试价值的实现源码」：
      include: ['packages/*/src/**', 'apps/server/src/**'],
      exclude: [
        '**/*.d.ts',
        '**/dist/**', // 构建产物（含 packages/runtime/dist 的 h5/mp 产物）
        '**/node_modules/**',
        '**/*.test.ts', // 测试文件自身
        '**/tests/**',
        '**/test/**',
        'apps/server/src/main.ts', // 服务 bootstrap 入口：由「真实启动冒烟」覆盖（见台账验证步骤），单测不 import
        // runtime 工程（uni 壳 + demo）无 jsdom 测试，覆盖率由实机冒烟代替（台账 L-5）。
        // materials 物料（uni 内置组件 <input>/<picker>/<switch>… 在 jsdom 不存在，无法挂载）：
        //   分发正确性已由 renderer 组件测试覆盖（lc-node 矩阵用例断言 12 物料分发到位），
        //   物料自身行为由 H5 实测验证 —— 口径与 L-5 一致，不计入覆盖率。
        'packages/materials/**',
        // 注：renderer/src/uni 的 lc-node/lc-renderer 已有组件测试（test/uni/**，jsdom），**纳入统计**；
        //     其中 material-map.ts 尚无用例（L-6 物料映射为空，Phase 1 随物料库补测）。
        'packages/runtime/**',
      ],
      // 阈值 = 实测防退化线（2026-10-08 实测 95.6 / 86.72 / 97 / 95.6，分包见台账）：
      // lines/statements/functions 取方案 9.2 硬指标 90；branches 按实测留 ~1.7 buffer。
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
})
