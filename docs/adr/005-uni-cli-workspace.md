# ADR-005: uni-app 走官方 CLI 工程 + easycom 三规则

- 状态：已接受
- 日期：2026-10-08（Phase 0 第 3 批第 4 项）
- 关联：方案 4.2 / 9.1；台账 D-10 / D-11 / D-12 / L-5

## 背景

方案原计划用 **HBuilderX 工程**跑 uni-app 运行时壳。实际环境：本机与 CI 均无 HBuilderX；且工程需要纳入 pnpm workspace 统一管理（方案 9.1 目录树把运行时壳放 `packages/runtime/`）。另外环境有两处网络/工具约束：npmjs 官方源不可达、无微信开发者工具。

## 决策

- **uni-app 官方 CLI（Vite）工程**落 `packages/runtime/`：`@dcloudio/*` 锁 `3.0.0-alpha-5030120260930001` + vite 5.2.8 + vue 3.4.21（CLI 模板要求 vite@5，随意升版本会冲突）。
- **easycom 三规则**（对方案 4.2 单规则的最小扩展，D-12）：
  1. `^lc-renderer$` → `@lc/renderer/uni/lc-renderer.vue`（框架组件，不在物料目录）
  2. `^lc-node$` → `@lc/renderer/uni/lc-node.vue`（同上）
  3. `^lc-(.*)$` → `@/materials/$1/index.vue`（物料，原规则）
- **网络**：workspace 根 `.npmrc` 切 npmmirror（D-11）；allowBuilds 放行 `core-js`。
- **脚本策略**：runtime 包**不定义** `build/test/typecheck`，避免被根 `pnpm -r` 全量链逮住（uni 构建重且依赖网络）；单独 `pnpm dev:h5 / build:h5 / build:mp-weixin`。
- 产物与 HBuilderX 路线一致（`dist/build/*`），迁移无门槛。

## 后果

- ✅ 全流程可脚本化（install → dev → build 双端产物），与 monorepo 工具链接轨。
- ⚠️ **已知限制**：uni 插件强制 `resolve.preserveSymlinks = true`（用户配置覆盖无效）→ 模块 id 带 `node_modules/` 前缀落在 vite watcher ignore 内 → **改 `packages/renderer` 源码后 dev server 不热更，需重启**（注释于 `runtime/vite.config.ts`）。
- ⚠️ 真机验证依赖微信开发者工具（环境未装）→ L-5 只完成到「H5 实测 + mp 构建产物抽查」。
