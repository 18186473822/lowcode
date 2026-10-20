// vitest 聚合项目列表 —— 供根 `pnpm coverage` 显式使用（`--workspace config/vitest.projects.ts`）。
// ⚠️ 必须放在 `config/` 子目录（B-20）：vitest 2.1 会**沿 cwd 向上的祖先链**自动发现
//    `vitest.workspace.*` / `vitest.projects.*`（改名无效，两种后缀都认），且文件里的相对
//    项目路径按 **cwd** 解析 —— 若放仓库根，`pnpm -r test` 在各包内跑 vitest 时会加载它并把
//    `packages/schema` 解析成 `<子包>/packages/schema` → 全部报 "non-existing file" 失败。
//    放 `config/` 后不在祖先发现链上；根 coverage 显式 --workspace 指定（cwd=仓库根，相对路径正确）。
// 六个测试项目聚合跑，产出**单一覆盖率报告**；日常 `pnpm test` 仍是 `pnpm -r test`（各包独立）。
// runtime 工程无测试、无 vitest 配置，不纳入。
// 注（B-45）：`--workspace` 模式下根 vitest.config.ts 的 test 配置不下发到 worker ——
// rpcTimeout 必须在各项目自己的 vitest.config.ts 里设（6 包均有）；命令侧配 `--no-file-parallelism`。
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/tokens',
  'packages/schema',
  'packages/expression',
  'packages/renderer',
  'packages/designer',
  'apps/server',
])
