# 架构决策记录（DECISIONS）

> 本文件合并了原 `docs/adr/` 下的 ADR-001~ADR-011（原文已删除，git 历史可追溯）。
> 决策**只追加、不改写**；要修订旧决策时新增编号并注明取代关系。
> 当前能力与变更记录见 [`PROGRESS.md`](PROGRESS.md)，操作与部署见 [`OPERATIONS.md`](OPERATIONS.md)。

## 索引

| 编号 | 决策 |
|---|---|
| [ADR-001](#adr-001) | 编译期静态物料注册 + 自研受限表达式引擎 |
| [ADR-002](#adr-002) | 表达式禁止赋值，写能力走受信 `app` API |
| [ADR-003](#adr-003) | 渲染引擎纯逻辑层 + 副作用注入（RuntimeHost） |
| [ADR-004](#adr-004) | 服务端 JSON 文件仓储（接口先行） |
| [ADR-005](#adr-005) | uni-app 走官方 CLI 工程 + easycom 三规则 |
| [ADR-006](#adr-006) | `pnpm -r` 替代 Turborepo + 覆盖率阈值门禁 |
| [ADR-007](#adr-007) | 跨端复用边界 —— 令牌全端共享，组件只在同构宿主内共享 |
| [ADR-008](#adr-008) | 核心业务数据落 MySQL 8 + Prisma（第一批） |
| [ADR-009](#adr-009) | 流程、运维事件与应用配置落 MySQL（第二批） |
| [ADR-010](#adr-010) | 文件元数据与内容落 MySQL（第三批） |
| [ADR-011](#adr-011) | 乐观锁、审批幂等与流程 outbox |

---

<a id="adr-001"></a>

## ADR-001: 编译期静态物料注册 + 自研受限表达式引擎

- 状态：已接受
- 日期：2025-09（立项期），2026-09-29 随 `@lc/expression` 落地
- 关联：方案 2.4 / 5.4；台账 D-2

### 背景

低代码渲染引擎的两个绕不开的约束：

1. **微信小程序不支持 `<component :is>`**（动态组件），运行时按字符串加载组件这条路在 mp 端不通；
2. 小程序环境**禁用 `eval` / `new Function`**，表达式无法用「字符串转代码」的方式执行；
3. 表达式是用户资产（设计器里写、多端跑），**安全性优先于语法糖**（原型污染 / 无限循环 /越界访问必须能拦）。

### 决策

- **物料注册**：编译期静态注册。Schema 只存 `componentName` 字符串，渲染侧用**静态 v-if 链分发**（`lc-node.vue`）+ easycom 按名解析，物料在构建期进入产物，不搞运行时动态加载。
- **表达式引擎**：**自研受限解释器**（tokenizer → parser → AST evaluator），零 `eval`、零 `new Function`、白名单内置函数 + `FORBIDDEN_KEYS` 原型键拦截。

### 备选与取舍

| 备选 | 弃选原因 |
|---|---|
| 运行时 `component :is` + 动态 import 物料 | mp 端不支持；分包/产物不可控 |
| `json-logic` 等现成表达式库（D-2 原方案） | 满足不了企业级语法（三元/成员访问/字符串方法）+ 自定义白名单语义；后期替换成本更高 → **直接自研**，实测 117 用例（含 45 安全用例） |

### 后果

- ✅ 三端一致、产物可控、表达式安全边界可单测穷举（覆盖率 93.84%）。
- ⚠️ 新物料必须**进构建产物**（不能运行时热装）——Phase 1 物料市场/远程物料需另行设计（方案 Phase 4）。
- ⚠️ v-if 链随物料数量线性增长（30 个物料内可接受，包体积与分发成本已在 mp 产物抽查）。

---

<a id="adr-002"></a>

## ADR-002: 表达式禁止赋值，写能力走受信 `app` API

- 状态：已接受
- 日期：2026-09-29（Phase 0 第 3 批第 1 项，D-7 结案）
- 关联：方案 3.1 / 3.4 / 7.2；台账 D-1 / D-6 / D-7 / D-8

### 背景

协议存在自相矛盾：5.x 明确「表达式禁止赋值」，但 3.1 的生命周期（`onInit/onMount/onSubmit`）被定义为**表达式**，用途却含「设置默认值」——生命周期到底能不能写数据？

约束：表达式必须保持**纯度**（只读求值，副作用可控可测）；而生命周期确实需要写入/取数/导航等副作用。

### 决策

- **渲染期与规则期表达式一律禁止赋值**（词法层无单 `=`，`formData.a = 1` 直接语法错误）。
- **生命周期写能力 = 受信 `app` API**（选型 C）：`onInit/onMount/onSubmit` 求值时注入受限 `app` 对象（`setFormData/getFormData/setAppData/loadDs/toast/navigate/back/confirm`），钩子协议放宽为 `LifecycleHook = string | string[]` 支持多步。
- 副作用按**动作类型**（Action 15 种）在交互事件里执行，不靠表达式。

### 备选与取舍（D-7 三方案，详见台账存档）

- **A 受限赋值**：破坏表达式纯度不变量，全入口靠 `allowAssign` 开关防漏传 → 弃。
- **B `Action[]` 生命周期**：协议改动大，条件分支/三元表达能力反而退化 → 弃。
- **C 受信 API（已选）**：表达式引擎零改动；副作用面 = `app` 白名单面，`FORBIDDEN_KEYS` 仍生效；条件分支可用三元表达。

### 后果

- ✅ 安全模型不变量保住：**表达式纯读，副作用要么走 `app` 白名单，要么走 15 种显式动作**。
- ✅ 生命周期可写字段/调数据源（`app.loadDs('ds_dept')`，D-8 修正了原「挂方法到 ds 状态」的错误示例）。
- ⚠️ `app` 在渲染期（props/condition/loop/规则/`expression` 动作）**不可见**（L-7）——需要时按同款模式扩展 `actionRt` 作用域。

---

<a id="adr-003"></a>

## ADR-003: 渲染引擎纯逻辑层 + 副作用注入（RuntimeHost）

- 状态：已接受
- 日期：2026-09-29（Phase 0 第 2 批）
- 关联：方案 5.x；台账 B-15 / L-4

### 背景

渲染引擎是全平台复用面最大的模块（设计器预览、H5、小程序、App 都跑它）。如果引擎直接调 `uni.*` / `uni.showToast` 之类平台 API，就只能在 uni 环境测试——而 uni 环境的测试又慢又难自动化（B-15 教训的同款风险面：**测试态通过 ≠ 运行时可用**，反过来也成立：引擎逻辑如果只在真机能测，回归成本会失控）。

### 决策

- **`@lc/renderer` 分两层**：
  - **纯逻辑层 `src/core`**（10 模块：path/context/build/linkage/resolve/validator/datasource/action/lifecycle/controller）——零框架、零平台依赖，全部可注入依赖，145+ 单测覆盖；
  - **uni 组件层 `src/uni`**（`lc-renderer.vue` / `lc-node.vue` / `material-map.ts`）——只做「响应式接线与 v-if 分发」，不含业务规则。
- **所有副作用走注入**：`RuntimeHost` 必填 `toast/confirm/navigate/back/request`，可选 `copy/scan/callPhone/getLocation/openDialog`；宿主（uni 工程 / 测试 / 设计器）各自实现。
- 组件层另有 jsdom 冒烟测试兜底（`test/uni/**`，B-18/B-19 回归锁定）。

### 后果

- ✅ core 逻辑可在 node 下毫秒级全量回归（154 用例 / renderer 包 1.9s）；实机只需要验证「接线」而非「逻辑」。
- ✅ 设计器（PC Vue）与移动端共用同一引擎，行为天然一致。
- ⚠️ 两层之间存在接口契约（`ResolvedNode` / `PageControllerOptions`）——改 core 类型必须同步组件层与 `docs/protocol.md`（已有 tsc + 组件测试双重兜底）。
- ⚠️ 副作用能力受 Host 实现制约：宿主没实现的能力（如 App 端扫码）调用即抛错语义，由协议错误码约定。

---

<a id="adr-004"></a>

## ADR-004: 服务端 JSON 文件仓储（接口先行）

- 状态：已接受（核心数据部分由 [ADR-008](#adr-008) 扩展；JSON 仍是默认/测试实现）
- 日期：2026-09-29（Phase 0 第 3 批第 2 项，D-9 结案）
- 关联：方案 8.1 / 8.3 / 8.4；台账 D-9；ADR-008

### 背景

方案 8.1 技术栈定的是 **NestJS + Prisma + PostgreSQL + Redis**。Phase 0 的目标只是「页面 Schema 能存取、版本模型成立、接口契约跑通」，此时上全套数据库：

- 环境成本（本机/CI 需要 PG + Redis 实例）；
- Prisma schema 与 8.4 双表（`pages` + `versions[]`）的映射属重复劳动，Phase 1 动态 CRUD 定型后再做更稳；
- Redis 的真实需求（缓存/会话）尚未出现。

### 决策

- **定义 `PageRepository` 接口**（对齐方案 8.4 双表语义），Phase 0 提供 `FilePageRepository` 实现：`<DATA_DIR>/pages/<id>.json`，**tmp + rename 原子写入**，id 白名单正则防路径穿越（与 service 层双重校验）。
- 用户为内存种子账号（admin/designer），JWT 密钥环境变量注入。
- **Phase 1 换数据库 = 新写一个仓储实现，接口与上层零改动**；Redis 待需求出现再引入。

### 后果

- ✅ 零外部依赖：`node dist/main.js` 即起，38 用例在临时目录真实落盘，CI 无需服务容器。
- ✅ 8.4 的版本模型（草稿/发布/回滚 = 复制为新草稿）在文件形态已验证，换 PG 时语义有据可依。
- ⚠️ 并发写无锁（单进程假设）——多实例部署前必须换实现（Phase 1 计划内）。
- ⚠️ 与方案 8.1 的差异已在台账 D-9 与方案「实施状态」双向标注，避免被误读为「数据库已就绪」。
- 🔄 2026-10-21：第一批核心数据已提供 MySQL/Prisma 实现，`LC_STORAGE=mysql` 启用；JSON 实现保留为默认/测试路径。详见 ADR-008。

---

<a id="adr-005"></a>

## ADR-005: uni-app 走官方 CLI 工程 + easycom 三规则

- 状态：已接受
- 日期：2026-10-08（Phase 0 第 3 批第 4 项）
- 关联：方案 4.2 / 9.1；台账 D-10 / D-11 / D-12 / L-5

### 背景

方案原计划用 **HBuilderX 工程**跑 uni-app 运行时壳。实际环境：本机与 CI 均无 HBuilderX；且工程需要纳入 pnpm workspace 统一管理（方案 9.1 目录树把运行时壳放 `packages/runtime/`）。另外环境有两处网络/工具约束：npmjs 官方源不可达、无微信开发者工具。

### 决策

- **uni-app 官方 CLI（Vite）工程**落 `packages/runtime/`：`@dcloudio/*` 锁 `3.0.0-alpha-5030120260930001` + vite 5.2.8 + vue 3.4.21（CLI 模板要求 vite@5，随意升版本会冲突）。
- **easycom 三规则**（对方案 4.2 单规则的最小扩展，D-12）：
  1. `^lc-renderer$` → `@lc/renderer/uni/lc-renderer.vue`（框架组件，不在物料目录）
  2. `^lc-node$` → `@lc/renderer/uni/lc-node.vue`（同上）
  3. `^lc-(.*)$` → `@/materials/$1/index.vue`（物料，原规则）
- **网络**：workspace 根 `.npmrc` 切 npmmirror（D-11）；allowBuilds 放行 `core-js`。
- **脚本策略**：runtime 包**不定义** `build/test/typecheck`，避免被根 `pnpm -r` 全量链逮住（uni 构建重且依赖网络）；单独 `pnpm dev:h5 / build:h5 / build:mp-weixin`。
- 产物与 HBuilderX 路线一致（`dist/build/*`），迁移无门槛。

### 后果

- ✅ 全流程可脚本化（install → dev → build 双端产物），与 monorepo 工具链接轨。
- ⚠️ **已知限制**：uni 插件强制 `resolve.preserveSymlinks = true`（用户配置覆盖无效）→ 模块 id 带 `node_modules/` 前缀落在 vite watcher ignore 内 → **改 `packages/renderer` 源码后 dev server 不热更，需重启**（注释于 `runtime/vite.config.ts`）。
- ⚠️ 真机验证依赖微信开发者工具（环境未装）→ L-5 只完成到「H5 实测 + mp 构建产物抽查」。

---

<a id="adr-006"></a>

## ADR-006: `pnpm -r` 替代 Turborepo + 覆盖率阈值门禁

- 状态：已接受
- 日期：2026-10-08（Phase 0 第 3 批第 5 项）
- 关联：台账 D-4 / D-13 / B-20 / L-8；方案 9.2

### 背景

方案 9.1/9.2 要求 `turbo build` 一键全绿 + 单测覆盖率 ≥ 90% + CI。当时（第 1 批）评估：workspace 只有 4 个包，Turborepo 的增量缓存收益趋近于零，却引入一层工具依赖与配置维护；覆盖率则一直没有采集手段，「≥ 90%」只是口头指标。

### 决策

- **构建/测试编排用 `pnpm -r` 递归**（根 `build/test/typecheck` 脚本），Turborepo 延后到包数/耗时出现真实痛点再引入（D-4，包数 > 10 或 CI 时长 > 10min 触发重评）。
- **覆盖率 = 硬门禁**：
  - `@vitest/coverage-v8`（与 vitest 严格同版本）+ `config/vitest.projects.ts` 聚合 4 项目（**刻意放 `config/` 子目录**：vitest 沿祖先链自动发现 `vitest.{workspace,projects}.*`，放仓库根会让 `pnpm -r test` 在子包内加载它并按 cwd 解析路径而全挂 —— B-20 实锤）；
  - `vitest.config.ts` 定义统计范围（只算实现源码，排除 dist/产物/入口 bootstrap/runtime 壳）与阈值：**行/语句/函数 ≥ 90（方案 9.2）、分支 ≥ 85（实测防退化）**，不达标退出码非 0；
  - 实测（2026-10-08）：总 95.53 / 88.29 / 97.06；分包 schema 96.05、expression 93.84、renderer 97.09、server 94.82。
- **CI = `.github/workflows/ci.yml`**：install → typecheck → build → test → coverage（阈值）→ **服务端真实启动冒烟**（B-15 固化）→ 体积告警（`renderer/dist > 1MB` → `::warning`）。

### 后果

- ✅ 零新工具引入完成「一键全绿」等价物；覆盖率从口头指标变成**强制门禁**。
- ✅ 分包阈值让「schema/expression 这两个错了全平台错」（方案 9.2）有数字兜底。
- ✅ **2026-10-23 更新**：CI 已在 GitHub Actions 实跑全绿（run #3/#4 的 `verify` + `node20-core`）。原「未推送远端、未在真实 Actions 执行」的挂账已关闭；期间按实测把顺序修正为 **先 build 再 typecheck**（workspace `types` 指向 `dist/*.d.ts`），并修复 rpx 令牌 CRLF 归一化。CI 仍不启动真实 MySQL。
- ⚠️ 阈值是全局聚合口径，单包跌落靠分包实测记录（台账第 7 节），未做 per-package 阈值（Phase 1 视需要）。

---

<a id="adr-007"></a>

## ADR-007: 跨端复用边界 —— 令牌全端共享，组件只在同构宿主内共享

- 状态：已接受
- 日期：2026-10-20
- 关联：ADR-001（静态物料注册）、ADR-003（纯逻辑层 + 副作用注入）；design-system.md §2.2.1 / §3 / §10.4

### 背景

平台里有三类 UI 资产，跨端需求各不相同：

| 资产 | 载体 | 需要跑在 |
|---|---|---|
| 设计令牌 | `@lc/tokens`（166 值 / 双模式） | Web 设计器 + 移动端 H5 + mp-weixin |
| 画布物料 | `@lc/materials`（33 个 `.vue`，uni 标签） | 设计器画布 + 移动端 |
| 设计器面板 | `@lc/designer`（7 个，DOM + Element Plus） | 仅 Web |

早期结论把问题表述为「组件库该共享令牌还是共享组件」，隐含了一个错误的二选一前提。实际盘点后发现：

1. **materials 已经是「零分支」的跨端共享组件** —— uni 标签编译到 H5 / mp，设计器侧靠 shim（`view/text/image/switch` 走 CSS 兜底 + 运行时增强器，事件载荷与 uni 同构）实现「物料零改动」渲染。这是本仓最难得的复用资产。
2. **面板无法共享** —— 依赖 `div/button/input`、Element Plus、hover 与键盘焦点；这些在 mp-weixin 不存在，也无法通过编译抹平。
3. 因此真正要决策的不是「选哪个」，而是**边界画在哪、以及为什么**。

### 决策

1. **令牌 = 唯一的全端共享层。** 承载「视觉常量」：颜色、字号、行高、间距、圆角、阴影、动效。任何端都不得自建色值（由 `pnpm color:check` 强制）。
2. **组件只在「同构宿主」内共享。** 同构 = 同一套渲染原语 + 同一套交互模型。
   - materials 走 uni 宿主 → 画布（shim 模拟）+ 移动端（真机）✅
   - 设计器面板走 DOM 宿主 → 仅 Web ✅，**不宣称跨端**
3. **禁止跨宿主共享组件。** 需要跨宿主复用时，先复用令牌，再按端实现。
4. **包内复用不等于跨端复用。** designer 内部若抽 `LcButton` / `LcField`，只是解决包内重复与状态漏实现，不得以「跨端组件库」的名义推进。

**一句话规则**：能被令牌表达的一致，就用令牌；必须在同一渲染宿主内复用结构，才抽组件。

### 判例：32px 密度 vs 44px 触控目标

这是「一个组件无法同时服务两端」的最硬证据，而且冲突已经写在令牌层里：

```css
--lc-btn-h-md:    32px;  /* 桌面密度 */
--lc-btn-h-touch: 44px;  /* 移动端触控目标（WCAG / 无障碍基线） */
```

- **令牌层能同时声明两者**，让两端各取所需；
- **一个共享组件必须选一个高度**：选 32 就不满足 44px 触控目标，选 44 桌面就过胖。

这不是实现技巧问题，是**规范冲突**。同类冲突还有：

| 维度 | Web | 移动端 |
|---|---|---|
| 交互 | hover / `:focus-visible` / Enter·Space | `@tap` / 长按 / 无 hover |
| 可访问性 | 焦点环、Tab 顺序、`aria-*` | 触控目标尺寸、屏幕阅读器语义标签 |
| 宿主能力 | Element Plus、滚动容器、剪贴板 | uni API、原生组件 |

**a11y 是可访问性最容易被忽略的分水岭**：共享组件能「保证」a11y 一致，但只在两端 a11y 模型相同时成立；模型不同还硬共享，结果是组件里塞两套逻辑，谁都没做对。令牌永远只能保证对比度那一半。

### 备选与取舍

| 备选 | 弃选原因 |
|---|---|
| **全量共享组件**（web 与 uni 共用一套 `LcButton`） | 密度冲突不可调和（32 vs 44）；a11y 模型不同；Element Plus 无法下沉到 mp。最终一定退化成 `#ifdef` 分支包着的两份实现塞进一个文件 |
| **只用令牌、不共享任何组件** | 画布会失去与真机同构的渲染，等于放弃 33 个物料的复用资产（现在改物料一处，两端同时生效） |
| **每个平台维护一份组件** | 结构与交互双写，漂移无门禁可拦（`color:check` 只管颜色，管不了 DOM 结构与交互顺序） |
| 强行把 designer 面板改成 uni 组件以「统一技术栈」 | 会毁掉 Web 端的键盘/焦点/滚动体验与 Element Plus 集成，收益只有「栈统一」这一条表面理由 |

### 后果

- ✅ 物料**零分支**复用：改一处，设计器画布与移动端同时生效。
- ✅ 一致性可门禁：令牌 4 道门禁（漂移 / 色值字面量 / rpx 产物 / 对比度回归），漂移面被压到「结构层」。
- ⚠️ **同一个「按钮」在两端是两套实现**，改动要双改。一致性由 `design-system.md §3.2` 状态矩阵约束（六态 + 尺寸），不靠共享代码约束。
- ⚠️ **组件级 a11y 只能逐端保证**，无法靠共享组件统一；这是选择这条路的固定成本。
- ⚠️ 若将来出现「必须在 mp 端复用面板」的真实诉求，**必须重新评估**（例如把面板重写为 uni 组件、或做一层渲染原语抽象），而不是往现有 DOM 组件里塞条件分支。
- 📌 面板抽组件的**触发条件**不作「应该更规范」，而是具体的：**面板数 > 10，或需被第二个 Web 应用复用**。此前重复已由 `styles/panel.css` 共享 CSS 层消掉，抽组件的边际收益主要是类型约束，不足以抵消 6 个文件 + 测试的改动面。

---

<a id="adr-008"></a>

## ADR-008: 核心业务数据落 MySQL 8 + Prisma（第一批）

- 状态：已接受
- 日期：2026-10-21（Phase 4 数据库第一批）
- 关联：ADR-004；方案 8.1 / 8.4 / 8.5；Phase 4 生产化
- 后续：ADR-009（2026-10-21，第二批 flows / flow-instances / ops / apps 已迁入 MySQL）；ADR-010（2026-10-22，第三批文件元数据/内容已迁入 MySQL）

### 背景

Phase 0 的 ADR-004 用 JSON 文件仓储换取零外部依赖，并保留「换数据库 = 换仓储实现」的接口边界。到 Phase 4，以下问题已经不能再用单进程文件写掩盖：

- 页面发布/回滚、记录写入需要事务边界，文件 tmp+rename 只能保证单文件原子性；
- 用户/角色、RBAC、页面、模型、记录分散在内存与多个 JSON 文件，进程重启或双实例会丢/覆盖；
- 生产部署需要可备份、可审计、可迁移的数据层。

本机已有 MySQL 8.0.46，原方案的 PostgreSQL 改由 MySQL 承接；ORM 仍用 Prisma。

### 决策

1. **数据库**：MySQL 8（utf8mb4 / InnoDB），Prisma 6.19.3；连接串统一 `DATABASE_URL`。
2. **第一批落库范围**（8 张表）：
   - `users` / `roles` / `user_roles`：用户、角色、多对多；
   - `pages` / `page_versions`：方案 8.4 双表，版本以 `(page_id, version)` 复合主键；
   - `models` / `data_records`：动态模型与业务记录，记录以 `(model_id, id)` 复合主键保留「按模型分区」语义；
   - `rbac_page_grants`：页面可见性白名单；RBAC 角色与用户角色共用 `roles` 表。
3. **不破坏现有契约**：`UserRepository / PageRepository / ModelRepository / RecordRepository / RbacRepository` 接口不变；`StorageModule` 按 `LC_STORAGE` 条件注入 JSON 或 MySQL 实现，服务层零改动。
4. **默认仍为 JSON**：`LC_STORAGE=json` 是默认值，保证无 MySQL 的单位测试与 CI 可运行；`mysql` 为显式 opt-in，启动期校验 `DATABASE_URL`。
5. **JSON 数据可导入**：`import-json-to-mysql.mjs` 幂等导入 pages/models/records/rbac；开发用户由 `seed-mysql.mjs` 写入。
6. **可验证性**：MySQL 仓储条件集成测试（`LC_TEST_DATABASE_URL`，缺省 skip）+ 真启动冒烟（`smoke-mysql.mjs`，拒绝非 `*_test` 库）+ `/ready` 的 `SELECT 1`。
7. **暂不迁移**：`flows.json`、`flow-instances.json`、`ops/events.json`、`apps.json` 仍在 `LC_DATA_DIR`；下一批再落库，期间不承诺跨存储事务。（**已由 ADR-009 接续**：同日第二批已迁入 MySQL；本 ADR 其余决策仍有效。）

### 备选与取舍

- **继续 JSON**：零部署成本，但无法满足事务与多实例；放弃。
- **SQLite**：单机事务简单，但生产并发/备份/运维路径弱于已有 MySQL；放弃。
- **直接手写 mysql2 SQL**：控制力强，但迁移/类型/关联维护成本高；Prisma 的 schema 与 migration 更适合当前团队规模。
- **全量一次迁移**：表更多、回归面更大；本批只覆盖核心主数据，flows/ops/apps 下一批，降低一次交付风险。

### 后果

- ✅ 页面/版本、模型/记录、用户/角色/RBAC 获得真实事务与持久化；MySQL 模式 `/ready` 可直接发现数据库不可用。
- ✅ JSON 路径保留，单测/CI 无需 MySQL；MySQL 集成测试与冒烟用独立 `_test` 库，避免污染开发库。
- ⚠️ 双轨存储：flows / ops / apps 仍为文件；跨存储操作没有分布式事务，下一批迁移前需接受该边界。
- ⚠️ 生产多实例仍需处理迁移顺序、连接池与备份；当前读取可用，写入并发策略（乐观锁）尚未做。
- ⚠️ 开发种子口令仅用于本地；生产环境禁止执行 `seed:mysql`（脚本默认拒绝，需显式 `LC_SEED_DEV_USERS=1`）。

---

<a id="adr-009"></a>

## ADR-009: 流程、运维事件与应用配置落 MySQL（第二批）

- 状态：已接受
- 日期：2026-10-21（Phase 4 数据库第二批）
- 关联：ADR-004 / ADR-008；方案 8.1 / 8.6 / 8.2；Phase 4 生产化

### 背景

ADR-008 已把用户/角色、页面/版本、模型/记录、RBAC 迁入 MySQL，但流程定义/实例、运维事件、应用配置仍散落在 `LC_DATA_DIR`：

- 流程实例与页面/记录不在同一数据库，删除定义、记录联动和审计查询都缺少事务边界；
- 运维事件是排障现场数据，文件整表替换在双实例下会互相覆盖；
- `apps.json` 是单文件，主题配置与页面数据备份/恢复节奏不一致。

第一批落地后，仓储抽象、`LC_STORAGE` 开关、`_test` 库集成测试与真启动冒烟均已稳定，具备继续迁移的条件。

### 决策

1. **新增 4 张表**（与第一批合计 12 张）：
   - `flow_definitions`：`flowId` 主键，完整 `FlowSchema` 存 `schemaJson`，冗余 `modelId/name` 供按模型查找与列表；
   - `flow_instances`：一条记录一次流程生命周期，`tasks/history` 整体存 JSON；
   - `ops_events`：错误/性能/事件一张表，`detailJson` 存现场快照；
   - `app_config`：单行 `id='default'`，`theme` 存 JSON，为未来多应用预留 id 维度。
2. **流程定义与实例分表且不建外键**：删除定义只删 `flow_definitions`，实例继续保留用于审计；实例中的 `flowId` 是历史引用，不要求定义仍存在。
3. **运维事件保留自增 `seq`，写入改为「追加 + 裁剪」**：同一批事件的 `at` 可能完全相同，`seq` 保证「后写在前」的稳定顺序；业务 `id` 仍唯一。`OpsRepository` 从整表 `save` 改为 `append(events, limit)`：MySQL 在事务内先 `createMany`，再按 `seq` 删除超出上限的最旧行；JSON 实现用单进程写队列串行化「读 → 合并 → 原子替换」，避免并发上报互相覆盖。
4. **字段形状不对协议做破坏性改动**：`tasks/history/detail/theme` 继续用 JSON 列；`pageVersion` 以字符串落库（`'draft'` 或数字字符串），读出时还原为 `number | 'draft'`。
5. **仓储接口与装配方式不变**：新增 `MysqlFlowRepository / MysqlOpsRepository / MysqlAppConfigRepository`；`StorageModule` 按 `LC_STORAGE` 注入 JSON 或 MySQL 实现，`FlowModule / OpsModule` 不再各自 new 文件仓储，`AppConfigService` 改为注入 `AppConfigRepository`。
6. **导入与验证同步扩展**：`import-json-to-mysql.mjs` 导入 `flows.json / flow-instances.json / ops/events.json / apps.json`；`mysql.persistence.test.ts` 覆盖流程/实例/运维/配置仓储；`smoke-mysql.mjs` 扩展为 9 项，真启动回读 4 张新表。
7. **单测隔离加固**：Vitest 自动加载 `apps/server/.env` 会覆盖 `test.env`，新增 `setup-json-storage.ts` 在测试模块导入前强制 `LC_STORAGE=json` 并删除 `DATABASE_URL`，避免普通 e2e 写入开发库。MySQL 专项测试只使用显式 `LC_TEST_DATABASE_URL`。

### 备选与取舍

- **实例内嵌 tasks/history 拆表**：更利于按任务查询/索引，但当前待办规模小、读写总是整实例，拆表会增加事务与映射复杂度；暂用 JSON。
- **流程实例加外键/cascade**：能保证引用完整，但删除定义会连带删除审计实例，违背「删除定义后实例保留」；放弃。
- **继续整表 delete + create**：实现简单，但并发上报时后写会覆盖先写；已改为 append + 裁剪，不再采用。
- **app_config 键值表**：扩展性更好，但当前只有 theme 一个配置，单行 JSON 更贴近原 `apps.json`；保留 id 为未来多应用留口。

### 后果

- ✅ 12 张核心业务表统一事务、备份与迁移路径；MySQL 模式 `/ready` 的 `SELECT 1` 会随同一数据库连接可用性失败。
- ✅ 流程删除后实例仍可查；运维事件同毫秒顺序可解释；应用配置与页面数据同库。
- ✅ JSON 仍是默认/无数据库测试路径；JSON→MySQL 导入幂等，可在切换时搬运存量数据。
- ⚠️ 上传文件与文件元数据仍在 `LC_DATA_DIR`，不在 MySQL 事务内；备份需要 SQL + 文件目录两份。（**已由 ADR-010 接续**：2026-10-22 文件元数据与内容已迁入 `files` 表；本 ADR 其余决策仍有效。）
- ⚠️ `ops_events` 已改为追加 + 按 `seq` 裁剪，不再整表覆盖；但多实例同时 append/裁剪时仍可能因各自快照瞬时略超 500 条，下一次上报会收敛。若要求严格上限，需引入单写队列或 Redis 协调。
- ⚠️ 页面/记录仍无乐观锁；MySQL 支持多进程读写不等于并发编辑安全。

---

<a id="adr-010"></a>

## ADR-010: 文件元数据与内容落 MySQL（第三批）

- 状态：已接受
- 日期：2026-10-22（Phase 4 数据库第三批）
- 关联：ADR-004 / ADR-008 / ADR-009；方案 8.2 / 8.3；Phase 4 生产化

### 背景

文件模块一直按 `<DATA_DIR>/files/<fileId>` 保存字节、`<DATA_DIR>/files-meta/<fileId>.json` 保存元信息：

- 两次写入没有共同事务，字节成功、元信息失败会留下半状态；
- 跨机部署需要额外共享盘，否则不同实例看不到同一附件；
- 数据库备份与文件目录备份节奏不同，恢复时要分别核对；
- 文件元信息损坏时只能靠运行时降级或 500 暴露，缺少数据库约束。

前两批已把用户、页面、模型、记录、RBAC、流程、运维事件与应用配置迁入 MySQL，仓储抽象和 `LC_STORAGE` 双轨稳定，具备把文件作为第三批迁移的条件。

### 决策

1. **新增第 13 张表 `files`**，元数据与内容同行：
   - `id VARCHAR(160)` 主键：`uuid + 白名单扩展名`，服务层仍做路径穿越白名单校验；
   - `originalName TEXT`：不因客户端超长文件名导致写库失败；
   - `mimeType VARCHAR(255)`、`size INT`、`uploadedAt DATETIME(3)`、`uploadedBy VARCHAR(128)`；
   - `content LONGBLOB`：单文件上限沿用 10MB；
   - `uploadedAt` 建索引，便于后续按时间清理或审计。
2. **抽出 `FileRepository` 契约**：`save(StoredFile)` / `find(id): StoredFile | null`，`StoredFile = { id, meta, data }`。服务层只保留文件名 basename 化、扩展名白名单、10MB 判断、`fileId` 生成与 404 语义。
3. **双实现等价**：
   - `DiskFileRepository` 保持原 `files/` + `files-meta/` 布局；字节缺失返回 `null`，元信息缺失按 `application/octet-stream` 降级，元信息损坏继续抛错；
   - `MysqlFileRepository` 用 `upsert` 写单行，保持「同 id 覆盖」语义；读取把 `DATETIME(3)` 回填为 ISO 字符串、`LONGBLOB` 回填为 `Buffer`。
4. **装配集中在 `StorageModule`**：按 `LC_STORAGE` 注入磁盘或 MySQL 实现；`FileModule` 不再直接依赖 fs。JSON 仍是默认/测试路径。
5. **存量文件显式导入**：`import-json-to-mysql.mjs` 扩展 `files/` + `files-meta/` 导入，大小以实际字节为准，元信息缺失时按运行时语义降级。MySQL 模式不自动双读旧磁盘文件，切换前必须执行一次导入。
6. **验证方式**：`mysql.persistence.test.ts` 覆盖元数据、二进制字节、同 id 覆盖、缺失返回 `null`；`smoke-mysql.mjs` 通过真实 HTTP 上传 → Prisma 回读 `files` → HTTP 下载字节比对。

### 备选与取舍

- **元数据表 + 内容表分表**：需要两次写入或事务协调，仍可能出现半状态，读取多一次 join；放弃。
- **把二进制 base64 塞进 JSON/TEXT**：体积膨胀约 33%，且失去 `LONGBLOB` 的流式/长度语义；放弃。
- **继续只用本地盘**：实现最简单，但跨机部署、备份一致性、半写状态问题仍在；放弃。
- **现在直接上对象存储（OSS/COS/MinIO）**：长期方向正确，但会新增外部依赖、凭证与部署复杂度，超出本批企业内网/中小附件范围；暂缓，保留 `FileRepository` 以后替换实现。

### 后果

- ✅ 上传只写一行，元数据与内容天然原子；MySQL 模式多实例可共享同一附件。
- ✅ 数据库备份（`mysqldump`）即可覆盖附件，不再需要 SQL + 文件目录双备份。
- ✅ JSON 模式保持原行为，单测/无数据库 CI 不依赖 MySQL；`FileModule` 与 HTTP 契约零变化。
- ⚠️ `LONGBLOB` 会让数据库体积随附件增长，备份/恢复时长和容量需按业务量评估；单文件仍限 10MB。
- ⚠️ 当前无对象存储 / CDN / Range 下载、文件列表/删除/回收站、哈希去重、病毒扫描；下载仍是公开只读语义。
- ⚠️ 存量附件必须执行 `import:json-to-mysql`；未导入的旧文件在 MySQL 模式下会 404。
- ⚠️ 文件表没有乐观锁；同 id 覆盖是刻意保留的重试语义，不用于并发编辑场景。

---

<a id="adr-011"></a>

## ADR-011: 乐观锁、审批幂等与流程 outbox

- 状态：已接受
- 日期：2026-10-22（Phase 4 生产化第 1 项）
- 关联：ADR-004 / ADR-008 / ADR-009 / ADR-010；方案 8.3 / 8.4 / 8.6；`docs/protocol.md` §10.2 / §10.6

### 背景

平台此前是「读 → 修改 → 整行覆盖」写入：

- 两个设计器标签页同时编辑同一页面，后保存者会覆盖先保存者；
- 两个客户端同时更新同一条业务记录，后写覆盖先写；
- 两人同时审批同一任务，会重复推进流程、重复写 history，甚至重复回写记录字段；
- 审批到达 `end` 后要回写业务记录，但实例与记录分属不同仓储（JSON 文件或不同 MySQL 表），没有跨表事务；
- 网络超时后客户端重试最后一次审批，可能收到「流程已结束」，客户端无法判断是否成功。

生产化必须先解决「并发写不丢更新」与「审批重试不重复推进」，且不能破坏旧客户端。

### 决策

#### 1. 行级 `revision` + HTTP `ETag` / `If-Match`

页面、业务记录、流程实例都增加 `revision`（整数，默认 0）：

- 新建 = 0；每次成功写 +1；删除记录也 +1（软删仍保留行）。页面首次保存草稿由 0 增到 1（建档算一次写）；记录/流程实例创建响应为 0。
- 读取接口返回 `revision`，并设置 ETag：
  - `"page:<pageId>:<revision>"`
  - `"record:<modelId>/<recordId>:<revision>"`
  - `"flow:<instanceId>:<revision>"`
- 页面保存/发布/回滚、记录更新/删除接受 `If-Match`；流程审批不接受 `If-Match`，用幂等键。

`If-Match` 设计为**可选**：

- 旧客户端不携带时，服务端仍用「本次读取到的 revision」做 CAS，避免请求内读改写窗口丢更新；
- 新客户端携带时，版本不一致返回 `409 VERSION_CONFLICT`，响应带 `expectedRevision` / `currentRevision`，前端可提示刷新；
- 格式非法（空串、别的资源 id、非数字）返回 `400 INVALID_IF_MATCH`，不把坏值当成 0。

#### 2. 两种存储的并发实现

- **JSON 仓储**：新增进程内 `KeyedLock`，按资源 key 串行化「读 → 判版本 → 写」。只保证单进程；多副本必须切 MySQL。
- **MySQL 仓储**：`UPDATE ... WHERE id = ? AND revision = ?` 行级 CAS；受影响行数为 0 即冲突。并发创建同一主键由唯一键兜底为冲突（`P2002` → `false`）。
- 页面写仍在一个事务内完成「页面行 + 版本行」替换，CAS 失败时整个事务回滚。

#### 3. 审批 `Idempotency-Key`

- 只作用于 `POST /flows/instances/:instanceId/tasks/:taskId`，作用域为单个实例；
- 首次成功时把 key、动作、意见、审批人写入任务；相同内容重放直接返回当前实例，不重复推进；
- 同 key 不同任务/动作/意见/审批人 → `409 IDEMPOTENCY_KEY_REUSED`；
- 重放判断在终态判断之前，保证「服务端已成功、响应丢失」的客户重试得到 200；
- 不带 key 的旧客户端保持原错误语义（`FLOW_TASK_STALE` / `FLOW_NOT_RUNNING`）。

#### 4. 流程 `pendingPatch` outbox

实例增加 `pendingPatch`（JSON）。审批到达 `end` 时：

1. 实例 CAS 写入 `pendingPatch` 并进入 `approved`；
2. 对记录做 CAS 回写 `onApprove.setField`；
3. 成功清空 `pendingPatch`；
4. 记录 CAS 冲突时重读记录重试；进程中断则由后续 GET 实例 / 列表 / 审批补偿。

选择「实例先落、记录后写」而不是反向，是因为实例是审批状态真相：先保证不会重复审批，再让记录回写可补偿。代价是短暂不一致窗口，补偿后收敛。

### 放弃的方案

- **悲观锁（SELECT ... FOR UPDATE / 进程锁）**：跨请求锁生命周期难管理，JSON 模式无数据库锁，且会阻塞正常读。
- **只靠 If-Match，不带时的请求不做 CAS**：旧客户端仍会丢更新；本方案对旧客户端也做 CAS。
- **流程与记录共用事务**：JSON 模式无法实现；MySQL 虽有事务，但会迫使流程/记录强耦合，且文件存储路径被破坏。
- **在 HTTP 层自动重试审批**：无法判断业务是否已成功，可能放大重复；改由幂等键保证服务端去重。
- **用 `Idempotency-Key` 做全局请求去重**：键的语义和过期策略复杂，本批只覆盖审批这一高风险写操作。

### 后果

- 旧客户端兼容，新客户端可主动获得 409 保护；设计器已接入。
- JSON 模式只适合单进程；多副本部署必须 `LC_STORAGE=mysql`。
- `pendingPatch` 采用至少一次回写；`setField` 是幂等赋值，重复补偿无业务副作用。
- 需要新增测试覆盖：并发同版本写、非法/陈旧 If-Match、幂等重放、同键改内容 409、并发审批、MySQL CAS 与 outbox 回读。

### 验证

- `apps/server/test/concurrency.test.ts`：页面/记录 ETag 与 409、非法 If-Match、并发写、审批幂等/终态重放、同键改动作/意见 409、并发审批。
- `apps/server/test/mysql.persistence.test.ts`：真实 MySQL 下 CAS / `pendingPatch` 回读。
- `apps/server/test/mysql.repositories.test.ts`：无数据库时覆盖仓储映射与 CAS 分支，保证 CI 覆盖率口径。
- 迁移 `20261022160000_optimistic_locking` 已在 `lowcode` 与 `lowcode_test` 应用，并通过 `information_schema` 回读 `revision` / `pendingPatchJson` 列。

---

## 新增决策模板

```markdown
<a id="adr-012"></a>

## ADR-012: 标题

- 状态：提案 | 已接受 | 已废弃（被 ADR-0XX 取代）
- 日期：YYYY-MM-DD
- 关联：方案章节 / 其他 ADR / 代码路径

### 背景

### 决策

### 后果

- ✅
- ⚠️
```
