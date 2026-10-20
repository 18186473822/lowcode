# 修复台账 · 2026-10-20（门禁红灯 + 页面列表缺口）

> **用途**：记录本轮「先定范围 → 再动手 → 逐项回写结果」的全过程。**本文件是唯一事实源**：任何一项改动必须在此留下「做了什么 / 命令 / 输出摘要 / 结论」。
> **触发来源**：2026-10-20 对仓库做的一次独立完成度核查（见 §1 实测），发现 1 条门禁红灯与若干工程缺口。
> **状态图例**：⬜ 未开始 ｜ 🟡 进行中 ｜ ✅ 已完成并验证 ｜ ❌ 未修（含理由）

---

## 1. 判定依据（2026-10-20 实测，非引用文档）

| # | 命令 | 结果 | 结论 |
|---|---|---|---|
| 1 | `pnpm -r typecheck` | exit 0（7 包） | 类型全绿 |
| 2 | `pnpm -r test` | 65 文件 / **1006 用例全过** | 与台账记载一致 |
| 3 | `pnpm coverage` | exit 0（阈值 90/85/90/90） | 覆盖门禁通过 |
| 4 | `pnpm -r build` | exit 0（6 包 Done） | 构建通过；designer-web 单包 1.23MB 告警 |
| 5 | **`pnpm design:check`** | **exit 1** | **红灯**：2 处硬编码色值 |
| 6 | `git status` | `fatal: not a git repository` | 仓库未纳入版本管理 |

第 5 项的具体报错：

```
✘ 2 处硬编码色值，分布在 1 个文件：
  packages/runtime/src/pages/view/index.vue  (2)
      L310:rgba(0, 0, 0, 0.72)  L311:#fff
```

**冲突点**：`.github/workflows/ci.yml` 的第一个 job 就是 `pnpm design:check`。也就是说 CI 一旦真跑，第一步必挂。
**归因**：这 2 行是 Phase 3 批 5「Profiler 角标」随批落地的，而 `.workbuddy/memory/2026-10-20.md`（ADR-007 那轮）记录的是「4 道门禁全 PASS」——**批 5 在记录之后合入，门禁未再复跑**。属回归，非设计取舍。

---

## 2. 本轮范围决策

原则：**只做「能当场验证 + 不改变既有架构决策」的项**；凡是需要环境（远端 CI、微信开发者工具）或会推翻既有 ADR 的项，一律挂账不硬做。

### 2.1 本轮做（4 项）

| 批次 | 内容 | 为什么现在做 |
|---|---|---|
| **A1** | 修复 `design:check` 红灯（Profiler 角标 2 处色值） | 门禁红灯是唯一「现在就错」的东西；且 CI 第一步依赖它 |
| **A2** | 补根目录 `README.md` | 仓库零入口文档，新人无法在 5 分钟内跑起来。纯新增，零风险 |
| **B1** | 服务端补 `GET /pages`（列表）+ `DELETE /pages/:id` | 数据目录已沉淀 10 个页面，但**没有任何接口可以列出它们**；设计器只能靠手输 pageId 换页（`pid-input`）。这是日常使用中最大的摩擦点 |
| **B2** | 设计器接入页面列表与删除（`DesignerApi` / store / 顶栏 UI + 测试） | B1 的消费端；不做则 B1 只是一组没人调的接口 |

### 2.2 本轮明确不做（8 项，全部挂账见 §6）

| 项 | 不做的理由 |
|---|---|
| `git init` + CI 首次实跑 | 需要远端仓库与凭据，属用户侧决策；**未经许可不擅自建立版本库** |
| 小程序真机验证 | 环境无微信开发者工具（L-5 已记） |
| 存储换数据库（Prisma/PG/Redis） | 推翻 ADR-004（JSON 文件仓储）是独立方案，不能顺手做 |
| 乐观锁 / `If-Match` | 会改协议与并发语义，需单独设计 + 冲突策略评审 |
| JWT 密钥 fail-closed / CORS 白名单 / 限流 | 属 Phase 4 生产化，且会改变现有本地开发启动方式 |
| 用户体系落库 + 用户管理 UI | 依赖数据库决策（同上） |
| 5 个复杂 setter（slider/ruleEditor/…） | 各自是独立功能，需逐项设计与测试 |
| 图表跟随主题 | 属渲染管线改造（base64 SVG 里 CSS 变量不生效），需改组件契约 |

### 2.3 验收标准（每批必须能跑出结果）

```bash
pnpm design:check     # A1 后必须 exit 0
pnpm -r typecheck     # 所有批次后 exit 0
pnpm -r test          # 所有批次后全过，且用例数只增不减
pnpm coverage         # exit 0
```

---

## 3. 批次详设

