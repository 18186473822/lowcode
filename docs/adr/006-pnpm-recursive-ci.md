# ADR-006: `pnpm -r` 替代 Turborepo + 覆盖率阈值门禁

- 状态：已接受
- 日期：2026-10-08（Phase 0 第 3 批第 5 项）
- 关联：台账 D-4 / D-13 / B-20 / L-8；方案 9.2

## 背景

方案 9.1/9.2 要求 `turbo build` 一键全绿 + 单测覆盖率 ≥ 90% + CI。当时（第 1 批）评估：workspace 只有 4 个包，Turborepo 的增量缓存收益趋近于零，却引入一层工具依赖与配置维护；覆盖率则一直没有采集手段，「≥ 90%」只是口头指标。

## 决策

- **构建/测试编排用 `pnpm -r` 递归**（根 `build/test/typecheck` 脚本），Turborepo 延后到包数/耗时出现真实痛点再引入（D-4，包数 > 10 或 CI 时长 > 10min 触发重评）。
- **覆盖率 = 硬门禁**：
  - `@vitest/coverage-v8`（与 vitest 严格同版本）+ `config/vitest.projects.ts` 聚合 4 项目（**刻意放 `config/` 子目录**：vitest 沿祖先链自动发现 `vitest.{workspace,projects}.*`，放仓库根会让 `pnpm -r test` 在子包内加载它并按 cwd 解析路径而全挂 —— B-20 实锤）；
  - `vitest.config.ts` 定义统计范围（只算实现源码，排除 dist/产物/入口 bootstrap/runtime 壳）与阈值：**行/语句/函数 ≥ 90（方案 9.2）、分支 ≥ 85（实测防退化）**，不达标退出码非 0；
  - 实测（2026-10-08）：总 95.53 / 88.29 / 97.06；分包 schema 96.05、expression 93.84、renderer 97.09、server 94.82。
- **CI = `.github/workflows/ci.yml`**：install → typecheck → build → test → coverage（阈值）→ **服务端真实启动冒烟**（B-15 固化）→ 体积告警（`renderer/dist > 1MB` → `::warning`）。

## 后果

- ✅ 零新工具引入完成「一键全绿」等价物；覆盖率从口头指标变成**强制门禁**。
- ✅ 分包阈值让「schema/expression 这两个错了全平台错」（方案 9.2）有数字兜底。
- ✅ **2026-10-23 更新**：CI 已在 GitHub Actions 实跑全绿（run #3/#4 的 `verify` + `node20-core`）。原「未推送远端、未在真实 Actions 执行」的挂账已关闭；期间按实测把顺序修正为 **先 build 再 typecheck**（workspace `types` 指向 `dist/*.d.ts`），并修复 rpx 令牌 CRLF 归一化。CI 仍不启动真实 MySQL。
- ⚠️ 阈值是全局聚合口径，单包跌落靠分包实测记录（台账第 7 节），未做 per-package 阈值（Phase 1 视需要）。
