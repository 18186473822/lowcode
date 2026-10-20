# ADR-003: 渲染引擎纯逻辑层 + 副作用注入（RuntimeHost）

- 状态：已接受
- 日期：2026-09-29（Phase 0 第 2 批）
- 关联：方案 5.x；台账 B-15 / L-4

## 背景

渲染引擎是全平台复用面最大的模块（设计器预览、H5、小程序、App 都跑它）。如果引擎直接调 `uni.*` / `uni.showToast` 之类平台 API，就只能在 uni 环境测试——而 uni 环境的测试又慢又难自动化（B-15 教训的同款风险面：**测试态通过 ≠ 运行时可用**，反过来也成立：引擎逻辑如果只在真机能测，回归成本会失控）。

## 决策

- **`@lc/renderer` 分两层**：
  - **纯逻辑层 `src/core`**（10 模块：path/context/build/linkage/resolve/validator/datasource/action/lifecycle/controller）——零框架、零平台依赖，全部可注入依赖，145+ 单测覆盖；
  - **uni 组件层 `src/uni`**（`lc-renderer.vue` / `lc-node.vue` / `material-map.ts`）——只做「响应式接线与 v-if 分发」，不含业务规则。
- **所有副作用走注入**：`RuntimeHost` 必填 `toast/confirm/navigate/back/request`，可选 `copy/scan/callPhone/getLocation/openDialog`；宿主（uni 工程 / 测试 / 设计器）各自实现。
- 组件层另有 jsdom 冒烟测试兜底（`test/uni/**`，B-18/B-19 回归锁定）。

## 后果

- ✅ core 逻辑可在 node 下毫秒级全量回归（154 用例 / renderer 包 1.9s）；实机只需要验证「接线」而非「逻辑」。
- ✅ 设计器（PC Vue）与移动端共用同一引擎，行为天然一致。
- ⚠️ 两层之间存在接口契约（`ResolvedNode` / `PageControllerOptions`）——改 core 类型必须同步组件层与 `docs/protocol.md`（已有 tsc + 组件测试双重兜底）。
- ⚠️ 副作用能力受 Host 实现制约：宿主没实现的能力（如 App 端扫码）调用即抛错语义，由协议错误码约定。