### 批次 A1 · 修复 `design:check` 红灯

**目标**：`packages/runtime/src/pages/view/index.vue` 第 310–311 行不再出现色值字面量。

**方案（不豁免，改用令牌）**：

| 原值 | 改为 | 理由 |
|---|---|---|
| `background: rgba(0, 0, 0, 0.72)` | `var(--lc-bg-inverse)` | 浅色下 = `--lc-neutral-800`（#1f2329），与原深色角标视觉一致 |
| `color: #fff` | `var(--lc-text-inverse)` | 浅色下 = #fff，与原值完全相同 |

**为什么不加 `design-token-exempt`**：门禁的豁免口径是「确实无法用 CSS 变量的场景」（如 `input[type=color]` 只接受字面量、base64 SVG 读不到变量）。这里**完全可以用令牌**，加豁免属于绕过门禁。

**已知的视觉副作用（须记录）**：暗色主题下角标会变成「浅底深字」（`--lc-bg-inverse` 在 dark 下 = `--lc-neutral-50`）。这是反向叠层的正确语义（tooltip 反色），但确实与原来「恒深色」不同——**在此登记为有意变更**，若产品侧要求恒深色，改回做法应是新增一组 `--lc-profiler-*` 组件令牌，而不是硬编码。

### 批次 A2 · 根目录 `README.md`

内容：项目定位 / 目录结构 / 环境要求 / 三条启动命令（server、designer-web、runtime）/ 门禁命令清单 / 关键文档索引 / 已知环境限制。**只描述现状，不发明未实现的能力**。

### 批次 B1 · `GET /pages` + `DELETE /pages/:id`

- 仓储层：`PageRepository` 增 `list()` / `remove(id)`，文件实现读目录扫 `.json`；删除须同时清理该页全部版本（避免孤儿数据）。
- 服务层：`list()` 返回轻量摘要（`id / name / type / status / currentVersion / updatedAt`，不含 schema 全文）；`remove()` 不存在时 404 `PAGE_NOT_FOUND`。
- 控制器：`GET /pages`（登录即可）、`DELETE /pages/:id`（仅 `'*'` 角色，沿用 `PUT /apps/config` 的写权限口径）。
- 协议文档：`docs/protocol.md` §10 补两行契约 + 错误码。
- 测试：`apps/server/test/` 新增列表/删除/权限/404/孤儿版本清理用例。

### 批次 B2 · 设计器接入

- `DesignerApi` 增 `listPages` / `deletePage`（`typecheck` 会强制 `designer-web/src/api.ts` 同步实现，这是仓库既有的接口契约锁）。
- store：`pages` 状态 + `loadPages()` + `deletePage(id)`（删除当前页时回落并提示）。
- 顶栏：pageId 输入框旁加「页面」下拉（列出 `id + name`），选即打开；当前页可删（两步确认）。
- 测试：store 的状态机与幂等、删除当前页的回退行为。

---

## 4. 执行日志

> 每条记录格式：`时间 · 批次 · 动作 · 命令 · 输出摘要 · 结论`。按时间追加，**不覆盖历史**。

