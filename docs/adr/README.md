# 架构决策记录（ADR）

> 与《落地方案》2.4 节的决策清单互补：方案讲「为什么这么设计」，ADR 记「在什么约束下、
> 选了哪条路、放弃了什么」。编号不复用；新决策追加，修订原决策时**升状态**（如 提案 → 已接受 → 已废弃/被 ADR-00X 取代）。

| # | 标题 | 状态 | 关联台账 |
|---|---|---|---|
| [001](001-static-material-registry.md) | 编译期静态物料注册 + 自研受限表达式引擎 | 已接受 | D-2 |
| [002](002-trusted-app-api.md) | 表达式禁止赋值，写能力走受信 `app` API | 已接受 | D-7 / D-8 |
| [003](003-effect-injection.md) | 渲染引擎纯逻辑层 + 副作用注入（RuntimeHost） | 已接受 | B-15 |
| [004](004-file-page-repository.md) | 服务端 JSON 文件仓储（接口先行） | 已接受 | D-9 |
| [005](005-uni-cli-workspace.md) | uni-app 走官方 CLI 工程 + easycom 三规则 | 已接受 | D-10 / D-11 / D-12 |
| [006](006-pnpm-recursive-ci.md) | `pnpm -r` 替代 Turborepo + 覆盖率阈值门禁 | 已接受 | D-4 / D-13 |
| [007](007-cross-platform-reuse-boundary.md) | 跨端复用边界：令牌全端共享，组件只在同构宿主内共享 | 已接受 | §3.2 / §10.4 |
| [008](008-mysql-prisma-first-batch.md) | 核心业务数据落 MySQL 8 + Prisma（第一批） | 已接受 | 方案 8.1 / 8.4 / 8.5；ADR-004 |
| [009](009-mysql-prisma-second-batch.md) | 流程、运维事件与应用配置落 MySQL（第二批） | 已接受 | ADR-008；方案 8.1 / 8.2 / 8.6 |

## 模板

```markdown
# ADR-00X: 标题
- 状态：提案 | 已接受 | 已废弃（被 ADR-00Y 取代）
- 日期：YYYY-MM-DD（决策落定日）
- 关联：方案 x.x / 台账 D-x、B-x

## 背景（约束与问题）
## 决策
## 备选与取舍（可选）
## 后果（正面 / 负面 / 风险）
```
