# 实施进度台账（PROGRESS）

> **用途**：每次交付后更新本文件，明确记录「已实现 / 未实现 / 与方案的偏差 / 下一步」。
> **原则**：只写经过验证的内容。凡标注 ✅ 的项均已通过 `pnpm test` / `pnpm typecheck` / `pnpm build` 验证。
> **方案基准**：`D:\mimo\移动端低代码平台落地方案.md`

---

## 总览：各 Phase 状态

| Phase | 名称 | 计划周期 | 状态 | 说明 |
|---|---|---|---|---|
| Phase 0 | 协议与地基 | 2 周 | 🟡 **接近收口（8 个工作项已完成 7 个）** | 协议包、表达式引擎、渲染引擎（逻辑层 + uni 组件层 H5 实测）、`apps/server`、`protocol.md`、uni-app 运行时壳、**覆盖率 95.53% 强制门禁、CI workflow、组件层冒烟测试、ADR** 均已完成；仅剩：Turborepo（可选项）、mp 真机验证（无微信开发者工具）、CI 未实跑（已推送 Gitee，但 Gitee 托管 CI 无法跑 Node 22） |
| Phase 1 | 最小闭环 MVP | 4 周 | 🟡 **主线收口（物料 12 个 ✅ + 设计器批 1~5 ✅ + 服务端动态 CRUD ✅ + 运行时壳 ✅ → 出口判据全通）** | 物料库 12 个归位并 H5 实测 ✅（2026-10-09）；**设计器批 1「画布能渲染」✅ + 批 2「能拖入删除」✅ + 批 3「能配置保存」✅**（批 3 于 2026-10-10）+ **批 4「页面↔模型字段绑定」✅**（2026-10-12，D-A11 双层配置，见「已实现 16」）+ **批 5「出口判据闭环」✅**（2026-10-14，D-A12 必填联动 + D-A13 动作绑定 + textarea setter，见「已实现 18」）；**服务端动态 CRUD ✅**（2026-10-10，9 接口 + 真实启动冒烟 18/18，见「已实现 15」）；**运行时壳（登录/菜单/`pageId` 路由）✅**（2026-10-12，见「已实现 17」）；**主方案 Phase 1 出口判据 1/2/3 全通 ✅**（2026-10-14）—— Phase 1 主线就此收口，余项为环境/可选（mp 真机、CI 实跑）与 Phase 2 归属 |
| Phase 2 | 企业级能力 | 6 周 | 🟢 **全线收口（批 1~7 全部 ✅，出口判据全通）** | 拆 7 批见 `lowcode/docs/phase2-plan.md`；**批 1「模型可视化建模」✅**（2026-10-14，D-P2-1 视图切换 + ModelPanel/model-ops + putModel，服务端零改动，见「已实现 19」）；**批 2「列表/详情标准页」✅**（2026-10-14，D-P2-2 协议补 `DetailPageConfig` + lc-list/detail-page + runtime 按 type 分发 + 设计器配置面板，见「已实现 20」）；**批 3「物料 12→30」✅**（2026-10-14，18 新物料对齐 `FieldType` 全集 + optionList/color setter + demo 30 全量演示，服务端零改动，见「已实现 21」）；**批 4「设计器可用性」✅**（2026-10-14，D-P2-7 快照双栈撤销重做 + 大纲树 + 跨页剪贴板 + D-P2-3 修复，服务端零改动，见「已实现 22」）；**批 5「版本管理 UI」✅**（2026-10-14，D-P2-8 补 `GET /pages/:id/versions` + D-P2-9 自研结构化 diff + HistoryDialog 历史/回滚/对比，见「已实现 23」）；**批 6「权限 RBAC」✅**（2026-10-15，D-P2-10 单文件配置 + D-P2-11 四层判定单一事实源 + D-P2-12 权限管理视图/节点 perm/模型数据权限，双账号 DoD 四点全过，见「已实现 24」）；**批 7「出口判据 Demo + 多端打包」✅**（2026-10-15，请假申请三页 Demo 全流程十步留档 + B-41 物料默认值残留清理 + D-P2-13 受控回显兜底 + mp 分包产物验证，见「已实现 25」）—— **Phase 2 七批全部收口，出口判据「30 分钟搭出申请-列表-详情；小程序端跑通（产物级，真机受环境限制）」达成** |
| Phase 3 | 流程与体验 | 4 周 | 🟢 **全线收口（批 1~5 全部 ✅）** | 拆 5 批见 `lowcode/docs/phase3-plan.md`（2026-10-15 立项，与负责人对齐：导出/消息裁剪）；出口判据（拟定已确认）：**带审批的申请应用**（提交 → 待办 → 同意 → 状态变更 + 时间轴可见；门户图表 + 主题换色）；**批 1「流程引擎核心」✅**（2026-10-15，D-P3-1 FlowSchema 协议 + `validateFlow` + 服务端 flow 模块 7 接口 + 记录提交联动启动实例 + assignee 判定 D-P3-2 + 依赖方向 D-P3-3，见「已实现 26」）；**批 2「审批物料 + 待办中心」✅**（2026-10-16，D-P3-4 物料数据通道 + D-P3-4b `$expr` recordId 绑定 + D-P3-5 待办两页 + D-P3-6 单实例接口 + **B-44** optimizeDeps 双实例教训，见「已实现 27」）；**批 3「本地草稿 + 主题配置」✅**（2026-10-19，D-P3-7 草稿时机/存储分层 + D-P3-8 apps.json 配置与档位覆盖主题 + D-P3-9 dark 配置优先，见「已实现 28」）；**批 4「图表物料 + Portal 页型」✅**（2026-10-20，D-P3-10 Chart 三形态纯 SVG + Statistic + 客户端聚合，D-P3-11 `PortalPageConfig` 卡片导航与拖拽区共存，H5 + 设计器双实测，见「已实现 29」）；**批 5「埋点与错误上报 + Profiler」✅**（2026-10-20，D-P3-12 ops 事件表/三接口、D-P3-13 上报队列 + 不白屏、D-P3-14 Profiler 双端可见，H5 DoD + 冒烟 23/23，见「已实现 30」）—— **Phase 3 五批全部收口** |
| Phase 4 | 生产化与开放 | 4 周 | 🟡 **安全 + 可观测性 + 数据库三批 + 并发控制 + 详情/列表记录写入口 + OpenAPI 文档完成** | 2026-10-20：JWT 生产 fail-closed、CORS 白名单、普通/登录限流已完成并回归（见 `docs/security-hardening-2026-10-20.md`）；2026-10-21：健康/就绪探针、`X-Request-Id`、结构化访问日志、部署/备份文档完成（见 `docs/observability-deployment-2026-10-21.md`）；**MySQL 8 + Prisma 三批完成**（用户/角色、页面/版本、模型/记录、RBAC、流程定义/实例、运维事件、应用配置、文件元数据/内容共 13 表；`LC_STORAGE=json` 仍为默认/测试路径，见 ADR-008 / ADR-009 / ADR-010 / 「已实现 32、34」）；**运维事件写入改为追加 + 裁剪**（避免并发上报后写覆盖先写，见「已实现 33」）；2026-10-22：**页面/记录/流程实例乐观锁、审批幂等与 `pendingPatch` outbox**（见「已实现 35」/ ADR-011）；**标准详情页记录编辑/删除入口（`detail.editable/deletable`，If-Match + 409 不覆盖）**（见「已实现 36」）；**标准列表页行内编辑 + 批量删除（`list.editable/deletable`，逐行 If-Match + 409 保留选择）**（见「已实现 37」）；**OpenAPI 3.1 文档端点 `GET /api/v1/openapi.json`（39 条路由 + 路由反射防漂移）**（见「已实现 38」）；Webhook/远程物料、多环境/压测、导出打印/消息仍未开始 |

**图例**：✅ 已完成并验证 ｜ 🟡 部分完成 ｜ ⬜ 未开始 ｜ ❌ 阻塞/放弃

---

## 本次交付（2026-10-08 ~ 10-15）

**交付批次**：Phase 0 · 第 3 批（第 1~5 项）+ 收尾两项（组件层冒烟测试、ADR）+ **Phase 1 · 第 1 批（物料 12 个）+ 设计器落地方案 + 设计器批 1~3（画布渲染 / 拖入删除 / 配置保存）+ 服务端动态 CRUD**

**交付物**：
- **第 1 项（D-7 选型 C）**：受信任 `app` API + 生命周期多步执行 + 协议 `LifecycleHook = string | string[]` + 校验器 `$expr:` 误报修复
- **第 2 项**：`apps/server` 服务端骨架 —— NestJS 11（ESM）+ 登录（scrypt + HS256 JWT）+ 页面 Schema 存取 / 静态校验 / 发布 / 回滚 + 页面版本模型（方案 8.3 的 5 个接口 + 8.4 双表）
- **第 3 项**：`docs/protocol.md` **v1.0** 协议规范文档 —— 524 行 / 11 章 + 2 附录：通用约定 + Expr（运算符/37 内置/4 白名单/19 禁用键/容错语义）+ Page（节点树/生命周期/数据源/规则/列表页）+ **Action 15 种** + Material + Model + App + **33 个校验错误码全集** + `PageControllerOptions` 构造契约 + migrate 抛错语义 + **服务端 7 接口契约** + **`app` API 清单**；全部字段与数字**逐条对照 TS 类型与运行时实测核对**；顺带完成 **B-17 文档勘误**
- **第 4 项（本项）**：`packages/runtime` **uni-app 运行时壳**（CLI/Vite 路线，**D-10**）—— 手写 JSON demo → **H5 浏览器实测全链路通过**（3 物料渲染 + 表达式求值 42 + 输入联动 + 按钮 toast 动作），`build:h5` / `build:mp-weixin` 构建产物验证（小程序 wxml 的 `wx:if` 分发链 + `bindchange` 冒泡）；修复 **B-18**（容器分支缺失）、**B-19**（change 冒泡断裂）；**Phase 0 出口判据达成**
- **第 5 项（本项）**：**CI 与覆盖率** —— `pnpm coverage`（vitest workspace 聚合 + v8 阈值强制：行/语句/函数 ≥90、分支 ≥85）**实测 95.6 / 86.71 / 97 / 95.6**，分包 **schema 96.05 / expression 93.84 / renderer 97.42 / server 94.82 全部 ≥90**（方案 9.2 硬指标达成）；`.github/workflows/ci.yml`（typecheck → build → test → coverage 阈值 → 服务端真实启动冒烟 → 体积告警）；定向补 **10 个负向用例**（Action/数据源/节点错误分支）+ barrel 导出 smoke；修复 **B-20**（vitest 向上发现 workspace 破坏子包独立跑）；**顺带修正第 4 项日期笔误（09-30 → 10-08）**
- **第 7 项（本项，2026-10-09）**：**组件层冒烟测试** —— `@vue/test-utils@2.4.6 + jsdom@25 + @vitejs/plugin-vue@5`（renderer 包级 `vitest.config.ts`，仅 `test/uni/**` 走 jsdom）；`test/uni/lc-node.test.ts` **7 用例**：v-if 链分发 / `$expr` 求值透传 / visible 隐藏 / **B-18 回归**（Page/View/Group 容器分支 + 未知组件兜底）/ **B-19 回归**（嵌套 Input → setField + change 冒泡 + renderer 全链联动文案刷新）/ Button 动作 → host.toast；**uni 层 `.vue` 从此纳入覆盖率统计**（口径更新：总 95.6→**95.53**、分支 86.71→**88.3**，renderer branches 89.74→93.85）
- **第 8 项（本项，2026-10-09）**：**ADR 架构决策记录** —— `docs/adr/`（README 索引 + 6 篇：001 静态物料注册/自研表达式 · 002 表达式禁赋值+受信 app API · 003 纯逻辑层+副作用注入 · 004 JSON 文件仓储 · 005 uni CLI 工程+easycom 三规则 · 006 pnpm -r+覆盖率门禁），与方案 2.4 互补（方案讲设计、ADR 记取舍）
- **第 9 项（本项，2026-10-09 · Phase 1 第 1 批）**：**物料库归位与 12 物料** —— 新建 `packages/materials`（`@lc/materials`，easycom 规则三改指 `@lc/materials/src/$1/index.vue`）；3 物料迁移 + 8 新写（Textarea/NumberInput/Radio/Select/Switch/Upload/Image/Divider）+ Page/FormGroup 容器（lc-node 内联分组头）；lc-node v-if 链扩至 11 路物料分发；组件测试加 **12 物料分发矩阵用例**；**H5 实测 20/20 静态断言 + 6 项交互回归** + 全页截图留档；`packages/materials` 加入 coverage 排除口径（首次实测未排除时总覆盖跌至 73.49% 触阈值报错）；修复 **B-21**（PowerShell 默认编码破坏 UTF-8 物料文件）
- **第 10 项（本项，2026-10-09）**：**Web 设计器落地方案** —— `docs/designer-plan.md`：现状盘点（7 缺口）+ **D-A1 画布渲染决策**（同进程 + uni-shim 7 标签 + rpx→px，维持主方案 D6；否决 iframe 画布与每物料占位版）+ D-A2~A7 + **4 批实施计划与验收** + 7 风险对策；**仅方案未动工，待评审**
- **第 11 项（本项，2026-10-09）**：**设计器批 1「画布能渲染」** —— 新建 `packages/designer`（shim/增强器/material-map/画布/demo fixture）+ `apps/designer-web`（Vite + rpx→px 插件 + 三栏布局 + Pinia）；lc-renderer 加 `mode=design`（**provide/inject 设计状态免递归透传** + select 逐层冒泡回归用例，renderer 155→157）；**实测推翻方案期假设并修正回写**：**B-22**（view/text/image/switch 是 SVG 标签被 Vue 直出，组件 shim 无效 → CSS 兜底 + image/switch 无结构侵入增强器）、**B-23**（Vue 对未知元素写 `checked="false"` 字符串 → hasAttribute 误判 → isOn/isDisabled 排除 "false"）、3 物料 `onInput` 加 `e.target.value` 双端回退；**浏览器实测全过**（12 物料/rpx 0 残留/交互 4 项/嵌套选中/0 error）+ 截图 `docs/screenshots/designer-batch1.png`
- **第 12 项（本项，2026-10-09 · 设计器批 2）**：**能拖入删除** —— core 层 `schema-ops`/`anchor`/`dnd` 纯函数 + Pinia store（insertMaterial/moveByDrop/removeById/moveById/setProp）+ 物料面板/属性面板（**META TS ×13** 分组展示 12、settings 三列只读）+ 画布 HTML5 DnD 指示线与**自研 mouse 换位手势** + App 接线（Delete 键/root 禁用）；修复 **B-24**（lc-renderer 一次性构造 controller → schema 替换画布零更新 → shallowRef+watch 重建 + selectedId 受控 prop）、**B-25**（SVG 遮罩 HTML5 DnD 会话不建立 → 节点换位自研 mouse 手势，双机制共用 anchor）、**B-26**（VTU attachTo 需 Vue 3.5 + detached 树切断 window 冒泡 → 手动 append + afterEach）；**D-A8 决策注记**（meta TS 形态/store+面板归 designer/insertNode 签名微调/指示线 fixed 等 9 条）回写 designer-plan；浏览器实测全过（拖入/换位/删除/指示线/settings 列出/0 error，截图待补）
- **第 13 项（本项，2026-10-10 · 设计器批 3）**：**能配置保存** —— 属性面板 4 setter 原生控件真渲染（input 实时/number/switch/select 反查原值）+ 未支持 setter 只读占位 + `readNodeValue` 读写对称；store 持久化状态机（`pageId/saveState/statusText/validation` + `touch()` 即时校验）+ **`DesignerApi` 注入**（designer-web `api.ts` 自动登录 fetch 实现 + vite `/api` 代理）；顶栏 pageId/打开/新建/保存/发布 + 状态徽标、底栏校验错误列表；**校验不过不发 PUT、publish 自动先存**；修复 **B-27**（demo fixture `schemaVersion` 须三段 semver，首跑校验即抓出）；**D-A9** 6 条决策注记回写 designer-plan；浏览器实测全过（保存建档/reload 回读一致/改 label 即时刷新/幂等/发布 v1/校验阻断恢复/0 JS error，截图待补）
- **第 14 项（本项，2026-10-10 · Phase 1）**：**服务端动态 CRUD** —— 方案 8.3 与 12.5 落地：`model/`（`GET /models` 摘要列表、`GET/PUT /models/:id` 定义读取与 upsert 建档、**与前端同源校验** `validateModel`+`checkExpr` + 字段 key/type 白名单 + 系统保留名拦截）、`record/`（`POST/GET/PUT/DELETE .../records`：**sanitize → 类型 → `checkRule` 三步「不信任前端」校验**、filter 等值严格类型 + sort + page/size（上限 100）、软删、审计字段服务端权威）、`file/`（`POST /files/upload` multipart 10MB 限 + `defParamCharset:'utf8'` 修中文名乱码、`GET /files/:fileId` **公开读取**字节流）+ 全局 `StorageModule`（`DATA_DIR` 由 PageModule 提升为 `@Global()`）；server 加依赖 `@lc/renderer`（`checkRule` 同源复用，不重写第二套校验）；**server 测试 38 → 93**（`model.test.ts` + `file.test.ts` 新增 55 用例）；**真实启动冒烟 18/18 通过**（连跑两遍幂等）

**代码规模**：第 1 项见变更日志；第 2 项新增 `apps/server` 实现 15 文件 / 840 行 + 测试 2 文件 / 382 行；根 `package.json` 脚本改 `pnpm -r` 全量递归；第 4 项新增 `packages/runtime` 工程 16 文件（含 3 物料 + host + demo JSON）

**验证结果**：

```
pnpm typecheck   → ✅ 全部通过（6 个包：schema/expression/renderer/server/designer/designer-web），exit 0
pnpm build       → ✅ 全部通过（5 包 Done：schema/expression/renderer/server/designer-web；designer/materials/runtime 无 build 脚本），exit 0
pnpm test        → ✅ 537 通过 / 0 失败（schema 66 + expression 117 + renderer 160 + server 93 + designer 101），exit 0
pnpm coverage    → ✅ 96.06% stmts / 87.41% branch / 96.90% funcs / 96.06% lines（阈值 90/85/90/90 强制通过，exit 0）
                   分包 stmts：schema 96.05 · expression 93.84 · renderer 97.26 · designer 97.42 · server 95.60（均 ≥90）
                   分包 branch：87.22 · 84.24 · 93.22 · 86.29 · 84.87（**分包不设阈值，以总分支 87.41 过门禁**）
真实启动冒烟     → ✅ 服务端动态 CRUD **18/18 通过、连跑两遍幂等**（登录/建档/回读/新增×2/审计字段/range 越界/缺必填/
                   列表排序/filter/分页/部分更新/清空必填拦截/软删/上传 PNG/中文名不乱码/公开读取字节一致/页面接口回归）
```

> **测试数按批次演进**：390（Phase 0 收尾 + 设计器批 1）→ 462（批 2）→ 482（批 3）→ **537（服务端动态 CRUD，server 38→93）**。
> 分包覆盖率由 `coverage/coverage-final.json` 分组求和实测（脚本 `%TEMP%\opencode\cov-agg.mjs`），非目测。

**其余交付项的历史验证记录**：

```
H5 dev 实测      → ✅ 物料 12 个全渲染（20/20 断言：分组头/rpx 生效/无未知）+ 6 项交互回归（联动「你好，张三丰！count+1 = 42」/
                   Switch 回合切换 / toast / Textarea 计数 0→6 / Radio checked 迁移 / Number 99.5 保持）+ console 无 error；
                   截图 docs/screenshots/phase1-materials-h5.png
设计器实测       → ✅ designer-web :5174 12 物料渲染 + rpx 0 残留 + picker/switch/radio/image 交互 + 嵌套节点选中（n-in-fg）
                   + 右面板联动 + console 0 error；截图 docs/screenshots/designer-batch1.png
构建产物         → ✅ build:h5 / build:mp-weixin 均 DONE；mp wxml 抽查 wx:if 链 + bindchange 通过
CI workflow      → 🟡 已写入 .github/workflows/ci.yml，未推送远端 / 未在真实 Actions 跑过（本机非 git 仓库，D-13/L-8）
批 2/3 验收截图  → ⬜ 待补（browser.screenshot 报 "Screenshot needs a visible tab"，OS 桌面窗口不可见）
```

> 第 1/2/3 项见变更日志与对应章节；第 4 项明细见「已实现 6」。

---

## ✅ 已实现（本次）

### 1. Monorepo 工程骨架

| 路径 | 说明 | 状态 |
|---|---|---|
| `lowcode/package.json` | 根清单，统一 `build/test/typecheck` 脚本 | ✅ |
| `lowcode/pnpm-workspace.yaml` | workspace 定义 + esbuild 构建白名单 | ✅ |
| `lowcode/tsconfig.base.json` | strict TS 基线，供各包继承 | ✅ |
| `lowcode/.gitignore` | 忽略 node_modules/dist/coverage | ✅ |
| 工具链 | pnpm 12.6.0 + TypeScript 5.9.3 + Vitest 2.1.9 | ✅ 已安装并跑通 |

> 环境备注：本机原先无 pnpm，已通过 `npm i -g pnpm` 安装；pnpm 12 默认拦截依赖构建脚本，已用 `pnpm approve-builds esbuild` 放行。

### 2. `packages/schema` —— 核心协议包（零运行时依赖）

| 模块 | 文件 | 已实现内容 | 状态 |
|---|---|---|---|
| 版本 | `src/version.ts` | `SCHEMA_VERSION='1.0.0'`、`VERSION_HISTORY`、`compareVersion`、`isValidVersion`、`isKnownVersion` | ✅ |
| 节点协议 | `src/types/node.ts` | `NodeSchema`（id/componentName/props/style/condition/loop/loopArgs/actions/perm/children）、`Action`（15 种动作的可辨识联合）、`Rule`（6 种校验规则）、`SettingDesc`、`NodeStyle`；工具 `walkNode`/`findNode`/`collectComponentNames` | ✅ |
| 页面协议 | `src/types/page.ts` | `PageSchema`、`PageType`、`DataSourceSchema`（http/model/static/formula）、`PageLifecycle`、`PageSubmit`、`ListPageConfig`、`PageParam` | ✅ |
| 物料协议 | `src/types/material.ts` | `MaterialSchema`（name/category/defaultProps/settings/styleSettings/events/supports/hasField/defaultRules/actionTypes）、`MaterialCategory`、`Platform` | ✅ |
| 模型协议 | `src/types/model.ts` | `ModelSchema`、`FieldSchema`（15 种 `FieldType`）、`EnumOption`、`DataScope`、索引与权限声明 | ✅ |
| 应用协议 | `src/types/app.ts` | `AppSchema`、`AppMenuItem`（page/portal/builtin/url 四类）、`AppTheme` | ✅ |
| 校验器 | `src/validate/index.ts` | `validatePage` / `validateMaterial` / `validateModel` / `mergeResults` / `collectFieldNames`；**19 种错误码 + 7 种警告码**，错误带 `path` 可定位到节点 | ✅ |
| 迁移框架 | `src/migrate/index.ts` | `MigrationRegistry`（注册约束/顺序校验/重复拦截）、`migrate()`（多级链、入参不可变、应用记录）、`createEmptyPage()` 工厂、`MigrationError` 带错误码 | ✅ |

**校验器错误码清单（已实现）**

- 阻断级：`E_SCHEMA_VERSION` `E_REQUIRED` `E_DUPLICATE_ID` `E_UNKNOWN_MATERIAL` `E_EXPR_SYNTAX` `E_ACTION_INVALID` `E_DS_MISSING` `E_DS_URL` `E_DS_METHOD` `E_DS_MODEL` `E_DS_TRIGGER` `E_SUBMIT_DS_MISSING` `E_PAGE_TYPE` `E_PERM_FORMAT` `E_MATERIAL_NAME` `E_CODE_FORMAT` `E_FIELD_ENUM` `E_FIELD_RELATION` `E_RULE_PATTERN` `E_INDEX_FIELD`
- 警告级：`W_SCHEMA_OUTDATED` `W_PAGE_NAME` `W_FIELD_UNKNOWN` `W_STYLE_KEY` `W_LOOP_NO_TEMPLATE` `W_DS_NAME` `W_DS_FORMULA` `W_MATERIAL_TITLE` `W_MATERIAL_VERSION` `W_MATERIAL_FIELD` `W_FIELD_NAME` `W_MODEL_NO_ID` `W_MODEL_NO_ID`

**设计决策（与方案一致）**：校验器为**手写零依赖**实现（未引入 ajv），原因：① 面向低代码场景的定制化错误信息（如"引用了未注册的物料「X」（发布将被拒绝）"）；② 业务规则校验（物料存在性、提交数据源存在性）本就需要自定义逻辑，ajv 仍要写自定义 keyword；③ 减少依赖面。

### 3. `packages/expression` —— 受限表达式引擎（零 eval / 零 new Function）

| 模块 | 文件 | 已实现内容 | 状态 |
|---|---|---|---|
| 词法 | `src/tokenizer.ts` | 数字（整数/小数/科学计数）、字符串（单双引号 + `\n \t \r \\ \' \" \uXXXX` 转义）、标识符、关键字、标点、运算符**最长匹配**；错误带列号 | ✅ |
| AST | `src/ast.ts` | 11 种节点类型；`astToString` 输出可读字符串，**二元运算中的一元/箭头/三元操作数自动补括号**（避免优先级歧义） | ✅ |
| 语法 | `src/parser.ts` | 递归下降，优先级链 `ternary → ?? → \|\| → && → == → 比较 → 加减 → 乘除 → 一元 → 成员/调用 → primary`；成员/下标/可选链 `?.`/可选调用；数组与对象字面量（含尾逗号）；**箭头函数（单参无括号 / 多参 / 括号回溯判别）** | ✅ |
| 求值 | `src/evaluator.ts` | 全节点求值；`extractRefs` 依赖提取（箭头参数遮蔽、成员只取根、内置名排除）；`markTrusted`/`isTrusted` 受信对象机制 | ✅ |
| 内置函数 | `src/builtin.ts` | **37 个内置函数**（字符串 11 / 数值 6 / 日期 4 / 聚合 5 / 格式化 2 / 结构 4 / 逻辑 5）+ **4 张方法白名单**（数组 18、字符串 20、数值 2、对象 1）+ `FORBIDDEN_KEYS` 19 项 | ✅ |
| 对外 API | `src/index.ts` | `evalExpr`（带 AST 缓存）、`checkExpr`（只查语法不求值）、`refs`（依赖提取）、`safeEval`（永不抛错）、`parseCached`/`clearCache`/`cacheSize` | ✅ |

**已验证的安全护栏**

| 攻击面 | 防护 | 测试 |
|---|---|---|
| 原型链逃逸 | `constructor/__proto__/prototype/__defineGetter__/toString/valueOf/call/apply/bind` 等 19 项直接拦截 | ✅ security.test.ts 45 个安全用例 |
| 全局对象访问 | `globalThis/window/process/require/eval/Function/import` 拦截 | ✅ |
| 计算成员绕过 | `a["__proto__"]` 同样拦截 | ✅ |
| 任意函数调用 | 标识符调用仅限内置白名单 + 运行时作用域注入函数 | ✅ |
| 对象方法调用 | 按 `this` 类型匹配方法白名单；非白名单方法（如 `hasOwnProperty`）拒绝 | ✅ |
| 受信对象 | `markTrusted(app)` 后才允许调用 `app.toast()` 等；**受信对象仍禁用 21 个禁用属性** | ✅ |
| 未定义标识符 | 返回 `undefined` 并回调 `onUnknownVar`（业务友好，不白屏） | ✅ |

**刻意的语义决策（相对 JS 的偏离，需团队知晓）**

1. **`+` 数值优先**：`"1" + "2" === 3`（非 `"12"`）；只有不可数字化时才拼接字符串。原因：表单 `input` 常返回字符串，金额计算若走 JS 拼接语义会产生静默错误。
2. **宽松 `==` 做类型归一**：`"1" == 1` 为 `true`；`null == undefined` 为 `true`。
3. **比较运算**：两侧可数字化则按数值比较，否则按字符串比较（`"100" > "20"` 为 `true`）。
4. **链式取值容错**：`formData.a.b.c` 中间层为空返回 `undefined` 而非抛 `TypeError`（回调 `onMemberError` 供埋点）。
5. **除零**：`1/0` 返回 `Infinity`，`1%0` 返回 `NaN`，不抛错。
6. **不支持赋值**：`a = 1` / `a++` 属语法错误（词法层无 `=` 单运算符）。**表单赋值请用 Action `type:'setForm'`** —— 与方案 3.5 存在偏差，见下文「与方案的偏差」。

**性能**：AST 缓存默认 500 条（LRU 式，超限淘汰最早插入），同一表达式仅解析一次。

### 4. `packages/renderer` —— 渲染引擎（第 2 批实现；第 3 批补生命周期 `app` API）

**分层**：`src/core` 纯逻辑层（不依赖 uni-app / Vue，副作用全走 `RuntimeHost` 注入，可 100% 单测）+ `src/uni` 组件层（骨架，未验证）。

| 模块 | 文件 | 已实现内容 | 状态 |
|---|---|---|---|
| 路径工具 | `src/core/path.ts` | `splitPath`（`a.b[0].c`）、`getByPath`（链式空值返回 undefined）、`setByPath`（自动建中间层，数字段建数组）、`rootOf` | ✅ |
| 数据上下文 | `src/core/context.ts` | `createPageContext`（formData/appData/globalData/user/urlParams/ds + 顶层键为 own 属性以供表达式引用）、`get/set/patch/reset`、`onFieldChange` 订阅（单订阅者抛错不影响他人）、`withLocals` 派生 loop 局部作用域 | ✅ |
| 渲染树归一化 | `src/core/build.ts` | `buildTree` / `buildTreeWithReport`：深拷贝 props 不污染 Schema、脏节点跳过并记录（缺 id / 缺 componentName）、根节点非法抛错 | ✅ |
| 联动 | `src/core/linkage.ts` | `Linkage.collect`（condition / loop / `$expr:` props / action / lifecycle 五类依赖，`refs()` 提取根变量）、`dirtyNodes`、`rootsOf`、`snapshot`；`extractExpr` / `resolveProps`（求值抛错置 undefined + 回调，不中断渲染） | ✅ |
| 运行期解析 | `src/core/resolve.ts` | `resolveTree`：loop 展开（注入 item/index，超限截断 + 回调，默认 500）、condition 求值（**抛错默认可见 + exprError 标记，绝不白屏**）、父子可见性传播（父不可见不解算子树）、perm 权限判定、props 表达式求值、校验错误按 nodeId 挂载；`flatten` / `findFirstErrorNode` | ✅ |
| 校验引擎 | `src/core/validator.ts` | `collectRules`（同字段多节点合并）、`checkRule`（required / pattern / range / maxLength / expression / **async** 六种）、`validateField`、`validateAll`（async 规则经注入的 `asyncValidator` 执行，返回 `firstError` 供滚动定位）、`toErrorMap` | ✅ |
| 数据源引擎 | `src/core/datasource.ts` | `DataSourceRunner`：static / http / model / formula 四类；`$expr:` 参数递归解析（对象与数组）、TTL 缓存、并发去重（inflight 复用 Promise）、`resultPath` + `transform`、`trigger=init` 与 `watch:字段` 触发（前缀匹配）、**任何失败只置 error 状态返回 null 不上抛**；`resolveParams` | ✅ |
| 动作执行器 | `src/core/action.ts` | `runAction` 覆盖 Action 全 15 种类型、`runActions`（按 event 过滤、顺序执行、失败中断 / `continueOnError`）、confirm 嵌套 onOk、宿主能力缺失降级提示、`{{field}}` 简易模板 | ✅ |
| 生命周期 | `src/core/lifecycle.ts` | `runHook` / `runHooks`（onInit / onMount / onSubmit；**支持单表达式或 `string[]` 顺序多步**，单步失败不阻断后续；报告含 `step` 序号）；**`createAppApi` + `createLifecycleScope`（D-7 选型 C 落地）**：注入受信任 `app` —— `setFormData(obj\|k,v)` / `getFormData` / `setAppData(obj\|k,v)` / `loadDs` / `toast` / `navigate` / `back` / `confirm`，`markTrusted` 后仍受 `FORBIDDEN_KEYS` 拦截；`normalizeHook` 归一化 | ✅ |
| 页面控制器 | `src/core/controller.ts` | `PageController` 统一入口：构造即 buildTree + 依赖收集 + 规则收集 + onInit；`resolve()` 全量解析；`setField/patchFields/reset`（写入 → 联动 → 单字段校验）；`validateOne/validate/lastValidation`；`onMount()`（钩子 + init 数据源 + watch 订阅，幂等）；`submit()` 按方案 7.2 五步（校验 → onSubmit → 只提交 Schema 声明字段 → 提交数据源 → 成功提示与 successAction）；`handleEvent/runSingleAction`；`dispose()`；**三个钩子均走 `lifecycleScope`（含 `app`），渲染期走 `ctx.scope`（无 `app`）** | ✅ |
| 对外导出 | `src/index.ts` | 全量导出 core 层；文件头注明 uni 层未验证状态 | ✅ |

**uni-app 组件层（⚠️ 骨架已给出，未经任何真机验证）**

| 文件 | 内容 | 状态 |
|---|---|---|
| `src/uni/material-map.ts` | `MATERIAL_MAP` 静态映射 + `assertMaterials` 校验（当前映射为空，待物料库） | 🟡 未验证 |
| `src/uni/lc-node.vue` | 递归节点渲染，**v-if 链静态分发**（规避小程序不支持 `<component :is>`），未注册物料降级占位不白屏 | 🟡 未验证 |
| `src/uni/lc-renderer.vue` | 持有 `PageController`，onMounted → refresh → onMount → refresh，onUnmounted → dispose | 🟡 未验证 |

**测试覆盖**：9 文件 / 1892 行 / 145 用例，覆盖 path、context、build、linkage（含数组钩子回归 B-14）、resolve（condition / loop / 权限 / flatten）、validator（6 规则 + async）、datasource（4 类型 + 缓存 + watch + 去重）、action（16 类型 + 事件链）、**lifecycle（`app` API / 受信安全边界 / 多步执行 / 渲染期无 `app` 负向用例）**、controller（构造 / 校验 / 生命周期 / 事件 / 提交全链路）。

---

### 5. `apps/server` —— 服务端骨架（第 3 批第 2 项）

NestJS 11 + ESM（NodeNext），落点 `lowcode/apps/server/`，实现方案 **8.3 的 5 个接口**与 **8.4 双表模型**。

**工程接入**

| 项 | 内容 | 状态 |
|---|---|---|
| 包与脚本 | `@lc/server`（`build/start/test/typecheck`）；根 `package.json` 脚本由 `--filter "./packages/*"` 改为 `pnpm -r`（packages + apps 统一递归） | ✅ |
| 依赖 | `@nestjs/{common,core,platform-express}` + `jsonwebtoken` + `reflect-metadata` + `rxjs`；业务依赖 `@lc/schema` + `@lc/expression`（`workspace:*`，**校验与设计器同源**） | ✅ |
| TS 策略 | `module/moduleResolution: NodeNext`（ESM，与工作区其余包一致）+ `experimentalDecorators`；**不启用 `emitDecoratorMetadata`**（esbuild 测不出该元数据）→ 全部构造注入显式 `@Inject`，**构建态与测试态行为一致** | ✅ |

**接口（前缀 `/api/v1`；除登录外全部 Bearer 令牌保护，`@UseGuards(AuthGuard)` 按控制器挂载）**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 登录：scrypt 口令散列 + HS256 JWT（8h）；「用户不存在」与「口令错误」同错误码 `INVALID_CREDENTIALS`（防用户名枚举） |
| GET | `/auth/me` | 当前登录态自检 |
| POST | `/pages/validate` | Schema 静态校验（`validatePage` + `checkExpr`，设计器保存前调用） |
| GET | `/pages/:id/schema` | `?version=draft`（默认）/ `published` / `vN`；404 / 409 / 400 错误码细分（`PAGE_NOT_FOUND` / `NOT_PUBLISHED` / `VERSION_NOT_FOUND` / `INVALID_VERSION`） |
| PUT | `/pages/:id/schema` | 保存草稿：服务端二次校验，失败 `400 SCHEMA_INVALID` 带完整 `errors`；页面不存在自动建档 |
| POST | `/pages/:id/publish` | 发布固化版本（8.4「发布即插入一条」），`status → published` |
| POST | `/pages/:id/rollback` | 回滚 = 历史版本**复制为新草稿**（`currentVersion` 不回退，需再发布生效），`status → draft` |

**存储（D-9 偏差）**：`PageRepository` 接口 + `FilePageRepository`（`<DATA_DIR>/pages/<id>.json`，tmp + rename 原子写入；id 白名单正则防路径穿越，与 service 层双重校验）。文件即 8.4 双表合并视图（`pages` 行 + `versions[]`）。**Phase 1 换 Prisma + PostgreSQL 时只换仓储实现，接口不变。**

**安全实现**：口令 `scrypt` + `timingSafeEqual`（零第三方依赖）；JWT 固定 `algorithms: ['HS256']` 防算法混淆；密钥 `LC_JWT_SECRET` 环境变量注入；种子账号（admin/admin123、designer/designer123）**内存存储**，仅限开发。

**测试**：2 文件 / 382 行 / **38 用例** —— 集成 34（登录鉴权 9 + 草稿存取 6 + 版本回滚 15 + 静态校验 4，真实启动 Nest 应用、临时目录落盘）+ 单元 4（scrypt）。**真实启动冒烟**（`node dist/main.js` → 登录 → PUT 草稿 → 发布 v1）通过，此步骤抓出 B-15。

---

### 6. `packages/runtime` —— uni-app 运行时壳（第 3 批第 4 项）

uni-app 官方 **CLI（Vite）工程**（**D-10 偏差**：环境无 HBuilderX），落点 `lowcode/packages/runtime/`，对齐方案 9.1 目录树的运行时壳位置。**不定义 `build/test/typecheck` 脚本**（uni 构建重且依赖网络，防被根 `pnpm -r` 全量链逮住）。

**工程接入**

| 项 | 内容 | 状态 |
|---|---|---|
| 版本锁定 | vite **5.2.8** + vue **3.4.21** + `@dcloudio/*` **3.0.0-alpha-5030120260930001** + types ^3.4.32（uni 官方 CLI 模板要求 vite@5，与新版本冲突） | ✅ |
| 依赖镜像 | npmjs.org 不可达 → workspace 根 `.npmrc` 切 **npmmirror**（**D-11**）；`pnpm-workspace.yaml` allowBuilds 放行 `core-js` | ✅ pnpm install 435 包成功 |
| easycom | 三条规则（**D-12**，对方案 4.2 的最小扩展）：`^lc-renderer$` / `^lc-node$` 精确指向 `@lc/renderer/uni/*.vue` + 原 `^lc-(.*)$` 物料规则 | ✅ |
| renderer exports | `@lc/renderer` 扩 3 个子路径导出 `./uni/{lc-renderer,lc-node,material-map}.vue|ts` | ✅ |
| RuntimeHost | `src/host.ts` 实现必填 5 项（toast/confirm/navigate/back/request）+ 可选项，全部走 uni.* API | ✅ |

**结构**：`src/pages/index/index.vue`（渲染入口）+ `src/demo/static-page.ts`（手写 PageSchema，`validatePage` → `valid: true`）+ `src/materials/{text,input,button}/index.vue`（3 物料，接口对齐 lc-node 消费契约）+ `src/pages.json`（easycom）+ `manifest.json`。

**实测结果（H5 浏览器 DOM 断言，全部 ✅）**

| 判据 | 结果 |
|---|---|
| 手写 JSON 渲染 3 个静态组件 | ✅ Text ×2 / Input（label + value）/ Button 全部渲染，Page 容器无「未知组件」占位 |
| 表达式求值 | ✅ 文案显示「你好，世界！count+1 = **42**」（`$expr:` + 算术） |
| 输入 → 联动 | ✅ 输入后文案实时变为「你好，**世界张三丰**！」（物料 emit → setField → change 冒泡 → refresh → 重算） |
| 按钮 → 动作 | ✅ 点击后 `.uni-toast` 出现「表达式与动作链路通了！」（handleEvent → toast 动作 → RuntimeHost → uni.showToast） |
| `build:h5` / `build:mp-weixin` | ✅ 均 `DONE Build complete`；mp 产物 `lc-node.wxml` 抽查：`wx:if/wx:elif/wx:else` 分发链 + `bindupdate`/`bindclick`/`bindchange` + 递归 `wx:for` 全部就位 |
| 全量回归 | ✅ typecheck / build / test **356 passed**（runtime 无三脚本不受影响） |

**已知限制**：① 微信开发者工具未安装 → **mp 端只验到构建产物，真机/开发者工具待验**（L-5 部分完成）；② uni 插件强制 `preserveSymlinks: true` → 修改 `packages/renderer` 源码后 dev server **不热更，需重启 `pnpm dev:h5`**（已注释于 `vite.config.ts`）；③ 浏览器截图需桌面窗口可见，本次以 DOM 断言留档。

---

### 7. 覆盖率与 CI（第 3 批第 5 项）

**覆盖率接入**（方案 9.2 硬指标「schema / expression ≥ 90%」）

| 项 | 内容 | 状态 |
|---|---|---|
| 依赖 | 根 devDeps 加 `@vitest/coverage-v8@2.1.9`（与 vitest 2.1.9 严格同版本） | ✅ |
| 聚合 | `config/vitest.projects.ts`（4 测试项目）+ 根 `pnpm coverage`（`--workspace` 显式指定）；日常 `pnpm test` 仍是 `pnpm -r test` 不受影响 | ✅ |
| 统计范围 | `vitest.config.ts` 只含 `packages/*/src` + `apps/server/src`，排除 dist/构建产物/测试文件/`main.ts`（bootstrap 由真实启动冒烟覆盖）/runtime 工程（实机验证代替）；**`renderer/src/uni/*.vue` 自第 7 项起纳入**（组件测试已能执行它们） | ✅ |
| 阈值强制 | `thresholds: { statements/lines/functions ≥ 90, branches ≥ 85 }`（实测 95.53/95.53/97.06/88.3 向下设防退化线） | ✅ |

**实测数字**（`coverage-final.json` 分组求和，非目测；2026-10-09 最新，含组件测试纳入 uni 层后的口径）：

| 包 | stmts | branches | funcs |
|---|---|---|---|
| **packages/schema** | **96.05%**（462/481）✅ | 87.22% | 92.86% |
| **packages/expression** | **93.84%**（1005/1071）✅ | 84.24% | 96.04% |
| packages/renderer | 97.09%（1169/1204，含 `src/uni` 的 .vue + material-map） | 93.85% | 98.11% |
| apps/server | 94.82%（421/444） | 84.43% | 100% |
| **总计** | **95.53%** | **88.3%** | **97.06%** |

**为达标补齐的测试**：`validate-negative.test.ts` 10 用例（Action 缺字段矩阵 / 数据源负向 / 节点负向 / 入参防御 / `MigrationRegistry.size`，schema 87.94% → 96.05%）+ `exports.test.ts` 2 用例（barrel 29 导出运行时完整性，防 re-export 断链）。**过程中查明 `W_SCHEMA_OUTDATED` 分支当前不可达**（`VERSION_HISTORY` 仅含 `1.0.0`，待协议升版补测，已在用例注释声明）。

**CI**：`.github/workflows/ci.yml` —— install → typecheck → build → test → coverage（阈值强制）→ **服务端真实启动冒烟**（B-15 教训固化）→ 体积阈值告警（`renderer/dist > 1MB` 时 `::warning`，方案 9.2「体积告警」的最小实现）。**未引入 Turborepo（D-4）**：用 `pnpm -r` 递归替代 `turbo build`。⚠️ **workflow 未推送远端、未在真实 Actions 执行过**（本机非 git 仓库，D-13 / L-8）。

---

### 8. 组件层冒烟测试（收尾第 7 项）

**背景**：此前 vitest 只覆盖 core 纯逻辑，`lc-node.vue` / `lc-renderer.vue` 零测试 —— B-18（缺容器分支）、B-19（递归未绑 `@change`）都是 H5 实测才发现的（缺陷表教训原话：「组件层必须实机冒烟，vitest 只覆盖 core」）。本节把这两类缺陷**固化成单测回归**。

| 项 | 内容 | 状态 |
|---|---|---|
| 依赖 | `@vue/test-utils@^2.4.6` + `jsdom@^25` + `@vitejs/plugin-vue@^5.2.4`（配 vite 5；仅 `@lc/renderer` devDeps） | ✅ |
| 配置 | renderer 包级 `vitest.config.ts`：plugin-vue + `environmentMatchGlobs` —— **仅 `test/uni/**` 走 jsdom**，纯逻辑测试保持 node（不变不慢）；根聚合自动加载本配置 | ✅ |
| 用例 | `test/uni/lc-node.test.ts` **7 用例**（jsdom 挂载真实组件，物料用 stub 注入全局替代 easycom） | ✅ |
| 覆盖率 | `src/uni` 的 `.vue` **从排除改为纳入**（测了就统计，诚实口径）—— 总分支 86.71→88.3、renderer branches 89.74→93.85 | ✅ |

**7 用例清单**：

1. v-if 链分发：Text/Input/Button → 对应 stub，`$expr` props 已在 resolve 求值（`n=7`）
2. `visible=false` 节点不渲染
3. **B-18 回归**：Page/View/Group 识别为容器（无「未知组件」占位、children 正常渲染）
4. 未知物料兜底：`.lc-node__unknown` 显示「未知组件：Weird」且不吞兄弟节点
5. **B-19 回归（组件层）**：嵌套 Input `$emit('update')` → `pc.getField` 写入 + `change` 冒泡 1 次
6. **B-19 全链（renderer 层）**：输入 → setField → 冒泡 → `onTreeChange` → refresh → 联动文案「值：初值」→「值：改后」
7. 动作链：Button `$emit('click')` → `handleEvent` → `host.toast` 收到文案

**边界（诚实声明）**：物料本体（`packages/runtime/src/materials`）依赖 uni 内置组件，jsdom 无法渲染 —— 其分发正确性由本层 stub 兜住，**物料自身仍只在 H5/真机验证**（L-5）；`material-map.ts` 尚无用例（L-6 空映射，Phase 1 随物料库补测）。

---

### 9. ADR 架构决策记录（收尾第 8 项）

`docs/adr/` —— 6 篇 + README 索引（含模板）。与方案 2.4 的分工：**方案讲「为什么这么设计」，ADR 记「什么约束下选了哪条路、放弃了什么、带来什么后果」**；修订时升状态（提案 → 已接受 → 被取代）。

| # | 标题 | 关联台账 |
|---|---|---|
| 001 | 编译期静态物料注册 + 自研受限表达式引擎 | D-2（弃 json-logic；mp 禁 eval / 无 `component:is`） |
| 002 | 表达式禁止赋值，写能力走受信 `app` API | D-7/D-8（三方案取舍：A/B 弃、C 选） |
| 003 | 渲染引擎纯逻辑层 + 副作用注入（RuntimeHost） | B-15（测试态 ≠ 运行时的同款风险面） |
| 004 | 服务端 JSON 文件仓储（接口先行） | D-9（换库 = 换实现，接口零改动） |
| 005 | uni-app 官方 CLI 工程 + easycom 三规则 | D-10/D-11/D-12（含 preserveSymlinks 已知限制） |
| 006 | `pnpm -r` 替代 Turborepo + 覆盖率阈值门禁 | D-4/D-13/B-20（含 workspace 发现链教训） |

### 10. Phase 1 第 1 批：物料库归位与 12 物料（2026-10-09）

| 项 | 内容 | 状态 |
|---|---|---|
| `packages/materials` 归位 | 方案 9.1 目录树 `materials/` 落地为 `@lc/materials`；easycom 规则三改为 `^lc-(.*)$` → `@lc/materials/src/$1/index.vue`（node_modules 路径解析与 `@lc/renderer` 两条既有规则同机制）；runtime 加 `workspace:*` 依赖；包**不设** build/typecheck 脚本（同 runtime 处理，宿主 vite 直接消费 `.vue` 源码） | ✅ |
| 物料 12 个 | 迁移 3（text/input/button）+ 新写 8（textarea/number-input/radio/select/switch/upload/image/divider）+ Page（lc-node 容器分支）/ **FormGroup**（lc-node 内联分组头，children 走统一递归无重复渲染）；统一契约：表单 `emit('update', {name,value})`、按钮 `emit('click')`（方案 4.2 草稿的 `emit('change')` **不采用**，以运行时实测契约为准）；全 rpx；`uni.chooseImage/previewImage` 带 `typeof uni` 安全降级 | ✅ |
| lc-node 分发 | v-if 链扩至 **11 路物料** + FormGroup 分支；新增**矩阵用例**一次性断言：12 物料分发到位 / 分组头渲染 / 组内与容器 children 递归 / 无未知占位 | ✅ |
| H5 实测 | **20/20 静态断言**（banner / 分组头 / 双 Divider / 11 物料 class / 联动文案 / rpx border 生效 / 无「未知组件」）+ **6 项交互回归**：输入联动「你好，张三丰！count+1 = 42」（B-19 回归）、Switch 回合 `true→false→true`、Button→toast 文案出现、Textarea 计数 `0/100→6/100`、Radio 点击 checked 迁移（radio-group change→update→重渲染）、NumberInput `99.5` 保持；console 无 error；**全页截图** `docs/screenshots/phase1-materials-h5.png` | ✅ |
| coverage 口径 | `packages/materials/**` 加入排除并注释声明（**实测**：不排除时 11 个 `.vue` 无 jsdom 测试 → 总覆盖跌至 **73.49%** 触阈值报错；排除后恢复 **95.57**）；分发正确性由 renderer 组件测试矩阵兜底、物料行为由 H5 实测验证（与 L-5 同口径） | ✅ |

**测试**：组件测试 154 → **155**（矩阵用例）；全量 **376 passed**（schema 66 + expression 117 + renderer 155 + server 38）。

**本批明确未做**：`meta.json` × 12 + `src/index.ts` 注册表（流水线②③，设计器批 2 需要时一并做）、构建期裁剪（流水线④）、Upload 真实上传（待服务端文件上传接口）、mp 真机（L-5 尾巴）。

### 11. Web 设计器落地方案（2026-10-09，已放行 → 批 1 已完成见「12」）

- **产物**：`docs/designer-plan.md` —— 主方案第六章蓝图的可执行落地细化（**评审通过后开工**）。
- **核心决策 D-A1**（主方案 D6 未解决的矛盾：物料是 uni 标签，PC Vue 渲染不了）：三方案对比后定**同进程 + uni-shim** —— `view/text/picker/radio/radio-group/switch/image` 7 标签做 PC 版 shim（事件载荷与 uni 同构、物料零改动）+ rpx→px postcss（画布 375 宽 ×0.5）+ PC 侧手写 `material-map`（easycom 是 uni 编译期机制，L-6 的设计器形态）；`input/textarea/button` 是 HTML 内建标签天然可用；漂移风险由 Phase 2 的 H5 iframe 预览/扫码兜底；**否决** iframe 画布（跨文档 DnD 坑多）与每物料占位版（双实现随物料数线性膨胀）。
- **其余决策**：D-A2 designMode（`mode` 缺省 runtime 零回归；select 逐层冒泡套用 B-19 模式 + 回归用例）、D-A3 schema-ops 纯函数（输入输出新 schema，为 Phase 2 undo 预留接缝）、D-A4 meta 本地注册表（MVP 4 setter：input/number/switch/select）、D-A5 自研 HTML5 DnD（锚点纯函数化 + 上移/下移兜底）、D-A6 保存链路（复用已有 5 接口）、D-A7 Pinia 单 store。
- **批次**：批 1 画布能渲染 → 批 2 能拖入删除 → 批 3 能配置保存 → **批 4 页面↔模型字段绑定** ✅（2026-10-12）→ 批 5 出口判据闭环（依赖运行时壳 `pageId` 路由批，**可并行**）。
- **评审**：2026-10-09 放行开工；批 1 实测发现的 **B-22/B-23** 已回写 `designer-plan.md §4.1`（D-A1「7 标签组件 shim」修正为「3 组件 shim + 2 CSS 兜底 + 2 增强器」）。

### 12. Phase 1 · 设计器批 1：画布能渲染（2026-10-09）

**工程**：
- `packages/designer`（`@lc/designer`，无 build、源码直供 Vite）：
  - `src/shim/` —— **B-22 修正版**：`picker/radio/radio-group` 组件 shim（uni 契约 `{detail:{value}}` 同构）+ `basic.ts`（IMAGE_FIT 映射）+ **`enhance.ts` 直出标签增强器**（image：src→背景图 MutationObserver 同步；switch：事件委托切 `checked` attribute + 派发 uni 契约 change；**只加 attribute/派发事件不替换节点** → Vue patch 安全）+ `uni-api.ts`（chooseImage/previewImage PC polyfill）+ `shim.css`（view/text 语义兜底 + switch/image 直出视觉 + picker/radio 控件）
  - `src/material-map.ts` —— 11 物料静态 import + kebab 全局注册（L-6 的设计器手写形态）
  - `src/canvas/LcCanvas.vue` —— 375 手机壳 + 包装 `lc-renderer mode=design` + 挂增强器
  - `src/fixtures/demo-page.ts` —— 12 物料 demo schema（测试与 designer-web 单一来源）
- `apps/designer-web`（Vite + Vue3 + TS + Pinia + EP 引入）：三栏布局（物料占位/画布/属性占位）+ **rpx→px postcss 插件**（×0.5，端口 5174）+ mockHost

**renderer 扩展（D-A2）**：
- `lc-renderer` 加 `mode?: 'runtime'|'design'`（**缺省 runtime，157 用例零回归**）+ `design.ts` **provide/inject 设计状态**（免递归 prop 透传）+ `select` 事件向上转发；
- `lc-node` design 态渲染选中遮罩（`data-node-id` + hover/选中态，`--selected` 时 `pointer-events:none` 支持二次点击进入操作）+ `onTap` 动作拦截 guard + 递归处 `@select` 逐层冒泡（**B-19 模式回归用例锁死**）。

**实测修正（已回写 designer-plan §4.1 与本表缺陷）**：
- **B-22**：`view/text/image/switch` 恰是 **SVG 标签**，Vue 按保留元素**直出**（警告 "Do not use built-in…"），组件 shim 无效 → 改 CSS 兜底 + 增强器；`picker/radio/radio-group` 组件 shim 成立 ✓
- **B-23**：`checked/disabled` 不在 Vue boolean-attr 名单，未知元素 `:checked="false"` 落成 `setAttribute('checked','false')`（**字符串，attribute 仍存在**）→ `hasAttribute` 误判（switch 被误判禁用/开态）→ isOn/isDisabled 排除 `"false"` + CSS `:not([checked='false'])`
- **事件双端兼容**：原生 `<input>/<textarea>` 无 `e.detail` → `input/textarea/number-input` 3 物料 `onInput` 加 `e.target.value` 回退（uni 端行为不变）

**验证**：
- 组件测试：renderer **155→157**（designMode 选中冒泡 + 动作拦截/零回归 2 用例）；designer **12 用例**（R2/B-22 解析断言 + 增强器 image/switch + 4 项事件契约 + 注册链 + 画布集成 3 用例：12 物料矩阵/14 遮罩选中/`$expr` 受控联动）
- **浏览器实测**（:5174）：12 物料全渲染（class 计数逐一断言）、**rpx 0 残留**（`padding:8px 12px` 换算正确）、`view{display:block}` 生效、0 未知组件、switch 点击切换+受控回写、picker 下拉 2 选项、radio 受控迁移、image 背景增强、嵌套节点 `n-in-fg` 选中 + 右面板联动、**console 0 error**；截图 `docs/screenshots/designer-batch1.png`
- 全量门禁：typecheck 6 包 ✅ / test **390 passed** / coverage **95.57/87.76/96.35/95.57** exit 0

**本批明确未做**：拖拽 DnD 与 schema-ops（批 2）、属性面板 setter 与保存链路（批 3）、大纲树与框选（Phase 2）、designer funcs 覆盖 50%（enhance 回调与面板占位组件，批 2 面板落地时自然补齐）、demo 图 `/x.png` 404（视觉空白，批 2 换 data URI 或真图）。

---

### 13. Phase 1 · 设计器批 2：能拖入删除（2026-10-09）

**core 层（`packages/designer/src/core/`，纯函数 + 全单测）**：
- `schema-ops.ts` —— `generateNodeId / findNode / findParent / ancestorIds / insertNode(schema, material, {parentId?, index?}) / removeNode / moveNode（含祖先环路与目标父校验）/ moveSibling / updateProp（深合并 style + value 深拷贝）/ updateActions`；
- `anchor.ts` —— `computeAnchor` 三态（`before / after / into`，容器分带 + 叶子中线分割）+ `resolveAnchorTarget`；
- `dnd.ts` —— `LC_MATERIAL_MIME` 与 drop 分发类型（node MIME 分支保留兼容）。

**meta 注册表（`packages/materials/src/meta/`，D-A8）**：
- 4 分组文件（basic/layout/form/feedback）+ `index.ts` barrel → `META_LIST` **13 项**（Page + FormGroup + 11 物料），面板过滤 Page 展示 **12 项**、按 `category` 分 4 组；`satisfies MaterialSchema` 编译期校验；materials 加 `@lc/schema` 依赖。

**store + 面板（进 `packages/designer`，D-A8）**：
- `src/store/store.ts` —— Pinia setup store：`insertMaterial / moveByDrop / removeById / moveById / setProp / replaceSchema / select` + `selectedMeta / isRootSelected` 派生，**全部经 schema-ops**（视图只发意图）；
- `src/panel/MaterialPanel.vue` —— 分组列表 + `draggable` dragstart 写 MIME，`role=button/tabindex` 键盘可达；
- `src/panel/PropsPanel.vue` —— 选中信息 + 上移/下移/删除（root 三钮禁用）+ `settings` 三列只读列表（setter 批 3）。

**画布拖放（`src/canvas/LcCanvas.vue`）**：
- HTML5 DnD（物料拖入）：dragover `collectRects` → `computeAnchor` → **fixed 指示线**（before/after 横线、into 虚线框）→ drop 分发；
- **自研 mouse 手势（B-25）**：mousedown 起拖 → 4px 阈值武装（武装后 click 被 capture 吞防误选）→ mousemove 锚点 → mouseup 落 `moveByDrop`；与 DnD 共用 anchor/hint；
- `App.vue` 接线（designer-web 薄壳）：onDrop 分发 store + Delete/Backspace 键删（输入态排除）+ `:selected-id` 受控回传。

**renderer 扩展与修复**：
- `lc-node` 遮罩补 `role/aria`（`draggable` 经 B-25 实测后移除）；
- **B-24 修复**：`lc-renderer` 的 controller 改 `shallowRef` + `watch(schema)` 重建（dispose 旧树/重建/重跑 onMount）+ **`selectedId` 受控 prop**（store → 遮罩选中样式闭环）。

**实测修正（缺陷表 + designer-plan 已回写）**：
- **B-24**：一次性构造 controller → schema 整树替换画布零更新（浏览器实测：store 13 子、DOM 停 14 遮罩）→ watch 重建 + 3 回归用例；
- **B-25**：SVG 遮罩 HTML5 DnD 会话不建立（dragstart fire 但 dragover/drop 全缺）→ 节点换位自研 mouse 手势；
- **B-26**：VTU `attachTo` 需 Vue 3.5 `app.onUnmount`（本仓 3.4 崩）+ detached 挂载切断 window 冒泡（probe 证实 `PROBE_SEEN: []`）→ 测试手动 `appendChild` + `afterEach` 清理。

**验证**：
- 单测：designer **81 用例**（schema-ops 22 + anchor 14 + store 13 + panel 5 + dnd 11 + shim 9 + 批 1 回归 3≈）；renderer **160 用例**（含 B-24 回归 3 + designMode 系列）；
- 全量门禁：typecheck 6 包 ✅ / test **462 passed** / coverage **95.96/87.83/96.25/95.96** exit 0；
- **浏览器实测**（:5174）：面板 12 项 4 分组；**拖入**（defaultProps 生效 + 画布重渲染 + 自动选中 + settings 6 行）；**拖入容器**（into n-fg）；**换位**（CDP drag 走 mouse 序列：n-text into n-fg；合成手势 before：n-btn→n-sel 前）；上移/下移/删除按钮、root 三钮禁用、Delete 键删 `n-div`；属性面板 settings（Input 6 / Button 3 行）；**指示线真实视口坐标**（`top:397/left:244/width:351`）；全程 **console 0 error**；**验收截图待补**（桌面窗口不可见，环境限制）。

**本批明确未做**：属性面板 setter 真渲染与保存/加载/发布（批 3）、大纲树/框选/undo（Phase 2）、拖拽画布自动滚动（Phase 2）、`material-map` 用例（L-6 未收）、demo 图 `/x.png` 404（批 1 尾巴仍存）、批 2 验收截图补拍（窗口可见时）。

---

### 14. Phase 1 · 设计器批 3：能配置保存（2026-10-10）

**属性面板 setter 真渲染（`packages/designer/src/panel/PropsPanel.vue` 重写）**：
- 按 `SettingDesc.setter` 分发 **4 种原生控件**（**D-A9-1**）：`input`（@input 实时写，store 值与 DOM 同步一致故 patch 为 no-op、不打断中文输入法）、`number`（change 写数字，清空 → `undefined`）、`switch`（checked → boolean）、`select`（按 `options` 反查原值保类型）；
- 其余 9 种 setter（textarea/color/optionList/expression…）渲染**只读占位** `xx · Phase 2 支持`（不静默丢配置，D-A4 延续）；label 隐式包裹控件（点击文字聚焦）；
- 读写对称：`core/schema-ops.ts` 新增 **`readNodeValue(node, key)`**（无前缀/`props.*` → props、`style.*` → style、`event` → actions，路径缺失返回 undefined 不抛错）；写路径统一 `store.setProp` → schema 引用替换 → B-24 watch 重建 → **画布立即刷新**。

**保存/加载/发布（store 批 3 + designer-web `api.ts`）**：
- store 新状态：`pageId`（默认 demo）/ `saveState`（idle|dirty|saving|loading|error）/ `statusText` / `validation`；**`touch()` 即时校验**（任何 schema 修改同步 `validatePage` → 底栏常显错误数，D-A9-3）；`replaceSchema` 也走 touch（打开/新建随后覆盖状态）；
- **`DesignerApi` 接口注入**（`getSchema/saveSchema/publish`，D-A9-2）：store 不碰网络；designer-web `src/api.ts` 实现（首次请求自动 `POST /auth/login` admin/admin123 → token 落 sessionStorage → 全请求 Bearer + 服务端 message 透传）；vite 加 `/api → http://localhost:3000` 代理；
- 动作语义：`openPage`（GET → replaceSchema → idle；失败 `error` + 提示、本地内容保留）、`save`（**校验门禁：本地错误不发 PUT**，通过则 PUT，server upsert 自动建档 = 新 pageId 直接保存即创建 D-A9-6）、`publish`（草稿非 idle **自动先 save** 同受门禁，再 POST；发布失败不改草稿状态）、`newPage`（换 pageId + demo 初始结构 + dirty）；
- App 接线：顶栏 pageId 输入（回车打开）+ 打开/新建/保存/发布 + **保存状态徽标**（未保存/保存中/加载中/有错误/已保存）；底栏 `⚠ N 项校验错误`（前 3 条消息 + path title）/ `✓ 校验通过` + statusText；挂载注入 api 并自动打开。

**实测修正（缺陷表已回写）**：
- **B-27**：demo fixture `schemaVersion: '1.0'` 不符 `validatePage` 三段 semver 正则（`^\d+\.\d+\.\d+$`，server/runtime 本就是 `'1.0.0'`）→ 批 3 首跑校验即 `E_SCHEMA_VERSION`（此前 fixture 从未过校验）→ 改 `'1.0.0'`，并以「初始化断言 `validation.valid`」固化防回归。

**验证**：
- 单测：designer **101 用例**（+20：schema-ops `readNodeValue` 3、store 批 3 状态机/门禁/幂等 12、panel setter 渲染与交互 5）；
- 全量门禁：typecheck 6 包 ✅ / test **482 passed** / coverage **96.06/87.75/96.43/96.06** exit 0；
- **浏览器实测**（designer-web :5174 + server :3000 真实链路）：保存建档 → reload **回读一致**（`已打开 demo（draft）`、12 节点/首子 n-text 不变、徽标已保存）；改 `label` 属性面板/画布/受控回显**三处立即同步** + dirty；改 `disabled` 画布对应控件禁用**生效**；**重复保存幂等**（连续两次均 idle/已保存）；发布 `已发布 demo v1`；造重复 id → 底栏「⚠ 1 项校验错误：节点 id 重复：n-text」+ 保存被**本地阻断**（error/有错误，未发 PUT）+ 打开即恢复服务端版；打开不存在页 → error 提示、保存即建档；**console 0 JS error**（仅 1 条测试主动制造的 404 网络记录）；**验收截图仍待补**（OS 桌面窗口不可见，同批 2 环境限制）。

**本批明确未做**：其余 9 种 setter 真渲染（textarea/color/optionList/expression 等，Phase 2）、settings `condition` 条件显示表达式求值（Phase 2）、`errors[].path` 画布标红定位（MVP 仅底栏列表，D-A6 原文提及）、页面列表浏览接口（等 server `GET /pages`，D-A6 注明后置）、发布回滚 UI（server 接口已有）、顶栏 EP 对话框化（当前原生按钮够用）；**遗留观察**：首屏（页面不存在 404 首建前）曾读到一次「statusText=打开失败但徽标=未保存」，后续 ghost 页 404 复现均为正确 `error` 态，未能复现，暂记录不立缺陷。

---

### 15. Phase 1 · 服务端动态 CRUD（2026-10-10）

**目标**：方案 8.3「业务数据提交接口」与 12.5「服务端动态 CRUD」的 Phase 1 落地（**方案 B JSON 存储**，D-9 延续）。落点 `apps/server/src/{model,file,common/storage.module.ts}`。

**新增接口（9 个，前缀 `/api/v1`，除文件读取外全部 Bearer 鉴权）**

| 方法 | 路径 | 关键语义 |
|---|---|---|
| GET | `/models` | 摘要列表 `[{id,name,code,type,fieldCount,updatedAt}]`，按 `updatedAt` 倒序 |
| GET | `/models/:id` | 完整定义 + 审计字段；不存在 `404 MODEL_NOT_FOUND` |
| PUT | `/models/:id` | **upsert 建档**（不存在即创建），服务端再校验一次，响应带 `validation.valid/warnings` |
| POST | `/models/:modelId/records` | 新增；`@HttpCode(200)` 固化契约（**B-16**） |
| GET | `/models/:modelId/records` | `?filter=&sort=&page=&size=`（见下「查询」） |
| PUT | `/models/:modelId/records/:rid` | **部分更新**：合并后对整体再校验（必填不能被清空） |
| DELETE | `/models/:modelId/records/:rid` | **软删**：只置 `deletedAt`，列表排除、再读再改再删均 404 |
| POST | `/files/upload` | multipart 字段名 `file`，10MB 上限，**`defParamCharset:'utf8'` 修中文名乱码** |
| GET | `/files/:fileId` | **公开读取**（无鉴权）`StreamableFile`；`<image src>` 无法带 Authorization 头 |

**「不信任前端」三步写入链（方案 12.5）**

1. **sanitize** —— 只保留模型声明且非 `readonly` 的字段；未知键丢弃；`auto:'now'|true` 且为空时补当前时间；**系统字段（`id/createdAt/updatedAt/createdBy/updatedBy/deletedAt`）不可被 payload 覆盖**；
2. **类型校验** —— 按 `FieldSchema.type` 逐字段检查（number/money 有限数、date `YYYY-MM-DD`、enum 命中 options、file 字符串数组、string 系长度上限…）；
3. **规则校验** —— `checkRule`（**@lc/renderer 纯逻辑层，与前端同一实现**）跑 required/pattern/range/maxLength/expression；模型定义侧走 `validateModel`（@lc/schema）+ `checkExpr` 保存前语法检查 + 服务端补充的三段 semver、字段 key 白名单、`FieldType` 15 种运行时白名单、系统保留名拦截。

> **同源校验是本批的核心约束**：server 增加依赖 `@lc/renderer`，绝不重写第二套校验逻辑 —— 否则「前端过、服务端拦」或反之的语义漂移无法收敛（B-15/B-17 教训延伸）。

**查询（方案 B：全量读出 → 内存过滤/排序/分页；接口形状不变，Phase 2 升方案 A 换 SQL）**

- `filter`：URL 编码 JSON 对象，**等值 + 严格类型**（`20` 命中、`"20"` 不命中；`null` 匹配 null/缺省），多键 AND，键须在「声明字段 ∪ 系统字段」内，值只允许标量/`null`；
- `sort`：`field:asc|desc`（缺省方向 asc），**不传默认 `createdAt:desc`**，空值恒排末尾；
- `page` 正整数默认 1、`size` 默认 20 **上限 100**（越界 `400 INVALID_QUERY`）。

**存储与模块**

| 项 | 内容 |
|---|---|
| `StorageModule` | `DATA_DIR` 由 `PageModule` 私有 provider **提升为 `@Global()`**（页面/模型/记录/文件共用一根，默认 `<cwd>/data`，`LC_DATA_DIR` 覆盖） |
| 落盘 | `<DATA_DIR>/models/<id>.json`（定义）+ `<DATA_DIR>/data/<modelId>/<rid>.json`（记录，含 `deletedAt`）+ `<DATA_DIR>/files/<fileId>` + `<fileId>.meta.json`；tmp + rename 原子写入 |
| 白名单 | 模型 id `^[A-Za-z_][\w-]{0,63}$`、记录 id `^[A-Za-z0-9][\w-]{0,63}$`、字段 key `^[A-Za-z_][A-Za-z0-9_]*$` —— 三处防路径穿越（与页面 id 同规则，双重校验） |
| 依赖 | server `package.json` 增 `@lc/renderer`（`checkRule`/`isEmpty` 同源复用） |

**测试与实测**

- **server 测试 38 → 93**（+55）：`model.test.ts`（模型建档/回读/列表/重复 PUT 审计字段权威/非法 id/`E_CODE_FORMAT`/`E_DUPLICATE_ID`/`E_FIELD_KEY`/`E_FIELD_TYPE`/`E_SCHEMA_VERSION`/`E_EXPR_SYNTAX` 保存前拦截/404；记录新增与 8 类类型规则错误/表达式安全语义/更新软删/列表 filter·sort·page 与 4 类 `INVALID_QUERY`；存储损坏 500 不静默）+ `file.test.ts`（PNG 上传与元信息/伪造路径 basename 化/无文件与空文件 400/**超 10MB 413**/404 含路径穿越/mime 降级与损坏 500）；
- **真实启动冒烟 18/18 通过，连跑两遍幂等**（`node dist/main.js` → 登录 → 建档 → 回读 → 新增×2 → 审计字段 → range 越界 → 缺必填 → 列表排序 → filter → 分页 → 部分更新 → 清空必填拦截 → 软删 → 上传 PNG → 中文名不乱码 → **公开读取字节一致 + `image/png`** → 页面接口回归）。脚本留档 `C:\Users\91903\AppData\Local\Temp\opencode\smoke-crud.mjs`；
- 全量门禁：typecheck ✅ / build ✅（5 包 Done）/ test ✅ **537 passed** / coverage ✅ **96.06/87.41/96.9/96.06** exit 0。

**本批明确未做**：`GET /apps*`（启动聚合与应用菜单）、`GET /datasources` + `POST /datasources/:id/test`（数据源配置接口，依赖设计器批 5）、流程/待办 3 接口（Phase 3）、多租户与 `dataScope` 行级权限强制（协议已声明字段，服务端未拦，Phase 2 RBAC）、Redis 幂等 token（D-9 无 Redis）、`async` 规则服务端执行（协议约定仅前端）、上传直传 OSS（Phase 2）、`GET /pages` 页面列表浏览接口（设计器批 5 需要时再加）。

---

### 16. Phase 1 · 页面↔模型字段绑定（2026-10-12）

**目标**：下一步第 10 条（**批 5 闭环的直接前置**，本批即设计器「批 4」）—— 让设计器把「表单字段」映射到「数据模型字段」，页面提交即写入具体模型的记录。本批是**纯设计器侧工作**：服务端 `GET /models` / `GET /models/:id` 与 renderer 提交链路（`runModel()` → `POST /models/:id/records`、`controller.submit()` 组 payload）此前均已就绪，**缺的只是「配置 UI + schema 写入」**。

**决策 D-A11：字段绑定分两层，判定与写入全走 schema-ops 纯函数**

| 层 | 位置 | 写入什么 | 判定依据 |
|---|---|---|---|
| 页面级「提交模型」 | 属性面板顶部（与选中态无关，始终可见） | `dataSources[]` **原位 upsert** 一条固定 id `ds_submit` 的 `{type:'model', method:'POST', modelId}` + `submit.dataSourceId='ds_submit'`（已有 `successToast`/`successAction` 保留）；传 `null` 则清除 —— **只删 `ds_submit`，用户自建的 http/static 源不误伤** | 下拉选项来自 `GET /models` |
| 节点级「绑定字段」 | 属性面板，settings 区块上方 | 写 `props.name`（协议 2.2 字段绑定名 = renderer `collectFieldNames` 组 payload 的键）；传 `''` 写 `undefined`（解绑后不进 payload） | `selectedMeta.hasField === true` 的物料才显示；选项来自 `GET /models/:id` 的 `fields` |

关键约束：

- **`method` 固定 `POST`** —— renderer `runModel` 缺省即 POST，对应 `POST /models/:id/records`（新建一行）；
- **`readSubmitModel` 与写路径严格对称**（`submit.dataSourceId` → ds → `type==='model'` → `modelId`），换页 / 打开已配置页面即自动回填；
- **`ds_submit` 原位替换**（不删再 push）→ schema diff 稳定、数组顺序不变；
- **两侧同源**：「绑定字段」下拉与 settings 里的「字段名」input 是**同一个 `props.name`**，绑定后两处同步（实测已验）。

**实现落点**

| 文件 | 变更 |
|---|---|
| `packages/designer/src/core/schema-ops.ts` | 新增 `setSubmitModel(schema, modelId\|null)` / `readSubmitModel(schema)` / 常量 `SUBMIT_DS_ID`（纯函数，入参零副作用） |
| `packages/designer/src/store/store.ts` | `DesignerApi` 扩 `listModels()/getModel()`；新增 state `models/modelFields/fieldsModelId/modelError` + getter `submitModelId` + action `loadModels(force)` / `loadModelFields(id)` / `setSubmitModel(id)` / `setFieldBinding(nodeId,key)`；**字段按 `modelId` 缓存**（同模型不重复请求、换模型即失效、失败清空 —— 防「残留别的模型字段误导配置」） |
| `packages/designer/src/panel/PropsPanel.vue` | 两个新区块（与 settings 隔离）+ 引导文案（未配提交模型 → 提示先选；接口失败 → `.panel-err` 红字**不静默**） |
| `apps/designer-web/src/api.ts` | 加 `listModels/getModel`（复用既有自动登录 + Bearer 的 `req`） |
| `apps/designer-web/src/App.vue` | **B-30**：`store.setApi` 上提 setup 顶层 |

**测试与实测**

- **designer 测试 101 → 123**（+22）：schema-ops 6（设置 / 换模型 / 清除 / 重复设置 / 纯函数零副作用 / 读路径三兜底）+ store 10（模型列表成功·缓存·force·未注入 API·请求失败；字段加载成功·缓存·空 id·失败清空；`setSubmitModel` 写入 + dirty + 触发字段加载；清除；解绑；getter 由 schema 推导）+ panel 6（下拉渲染与选择、未选中也显示、hasField 出字段下拉并绑定、非 hasField 不显示、未配模型引导文案、接口失败错误可见）；
- **浏览器实测 5 点 + 服务端侧 6/6 PASS**：① 下拉从 `GET /models` 拉到 2 个真实模型（`员工信息` / `冒烟模型`）→ ② 选中后 help 变 `提交新增记录 → POST /models/m_employee/records` → ③ 选中画布 Input → 字段下拉列出 3 个字段（`姓名（empName）` / `部门（dept）` / `手机号（phone）`，来自服务端）→ ④ 绑定 `empName` 后 settings「字段名」input 同步为 `empName` → ⑤ 点保存后服务端 `GET /pages/demo/schema` **三处配置全部落库**（`ds_submit{type:model,method:POST,modelId:m_employee}`、`submit.dataSourceId=ds_submit`、`n-input.props.name=empName`）；
- 脚本留档：建模 `%TEMP%\opencode/model-setup.mjs`（幂等）+ 服务端核对 `%TEMP%\opencode/verify-schema.mjs`；
- 全量门禁：typecheck ✅ / build ✅（5 包 Done）/ test ✅ **559 passed** / coverage ✅ **96.13/87.58/96.98/96.13** exit 0（designer 分包 stmts 97.42 → **97.52**）；
- 顺带修 **B-29**：本批四连一度 34 用例全红（server 测试绑 `::`）+ 设计器 dev 502（vite 绑 `::1`），实测定位为本机 IPv6 回环被拦，修 3 处显式绑 `127.0.0.1`。

**本批明确未做**：字段类型与物料控件的**智能匹配**（如 model 字段是 `enum` 自动换成 Select 物料）、批量「按模型一键生成表单页」、`props.name` 与模型字段一致性的**校验拦截**（当前允许绑任意字段名，提交时由服务端 sanitize 兜底丢弃未知键）、数据源管理 UI（http/static/formula 源的增删改，属设计器批 5）、运行时壳 pageId 路由（下一步第 9 条）→ ✅ **已随「已实现 17」完成（2026-10-12）**。

---

### 17. Phase 1 · 运行时壳补全（2026-10-12）

**目标**：下一步第 9 条（**批 5 闭环的唯一剩余缺口**）—— 让 uni-app 运行时壳从「单页静态 demo」变成可用应用：**登录页 + 应用菜单 + 统一渲染入口（路由 `pageId → Schema` 动态加载）**，出口判据第 2 步（「手机 H5 打开」）依赖的三件套一次补齐。

**决策 D-14：`GET /apps/bootstrap` Phase 1 最小实现（方案 8.3 清单内接口，12/20 → 13/20）**

| 维度 | 方案语义 | Phase 1 落地 |
|---|---|---|
| 应用实体 | 独立「应用 + 菜单」配置 | **无独立应用表** —— 应用按页面记录的 `appId` 分组（`app_default` 默认值），应用名暂即 `appId`；有应用表后替换 |
| 权限 | 应用 + 菜单 + **权限** + 用户 | **不含权限**（运行时表达式侧当前默认全通），Phase 2 随 RBAC 补 |
| 菜单载荷 | 聚合下发 | 只下发页面**元数据**（`id/name/type/status/currentVersion/updatedAt`），打开页面时再单独拉 Schema |

**实现落点**

| 文件 | 变更 |
|---|---|
| `apps/server/src/page/page.types.ts` | `PageRepository` 扩 `list(): Promise<PageRecord[]>`（目录不存在返回 `[]`） |
| `apps/server/src/page/file-page.repository.ts` | `list()` 实现：readdir → 按文件名稳定排序 → 跳过 `.tmp` 残留与非法 id → 逐条 `find`（坏文件原样上抛不静默） |
| `apps/server/src/page/app.controller.ts` | **新** `GET /api/v1/apps/bootstrap`（Bearer）：`{ user, apps[] }`，按 `appId` 分组、应用 id 升序、页按 `updatedAt` 倒序 |
| `packages/runtime/src/api.ts` | **新**：API 基址（`http://127.0.0.1:3000/api/v1` 绝对地址，B-29 教训）+ 会话存取（`lc_token`/`lc_user`）+ `login/bootstrap/fetchPageSchema`（**published 优先，409 `NOT_PUBLISHED` 回退草稿**，404/401 原样抛） |
| `packages/runtime/src/host.ts` | `request` 自动补服务端 origin + 有会话时携带 `Bearer` —— **引擎侧（renderer）对登录态零感知**，提交链路（`runModel`）就此接通鉴权 |
| `packages/runtime/src/pages/login/index.vue` | **新** 登录表单（失败红字不静默、`?redirect=` 回跳） |
| `packages/runtime/src/pages/index/index.vue` | 原静态 demo **改造成应用菜单**：onShow 校验登录态（无 token / 401 → 清会话跳登录）+ `bootstrap()` 分组列表 + 状态徽标 + 退出 |
| `packages/runtime/src/pages/view/index.vue` | **新** 统一渲染入口 `?pageId=` → 拉 Schema → `lc-renderer`（导航标题动态、加载/错误态、401 → 去登录带回跳、404 「页面不存在」） |
| `packages/runtime/src/pages/demo/index.vue` | 原静态物料 demo 挪至独立页（菜单列「内置演示」入口） |
| `packages/runtime/src/pages.json` | 注册 4 页（首页 = 应用菜单）；`vite.config.ts` 补 `host:'127.0.0.1'`（**B-29** 同款隐患） |

**引擎缺陷根治（浏览器实测中暴露）**：`action.ts` 的 `submit` 动作原先 `await rt.onSubmit()` 后**恒返回 `ok:true`**——`controller.submit()` 失败时只返回 `{ok:false,error}` 不抛错，结果被 `.then(()=>undefined)` 丢弃 → **服务端 400 拦截后壳层仍 toast「提交成功」**。修复：`onSubmit` 透传 `{ok,error}`（`res?.ok ?? true` 兼容旧实现），`case 'submit'` 据此返回真实成败；壳层 `onActionResult` 失败必 toast（成功仅在页面未配 `successToast` 时兜底提示）。

**测试与实测**

- **server 93 → 98**（+5：bootstrap 未登录 401 / 登录后用户 + 分组 + 页面投影且**不含 Schema 本体与版本历史**；仓储 `list` 空目录 `[]` / save 后 2 条稳定排序 / `.tmp` 与非法名跳过）；**renderer 160 → 161**（+1：submit 处理器返回失败时透传 `ok:false` 与错误信息）；
- **浏览器实测 7 点全过**：① 未登录进首页自动跳登录 → ② 空密码提交红字「请输入用户名与密码」→ ③ 登录进菜单（`你好，admin` + `app_default` 分组列「画布演示」草稿徽标 + 内置演示入口）→ ④ 点击进 view 页 `pageId=demo` **published 版动态渲染**、导航标题自动变「画布演示」→ ⑤ **提交链路双向**：空表单提交 → 服务端 `E_REQUIRED` 400 拦截 + toast「模型取数失败（400）」；填「张三」提交 → toast「提交成功」+ 服务端 `POST /models/m_employee/records` **落库实查 1 条**（`empName:张三`、`createdBy:admin`）—— **`host.request` Bearer 注入生效** → ⑥ 清 token 后 view 页显示「登录已过期，请重新登录」+ 去登录 → 登录后**带 redirect 回跳原页**渲染成功 → ⑦ 退出登录清会话回登录页；
- 服务端侧冒烟：登录 → bootstrap 结构 → 无 token 401；`build:h5` + `build:mp-weixin` 双端 **DONE**（mp 真机仍欠，L-5）；
- 全量门禁：typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **565 passed**（schema 66 + expression 117 + renderer 161 + designer 123 + server 98）/ coverage ✅ **96.12/87.50/97.00/96.12** exit 0（分包 stmts：schema 96.05 · expression 93.84 · renderer 97.26 · designer 97.52 · **server 95.62**）；
- 联调修正 **B-31 / B-32**（见教训表）：本批实测一度「改码不生效 / 点击无反应」，最终定位为 workspace 包消费 `dist` + uni 依赖预构建缓存的双坑（三步顺序：**先 build 包 → 清 `node_modules/.vite` → 重启 dev**），以及开着的设计器 tab 把旧 schema PUT 回覆盖了 published v4（v5/v6 均无 `actions`）。

**本批明确未做**：`GET /apps`（应用列表）/ `GET /apps/:id`（详情）两接口仍 ⬜；独立应用实体与应用配置 UI；权限与菜单鉴权（RBAC，Phase 2）；mp-weixin 真机验证（L-5）；图片物料 `src` 相对路径 `/api/v1/files/:fileId` 在 H5 下打到 dev 端口 404（已知限制，演示页已踩「图片加载失败」，需绝对地址或壳层改写）；`onExprError` 对 `Error` 实例 `JSON.stringify` 得 `{}`（数据源失败上报 `ds:ds_submit` 时埋点信息不全，不阻塞）；多客户端同页并发覆盖（B-32，Phase 2 乐观锁/冲突检测）。

---

### 18. Phase 1 · 批 5 出口判据闭环（2026-10-14）

**目标**：下一步第 11 条（**Phase 1 主线最后一项**）—— 主方案 Phase 1 **出口判据 1/2/3** 实跑闭环：设计器拖出「员工信息登记」→ 保存发布 → runtime H5 打开填写 → 校验拦截空必填 → 提交 → 服务端查到记录。

**前置能力补齐（判据硬缺口，本批新增设计器能力三项）**

| 决策 | 内容 | 动因 |
|---|---|---|
| **D-A12 必填联动** | settings「必填」开关**一处控制两层**：星号（`props.required`）+ 校验规则（`props.rules:[{type:'required'}]`）—— `store.setProp` 写路径分叉，schema-ops 新增 `setRequiredRule`/`readRequiredRule` 纯函数（追加末尾/只移 required 他规则保留/目标态 no-op 不建空数组） | 原实现物料 `required` prop **纯展示星号**，校验引擎 `collectRules` 只认 `props.rules` —— 「开了必填只出星号、提交却不拦」的断层 |
| **D-A13 最小动作绑定** | 属性面板新增「事件」区块（事件 → 动作类型下拉，回填/写入走 schema-ops `updateActions`）；**无参动作可写入**（submit/back/scan/location），有参动作（navigate/http/toast）占位「参数配置 Phase 2」禁用 | 协议 `node.actions` 一直是提交扳机的载体，但设计器**从未有动作配置 UI**（批 3 只留了读路径），Button 的 submit 无从在 UI 上配置 |
| **textarea setter** | 属性面板第 5 种 setter（复用 `onInput` 写路径，`rows=3`） | Text「文本内容」是 `setter:'textarea'`，批 3 只实现 4 种 → 标题文字改不了，占位挡判据 |

**实现落点**（全部在 designer 包内，**renderer/schema/server 零改动** —— 写入的都是既有协议字段）：`packages/designer/src/core/schema-ops.ts`（+2 纯函数）、`src/store/store.ts`（`setProp` required 联动 + `setNodeAction`）、`src/panel/PropsPanel.vue`（textarea 分支 + 事件区块）。

**Demo 脚本（留档，可复跑）**

| # | 步骤（真实 UI 操作） | 实测结果 |
|---|---|---|
| 1 | 设计器 :5174 → pageId 输 `emp_form` → **新建** → 删 demo 多余 6 节点 → 拖入 Input（HTML5 DnD `browser.drag` 通路） | 画布留 n-text / n-input / 新 Input / n-btn |
| 2 | 页面级「提交模型」选 `m_employee`（help 显示 `POST /models/m_employee/records`） | ✅ `ds_submit` + `submit.dataSourceId` |
| 3 | n-input 绑 `empName` + 开「必填」；新 Input 改 label「部门」绑 `dept` + 开「必填」 | ✅ 画布星号即时出现（D-A12 星号层） |
| 4 | n-text 文本内容改「员工信息登记」（textarea setter）；n-btn 改「提交登记」+ 事件 click → **提交表单**（D-A13） | ✅ 下拉回填 submit，有参项 disabled 占位 |
| 5 | 顶栏 **保存 → 发布** | ✅ `已保存 emp_form` + `已发布 emp_form v1`，服务端 `status:published` |
| 6 | 服务端核对 schema（`GET /pages/emp_form/schema`） | ✅ 两 Input 各含 `props.rules:[{type:'required'}]` + `name`、`n-btn.actions:[{event:'click',type:'submit'}]`、`ds_submit→m_employee` |
| 7 | runtime :5173 登录 → 菜单 → 点「v1 已发布」卡 → view 页 | ✅ 渲染「员工信息登记 / 姓名\* / 部门\* / 提交登记」 |
| 8 | **空提交**（判据 2 前半） | ✅ 红字「请填写姓名」「请填写部门」+ toast「提交失败」+ **0 新网络请求**（日志 `action result {type:submit,ok:false}`） |
| 9 | 填「张三 / 技术部」→ 红字随输入即时消除（revalidate）→ 再提交（判据 2 后半） | ✅ toast「提交成功」+ `POST /models/m_employee/records` **200** + `action result {ok:true}` |
| 10 | 服务端查记录（`GET /models/m_employee/records`，判据 3） | ✅ 新记录 `empName:张三 / dept:技术部 / createdBy:admin / 2026-10-14T02:02:13` |

**出口判据结果**：**1/2/3 全通** —— ① 设计器拖出 → 保存发布 ✅；② H5 填写 → 校验拦截空必填 → 提交成功 ✅；③ 服务端查到记录 ✅。**两点执行注记**：判据 2「手机扫二维码」以 H5 浏览器实测替代（L-5：mp 真机未装微信开发者工具）；判据 3 尾巴「列表页能看到」按 designer-plan 批 5 裁剪口径以服务端查询验证（列表页物料属 Phase 2，见 **D-15**）。

**测试与实测**

- **designer 123 → 135**（+12：schema-ops +7 `setRequiredRule` 开/幂等/他规则保留/不建空数组/节点不存在/纯函数/脏数据；store +2 required 联动与 `setNodeAction`；panel +2 动作绑定 +1 textarea；另强化 1 断言）；
- 全量门禁：typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **577 passed** / coverage ✅ **96.19/87.71/97.05/96.19** exit 0（分包 stmts：schema 96.05 · expression 93.84 · renderer 97.26 · **designer 97.69** · server 95.62）；
- 浏览器实测：上表十步全过；排障过程记 **B-33**（dev 预构建半成品）、**B-34**（fill 错位污染 pageId）见教训表；
- 截图仍欠：`browser.screenshot` 报「needs a visible tab」（OS 桌面窗口不可见，沿批 2~4 同限制）。

**收尾 polish（2026-10-14 同日完成）**：emp_form 菜单撞名已解决 —— 用 API 改 `schema.name`「画布演示」→「**员工信息登记**」+ republish **v3**（注意 PUT body 须为 `{schema}` 包装，GET 响应亦为外层 `{pageId,status,schema,...}` 包装，直接改顶层不落库 —— 实测踩过一轮）；按 **B-32** 纪律随即**刷新设计器 tab 并重新打开 emp_form**（内存同步新 name，防误保存覆盖回旧值）；runtime 菜单实测「员工信息登记 v3 · 已发布」与 demo「画布演示 v9 · 草稿」并列无撞名。

**本批明确未做**：动作参数编辑器（navigate/http/toast 的参数配置 UI，D-A13 占位留 Phase 2）；页面 `schema.name` 的**设计器 UI 入口**（本批以 API 改名解决具体撞名，设计器 UI 无页面名编辑——随 Phase 2 页面设置补）；校验失败 toast 具体文案（壳层兜底「提交失败」而非 firstError —— `controller.submit` 校验分支缺 `error` 字段，1 行修复留后续批次）；列表页形态（Phase 2 `type=list`）；mp 真机（L-5）。

---

### 19. Phase 2 · 批 1 模型可视化建模（2026-10-14）

**目标**：Phase 2 开工批（拆批方案见 `docs/phase2-plan.md`，7 批 / 6 周）—— 把 Phase 0 前瞻协议的 `ModelSchema` 兑现为**可视化建模 UI**：业务人员在设计器内建模/改模，不写 JSON；服务端**零改动**（`PUT /models/:id` upsert + `validateModel` Phase 0/1 已就位）。

**决策 D-P2-1：模型管理 UI = 设计器内视图切换（不新开应用）**

顶栏「数据模型」按钮 ↔ 画布视图互斥切换，同一应用复用登录态/布局/`DesignerApi`；独立子应用的工程成本与「30 分钟搭应用」连续流的割裂体验被否决。

**实现落点**

| 文件 | 变更 |
|---|---|
| `packages/designer/src/core/model-ops.ts` | **新**：模型编辑纯函数（沿 D-A3「视图只发意图」纪律）——`blankModel/nextFieldKey/addField/removeField/moveField/updateField` + `parseOptions/formatOptions`（enum 选项串 `标签\|值,标签\|值`）+ `modelErrors` 保存门禁（**直接复用协议 `validateModel` —— 与服务端单一事实源**，前端拦下的与服务端会拒的严格一致；另补模型 id 格式对齐服务端 `MODEL_ID_RE`） |
| `packages/designer/src/store/store.ts` | 视图态 `view('page'\|'model')` + 模型编辑态（`editingModel/modelDirty/modelSaving/modelErrors`）+ 10 个 actions（switchView/openModel/newModel/closeModel/setModelProp/addModelField/removeModelField/moveModelField/editModelField/saveModel）；`DesignerApi` 扩 `putModel(model)` |
| `packages/designer/src/panel/ModelPanel.vue` | **新**：列表视图（摘要 + 新建 id 输入）↔ 编辑视图（name/code + 字段表格：key/展示名/type 下拉 ×14/required/enum options/上下移/删除）+ 保存/返回 + 错误红字列表（不静默） |
| `apps/designer-web/src/{api.ts,App.vue,style.css}` | `putModel` 实现（`PUT /models/:id`，body 即 ModelSchema 本体）；顶栏「数据模型」切换 + `ModelPanel` 视图容器；`.designer__models` 布局 |

**DoD 实测（2026-10-14，designer :5174 真实操作）**

1. ✅ 顶栏「数据模型」→ 列表显示真实模型（`员工信息 m_employee 3 字段` + `冒烟模型 md_smoke`）；
2. ✅ 新建 `m_leave`：`leaveType`（enum，选项串「事假\|a,病假\|b,年假\|y」）、`days`（number + required 勾选）、`reason`（text）→ 保存成功（「已保存模型 m_leave」）；
3. ✅ 服务端核对：`GET /models` 含 `m_leave`；`GET /models/m_leave` 三字段 key/name/type/required/options **逐项一致**（含「打开回读 → 删行 → 再保存」**往返一致性**）；
4. ✅ 门禁：清空模型 name → 保存 → 面板红字「模型缺少 name」+ 状态文本不变（**未发 PUT**）；
5. ✅ 切回画布视图：三栏 + 11 节点正常渲染（emp_form/demo 无影响）。

**测试**：designer **135 → 167**（+32：model-ops 纯函数 17 + store actions 与 ModelPanel 面板 15）；全量门禁与覆盖率见变更日志。

**本批明确未做**：删除模型接口与 UI（防误删牵连记录，随批 6 权限后评估）；relation 字段 refModel 可视化配置（type 可选、关联目标编辑占位）；字段拖拽排序（上下移按钮够用）；长度/精度/默认值等字段高级属性（协议已支持，面板逐批补）；模型版本/diff（批 5）；~~列表页与字段引用检查（批 2）~~ → ✅ **已随「已实现 20」完成（2026-10-14）**。

---

### 20. Phase 2 · 批 2 列表/详情标准页（2026-10-14）

**目标**：把 Phase 0 前瞻协议的 `ListPageConfig` 与 Phase 1 出口判据 3 遗留的「列表页能看到」（D-15 裁剪项）兑现为真身 —— renderer 支持 `type=list|detail` 配置化标准页（非拖拽），runtime view 按 type 分发，设计器属性面板配 list/detail（选模型/勾列/详情跳转）；服务端 records 查询既有，**零改动**。

**决策 D-P2-2：协议补位 `DetailPageConfig` + 标准页跳转走事件上抛**

- 协议新增 `PageSchema.detail?: DetailPageConfig {modelId, fields?, backPageId?}` 与 list 对称；validate 对称补 `type=detail` 必配校验（缺配置/缺 modelId 均红字，与 list 同款）。
- list/detail 页的 `root` 树运行时**忽略**（数据与展示全由 `schema.list` / `schema.detail` 驱动）；画布保留 root 编辑 + 顶部提示条说明差异。
- 点行跳转/返回**不扩 `RuntimeHost` 协议**：组件 emit `navigate`/`back` 事件 → 壳层（runtime view）接 `uni.navigateTo`/`navigateBack`（沿 D-A2 分层：renderer 零 uni 依赖，与 `select` 事件同模式）。
- list/detail 的数据获取走 `options.host.request` 直连（分页/搜索是组件内状态，不经 DataSourceManager）；顺带**修复 datasource model GET**（params 此前被丢弃、GET 恒无参 → 拼 query string，filter 对象按服务端契约 `JSON.stringify`）。

**实现落点**

| 文件 | 变更 |
|---|---|
| `packages/schema/src/types/page.ts` | **新** `DetailPageConfig`（modelId/fields/backPageId）+ `PageSchema.detail?` |
| `packages/schema/src/validate/index.ts` | `type=detail` 对称校验（E_REQUIRED `detail` / `detail.modelId`） |
| `packages/renderer/src/core/datasource.ts` | 修复 model GET：params 拼 query string（filter JSON / sort `field:dir`），POST 走 body 不变 |
| `packages/renderer/src/uni/lc-list-page.vue` | **新**：records 查询（page/size/sort 透传）+ 列渲染**三级降级**（columns → 模型全部字段 → 记录首行键）+ 「加载更多」追加 + 前端包含搜索 + 点行 emit navigate（detailPageId+rid）+ 加载/错误红字重试/空态；模型定义 404 不阻塞（列名回退 key） |
| `packages/renderer/src/uni/lc-detail-page.vue` | **新**：`filter={"id":rid}` 定位单条 + 展示字段（detail.fields 顺序 → 模型全部 → 记录键回退）+ 返回（emit back / 配 backPageId 则 emit navigate）+ 未找到红字 |
| `packages/renderer/src/uni/display.ts` | **新**：只读值格式化（空占位「—」、布尔中文、对象 JSON） |
| `packages/renderer/package.json` + `runtime/pages.json` | exports 补两个 `.vue` 子路径；easycom 精确规则（**须在 `^lc-(.*)$` 兜底之前**） |
| `packages/runtime/src/pages/view/index.vue` | schema 类型收窄 `PageSchema` + 按 `schema.type` 三分发 + onLoad 收 `rid` + `@navigate`/`@back` 接线（栈底 back 兜底回菜单不卡死） |
| `packages/designer/src/core/schema-ops.ts` | **新** `setPageType`（切类型初始化骨架、已有配置保留切回不丢）/ `updateListConfig` / `updateDetailConfig`（upsert 起底 + **换模型重置列/字段**，起底与 patch 显式带列**豁免**） |
| `packages/designer/src/store/store.ts` | `setPageType/setListConfig/setDetailConfig`（均 touch + 选模型拉字段缓存）；字段多选源合并为 `boundModelId` **单一 watch**（按类型取 list/detail/提交模型，避免双 watch 互相覆盖字段缓存） |
| `packages/designer/src/panel/PropsPanel.vue` | 页面配置区改造：「页面类型」下拉（form/list/detail/custom）+ 提交模型区块按类型显隐 + list 配置区块（模型下拉/字段多选/详情页 id/每页条数）+ detail 配置区块（模型/字段多选/返回页 id） |
| `apps/designer-web/src/{App.vue,style.css}` | 画布顶部标准页提示条（`std-hint`）；main 改 column 布局（lc-canvas 自带 flex:1 无需额外适配） |

**DoD 实测（2026-10-14，designer :5174 + runtime :5173 真实操作）**

1. ✅ 设计器新建 `p_emp_list` → 类型切「列表」（骨架初始化 + 提交模型区块隐藏 + 提示条出现 + validate 红字联动）→ 选 `m_employee`（字段多选出 3 字段）→ 勾 3 列 + 详情页 `p_emp_detail` + 每页 5 条 → 保存 + **发布 v1**；
2. ✅ **服务端回读** `GET /pages/p_emp_list/schema`：`list` 配置逐项一致（modelId/columns/detailPageId/pagination）；`p_emp_detail`（detail 三字段全勾）发布 v1 同样回读一致；
3. ✅ runtime 菜单出现两新页 → 打开列表页：中文列名（姓名/部门/手机号）+ 2 条张三 + 「共 2 条」；
4. ✅ 点第一行 → `view?pageId=p_emp_detail&rid=04474afe-…`：rid 定位单条、字段值与列表行一致、「返回」历史栈回列表；
5. ✅ emp_form 提交「李四/运营部」200 → 重进列表页：**3 条**、李四排第一（服务端默认 `createdAt:desc`）——「表单提交后列表即时可见」达成。

**测试**：schema **+6**（validate-stdpage：list/detail 对称校验）/ renderer **+18**（`test/uni/lc-pages` 组件 17 + datasource GET 1，组件测试首次走 `test/uni/**` jsdom 通道——B-24 铺好的路）/ designer **+16**（std-page 纯函数 10 + store 2 + PropsPanel 交互 4）→ 全量 **649 passed**（609→649）。

**本批明确未做**：`cardTemplate` 自定义卡片渲染（协议已支持，运行时按默认「列名:值」行渲染）；`ListPageConfig.filter` 表达式过滤（服务端 filter 仅等值，批 2 不做表达式求值）与 `search.fields` 字段限定（搜索为前端全列包含）；下拉刷新（`meta.pullDown`）与触底滚动加载（以「加载更多」按钮替代）；**D-P2-3** 新建页 name 未随 pageId 初始化（demo 模板名「画布演示」残留 → 菜单多页撞名辨识度差，页面名编辑随批 3/4 一并）；列表数据行级权限（批 6 `dataScope`）。

---

### 21. Phase 2 · 批 3 物料 12→30（2026-10-14）

**目标**：把展示物料 12 → 30（META 13→31 项，排除 Page 面板展示 30）——18 个新物料对齐 `FieldType` 全集与《落地方案》物料缺口清单；属性面板补 `optionList`/`color` 两个 setter（Radio/Select/Checkbox/Cascader 与 Text `style.color` 的声明欠账兑现）；demo fixture 扩为 30 全量演示。服务端**零改动**、协议**零变更**。

**决策 D-P2-4：18 物料清单定稿（对齐 `FieldType` 全集 + 方案缺口，不做组织服务幻想）**

- 表单 9：`DatePicker / DateTimePicker / MoneyInput / Checkbox / Picker / UserPicker / DeptPicker / Cascader / FileUpload`
- 数据 3：`Detail / Cell / List`；导航 2：`Tabs / SearchBar`；反馈 2：`Rate / Progress`（Button 已有）；基础 2：`Tag / Icon`
- 对齐口径：`FieldType` 全集（date/datetime/money/multiSelect/enum/user/area…）逐项有落点；《方案》缺口清单（日期时间/评分/级联/人员部门/文件）逐项覆盖。**未做**（记后续）：组织服务接入（UserPicker/DeptPicker 用静态 `candidates` 占位）、真实文件上传协议（FileUpload 只回显 `fileId` 元数据）、省市区内置数据集（Cascader 挂静态三级示例）、Tab 面板容器嵌套（Tabs 暂不可作容器）、Icon 字体包（内置 6 个基础图形 path 兜底）。

**决策 D-P2-5：表单物料统一契约 + 零新增 shim**

- 18 物料全走一期同款契约：`props{name,label,value,required,disabled,error}` + `emit('update',{name,value})` —— lc-node 分发分支零特殊化。
- 双端一致策略：**不做 uni 没有的组件 shim**——Checkbox 纯 view 模拟（无 checkbox-group 依赖）；Cascader 用逐级 `picker` 链（picker-view 无 shim）；FileUpload 走 `uni.chooseFile`（PC shim 补 polyfill，与 chooseImage 同款 file input）。
- List/Tabs 的行点击/切换事件载荷经 `scope.eventData` 注入表达式作用域（`handleEvent` 本身不带载荷，`controller.scope` 展开 + eventData 合并），动作内可用 `eventData.title` 等取值。
- setter 补齐只做 **optionList + color** 两项：`expression` 不补（批 4 D-A11 字段绑定区覆盖）；`slider/ruleEditor/fieldPicker/dataSourcePicker/eventBinder` 留后续（协议已支持，占位提示不误写）。

**实现落点**

| 文件 | 变更 |
|---|---|
| `packages/materials/src/{date-picker,date-time-picker,money-input,checkbox,picker,user-picker,dept-picker,cascader,file-upload,rate,search-bar,detail,cell,list,tabs,tag,icon,progress}/index.vue` | **新 18 个物料组件**（渲染正确性走 jsdom 遍历 stub 测试 + H5 实测口径） |
| `packages/materials/src/meta/{form,basic,feedback}.ts` + **新** `data.ts`/`nav.ts` | +18 份 META（settings/defaultProps/setter 全配），META_LIST 13→31 |
| `packages/designer/src/material-map.ts` | +18 import 与 kebab 映射（共 29 组件） |
| `packages/designer/src/panel/PropsPanel.vue` | +`optionList` setter（选项行增删改、value 数字串保型 number）与 `color` setter（`input[type=color]` + 非法值兜底主题色）；`style.*` 写路径（`updateProp` 前缀）打通 `style.color` |
| `packages/designer/src/fixtures/demo-page.ts` | 12 → **30 物料全量演示**（+f8~f18 受控字段） |
| `packages/designer/src/shim/uni-api.ts` | +`uni.chooseFile` polyfill（file input，与 chooseImage 同款） |
| `packages/renderer/src/uni/lc-node.vue` | +18 分发分支 + `onItemEvent(event,payload)` helper（`scope` 展开 + `eventData` 注入） |

**测试**：新增 `renderer/test/uni/lc-node-materials.test.ts`（29 叶子物料分发遍历锁 + FormGroup 容器递归，任一物料漏挂分支即红）与 `designer/test/meta-sync.test.ts`（31 项/名称唯一/分类合法/order 不重复/29 叶子映射齐备）；`panel.test.ts` +optionList/color 三用例；既有 8 处 demo 数量断言联动更新（12→30：store/canvas/dnd/panel 各处，color 占位用例改「已实现」正断言）。

**DoD 实测（全部运行时取数）**

| # | 项 | 实测 |
|---|---|---|
| ① | 物料面板 | 面板 **30 项**、6 分组（基础/数据/反馈/表单/布局/导航），18 新物料全在册 |
| ② | 画布渲染 | demo fixture **32 遮罩**（30 物料 + root + 组内子节点）；`insertMaterial('Rate')` root→31、`('Cascader', into n-fg)` 组内末尾 + 自动选中 |
| ③ | H5 运行时 | 发布 demo **v13** 后 H5 打开：探针 25/29 命中（4 miss = picker 空值占位态，`请选择/请选择人员/请选择部门/选择日期/选择时间` 5 类占位齐）、**无「未知组件」**、console **零错误**；受控交互：Rate 点第 2 星 → 2 星高亮、Checkbox 点「差旅交通」→ 勾选框渲染 ✅ |
| ④ | setter | optionList：改名「交通→差旅交通」/增行/删行全部写回 store 并随发布进 H5；color：读出兜底 `#2b6de8` → 改 `#16a34a` 写回 `props.activeColor` |
| ⑤ | 注册表同步 | 服务端回读 `GET /pages/demo/schema`：v13/published/31 节点，18 新物料全在（B-35） |

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ / `pnpm -r build` ✅ / `pnpm -r test` **689 passed**（基线 649 + 40：renderer 179→210、designer 183→192；schema 72 / expression 117 / server 98 不变）/ `pnpm coverage` **96.21 / 87.57 / 96.21 / 96.21** exit 0（门禁 90/85/90/90；designer panel 99.85、renderer uni 94.87/core 97.23 分包达标）。

**明确未做**：组织服务接入（人员/部门选择为静态候选）、真实文件上传协议（`POST /files` 已有但物料未接）、省市区数据集、Tabs 面板容器嵌套、Icon 字体包、`slider/ruleEditor/fieldPicker/dataSourcePicker/eventBinder` 5 个复杂 setter、relation refModel 联动、runtime 内置静态演示页仍为 12 物料版（Phase 1 遗产，不影响 DoD——H5 口径用服务端 demo v13）。

---

### 22. Phase 2 · 批 4 设计器可用性：撤销重做 / 大纲树 / 复制粘贴（2026-10-14）

**目标**：补设计器三件核心可用性能力——撤销重做双栈、大纲树面板（左栏页签）、内存剪贴板复制/剪切/粘贴（跨页）；顺手修 **D-P2-3**（新建页 name 默认 = pageId）。服务端/协议**零改动**。

**决策 D-P2-7：撤销不引 immer，用「不可变快照双栈」**

- 现状 schema-ops 16 个 op 全线 clone-then-replace（旧引用永不被原地修改）→ 快照栈直接存 `PageSchema` 引用即获得 immer 等价的**不可变历史**；immer 需新依赖 + 全部 op 改 `produce` 形态，收益仅省内存（schema KB 级、**栈上限 50**，全量快照 < 1MB 可忽略）→ **零新依赖**。
- 入栈机制：store 内 `watch(schema)` **单一接缝**（防漏 13 个变更入口；Vue 默认 pre flush 把同一 action 内的连写 —— 如 `setProp` 的 required 联动两连赋值 —— 合并为**一次入栈**）；`suspendHistory` 旗标吞掉换页/重置/undo 自身（非编辑不入栈）；`replaceSchema` **清空双栈**（跨页撤销会把 A 页 schema 覆盖到 B 页 = 数据事故）；`clipboard` 换页**不清**（DoD 跨页粘贴前提）。
- 快捷键分发抽 `core/keyboard.ts` 纯函数 `resolveKeyIntent`：`Ctrl/Cmd+Z` 撤销、`+Shift+Z`/`Ctrl+Y` 重做、`C/X/V` 复制/剪切/粘贴、`Delete/Backspace` 删除；**输入态一律不拦截**（文本原生编辑与原生撤销优先），App.vue 只做接线。

**实现落点**

| 文件 | 变更 |
|---|---|
| `designer/src/core/schema-ops.ts` | +`cloneSubtree`（剪贴板快照）/ `remapIds`（递归重映射子树 id，防重复 id 校验门禁）/ `pasteNode`（粘贴三定位规则：容器 children 末尾 / 叶子同级之后 / 无选中 root 末尾） |
| `designer/src/core/keyboard.ts` | **新**——快捷键意图分发纯函数（输入态排除 + 修饰键组合映射，jsdom contenteditable 兜底） |
| `designer/src/store/store.ts` | +undo/redo 双栈（上限 50）+ `watch` 单一入栈接缝 + `canUndo/canRedo` + `clipboard/copyById/cutById/paste` + `replaceSchema` 吞栈清栈 + undo/redo 后失效选中清理与 `touch()` 重校验；**D-P2-3**：`newPage` 的 `schema.name = pageId` |
| `designer/src/panel/OutlineTree.vue` | **新**——扁平化树行（缩进 / 展开折叠 / META `title` / 小字 componentName）、点击 ↔ 画布**双向选中**、选中变化自动展开父链（复用 `ancestorIds`）、行内删除按钮（root 保护）、组件计数 |
| `apps/designer-web/src/App.vue` | 左栏页签「物料 / 大纲」互斥切换 + 顶栏撤销/重做/复制/剪切/粘贴五按钮（`disabled` 由 `canUndo/canRedo/selectedId/clipboard` 联动）+ 键盘分发改走 `resolveKeyIntent` |

**测试**：新增 `history.test.ts`（**10 步混合操作** undo×10/redo×10 双向、required 联动两连写只入 1 栈、换页清栈且 undo 不跨页、失效选中清理、栈上限 50 丢最旧）/ `clipboard.test.ts`（三定位规则、`remapIds` 递归换 id、跨页保留、root 禁拷、剪切回填、粘贴可撤销）/ `keyboard.test.ts`（键位映射 + 输入态排除）/ `outline.test.ts`（34 行渲染、双向联动、折叠/恢复、父链自动展开、行内删除、root 无删除按钮）——designer 192→**223**（+31）。排障记 **B-36**（jsdom 不实现 `isContentEditable`/`contenteditable` 反射 → 输入态排除三层检查兜底，见教训表）。

**DoD 实测（全部运行时取数）**

| # | 项 | 实测 |
|---|---|---|
| ① | **10 步操作撤销/重做准确** | 复制 n-input 后粘贴 10 步（大纲 **34→44 行**逐级 +1，undo 可用/redo 禁用）→ `Ctrl+Z`×10 精确回 **34**（undo 禁用/redo 可用）→ `Ctrl+Shift+Z`×10 回 **44**；按钮态全程正确 |
| ② | **剪贴板跨页粘贴** | demo 选中 n-input 复制 → 新建 `p_b4_test`（32 行 demo 初始、**paste 仍可用 = 剪贴板保留**、undo 禁用 = 换页清栈）→ 粘贴 **33 行**、末行「单行输入 Input」内容同、**新 id `n_mv7t2h49b`**（remap 生效）、自动选中 |
| ③ | 大纲树 | **34 行 = root + 33 组件**（含批 3 拖入件）+ 计数「33 个组件」；树点 n-text → 树高亮、画布点 n-input → 树高亮**双向联动**；折叠 n-fg 子树行消失/展开恢复；选中自动展开父链；行内删除 33→32、root 行无删除按钮 |
| ④ | **D-P2-3 修复** | 新建 `p_b4_test` 保存 → **服务端回读 `schema.name = p_b4_test`**（不再是模板名「画布演示」）、totalNodes 33 / rootChildren 31 与画布一致（B-35） |
| ⑤ | 回归 | Delete 键删（33→32）+ `Ctrl+Z` 恢复（n-tag 回归位，新键盘分发路径可用）；console **零错误** |

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ / `pnpm -r build` ✅ / `pnpm -r test` **720 passed**（基线 689 + 31：designer 192→223；schema 72 / expression 117 / renderer 210 / server 98 不变）/ `pnpm coverage` **96.36 / 87.55 / 96.5 / 96.36** exit 0（门禁 90/85/90/90）。

**明确未做**：大纲树拖拽排序与多选（画布/属性面板已有排序入口）、跨标签页与系统剪贴板（内存剪贴板口径）、历史持久化（刷新即清）、immer 结构共享（**D-P2-7** 否决）、右键上下文菜单（顶栏按钮 + 快捷键代替）、模型视图（ModelPanel）内 undo（只对页面 schema 栈）、页面 name 编辑入口（D-P2-3 仅修默认值，手动改名仍无 UI）。

---

### 23. Phase 2 · 批 5 版本管理 UI：历史列表 / 回滚 / 对比 diff（2026-10-14）

**目标**：phase2-plan §3 批 5 —— 顶栏「历史」按钮 → 弹层列出发布版本、行内两步确认回滚到历史版、任一历史版与当前画布做结构化对比 diff。服务端已有 `rollback` 接口与 `page_versions` 数据，但**缺列表查询端点**（见 D-P2-8）。DoD：发布 v1~v3 → 历史可见 → 回滚 → 服务端核对。

**决策 D-P2-8：服务端补只读 `GET /pages/:id/versions`**

- 台账原判「rollback/versions 已有」实为：**回滚接口与版本数据结构已有、列表查询端点缺失**（`PageVersionRecord[]` 只存于 repo，HTTP 层无出口 → 历史面板拿不到列表）。
- 新端点返回轻量元数据**倒序** `{pageId, status, currentVersion, versions:[{version, createdBy, createdAt, note}]}`，**不含 schema 全文**（查全文走既有 `GET :id/schema?version=vN`）；repo 零改动（发布即 push 天然升序，投影 + 倒排）；协议登 protocol.md §10。

**决策 D-P2-9：自研结构化 diff，零依赖**

- `designer/src/core/schema-diff.ts` **`diffSchema(before, after)` 纯函数**：before = 历史版 vN、after = **当前画布（内存 schema，用户所见即所比，省一次拉取）**；对齐键 = 节点 id（设计态 id 稳定）。
- 四类条目：`add`/`remove`（**子树只报顶层**，父已报则整支不深入）、`change`（componentName + props 键并集逐键比，值 `JSON.stringify` 比较、80 字符截断、一侧缺键显示「（无）」）、`move`（同 id 的 parentId/同级 index 变化，root 无 move）；输出顺序约定 **remove → add → change → move**（测试锁定）。
- 不引 JSON diff 库（沿 D-P2-7 零依赖原则）；对象值（`style` 等）整体比较不逐键展开——版本 diff 关心语义变化。注：删除**前导**兄弟会使幸存节点同级 index 位移、被如实报为 `move`（删除的连带效应，测试 fixture 据此设计为「删末位」）。

**实现落点**

| 文件 | 变更 |
|---|---|
| `apps/server/src/page/page.{controller,service}.ts` | +`GET :id/versions`（`PageVersionsResponse`/`PageVersionSummary` 类型 + `listVersions` 投影倒排） |
| `designer/src/core/schema-diff.ts` | **新** —— 结构化 diff 纯函数（D-P2-9） |
| `designer/src/store/store.ts` | `DesignerApi` 扩 `getSchema(pageId, version?)` / `listVersions` / `rollback`（接口变更由 typecheck 锁 designer-web 同步）；批 5 状态（`historyOpen`/`versions`/`currentVersion`/loading/error/`diffEntries`/`diffVersion`）+ actions（`openHistory`/`closeHistory`/`refreshVersions`/`compareVersion`/`clearDiff`/`rollbackTo`——回滚成功 `openPage()` 重载，`replaceSchema` 连带清 undo 栈） |
| `designer/src/panel/HistoryDialog.vue` | **新** —— 手写 modal（居中弹层保画布上下文，不引 Element Plus、不切视图，沿手写 CSS 惯例）；列表三态（载入/失败/空）+ 当前发布徽标 + 行内**两步确认**回滚（不用 `window.confirm`，便于组件测试）+ diff 条目分色列表（add 绿 / remove 红 / change·move 橙） |
| `apps/designer-web/src/api.ts` | +`listVersions`/`rollback` fetch 实现 + `getSchema` 透传 `?version=` |
| `apps/designer-web/src/App.vue` | 顶栏「历史」按钮（`data-testid=open-history`）+ `<HistoryDialog />` 挂载 + 批次徽标改批 5 |

**测试**：新增 `schema-diff.test.ts`（**12**：空 diff / add / 子树只报顶层 / remove / 父存子删 / change 多键与键消失 / 对象值整体比 / componentName 变 / move 换父换序 / 组合顺序约定 / root props / 截断）+ `version-store.test.ts`（**9**：openHistory 三态、compareVersion 参数透传与精确产出、rollbackTo 成功重载与失败、closeHistory 清 diff）+ `history-dialog.test.ts`（**13**：v-if、列表三态、倒序与徽标、diff 渲染、两步确认取消/执行、刷新、关闭复位、遮罩关闭）+ server `api.test` **3**（versions 倒序轻量 / 未发布空表 / 404）——designer 223→**257**（+34）、server 98→**101**；既有三文件 mockApi（model/panel/std-page）随 `DesignerApi` 接口扩形状补齐两方法。

**DoD 实测（全部运行时取数）**

| # | 项 | 实测 |
|---|---|---|
| ① | **发布 v1~v3 → 历史可见** | `p_b4_test`（33 节点）连发三版：v1（批 4 现状）→ v2（n-text「文本内容」标题→标题-v2）→ v3（n-input「占位提示」→请输入姓名）→「历史」列表 **3 行倒序 v3/v2/v1**、v3 带「当前发布」徽标与「当前发布 v3」、时间作者可见（10-14 16:26 · admin）、行内双按钮齐 |
| ② | **对比 diff** | 对 v1「对比当前草稿」→ **2 处差异逐字命中实际改动**：`n-text props.text: "标题" → "标题-v2"`、`n-input props.placeholder: （无） → "请输入姓名"`（物料中文名「文本/单行输入」映射正确）；回滚后再对比 v1 → 「0 处差异 / 与当前画布无差异」空态 |
| ③ | **回滚** | 「回滚到此版」首点出「确认回滚到 v1？」（不调接口）→ 二次确认 → 弹窗自动关、statusText「已回滚到 v1（草稿，需重新发布生效）」、画布选中 n-text 属性回「标题」、**undo 按钮 disabled（栈随 replaceSchema 清空）** |
| ④ | **服务端核对（B-35）** | 回读三份：`GET schema`(draft) **深等 v1**（JSON 全等：text=标题、placeholder 键不存在、33 节点）；`GET versions` → **currentVersion=3（回滚不回退版号）/ status=draft / list [3,2,1] 倒序 / 各行不含 schema 全文** |
| ⑤ | 回归 | reload 后全链路（打开 → 历史 3 行 → 对比 → 关闭）console **零错误** |

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ / `pnpm -r build` ✅ / `pnpm -r test` **757 passed**（基线 720 + 37：designer 223→257、server 98→101；schema 72 / expression 117 / renderer 210 不变）/ `pnpm coverage` **96.51 / 87.8 / 96.67 / 96.51** exit 0（门禁 90/85/90/90）。排障记 **B-37**（服务端无 watch：改 server 源码后必须 build + 重启进程，否则新路由 404，见教训表）。

**明确未做**：发布备注 note 编辑（服务端 `PublishBody.note` 已支持，设计器顶栏无入参 UI）、vN vs vM 互比（只做「vN vs 当前画布」）、草稿自动快照（历史仅含发布版）、删除版本（服务端无接口）、版本整页 JSON 查看（diff 条目够用）、版本列表分页（单页历史量级小）。

---

### 24. Phase 2 · 批 6 权限 RBAC：页面 / 按钮 / 数据行级（2026-10-15）

**目标**：phase2-plan §3 批 6 —— 三道权限闸门在运行时真实生效：①页面级（菜单过滤 + 直达 403）②按钮级（无权限点整节点不渲染）③数据行级（`dataScope=self` 过滤）；设计器提供「权限管理」视图（角色 perms + 页面授权矩阵）与节点权限点 / 模型数据权限配置入口。DoD：双账号（admin `['*']` / designer `[]`）对比实测四点。

**决策 D-P2-10：RBAC 配置集中单文件**

- `<DATA_DIR>/rbac.json`，形状 `{roles:[{key,name,perms}], pages:{pageId:[roleKey]}}`；`perms` 含 `'*'` 通配（超级角色）；`pages` **无条目 = 全员可见**（向后兼容既有页面）；空数组 = 删条目恢复全员。
- 用户→角色映射不动（UserStore 内存种子：admin `['admin']` / designer `['designer']``）；`PageRecord` 零改动。
- **种子配置修正**：`FileRbacRepository` 文件不存在时返回 `seedConfig()`（admin `['*']` + designer `[]` + pages 空），**不再返回空配置** —— admin「超级角色」语义不依赖手工初始化（批 6 实测首启即回读两角色，B-35）。

**决策 D-P2-11：四层判定单一事实源 `RbacService`**

- ①**页面级** `canSeePage`：无条目全开；有条目角色命中（`'*'` 恒通）；守卫落点 = `GET /pages/:id/schema` 403 `PAGE_FORBIDDEN` + bootstrap 菜单过滤。
- ②**按钮级**：角色 `perms` 并集下发（login/bootstrap 响应加 `perms: string[]`），renderer 既有语义「**无权限整节点不渲染**」（DoD 原文「按钮禁用」按此更强口径执行并注明）；runtime `options.hasPerm` 实读会话 `lc_perms`（fail-closed 空数组、`'*'` 恒真）。
- ③**模型 CRUD**：`model.permissions[action]` 未声明=通、声明=角色交集否则 403 `PERMISSION_DENIED`；守卫落点 = records 四接口。
- ④**行级 dataScope**：`all` 不过滤、`self` 按 `createdBy` 匹配、`dept/deptAndChild` 无组织服务**保守降级按 self**、`'*'` 豁免；守卫落点 = records 查询链。
- 管理面（页面写路径 / 模型管理接口）不设页面可见性。

**决策 D-P2-12：权限 UI 三入口**

- 设计器第三视图「权限管理」`RbacPanel.vue`（角色列表 + 新建/编辑/门禁红字 + 页面授权矩阵勾选）；属性面板节点 perm setter（顶层字段，**放 settings 之后**不打乱既有 setter DOM 顺序，空=清除）；模型编辑器「数据权限」区块（`dataScope` 下拉 dept 系置灰 + CRUD 四行角色勾选）；用户管理 UI 不做（内存种子无持久支撑）。

**实现落点**

| 文件 | 变更 |
|---|---|
| `apps/server/src/rbac/`（五件套） | **新** —— `rbac.types.ts`/`file-rbac.repository.ts`（原子写 + 种子回退）/`rbac.service.ts`（四层判定 `PERM_RE`/`WILDCARD`/`permsOf`/`canSeePage`/`assertModelPerm`/`rowVisible`）/`rbac.controller.ts`（GET roles + PUT roles/:key + PUT pages/:pageId，`@HttpCode(200)`）/`rbac.module.ts` |
| `apps/server/src/common/auth.module.ts` | **新** —— JwtService 独立成模块防循环依赖；IdentityModule 改 `exports:[AuthModule]` |
| 服务端接线 | `app.module`+RbacModule、`auth.service` login 带 `perms`、`app.controller` bootstrap 带 `perms`+菜单过滤、`page.controller` schema 守卫 403、`model.module/record.service` CRUD+行级强制 |
| `designer/src/core/schema-ops.ts` | +`setNodePerm`（节点顶层字段，空串=删键） |
| `designer/src/store/store.ts` | RBAC 态（`rbacRoles/pageAuth/rbacPages/editingRole/roleErrors/rbacError`）+ actions（`loadRbac/loadRoles/newRole/editRole/closeRole/setRoleProp/setRolePerms/saveRole`（门禁前置）/`togglePageRole`（乐观更新+失败先重拉回滚再写 error，防 loadRbac 清错）/`setNodePerm`）；`view` 扩 `'rbac'` |
| `designer/src/panel/RbacPanel.vue` | **新** —— 第三视图（角色 CRUD + 矩阵 `cell-{pageId}-{roleKey}`） |
| `designer/src/panel/PropsPanel.vue` | 节点权限点 setter（`data-testid=node-perm`，settings 之后） |
| `designer/src/panel/ModelPanel.vue` | 「数据权限」区块（`model-data-scope` + `perm-{act}-{roleKey}` 八勾选） |
| `apps/designer-web/src/{api,App}.vue` | `DesignerApi` +4 方法、顶栏「权限管理」切换 + RbacPanel 挂载 + 批次徽标批 6 |
| `packages/runtime/src/api.ts` | `PERMS_KEY='lc_perms'` fail-closed、login/bootstrap 落 `setPerms`、bootstrap 返回 `{user,perms,apps}` |
| `packages/runtime/src/pages/view/index.vue` | `options.hasPerm` 实时读 `getPerms()`（`'*'` 或含 perm）+ 403 分支「无权访问该页面（pageId）请联系管理员授权」 |

**测试**：新增 `rbac-store.test.ts`（**11**：switchView/loadRbac 三态/角色编辑生命周期/roleGateErrors 含 `'*'` 豁免/saveRole 门禁与失败/togglePageRole 全取消删键与失败回滚/setNodePerm/model 权限区块/loadRoles）+ `rbac-panel.test.ts`（**8**：列表/空态/新建/门禁红字/保存/矩阵勾选/rbacError/编辑回填）+ server `api.test` **9**（种子回读/login perms/PUT upsert 含 `'*'`/非法入参 400/pages upsert/bootstrap 双角色差异/schema 守卫 403/空数组恢复/无令牌 401）+ server `model.test` **6**（③ CRUD 拦截 403 PERMISSION_DENIED、④ dataScope=self 过滤 + admin `'*'` 豁免、update/delete 行归属、未声明不限制回归）+ 补充：`schema-ops.test` +3（setNodePerm）、`panel.test` +1（perm setter）、designer `model.test` +1（数据权限区块 + dept 置灰）——designer 257→**281**（+24）、server 101→**115**（+14）；既有 6 个 mockApi 工厂随 `DesignerApi` 扩 4 方法补齐。

**DoD 实测（全部运行时取数，双账号对比）**

| # | 项 | 实测 |
|---|---|---|
| ① | **页面级菜单差异 + 403** | 配置 `pages:{p_emp_list:['admin']}`（服务端回读 ✓）→ admin 菜单 **5 页**（3 个「画布演示」含 p_emp_list）vs designer 菜单 **4 页**（缺 p_emp_list）；designer 直达 `#/pages/view/index?pageId=p_emp_list` → 服务端 `GET schema` **403 `PAGE_FORBIDDEN`「无权访问页面 p_emp_list」** + 硬刷新页面渲染「无权访问该页面（p_emp_list），请联系管理员授权」+「返回菜单」出口（B-39：运行中直接改 hash 会复用旧实例出假象，验证须硬刷新/真实菜单导航） |
| ② | **按钮级（published v4）** | `emp_form` 的 `n-btn` 设 `perm=emp_submit` → 保存 + **发布 v4**（菜单走 `?version=published`，只存 draft 测不到）→ admin（`perms:['*']`）进 emp_form **「提交登记」按钮渲染**；designer（`perms:[]`）同页 **整按钮不渲染**（表单字段正常），renderer「无权限整节点不渲染」语义实证 |
| ③ | **行级 dataScope=self** | `m_employee` 设 `self` 落库（B-35 回读 `dataScope:"self"`）→ admin 进 p_emp_list「**共 3 条**」（`'*'` 豁免）；designer 进同页「**暂无数据**」（0 条，self 过滤）；records API 同证（admin 3 / designer 0）；**测完已回 `all`**（回读 200 + designer 恢复见 3 条） |
| ④ | **rbac.json 服务端回读（B-35）** | `apps/server/data/rbac.json` 实存：`roles=[admin 平台管理员 ['*'], designer 设计器用户 []]`、`pages` 随配置落地过 `{p_emp_list:[admin]}`（测后恢复 `{}`）；UI 角色编辑生命周期全链实测：门禁红字「权限点格式不合法：has space」拦截不发 PUT → 合法值保存 → **designer login perms 即时变 `['demo_view']`** → 清空恢复 `[]`；两 tab console 无产品错误（designer 仅 1 个 400 为 `MODEL_INVALID` 校验正确拦截的实测痕迹） |

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ / `pnpm -r build` ✅ / `pnpm -r test` **795 passed**（基线 757 + 38：designer 257→281、server 101→115；schema 72 / expression 117 / renderer 210 不变）/ `pnpm coverage` **96.62 / 87.87 / 96.77 / 96.62** exit 0（门禁 90/85/90/90）。排障记 **B-38**（vitest 聚合 coverage 满载 worker RPC 超时 → 限并发 `maxWorkers:8/minWorkers:2` + `rpcTimeout 180s`）、**B-39**（uni H5 运行中改 hash 复用旧实例假象）、**B-40**（Nest 守卫依赖链：`@UseGuards(AuthGuard)` 的模块必须 import 提供 JwtService 的 AuthModule，否则启动 V8 native 崩、vitest 表象为 Worker exited unexpectedly，须裸探针开 Nest logger 才见真错）。

**明确未做**：用户管理 UI（内存种子无持久支撑）、角色删除接口（只 upsert）、`dept/deptAndChild` 真实现（无组织服务，保守降级 self）、页面「无人可见」状态（全取消=恢复全员，语义上无「全员不可见」）、perm 批量收集器（逐节点配置）、模型管理接口的管理面鉴权细分（登录即可）、菜单项按钮级过滤（菜单只做页面级）。

---

### 25. Phase 2 · 批 7 出口判据 Demo + 多端打包（2026-10-15）

**目标**：phase2-plan §3 批 7 —— ① 30 分钟「申请-列表-详情」全流程 Demo（请假申请 = 本 Phase 产物集大成，汇合批 1~6）+ Demo 脚本留档；② 微信小程序分包 / 包体积 / 真机（L-5 尾巴）。**Phase 2 七个批次就此全部收口**。

**出口判据原文**（主方案 Phase 2）：「业务人员 30 分钟内搭出一个『申请-列表-详情』完整应用；小程序端跑通」。

**Demo 脚本十步（留档，全程设计器 UI 操作 + H5 实测取数）**

| # | 步骤 | 实测 |
|---|---|---|
| 1 | 模型确认 | `m_leave` 三字段（`leaveType` enum 事假=a/病假=b/年假=y、`days` number 必填、`reason` text）、记录 0 条干净起点（服务端回读） |
| 2 | 建 leave_form | 新建（demo 模板）→ 批量清理 31 个 demo 节点（选中 + Delete 键）→ 拖入 4 物料（Picker/NumberInput/Textarea/Button，HTML5 DnD）→ mouse 手势换位 Picker 至首位 |
| 3 | 配 leave_form | 页面级提交模型 `m_leave` → 3 字段绑定（leaveType/days/reason）→ days 必填 → 按钮动作 `submit`「提交请假」→ Picker options 三选项（事假=a/病假=b/年假=y，optionList setter 增删改）→ label 三处改真名（请假类型/天数/事由）→ 保存 + 发布 **v2** |
| 4 | 建 leave_detail | 新建 → 页型切 detail → 模型 `m_leave` → 勾 3 字段 → 返回页 `leave_list` → 发布 **v1** |
| 5 | 建 leave_list | 新建 → 页型切 list → 模型 `m_leave` → 勾 3 字段 → 详情页 `leave_detail` → 发布 **v2** |
| 6 | H5 菜单 | designer 账号菜单出现三页（leave_form v2 / leave_list v2 / leave_detail v1，均「已发布」） |
| 7 | 必填拦截 | 空表单直接提交 → 校验红字「请填写数字输入」+ toast「提交失败」，停在表单页（D-A12 联动在真实模型上复证） |
| 8 | 填表提交 | Picker 选「事假」→ **回显「事假」**（D-P2-13 修复后）→ 天数 3 → 事由「家中有事需请假处理」→ 提交 toast「**提交成功**」 |
| 9 | 落库 + 列表 | 服务端回读 `m_leave` **1 条**（`a`/3/家中有事需请假处理，B-35）→ leave_list 显示「共 1 条」三列全对 |
| 10 | 详情 + 返回 | 点行 → leave_detail（URL 带 `rid` 传参、三字段 + 返回按钮）→ 点「返回」→ 回 leave_list（链路闭环） |

**用时诚实说明**：纯搭建动作（步骤 2~5，含清理模板 + 拖入配置 + 发布三页）约 **20 分钟**操作量，在 30 分钟口径内；实际墙钟时间更长 —— 中途发现并现场修复两处产品缺陷（B-41 / D-P2-13，见下），修复与排障另计。

**排障记 B-41：物料 defaultProps 携带 demo 表达式残留（批 7 Demo 暴露，已修）**

- `packages/materials/src/meta/form.ts` 6 个表单物料的 `defaultProps` 带 `value: '$expr: formData.<demo字段>'`（Picker=pick / DatePicker=date / DateTimePicker=datetime / MoneyInput=amount / Checkbox=checks / FileUpload=files）—— demo fixture 的受控演示字段污染了**物料注册表**，新拖入任何页面都携带指向不存在字段的表达式。
- 修复：6 处 `value` 残留全部删除（`options: DEMO_OPTIONS` 保留为画布预览占位，业务人员用 optionList setter 改真值）；拖入即干净（设计器实测：新 Picker「绑定值（表达式）」为空）。

**决策 D-P2-13：受控物料回显兜底（renderer 分发层）**

- 根因链：批 4 D-A11 字段绑定只写 `props.name`（组提交 payload 的键），而 Picker/Select 等**严格受控物料**按 `props.value` 反查显示（`index = findIndex(o => o.value === props.value)`）—— value 未绑 → 选中后 emit update 写入 `formData[name]`，组件却求值不到 → **回显永远停在 placeholder**（批 4 只验落库没验回显，批 7 Demo 首次暴露）。
- 修复：`lc-node.vue` 物料实绑 props 收敛为 `bindProps` computed —— `props.value === undefined` 且绑了 `name` 时自动以 `formData[name]` 作受控值；`value` 显式配置（含 `$expr:` 表达式）原样透传不受兜底影响；design 态 formData 恒空 → 画布行为不变。29 处物料分发统一走 `bindProps`。
- 存量页面（emp_form 等批 4 期绑定字段的表单）随渲染层修复**立即受益**（无需重新绑定）。
- 测试锁：`lc-node.test.ts` +4 用例（兜底注入 / value 显式不覆盖 / 无字段不注入 / 交互后重 resolve 跟随更新）。

**多端打包（分包）**

- `pages.json`：demo 页挪出主包 → `subPackages[{root:'pages-demo', pages:[{path:'index'}]}]`；源码同步迁移 `src/pages/demo/index.vue` → `src/pages-demo/index.vue`；菜单「内置演示」跳转 `/pages/demo/index` → `/pages-demo/index`（全仓 grep 确认仅 2 处源码引用）。
- `build:mp-weixin` 产物验证：`app.json` 主包 3 页（index/login/view）+ `subPackages` 配置正确；分包目录 `pages-demo/index.{js,json,wxml,wxss}` 四件套齐；分包 wxml 正常引用 `<lc-renderer>`（easycom 跨分包解析无碍）。
- **包体积**：主包 **209.7 KB**（150 文件，微信 2MB 主包限制的 **10.2%**，健康）；分包 pages-demo **1.33 KB**。清理了跨次 build 的 `demo/` 旧产物残留（2.4KB）。

**排障记 B-42：workspace 聚合 coverage 的 worker RPC 超时（B-38 续集）**

- 现象：`pnpm coverage`（`--workspace config/vitest.projects.ts`）连续两跑崩 1~5 个 suite（`Timeout calling "fetch"` / `"snapshotSaved"`），782/754 passed + exit 1；同配置批 6 曾过 → 负载敏感的偶发假红。
- 定位：workspace 模式下根 `vitest.config.ts` 的 `maxWorkers/rpcTimeout` **继承不可靠**（24 核默认满载）；CLI `--rpcTimeout` 非 vitest 2.1.9 认识的选项（checkUnknownOptions 拒绝）；CLI `--maxWorkers=8 --minWorkers=2` **有效**（崩 5→1）。
- 处置：coverage 跑前**停掉常驻 dev 服务降负载**（三 vite/Nest 进程占核占内存）+ CLI 限并发 → **46 files / 799 passed / EXIT=0** 稳定通过。后续批次沿用此组合（workspace 限并发的正解待评估「每包 config 补 maxWorkers」或 vitest 升级）。

**实现落点**

| 文件 | 变更 |
|---|---|
| `packages/materials/src/meta/form.ts` | 6 处 defaultProps 删 `$expr:` demo 残留（B-41） |
| `packages/renderer/src/uni/lc-node.vue` | +`bindProps` computed（D-P2-13 受控回显兜底），29 处物料分发 `v-bind="model.props"` → `v-bind="bindProps"` |
| `packages/renderer/test/uni/lc-node.test.ts` | +4 用例（D-P2-13 回归锁） |
| `packages/runtime/src/pages.json` | demo 页挪 `subPackages`（主包 3 页 + 分包 1 页） |
| `packages/runtime/src/pages/demo/index.vue` | → `packages/runtime/src/pages-demo/index.vue`（分包源码目录） |
| `packages/runtime/src/pages/index/index.vue` | 「内置演示」跳转路径 → `/pages-demo/index` |
| 服务端数据（Demo 产物） | `leave_form` v2 / `leave_list` v2 / `leave_detail` v1 三页 published；`m_leave` 1 条演示记录 |

**DoD 实测**：Demo 十步全过（上表）+ 分包产物四点（app.json 结构 / 分包四件套 / wxml 引用 / 体积 209.7KB+1.33KB）。两缺陷修复均经 H5 实测复证（Picker 选中回显 / 新拖入物料无残留表达式）。

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ / `pnpm -r build` ✅（5 包 Done + `build:mp-weixin` 分包产物验证）/ `pnpm -r test` **799 passed**（基线 795 + 4：renderer 210→214；schema 72 / expression 117 / server 115 / designer 281 不变）/ coverage **96.62 / 87.91 / 96.77 / 96.62** exit 0（门禁 90/85/90/90，B-42 处置后稳定）。

**明确未做（批 7 裁剪与发现缺口）**：① **mp 真机 / 微信开发者工具**（L-5 尾巴维持：只验到 `build:mp-weixin` 产物级，环境无开发者工具）；② **enum label 映射**（列表/详情显示原始值 `a` 而非「事假」—— 字段显示映射属后续批次）；③ **页面 name 手动编辑**（菜单显示英文 pageId，既有记录）；④ **App 端打包脚本**（事项表「App 打包」裁剪：uni CLI app 产物链未配置，有 App 需求时再做）；⑤ 物料按需裁剪流水线（方案 9.3 构建期 Schema 扫描 used-materials.json，Phase 1 明确不做项维持；当前 easycom 按用注册 + 主包 10.2% 余量充足）。

---

### 26. Phase 3 · 批 1 流程引擎核心（2026-10-15）

**目标与范围**（拆批与 DoD 见 `docs/phase3-plan.md` §4）：协议补 `FlowSchema` + `validateFlow`；服务端 flow 模块（定义 CRUD + 实例 + 任务 + 审批动作 **7 接口**）；**记录提交联动启动实例**；protocol.md 回写（§10.1 流程接口组 —— 勘误：立项初稿误写 §11，§11 实为「生命周期受信 API」，流程组并入 §10）。

**落点**

| 层 | 内容 |
|---|---|
| 协议 `packages/schema` | **新** `src/types/flow.ts`（`FlowSchema`/`FlowNode`/`FlowAssignee`，形状 = 主方案 8.6 原文 + `name` 补充，不带 `schemaVersion`——与 `ModelSchema` 同类服务端数据实体）；`validate/index.ts` **新增 `validateFlow`**（结构硬约束首 start/尾 end/approve≥1/id 唯一/onReject 引用存在；`E_FLOW_*` 13 类错误码 + `W_FLOW_*` 4 类降级告警，表达式经注入 `checkExpr` 出 `E_EXPR_SYNTAX`） |
| 服务端 `apps/server` | **新模块 `flow/`** 5 文件：`flow.types.ts`（`FlowInstance`/`FlowTask`/`FlowHistoryEntry` + 仓储契约）、`file-flow.repository.ts`（`flows.json` + `flow-instances.json`，原子写，实例只追加/就地更新不删）、`flow.service.ts`（定义 CRUD / 提交联动 / 推进纯逻辑 `advanceFrom` / 审批动作 `decide` / 待办与 assignee 判定）、`flow.controller.ts`（7 接口；静态段先于 `:flowId` 声明防路由抢配、POST 显式 `@HttpCode(200)`）、`flow.module.ts`；`app.module.ts` 注册 |
| 接线 | `RECORD_REPOSITORY` provider 从 ModelModule **提升至 `@Global` StorageModule**（FlowService 回写与 RecordService 写入同源单实例，防双实例文件仓 read-modify-write 竞态）；`ModelModule imports FlowModule` 单向（RecordService 联动）；`record.service.create` 在 save 后调 `onRecordCreated`（**弱保证**：内部全量 try-catch，流程启动失败只记日志不回滚记录） |
| 协议文档 | protocol.md **§10.1 新增「流程审批」接口组**（7 接口 + 推进语义/assignee/setField 回写/存储四组语义说明）；§10.3 错误码 +5（`INVALID_FLOW`/`FLOW_NOT_RUNNING`/`FLOW_TASK_STALE` 400、`TASK_FORBIDDEN` 403、`FLOW_*_NOT_FOUND` 404）+ `E_FLOW_*` Issue 行 |

**关键决策**

- **D-P3-1 推进语义**：`start` 自动通过；`approve` 停下建 pending 任务；`mode=condition` 且条件假 → **跳过**（history `skip`；求值异常按 `true` 走审批 —— **fail-open 防漏审**）；`end` → 实例 `approved` + 应用 `onApprove.setField`；`reject` 有 `onReject` 回退（指 `start` = history `reenter` 重建任务）无则 `rejected` 终态；`linear` 忽略 condition（validateFlow warning 提示）。
- **D-P3-2 assignee 判定**（`FlowService.canDecide` 单一事实源）：`starter` = 实例发起人；`role` = `user.roles` 命中 **或 RBAC perms 含 `'*'` 超级豁免**；`dept` 协议保留、运行时**不可命中**（与批 6 dataScope dept 降级同口径）。
- **D-P3-3 回写与依赖方向**：`setField` 回写**不经表单 sanitize**（服务端内部直写 payload —— 8.6 `status: approved` 语义）；`decide` 顺序 = 校验 → 改内存 → **先回写记录再落实例**（记录写失败抛 500、任务未落可重试）；`RECORD_REPOSITORY` @Global 化防 ModelModule ⇄ FlowModule 循环 imports。

**排障记 B-43：vitest/esbuild 不 emit decorator metadata，裸类型注入在测试容器为 undefined（已修）**

`FlowService` 构造参数 `private readonly rbac: RbacService` 未加 `@Inject` —— 生产 tsc 构建有 `emitDecoratorMetadata` 正常，**vitest/esbuild 转译不产 metadata** → 测试容器注入 `undefined`，`canDecide` 调 `this.rbac.permsOf` 全部 `TypeError → 500`（9 用例红，表象分散在 todo/decide 各处）。与 B-40（模块 imports 链缺失致 DI 启动崩）互为镜像：**一个崩在启动、一个静默注入 undefined**。修法：补 `@Inject(RbacService)`；**规范：本仓库 Nest 构造注入一律显式 `@Inject`**（既有 `record.service.ts` 风格的深层原因即此）。定位手法：测试开 `logger: ['error']` 抓 `ExceptionsHandler` 真实栈（`console` 静默时 500 无从下手）。

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ 7 包 Done（schema 重建 dist 后全仓绿 —— server/designer 消费 `@lc/schema` 走 dist，**协议包改后必须先 build**）/ `pnpm -r build` ✅ 5 包 Done / `pnpm -r test` ✅ **834 passed**（基线 799 + 35：schema 72→**87** +15 `validate-flow.test.ts`、server 115→**135** +20 `flow.test.ts`；expression 117 / renderer 214 / designer 281 不变）/ coverage ✅ **96.46 / 87.68 / 96.95 / 96.46** exit 0（门禁 90/85/90/90；`flow/` 分包 94.66/80.62 stmts/branch）；**B-42 参数升级**：48 文件负载下 `--maxWorkers=8` 复发 RPC 超时（2 suite `Timeout calling "fetch"` + 1 `snapshotSaved` unhandled，815/834）→ 降 `--maxWorkers=4 --minWorkers=1` 后 **48/834 全过、49.3s** —— 限并发需随测试文件数动态下调。

**冒烟承载**：`flow.test.ts` 20 用例 = 真实 Nest 启动 + HTTP 全链路（即批 1 DoD「接口冒烟脚本」，且可重复回归），覆盖 定义 CRUD/校验拦截 → 提交联动 → 待办过滤（`'*'`/starter/role + 403）→ 主链推进 + **`setField` 回写记录读回（B-35）** → 驳回 reenter/终止/stale → 条件 skip → 删除后实例审计保留；另留档 **`apps/server/scripts/smoke-flow.mjs`**（真实产物 dist + 真实 data 目录 12 项断言全过 `SMOKE OK` exit 0）—— 实测补抓两处：enum 选项须取 `options[0].value`（对象数组）、终态后再审批语义为 `FLOW_NOT_RUNNING`（终态检查先于任务检查，与中间节点 `FLOW_TASK_STALE` 两层防护）。

**明确未做**：流程定义可视化编辑器（接口直建够 DoD）；condition 分支树（首期只做跳过）；`assignee=dept` 实际解析（无组织服务）；转办/加签动作；流程绑定的页面级配置 UI（批 2 物料侧一并做）。详见 `phase3-plan.md` §4。

---

### 27. Phase 3 · 批 2 审批物料 + 待办中心（2026-10-16）

**批次定位**：审批 UI 全套（物料 ×2 + 数据通道）+ 待办中心两页 + 设计器流程绑定配置 —— Phase 3 出口判据「提交 → 待办 → 同意 → 状态变更 + 时间轴可见」的**用户可见段**（引擎见「已实现 26」）。

**关键决策**

- **D-P3-4 审批物料数据通道**：`LcFlowHost` 接口 + `LC_FLOW_HOST_KEY` 注入键定义于 `materials/keys.ts`，renderer → materials **单向依赖**；宿主由「渲染处」provide —— 画布侧注入**零请求 mock 宿主**（recordId 未绑定走占位态不白屏）、`todo/detail.vue` 是独立 uni 页不经 lc-renderer **自行 provide `createUniHost()`**。
- **D-P3-4b recordId `$expr:` 绑定**：审批物料 `props.recordId` 默认 `$expr: urlParams.rid`，渲染层 `$expr:` 求值 + view 页 `options.urlParams` 补齐 → 详情路由自动取记录主键，配置者免手填。
- **D-P3-5 待办中心两页**：`pages/todo/index`（onShow 重拉、已办即消失）+ `pages/todo/detail`（内置详情：状态头 + 记录字段 + 复用 ApprovalBar/Timeline，decided 后 `tlKey` 重建时间轴）；菜单「工作台」组 `target:'todoList'` 落点（不改 bootstrap 协议）。
- **D-P3-6 单实例接口**：`GET /flows/instances/:instanceId`（404 `FLOW_INSTANCE_NOT_FOUND`）—— 详情页需按 instanceId 拿全量 `history + tasks`，`?recordId=` 批量查询不够；protocol.md §10.1 补行。
- **裁剪定案**：标准详情页（type=detail）**不支持内嵌物料插槽** —— 审批 UI 走待办中心内置详情页；自由页（form/custom）可拖审批物料；低代码详情页审批插槽留后批评估。
- **B-44（教训，本批踩坑）**：**vite `optimizeDeps` 预构建造成 `@lc/materials` 双实例** —— 页面 `import '@lc/materials'` 被打成 `/node_modules/.vite/deps/@lc_materials.js`（预构建 chunk 另建 symbol），easycom 物料组件的相对 `../keys` 走源码 `src/keys.ts` → **两条路径 symbol 不同 → provide/inject 断链**（页面报「审批宿主未注入」；**vitest 无 optimizer 不复现**，单测 8/8 全绿仍线上断链 —— 排查靠浏览器 fetch 模块 transform 源码比对 import URL 实锤）。修复：物料组件**一律改从包入口 `@lc/materials` 导入**归一（dev 两侧同进 deps chunk、vitest/生产 rollup 同归一）。**附带限制**：`packages/materials` 在 runtime dev 的 **watch 根外** —— 改物料源码需**重启 runtime dev server**（transform 缓存不失效）。

**实绩（三层 + 设计器）**

- **物料**：`ApprovalBar`（可审 = 当前节点提示 + 同意/驳回、终态 = ✓ 横幅、空态占位；按钮 **`@click` 非 `@tap`** 双端兼容）+ `Timeline`（`history` 倒序含意见）+ `keys.ts` 注入键 + `flow-utils.ts` + `BIZ_META`（业务组 META 30→32，物料 31 叶子）。
- **renderer**：`lc-renderer` provide 宿主 + `lc-node` 分发 +2（LEAF_MATERIALS 31 项锁）+ 节点 props `$expr:` 求值。
- **runtime**：`host.ts createUniHost()`（`uni.showModal({editable:true})` 意见输入 → 降级 `host.confirm`）+ `api.ts` 补 `fetchFlowInstance/fetchFlowTasks/fetchFlowTask` + 待办两页 + `pages.json` + 菜单入口 + view 页 `options.urlParams`。
- **服务端**：`GET /flows/instances/:iid` 单实例端点（`flow.controller.ts` 静态段先于 `:flowId` 声明）。
- **设计器**：物料面板「业务」组 2 项 + `MATERIAL_MAP` 映射 + demo fixture 30→32 + 属性面板 settings（recordId 默认表达式 / modelId / flowId / perm + `decided` 事件接线）+ meta-sync 联动。

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ exit 0 / `pnpm -r build` ✅ exit 0 / `pnpm -r test` ✅ **846 passed**（834 +12：renderer 214→**224**〔approval-materials 8 + lc-node 分发锁 2〕、server 135→**136**〔单实例 200/404〕、designer 281→**282**〔meta-sync +1〕；schema 87 / expression 117 不变）/ coverage ✅ **96.47/87.71/96.81/96.47** exit 0（门禁 90/85/90/90；49 文件 69.7s，B-42 `--maxWorkers=4 --minWorkers=1`；**分包实测**自 `coverage-final.json` 聚合：`flow/` **94.79/81.20**、renderer uni **95.05**/core **97.24**、designer panel **99.91**/core **99.46**）。

**冒烟与实测**：冒烟留档 **`apps/server/scripts/smoke-p3b2.mjs` 12/12 PASS**（登录 → 建流程 → 空列表 → 单实例 404 → 提交联动启动 → 待办命中 → 单实例 200 → 审批 → 记录回读 `approved` + `history=start,approve,end` → 终态再审 400）；**H5 闭环实测 DoD 全过**（登录 → 菜单入口 → leave_form 提交 → 待办命中 → 详情 ApprovalBar 当前节点 + Timeline 提交条 → 点同意 + editable 意见确定 → **「审批已通过」+ 终态横幅 + Timeline 同意（含意见）/完成** → 服务端回读 `instance.status=approved`·**`record.status=approved`（B-35）**·todo 清零 → 返回列表 onShow 刷新已办消失）；设计器实测（面板业务组 / 新建页画布 34 节点两物料**占位态零请求** / 属性面板 recordId 默认 `$expr: urlParams.rid` + decided 事件）。

**明确未做**：低代码详情页内嵌审批插槽（后批评估）；转办/加签（沿批 1 裁剪）；`materials` 改动热更（watch 根外 —— 已知限制，重启 dev 生效）；mp 真机审批链路（环境限制）；待办消息提醒（随消息批裁剪口径）。

---

### 28. Phase 3 批 3：本地草稿 + 主题配置（2026-10-19）

**核心（详设见 `phase3-plan.md` §6，决策 D-P3-7/8/9）**：

- **表单草稿 D-P3-7**：renderer `DraftStore {load/save/clear}` 进 `PageControllerOptions.draft` **可选注入**（未注入 = 禁用，画布 / list·detail 标准页 / 存量宿主 / 测试 mock 零影响；key 与存储介质归宿主、controller 只管时机）——字段变更存（**全空则 clear** 不留空草稿）、`onMount` 数据源 init **之后**恢复（`host.confirm` 二选一：确认 `patchFields` 回填 / 拒绝丢弃）、提交成功与 `reset()` 清、`load/save` 异常吞掉只上报**不阻断表单**；快照与提交 payload 同源（`fieldNames` 构造期复用）；runtime `createUniDraft(pageId)`：key = `lc_draft:${username}:${pageId}` **按用户隔离** + `{data, at}` 7 天过期静默清，view 页 onLoad 常驻注入（标准页不经 lc-renderer 无害）。
- **应用配置与主题 D-P3-8**：服务端 `<DATA_DIR>/apps.json`（D-9 风格，原子写 + 读容错）+ `GET/PUT /apps/config`（读 = 登录即可、写 = **仅 `'*'` 通配角色** 403；**patch 语义**缺键保留 / 显式 null 清除 / 未知键与非法值 400 `APP_CONFIG_INVALID`：primary `#RGB/#RRGGBBB`、radius px 串、dark 布尔）+ bootstrap 顶层下发 `theme`（无配置缺键）；runtime `applyAppTheme`——primary 经 renderer 纯函数 `deriveBrandPalette`（`core/theme-vars.ts`：parseHex/rgbToHsl/hslToHex + 十档固定目标亮度映射）覆盖 `--lc-brand-50..900`（**action/focus/link/gradient 语义变量全派生自档位 → 覆盖即全站**）+ inline 补 `--lc-action-primary`（**实测发现 dark 块曾硬编码 `#4d88f0`，inline 特异性最高两态通吃**）+ radius 覆盖 `--lc-radius-sm/md`；`App.vue onLaunch` 从 `lc_theme` 缓存恢复（bootstrap 前直达页兜底；`initTheme` 此前无调用方、本批接上）+ menu 页 bootstrap 后应用；**仅 H5 生效**（mp 无 `document` → no-op 走 tokens.rpx 静态默认）。
- **dark 优先级 D-P3-9**：配置显式 `true/false` > 系统偏好（模块级 `appDark` 让位 `initTheme` 的 change 监听），`undefined` = 跟随系统。
- **designer**：`store.view` 扩第三视图 `'theme'` + `ThemePanel`（primary 取色器 + hex 文本、radius px、dark 三态「跟随系统|强制浅|强制深」；客户端门禁红字、基线脏态才可保存）+ `themeApi`（designer-web fetch 实现与画布 `DesignerApi` 分域；类型独立 `panel/theme-types.ts`）+ 保存成功 `emit('saved')` → `applyBrandVars` **设计器自身换肤预览**（所见即所得；只联动 primary/radius，dark 由设计器独立切换管理）。

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ exit 0 / `pnpm -r build` ✅ exit 0（5 包 Done）/ `pnpm -r test` ✅ **924 passed**（六包实测：tokens 5 + schema 87 + expression 117 + renderer 259 + server 146 + designer 310；批 3 新增 **34** 用例逐例归因：renderer draft 9 + theme-vars 8、server app-config e2e 10、designer theme-panel 7；批 2 记录 846 为五包口径不含 tokens 5）。

**冒烟与实测**：冒烟留档 **`apps/server/scripts/smoke-p3b3.mjs` 12/12 PASS**（401 未登录 / 读开放 / designer 403 / 非法 hex 与未知键 400 / 完整写回传 / **GET 回读 B-35** / **bootstrap.theme B-35** / patch 缺键保留 / null 清除同步 bootstrap / 三键全清还原令牌默认）；**H5 实测 DoD 全过**：填天数+事由 → storage 落 `lc_draft:admin:leave_form` → 硬刷新 → `uni.showModal`「检测到上次未提交的草稿，是否恢复？」→ 点恢复回填一致 → 提交「提交成功」→ **草稿清** → 再刷无提示表单空；「不恢复」路径丢弃+清；主题 PUT `#e8442e/14px` → 刷新后 brand 十档派生（50=#fdefed / 500=#e8442e / 700=#a12312）+ `--lc-action-primary` 跟随 + radius 14px 生效；`dark:true` → `data-theme=dark` 深色底且 **action-primary dark 硬编码修正生效**（修复前 #4d88f0 → 修复后 #e8442e）；主题缓存 `lc_theme` 落 localStorage；**设计器实测**：顶栏「主题配置」→ 面板回填 `#e8442e / 14 / 强制深色`（三态映射）→ 基线一致禁保存 → 改 `#1fa971` + 跟随系统 → 保存「已保存 HH:mm:ss」+ **设计器自身换肤**（inline brand-500/action-primary=#1fa971）→ API 与 `apps.json` 文件回读一致、dark 键清除（**B-35 三级留档**：e2e 测试 / 冒烟 / 实测）。

**B-45（教训，本批踩坑）**：**vitest `--workspace` 聚合模式下根 `vitest.config.ts` 的 test 配置不下发到 worker** —— 测试文件 49→57 后 coverage **8 轮全中**报 `[vitest-worker]: Timeout calling "snapshotSaved"` → **exit 1 污染退出码**（测试 924 全过、阈值全过，B-38 已记「仅 exit code 被污染」同款机制）。两轮定点实证：配 `rpcTimeout: 180s` 的轮次**总时长仅 115s**、配 600s 的轮次总时长 220s，**却均报超时** → worker 实际走默认 ~10s，根配置的 rpcTimeout（及 maxWorkers）在 `--workspace` 模式下不生效；根因 = **v8 coverage 收集阻塞 main 端 RPC 应答 >10s 即触发，与并发无关**（串行轮同样触发；批 2 的 exit 0 是 49 文件下阻塞恰 <10s 的运气）。**处置（根治）**：① rpcTimeout 下沉到**各项目配置**（worker 实际持有的那份）——6 包 `vitest.config.ts` 各设 `rpcTimeout: 600_000`（schema/expression/server 此前无本地配置、单包跑随读根配置，本批补齐）；② 根 `coverage` 脚本加 `--no-file-parallelism`（另 3 轮并发测到 `Timeout calling "fetch"`——worker 拉取测试文件超时，是并发侧的第二症状）。修复后终轮实测 **57 文件 / 924 passed / 96.14·87.84·96.18·96.14 / 91.94s / exit 0**（无 Unhandled Errors）；覆盖率较旧轮 95.99 系微升 +0.15pp（串行 + 项目级配置下收集口径统一），以终轮实测为准。

**明确未做**：mp 端主题动态化（无 document）+ mp 真机草稿链路（环境无微信开发者工具）；草稿列表 / 多版本 / 离线队列（方案 7.3 二期）、save 无 debounce；主题写权限细化（现限 `'*'`，无独立权限点）、设计器主题未保存实时预览（现保存成功才换肤）；多应用各自 theme（顶层单主题，随应用实体演进）；uni H5 `showModal` 确认后 DOM 清理有延迟/残留（功能无碍，promise 正常 resolve；reload 即清）。

---

### 29. Phase 3 批 4：图表物料 + Portal 页型（2026-10-20）

**核心（详设见 `phase3-plan.md` §7，决策 D-P3-10/11）**：

- **`Chart` 一组件三形态（D-P3-10）**：`chartType: bar|line|pie` + `data / modelId+dimension+metric('count'|'sum'|'avg'|'max'|'min')+metricField+limit / title / height / showLegend`；**纯 SVG 手写不引 echarts**（R10 风控），SVG 串 → base64 data URI → `<image :src>`（uni 三端不支持裸 `<svg>` 标签）；生成逻辑下沉 `packages/materials/src/chart/chart-svg.ts` 纯函数（`aggregateSeries` / `buildChartSvg` / `toDataUri` / `formatNumber` / `RECORDS_SIZE_MAX`）零 DOM 依赖。
- **数据三通道（优先级）**：① `props.data` 静态 JSON 文本 → ② `modelId` + 维度/指标 → 经 inject `LC_FLOW_HOST_KEY.request` 拉 `GET /api/v1/models/:id/records?page=1&size=min(limit*20,100)` 后**客户端聚合**（不新增服务端聚合接口）→ ③ 空态占位（**画布零请求**，同 ApprovalBar 口径）。服务端 `MAX_SIZE=100`，取数尺寸必须收敛（见下「实测缺陷 2」）。
- **`Statistic` 指标卡**：`label / value（支持 `$expr`）/ unit / precision / trend(up|down|flat)`；`formatStatistic` 纯函数（千分位 + 非数值原样）。
- **Portal 页型（D-P3-11）**：协议 `PortalPageConfig { title?, columns?, cards }` + `PortalCard { title, desc?, icon?, pageId?, url?, badge? }` + `PageSchema.portal?`；portal = **卡片导航（配置）+ `root` 拖拽区（图表/KPI）混合页**，`portal` 与 `cards` 均可缺省（纯拖拽门户合法），给 cards 时逐条校验 `title`（`E_REQUIRED` `portal.cards[i].title`）；**不进 `isStdPage`**（list/detail 才占位）。
- **分层**：schema（types + 软校验 + 导出）｜materials（chart/ + statistic/ + meta data 组 order 4/5）｜renderer（`lc-node.vue` +2 分发、新建 `lc-portal-page.vue`）｜runtime（`view/index.vue` 三态分发 + `onOpenUrl` + pages.json easycom）｜designer（`schema-ops.updatePortalConfig`/`setPageType`、`store.setPortalConfig`、`PropsPanel` 门户区块、物料图标）｜designer-web（门户页提示条）。

**测试与门禁（B-19）**：`pnpm -r typecheck` ✅ exit 0（7 包）/ `pnpm -r build` ✅ exit 0（5 包 Done）/ `pnpm -r test` ✅ **965 passed**（tokens 5 + expression 117 + schema 90 + renderer **289**〔20 文件〕 + server 146 + designer 318；批 4 新增 **41**：schema +3〔portal 校验〕、renderer +30〔chart-materials 21 / lc-portal-page 5 / lc-node 分发锁 2 / **uni-exports 2**〕、designer +8〔页型切换 + 门户配置面板〕）/ coverage ✅ **96.23 / 87.87 / 95.99 / 96.23** exit 0（60 文件 / 965 passed / 59.53s；门禁 90/85/90/90；B-42 `--no-file-parallelism --maxWorkers=4`）。

**冒烟**：`apps/server/scripts/smoke-p3b4.mjs` **13/13 PASS**、exit 0 —— 登录 → 合法 portal PUT 200 + `validation.valid` → draft 回读（`type=portal` / cards 3 / columns 2 / Chart×3 三形态 / Statistic×1 / 聚合参数保留，**B-35**）→ 卡片空标题 → **400 `SCHEMA_INVALID` 且 `errors[].path = portal.cards[0].title`** → 复原合法页（冒烟不留脏状态）。

**H5 实测 DoD 全过**（`http://127.0.0.1:5173/#/pages/view/index?pageId=pgc_demo`，种子 `apps/server/scripts/seed-pgc-demo.json`）：门户标题「运营工作台」+ 3 卡（请假申请 badge 3 / 员工列表 / 帮助中心）→ **点「请假申请」跳 `?pageId=leave_form` 表单页** ✓；柱/折/饼三图均 `<image>` 渲染 data URI（SVG 内含「技术部/运营部/（空）」聚合标签）+ 饼图**静态图例**「运营部 1 / 技术部 1 /（空）1」+ 指标卡「员工总数 3 人 ↑」；**无多余空态文案、无 `uni.async.error`**。

**设计器实测**：`pageId=pgc_demo` 打开 → 页型下拉 `portal` + 顶部门户提示条；属性面板门户区块回填 title=运营工作台 / columns=2 / 3 卡（请假申请→`leave_form`、员工列表→`p_emp_list`、帮助中心→url）✓；画布渲染 3 个 Chart（**空态「图表（无匹配数据）」= 零请求**）与 Statistic「员工总数 3 人 ↑」✓；物料面板「图表 / 指标卡」两项可见。

**实测揪出并修复的 4 个真实缺陷（均补回归锁）**：

1. **`@lc/renderer` `exports` 漏子路径** → easycom 解析 `Missing "./uni/lc-portal-page.vue" specifier in "@lc/renderer" package`，H5 只显示「连接服务器超时」假象；补 `exports` + 新增 `test/uni-exports.test.ts`（2 例：`src/uni/*.vue` ↔ `exports` 双向一致，防再犯）。
2. **取数尺寸越界**：`size = limit×20 = 160` 超服务端 `MAX_SIZE=100` → 400 → 图表永远空态；改 `Math.min(limit*20, RECORDS_SIZE_MAX=100)`。
3. **饼图无任何标签**（SVG 内仅色块，无法识别部门）→ 补 **静态图例**（uni 文本，非 SVG：可测、可选中、不依赖图片像素）+ 3 例测试；交互式图例/tooltip 仍属 §7.4 未做。
4. **`v-if` 链被新增节点打断**：图例 `v-if` 插在 image 与空态之间成为新链头 → 柱/折同时渲染「图片 + 空态提示」（**图文并存**）；空态改独立条件（`!dataUri && loading` / `v-else-if="!dataUri"`）+ 1 例回归锁「有图时不渲染空态提示」。

**B-46（教训，本批踩坑）**：`lc-node.test.ts` 只注册 12 个物料 stub，而 `lc-node.vue` 引用 33 个 → 每次渲染刷 21 条 `[Vue warn] Failed to resolve component` → **stdout 回压阻塞 main** → `snapshotSaved` RPC 超时（默认 60s）→ renderer 套件 **150s / exit 1**；补全 `LEAF_KEBABS` 全集 stub 后 **2.28s / exit 0**（同轮 `*> $null` 亦 42s/exit 0，证实与日志洪泛强相关）。**顺带勘误 B-45**：vitest **2.1.9 不存在 `rpcTimeout` 选项**（全包 grep 0 命中；birpc `DEFAULT_TIMEOUT = 6e4`）——各包配置里的 `rpcTimeout: 600_000` 属惰性配置，真正解法是**消除日志洪泛 + 根脚本 `--no-file-parallelism`**；本批 coverage 59.53s/exit 0 可作对照。

**B-47（教训）**：改 `@lc/materials` 源码后**仅重启 runtime dev server 不够** —— Vite 依赖预打包缓存（`packages/runtime/node_modules/.vite`）的 `?v=hash` 不变，浏览器仍加载旧模块（表现为「代码改了、H5 没变」）；处置 = 删 `.vite` 再启动。**B-48**：uni-app 异步分块失败时 H5 只显示 `uni.async.error`「连接服务器超时，点击屏幕重试」，易误判为接口超时 —— 应先用 `import('/src/pages/xxx/index.vue')` 抓真实报错（本次据此定位到 exports 缺失）。

**明确未做**：图表交互（tooltip / 图例点击 / 动画）、更多图型（散点/雷达/漏斗，R10 只做 3 种）、服务端聚合接口（现为客户端聚合，数据量大时演进）、图表走 `dataSources[]` 声明式取数、portal 卡片拖拽排序 / 富卡片模板 / 角标自动取数、portal 与 `AppMenuItem(type:'portal')` 强绑定；**mp 真机未验**（SVG data URI 兼容性属环境受限项）。

---

### 30. Phase 3 批 5：埋点与错误上报 + Schema Profiler（2026-10-20）

**核心（详设见 `phase3-plan.md` §8，决策 D-P3-12/13/14）**：

- **D-P3-12 服务端 ops 模块**：`<DATA_DIR>/ops/events.json` 单文件 `{version:1,events:[]}` 原子写（临时文件 + rename），**环形上限 500**（超出丢最旧并计入 `dropped`）；`OpsEvent { id,type:error|perf|event,name,pageId?,pageVersion?,source,userId?,message?,durationMs?,detail?,at }`；三接口 —— `POST /ops/events`（**登录即可**，1~50 条，返回 `{accepted,total,dropped}`）、`GET /ops/events`（**仅 `'*'`**，type/pageId/since/limit，新→旧，limit 默认 50 上限 200）、`GET /ops/summary`（**仅 `'*'`**，`{total,byType,errors:{total,lastAt},perf:{count,avgMs,p95Ms,maxMs},lastAt}`）；**写开放读收紧** + `userId/at` 服务端覆盖防冒充；**结构错 400 `OPS_INVALID`（消息带 `events[i]` 下标），数据性超限只截断**（message >500 → `…`；detail 序列化 >2000 → `{truncated,preview}`）—— 埋点不得反噬业务。
- **D-P3-13 客户端上报 + 不白屏**：纯逻辑队列下沉 `@lc/renderer` `core/ops.ts` `createOpsQueue`（注入 `send`；批量 10 / 2s 定时 / 失败保留本批 / 超 50 丢最旧 / `dispose` 清定时器 / `push` 不抛）；runtime `src/ops.ts` `createUniOpsReporter` 用 `uni.request` 带 token 发送、`meta` 对象**引用共享**（Schema 到手前即可创建，加载失败也留现场，版本号后补）；view 页接线 5 类事件 —— `onExprError→expr`、`onLoopOverflow→loop-overflow`、`onActionResult(!ok)→action`、`onUnsupported→unsupported-action`、Schema 加载失败→`schema-load`，`onHide/onUnload` flush；**不白屏**沿用 renderer 既有 `exprError` 兜底 + `skipped` 跳节点（坏表达式节点空值降级，同页其余节点照常渲染）。
- **D-P3-14 Profiler 双端可见**：`PageController.stats` 自计时/计数（`buildMs/mountMs/resolveMs/nodeCount/exprErrors/loopOverflows/skipped`，返回副本，**对外回调语义不变**）+ `core/perf.ts` 共享 `formatPerf/roundMs/countNodes`；runtime `?perf=1` 显示右下角只读角标并上报 `schema-load`/`render` 两条 perf（detail 带 nodes/buildMs/mountMs）；设计器顶栏**常驻**徽标（`store.perf` + `LcCanvas` `rendered` 事件回填），hover title 看采样 JSON；设计器**不上报服务端**（避免开发期噪声）。

**验证与 DoD（实测）**：

- 四连：typecheck ✅ 7 包 / build ✅ 5 包 / test ✅ **1006 passed**（renderer 309 + server 161 + designer 324 + schema 90 + expression 117 + tokens 5）/ coverage ✅ **96.17/87.84/95.83/96.17** exit 0（65 文件 52.4s）。
- 冒烟 ✅ `smoke-p3b5.mjs` **23/23 PASS**（上报→回读补字段→summary 分位→designer 403→校验 400→失败不落库；时间戳 pageId 可重复执行）。
- **DoD ①「表达式失败不白屏 + 服务端查到错误事件」**：页面 `pgc_ops_bad`（正常文本 + `$expr: formData.x +`）H5 实测 —— 「正常节点可见」仍渲染；`GET /ops/events` 查到 2 条 `expr`（`nodeId=t_bad`、消息「意外的表达式结束（13 列）」）。
- **DoD ②「加载耗时指标可见（接口回读）」**：H5 角标 `加载 91ms · 构建 2ms · 渲染 40ms · 3 节点`；`GET /ops/summary?pageId=pgc_ops_bad` 返回 `perf {count:2,avgMs:48,p95Ms:69,maxMs:69}`；门户回归 `pgc_demo&perf=1` 三卡 + 三图 + 图例 + 指标卡全在（`加载 172ms · 渲染 95ms · 5 节点`），去掉参数角标不渲染。
- 设计器实测：顶栏 `加载 331ms · 渲染 73ms · 34 节点`，title 内含 `{"schemaMs":331,"nodes":34,"renderMs":72.7}`。
- **实现中修**：首帧采样时异步 `onMount` 未结束 → `mountMs=0` 误显示「挂载 0ms」→ runtime 把 0 视为未采到（省略该项）。

**B-43 规范复用**：ops 控制器/服务构造注入一律显式 `@Inject`（vitest 不 emit decorator metadata），新测试 15 例一次通过。

**明确未做**：事件表无索引/全文检索/分片（500 条环形，二期换 OTel/Sentry）；前端队列**不持久化**（强杀/断网会丢，二期落 storage）；设计器 perf 不上报（`source='designer'` 协议预留）；Vue 组件内部抛错未接 `app.config.errorHandler`（三端行为不一致，留 Phase 4）；Profiler 无内存/帧率/长任务；mp 真机未验。

---

### 31. 修复台账收口：页面列表/删除接入设计器（2026-10-20）

**背景**：Phase 3 收口后的独立核查发现 `design:check` 红灯 + 「数据目录已有 10 页但无接口枚举/删除」；修复台账 `docs/remediation-plan-2026-10-20.md` 冻结 A1/A2/B1/B2 四项。A1/A2/B1 已先行完成，本轮完成 **B2** 并全量复验。

**B2 实现（设计器消费端）**：

- **API**：`DesignerApi.listPages()` 从复用 `/apps/bootstrap` 改为 `GET /pages`（裸 `PageSummary[]`，含 `type/status/currentVersion/updatedAt`）；新增 `deletePage(pageId)` → `DELETE /pages/:id`，返回 `{removedVersions}`。
- **store**：导出 `pages/pagesError/pagesLoading/pagesLoaded` 与 `loadPages(force)`（成功置 loaded 并短路重复请求；失败保留旧列表 + 写错误）+ `deletePage(id)`（删非当前页只移列表；删当前页自动打开剩余第一页；删最后一页落新草稿；**下一页打不开时也落新草稿**，避免已删页 schema 被再次 upsert）。
- **顶栏 UI**：页面下拉（`name（id）`，选中即打开）+「删除」两步确认（10s 未确认自动复位，不用原生 `confirm`）+ pageId 输入框 `datalist` 候选；保存/发布成功刷新列表；`<1024px` 隐藏重复的页面/性能徽标，消除顶栏横向溢出。
- **测试**：新增 `packages/designer/test/page-list.test.ts` **11 例**（加载成功/失败/未注入/短路/force/空列表；删非当前/当前/最后/打开失败回落/服务端失败/宿主无删除能力/未注入）。

**验证（2026-10-20 14:46 实测）**：

- 全量门禁：`typecheck` ✅ 7 包 / `design:check` ✅ exit 0 / `build` ✅ 5 包（designer-web 1,233.98 kB、gzip 400.09 kB）/ `test` ✅ **1032 passed / 67 文件**（designer 324→335）/ `coverage` ✅ **96.17/87.96/95.87/96.17** exit 0（78.18s）。
- 浏览器 DoD（server :3000 + designer-web :5174）：下拉列出 10 页 → 选临时页 `p_b2_smoke_1792478344` 打开（输入框/状态同步）→ 第一次删除变「确认删除」危险态 → 第二次删除成功并自动切到 `pgc_ops_bad`，状态「已删除 …（含 0 个历史版本），已切换到 pgc_ops_bad」→ 服务端 `GET /pages` 回查临时页 0 残留、现有 10 页未动 → console 0 error。验证后已停止两个 dev 进程（B-42）。

**本轮未做（8 项挂账，见 remediation §6）**：`git init`/CI 首次实跑、小程序真机、换数据库、乐观锁、JWT/CORS/限流、用户体系落库、5 个复杂 setter、图表跟随主题。**一项都未开始**，不得默认为可用。

---

### 32. Phase 4 数据库：MySQL 8 + Prisma 两批落库（2026-10-21）

**第一批（ADR-008）**：`users / roles / user_roles / pages / page_versions / models / data_records / rbac_page_grants` 共 8 表；5 个 MySQL 仓储 + `StorageModule` 条件注入；`LC_STORAGE=json` 保留为默认/测试路径。

**第二批（ADR-009，本轮）**：

- **4 张新表**：`flow_definitions`（`flowId` 主键 + `schemaJson`）、`flow_instances`（`tasksJson/historyJson`）、`ops_events`（`detailJson` + 自增 `seq`）、`app_config`（单行 `id='default'` + `theme`）。
- **流程定义/实例分表且不建外键**：删除定义只删定义，实例保留审计；`MysqlFlowRepository` 覆盖定义 CRUD / 实例 upsert / 列表。
- **运维事件**：`MysqlOpsRepository` 改为事务内追加 + 按 `seq` 淘汰超出 500 条的最旧行，不再整表 delete + create；JSON 实现用单进程写队列串行化读改写。`seq` 继续保证同毫秒事件顺序。
- **应用配置**：抽出 `AppConfigRepository` + `FileAppConfigRepository` / `MysqlAppConfigRepository`；`AppConfigService` 从同步 fs 改为仓储注入，`GET/PUT /apps/config` 契约不变。
- **装配**：`FlowModule / OpsModule` 不再本地 new 文件仓储，统一由全局 `StorageModule` 按 `LC_STORAGE` 注入；JSON 路径继续可用。
- **迁移与导入**：新增 `20261021150000_flows_ops_appconfig`（已应用到 `lowcode` + `lowcode_test`）；`import-json-to-mysql.mjs` 扩展导入 flows / instances / ops / apps，实测 `flows=1, instances=6, ops=19, appConfig=yes`。
- **测试隔离加固**：实测发现 Vitest 自动加载 `.env` 会覆盖 `test.env`，普通 e2e 曾把测试页写进开发库；新增 `test/setup-json-storage.ts` 在模块导入前强制 `LC_STORAGE=json` 并删除 `DATABASE_URL`。修复后复跑 server 测试，开发库计数保持不变。
- **验证**：`mysql.persistence.test.ts` 7/7 PASS（流程/实例/运维/配置仓储）；`smoke-mysql.mjs` 9/9 PASS（新增 flow_definitions、flow_instances、ops_events、app_config 回读）；开发库回读 `pages=10 / models=3 / records=24 / flows=1 / instances=6 / ops=19 / app_config=1`。

**明确未做**：~~上传文件与文件元数据落库~~ → ✅ **已于「已实现 34」完成（2026-10-22，`files` 表）**；~~页面/记录乐观锁~~ → ✅ **已于「已实现 35」完成（2026-10-22，含流程审批幂等）**；多实例严格 500 条上限（当前各事务按快照裁剪，可能瞬时略超）；多实例 Redis 限流；安全审计/账号锁定/JWT 轮换；CI 实跑 MySQL；小程序真机。

---

### 33. 运维事件追加写入：去掉整表覆盖（2026-10-21）

**背景**：MySQL 第二批仍沿用 `OpsRepository.save(events)` 整表契约，service 先 `list` 合并再 `save`，并发上报时后写覆盖先写；JSON 文件实现同样存在读改写竞态。

**实现**：

- 契约改为 `append(events, limit): Promise<{ total, dropped }>`，service 不再先读整表；`POST /ops/events` 的 `{ accepted, total, dropped }` 形状不变。
- `MysqlOpsRepository.append`：事务内先 `createMany`，再按自增 `seq` 升序找出超出 `limit` 的最旧行并 `deleteMany`；查询仍按 `seq` 正序，同毫秒顺序稳定。
- `FileOpsRepository.append`：单进程 Promise 写队列串行化「读 → 合并 → 裁剪 → tmp + rename」，并发 append 不丢事件；环形上限 500、单批 50 不变。
- 新增 `test/ops-repository.test.ts` 2 例：10×10 并发 append 不丢；`limit=2` 淘汰最旧并返回 `dropped`。`mysql.persistence.test.ts` 补充裁剪与 10 条并发 append 回读。

**验证（2026-10-21 实测）**：

- `pnpm -r typecheck` ✅ 7 包 exit 0；`pnpm design:check` ✅ exit 0；`pnpm -r build` ✅ 5 包 exit 0。
- `pnpm -r test` ✅ **1070 passed + 7 skipped / 71 文件**（70 通过 + 1 跳过；server 214 passed + 7 skipped / 13 文件）。
- `pnpm coverage` ✅ **92.4 / 87.83 / 90.75 / 92.4** exit 0（74.53s）。
- MySQL 仓储集成 ✅ **7/7 PASS**（含裁剪/并发）；MySQL 真启动冒烟 ✅ **9/9 PASS**。

**明确未做**：多实例同时 append/裁剪仍可能因各事务快照瞬时略超 500 条，下一次上报收敛；若要求严格上限，需单写队列或 Redis 协调。JSON 模式跨进程写仍非原子。

---

### 34. 文件元数据与内容落 MySQL（第三批，2026-10-22）

**背景**：文件仍按 `<DATA_DIR>/files/<id>` + `files-meta/<id>.json` 双文件保存：字节成功、元信息失败会留下半状态；跨机部署要额外共享盘；备份要 SQL + 文件目录两份。第三批把元数据与内容统一进 MySQL。

**实现**：

- **第 13 张表 `files`**：`id`（uuid + 白名单扩展名）、`originalName`（TEXT）、`mimeType`、`size`、`uploadedAt`、`uploadedBy`、`content`（`LONGBLOB`）；`uploadedAt` 建索引。元数据与内容同一行，上传天然原子。
- **仓储抽象**：新增 `FileRepository`（`save(StoredFile)` / `find(id)`）与 `FILE_REPOSITORY` token；`DiskFileRepository` 原样保留旧目录布局及「元信息缺失降级、损坏 500」语义；`MysqlFileRepository` 用 `upsert` 写单行，读取回填 ISO 时间与 `Buffer`。
- **服务层零契约变化**：`FileService` 只保留文件名 basename 化、扩展名白名单、10MB 上限、`fileId` 生成与 404 判断；`StorageModule` 按 `LC_STORAGE` 注入磁盘或 MySQL 实现，`FileModule` 不再直接依赖 fs。
- **存量迁移**：`import-json-to-mysql.mjs` 增加 `files/<id>` + `files-meta/<id>.json` 导入，元信息缺失时按运行时语义降级；开发库已补录 8 个历史文件。
- **迁移**：新增 `20261022000000_files`，已应用到开发库 `lowcode` 与测试库 `lowcode_test`。

**验证（2026-10-22 实测）**：

- `pnpm -r typecheck` ✅ 7 包 exit 0；`pnpm design:check` ✅ 42 组达标 / 0 缺口 / 0 退化；`pnpm -r build` ✅ 5 包 exit 0。
- `pnpm -r test` ✅ **1070 passed + 8 skipped / 71 文件**（server 214 passed + 8 skipped / 13 文件；MySQL 文件用例无连接时按设计跳过）。
- `pnpm coverage` ✅ **92.15 / 87.81 / 90.37 / 92.15** exit 0（门禁 90/85/90/90）。
- MySQL 仓储集成 ✅ **8/8 PASS**（新增文件元数据、二进制字节、同 id 覆盖、缺失返回 null）；MySQL 真启动冒烟 ✅ **10/10 PASS**（HTTP 上传 → Prisma 回读 `files` → HTTP 下载字节一致）。
- 存量导入实测：临时目录 `files=1` 回读通过；开发库 `files=8`，其余计数保持 `pages=10 / page_versions=27 / models=3 / records=24 / flows=1 / instances=6 / ops=19 / app_config=1 / users=2 / roles=2 / grants=0`。

**明确未做**：对象存储/CDN/Range 下载；大于 10MB 的附件；文件列表/删除/回收站接口；文件哈希去重；上传病毒扫描与下载鉴权（公开只读语义未变）；MySQL 模式不自动双读旧磁盘文件，切换前需执行导入脚本。

---

### 35. Phase 4 · 并发控制 + 流程事务/幂等（2026-10-22）

**背景**：此前所有写接口都是「读 → 修改 → 整行覆盖」。两个设计器标签页同时保存会互相覆盖；两个客户端同时改同一记录会丢更新；两人同时审批同一任务会重复推进、重复写历史；审批结束回写业务记录与实例状态分属不同仓储，没有跨表事务；网络超时重试最后一次审批可能收到「流程已结束」，客户端无法判断是否成功。

**实现（ADR-011）**：

- **行级 `revision` + ETag**：`pages`、`data_records`、`flow_instances` 均增加 `revision`（默认 0，成功写 +1）。GET/写响应回带 `revision`；页面/记录设置 `ETag: "<kind>:<id>:<revision>"`，写接口接受可选 `If-Match`。不携带仍兼容，但服务端仍以请求内读到的 revision 做 CAS，避免读改写窗口丢更新；不匹配 `409 VERSION_CONFLICT`（附 `expectedRevision` / `currentRevision`），格式非法 `400 INVALID_IF_MATCH`。
- **双存储 CAS**：JSON 仓储用新增 `KeyedLock` 按资源串行化「读→判版本→写」（单进程保证）；MySQL 仓储用 `UPDATE ... WHERE revision = ?` 行级 CAS（多实例安全）。页面行 + 版本行仍在一个事务内替换，冲突整事务回滚；并发创建同 id 由唯一键兜底为冲突。
- **页面**：`saveDraft` / `publish` / `rollback` 全部接 `If-Match`；GET、PUT、publish、rollback 均返回新 ETag。设计器 `pageRevision` 贯穿 `getSchema/saveSchema/publish/rollback`，`designer-web` 统一发送 `If-Match`。
- **记录**：`create` 初始化 revision 0 并返回 ETag；`update` / `remove` 接 `If-Match` 与 CAS，响应含新 revision；列表每项带 revision，且 `revision` 可作为 filter/sort 系统字段。本批先交付服务端能力，前端编辑入口见「已实现 36」。
- **审批幂等**：`POST /flows/instances/:iid/tasks/:tid` 接受 `Idempotency-Key`（1~128 字符，作用域=单实例）。首次成功把 key/动作/意见/审批人写入任务；同内容重放直接返回当前实例，不重复推进/历史/回写；同键改任务或改动作/意见/审批人返回 `409 IDEMPOTENCY_KEY_REUSED`。终态重放判断在 `FLOW_NOT_RUNNING` 之前，网络重试不误报。待办审批物料在同一动作重试时复用键（动作或意见变化才换键）。
- **流程 outbox**：实例新增 `pendingPatch`。审批到 `end` 时先 CAS 实例并写入 outbox，再 CAS 回写记录，最后清空 outbox；记录冲突则重读重试，进程中断由后续 GET 实例 / 列表 / 审批补偿。语义为至少一次回写，`setField` 幂等；短暂「实例已通过、记录字段未更新」窗口会收敛。
- **迁移**：新增 `20261022160000_optimistic_locking`，已应用到 `lowcode` 与 `lowcode_test`；`information_schema` 回读两库的 `revision`（int / NO / default 0）与 `pendingPatchJson`（json / YES / null）均存在。
- **测试**：`concurrency.test.ts` 11 例（页面/记录 ETag 409、非法 If-Match、并发写、审批幂等/终态重放、同键改动作/意见 409、并发审批、revision 过滤）；`mysql.repositories.test.ts` 14 例（无数据库覆盖 MySQL 仓储映射/CAS 分支，保证 CI 覆盖率口径）；`mysql.persistence.test.ts` 扩到 9 例（真实 MySQL CAS / pendingPatch 回读）。

**验证（2026-10-22 实测）**：

- `pnpm -r typecheck` ✅ **7 个包全部 Done**；`pnpm design:check` ✅ exit 0。
- `pnpm -r build` ✅ **5 个包 Done**（designer-web 1,238.04 kB / gzip 401.55 kB，仍有 >500 kB 单包提示）。
- `pnpm -r test` ✅ **1105 passed / 73 文件**（tokens 5 + schema 90 + expression 117 + renderer 309 + designer 336 + server 248；MySQL 集成在设置 `LC_TEST_DATABASE_URL` 时全跑）。
- `pnpm coverage` ✅ **95.74 / 86.59 / 95.98 / 95.74** exit 0（门禁 90/85/90/90；72 文件通过 + 1 跳过，1096 passed + 9 skipped，67.59s）。
- MySQL 集成 ✅ **9/9 PASS**；迁移在两库的应用与列回读见上。
- 设计器 ✅ **25 文件 / 336 用例**；新增 `pageRevision` 回填与 save/publish 透传用例。

**明确未做**：~~记录更新/删除的前端编辑入口~~（2026-10-22 已由「已实现 36」补齐）；JSON 模式多进程/多副本并发（仅单进程锁，多副本必须 `LC_STORAGE=mysql`）；Redis 分布式锁/限流；审批自动重试中间件（幂等键由调用方在同一次用户动作内复用）；流程定义 ETag/If-Match（定义冲突不在本批范围）；`pendingPatch` 为至少一次回写，不是强一致事务。

---

### 36. Phase 4 · 业务记录前端编辑/删除入口（2026-10-22）

**背景**：ADR-011 已为 `PUT/DELETE /models/:modelId/records/:rid` 加上 `revision` CAS 与 `If-Match`，但移动端标准详情页仍然只读。业务人员无法修改/删除记录，乐观锁能力落不了地；若直接开放写入口而不回传版本，又会把「后写覆盖先写」重新引回来。

**实现**：

- **Schema（向后兼容）**：`DetailPageConfig` 新增可选 `editable?: boolean`、`deletable?: boolean`，缺省 `false`；存量详情页保持只读，必须显式开启。设计器详情配置区新增「允许编辑 / 允许删除」复选框。
- **编辑器**：新增 `packages/renderer/src/uni/lc-record-editor.vue`。只编辑 `detail.fields`（缺省模型全部字段）中非 `readonly` / 非 `auto` 的字段；PUT 为部分合并，未展示字段保持服务端原值。控件保持轻量且不反向依赖 materials：`boolean → switch`、`enum → picker`、`text/json/location/file → textarea`、其余 `input`。
- **纯逻辑**：新增 `core/record-edit.ts`：`recordEtag(modelId, recordId, revision)` 与 `parseRecordFieldValue()`（数字/布尔/JSON/文件/枚举转换）。导出口 44 → 47。
- **详情页写链路**：保存 `PUT`、删除 `DELETE` 均从记录响应体 `revision` 构造 `If-Match: "record:<modelId>/<recordId>:<rev>"`（uni 宿主层不暴露响应头）。删除先 `host.confirm` 二次确认；成功 emit `saved` / `deleted`，删除后返回。
- **冲突与错误**：`409 VERSION_CONFLICT` **不自动覆盖、不自动重试**，保留草稿并显示「本次未生效 + 服务端当前版本」，只提供「重新加载」（会放弃本地草稿）出口；`400 RECORD_INVALID` 把 `errors[].path/message` 映射到字段级错误；401 上抛登录，403/404/网络错误就地提示。客户端在发请求前拦截必填空值、非法数字与非法 JSON。
- **宿主契约**：`HttpRequest.method` 扩展为 `GET | POST | PUT | PATCH | DELETE`，runtime 的 `uni.request` 直接透传。
- **列表刷新**：runtime 标准列表页在从详情返回的 `onShow` 用递增 key 重挂载，避免编辑/删除后列表仍显示旧行。
- **测试**：`test/record-edit.test.ts` 9 例（ETag 格式/非法 revision、各类字段转换、缺 name/options 的降级）；`test/uni/lc-record-edit.test.ts` 9 例（只读默认、模型加载失败拒绝编辑、保存 If-Match、取消、400 字段错误、客户端拦截、409 不覆盖 + 重新加载、删除确认/取消、删除 409）；设计器 `std-page.test.ts` 补开关用例。

**验证（2026-10-22 实测）**：

- `pnpm -r test`（设置 `LC_TEST_DATABASE_URL` 指向 `lowcode_test`）：**6 项目 / 75 文件 / 1123 用例全部通过**；renderer 25 文件 / 327 例、designer 25 / 336、server 15 / 248（MySQL 仓储 14 + 持久化 9 实跑）、schema 6 / 90、expression 3 / 117、tokens 1 / 5。
- `pnpm coverage`（CI 口径，不设 MySQL 环境变量）：**74 文件通过 + 1 跳过；1114 通过 / 9 跳过（共 1123）**；statements **95.58%**、branches **86.33%**、functions **95.67%**、lines **95.58%**（阈值 90 / 85 / 90 / 90）；新增 `record-edit.ts` 为 100 / 100 / 100 / 100。
- `pnpm -r build` ✅ 5 包 Done；`designer-web` 1,238.94 kB（gzip 401.82 kB）。
- `pnpm -r typecheck` ✅ 7 包 Done。
- `pnpm design:check` ✅（tokens / color / dimensions / rpx / contrast 全过）。
- `pnpm --filter @lc/runtime build:h5` ✅ `DONE Build complete.`（覆盖新增 `<picker>`、PUT/DELETE 透传与 `onShow` 刷新接线）。

**明确未做**：~~列表行内编辑/批量删除~~（2026-10-22 已由「已实现 37」补齐）；关系/用户/部门/文件的专用选择器（当前关系/用户/部门为文本输入，文件为多 id 文本）；多标签页编辑同一记录的实时协同；编辑草稿持久化（离开页面即丢弃）；记录编辑的独立权限点（仍由模型 RBAC + 服务端 403 兜底）。

---

### 37. Phase 4 · 标准列表页行内编辑 + 批量删除（2026-10-22）

**背景**：详情页写入口已落地，但企业最高频的「列表内改一条、勾几条批量删」仍要逐条进详情，移动端操作成本高。列表直接开放写操作必须解决三件事：列表行字段不全（不能拿列表行直接覆盖）、每行版本必须随行回传（否则批量删除会覆盖他人修改）、部分失败/版本冲突不能让用户丢掉选择或误以为全部成功。

**实现**：

- **Schema（向后兼容）**：`ListPageConfig` 新增可选 `editable?: boolean`、`deletable?: boolean`，缺省 `false`；设计器列表配置区新增「行内编辑 / 批量删除」复选框，未勾选写 `undefined`（保持协议缺省只读）。
- **行内编辑**：`list.editable` 为 true 时每行显示「编辑」。点击先 `GET records?filter={"id":rid}&size=1` 拉最新单条（补齐列表未展示字段与服务端当前 `revision`），再复用 `lc-record-editor` 展开；编辑字段 = `list.columns`（缺省模型全部字段），保存 `PUT` 部分合并 + `If-Match: "record:<modelId>/<rid>:<revision>"`。成功后用服务端返回记录替换当前行并关闭编辑器；编辑态禁止行跳转，行操作区/编辑器均 `@tap.stop`。
- **冲突与校验**：409 `VERSION_CONFLICT` 保留草稿与编辑器，提示「本次保存未生效（服务端当前版本 N）」，只给「重新加载」出口；重新加载拉最新记录并用 `editEpoch` 强制重挂载编辑器（丢弃旧草稿，不自动合并）。400 `RECORD_INVALID` 把 `errors[].path/message` 映射到字段级错误；401 上抛登录，403/404/网络错误就地提示。
- **批量删除**：`list.deletable` 为 true 时显示自定义勾选框、当前可见行全选与批量删除。二次确认后按选择顺序**逐条串行** `DELETE`，每条都用该行 `revision` 构造 `If-Match`；409 保留该行且不自动重试，404 视为已删除；成功后本地移除并递减 `total`，删空当前页但仍有数据时自动回第一页，避免误显示空态。
- **选择安全**：全选只作用于当前可见行；搜索条件变化时清理已不可见行的选择；刷新后只保留仍存在的选择。部分失败/冲突时保留未删行与选择，提供「刷新」拉最新 revision 后重试；不把失败伪装成成功。
- **测试**：renderer `test/uni/lc-pages.test.ts` **29 例**（新增 8 例：默认关闭、行内编辑全链路、只编辑 columns、409 重挂载后新 revision、400 字段错误、批量删除成功自动回页、批量 409 保留选择并刷新重试、全选/搜索清理）；designer `test/std-page.test.ts` **23 例**（补写操作开关默认值与 `undefined` 回写）。

**验证（2026-10-22 实测）**：

- `pnpm -r test`（设置 `LC_TEST_DATABASE_URL` 指向 `lowcode_test`）：**6 项目 / 75 文件 / 1131 用例全部通过**；renderer 25 文件 / 335 例、designer 25 / 336、server 15 / 248、schema 6 / 90、expression 3 / 117、tokens 1 / 5。
- `pnpm coverage`（CI 口径，不设 MySQL 环境变量）：**74 文件通过 + 1 跳过；1122 通过 / 9 跳过（共 1131）**；statements **95.17%**、branches **85.85%**、functions **95.63%**、lines **95.17%**（阈值 90 / 85 / 90 / 90）；`lc-list-page.vue` 行覆盖 **86.76%**、分支 **72.19%**。
- `pnpm -r build` ✅ 5 包 Done；`designer-web` 1,239.95 kB（gzip 402.09 kB，仅既有 >500 kB chunk 告警）。
- `pnpm -r typecheck` ✅ 7 包 Done。
- `pnpm design:check` ✅（tokens / color / dimensions / rpx / contrast 全过）。
- `pnpm --filter @lc/runtime build:h5` ✅ `DONE Build complete.`。

**明确未做**：独立的行编辑/删除权限点（仍由模型 RBAC + 服务端 403 兜底）；批量删除的并发/事务化（当前串行逐条，部分失败可重试，不是原子批量）；跨页全选（只对当前可见行）；关系/用户/部门/文件专用选择器；列表编辑草稿持久化与多标签页实时协同。

---

### 38. Phase 4 · OpenAPI 3.1 文档（2026-10-22）

**背景**：外部系统接入目前只能读 `protocol.md` 手工拼请求，接口一多就容易抄错；同时若用 Swagger 装饰器自动生成，又会把文档绑到 Nest 运行时和额外依赖上。本批选择「**显式声明 + 路由反射测试防漂移**」：文档是零依赖的纯数据，测试用 Nest 的 `PATH_METADATA` / `METHOD_METADATA` 反射实际 controller，少一条或多一条路由都会直接失败。

**实现**：

- **文档构建器**：新增 `apps/server/src/open/openapi.ts`，输出 OpenAPI **3.1.0**；`servers = [{ url: '/api/v1' }]`，`paths` 不含全局前缀；顶层 `security: [{ bearerAuth: [] }]`，5 个公共接口显式 `security: []`。
- **覆盖 39 条实际路由**：System 3、Auth 2、Apps 3、Pages 8、Models 3、Records 4、Files 2、Flows 8、RBAC 3、Ops 3；每个 operation 含唯一 `operationId`、中文 `summary`、`tags`、成功/错误响应与路径参数。页面/记录写接口标注 `If-Match` 与 409；审批接口标注 `Idempotency-Key`；文件上传标注 multipart；错误体统一 `Error` + `Issue`。
- **端点**：新增 `GET /api/v1/openapi.json`（`open.controller.ts` / `open.module.ts`，注册进 `AppModule`）。**公开只读**，不需要 JWT，但仍计入普通限流；响应 `Cache-Control: public, max-age=300`，全局 `X-Request-Id` 照常带。
- **零新依赖**：不引入 `@nestjs/swagger` / Swagger UI；文档可导入 Swagger UI、Apifox、Postman、OpenAPI Generator。
- **契约测试**：新增 `apps/server/test/openapi.test.ts`（8 例）——OpenAPI 版本/服务地址/全局 Bearer；39 条路由与 Nest 反射逐条一致；`operationId` 唯一、`summary/tags/responses` 完整；路径参数声明且 `required: true`；本地 `$ref` 全部可解析、JSON 无损往返；公共接口恰好 5 个；核心契约字段（`If-Match`/`Idempotency-Key`/409/multipart）覆盖；真实启动 Nest 请求端点，无令牌 200 且含缓存头/请求 ID。
- **使用文档**：新增 `docs/openapi.md`（获取方式、导入工具、39 条路由清单、鉴权/乐观锁/幂等/错误体/限流约定、防漂移维护说明、本批未包含项）；`docs/protocol.md` §10 修正公共接口清单并新增 §10.7。

**验证（2026-10-22 实测）**：

- `pnpm -F @lc/server test`（`LC_TEST_DATABASE_URL` 指向 `lowcode_test`）：**16 文件 / 256 用例全过**（含 MySQL 9 例）。
- `pnpm -r test`（同上）：**6 项目 / 76 文件 / 1139 用例全部通过**；renderer 25 / 335、designer 25 / 336、server 16 / 256、schema 6 / 90、expression 3 / 117、tokens 1 / 5。
- `pnpm coverage`（CI 口径，不设 MySQL 环境变量）：**75 文件通过 + 1 跳过（76）**；**1130 通过 / 9 跳过（1139）**；statements **95.66%**、branches **85.89%**、functions **95.69%**、lines **95.66%**；`openapi.ts`、`open.controller.ts`、`open.module.ts` 均 **100 / 100 / 100 / 100**。
- `pnpm -r typecheck` ✅ 7 包 Done；`pnpm -r build` ✅ 5 包 Done（`designer-web` 1,239.95 kB / gzip 402.09 kB，仅既有 >500 kB chunk 告警）。
- `pnpm design:check` ✅（tokens / color / dimensions / rpx / contrast 全过）；`pnpm --filter @lc/runtime build:h5` ✅ `DONE Build complete.`。

**明确未做**：Webhook 订阅/签名投递/重试与投递日志；远程物料/物料市场；内置 Swagger UI 页面；第三方数据源连接器。以上留待开放集成后续批次；本批只交付机器可读文档与端点。

---

## ❌ 未实现（本次明确不做 / 未完成）


> 以下项**均未开始**，不得默认为可用。归属 Phase 依据《落地方案》第十章。

### Phase 0 中尚未完成的部分

| 事项 | 方案要求 | 状态 | 归属 | 备注 |
|---|---|---|---|---|
| 渲染器骨架 `packages/renderer` | 手写 JSON 能渲染出 3 个静态组件 | ✅ **已实现** | Phase 0 | 纯逻辑层 145 用例覆盖；uni 组件层已在 `packages/runtime` **H5 实测通过**（3 组件渲染 + 表达式 42 + 输入联动 + toast 动作）+ `build:mp-weixin` 产物抽查通过；**小程序真机待验**（无微信开发者工具，见 L-5） |
| 服务端骨架 | NestJS 工程 + 登录 + 页面 CRUD 可读写 Schema | ✅ **已实现** | Phase 0 | `apps/server`：登录 + 5 个页面接口（校验/存取/发布/回滚）+ 版本模型，38 用例 + 真实启动冒烟；~~业务数据动态 CRUD（`/models/*`）属 Phase 1~~ → ✅ **已于 2026-10-10 完成**（9 接口 + server 93 用例，见「已实现 15」）；8.2 其余模块（应用/菜单/流程）仍属 Phase 1 之后 |
| CI 配置 | `turbo build` 全绿 + 体积阈值告警 | 🟡 **workflow 已写未实跑** | Phase 0 | `.github/workflows/ci.yml`（typecheck/build/test/coverage 阈值/服务端冒烟/体积告警）；未引入 Turborepo（D-4，用 `pnpm -r`）；**未推送远端、未在真实 Actions 执行**（D-13/L-8） |
| ADR 架构决策记录 | `docs/adr/` | ✅ **已完成（6 篇）** | Phase 0 | `docs/adr/`：README 索引 + 001~006（静态注册/受信 app API/副作用注入/JSON 仓储/uni CLI/覆盖率门禁）；与方案 2.4 分工互补，全部由已落定决策（D-x）归纳 |
| `docs/protocol.md` 协议规范文档 | 对外契约文档 | ✅ 已完成 v1.0（**第 10 章 2026-10-10 修订**） | Phase 0 | 11 章 + 2 附录，覆盖四协议 + Model/App + 33 错误码 + 服务端契约；全部事实逐条核对实现；**第 10 章已补方案 8.3 动态 CRUD 9 接口 + 10.4 记录查询语义 + 服务端错误码 11→19**（协议结构 0~9 章未变，不升 `schemaVersion`） |
| 单测覆盖率 ≥ 90% | 方案 9.2 硬指标 | ✅ **已达成并强制** | Phase 0 | `pnpm coverage` Phase 0 实测 **95.53%** → **2026-10-22 最新 95.66/85.89/95.69/95.66**（76 文件 / 1139 例；分包 stmts：designer panel 99.8+ / renderer core 97+ 均 ≥90；**分包 branch 不设阈值**，以总分支过 85）；阈值 90/85/90/90 写入 `vitest.config.ts` 防退化；uni 组件层已纳入统计 |

### 渲染引擎的已知限制（第 2 批明确记录，均未在后续批次解决前视为**不可依赖**）

| # | 限制 | 现状 | 后续方向 |
|---|---|---|---|
| L-1 | **联动粒度为根变量级** | `refs()` 只返回顶层变量，`formData.amount` 变更会重算所有依赖 `formData` 的节点（宁多算不漏算） | 字段级路径索引（方案 5.3 的「expression → 依赖字段」表），需在 expression 增加 `refPaths` |
| L-2 | **`resolveTree` 全量重算** | 每次数据变更整树重算，靠 AST 缓存兜底；未做「只重算脏节点」 | 结合 L-1 的字段级索引做增量解析 |
| L-3 | **父不可见时子树不解算** | `condition=false` 的容器其子节点不出现在结果中；因此隐藏字段的**校验错误无法被 `findFirstErrorNode` 定位** | 提交前按可见字段过滤校验集合 |
| L-4 | ~~**生命周期钩子无法写字段**~~ | ✅ **第 3 批已解决（D-7 选型 C）**：注入受信任 `app`，写入/取数/提示均可用；渲染期表达式仍无 `app` | 演进方向：若需动作级编排（条件分支/重试），再评估 `string[]` → `Action[]` |
| L-7 | **`app.*` 仅生命周期可用** | `props` / `condition` / `loop` / 校验规则 / **动作的 `expression` 类型**均看不到 `app`；副作用请用 3.5 的 15 种动作类型 | 若确需在动作表达式里用 `app`，为 `actionRt` 构造同款扩展作用域（改动很小） |
| L-5 | **uni 组件层：小程序端未真机验证** | ✅ **H5 端已实测通过**（`packages/runtime` 浏览器 DOM 断言：渲染/表达式/联动/动作）+ `build:mp-weixin` **分包产物验证通过**（批 7：app.json 主包 3 页 + `subPackages`、分包 `pages-demo` 四件套、wxml 的 `wx:if` 分发链、主包 209.7KB = 2MB 限的 10.2%）；**mp 真机 / 微信开发者工具未验**（环境无开发者工具），App 端未验 | 装微信开发者工具导入 `dist/build/mp-weixin` 验证 → 真机 |
| L-6 | **物料映射为空** | `MATERIAL_MAP` 是空对象，尚无物料可渲染 | Phase 1 物料库 + schema-cli 生成映射 |
| L-8 | **CI workflow 未在真实环境执行** | `.github/workflows/ci.yml` 已写（含 coverage 阈值与服务端冒烟步骤），但本机非 git 仓库、未推送远端 → **Actions 侧从未跑过**，bash/curl 步骤仅语法级人工核对 | 初始化 git 仓库并推送后触发一次，修正 runner 差异 |

### 后续 Phase 全部未开始

| Phase | 未实现内容（节选） |
|---|---|
| Phase 1 | ✅ 物料库 12 个（2026-10-09 完成并 H5 实测）；✅ **设计器批 1「画布能渲染」+ 批 2「能拖入删除」（2026-10-09 完成并浏览器实测，B-22~B-26 修正 + D-A8 注记已回写，meta ×13 随批 2 合流）**；✅ **设计器批 3「能配置保存」（2026-10-10 完成并浏览器实测，B-27 修正 + D-A9 注记回写，4 setter 真渲染 + 保存/打开/发布链路）**；✅ **设计器批 4「页面↔模型字段绑定」（2026-10-12 完成并浏览器实测，D-A11 双层配置 + B-29/B-30 修正，designer 测试 101→123，见「已实现 16」）**；✅ **服务端动态 CRUD（2026-10-10 完成，9 接口 + 93 测试 + 真实启动冒烟 18/18，见「已实现 15」）**；✅ **运行时壳补全「登录 / 应用菜单 / `pageId → Schema` 路由」（2026-10-12 完成并浏览器实测 7 点，`GET /apps/bootstrap` 最小实现 + submit 动作失败透传引擎修复，见「已实现 17」）**；❌ **批 5 闭环 Demo**（出口判据，前置已全部就绪）、数据源配置接口、字段智能匹配与批量生成表单页、其余 9 种 setter（Phase 2） |
| Phase 2 | ✅ 数据模型可视化建模（批 1，2026-10-14）；✅ **列表/详情标准页（批 2，2026-10-14，见「已实现 20」）**；✅ **物料补至 30 个（批 3，2026-10-14，见「已实现 21」）**；✅ **设计器可用性：撤销重做/大纲树/复制粘贴（批 4，2026-10-14，见「已实现 22」）**；✅ **版本管理 UI：历史/回滚/diff（批 5，2026-10-14，见「已实现 23」）**；✅ **RBAC 权限：页面/按钮/数据行级（批 6，2026-10-15，见「已实现 24」）**；小程序分包与包体积裁剪（批 7）；动态表方案 A 维持不做（D-9 沿用方案 B JSON 存储） |
| Phase 3 | ✅ **轻量流程引擎状态机（批 1，2026-10-15，见「已实现 26」——协议 `FlowSchema`/`validateFlow` + 服务端 flow 7 接口 + 提交联动 + 待办/审批动作）**；✅ **审批物料 + 待办中心（批 2，2026-10-16，见「已实现 27」——ApprovalBar/Timeline 物料 + `LcFlowHost` 通道 + 待办两页 + 设计器绑定配置 + H5 闭环实测）**；✅ **本地草稿与主题配置（批 3，2026-10-19，见「已实现 28」——DraftStore 可选注入恢复链 + apps.json GET/PUT config + brand 十档派生全站变色 + ThemePanel 设计器入口 + H5 实测 DoD 全过）**；✅ **图表物料 + Portal 页型（批 4，2026-10-20，见「已实现 29」——Chart 三形态纯 SVG + Statistic + 客户端聚合 + PortalPageConfig 卡片导航/拖拽区 + H5/设计器双实测）**；✅ **埋点与错误上报 + Schema Profiler（批 5，2026-10-20，见「已实现 30」——ops 事件表三接口 + createOpsQueue 上报队列 + 表达式/动作/加载失败接线 + H5/设计器 Profiler 双端可见 + 冒烟 23/23）**；~~消息通知、数据导出/打印~~（2026-10-15 决策裁剪留 Phase 4）；离线队列按方案 7.3 二期、BPMN 按 8.6 二期、真机扫码受环境限制 |
| Phase 4 | ✅ 安全加固首批（JWT/CORS/限流）、可观测性/部署探针、MySQL 8 + Prisma 三批（13 表，含文件元数据/内容）、页面/记录/流程实例乐观锁与审批幂等（含 pendingPatch outbox）、标准详情页记录编辑/删除入口、标准列表页行内编辑 + 批量删除、OpenAPI 3.1 文档端点已完成；❌ 开放集成剩余（Webhook/远程物料）、多环境晋级与灰度、压测与稳定性、导出/打印/消息、文档培训；❌ 生产剩余：Redis 多实例限流/分布式锁、安全审计/账号锁定/JWT 轮换、CI 实跑 MySQL、小程序真机 |

---

## ⚠️ 与《落地方案》的偏差（需回写方案或后续对齐）

| # | 方案原文位置 | 方案说法 | 实际落地 | 处置 |
|---|---|---|---|---|
| D-1 | 3.5 Action 协议示例 | `expression` 动作示例写成 `formData.count = formData.count + 1`（赋值） | **引擎不支持赋值**，词法层无单 `=` 运算符 | 已修正方案文档 → 改用 `type:'setForm'` |
| D-2 | 5.4 表达式引擎 | 「初期用 json-logic 快速跑通，3 个月内替换为自研 DSL」 | **直接完成了自研引擎**（tokenizer/parser/evaluator 全套） | 已修正方案文档 → 标注为已完成 |
| D-3 | 3.4 ExprSchema | 声明支持 `=` 赋值吗 | 方案正文「禁止」列表已含赋值，但 3.5 示例自相矛盾 | 以「禁止赋值」为准（D-1 已修） |
| D-4 | 9.1 Monorepo | 使用 `turbo.json` + Turborepo | 当前用 `pnpm -r` 递归，未引入 Turborepo | 标记为 Phase 0 未完成项；包数 < 10 时影响不大 |
| D-5 | 3.7 协议版本 | 迁移链基于 `VERSION_HISTORY` 判定已知版本 | 实现改为「高于当前 → UNKNOWN；低于当前 → 沿链找，断档 → MISSING」 | 已按更清晰的语义实现，`VERSION_HISTORY` 仅用于对外展示与 `W_SCHEMA_OUTDATED` 警告 |
| D-6 | 3.4 | 表达式支持 `=` 相关的 action 上下文赋值 | 见 D-1 | 同上 |
| D-7 | 3.1 生命周期 vs 5.x 禁止赋值 | 3.1 规定 `onInit/onMount/onSubmit` 是**表达式**，用途含「设置默认值」；5.x 及 D-1 明确**表达式禁止赋值** | **✅ 已解决（第 3 批，选型 C）**。查证后修正定性：3.1 示例 `app.setFormData(...)` 与 3.4「`app` 方法对象（受限 API）」本就不靠赋值，真正缺口是**渲染引擎没注入 `app`**；仅 7.2「可做赋值」一句措辞不严谨（已改）。现生命周期通过受信任 `app` 获得写入/取数能力 | ✅ 已回写方案 3.4（`app` 作用域边界说明）与 7.2；`onMount` 示例 `ds.ds_dept.load()` 改为 `app.loadDs('ds_dept')` → 见 D-8 |
| D-8 | 3.1 `onMount` 示例 | `"onMount": "ds.ds_dept.load()"`（在 `ds.<id>` 状态对象上挂方法） | `ds` 是**纯数据状态**，挂方法会污染序列化与 Vue 响应式；且 `ctx.data.ds` 由 runner 管理而非挂载点 | 已改方案示例为 `app.loadDs('ds_dept')`；`ds` 保持只读数据视图（渲染期 `ds.ds_dept.data` 用法不变） |
| D-9 | 8.1 技术栈 A | NestJS + **Prisma + PostgreSQL + Redis** | 第 3 批只落了 NestJS：存储为 **JSON 文件仓储**（`PageRepository` 接口，文件即 8.4 双表合并视图），无 Prisma / PG / Redis；用户为内存种子。**2026-10-21 两批 + 2026-10-22 文件批已落 MySQL 8 + Prisma**（PostgreSQL 改 MySQL；用户/角色、页面/版本、模型/记录、RBAC、流程定义/实例、运维事件、应用配置、文件元数据/内容 13 表），JSON 保留为默认/测试实现；Redis 仍未引入 | 已回写方案「实施状态」与偏差清单；ADR-008 / ADR-009 / ADR-010 记录 MySQL 路线与边界；ops 已改追加裁剪，乐观锁边界已列账 |
| D-10 | 台账「下一步」原第 4 项 / 方案 9.1 目录树 | 「uni-app 运行时壳：**HBuilderX 工程**」 | 环境无 HBuilderX → 改走 **uni-app 官方 CLI（Vite）工程**（`packages/runtime`，`uni` / `uni build` 双命令）；产物与 HBuilderX 路线一致（`dist/build/*`），目录对齐方案 9.1 | 已回写方案 Phase 0 表（渲染器骨架行）与本表；功能等价，装 HBuilderX 后可迁移 |
| D-11 | （未约定 npm 源） | — | npmjs.org 不可达 → workspace 根 `.npmrc` 设 `registry=npmmirror.com`；`pnpm-workspace.yaml` allowBuilds 增加 `core-js`（uni 依赖其构建脚本） | 保留（环境约束）；如需回官方源删 `.npmrc` 即可 |
| D-12 | 4.2 easycom 规则 | 仅 `^lc-(.*)$` 一条：按名映射到 `@lc/renderer/uni/$1.vue` | 实际 3 条：`^lc-renderer$` / `^lc-node$` **精确匹配**（指向 `@lc/renderer/uni/*.vue`，它们在 renderer 包内而非物料目录）+ 原 `^lc-(.*)$` 物料规则（`src/materials/$1/index.vue`） | 对方案的最小扩展；已回写方案 4.2 与 `pages.json` 注释 |
| D-13 | 第十章 CI 验收「一键 `turbo build` 全绿」 | CI 在真实环境全绿 | workflow 已写（`.github/workflows/ci.yml`），但**未推送远端、未在真实 Actions 执行**；且无 Turborepo（D-4），命令为 `pnpm -r` | 已回写方案 Phase 0「Monorepo 搭建」行；推送后触发首次运行（L-8） |
| D-14 | 8.3 `GET /apps/bootstrap` | 启动聚合：**应用 + 菜单 + 权限 + 用户**（一次请求） | **Phase 1 最小实现**：返回 `{ user, apps[] }` —— 无独立「应用」实体（应用按页面 `appId` 分组、应用名暂即 `appId`）、**不含权限**（RBAC 属 Phase 2，运行时表达式侧默认全通）；菜单只下发页面元数据，打开页面再单独拉 Schema | ✅ **已收口（Phase 2 批 6，2026-10-15）**：login/bootstrap 响应均扩 `perms: string[]`（角色 perms 并集、`'*'` 通配），bootstrap 菜单按 `canSeePage` 过滤（实测 admin 5 页 vs designer 4 页），见「已实现 24」；仍无独立应用实体（按 `appId` 分组口径不变）；已回写 protocol.md 10.1 |
| D-15 | Phase 1 出口判据 3「服务端能查到这条记录；**列表页能看到**」（方案 line 1227） | 方案第 7 章 Phase 1 范围**无列表页**——`type=list` 页面形态与 List 物料均列在 Phase 2 事项表，判据与阶段范围自相矛盾 | **按 designer-plan 批 5 裁剪口径执行**：以「服务端 `GET /models/:id/records` 查到该条记录」为验证（2026-10-14 实测达成，见「已实现 18」判据 3），「列表页能看到」留 Phase 2；主方案判据原文已加注记 → ✅ **已随 Phase 2 批 2 兑现（2026-10-14 列表页真身，见「已实现 20」）** |
| D-P2-2 | 协议 `PageSchema` 只有 `list?`，detail 页型无专属配置 | `type=detail` 在 `PageType` 中存在但无 `DetailPageConfig`——详情页只能靠 root 树 + 表达式拼，无标准实现路径 | 批 2 补协议：`PageSchema.detail?: DetailPageConfig {modelId, fields?, backPageId?}` 与 list 对称 + validate 对称校验；跳转不扩 RuntimeHost，组件 emit `navigate`/`back` 壳层接线（D-A2 分层）；**协议结构变化已登记 protocol.md**（detail 可选新增，不升 `schemaVersion`——沿批 1「可选字段新增」口径） |
| D-P2-3 | 方案/协议无「页面 name 初始化」约定 | 设计器「新建页」用 demo 模板重置，`schema.name` 保留模板名「画布演示」——批 2 实测新建 `p_emp_list`/`p_emp_detail` 后 runtime 菜单**多页撞名**（都显示「画布演示」，只靠版本号区分），与 Phase 1 期末 emp_form 撞名 polish 同族 | 不属批 2 范围（标准页配置面板无 name 输入）；处置：页面名编辑随批 4/5/6/7 任一批次一并（新建时 name 默认 = pageId 亦可），批 3 顺手未做 → ✅ **批 4 已修（2026-10-14）**：`newPage` 的 `schema.name` 默认 = pageId，服务端回读 `p_b4_test` 实证（B-35，见「已实现 22」DoD ④）；**name 手动编辑入口仍未做**（仅修默认值） |
| D-P2-4 | 《方案》物料清单（6.2 + 缺口清单） | 方案未给 30 物料明细清单，仅列常用缺口（日期时间/评分/级联/人员部门/文件等） | **批 3 按 `FieldType` 全集 + 方案缺口配平定稿 18 件**：表单 9（DatePicker/DateTimePicker/MoneyInput/Checkbox/Picker/UserPicker/DeptPicker/Cascader/FileUpload）+ 数据 3（Detail/Cell/List）+ 导航 2（Tabs/SearchBar）+ 反馈 2（Rate/Progress）+ 基础 2（Tag/Icon）；展示 12→30、META 13→31；**明确不做**：组织服务接入（人员/部门静态候选）、真实文件上传协议、省市区内置数据、Tab 面板容器、Icon 字体包 | 详设入 phase2-plan §6B；「已实现 21」实现落点表 |
| D-P2-5 | 《方案》3.4 组件交互契约 / D-A2 分层 | 未规定新表单物料实现边界与 shim 策略 | **统一契约** `props{name,label,value,required,disabled,error}` + `emit('update',{name,value})`（一期同款，lc-node 分支零特殊化）；**零新增 shim**：Checkbox 纯 view 模拟（无 checkbox-group）、Cascader 逐级 picker 链（picker-view 无 shim）、FileUpload 走 `uni.chooseFile`（PC shim 补 polyfill 与 chooseImage 同款）；List/Tabs 事件载荷经 `scope.eventData` 注入表达式作用域（`handleEvent` 不带载荷，`controller.scope` 展开合并） | 双端一致策略；批 3 章节「实现落点」 |
| D-P2-6 | 《设计器》属性面板 setter 清单 / 协议 `setter` 枚举 | 枚举含 slider/ruleEditor/fieldPicker/dataSourcePicker/eventBinder/expression/color/optionList 等 | 批 3 只兑现 **optionList + color**（Radio/Select/Checkbox/Cascader 的 options 与 Text `style.color` 声明欠账）；`expression` 不补（批 4 D-A11 字段绑定区覆盖）；其余 5 个复杂 setter 维持占位提示（只读不误写） | 占位有既有测试锁；后续批次按需补 |
| D-P2-7 | 《方案》6.3-6 撤销重做「immer 快照双栈」/ designer-plan「为 immer undo 快照预留接缝」 | 方案原文指定 immer | 现状 schema-ops 16 op 全线 clone-then-replace（旧引用不被原地修改）→ **快照栈直接存 `PageSchema` 引用即等价 immer 不可变历史**；immer 需新依赖 + op 全改 `produce` 形态，收益仅省内存（KB 级 schema × 上限 50 < 1MB）——**不引 immer，零新依赖**；入栈用 store `watch(schema)` 单一接缝（pre flush 合并同 action 连写）、`replaceSchema` 吞栈清栈（跨页撤销 = 数据事故）、`clipboard` 换页不清 | 详设入 phase2-plan §8；「已实现 22」实现落点与 DoD ①② |
| D-P2-8 | 台账原判「批 5 服务端 rollback/**versions 已有**」 | 实查：`POST /pages/:id/rollback` 与 `PageVersionRecord[]` 数据结构已有，但**版本列表查询端点不存在**（数据只在 repo，HTTP 层无出口） | 批 5 历史面板必须有列表源 → **补只读 `GET /pages/:id/versions`**（轻量元数据倒序、不含 schema 全文，查全文走既有 `?version=vN`）；controller+service 各一方法、repo 零改动 | 详设入 phase2-plan §9；协议登 protocol.md §10；「已实现 23」DoD ①④ 实证 |
| D-P2-9 | 「对比 diff」实现选型 | 三选一：引 JSON diff 库 / 行级文本红绿 / 自研结构化条目 | **自研 `diffSchema` 纯函数零依赖**（沿 D-P2-7 原则）：按节点 id 对齐，add/remove 子树只报顶层、change 逐 props 键、move 报父/序变化；**diff 基线 = 内存当前画布**（用户所见即所比，省一次拉取）；不逐键展开对象值（关心语义变化） | 详设入 phase2-plan §9；「已实现 23」DoD ②⑤ 实证（2 处差异逐字命中） |
| D-P2-10 | 方案「权限体系」未约定存储形态 | 「RBAC + 页面/按钮/数据行级」，存储/配置面留白 | **RBAC 配置集中单文件 `<DATA_DIR>/rbac.json`**（`{roles:[{key,name,perms}], pages:{pageId:[roleKey]}}`）：`perms` 含 `'*'` 通配；`pages` **无条目=全员可见**（存量页面零迁移）、空数组=删条目恢复；用户→角色映射不动（UserStore 内存种子）、`PageRecord` 零改动；`FileRbacRepository` 文件不存在返回种子（admin `['*']` + designer `[]`），首启即有超级角色语义 | 详设入 phase2-plan §10；「已实现 24」D-P2-10 + rbac.json 回读实证 |
| D-P2-11 | 《方案》权限判定粒度与守卫落点未细化 | 「页面/按钮/数据行级」三个词，无判定链与错误码约定 | **四层判定单一事实源 `RbacService`**：①页面级 `canSeePage`（无条目全开）→ 守卫 = `GET /pages/:id/schema` 403 `PAGE_FORBIDDEN` + bootstrap 菜单过滤；②按钮级 perms 并集下发（login/bootstrap 加 `perms`），renderer 既有「**无权限整节点不渲染**」语义（DoD「按钮禁用」按此更强口径执行）；③模型 CRUD `model.permissions[action]` 未声明=通 → 403 `PERMISSION_DENIED`；④行级 `dataScope`（all/self/dept·deptAndChild 无组织服务**保守降级按 self**、`'*'` 豁免）→ records 查询链 | 详设入 phase2-plan §10；协议登 protocol.md §10；「已实现 24」四层 DoD 全过 |
| D-P2-12 | 《方案》权限管理交互面未约定 | 事项表仅「权限体系」四字，UI 落点留白 | **权限 UI 三入口**：设计器第三视图「权限管理」`RbacPanel`（角色 CRUD + 门禁红字 + 页面授权矩阵）、属性面板节点 perm setter（settings 之后，空=清除）、模型编辑器「数据权限」区块（`dataScope` 下拉 dept 系置灰 + CRUD 角色勾选）；**明确不做**：用户管理 UI（内存种子无持久支撑）、角色删除接口（只 upsert）、perm 批量收集器 | 详设入 phase2-plan §10；「已实现 24」D-P2-12 与「明确未做」 |

**D-7 三方案对比存档**（分析于第 3 批，供后续演进参考）：

| 维度 | A 受限赋值 | B `Action[]` | **C 受信 API（已选）** |
|---|---|---|---|
| 表达式引擎改动 | 大（词法/语法/求值 + 全入口 `allowAssign` 开关） | 零 | **零**（`markTrusted` + scope 函数调用已实现已测） |
| 安全模型 | ⚠️ 破「表达式纯度」不变量，靠开关不漏传 | ✅ 最优 | ✅ 副作用面 = `app` 白名单面，`FORBIDDEN_KEYS` 仍拦 |
| 覆盖写入 / 调取数 / 多步 / 条件分支 | ✅ / ❌ / ❌ / ✅ | ✅ / ✅ / ✅ / ❌（Action 无 condition） | ✅ / ✅ / ✅（`string[]`） / ✅（三元） |
| 协议变更 | 否 | **是**（3.1 + 12.3 重写） | 是（`PageLifecycle` 加数组并集，向后兼容） |
| 设计器 UI | 上下文感知编辑器 | 复用动作面板 | 表达式编辑器 + `app.*` 补全 |
| 演进关系 | 可后期作为糖语法加上 | 与流程编排同构，可由 C 平滑升级 | **已落地** |

---

## 🐛 本次修复的缺陷（留档避免回归）

| # | 缺陷 | 影响 | 修复 |
|---|---|---|---|
| B-1 | tokenizer 的 `PUNC` 集合漏了 `.` | **所有点成员访问全部解析失败**（`formData.a` 报"无法识别的字符"），35 个测试失败 | `PUNC` 加入 `'.'` |
| B-2 | `parseTernary` 笔误写成 `matchOp(':')`（应为 `matchPunc`） | **所有三元表达式报"缺少 :""** | 改为 `matchPunc(':')` |
| B-3 | 使用了非标准 API `Set.prototype.addAll` | 数据源 id 集合构建时运行时报错 | 改为 `for...of + add` |
| B-4 | TS 穷尽性收窄导致 `never.operator` | `typecheck` / `build` 失败 | switch 前用 `const op: string` 承接 |
| B-5 | `applyCall` 不支持箭头函数作为 callee | `((x) => x * 3)(4)` 报"不支持的调用形式" | 第 3 分支改为「求值 callee 后若为函数则调用」 |
| B-6 | `astToString` 不给一元运算补括号 | `(-a * b)` 与 `-(a*b)` 输出歧义 | 新增 `wrapOperand`，二元运算中一元/箭头/三元操作数补括号 |
| B-7 | pnpm 12 拦截 esbuild 构建脚本 | `pnpm install` 直接失败 | `pnpm approve-builds esbuild`（配置写入 `pnpm-workspace.yaml`） |
| B-8 | `validateAll` 把**工厂函数**直接交给 `Promise.all` | `Promise.all([fn])` 不会调用 `fn`，async 校验规则**静默不执行**，校验永远通过 | 改为 `Promise.all(asyncJobs.map((job) => job()))` |
| B-9 | `Linkage.collect` 对 `loop` 未剥离 `$expr:` 前缀 | `$expr: formData.list` 直接喂给 `refs()` 必然解析失败，**loop 依赖收集不到、联动失效** | 改为 `extractExpr(node.loop) ?? node.loop` |
| B-10 | `resolveParams` 递归嵌套时透传了 `override` | 数据源嵌套参数被顶层 override 污染（如 `nested` 里多出顶层的 `b/d` 键） | 嵌套递归不再传 override，override 只在顶层合并 |
| B-11 | `resolveParams` 未递归数组元素 | `arr: ['$expr: ...']` 中的占位**不被解析**，原样发出 | 数组元素逐个解析（字符串占位 / 对象递归） |
| B-12 | 字段变更通知的 `root` 取了字段名首段 | `set('city.code')` 通知 root=`city`，与联动期望的 `formData` 对不上，**联动与 watch 触发器全部失配** | `root` 固定为数据域 `formData`，与 `refs()` 的根变量对齐 |
| B-13 | `validatePage` 对带 `$expr:` 前缀的 `loop` 直接调 `checkExpr` | `$expr: formData.list` 被当作表达式解析 → **误报 `E_EXPR_SYNTAX`**（校验器与渲染引擎对 loop 写法的契约不一致） | 校验前剥离 `$expr:` 前缀；补 2 个用例（带/不带前缀） |
| B-14 | `Linkage.collect` 未展开 `string[]` 形式的生命周期钩子 | `onInit: ['a','b']` 数组整体被传给 `refs()` → 内部 `.trim()` 抛错被吞 → **依赖收集静默丢失**，联动失效 | `collect` 按 `string \| string[]` 归一后逐步收集（已补数组形态用例） |
| B-15 | `jwt.service` 用具名导入 `import { sign } from 'jsonwebtoken'`（运行时是 CJS） | vitest 下通过（vite 预打包互操作兜底），但 **`node dist/main.js` 真实启动直接 `SyntaxError`** —— Node ESM 对 CJS 的具名导出探测失败 | 改默认导入 `import jwt from`，类型用 `import type` 编译期擦除；**教训：vitest 通过 ≠ 运行时可用，必须做构建产物真实启动冒烟** |
| B-16 | Nest 对 POST 路由默认返回 **201 Created** | 首个登录用例断言 200 失败 → `token` 未赋值 → **后续 26 个用例级联 401** | `login/validate/publish/rollback` 显式 `@HttpCode(200)` 固化契约；测试改为**先取 token 再断言**，防断言级联污染 |
| B-17 | **台账/方案的数字结论与实现不符**（第 2 批凭印象写入，第 3 项编写 protocol.md 逐条核对时发现） | 内置函数实为 **37**（写 51）、Action 实为 **15 种**（写 16）、`FORBIDDEN_KEYS` 实为 **19 项**（写 21）、数组白名单 **18**（写 17）、字符串 **20**（写 18）、安全用例 **45**（写 22）；共 10 处文档 + 2 处源码注释 | **运行时实测**全部数字（`Object.keys(BUILTINS).length` 等）后勘误：方案 3 处 + 本台账 5 处 + `action.ts`/`lifecycle.ts` 注释 2 处（dist 随 build 同步）；**教训：数字类结论必须运行时实测，禁止凭印象**（已固化为 protocol.md 附录 B 第 3 条） |
| B-18 | `lc-node.vue` 的 v-if 链**缺容器分支** | `resolve()` 返回含 root（`componentName: 'Page'`），链上无 `Page` 分支 → 页面顶部渲染「未知组件：Page」占位；children 递归在链外故 3 物料仍正常 | v-if 链加 `isContainer` 分支（`Page/View/Group` 空模板，仅承接 children 递归）；不动 core `resolveTree`（保 145 用例） |
| B-19 | `lc-node.vue` **递归处未绑 `@change`** | 嵌套节点的 `emit('change')` 无人监听 → **输入改值后 `setField` 执行了但视图不刷新**（`ctx.data` 已变、文案停在旧值）；单测层无组件用例故未拦住，H5 实测发现 | 递归 `<lc-node>` 加 `@change="emit('change')"` 逐层冒泡到 `lc-renderer.onTreeChange`；mp 产物 `lc-node.wxml` 已确认出现 `bindchange`；**教训：组件层必须有实机冒烟，当时 vitest 只覆盖 core —— 2026-10-09 已补组件测试固化本回归**（见「已实现 8」第 5/6 用例） |
| B-20 | 根 `vitest.workspace.ts` 被子包的 `vitest run` **向上自动发现**（vitest 2.1 沿祖先链找 `vitest.{workspace,projects}.*`，**改名也无效**），且文件内相对项目路径按 **cwd** 解析 | `pnpm -r test` 在每个子包内跑时加载它 → `packages/schema` 被解析成 `<子包>/packages/schema` → **全部子包 test 报 "non-existing file" 失败**（356 → 0） | 移到 **`config/vitest.projects.ts`**（不在祖先发现链上）+ 根脚本显式 `--workspace config/vitest.projects.ts`（cwd=仓库根，相对路径正确）；**教训：聚合配置不能放会被工具向上发现的位置** |
| B-21 | PowerShell `Get-Content`/`Set-Content` **未指定 `-Encoding utf8`**，按系统 ANSI（GBK）对 UTF-8 中文文件做读写往返（Phase 1 第 1 批批量改物料注释时触发） | 3 个物料注释乱码；`input/index.vue` 模板字符串 `'请输入'` **引号闭合丢失** → SFC 编译必炸；且正则因编码错位**静默未匹配**，替换看似执行、实际只完成了破坏性写回 | 按此前已读原文完整重写 `input/index.vue`，text/button 用 edit 工具修注释头（UTF-8 字节处理无损）；**教训：批量文本替换禁用 shell 默认编码读写 UTF-8 中文文件，必须用专用编辑工具或显式 `-Encoding utf8`**（Phase 1 第 1 批已修复） |
| B-22 | 设计器方案期假设「非 HTML 内建标签 → `resolveComponent` → 全局组件注册生效」，但 **`view/text/image/switch` 恰好都是 SVG 标签**，Vue 编译期按**保留元素直出**（dev 警告 `Do not use built-in or reserved HTML elements as component id`），**组件 shim 注册无效**（设计器批 1 jsdom 首测发现：`div.r2-root` 断言失败、渲染出原生 `<view>`） | 直出的 4 标签在 PC：view 默认 inline（布局错）、text 尚可、image 不显示图、switch 无交互 —— **组件 shim 方案对这 4 个标签整体失效** | 分组兜底（designer 包）：**view/text** → 全局 CSS（`view{display:block}`）；**image** → 增强器把 `src` 同步为背景图（MutationObserver 盯属性，$expr 换图跟随）；**switch** → 增强器事件委托（点击切 `checked` attribute + 派发 `CustomEvent('change',{detail})` uni 契约）；**原则：只加 attribute/派发事件、不替换节点** → DOM 与 vnode 同构，Vue patch 安全；picker/radio/radio-group 组件 shim 实测成立；已回写 `designer-plan.md §4.1` 与 R2 风险（🟢→🟡 实测兜底） |
| B-23 | `checked` / `disabled` **不在 Vue 的 boolean-attr 名单**，对未知元素 `:checked="false"` 落成 `setAttribute('checked','false')` —— **字符串 "false"，attribute 仍存在**；增强器用 `hasAttribute` 判定 → 关态被误判为开态、`disabled="false"` 被误判为禁用（浏览器实测：switch 点击无反应，`parentProbe` 空证明事件被拦但未切换） | switch 初始关态显示为开、点击被 isDisabled 拦截不切换；CSS `switch[checked]` 也会误命中 `"false"` | `isOn/isDisabled` 读 attribute 值并排除 `"false"`；CSS 改 `switch[checked]:not([checked='false'])`（disabled 同款）；jsdom 补 `disabled:false` 回归用例 + 浏览器重测切换成功；**教训：对非内建元素的 boolean 属性判断必须读值，不能只看 attribute 存在性**（批 1 已修复） |
| B-24 | `lc-renderer.vue` 用 `new PageController(props.schema, ...)` **一次性构造**，无 `watch` —— `PageController` 构造期 `buildTreeWithReport(page.root)` 产出 readonly tree，**schema prop 换新引用后 controller 仍持旧树**（批 1 从未变过 schema，缺陷被掩盖；批 2 设计器插入节点后暴露：store 已更新 13 子节点、PropsPanel 正常，**画布 DOM 停在 14 旧遮罩零更新**，浏览器实测发现） | 设计器所有 schema 修改（插入/删除/换位/改属性）在画布上**完全不生效**，设计器核心链路断裂 | `controller` 改 `shallowRef` + `watch(() => props.schema)` → dispose 旧实例、按新树重建、重跑 `onMount/refresh`；同时补 **`selectedId` 受控 prop**（store.selectedId → 遮罩选中样式闭环，schema 替换后选中态跟随）；回归用例 3 个（runtime 替换/design 受控选中/runtime 零回归）；**教训：批 1 验收要包含「状态变更 → 视图刷新」链路，仅首渲染验证不够**（renderer 160 passed 固化） |
| B-25 | 设计器方案期沿批 1 D-A5 假设「画布内节点换位也用 HTML5 DnD」—— 实测 **SVG `view` 遮罩 `draggable="true"` 的 `dragstart` 会 fire，但浏览器不建立拖拽会话**：`dragover`/`drop` 全缺（CDP 真实拖拽与 SVG 元素 DnD 支持的历史限制一致），换位 drop 永远不触发 | 画布内拖拽换位**完全不可用**（合成事件证明 handler 链路正确，真实手势失败 → 产品缺陷非测试问题） | 节点换位改**自研 mouse 手势**（LcCanvas：mousedown 起拖 → 位移 <4px 视为点击 / ≥4px 武装 → mousemove 更新锚点指示线 → mouseup 落 `moveByDrop`，武装后 click 被 capture 吞防误选；与物料 HTML5 DnD **双机制共用同一 anchor/hint**）；遮罩去 `draggable`；浏览器实测换位全通（into/before + CDP drag 走 mouse 序列直接可用）；**教训：B-22「SVG 直出」的交互副作用族 —— SVG 元素上不可假设 HTML 交互特性**（designer 81 passed 固化） |
| B-26 | ① VTU 2.5.1 的 `attachTo` 实现依赖 **Vue 3.5 的 `app.onUnmount` API**（本仓 Vue 3.4.21）→ 调用即 `TypeError: app.onUnmount is not a function`；② VTU 默认把组件挂在**离屏 detached 元素**，事件冒泡链在 detached 根终止 → **window 级 listener 永远收不到**（B-25 自研 mouse 拖拽的 move/up 挂 window，单测首跑 2 用例失败、probe 证实 `PROBE_SEEN: []`） | 自研拖拽单测无法触达 window 层 handler，且 `attachTo` 路径直接崩 | 测试 `mountCanvas` 改**手动 `document.body.appendChild(w.element)`** 进 document 树 + `afterEach` 清 body 兜底；**教训：window/document 级事件的组件单测必须让挂载树进 document；VTU 特性要对账 vue 版本**（dnd.test 11 passed 固化） |
| B-27 | demo fixture `demoPage()` 写 `schemaVersion: '1.0'`，而 `validatePage` 要求三段 semver（`^\d+\.\d+\.\d+$`，`version.ts`）→ 批 3 首次对 fixture 跑校验即 `E_SCHEMA_VERSION`（批 1/2 从未校验过 fixture；server/runtime 样例本就是 `'1.0.0'`） | 打开设计器首屏即「1 项校验错误」、保存被门禁阻断，demo 页无法建档 | fixture 改 `'1.0.0'`；store 初始化/保存测试固化 `validation.valid` 断言防回归；**教训：凡会进 `validatePage` 的 fixture/样例，落库时就跑一次校验（B-17 实测原则）** |
| B-28 | **构建产物 `apps/server/dist/main.js` 内容与源码不一致**：其中出现了 `src/main.ts` 里根本不存在的代码 —— `await app.useStaticAssets('D:\\mimo\\lowcode\\apps\\server\\data\\files', { index: false })`、`NestFactory.create(AppModule, { logger: false })`、`exports.main = bootstrap`；该静态挂载把 `/api/v1/files/` 目录交给 serve-static，**新的 `GET /api/v1/files/:fileId` 控制器路由被绕过 → 所有文件读取返回 Express 的 `Cannot GET …` 404**（本批冒烟最初 17 项里「公开读取字节一致」即因此失败）。`src/main.ts` 自 2026-10-08 起未改动，`tsc` 不可能凭空生成 `useStaticAssets` 字面量路径，**产物被改写的确切来源未能查明**（本机非 git 仓库，无产物基线可比对） | 文件读取接口全量 404，而单元测试（直接实例化 Nest 应用）与 typecheck 均不受影响 → **只有真实启动链路能暴露** | `pnpm -F @lc/server build` 重建 → `dist/main.js` 恢复为与源码一致的干净产物（已核验无 `useStaticAssets`/`logger:false`/`exports.main`）→ 重启 → 文件读取 200、冒烟 **18/18**；其后 `pnpm -r build` 复跑并再次核验产物仍干净。**教训：① 与 B-15 同族 —— vitest/typecheck 通过 ≠ 运行时可用，必须真实启动冒烟；② 出现「路由明明注册却 404 Cannot GET」这类诡异症状时，先 `dist` 与 `src` 对账再往代码里找；③ 本机尽快 git init，让产物/源码不一致可被 diff 追溯（关联 D-13/L-8）** |
| B-29 | **本机 IPv6 回环 `::1` 被拦（`connect EACCES ::1`）**，而两处代码默认走它：① server 测试 `app.listen(0)` 不指定 host → Node 绑 `::` → Nest `app.getUrl()` 归一化为 `http://[::1]:port` → 3 个测试文件 **34 用例全 `fetch failed`**（10-10 基线 93 全绿，10-12 环境变化后爆红，`api/model/file.test.ts` 全部受累）；② `apps/designer-web/vite.config.ts` 未配 `host` → vite 默认绑 `localhost`（解析为 `::1`）→ dev 页 **`502 Bad Gateway`**，浏览器与 Node 客户端一律 EACCES | 表象是「网络/防火墙问题」，极易误判成代码缺陷或去改系统设置；两处症状同时出现时更像环境崩坏 | 实测脚本 `%TEMP%\opencode/net-diag-{a,b}.mjs` 做三地址对照定位：`127.0.0.1` 通 / `::1` EACCES / `localhost` 通（IPv4 回退）；确认后修 3 处代码而非动系统：`api/model/file.test.ts` 改 `app.listen(0, '127.0.0.1')`（server 93 恢复）、`vite.config.ts` 加 `host:'127.0.0.1'` 且 proxy target 改 `http://127.0.0.1:3000`。**教训：① `listen(0)` 不指定 host = 默认绑 `::`，服务默认绑 localhost 同理，都要想到 IPv6 优先；受限环境显式绑 `127.0.0.1` 才稳（CI 亦然）；② 排查先用三地址对照脚本分清「服务没起」与「地址族被拦」，别急着改业务代码或系统配置**（本批四连一度 34 用例全红，即此因） |
| B-30 | Vue **父组件的 `onMounted` 晚于子组件 `onMounted`**：`designer-web/App.vue` 把 `store.setApi(designerApi)` 放在自身 `onMounted` 里，而批 4 新增的 PropsPanel `onMounted`（`loadModels()`）先执行 → 首屏属性面板 `modelError='未配置服务端 API'`、模型下拉只剩占位项。**单测测不出**：mock 是在 `mount()` 前注入的，时序与真实应用相反 | 批 4 首屏「提交模型」下拉为空 + 红字报错，功能完全不可用（浏览器实测才暴露） | `store.setApi(designerApi)` 上提到 App.vue **setup 顶层**（`designerApi` 是模块级常量，注入本就不依赖 DOM），`openPage()`/`addEventListener` 仍留在 `onMounted`；刷新后下拉即列出 2 个真实模型。**教训：副作用注入若被子组件消费，注入时机必须早于子组件 mounted —— 静态依赖放 setup 顶层，只有真需要 DOM 的才放 onMounted；「父子 mounted 顺序」这类时序问题组件单测无法覆盖，必须靠浏览器实测兜底（B-15 的延伸）** |
| B-31 | **workspace 包改了 `src` 却「怎么重启/刷新都不生效」的双坑叠加**（运行时壳批排障主因，耗时最久）：① 页面实际加载的是 `@lc/renderer/**dist**/core/action.js`（包 exports 指向 dist），改 `src` 后必须 `pnpm -F <pkg> build` 才算数——与 B-28 同族但多一层；② uni 插件强制 `preserveSymlinks` → renderer 落进 **vite 依赖预构建**，旧 dist 被打进 `node_modules/.vite/deps` 且 `?v=` hash 只随 lockfile 变 → **build 完 dist 再重启 dev 仍跑旧代码**（清缓存发生在 build 之前也白清）；期间表象极具误导性：改码不生效、点击无动作，一路怀疑到 HMR、事件接线、组件链 | 「提交失败仍 toast 提交成功」的引擎修复反复验证不通过，实测链路一度误判为 HMR 状态坏 / Vue 事件断线（实际事件接线完好，断在加载的是旧 `dist`） | **三步固定顺序：先 `pnpm -F <pkg> build` 重建包 → 再删 `packages/runtime/node_modules/.vite` → 最后重启 `pnpm dev:h5`**，一步不许乱序；用 `performance.getEntriesByType('resource')` 看页面实际加载的是 `src/` 还是 `dist/` 一锤定音。**教训：① 排「改码不生效」先查「加载的是哪份文件」（network/资源清单），别在业务逻辑里找；② 预构建缓存的失效条件是 lockfile/配置，不含包源码内容，改 workspace 包必须手动清缓存** |
| B-32 | **多客户端同页并发覆盖**：设计器 tab（:5174）一直开着，其内存里的旧 schema 把运行时壳侧刚 PUT+publish 的 v4 **整页覆盖回旧版**（published 变 v5/v6，`Button.actions` 消失）—— 运行时页面点击「提交」完全无反应，查半天 schema 才发现服务端版本被换掉了；两客户端都走 `PUT /pages/:id/schema` 全量写、**无乐观锁/版本冲突检测** | 联调期改动「莫名其妙丢失」，表象是运行时行为失效，实际污染源在另一个开着的客户端 | 关掉设计器 tab 后重新 PUT+publish v7 恢复；**联调纪律：同一页面同时只留一个编辑方，改服务端 schema 前先关设计器**。根治属 Phase 2（版本管理与 diff、`If-Match` 乐观锁）；协议已有的 `currentVersion` 可作冲突检测基础 |
| B-33 | **uni dev 预构建半成品：不改码也会「页面事件全坏」**（批 5 联调排障，B-31 的强化变体）：服务器重启连带杀掉三 dev 后重新拉起，runtime dev `ready in 49230ms`（正常 1~3s）——预构建在异常状态下产出半成品；表象是**按钮点击全无反应**（无网络请求 / 无 toast / 无 console 日志），且 demo 页与新页**双双失效**（→ 立刻排除单页 schema 问题），而 lc-node 事件链代码逐行核对完好、`DOM.click()` 打在 `uni-button`（uni-components 叶子元素，Vue 监听器直挂其上）语义正确；清 `packages/runtime/node_modules/.vite` + 重启 dev（ready 1.3s）后**同操作立即恢复** | 「点击无反应」极易误判为事件接线 / HMR / Vue 状态问题（B-31 当时就走过这条弯路）；本批靠**对照实验**（好页坏页同现象 → 环境层而非页面层）把范围快速收敛 | **识别信号：dev ready 时间异常（≫ 常态 1~3s 即可疑）即预构建可疑**——无论本会话是否改过码，直接执行 B-31 三步（本批无 dist 变更，实际只需「清缓存 → 重启」两步）；**「多个页面同现象」优先查环境层，「单页现象」才查 schema/业务** |
| B-34 | **自动化填表打错目标：`browser.fill` 的 ref 错位落到 `v-model` 直连 store 的顶栏 pageId 输入框**（批 5 操作污染）：本想填 Text 的 textarea，snapshot ref 匹配失误把「员工信息登记」写进了 `pid-input` —— 该输入框是 `v-model="store.pageId"` **直连 store 状态**，污染即生效 → 后续保存/发布报「**非法的页面 id：员工信息登记**」，而真正肇因在更早一步、错误现场与肇因完全分离 | 表现为「保存失败」，顺着错误查 pageId 何时变的却毫无头绪；同源风险还有 textarea 的 native setter + `input` 事件补救（browser.fill 对 Vue 受控 textarea 不生效，试出来的 workaround 也会打错目标） | **① 对受控输入 fill 前先核对目标元素**（label / placeholder / data-testid 三重确认），或统一用「选中节点 → 面板内定点」的 native setter 写法；**② store 状态出现异常值时，回溯最近一次 UI 输入操作**；设计器顶栏 `pid-input` 直连 `store.pageId`，改它等于换页面 |
| B-35 | **自动化脚本中断留「半编辑态」污染 + `nextFieldKey` 复用释放 key 致行数错位**（Phase 2 批 1 实测）：分段 evaluate 脚本逐段改字段 key（f1→leaveType→days→reason），每段假设「加字段生成 f2/f3」——实际 `nextFieldKey` 取**最小未占用 fN**，改名释放 f1 后新行复用 f1，按错误假设 query 到 null 即抛异常中断；三段各自留下含空行的半编辑态，最终保存把 6 字段（3 编辑 + 3 空行）写进服务端，且页面 dirty 显示与实际状态错位 | 表象是「服务端字段比预期多」，易误判为产品 bug——**回读复验**（打开回读 / 删行再保存 / 门禁 / 画布）证明产品链路全部正确，污染源是自动化脚本自身 | **① 自动化操作受控组件的脚本要么一次跑完，要么每段先读回当前 DOM 态再决策，绝不假设中间态**；**② 生成类 key（nextFieldKey）在改名场景会复用序号**，脚本按序号定位行不可靠——按语义 key 定位；**③ 任何写库操作后必须服务端回读核对**——本批正是回读发现并纠正了污染 |
| B-36 | **jsdom 不实现 `isContentEditable` 计算属性与 `contentEditable` 属性反射**（Phase 2 批 4 实测）：测试里 `div.contentEditable = 'true'` 只写对象自有属性，`getAttribute('contenteditable')` 仍为 `null`、`isContentEditable` 恒 `false` —— 快捷键「输入态不拦截」若只查这两个属性，contenteditable 分支在 jsdom 下**永远测不到**，用例红 | 表象是「产品逻辑 bug」，实为测试环境能力缺口；真实浏览器三层属性均正常——盲目改产品逻辑会把真浏览器的正确行为改坏 | **① 输入态排除用三层检查**：`tagName`（INPUT/TEXTAREA，两端一致）→ `isContentEditable`（真实浏览器快路径）→ `contentEditable === 'true'` + `getAttribute('contenteditable')` 兜底（jsdom 与属性反射缺失环境）；**② 遇「只有 jsdom 红、浏览器对」先分诊环境能力缺口，不急着改产品断言** |
| B-37 | **服务端无 watch 模式，改 server 源码后必须「build + 重启进程」双步**（Phase 2 批 5 实测）：`apps/server/package.json` 只有 `build`（tsc）与 `start`（node dist/main.js），无 dev watch —— 批 5 新增 `GET /pages/:id/versions` 跑完 `pnpm -r build` 后**旧进程仍持旧路由表**，浏览器 DoD 首点「历史」即 `Cannot GET /api/v1/pages/p_b4_test/versions` 404，一度误判为「接口没实现」 | 404 表象指向「代码缺失」，实际代码与测试全绿——**typecheck/test 通过只证明代码对，不证明进程里跑的是新代码**（与 B-15/B-28 同族：静态验证 ≠ 运行时） | **① 改 server 源码的标准链：`pnpm -r build` → 杀 :3000 旧进程 → `pnpm start` 重启 → 查启动日志确认 `Mapped {/api/v1/pages/:id/versions, GET}`**（路由映射日志是新代码就位的硬证据）；② 前端三件套缓存仍走 B-31（build 包 → 清 `.vite` → 重启 dev），服务端没有对应缓存但有进程生命周期，两边都别漏 |
| B-38 | **vitest 2.1.9 聚合 coverage 满载 worker 时 RPC 超时污染 exit code**（Phase 2 批 6 实测）：`pnpm coverage`（`config/vitest.projects.ts` 聚合 5 项目、本机 24 核默认 23 worker、46 测试文件）稳定复现 `Timeout calling "snapshotSaved" RPC`，**用例实际全过却 exit ≠ 0**——门禁脚本判失败，连续两次复现排除偶发 | 超时发生在测试收尾的 RPC 通道（snapshot 汇总），不是任何用例红——表象像「测试 flaky」，实为**聚合模式下 worker 数与 RPC 超时的环境问题**，与业务代码无关 | 根 `vitest.config.ts` 设 **`maxWorkers: 8` + `minWorkers: 2` + `rpcTimeout: 180_000`** 限并发稳通道；**注：只设 `maxWorkers` 会抛 `RangeError: options.minThreads and options.maxThreads must not conflict`，必须成对设置**；改后 `pnpm coverage` 连跑 exit 0 稳定 |
| B-39 | **uni-app H5 运行中直接改 `location.hash` 跨会话导航会复用旧页面实例，权限态验证出假象**（Phase 2 批 6 实测）：admin 会话在 p_emp_list 渲染 3 条 → 退出登录 → designer 登录后改 hash 回同页，DOM **仍显示 admin 的 3 条且无 403 错误态**，而 network 显示 designer 会话确实拉了 `GET schema → 403` + `records → 0 条`——旧实例的 schema/数据未被新会话请求结果刷新 | 现象极像「页面级守卫失效 + 行级过滤失效」双重产品缺陷，服务端回读（403 `PAGE_FORBIDDEN` + 0 条）却完全正确——**导航手法制造了前端假象**，若据此改代码会把正确的错误分支改坏 | **权限态/会话相关验证一律：硬刷新（token 在 localStorage，reload 即新会话真实拉取）或真实菜单点击导航**；运行中改 hash 只适合同会话内页面切换的粗验证；遇「UI 与 network/服务端矛盾」先硬刷新二分「假象 vs 缺陷」 |
| B-40 | **NestJS 守卫依赖链：`@UseGuards(AuthGuard)` 的 Guard 注入 `JwtService`，其所在 module 必须 import 提供该 provider 的模块**（Phase 2 批 6 实测）：新建 `RbacModule` 挂 `RbacController`（用 AuthGuard），但 JwtService 在独立的 `common/auth.module.ts` —— DI 解析失败导致**进程启动期 V8 native crash**，vitest 表象为 `Worker exited unexpectedly`（无任何用例输出、无 Nest 错误栈），排查一度以为是测试代码问题 | DI 启动崩被 V8 崩溃**吞掉全部错误信息**，vitest 只报 worker 挂——**测试全挂 ≠ 测试代码错**，与 B-37「测试绿≠进程对」互为镜像 | **① 裸探针定位**：写独立脚本直接 `createApp()` + Nest 全量 logger，绕过 vitest 看真实错误（`Nest can't resolve dependencies of the AuthGuard (?) ... JwtService`）；**② 修法**：`RbacModule` 加 `imports: [AuthModule]`（IdentityModule 沿 `exports: [AuthModule]` 同款传导）；**③ 新建用 Guard 的 controller 先查 module imports 链再跑测试** |
| B-43 | **vitest/esbuild 不 emit decorator metadata：Nest 服务构造注入的裸类型参数在测试容器中为 `undefined`**（Phase 3 批 1 实测）：`FlowService` 写 `private readonly rbac: RbacService` 未加 `@Inject` —— 生产 `tsc` 构建有 metadata 正常，vitest 转译不产 → 注入 undefined，`canDecide → rbac.permsOf` 全部 `TypeError → 500`，**9 用例红且表象分散**（todo / decide / reject 各处）像是业务缺陷 | 静默注入 undefined **不报启动错误**（与 B-40「模块 imports 缺失 → 启动崩」互为镜像：一个崩启动、一个注入 undefined 运行期才炸）；500 分散多处易误判为流程逻辑问题 | **① 定位**：测试开 `logger: ['error']` 抓 `ExceptionsHandler` 真实栈（静默 logger 下 500 无从下手）；**② 修法**：补 `@Inject(RbacService)`；**③ 规范**：本仓库 Nest 构造注入**一律显式 `@Inject`** —— 既有 `record.service.ts` 全装饰风格的深层原因即此，新模块照抄勿用裸类型 |

---

## 📋 下一步计划（Phase 1 · 最小闭环 MVP）

**Phase 0 余项（环境/可选，不阻塞主线）**：

1. **Turborepo 引入**（可选；ADR-006 触发条件：包数 >10 或 CI 时长 >10min，当前不满足）
2. **mp 真机验证**（L-5 尾巴：装微信开发者工具导入 `dist/build/mp-weixin`）
3. **CI 首次实跑**（D-13/L-8：git init + 推送远端跑一次 Actions，修 runner 差异）

**Phase 1 批次（按依赖顺序，可并行）**：

4. ~~**设计器批 1：画布能渲染**~~ ✅ **2026-10-09 完成**（见「已实现 12」）
5. ~~**设计器批 2：能拖入删除**~~ ✅ **2026-10-09 完成**（见「已实现 13」；含 B-24/B-25 实测修正）
6. ~~**物料 meta ×12 + 注册表**~~ ✅ **2026-10-09 随批 2 合流完成**（TS 形态 13 项，面板展示 12；`material-map` 用例仍欠，L-6 未收）
7. ~~**服务端动态 CRUD**~~ ✅ **2026-10-10 完成**（方案 B JSON 存储 + 文件上传接口；9 接口 + server 93 测试 + 真实启动冒烟 18/18，见「已实现 15」）—— 与设计器批次并行的纯后端项已收口
8. ~~**设计器批 3：能配置保存**~~ ✅ **2026-10-10 完成**（见「已实现 14」；含 B-27 修正 + D-A9 注记）
9. ~~**运行时壳补全**~~ ✅ **2026-10-12 完成**（见「已实现 17」；登录页 + 应用菜单（`GET /apps/bootstrap` 最小实现，D-14）+ 统一渲染入口 `pageId → Schema`（published 优先回退草稿）+ `host.request` 自动带 Bearer；含引擎缺陷根治 **submit 动作失败不再恒 `ok:true`** + **B-31** dist/预构建缓存双坑 + **B-32** 多客户端覆盖）
10. ~~**页面↔模型字段绑定**~~ ✅ **2026-10-12 完成**（见「已实现 16」；决策 **D-A11** 双层配置：页面级提交模型 + 节点级字段绑定，全走 schema-ops 纯函数；含 **B-29** IPv6 回环被拦、**B-30** setApi 时序修正）
11. ~~**批 5 闭环 Demo**~~ ✅ **2026-10-14 完成**（见「已实现 18」；设计器拖「emp_form 员工信息登记」→ 绑模型字段 + 必填 + submit 动作 → 发布 v1 → H5 空提交红字拦截 0 请求 → 填写提交 200 → 服务端实查记录，**出口判据 1/2/3 全通**，Demo 脚本十步留档；含能力补齐 **D-A12 必填联动** / **D-A13 最小动作绑定** / textarea setter 与教训 B-33/B-34）

> Phase 0 剩余 3 项（上表 1~3）均为**环境/可选项**；**Phase 1 主线（第 4~11 条）已全部收口** —— 物料 12 个、设计器批 1~5、服务端 CRUD、运行时壳、出口判据闭环均完成，主方案 Phase 1 出口判据 1/2/3 全通（2026-10-14）；余项即 Phase 0 环境尾巴（mp 真机 / CI 实跑）与 Phase 2 归属（动作参数编辑器、列表页、页面 name 设置、乐观锁等，见「已实现 18」未做与偏差表）。

**Phase 2 批次（拆批方案见 `docs/phase2-plan.md`，出口判据 = 30 分钟搭「申请-列表-详情」+ 小程序跑通）**：

12. ~~**批 1：模型可视化建模**~~ ✅ **2026-10-14 完成**（见「已实现 19」；**D-P2-1** 设计器内视图切换 + `model-ops` 纯函数 + `ModelPanel` + `putModel`，服务端零改动；designer 135→167）
13. ~~**批 2：列表/详情标准页**~~ ✅ **2026-10-14 完成**（见「已实现 20」；**D-P2-2** 协议补 `DetailPageConfig` + `lc-list-page`/`lc-detail-page` + runtime 按 type 分发 + 设计器 list/detail 配置面板 + datasource model GET 修复，服务端零改动；renderer 161→179、designer 167→183、schema 66→72；D-15 遗留「列表页能看到」就此兑现）
14. ~~**批 3：物料 12→30**~~ ✅ **2026-10-14 完成**（见「已实现 21」；**D-P2-4** 18 物料对齐 `FieldType` 全集 + 方案缺口、**D-P2-5** 统一契约零新增 shim、**D-P2-6** setter 补 optionList/color；META 13→31 展示 30、designer 映射 11→29、demo fixture 30 全量演示，服务端/协议零改动；renderer 179→210、designer 183→192，测试 649→689）
15. ~~**批 4：设计器可用性**~~ ✅ **2026-10-14 完成**（见「已实现 22」；**D-P2-7** 撤销不引 immer——不可变快照双栈 + watch 单一入栈接缝、大纲树左栏页签双向联动、内存剪贴板跨页粘贴 + `keyboard.ts` 快捷键分发纯函数；**D-P2-3 已修**（新建页 name = pageId，服务端回读实证）；designer 192→223，测试 689→720）
16. ~~**批 5：版本管理 UI**~~ ✅ **2026-10-14 完成**（见「已实现 23」；**D-P2-8** 服务端补 `GET /pages/:id/versions` 轻量列表端点、**D-P2-9** 自研 `diffSchema` 结构化 diff 零依赖（id 对齐、子树只报顶层、基线=当前画布）、HistoryDialog 手写 modal + 两步确认回滚 + 回滚后 `openPage` 重载清栈；记 **B-37** 服务端无 watch 须 build+重启；designer 223→257、server 98→101，测试 720→757）
17. ~~**批 6：权限 RBAC**~~ ✅ **2026-10-15 完成**（见「已实现 24」；**D-P2-10** rbac.json 单文件配置 + 种子回退、**D-P2-11** `RbacService` 四层判定（页面级 schema 守卫 403 `PAGE_FORBIDDEN` / 按钮级 perms 并集下发 + renderer 整节点不渲染 / 模型 CRUD 403 `PERMISSION_DENIED` / 行级 dataScope self·`'*'` 豁免）、**D-P2-12** RbacPanel 权限管理视图 + 节点 perm setter + 模型数据权限区块；服务端 rbac 五件套 + AuthModule 拆分、runtime `lc_perms` fail-closed + 403 错误态；**D-14 收口**（login/bootstrap 扩 `perms`）；记 **B-38**（coverage 聚合满载 RPC 超时→限并发）、**B-39**（uni 运行中改 hash 复用旧实例假象）、**B-40**（Nest 守卫依赖链 DI 启动崩表象为 worker 挂）；designer 257→281、server 101→115，测试 757→795）
18. ~~**批 7：出口判据 Demo + 多端打包**~~ ✅ **2026-10-15 完成**（见「已实现 25」；请假申请三页 Demo 全流程十步留档——表单/列表/详情绑 `m_leave` + 校验拦截 + 提交落库 + rid 详情 + 返回闭环；**B-41** 物料 defaultProps 6 处 `$expr:` demo 残留清理、**D-P2-13** 受控物料回显兜底（renderer `bindProps`：value 未配置时自动读 `formData[name]`，存量页面同步受益）；mp 分包（demo 页挪 `subPackages`）+ `build:mp-weixin` 产物验证（主包 209.7KB/2MB 限 · 10.2%，分包 1.33KB）；记 **B-42**（workspace 聚合 coverage 限并发继承不可靠 → 停 dev 服务 + CLI `--maxWorkers`）；renderer 210→214，测试 795→**799**）—— **Phase 2 七批全部收口**

**Phase 3 批次（拆批方案见 `docs/phase3-plan.md`，2026-10-15 立项与负责人对齐：5 批、导出/消息裁剪；出口判据 = 带审批的申请应用：提交 → 待办 → 同意 → 状态变更 + 时间轴可见；门户图表 + 主题换色生效）**：

19. ~~**批 1：流程引擎核心（状态机）**~~ ✅ **2026-10-15 完成**（见「已实现 26」；**D-P3-1** `FlowSchema` 协议 + `validateFlow` + 推进语义（start 自动过 / approve 停建任务 / condition 假跳过 fail-open / reject 回退或终止 / end setField）、服务端 flow 模块 **7 接口** + **记录提交联动启动实例**（弱保证）、**D-P3-2** assignee 判定（starter / role 命中 / `'*'` 豁免、dept 降级）、**D-P3-3** `RECORD_REPOSITORY` @Global 化防循环 imports + decide 先回写记录再落实例；protocol.md §10.1 流程组 + §10.3 错误码 +5；记 **B-43**（vitest/esbuild 不 emit decorator metadata → 构造注入必须显式 `@Inject`）；schema 72→87、server 115→135，测试 799→**834**）
20. ~~**批 2：审批物料 + 待办中心**~~ ✅ **2026-10-16 完成**（见「已实现 27」；`ApprovalBar`/`Timeline` 物料 + `LcFlowHost` 注入通道 **D-P3-4** + `$expr` recordId 绑定 **D-P3-4b** + 待办两页 **D-P3-5** + 单实例接口 **D-P3-6** + **B-44** vite optimizeDeps 双实例教训；测试 834→**846**）
21. ~~**批 3：本地草稿 + 主题配置**~~ ✅ **2026-10-19 完成**（见「已实现 28」；**D-P3-7** `DraftStore` 可选注入（未注入零影响）+ controller 时机（变更存/全空清/onMount 恢复确认/提交与 reset 清）+ runtime `createUniDraft` 用户隔离 7 天过期；**D-P3-8** `apps.json` + `GET/PUT /apps/config`（写仅 `'*'`、patch 缺键保留/null 清除、400 `APP_CONFIG_INVALID`）+ bootstrap `theme` + `deriveBrandPalette` 十档派生覆盖 `--lc-brand-*` 全站变色 + radius 覆盖 + 缓存兜底；**D-P3-9** 显式 dark 覆盖系统偏好且监听让位；designer 第三视图 `ThemePanel` + 保存即设计器自身换肤；实测发现并修 **dark 块 `--lc-action-primary` 硬编码**（inline 补笔两态通吃）；测试 846→**924**，冒烟 `smoke-p3b3.mjs` 12/12）
22. ~~**批 4：图表物料 ×3 + Portal 页型**~~ ✅ **2026-10-20 完成**（见「已实现 29」；**D-P3-10** `Chart` 柱/折/饼纯 SVG（R10 风控）+ `Statistic` + `chart-svg.ts` 纯函数 + 客户端聚合（`size=min(limit*20,100)`）；**D-P3-11** `PortalPageConfig` 卡片导航 + `root` 拖拽区共存（不进 `isStdPage`）；renderer `exports` 补子路径 + `uni-exports` 回归锁；H5 + 设计器双实测；记 **B-46**（Vue warn 洪泛致 RPC 超时，并勘误 B-45 `rpcTimeout` 不存在）、**B-47**（`.vite` 预打包缓存）、**B-48**（`uni.async.error` 误判）；测试 924→**965**，冒烟 `smoke-p3b4.mjs` 13/13）
23. ~~**批 5：埋点与错误上报 + Schema Profiler**~~ ✅ **2026-10-20 完成**（见「已实现 30」；**D-P3-12** 服务端 `ops/` 事件表环形 500 + 三接口（写=登录 / 读=`'*'`）+ `OPS_INVALID` 与截断策略；**D-P3-13** renderer `createOpsQueue` + runtime `createUniOpsReporter` + 5 类事件接线 + onHide/onUnload flush（不白屏沿用 `exprError`/`skipped`）；**D-P3-14** controller `stats` + `formatPerf` 共享 + runtime `?perf=1` 角标 + 设计器顶栏徽标（`LcCanvas @rendered`）；测试 965→**1006**，冒烟 `smoke-p3b5.mjs` 23/23）—— **Phase 3 五批全部收口**

> 批 1→2 是主链；批 3/4/5 独立可插空，建议顺序 1 → 2 → 3 → 4 → 5（与 phase3-plan §3 一致）。**五批已于 2026-10-20 全部完成。**

---

## 变更日志

| 日期 | 批次 | 内容 | 验证结果 |
|---|---|---|---|
| 2026-09-29 | Phase 0 · 第 1 批 | Monorepo 骨架、`@lc/schema`（协议+校验+迁移）、`@lc/expression`（词法/语法/求值/安全/依赖提取） | typecheck ✅ / build ✅ / test ✅ 168 passed |
| 2026-09-29 | Phase 0 · 第 2 批 | `@lc/renderer` 纯逻辑层（path/context/build/linkage/resolve/validator/datasource/action/lifecycle/controller 共 10 模块）+ uni 组件层骨架（3 文件未验证）；修复缺陷 B-8~B-12 | typecheck ✅ / build ✅ / test ✅ **282 passed**（schema 51 + expression 117 + renderer 114） |
| 2026-09-29 | Phase 0 · 第 3 批（第 1 项） | **D-7 解决，选型 C**：受信任 `app` API（`setFormData/getFormData/setAppData/loadDs/toast/navigate/back/confirm`）注入生命周期作用域；协议 `LifecycleHook = string \| string[]` 多步执行；渲染期作用域不含 `app`（负向用例锁定）；修复 B-13（`$expr:` loop 误报）、B-14（数组钩子依赖丢失）；方案 3.4/7.2/3.1 与本文件 D-7/D-8 已回写 | typecheck ✅ / build ✅ / test ✅ **318 passed**（schema 56 + expression 117 + renderer 145） |
| 2026-09-29 | Phase 0 · 第 3 批（第 2 项） | **`apps/server` 服务端骨架**：NestJS 11（ESM/NodeNext）+ 登录（scrypt + HS256 JWT，防枚举）+ 页面 5 接口（validate / GET-PUT schema / publish / rollback）+ `PageRepository` JSON 文件仓储（**D-9**）+ 8.4 版本模型；根脚本改 `pnpm -r` 全量递归；修复 B-15（CJS 具名导入真实启动崩）、B-16（POST 默认 201 级联）；方案「实施状态 / Phase 0 表 / D-9」已回写 | typecheck ✅ / build ✅ / test ✅ **356 passed**（schema 56 + expression 117 + renderer 145 + server 38）+ 真实启动冒烟 ✅ |
| 2026-09-29 | Phase 0 · 第 3 批（第 3 项） | **`docs/protocol.md` v1.0 协议规范**（524 行 / 11 章 + 2 附录）：Expr / Page / **Action 15 种** / Material / Model / App 六协议 + 33 校验错误码 + `PageControllerOptions` + migrate 抛错语义 + 服务端 7 接口契约 + `app` API 清单；编写中逐条核对实现并修正文档自身 8 处硬伤（示例 JSON 语法、`props.rules` 挂载位置、回调表、`unsupported` 形状等）；修复 **B-17**（方案/台账/源码注释共 12 处数字勘误：51→37、16→15、21→19、17→18、18→20、22→45）；方案「Phase 0 协议评审」已回写 | typecheck ✅ / build ✅ / test ✅ **356 passed**（schema 56 + expression 117 + renderer 145 + server 38） |
| 2026-10-08 | Phase 0 · 第 3 批（第 4 项） | **`packages/runtime` uni-app 运行时壳**（CLI/Vite 路线 **D-10**、npmmirror **D-11**、easycom 三规则 **D-12**）：手写 JSON demo + 3 物料 + `RuntimeHost`；**H5 浏览器实测全链路**（3 组件渲染 / 表达式 42 / 输入联动 / toast 动作）；`build:h5` + `build:mp-weixin` 产物验证（wxml `wx:if` 分发链 + `bindchange`）；修复 **B-18**（lc-node 缺 Page 容器分支）、**B-19**（递归未绑 `@change` 致嵌套节点改值视图不刷新）；**Phase 0 出口判据达成**；L-5 更新为「H5 已验、mp 真机待验」；方案 Phase 0 表 / 出口判据已回写 | typecheck ✅ / build ✅ / test ✅ **356 passed** + H5 dev 实测 ✅ + 双端构建 ✅（**注**：本行原误记 09-30，已于第 5 项更正为实际交付日 10-08） |
| 2026-10-08 | Phase 0 · 第 3 批（第 5 项） | **CI 与覆盖率**：根加 `@vitest/coverage-v8` + `config/vitest.projects.ts` 聚合 4 项目 + `vitest.config.ts`（统计范围 + 阈值 90/85/90/90 强制）；**实测 95.6%**（分包 schema 96.05 / expression 93.84 / renderer 97.42 / server 94.82，**方案 9.2 硬指标达成**）；定向补 10 个负向用例（schema 87.94→96.05）+ barrel 导出 smoke 2 用例；`.github/workflows/ci.yml`（含 coverage 阈值 + 服务端启动冒烟 + 体积告警，**未实跑 D-13/L-8**）；修复 **B-20**（vitest 向上发现 workspace 致 `pnpm -r test` 全挂 → 移 `config/` 隔离）；顺带更正第 4 项日期笔误；方案 L1169/1195/1196 已回写 | typecheck ✅ / build ✅ / test ✅ **368 passed**（schema 66 + expression 117 + renderer 147 + server 38）+ coverage ✅ 阈值强制通过（当日口径） |
| 2026-10-09 | Phase 0 · 收尾（第 7 项） | **组件层冒烟测试**：`@lc/renderer` 加 `@vue/test-utils` + `jsdom` + `@vitejs/plugin-vue`，包级 `vitest.config.ts`（plugin-vue + 仅 `test/uni/**` 走 jsdom）；`test/uni/lc-node.test.ts` **7 用例**（分发 / visible / **B-18 容器回归** / 未知兜底 / **B-19 冒泡回归** / renderer 全链联动 / 动作→toast）；**uni 层 `.vue` 纳入覆盖率统计**（口径更新：总 95.6→95.53、分支 86.71→88.3、renderer branches 89.74→93.85）；`material-map.ts` 无用例（L-6）与 jsdom 无法渲染真实物料的边界已在「已实现 8」声明 | typecheck ✅ / build ✅ / test ✅ **375 passed**（schema 66 + expression 117 + **renderer 154** + server 38）+ coverage ✅ 95.53/88.3/97.06 过阈值 |
| 2026-10-09 | Phase 0 · 收尾（第 8 项） | **ADR 架构决策记录**：`docs/adr/` README（索引 + 模板 + 状态机）+ 6 篇 —— 001 静态物料注册/自研表达式（D-2）、002 表达式禁赋值 + 受信 app API（D-7/D-8）、003 纯逻辑层 + RuntimeHost 注入（B-15）、004 JSON 文件仓储（D-9）、005 uni CLI 工程 + easycom 三规则（D-10~12）、006 pnpm -r + 覆盖率门禁（D-4/D-13/B-20）；全部由已落定决策归纳，不发明新内容；与方案 2.4 分工互补 | 文档交付（无代码变更，全量回归保持 375 passed） |
| 2026-10-09 | Phase 1 · 第 1 批 | **物料库归位与 12 物料**：新建 `packages/materials`（`@lc/materials`，easycom 规则三改指 `@lc/materials/src/$1/index.vue`）；3 迁移 + 8 新写（Textarea/NumberInput/Radio/Select/Switch/Upload/Image/Divider）+ Page/FormGroup 容器（lc-node 内联分组头）；lc-node 分发扩至 11 路 + **矩阵用例**；修复 **B-21**（PowerShell 默认编码破坏 UTF-8 物料文件）；coverage 加 `packages/materials/**` 排除口径（不排除实测跌至 73.49%）；H5 实测 + 截图 `docs/screenshots/phase1-materials-h5.png`；「已实现 10」已回写 | typecheck ✅ / build ✅ / test ✅ **376 passed**（renderer 155）+ coverage ✅ **95.57/88.24/97.06/95.57** + H5 实测 ✅ 20/20 断言 + 6 交互回归 |
| 2026-10-09 | Phase 1 · 设计方案 | **`docs/designer-plan.md` Web 拖拽设计器落地方案**：现状盘点（7 缺口）+ **D-A1 画布渲染**（同进程 + uni-shim 7 标签 + rpx→px，维持主方案 D6；否决 iframe 画布/每物料占位版）+ D-A2~A7（designMode/schema-ops/meta 注册表/自研 DnD/保存链路/Pinia）+ 4 批实施计划 + 7 风险；「已实现 11」已回写 | 文档交付（无代码变更） |
| 2026-10-09 | Phase 1 · 设计器批 1 | **画布能渲染**：新建 `packages/designer`（shim 3 组件 + **enhance.ts 直出标签增强器** + material-map 11 条 + LcCanvas + demo fixture）+ `apps/designer-web`（Vite + **rpx→px postcss 插件** ×0.5 + 三栏布局 + Pinia + EP 引入）；lc-renderer `mode=design`（provide/inject 设计状态 + select 冒泡 + 遮罩选中 + 动作拦截，renderer 155→**157**）；修复 **B-22**（view/text/image/switch 是 SVG 标签被 Vue 直出 → 组件 shim 无效 → CSS 兜底 + 增强器，「不替换节点」原则）、**B-23**（Vue 对未知元素写 `checked="false"` 字符串 → hasAttribute 误判 → isOn/isDisabled 排除 "false"）；3 物料 `onInput` 加 `e.target.value` 双端回退；designer 新增 **12 用例**；`config/vitest.projects.ts` 聚合加 designer；designer-plan §4.1/R2/批 1 行 + 台账「已实现 12」已回写；浏览器实测 + 截图 `docs/screenshots/designer-batch1.png` | typecheck ✅ 6 包 / test ✅ **390 passed**（+designer 12）/ coverage ✅ **95.57/87.76/96.35/95.57** exit 0（designer 分组 stmts 95）/ 浏览器实测 ✅ 12 物料 + rpx 0 残留 + 4 项交互 + 嵌套选中 + 0 error |
| 2026-10-09 | Phase 1 · 设计器批 2 | **能拖入删除**：core 层 `schema-ops`（generateNodeId/insert/remove/move/updateProp 等 9 纯函数）+ `anchor`（三态锚点）+ `dnd`（MIME/类型）+ **Pinia store**（insertMaterial/moveByDrop/removeById/moveById/setProp/select）+ **物料面板/属性面板**（META TS ×13 分组、settings 三列只读）+ 画布 DnD 指示线与 **自研 mouse 拖拽** + App 接线（Delete/Backspace 键删、root 禁用）；materials 补 `meta/*.ts` ×4 分组 + barrel（**D-A8**：meta TS 形态/store+面板归 designer/insertNode 签名微调/指示线 fixed）；修复 **B-24**（lc-renderer 一次性构造 controller → schema 替换不刷新 → shallowRef+watch 重建 + selectedId 受控 prop）、**B-25**（SVG 遮罩 HTML5 DnD 会话不建立 → 节点换位自研 mouse 手势，双机制共用 anchor）、**B-26**（VTU attachTo 需 Vue 3.5 + detached 树切断 window 冒泡 → 手动 append + afterEach）；designer-plan §4.4/§4.5/§4.8(D-A8)/§5 批 2 行/R5+ 已回写 | typecheck ✅ 6 包 / test ✅ **462 passed**（designer 81 + renderer 160 + schema 66 + expression 117 + server 38）/ coverage ✅ **95.96/87.83/96.25/95.96** exit 0 / 浏览器实测 ✅ 拖入（defaultProps+选中+重渲染）+ 换位（into/before 双态）+ 上移下移/删除/Delete 键/root 禁用 + settings 列出（Input 6/Button 3）+ 指示线真实坐标 + 0 error（**截图待补**：桌面窗口不可见限制） |
| 2026-10-10 | Phase 1 · 设计器批 3 | **能配置保存**：`PropsPanel` 重写为 **4 setter 原生控件表单**（input 实时 / number 清空→undefined / switch boolean / select 按 options 反查原值）+ 未支持 setter 只读占位 + `readNodeValue`（与 updateProp 对称读）；store 批 3（`pageId/saveState/statusText/validation` + **`touch()` 即时校验** + **`DesignerApi` 注入** + openPage/save/publish/newPage，**校验不过不发 PUT**、publish 自动先存）；designer-web `api.ts`（首请求自动登录 admin/admin123 + Bearer + 错误 message 透传）+ vite `/api→:3000` 代理 + 顶栏 pageId/打开/新建/保存/发布/状态徽标 + 底栏校验错误列表；修复 **B-27**（demo fixture `schemaVersion` 须三段 semver `'1.0.0'`，首跑校验即抓出）；**D-A9** 6 条决策注记回写 designer-plan §4.9、§5 批 3 行、文末状态 | typecheck ✅ 6 包 / test ✅ **482 passed**（designer 101，+20 新用例）/ coverage ✅ **96.06/87.75/96.43/96.06** exit 0 / 浏览器实测 ✅ 保存建档 + reload 回读一致 + 改 label 三处即时同步 + disabled 生效 + 重复保存幂等 + 发布 v1 + 校验错误底栏/本地阻断/打开恢复 + 打开不存在页 error + 0 JS error（**截图待补**：OS 窗口不可见） |
| 2026-10-10 | Phase 1 · 服务端动态 CRUD | **方案 8.3 与 12.5 落地**：`model/`（`GET /models` 摘要、`GET/PUT /models/:id` upsert 建档、`validateModel`+`checkExpr` 与前端同源 + 字段 key/type 白名单 + 系统保留名拦截）、`record/`（**sanitize → 类型 → `checkRule` 三步不信任前端校验**、filter 等值严格类型 + sort + page/size 上限 100、软删、审计字段服务端权威、合并后整体再校验）、`file/`（multipart 10MB 限 + `defParamCharset:'utf8'` 修中文名乱码 + `GET /files/:fileId` 公开读取）+ 全局 `StorageModule`（`DATA_DIR` 提升 `@Global()`）；server 加依赖 `@lc/renderer`（`checkRule` 同源，不写第二套校验）；修复 **B-28**（`dist/main.js` 内容与源码不一致 —— 混入 `useStaticAssets` 静态挂载绕过文件控制器路由致 `Cannot GET` 404，重建产物后恢复，冒烟 17→**18/18**）；**protocol.md 第 10 章修订**（新增 9 接口契约 + 10.4 查询语义 + 服务端错误码 11→19 + Issue 码子表，协议结构未变故不升 `schemaVersion`）；主方案 8.3 实现状态/12.5 裁剪对照/Phase 1 表已回写；「已实现 15」「下一步 7」「B-28」已回写 | typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **537 passed**（server 38→93，+55 新用例）/ coverage ✅ **96.06/87.41/96.90/96.06** exit 0（分包 stmts schema 96.05 · expression 93.84 · renderer 97.26 · designer 97.42 · server 95.60）/ **真实启动冒烟 ✅ 18/18 连跑两遍幂等** |
| 2026-10-12 | Phase 1 · 页面↔模型字段绑定 | **决策 D-A11 双层字段绑定**：schema-ops 新增 `setSubmitModel` / `readSubmitModel` / `SUBMIT_DS_ID`（纯函数：页面级 upsert 固定 `ds_submit` 一条 `{type:model, method:POST, modelId}` + `submit.dataSourceId`，传 `null` 清除且**不误伤用户自建源**；`ds_submit` 原位替换保 diff 稳定；读写路径严格对称）；store 扩 `DesignerApi.listModels/getModel` + state `models/modelFields/fieldsModelId/modelError` + getter `submitModelId`（由 schema 推导）+ `loadModels(force)` / `loadModelFields`（按 `modelId` 缓存、失败清空防残留他模型字段）/ `setSubmitModel` / `setFieldBinding`；PropsPanel 加「提交模型」（页面级，与选中态无关）与「绑定字段」（`selectedMeta.hasField`）两区块 + 引导文案 + 错误红字**不静默**；designer-web `api.ts` 加两方法、**App.vue `setApi` 上提 setup 顶层**（**B-30**：父 mounted 晚于子，首屏 `modelError`）；顺带修 **B-29**（本机 `::1` 被 EACCES 拦 → server 测试 `app.listen(0)` 绑 `::` 致 34 用例全红、vite 默认绑 localhost 致 dev 502 → 3 处显式绑 `127.0.0.1`）；「已实现 16」「下一步 10」「B-29/B-30」已回写 | typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **559 passed**（designer 101→123，+22 新用例）/ coverage ✅ **96.13/87.58/96.98/96.13** exit 0（designer 分包 stmts 97.42→**97.52**）/ 浏览器实测 ✅ 5 点 + 服务端落库 **6/6 PASS**（下拉列 2 个真实模型 → help 显示 `POST /models/m_employee/records` → 字段下拉 3 字段来自服务端 → 绑定后与 settings「字段名」同步 → 保存后服务端 `ds_submit`/`submit`/`n-input.props.name` 三处全落库） |
| 2026-10-12 | Phase 1 · 运行时壳补全 | **下一步第 9 条收口（批 5 闭环唯一缺口）**：服务端 `PageRepository.list()` + 文件实现 + **`GET /apps/bootstrap`**（`{user, apps[]}` 按 appId 分组，**D-14** 最小实现：无独立应用实体、不含权限；8.3 12→**13/20**）；runtime 新增 `api.ts`（会话 + 登录/bootstrap/fetchPageSchema：**published 优先、409 回退草稿**）+ `host.ts` **request 自动补 origin 与 Bearer**（renderer 对登录态零感知）+ 4 页（登录 / 应用菜单 / **view 统一渲染入口 `pageId→Schema`** / 静态 demo 挪位）+ `pages.json` 4 页注册 + vite `host:'127.0.0.1'`（B-29 同款）；**根治引擎缺陷**：`submit` 动作原先恒 `ok:true`（`controller.submit()` 失败结果被 `.then(()=>undefined)` 丢弃 → 服务端 400 拦截后仍 toast「提交成功」）→ `onSubmit` 透传 `{ok,error}` + `case 'submit'` 据实返回 + 壳层失败必 toast；排障修 **B-31**（workspace 包消费 dist + uni 依赖预构建缓存，**先 build 包 → 清 `.vite` → 重启 dev** 三步顺序）与 **B-32**（开着的设计器 tab 覆盖 published，联调期同页单客户端）；「已实现 17」「下一步 9」「B-31/B-32」「D-14」已回写 | typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **565 passed**（server 93→**98**、renderer 160→**161**）/ coverage ✅ **96.12/87.50/97.00/96.12** exit 0（分包 stmts schema 96.05 · expression 93.84 · renderer 97.26 · designer 97.52 · server 95.62）/ runtime **`build:h5` + `build:mp-weixin` 双端 DONE** / 浏览器实测 ✅ **7 点全过**（未登录守卫 → 空密码红字 → 登录进菜单分组 → `pageId` published 动态渲染标题跟随 → **提交双向**：空表单 400 拦截 toast 可见 + 填「张三」提交成功**服务端落库实查 1 条** → 401 错误态去登录 **redirect 回跳** → 退出清会话） |
| 2026-10-14 | Phase 1 · 批 5 出口判据闭环 | **下一步第 11 条收口（Phase 1 主线完成）**：设计器能力补齐三项 —— **D-A12 必填联动**（settings「必填」开关 = 星号 `props.required` + 校验 `props.rules` 一处控制，修「开了必填只出星号、提交不拦」断层）、**D-A13 最小动作绑定**（属性面板「事件 → 动作」区块，无参动作可写 / 有参占位 Phase 2，Button submit 扳机首次有 UI）、**textarea setter**（第 5 种，Text 标题可改）；落点全在 designer 包（schema-ops +`setRequiredRule/readRequiredRule`、store `setProp` required 联动 +`setNodeAction`、PropsPanel 两处 UI），renderer/schema/server 零改动；**出口判据 1/2/3 全通**（emp_form 拖搭 → published v1 → H5 空提交红字拦截 0 请求 → 填写提交 200 → 服务端实查 `张三/技术部/admin`，**Demo 脚本十步留档「已实现 18」**）；记 **D-15**（判据 3「列表页」裁剪为服务端查询）、**B-33**（dev 预构建半成品：ready 49s 异常信号 + 对照实验分诊）、**B-34**（fill 错位污染 `v-model` 直连的 pageId）；收尾 polish：**emp_form 菜单撞名已解决**（API 改 `schema.name` →「员工信息登记」+ republish v3 + 刷新设计器同步内存，runtime 菜单实测并列无撞名）；「已实现 18」「下一步 11」「D-15」「B-33/B-34」已回写 | typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **577 passed**（designer 123→**135**，+12）/ coverage ✅ **96.19/87.71/97.05/96.19** exit 0（designer 分包 stmts 97.52→**97.69**）/ 浏览器实测 ✅ **出口判据十步全过**（截图仍受 OS 窗口不可见限制，沿批 2~4） |
| 2026-10-14 | Phase 2 · 批 1 模型可视化建模 | **Phase 2 开工（拆批方案 `docs/phase2-plan.md`，7 批）**：**D-P2-1** 设计器内视图切换（顶栏「数据模型」↔ 画布，复用登录态/布局/DesignerApi，不新开应用）；`core/model-ops.ts` 新增模型编辑纯函数（字段行增删改/排序 + enum 选项串解析 + `modelErrors` 门禁——**复用协议 `validateModel` 与服务端单一事实源** + id 格式对齐 `MODEL_ID_RE`）；store 扩视图态与模型编辑态（10 actions）+ `DesignerApi.putModel`；`ModelPanel.vue` 列表↔编辑视图（字段表格：key/展示名/type×14/required/enum options/上下移/删除）；服务端**零改动**；**DoD 五点全过**（列表列真实模型 → 新建 `m_leave` enum/number·required/text → 保存 → 服务端逐项核对 + 往返一致 → 门禁红字不发 PUT → 回画布无损）；记 **B-35**（自动化脚本中断留半编辑态 + `nextFieldKey` 复用释放 key 致行数错位——服务端回读发现并纠正）；「已实现 19」「下一步 12」「phase2-plan 批 1」已回写 | typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **609 passed**（designer 135→**167**，+32：model-ops 17 + store/面板 15）/ coverage ✅ **96.30/87.50/96.45/96.30** exit 0（designer 分包 stmts 97.69→**97.73**）/ 浏览器实测 ✅ **DoD 五点全过**（含门禁红字与往返一致性；截图仍受 OS 窗口不可见限制） |
| 2026-10-14 | Phase 2 · 批 2 列表/详情标准页 | **D-P2-2 协议补位 `DetailPageConfig`**（`PageSchema.detail?` + validate 对称校验 detail/detail.modelId）+ **标准页渲染双件**：`lc-list-page`（records 查询 page/size/sort 透传 + 列三级降级 columns→模型全部→记录键 + 「加载更多」追加 + 前端包含搜索 + 点行 emit navigate）/ `lc-detail-page`（`filter={"id":rid}` 定位单条 + fields 过滤 + 返回 emit back/配 backPageId emit navigate + 未找到红字）—— 跳转**事件上抛不扩 RuntimeHost**（沿 D-A2 分层，renderer 零 uni 依赖）；**修复 datasource model GET**（params 此前被丢弃 → 拼 query string，filter 对象按服务端契约 JSON 序列化，POST 不变）；runtime view 按 `schema.type` 三分发 + onLoad 收 `rid` + easycom 两精确规则（须在 `^lc-(.*)$` 兜底前）；designer `setPageType/updateListConfig/updateDetailConfig`（切类型骨架初始化已有保留、**换模型重置列/字段**、起底与 patch 显式带列豁免）+ store 三 actions + `boundModelId` **单一字段源 watch** + PropsPanel 页面类型下拉与 list/detail 配置区块 + 画布 `std-hint` 提示条；服务端**零改动**；**DoD 五点全过**（配置发布 v1 → 服务端回读逐项一致 → 列表 2 条中文列名 → 点行进详情 rid 定位返回 → 提交后列表即时可见 3 条 createdAt:desc）；记 **D-P2-3**（新建页 name 未随 pageId 初始化，demo 模板名「画布演示」残留致菜单撞名）；「已实现 20」「下一步 13」「phase2-plan 批 2」已回写 | typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **649 passed**（schema 66→**72**、renderer 161→**179**、designer 167→**183**；组件测试首走 `test/uni/**` jsdom 通道）/ coverage ✅ **96.41/87.43/96.67/96.41** exit 0 / 浏览器实测 ✅ **DoD 五点全过**（designer 配置 + runtime 列表/详情/提交闭环 + 服务端回读；截图仍受 OS 窗口不可见限制） |
| 2026-10-14 | Phase 2 · 批 3 物料 12→30 | **D-P2-4 18 物料定稿对齐 `FieldType` 全集 + 方案缺口**（表单 9：DatePicker/DateTimePicker/MoneyInput/Checkbox/Picker/UserPicker/DeptPicker/Cascader/FileUpload、数据 3：Detail/Cell/List、导航 2：Tabs/SearchBar、反馈 2：Rate/Progress、基础 2：Tag/Icon）——展示 12→30、META 13→31、designer 映射 11→29、lc-node +18 分支；**D-P2-5 统一契约 + 零新增 shim**（`props{name,label,value,required,disabled,error}` + `emit('update',{name,value})` 一期同款；Checkbox 纯 view 模拟、Cascader 逐级 picker 链、FileUpload 走 `uni.chooseFile` + PC shim polyfill、List/Tabs 载荷经 `scope.eventData` 注入）；**D-P2-6 setter 补 optionList（选项行增删改 + 数字串保型 number）与 color（`input[type=color]` + 非法兜底）**，expression 留批 4 D-A11、5 个复杂 setter 维持占位；demo fixture 12→30 全量演示（+f8~f18 受控字段）；**DoD 五点全过**（面板 30 项 6 分组 / 画布 32 遮罩 + 拖入 Rate·Cascader / 发布 demo **v13** → H5 探针 25/29 + 5 类占位 + 无「未知组件」+ console 零错误 + Rate 点星·Checkbox 勾选受控交互 / optionList 改名增删写回 + color 写回 / **服务端回读 v13·published·31 节点 18 新物料全在（B-35）**）；新增 renderer **分发遍历锁**（29 叶子 + FormGroup 容器，漏挂分支即红）与 designer **`meta-sync` 同步锁**（31 项唯一/分类合法/order 不重复/29 叶子映射齐备）+ panel optionList/color 三用例；既有 **8 处 demo 数量断言联动**（store/canvas/dnd/panel 12→30，color 占位用例改「已实现」正断言）；「已实现 21」「下一步 14」「D-P2-4/5/6」已回写 | typecheck ✅ exit 0 / build ✅ 5 包 Done / test ✅ **689 passed**（renderer 179→**210**、designer 183→**192**；schema 72 + expression 117 + server 98 不变）/ coverage ✅ **96.21/87.57/96.21/96.21** exit 0（designer panel stmts 99.85 · core 99.75、renderer uni 94.87/core 97.23）/ 浏览器实测 ✅ **DoD 五点全过**（截图仍受 OS 窗口不可见限制） |
| 2026-10-14 | Phase 2 · 批 4 设计器可用性 | **D-P2-7 撤销不引 immer 改「不可变快照双栈」**（schema-ops 16 op 全线 clone-then-replace 已提供不可变性；store `watch(schema)` 单一入栈接缝防漏 13 个变更入口、pre flush 合并 setProp required 联动双写为一栈、`replaceSchema` 吞栈清栈防跨页数据事故、栈上限 50 丢最旧、`clipboard` 换页不清）+ **大纲树** `OutlineTree.vue`（左栏「物料/大纲」页签、扁平化树行 34 行、点击 ↔ 画布双向选中、折叠/选中自动展开父链 `ancestorIds`、行内删除 root 保护）+ **复制粘贴**（`schema-ops` +`cloneSubtree`/`remapIds` 递归换 id/`pasteNode` 三定位规则；`core/keyboard.ts` `resolveKeyIntent` 纯函数分发 Ctrl/Cmd+Z·Shift+Z·Y·C·X·V·Delete，输入态一律不拦截；顶栏撤销/重做/复制/剪切/粘贴五按钮 disabled 联动）+ **D-P2-3 修复**（`newPage` 的 `schema.name = pageId`，菜单撞名消除）；新增 history/clipboard/keyboard/outline **四测试文件 31 用例**（designer 192→223：10 步撤销双向、跨页粘贴、栈上限、输入态排除、树联动全锁），排障记 **B-36**（jsdom `contenteditable` 不反射 → 输入态排除三层检查兜底）；「已实现 22」「下一步 15」「D-P2-7」「D-P2-3 已修」「B-36」「总览/未实现表」已回写 | typecheck ✅ exit 0 / build ✅ 6 包 Done / test ✅ **720 passed**（designer 192→**223**；schema 72 + expression 117 + renderer 210 + server 98 不变）/ coverage ✅ **96.36/87.55/96.5/96.36** exit 0（门禁 90/85/90/90）/ 浏览器实测 ✅ **DoD 五点全过**（①10 步 34↔44 精确双向 ②跨页粘贴新 id `n_mv7t2h49b` ③大纲双向联动/折叠/删除 ④服务端回读 `name=p_b4_test`·33 节点 B-35 ⑤Delete 回归 + console 零错误；截图仍受 OS 窗口不可见限制） |
| 2026-10-14 | Phase 2 · 批 5 版本管理 UI | **D-P2-8 服务端补只读 `GET /pages/:id/versions`**（台账原判「versions 已有」实为数据结构与 rollback 接口已有、**列表查询端点缺失**；轻量元数据倒序不含 schema 全文，查全文走既有 `?version=vN`，repo 零改动，协议登 protocol.md §10）+ **D-P2-9 自研结构化 diff `core/schema-diff.ts` 零依赖**（`diffSchema(before, after)` 按节点 id 对齐；add/remove 子树只报顶层、change 逐 props 键 + componentName（JSON 比较 80 字符截断、缺键「（无）」）、move 父/序变化；顺序约定 remove→add→change→move 测试锁定；**基线 = 内存当前画布**）+ **HistoryDialog.vue 手写 modal**（列表三态 + 当前发布徽标 + 行内两步确认回滚不用 `window.confirm` + diff 条目分色；回滚成功 `openPage()` 重载 → `replaceSchema` 连带清 undo 栈 + 关弹清 diff）+ `DesignerApi` 扩三处（`getSchema(pageId, version?)`/`listVersions`/`rollback`，typecheck 锁 designer-web api.ts 同步实现）+ 顶栏「历史」按钮；新增 schema-diff 12 + version-store 9 + history-dialog 13 + server api 3 = **37 用例**（既有三文件 mockApi 随接口扩形状补齐），排障记 **B-37**（服务端无 watch：build 后必须重启进程，旧进程持旧路由表致新端点 404 一度误判接口缺失）；「已实现 23」「下一步 16」「D-P2-8/9」「B-37」「总览/未实现表」已回写 | typecheck ✅ exit 0 / build ✅ 6 包 Done / test ✅ **757 passed**（designer 223→**257**、server 98→**101**；schema 72 + expression 117 + renderer 210 不变）/ coverage ✅ **96.51/87.8/96.67/96.51** exit 0（门禁 90/85/90/90）/ 浏览器实测 ✅ **DoD 五点全过**（①p_b4_test 连发 v1~v3 → 历史 3 行倒序 + 当前徽标 ②对 v1 diff 2 处逐字命中 + 回滚后 0 差异空态 ③两步确认回滚 → 画布回 v1 + 弹窗关 + undo 栈清 ④服务端回读 draft 深等 v1·currentVersion=3·列表 [3,2,1] 轻量 B-35 ⑤reload 后全链路 console 零错误；截图仍受 OS 窗口不可见限制） |
| 2026-10-15 | Phase 2 · 批 6 权限 RBAC | **D-P2-10 RBAC 配置集中单文件 `<DATA_DIR>/rbac.json`**（`{roles:[{key,name,perms}], pages:{pageId:[roleKey]}}`；`perms` 含 `'*'` 通配、`pages` **无条目=全员可见**空数组=删条目，存量页面零迁移；用户→角色不动、`PageRecord` 零改动；`FileRbacRepository` 文件不存在返回**种子** admin `['*']`+designer `[]`，修复「首启空配置致 admin 也要手工初始化」）+ **D-P2-11 四层判定单一事实源 `RbacService`**（①页面级 `canSeePage` → `GET /pages/:id/schema` 403 `PAGE_FORBIDDEN` + bootstrap 菜单过滤 ②按钮级 perms 并集随 login/bootstrap 下发 + renderer「无权限整节点不渲染」+ runtime `options.hasPerm` 实读 `lc_perms` fail-closed ③模型 CRUD `model.permissions[action]` 未声明=通 → 403 `PERMISSION_DENIED` ④行级 `dataScope`（self 按 createdBy、dept 系无组织服务保守降级 self、`'*'` 豁免））+ **D-P2-12 权限 UI 三入口**（第三视图 `RbacPanel` 角色 CRUD+门禁红字+页面授权矩阵 / PropsPanel 节点 perm setter 放 settings 后保 DOM 顺序 / ModelPanel 数据权限区块 dept 置灰）；服务端 `rbac/` 五件套 + **`common/auth.module.ts` 拆分**（JwtService 独立模块，RbacModule imports 防 DI 崩）+ `'*'` 豁免同源修（controller 校验与 designer roleGateErrors 原 `PERM_RE` 会拒种子角色）；runtime `api.ts` `PERMS_KEY='lc_perms'` + bootstrap `{user,perms,apps}` + view 页 403 专属错误态；**D-14 收口**（bootstrap 补权限，方案 8.3 聚合语义达成）；新增 designer rbac-store 11 + rbac-panel 8 + server api 9 + model 6 等 = **38 用例**（designer 6 工厂 mockApi 随接口扩 4 方法），排障记 **B-38**（vitest 聚合 coverage 满载 worker RPC 超时污染 exit code → `maxWorkers:8/minWorkers:2 + rpcTimeout 180s`）、**B-39**（uni 运行中改 hash 跨会话导航复用旧实例出权限假象 → 硬刷新二分）、**B-40**（Nest 守卫依赖链 RbacModule 缺 AuthModule import → 启动 V8 native 崩表象 Worker exited，裸探针开 Nest logger 定位）；「已实现 24」「下一步 17」「D-P2-10/11/12」「D-14 收口」「B-38~40」「总览/未实现表」已回写 | typecheck ✅ exit 0 / build ✅ 6 包 Done / test ✅ **795 passed**（designer 257→**281**、server 101→**115**；schema 72 + expression 117 + renderer 210 不变）/ coverage ✅ **96.62/87.87/96.77/96.62** exit 0（门禁 90/85/90/90）/ 浏览器实测 ✅ **DoD 四点全过**（①页面级：配置 `pages:{p_emp_list:['admin']}` 回读 ✓ → admin 菜单 5 页 vs designer 4 页 + 直达 403「无权访问该页面」 ②按钮级：emp_form n-btn `perm=emp_submit` **发布 v4** → admin `'*'` 渲染「提交登记」/ designer `[]` **整按钮不渲染** ③行级：m_employee `dataScope=self` → admin 3 条 vs designer「暂无数据」0 条，测完回 `all` 恢复 3 条 ④rbac.json 文件回读两角色 + 角色编辑门禁红字/保存/perms 即时生效全链；两 console 无产品错误；截图仍受 OS 窗口不可见限制） |
| 2026-10-15 | Phase 2 · 批 7 出口判据 Demo + 多端打包 | **Phase 2 七批全部收口**：请假申请三页 Demo（`leave_form` v2 表单 Picker/NumberInput/Textarea/Button 绑 `m_leave` + `ds_submit` + 必填 + `actions:[{event:click,type:submit}]` / `leave_list` v2（m_leave 3 列 + detailPageId）/ `leave_detail` v1（3 字段 + backPageId））全流程十步留档（清理 demo 模板 31 节点 → 拖入 4 物料 → 配置发布 → H5 空表单校验拦截 → 填表提交「提交成功」→ 服务端落库 1 条 → 列表 1 条 → 点行 rid 详情 → 返回闭环）；**B-41** `materials/meta/form.ts` 6 物料 defaultProps `$expr: formData.<demo字段>` 残留全清（demo fixture 受控字段污染注册表，新拖入即脏；`DEMO_OPTIONS` 保留为画布预览占位）；**D-P2-13 受控物料回显兜底**（根因：D-A11 字段绑定只写 `props.name`，Picker/Select 等严格受控物料按 `props.value` 反查显示 → 选中后回显永远停 placeholder，批 4 只验落库未验回显至批 7 Demo 暴露；修 `lc-node.vue` `bindProps` computed——`value===undefined && name` 时自动读 `formData[name]`，显式 value（含 `$expr:`）原样透传、design 态行为不变，29 处物料分发统一走 `bindProps`，**存量页面随渲染层修复立即受益**）；**mp 分包**：demo 页挪 `subPackages{root:'pages-demo'}` + 源码目录迁移 + 菜单跳转改径（全仓 grep 仅 2 处源码引用），`build:mp-weixin` 产物验证（app.json 主包 3 页 + subPackages、分包四件套、wxml 跨分包 easycom 正常、**主包 209.7KB = 2MB 限的 10.2%**、分包 1.33KB、清跨次 build `demo/` 残留）；排障记 **B-42**（B-38 续集：workspace 聚合模式根 config 限并发继承不可靠，两跑崩 1~5 suite `Timeout calling fetch/snapshotSaved`；CLI `--rpcTimeout` 非 vitest 2.1.9 选项、`--maxWorkers=8` 有效崩 5→1；处置 = coverage 前停常驻 dev 服务 + CLI 限并发 → 46 files/799 passed/EXIT=0 稳定）；renderer +4 用例（D-P2-13 回归锁：兜底注入/显式不覆盖/无字段不注入/交互后跟随）；「已实现 25」「下一步 18」「D-P2-13」「B-41/42」「总览表 Phase 2 收口」已回写 | typecheck ✅ exit 0 / build ✅ 6 包 Done（+ `build:mp-weixin` 分包产物验证）/ test ✅ **799 passed**（renderer 210→**214**；schema 72 + expression 117 + server 115 + designer 281 不变）/ coverage ✅ **96.62/87.91/96.77/96.62** exit 0（门禁 90/85/90/90，B-42 处置后稳定）/ 浏览器实测 ✅ **Demo 十步全过**（Picker 选「事假」回显复证 D-P2-13 / 新拖入物料无表达式残留复证 B-41；截图仍受 OS 窗口不可见限制） |
| 2026-10-15 | Phase 3 · 批 1 流程引擎核心（状态机） | **Phase 3 立项 + 批 1 收口**：立项拆 **5 批**（`docs/phase3-plan.md`：现状盘点 + 拆批表 + 出口判据「带审批的申请应用：提交 → 待办 → 同意 → 状态变更 + 时间轴可见；门户图表 + 主题换色」经确认；**数据导出/打印、消息通知整批裁剪**留 Phase 4，离线/BPMN/真机扫码按方案明文与环境裁剪）；协议 **`FlowSchema` + `validateFlow`**（8.6 原文形状 + name；结构硬约束首 start/尾 end/approve≥1/id 唯一/onReject 引用、`E_FLOW_*` 13 码 + `W_FLOW_*` 4 码、condition 经注入 `checkExpr`）；服务端 **`flow/` 模块 5 文件 7 接口**（定义 CRUD upsert 校验拦截 / `tasks/todo` 待办 / `instances` 查询 / 审批动作 approve·reject）+ **记录提交联动启动实例**（`record.service.create` save 后按 modelId 匹配，**弱保证**失败不回滚记录）；**D-P3-1 推进语义**（start 自动过、approve 停建 pending 任务、mode=condition 条件假**跳过** history skip 且求值异常 fail-open 按 true、end 应用 `onApprove.setField`、reject 有 `onReject` 回退指 start = history `reenter` 重建任务无则 rejected 终态、linear 忽略 condition 出 warning）；**D-P3-2 assignee 判定 `canDecide` 单一事实源**（starter=发起人 / role=角色命中 **或 RBAC `'*'` 超级豁免** / dept 协议保留运行时不可命中——批 6 dataScope 同口径）；**D-P3-3 依赖与回写**（`RECORD_REPOSITORY` 提升 `@Global` StorageModule 单实例防双文件仓竞态、`ModelModule → FlowModule` 单向防循环 imports、decide **先回写记录再落实例**使失败可重试、setField 直写 payload **不经表单 sanitize**——8.6 `status: approved` 语义）；protocol.md **§10.1 新增流程审批接口组**（7 接口 + 推进/assignee/回写/存储语义，勘误立项稿 §11 → §10；§11 实为生命周期受信 API）+ **§10.3 错误码 +5** + `E_FLOW_*` Issue 行；排障记 **B-43**（vitest/esbuild 不 emit decorator metadata → 构造裸类型注入在测试容器为 undefined、`permsOf` 全 500 表象分散，补 `@Inject` 修复；**规范：Nest 构造注入一律显式 `@Inject`**）+ **B-42 参数升级**（48 文件下 `--maxWorkers=8` 复发 fetch/snapshotSaved RPC 超时 815/834 → 降 **4/1** 后 48/834 全过 49.3s —— 限并发随文件数下调）；新增 schema `validate-flow` 15 + server `flow` 20 用例（**真实 Nest 启动 + HTTP 全链路即批 1 冒烟**：CRUD/校验拦截 → 提交联动 → 待办过滤 `'*'`/starter/role + 403 → 主链推进 + **setField 回写读回 B-35** → 驳回 reenter/终止/stale → 条件 skip → 删除后实例审计保留）；「总览 Phase 3」「已实现 26」「未实现表 Phase 3」「下一步 19~23」「B-42/43」「验证命令期望」已回写 | typecheck ✅ **7 包 Done**（协议包改后须先 build dist —— server/designer 消费 `@lc/schema` 走产物）/ build ✅ **5 包 Done** / test ✅ **834 passed**（799 + 35：schema 72→**87**、server 115→**135**；expression 117 + renderer 214 + designer 281 不变）/ coverage ✅ **96.46/87.68/96.95/96.46** exit 0（门禁 90/85/90/90；`flow/` 分包 94.66/80.62；B-42 参数 8→4 后 48/48 文件稳定） |

| 2026-10-16 | Phase 3 · 批 2 审批物料 + 待办中心 | **Phase 3 批 2 收口**：物料 `ApprovalBar`（可审 = 当前节点 + 同意/驳回、终态 = ✓ 横幅、空态占位；**`@click` 非 `@tap`** —— uni 双端兼容且 jsdom 纯 click 可触发，测试抓出后全物料统一）+ `Timeline`（`history` 倒序时间轴含意见、decided 后 `tlKey` 重建）+ **`LcFlowHost`/`LC_FLOW_HOST_KEY` 注入通道（D-P3-4）**（renderer → materials 单向依赖；画布注入**零请求 mock 宿主**走占位态；`todo/detail.vue` 独立 uni 页不经 lc-renderer **自行 provide**）+ **D-P3-4b** 节点 props `$expr:` 求值 + view 页 `options.urlParams`（recordId 默认绑定 `$expr: urlParams.rid` 详情免改）+ `flow-utils` + `BIZ_META` 业务分组 META 30→32（31 叶子）；runtime **待办中心两页（D-P3-5）**（`pages/todo/index` onShow 重拉 / `detail` 内置详情复用两物料、`createUniHost()` 意见输入 `uni.showModal({editable:true})` 降级 confirm、菜单「工作台」组 `target:'todoList'` 落点不改 bootstrap 协议）+ `api.ts` 补流程三 fetch；服务端 **D-P3-6** `GET /flows/instances/:iid` 单实例（404 `FLOW_INSTANCE_NOT_FOUND`）；designer 物料面板业务组 + `MATERIAL_MAP` + demo fixture 30→32 + 属性面板 settings + meta-sync/分发锁联动；**裁剪定案**标准详情页（type=detail）不支持内嵌物料插槽 —— 审批 UI 走待办中心内置页，低代码详情页插槽留后批评估；排障记 **B-44（新教训）**：vite `optimizeDeps` 预构建 `@lc/materials`（页面侧 `/node_modules/.vite/deps/@lc_materials.js`）与 easycom 源码 `../keys` **双实例 → symbol 不同 → provide/inject 断链**（页面「审批宿主未注入」，**vitest 无 optimizer 单测 8/8 全绿不复现**；靠浏览器 fetch 模块 transform 比对 import URL 实锤）→ 修复：物料组件一律改从包入口 `@lc/materials` 导入归一；**附带限制** `packages/materials` 在 runtime dev watch 根外 —— **改物料需重启 dev server**（transform 缓存不失效）；protocol.md §10.1 补单实例行；「总览 Phase 3」「已实现 27」「未实现表 Phase 3」「下一步 20 完成/21 ←下一个」「phase3-plan §5」「验证命令期望」已回写 | typecheck ✅ exit 0 / build ✅ exit 0 / test ✅ **846 passed**（834 +12：renderer 214→**224**〔approval-materials 8 + lc-node 分发锁 2〕、server 135→**136**〔单实例 200/404〕、designer 281→**282**〔meta-sync +1〕；schema 87 + expression 117 不变）/ coverage ✅ **96.47/87.71/96.81/96.47** exit 0（49 文件 69.7s，B-42 `--maxWorkers=4 --minWorkers=1`；分包实测自 coverage-final.json：flow 94.79/81.20、renderer uni 95.05/core 97.24、designer panel 99.91/core 99.46）/ 冒烟 ✅ **`smoke-p3b2.mjs` 12/12 PASS** / 浏览器实测 ✅ **H5 闭环 DoD 全过**（提交 → 待办命中 → 详情 → 同意 + editable 意见 → **审批已通过 + 同意（含意见）/完成流转** → **服务端回读 `record.status=approved` B-35** + todo 清零 → 返回列表刷新已办消失；designer 面板业务组 / 画布占位态 / 属性面板 `$expr` 默认值三项过；截图仍受 OS 窗口不可见限制） |

| 2026-10-19 | Phase 3 · 批 3 本地草稿 + 主题配置 | **Phase 3 批 3 收口**：**D-P3-7 表单草稿**（renderer `DraftStore {load/save/clear}` 进 `PageControllerOptions.draft` **可选注入**——未注入零影响：画布 / 标准页 / 存量宿主 / 测试 mock；controller 管时机：字段变更存、**全空 clear**、`onMount` 数据源 init 后 `host.confirm` 二选一（确认 `patchFields` 回填 / 拒绝丢弃）、提交成功与 `reset` 清、存储异常只上报不阻断表单；快照与提交 payload 同源 `fieldNames` 复用；runtime `createUniDraft(pageId)`：key `lc_draft:${username}:${pageId}` **用户隔离** + `{data,at}` 7 天过期，view 页 onLoad 常驻注入）+ **D-P3-8 应用配置与主题**（服务端 `<DATA_DIR>/apps.json` 原子写 + 读容错、`GET/PUT /apps/config`——读 = 登录即可 / 写 = **仅 `'*'` 通配** 403、**patch 语义**缺键保留 / null 清除 / 未知键与非法值 400 `APP_CONFIG_INVALID`（primary `#hex`、radius px 串、dark 布尔）、bootstrap 顶层下发 `theme`；runtime `applyAppTheme`——renderer 纯函数 `deriveBrandPalette`（`core/theme-vars.ts`：parseHex/rgbToHsl/hslToHex + 十档固定目标亮度映射）覆盖 `--lc-brand-50..900`（语义变量全员派生自档位 → **覆盖即全站**）+ inline 补 `--lc-action-primary` + radius 覆盖 `--lc-radius-sm/md`；`App.vue onLaunch` 从 `lc_theme` 缓存恢复（`initTheme` 此前悬空、本批接上）+ menu 页 bootstrap 后应用；仅 H5 生效）+ **D-P3-9 dark 优先级**（显式配置 > 系统偏好，`appDark` 让位 change 监听）+ designer 第三视图 `ThemePanel`（取色器+hex / radius px / dark 三态 + 客户端门禁 + `themeApi` 分域 + 保存成功即设计器自身换肤预览）；**实测发现并修** tokens dark 块 `--lc-action-primary` 硬编码 `#4d88f0`（inline 补笔两态通吃）；排障记 **B-45**（vitest `--workspace` 模式根配置不下发 worker → rpcTimeout 下沉 6 包项目配置 + 命令加 `--no-file-parallelism`，8 轮 exit 码污染根治）；protocol.md §10.1（bootstrap `theme` + config 两行）与 §10.3（`APP_CONFIG_INVALID`）、`phase3-plan §6`、「总览 / 未实现表 / 下一步 21 / 已实现 28」已回写 | typecheck ✅ exit 0 / build ✅ exit 0 / test ✅ **924 passed**（六包：tokens 5 + schema 87 + expression 117 + renderer 259〔+17〕 + server 146〔+10〕 + designer 310〔+7〕；批 3 新增 34 逐例归因）/ coverage ✅ **96.14/87.84/96.18/96.14 exit 0**（57 文件 91.94s，B-45 修复后）/ 冒烟 ✅ `smoke-p3b3.mjs` **12/12 PASS** / H5 实测 ✅ **DoD 全过**（草稿：填一半→硬刷新→`uni.showModal` 恢复提示→回填→提交「提交成功」→草稿清→再刷无提示；「不恢复」丢弃；主题：改 primary 后 brand 十档派生 + `--lc-action-primary` 跟随 + radius 生效 + `dark:true` 深色底 → 清回跟随；**B-35** API 与 apps.json 文件回读一致；设计器面板回填→保存→自身换肤） |

| 2026-10-20 | Phase 3 · 批 4 图表物料 + Portal 页型 | **Phase 3 批 4 收口**：**D-P3-10 图表物料**（`Chart` 一组件三形态 `bar/line/pie` + `Statistic` 指标卡；**纯 SVG 手写不引 echarts**（R10 风控）→ SVG 串 base64 data URI → `<image :src>`（uni 三端不支持裸 `<svg>`）；生成逻辑下沉 `materials/src/chart/chart-svg.ts` 纯函数 `aggregateSeries/buildChartSvg/toDataUri/formatNumber` + `RECORDS_SIZE_MAX=100`；数据三通道 `props.data` → `modelId+dimension+metric(count/sum/avg/max/min)+metricField+limit` 经 `LC_FLOW_HOST_KEY.request` 拉 records **客户端聚合** → 空态零请求）+ **D-P3-11 Portal 页型**（`PortalPageConfig{title?,columns?,cards}` + `PortalCard{title,desc?,icon?,pageId?,url?,badge?}` + `PageSchema.portal?`；portal = 卡片导航 + `root` 拖拽区混合页，**不进 `isStdPage`**；卡片 `title` 缺失报 `E_REQUIRED` `portal.cards[i].title`；点卡 `pageId`→emit navigate / `url`→emit open-url（仅 H5））+ 分层（renderer `lc-node` +2 分发 + 新建 `lc-portal-page.vue`；runtime view 三态分发 + `onOpenUrl` + easycom；designer `updatePortalConfig`/`setPageType`/`setPortalConfig`/PropsPanel 门户区块/物料图标；designer-web 门户提示条）；**实测揪出并修 4 个真实缺陷**：① `@lc/renderer` `exports` 漏 `./uni/lc-portal-page.vue` → easycom 解析失败（H5 假象「连接服务器超时」）→ 补 exports + 新增 `uni-exports.test.ts` 双向一致回归锁；② Chart 取数 `size=limit×20=160` 超服务端 `MAX_SIZE=100` → 400 → 改 `min(limit*20,100)`；③ 饼图无标签 → 补**静态图例**（uni 文本非 SVG）+3 例；④ 图例 `v-if` 插入打断原 `v-if` 链 → 柱/折「图片 + 空态」**图文并存** → 空态改独立条件 +1 例回归锁；排障记 **B-46**（`lc-node.test.ts` 仅注册 12 物料 stub vs 组件引用 33 → 每次渲染 21 条 Vue warn 洪泛 → stdout 回压阻塞 main → `snapshotSaved` RPC 超时、renderer 150s/exit 1；补全 LEAF_KEBABS stub 后 2.28s/exit 0；**并勘误 B-45**：vitest 2.1.9 **无 `rpcTimeout` 选项**（全包 grep 0 命中，birpc 默认 60s），各包该配置为惰性项，真解法=消除日志洪泛 + `--no-file-parallelism`）、**B-47**（materials 源码改动后仅重启 runtime 不够，需删 `packages/runtime/node_modules/.vite` 清依赖预打包缓存）、**B-48**（`uni.async.error` 文案易误判为接口超时，先用 `import('/src/pages/...')` 抓真实报错）；protocol.md **§2.9 门户页** + §2.1 表；`phase3-plan §7`、「总览 / 未实现表 / 下一步 22 / 已实现 29」已回写 | typecheck ✅ exit 0（7 包）/ build ✅ exit 0（5 包 Done）/ test ✅ **965 passed**（tokens 5 + expression 117 + schema 90 + renderer **289**〔20 文件〕 + server 146 + designer 318；批 4 新增 **41**）/ coverage ✅ **96.23/87.87/95.99/96.23** exit 0（60 文件 965 例 59.53s，门禁 90/85/90/90）/ 冒烟 ✅ `smoke-p3b4.mjs` **13/13 PASS**（落库回读 B-35 + 非法卡片 400 `SCHEMA_INVALID` path 精确 + 复原）/ **H5 实测 DoD 全过**（门户标题 + 3 卡 + 点卡跳 `leave_form`；柱/折/饼 data URI 渲染 + 饼图图例「运营部 1 / 技术部 1 /（空）1」+ 指标卡「员工总数 3 人 ↑」；无多余空态/无 async error）/ **设计器实测 ✅**（pageId=pgc_demo → 页型 portal + 提示条 + 门户区块回填 3 卡 + 画布 Chart×3 空态零请求 + Statistic「员工总数 3 人 ↑」） |

| 2026-10-20 | Phase 3 · 批 5 埋点与错误上报 + Schema Profiler | **Phase 3 批 5 收口（五批全完）**：**D-P3-12 服务端 `ops/` 五件套** —— `<DATA_DIR>/ops/events.json` 原子写 + 环形 500（丢最旧计 `dropped`）；`POST /ops/events` 登录即可 / 1~50 条 / `{accepted,total,dropped}`；`GET /ops/events` + `GET /ops/summary` 仅 `'*'`（倒序 + type/pageId/since/limit；summary 出 byType/errors/perf avg·p95·max）；**写开放读收紧**、`userId/at` 服务端覆盖、**结构错 400 `OPS_INVALID`（带 `events[i]`）/ 数据超限截断**（message 500、detail 2000 → `{truncated,preview}`）+ **D-P3-13 上报链**（renderer `core/ops.ts` `createOpsQueue` 批量/定时/失败保留/丢最旧；runtime `src/ops.ts` `createUniOpsReporter` + view 页 5 类事件接线 + onHide/onUnload flush；不白屏沿用 `exprError` 兜底 + `skipped`）+ **D-P3-14 Profiler**（controller `stats` 计时计数 + `core/perf.ts` `formatPerf/countNodes` 共享；runtime `?perf=1` 角标 + schema-load/render 上报；设计器顶栏常驻徽标 + `LcCanvas @rendered` → `store.markRender`）；修复首帧 `mountMs=0` 误显示；`exports.test.ts` 40→**44** 同步锁；protocol.md **§10.1 运维事件三接口** + `OPS_INVALID`；`phase3-plan §8`、「总览 / 未实现表 / 下一步 / 已实现 30」已回写 | typecheck ✅ exit 0（7 包）/ build ✅ exit 0（5 包 Done）/ test ✅ **1006 passed**（renderer 289→**309**〔ops 7 + perf 7 + controller-stats 6〕、server 146→**161**〔ops 15〕、designer 318→**324**〔perf 6〕；schema 90 + expression 117 + tokens 5 不变）/ coverage ✅ **96.17/87.84/95.83/96.17** exit 0（65 文件 52.4s）/ 冒烟 ✅ `smoke-p3b5.mjs` **23/23 PASS** / H5 DoD ✅（`pgc_ops_bad` 坏表达式仍渲染「正常节点可见」+ 服务端 2 条 `expr` 事件；角标 `加载 91ms · 构建 2ms · 渲染 40ms · 3 节点`；`summary perf{count:2,avgMs:48,p95Ms:69,maxMs:69}`；`pgc_demo&perf=1` 门户回归全在、无参数时角标不渲染）/ 设计器 ✅ 徽标 `加载 331ms · 渲染 73ms · 34 节点`（title 含采样 JSON） |
| 2026-10-20 | 修复台账 · A1/A2/B1/B2 收口 | **独立核查发现的门禁红灯 + 页面枚举缺口全部收口**（详见 `docs/remediation-plan-2026-10-20.md`）：**A1** Profiler 角标 2 处硬编码色值改令牌（`--lc-bg-inverse`/`--lc-text-inverse`）→ `design:check` 转绿；**A2** 新增根 `README.md`；**B1** 服务端 `GET /pages`（RBAC 可见性过滤）+ `DELETE /pages/:id`（仅 `'*'`，连带清版本）+ `protocol.md` §10.1；**B2** 设计器消费端：`listPages()` 改走 `GET /pages` + `deletePage()`、store `pages/loadPages/deletePage`（删当前页自动切换/最后页落新草稿/下一页失败也回落，防已删页被 upsert 回来）、顶栏页面下拉 + 两步删除（10s 复位）+ datalist、保存/发布刷新列表、窄屏隐藏重复徽标；新增 `page-list.test.ts` 11 例 | typecheck ✅ exit 0（7 包）/ design:check ✅ exit 0 / build ✅ exit 0（5 包；designer-web 1,233.98 kB / gzip 400.09 kB）/ test ✅ **1032 passed / 67 文件**（server 161→176、designer 324→335）/ coverage ✅ **96.17/87.96/95.87/96.17** exit 0（78.18s）/ 浏览器 DoD ✅（10 页下拉 → 换页 → 两步删除临时页 → 自动切 `pgc_ops_bad` → 服务端 0 残留、现有 10 页未动、console 0 error） |
| 2026-10-20 | P1 · 仓库初始化 + Gitee 远端 | **按授权执行 `git init` + 首次提交**：补 `.gitignore`（`apps/server/data/`、`/data/`、`.env*`、`.workbuddy/`、`probe-out.txt`）与 `.gitattributes`（`eol=lf`）；提交 `1e89977`（334 文件 / 57,011 行）→ `20de245`；本地身份 `一念 <919037107@qq.com>`；分支改 `master` 对齐 Gitee。远端 `origin` 已配置，`ls-remote/fetch` 成功，合并 Gitee 初始 README（删除模板 `README.en.md`）；首次 push 因 Windows 旧凭据失败（`18186473822: Incorrect username or password`），更新凭据后**推送成功**（首次推送 `4da460c`，`master` 已跟踪 `origin/master`）。CI workflow 静态核对 + 本地等价冒烟通过；**Gitee 不执行 GitHub Actions；Gitee Go 的 Node 插件最高仅 15.12.0，无法跑 Node 22，远端 CI 仍未实跑**。详见 `docs/p1-git-ci-2026-10-20.md` | 本地/远端 `master` 一致、工作区干净 / 秘密扫描 0 命中 / CI 冒烟本地等价 ✅ / **推送 ✅、CI 实跑 ❌** |
| 2026-10-20 | Phase 4 · 安全加固首批（JWT / CORS / 限流） | **挂账 #5 收口**：① JWT 密钥 `LC_JWT_SECRET` 生产 fail-closed（未设置/＜32 字符/等于仓库内置开发值 → 启动 exit 1；非生产未设置才回退开发密钥并告警）；② CORS 白名单 `LC_CORS_ORIGINS`（逗号分隔完整源，拒绝 `*`/路径/查询/凭据/非 http(s)；production 未设置=不发 ACAO；开发默认放行 5173/5174 四个 localhost 源）；③ 固定窗口限流（普通 600/min/IP、登录 20/min/IP，超限 `429 RATE_LIMITED` + `Retry-After`，OPTIONS 不计；`LC_TRUST_PROXY` 支持一层反代）；④ 启动期聚合自检 `assertSecurityConfig()`，任何非法配置不监听端口；⑤ 新增 `apps/server/src/common/security.config.ts`、`rate-limit.ts`，改 `jwt.service.ts`/`app.module.ts`/`main.ts`，测试密钥统一 ≥32 字符；⑥ `security.test.ts` 25 例 + 真实启动冒烟 10/10。**未做**：多实例 Redis 限流、安全审计、账号锁定、令牌轮换。详见 `docs/security-hardening-2026-10-20.md` | typecheck ✅ exit 0（7 包）/ design:check ✅ exit 0 / build ✅ exit 0（5 包，designer-web 1,233.98 kB / gzip 400.09 kB）/ test ✅ **1057 passed / 68 文件**（server 176→201）/ coverage ✅ **96.2/88.14/95.94/96.2** exit 0 / 安全冒烟 ✅ **10/10 PASS**（含生产缺密钥/短密钥/CORS `*` 均 exit 1） |
| 2026-10-21 | Phase 4 · 可观测性与部署基础 | **当时数据库路线：暂缓 DB，继续 JSON 文件模拟**（同日稍后由 ADR-008 改为 MySQL 第一批）；本批补生产可观测性：① `GET /health` 存活 + `GET /ready` 数据目录可写（503 `NOT_READY`），均免登录、免限流；② 全局 `X-Request-Id`（合法客户端值复用，否则 UUID）；③ production 默认开启单行 JSON 访问日志（`LC_ACCESS_LOG` 覆盖，非法值启动失败），只记 `requestId/method/path/status/durationMs/ip/userAgent`，不落 query/body/Authorization；④ 新增 `health.controller.ts`、`observability.ts`、`observability.test.ts`（10 例）、`smoke-observability.mjs`、`docs/observability-deployment-2026-10-21.md`；⑤ `README`、`protocol §10.1/10.5` 回写。**未做**：指标/追踪/告警/日志轮转/多实例。 | typecheck ✅ 7 包 exit 0 / design:check ✅ exit 0 / build ✅ 5 包 exit 0（designer-web 1,233.98 kB / gzip 400.09 kB）/ test ✅ **1068 passed / 69 文件**（server 201→212）/ coverage ✅ **96.24/88.1/95.99/96.24** exit 0（72.13s）/ 可观测性冒烟 ✅ **4/4 PASS** / 安全冒烟 ✅ **10/10 PASS** |
| 2026-10-21 | Phase 4 · MySQL 8 + Prisma 第一批 | **核心业务数据落库（ADR-008）**：① 新增 Prisma schema + `20261021000000_init` 迁移，8 表：`users / roles / user_roles / pages / page_versions / models / data_records / rbac_page_grants`；② 新增 5 个 MySQL 仓储（User/Page/Model/Record/Rbac），仓储接口与 service 层零改动；③ `StorageModule` 按 `LC_STORAGE` 条件注入，`json`（默认）保留给单测/无数据库 CI，`mysql` 显式启用；`main.ts` 启动期校验 `DATABASE_URL`，`/ready` 增加 `SELECT 1`；④ 新增 `seed-mysql.mjs`（开发用户/RBAC，生产默认拒绝）、`import-json-to-mysql.mjs`（幂等导入 pages/models/records/rbac）、`smoke-mysql.mjs`（拒绝非 `*_test` 库）、`mysql.persistence.test.ts`（条件集成测试）；⑤ 单测先用 `test.env` 固定 `LC_STORAGE=json`（第二批发现它会被 Vitest 自动加载的 `.env` 覆盖，已改 `setupFiles` 强制）；⑥ README、protocol §10.1/10.5、ADR-004/008 回写。**未做**：flows / flow-instances / ops / apps 迁移、Redis、多实例写并发/乐观锁、CI 实跑 MySQL。 | typecheck ✅ 7 包 exit 0 / design:check ✅ exit 0 / build ✅ 5 包 exit 0（designer-web 1,233.98 kB / gzip 400.09 kB）/ test ✅ **1068 passed + 4 skipped / 70 文件**（server 212 passed + 4 skipped）/ coverage ✅ **93.82/87.91/92.84/93.82** exit 0（70.24s）/ MySQL 仓储集成 ✅ **4/4 PASS**（`lowcode_test`）/ MySQL 真启动冒烟 ✅ **6/6 PASS** / JSON→MySQL 导入 ✅ **pages=10, models=3, records=24, rbac=yes**（已回读） |
| 2026-10-21 | 设计系统 · 对比度与尺寸令牌收口 | **设计一致性 5 道门禁**：① 语义色对比度调整（正文/次要/状态/焦点等，`docs/contrast.json` 同步）；② 新增 `tokenize-dimensions.mjs`：px 间距 → `--lc-space-*`、无单位行高 → `--lc-leading-*`，只替换刻度内值，`--check` 进 `design:check`；③ 新增 `audit-token-usage.mjs` 体检报告（不阻断），回答 L1/L2/L3 令牌实际引用率与断链；④ 设计器/物料/渲染器/runtime 共 30+ 文件改用令牌，`tokens.css` / `tokens.rpx.css` / `tokens.w3c.json` / `docs/design-system.md` 同步；⑤ `design:check` 扩展为 tokens + color + spacing + rpx + contrast 五道。**未做**：剩余「占位/辅助文字 3.06:1」的既有 AA 缺口（本轮显式列账、不阻断）、全量视觉回归。 | design:check ✅ exit 0（39 达标 / 既有缺口 1 / 退化 0，新增 spacing:check 后复跑）/ typecheck ✅ 7 包 exit 0 / build ✅ 5 包 exit 0 / test ✅ **1068 passed + 4 skipped / 70 文件** / coverage ✅ **93.82/87.91/92.84/93.82** exit 0 |
| 2026-10-21 | Phase 4 · 运维事件追加写入 | **去掉 ops 整表覆盖**：① `OpsRepository` 从 `save(events)` 改为 `append(events, limit)`，返回 `{total,dropped}`；② `MysqlOpsRepository` 事务内 `createMany` 后按自增 `seq` 删除超限最旧行，不再 delete + create；③ `FileOpsRepository` 加单进程 Promise 写队列，并发 append 串行化「读 → 合并 → 裁剪 → tmp + rename」；④ service `ingest` 不再先读整表，`POST /ops/events` 响应形状不变；⑤ 新增 `ops-repository.test.ts` 2 例，MySQL 集成补裁剪/10 条并发回读。**未做**：多实例严格 500 上限、JSON 跨进程原子写。 | typecheck ✅ 7 包 exit 0 / design:check ✅ exit 0 / build ✅ 5 包 exit 0 / test ✅ **1070 passed + 7 skipped / 71 文件**（server 214 + 7 skipped）/ coverage ✅ **92.4/87.83/90.75/92.4** exit 0（74.53s）/ MySQL 仓储集成 ✅ **7/7 PASS** / MySQL 真启动冒烟 ✅ **9/9 PASS** |
| 2026-10-21 | Phase 4 · MySQL 8 + Prisma 第二批 | **流程/运维/应用配置落库（ADR-009）**：① 新增 4 表 `flow_definitions / flow_instances / ops_events / app_config` 与迁移 `20261021150000_flows_ops_appconfig`（已应用 dev + test）；② 新增 `MysqlFlowRepository / MysqlOpsRepository / MysqlAppConfigRepository`，流程定义删除不级联删实例，ops 用自增 `seq` 保同毫秒顺序，app_config 单行 `id='default'`；③ 抽出 `AppConfigRepository` + 文件/MySQL 双实现，`AppConfigService` 改仓储注入，`GET/PUT /apps/config` 契约不变；④ `FlowModule / OpsModule` 统一由 `StorageModule` 注入；⑤ 导入脚本扩展 flows/instances/ops/apps，冒烟扩到 9 项；⑥ **修复测试污染开发库**：发现 Vitest 自动加载 `.env` 覆盖 `test.env`，新增 `setup-json-storage.ts` 强制 JSON + 删除 `DATABASE_URL`，复跑后开发库计数不变。**未做**：文件元数据落库、乐观锁、Redis 限流、CI 实跑 MySQL、小程序真机（ops 追加写入已由「已实现 33」补齐）。 | typecheck ✅ 7 包 exit 0 / design:check ✅ exit 0 / build ✅ 5 包 exit 0 / test ✅ **1068 passed + 7 skipped / 70 文件**（server 212 + 7 skipped）/ coverage ✅ **92.51/87.82/90.82/92.51** exit 0（78.99s）/ MySQL 仓储集成 ✅ **7/7 PASS** / MySQL 真启动冒烟 ✅ **9/9 PASS** / JSON→MySQL 导入 ✅ **flows=1, instances=6, ops=19, appConfig=yes**（开发库已回读） |
| 2026-10-22 | Phase 4 · MySQL 8 + Prisma 第三批（文件） | **文件元数据与内容落库（ADR-010）**：① 新增第 13 张表 `files`（`id` / `originalName TEXT` / `mimeType` / `size` / `uploadedAt` / `uploadedBy` / `content LONGBLOB`，`uploadedAt` 索引）；② 抽出 `FileRepository` + `StoredFile`，`DiskFileRepository` 保持原双文件布局与降级语义，`MysqlFileRepository` 用 upsert 单行写入，`StorageModule` 按 `LC_STORAGE` 注入；③ `FileService` 契约、10MB 上限、404/500 语义不变；④ 迁移 `20261022000000_files` 已应用 `lowcode` + `lowcode_test`；⑤ 导入脚本补 `files/` + `files-meta/`，开发库补录 8 个历史文件；⑥ 测试扩至 MySQL 仓储 8/8、真启动冒烟 10/10（HTTP 上传 → Prisma 回读 → HTTP 下载字节一致）。**未做**：对象存储/CDN/Range、文件列表/删除/回收站、哈希去重、病毒扫描、下载鉴权。 | typecheck ✅ 7 包 exit 0 / design:check ✅ 42 达标 / build ✅ 5 包 exit 0 / test ✅ **1070 passed + 8 skipped / 71 文件**（server 214 + 8 skipped）/ coverage ✅ **92.15/87.81/90.37/92.15** exit 0（61.29s）/ MySQL 仓储集成 ✅ **8/8 PASS** / MySQL 真启动冒烟 ✅ **10/10 PASS** / 开发库回读 ✅ `files=8`，其余 12 表计数不变 / 存量导入 ✅ 临时目录 `files=1` 回读通过 |

---

## 如何验证本批次交付

```powershell
cd D:\mimo\lowcode
pnpm install          # 首次需 pnpm approve-builds esbuild（vue-demi 已在 allowBuilds 白名单）
pnpm typecheck        # 期望：7 个包全部 Done（tokens/schema/expression/renderer/server/designer/designer-web）
pnpm build            # 期望：5 包 Done（packages/{schema,expression,renderer}/dist + apps/server/dist + apps/designer-web/dist）
pnpm test             # 期望：6 包全绿 = tokens 5 + schema 90 + expression 117 + renderer 309 + server 214 passed + 8 skipped + designer 335 = 1070 passed / 8 skipped / 71 文件
pnpm coverage         # 期望：92.15/87.81/90.37/92.15（阈值 90/85/90/90 强制，低于即退出码 1）；报告在 coverage/index.html
                      # B-45/B-46 更正：脚本内含 --no-file-parallelism；vitest 2.1.9 **无 rpcTimeout 选项**（birpc 默认 60s），
                      #      各包 vitest.config.ts 里的 rpcTimeout 为惰性配置 —— 真解法是消除日志洪泛（B-46）+ 串行/限并发
                      # 分包实测（批 2 自 coverage-final.json 聚合）：designer panel 99.91/core 99.46、renderer core 97.24/uni 95.05、server flow 94.79/81.20（stmts 均 ≥90；分包 branch 不设阈值，以总 branch 过 85）
                      # 注：聚合 coverage 已限并发（B-38，满载 worker RPC 超时污染 exit code）
                      # 注：workspace 聚合模式下根 config 限并发继承不可靠（B-42）—— coverage 前停常驻 dev 服务 +
                      #     CLI 显式 `npx vitest run --coverage --workspace config/vitest.projects.ts --maxWorkers=4 --minWorkers=1`
                      #     （B-42 参数升级：46 文件 8/2 可用；48 文件起 8 worker 复发 fetch/snapshotSaved 超时 → 降 4/1；
                      #      60 文件 965 例实测 59.53s / exit 0；批 5 后 65 文件 1006 例 52.38s / exit 0；
                      #      2026-10-20 修复台账收口后 67 文件 1032 例 78.18s / exit 0；
                      #      2026-10-20 安全加固后 68 文件 1057 例 / exit 0；
                      #      2026-10-21 可观测性后 69 文件 1068 例 72.13s / exit 0；
                      #      2026-10-21 运维事件追加后 71 文件（70 通过 + 1 跳过）1070 例 74.53s / exit 0）
                      #      2026-10-22 文件落库后 71 文件 1070 passed + 8 skipped / 61.29s / exit 0（92.15/87.81/90.37/92.15）

# MySQL 仓储集成（需本机 MySQL，库名必须以 _test 结尾）：
$env:LC_TEST_DATABASE_URL='mysql://lc_app:<password>@127.0.0.1:3306/lowcode_test'
pnpm -F @lc/server exec vitest run test/mysql.persistence.test.ts   # 期望：8/8 PASS

# MySQL 真启动冒烟（先 build；脚本拒绝非 *_test 库）：
$env:LC_SMOKE_DATABASE_URL=$env:LC_TEST_DATABASE_URL
pnpm -F @lc/server build
pnpm -F @lc/server smoke:mysql             # 期望：10/10 PASS

# 批 4 冒烟（门户页配置校验 + 落库回读 B-35；需服务端已启动）：
node apps/server/scripts/smoke-p3b4.mjs   # 期望：13/13 PASS、exit 0（含非法卡片 400 SCHEMA_INVALID path 精确断言 + 复原）

# 批 5 冒烟（运维事件上报/查询/汇总 + 权限；需服务端已启动）：
node apps/server/scripts/smoke-p3b5.mjs   # 期望：23/23 PASS、exit 0（时间戳 pageId 隔离、可重复执行）

# Phase 4 安全加固冒烟（独立起停 3100/3103/3199 端口）：
node apps/server/scripts/smoke-security.mjs
                                          # 期望：10/10 PASS（CORS 允许/拒绝、登录 429、开发回退警告、
                                          #       production 缺密钥/短密钥、CORS * 均 exit 1）

# Phase 4 可观测性冒烟（自起停 3104 端口）：
pnpm smoke:observability
                                          # 期望：4/4 PASS（/health + 版本 + 请求 ID；非法 ID 替换 UUID；
                                          #       /ready dataDir ok；404 访问日志单行 JSON 且不含 query token）

# 服务端真实启动冒烟（验证构建产物运行时，B-15/B-28 教训）：
pnpm -F @lc/server build                  # ★ 改码后必须重建 —— B-28 曾出现 dist 与 src 不一致导致路由 404
pnpm -F @lc/server start                  # 默认 :3000，数据落 <cwd>/data
node %TEMP%\opencode\smoke-crud.mjs       # 期望：18 通过 / 0 失败（脚本幂等，可重复运行）
                                          # 覆盖：登录/建档/记录增删改查/校验拦截/filter/sort/分页/软删/上传 PNG/
                                          #       中文文件名/公开读取字节一致/页面接口回归

# 设计器（设计器批 1；rpx→px + uni-shim 在 vite.config.ts / packages/designer）：
cd apps\designer-web
pnpm dev               # http://localhost:5174 → 三栏布局 + 12 物料渲染 + 点节点出选中框 + 右面板显示节点 id
                       # 验证点：switch 可点切换 / picker 可展开 / radio 可选 / image 有背景 / console 无 error

# uni-app 运行时壳（第 4 项；改 packages/renderer 源码后需重启 dev，见 vite.config.ts 注释）：
cd packages\runtime
pnpm dev:h5            # http://localhost:5173 → 物料 12 个全渲染（含 FormGroup 分组头/Divider）+ 联动「count+1 = 42」+ 输入联动 + Switch/Radio/Textarea 交互 + 点按钮出 toast
                       # ★ 改 @lc/materials 源码后必须删 packages/runtime/node_modules/.vite 再启动（B-47 依赖预打包缓存）
                       # 批 4 门户验收：node apps/server/scripts/smoke-p3b4.mjs 写入种子页后
                       #   http://127.0.0.1:5173/#/pages/view/index?pageId=pgc_demo
                       #   期望：门户标题 + 3 卡（点「请假申请」跳 leave_form）+ 柱/折/饼（data URI）+ 饼图图例 + 指标卡「员工总数 3 人 ↑」
                       # 批 5 Profiler 验收：加 ?perf=1 → 右下角「加载 xms · 构建 xms · 渲染 xms · 节点 n」角标；
                       #   不加参数无角标；坏表达式页 pgc_ops_bad（已写入服务端）→ 正常节点仍可见 + 运维接口可查 expr 事件
pnpm build:h5          # 期望 DONE，产物 dist/build/h5/index.html
pnpm build:mp-weixin   # 期望 DONE，产物 dist/build/mp-weixin（微信开发者工具导入验证，本机未装）
```