| 时间 | 批次 | 动作 | 命令 / 产物 | 结果 |
|---|---|---|---|---|
| 14:02 | 计划 | 建立本台账，冻结范围（做 4 项 / 不做 8 项） | `docs/remediation-plan-2026-10-20.md` | ✅ 已落盘 |
| 14:05 | **A1** | 改 `runtime/src/pages/view/index.vue` L310-311：`rgba(0,0,0,0.72)` → `var(--lc-bg-inverse)`；`#fff` → `var(--lc-text-inverse)`，并加注释说明反色语义 | `edit` + `pnpm design:check` | ✅ **4 道门禁全 PASS**：tokens 漂移 0 ｜ 硬编码色值 0（豁免仍 12 处，未新增）｜ rpx 同步 ✔ ｜ 对比度无退化 |
| 14:10 | **A2** | 新建根 `README.md`：定位 / 环境 / 三条启动命令 / 开发账号 / 目录结构 / 门禁清单 / 文档索引 / 已知限制（含 B-31/B-37/B-47 三条踩坑提示） | `README.md`（新增，131 行） | ✅ 已落盘；事实逐条对齐 `package.json` 与 `vite.config.ts`（端口 3000/5174/5173、代理目标、脚本名） |
| 14:20 | **B1** | `PageRepository` 增 `remove()`；`FilePageRepository` 实现（`unlink`，`ENOENT`/非法 id → `false`）；`PageService` 增 `listPages()` / `removePage()`（含 `PageSummary` / `PageDeleteResponse` 类型）；`PageController` 增 `GET /pages`（RBAC 可见性过滤）与 `DELETE /pages/:id`（限 `'*'`） | 4 个源文件 `edit` | ✅ `pnpm -F @lc/server typecheck` exit 0 |
| 14:24 | **B1** | 补测试：`page-repo.test.ts` +4（删除成功/不存在/目录缺失/路径穿越）；新增 `page-list.test.ts` 11 例（鉴权、空表、摘要不含全文、倒序、发布计数、可见性过滤、403 无副作用、删除成功、重复删除 404、非法 id 400、同 id 重建无孤儿版本） | `pnpm -F @lc/server test` | ✅ **9 文件 / 176 用例全过**（161 → 176，+15，零回归） |
| 14:26 | **B1** | 回写 `docs/protocol.md` §10.1：新增 `GET /pages`、`DELETE /pages/:id` 两行契约 | `docs/protocol.md` | ✅ 已补 |
| 14:27 | **B1（顺带）** | **发现并修正文档错误**：`GET /models` 契约原文写 `{ items: [...] }`，但实现（`listSummaries()`）与前端（`api.ts` `listModels()`）都是**裸数组** | `docs/protocol.md` | ✅ 已改为 `Array<...>` 并标注勘误。**未改代码**——以实现为准，文档是错的一方 |
| 14:31 | **B2** | `designer-web/src/api.ts`：`listPages()` 从复用 `/apps/bootstrap` 改为 `GET /pages`（直接消费 `PageSummary[]` 的 type/status/currentVersion/updatedAt）；新增 `deletePage(pageId)` → `DELETE /pages/:id` | 2 个方法 `edit` | ✅ `pnpm -F @lc/designer-web typecheck` 通过（接口契约锁生效） |
| 14:33 | **B2** | store 导出 `pages/pagesError/pagesLoading/pagesLoaded` 与 `loadPages(force)`、`deletePage(id)`；删除当前页时自动切到剩余第一页，**删最后一页落新草稿**；补「下一页打不开」兜底（落 `page_new`/递增 id），避免已删页 schema 被再次 upsert | `packages/designer/src/store/store.ts` | ✅ 状态机与回退路径可单测 |
| 14:35 | **B2** | 顶栏接入：页面下拉（`name（id）`，选中即打开）+ 删除按钮（两步确认，10s 自动复位，不用原生 `confirm`）+ 输入框 `datalist` 候选；保存/发布成功刷新列表；`<1024px` 隐藏重复的页面/性能徽标，顶栏不再横向溢出 | `apps/designer-web/src/App.vue` + `style.css` | ✅ 浏览器实测通过 |
| 14:38 | **B2** | 新增 `packages/designer/test/page-list.test.ts` **11 例**：加载成功/失败/未注入/已加载短路/force/空列表；删非当前/当前/最后一页/下一页打不开回落/服务端失败/宿主无删除能力/未注入 | `pnpm -F @lc/designer exec vitest run test/page-list.test.ts` | ✅ 11/11 PASS；`pnpm -F @lc/designer typecheck` exit 0 |
| 14:43 | **B2（浏览器 DoD）** | 真实启动 server :3000 + designer-web :5174：下拉列出 10 页 → 选临时页 `p_b2_smoke_1792478344` 打开 → 第一次点删除变「确认删除」危险态 → 第二次删除成功并自动切到 `pgc_ops_bad`，状态含「已删除 …（含 0 个历史版本），已切换到 pgc_ops_bad」；服务端回查临时页 0 残留、现有 10 页未动；console 0 error | 浏览器自动交互 + `GET /pages` 回查 | ✅ DoD 全过；两个 dev 进程已停止（B-42） |
| 14:46 | **B2（全量门禁）** | `pnpm -r typecheck` / `pnpm design:check` / `pnpm -r build` / `pnpm -r test` / `pnpm coverage` | 见 §5 收口实测 | ✅ 五项全绿（1032 例 / 67 文件；coverage 96.17/87.96/95.87/96.17） |

---

## 5. 收口结果（2026-10-20 14:46）

### 5.1 本轮四项：全部完成

| 批次 | 状态 | 交付内容 | 验证证据 |
|---|---|---|---|
| **A1** | ✅ 已完成并验证 | Profiler 角标 2 处硬编码色值改令牌（`--lc-bg-inverse` / `--lc-text-inverse`） | `pnpm design:check` exit 0；硬编码 0 处、豁免仍 12 处未新增、对比度无退化 |
| **A2** | ✅ 已完成并验证 | 根 `README.md`（定位/环境/启动/账号/目录/门禁/文档索引/已知限制） | 已落盘；端口与脚本逐条对齐 `package.json`、`vite.config.ts` |
| **B1** | ✅ 已完成并验证 | 服务端 `GET /pages`（RBAC 可见性过滤）+ `DELETE /pages/:id`（仅 `'*'`，连带清理全部版本）+ `protocol.md` §10.1 | server 用例 161 → **176**（+15）；真实接口回查通过 |
| **B2** | ✅ 已完成并验证 | 设计器 `DesignerApi.listPages/deletePage` + store 状态机 + 顶栏页面下拉/两步删除 + 11 例单测 + 浏览器 DoD | designer 用例 324 → **335**；下拉/换页/删除/回落/服务端回查全过 |

### 5.2 全量门禁实测（收口基线）

| 命令 | 结果 | 备注 |
|---|---|---|
| `pnpm -r typecheck` | ✅ exit 0 | 7 包全 Done，**此前的 TS6133 红灯已消除** |
| `pnpm design:check` | ✅ exit 0 | 4 道子检查全 PASS |
| `pnpm -r build` | ✅ exit 0 | 5 包 Done；designer-web 1,233.98 kB / gzip 400.09 kB（体积告警仍在，非阻断） |
| `pnpm -r test` | ✅ **1032 passed / 67 文件** | tokens 5 + schema 90 + expression 117 + renderer 309 + server 176 + designer 335 |
| `pnpm coverage` | ✅ exit 0 | **96.17 / 87.96 / 95.87 / 96.17**，67 文件 78.18s（阈值 90/85/90/90） |

> 说明：§1 的 1006 例 / `design:check` exit 1 是**本轮开始前**的基线，保留作对照；收口基线以 §5.2 为准。

### 5.3 挂账（8 项；状态见 §6）

这 8 项见 §6；**P0 修复轮一项都没做**。2026-10-20 后续进展：#5 安全加固已完成（见 `docs/security-hardening-2026-10-20.md`）；#1 本地仓库与 Gitee 推送已完成，但远端 CI 仍未实跑（Gitee 托管 CI 无法用 Node 22）。其余仍未开始。

---

## 6. 挂账清单（8 项；最新状态见下表）

| # | 挂账项 | 状态 | 为什么不在本轮做 | 启动条件 / 下一步 |
|---|---|---|---|---|
| 1 | `git init` + CI 首次实跑 | 🟡 部分完成 | 本地仓库、Gitee 推送已完成（`master`）；Gitee 不执行 GitHub Actions，Gitee Go Node 插件最高 15.12.0，无法跑 Node 22 | 首选 GitHub 镜像跑现有 Actions（workflow 已覆盖 `master/main`），或 Gitee 自托管 runner；见 `docs/p1-git-ci-2026-10-20.md` |
| 2 | 小程序真机验证 | ⬜ 未开始 | 环境无微信开发者工具（L-5） | 安装开发者工具 → 导入 `packages/runtime/dist/build/mp-weixin` → 真机扫码；产物级构建已通过 |
| 3 | 存储换数据库（Prisma/PG/Redis） | ⬜ 未开始 | 推翻 ADR-004（JSON 文件仓储）是独立方案，不能顺手做 | 单独立项：仓储接口抽象 → PG 适配 + 迁移脚本 → 事务/并发语义评审 |
| 4 | 乐观锁 / `If-Match` | ⬜ 未开始 | 会改协议与并发语义，需单独设计冲突策略 | 与数据库迁移同批设计：版本号/ETag + 409 冲突契约 + 客户端合并 UI |
| 5 | JWT 密钥 fail-closed / CORS 白名单 / 限流 | ✅ 已完成 | 已实现生产密钥强制（≥32）、CORS 显式白名单、普通/登录双层限流；本地开发保留回退密钥并告警 | 审计日志 / 账号锁定 / 多实例 Redis 限流仍待做，见 `docs/security-hardening-2026-10-20.md` §6 |
| 6 | 用户体系落库 + 用户管理 UI | ⬜ 未开始 | 依赖数据库决策（同上）；当前为内存种子账号 | 与 #3 同批：用户/角色/组织表 + 管理界面 + 迁移种子账号 |
| 7 | 5 个复杂 setter（slider/ruleEditor/…） | ⬜ 未开始 | 各自是独立功能，需逐项设计与测试 | 按属性面板使用频率排序，逐个补「编辑态 + 校验 + 回写」三件套 |
| 8 | 图表跟随主题 | ⬜ 未开始 | 属渲染管线改造（base64 SVG 内 CSS 变量不生效），需改组件契约 | 生成 SVG 时注入主题色（服务端/前端取 token）或改内联 SVG 渲染方案，单独立项 |

> 环境类阻塞另记：mp 真机（#2）、CI 首次实跑（#1）在具备环境前无法给出「已验证」结论。仓库已于 2026-10-20 初始化为 Git 仓库并推送到 Gitee（`master`）；CI 实跑仍受 Gitee 托管环境限制。
