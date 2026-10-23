# 项目状态总览（STATUS）

> 最后更新：2026-10-23 ｜ 对应提交：`cf4fae1`
> 本文件是**当前能力与剩余工作的单一摘要**。历史过程、逐批细节与缺陷留档在
> [`PROGRESS.md`](PROGRESS.md)；已收口的过程文档在 [`archive/`](archive/README.md)。
> 只写经过实际验证的结论；数字均来自本机与 GitHub Actions 实跑。

---

## 1. 一句话结论

移动端低代码平台的主链路（协议 → 设计器 → 运行时 → 服务端 → MySQL）与 Phase 0~3 已全部收口；
Phase 4 的**安全、可观测性、MySQL、并发控制、Webhook 生产化、远程物料（设计器侧）**已完成，
GitHub Actions 远端 CI 已实跑全绿。

**现有系统可以直接支撑「单租户 + 单/少量服务实例」的内部业务应用落地**；
距离「多租户 SaaS + 开放生态」还差一批企业级平台能力（见 §3）。

---

## 2. 当前关键指标（实测）

| 指标 | 实测值 | 证据 |
|---|---|---|
| 数据库表 | **16 张** | `apps/server/prisma/schema.prisma` |
| OpenAPI 路由 | **50 条** | `apps/server/test/openapi.test.ts` 断言 + `docs/openapi.md` |
| 测试 | **1174 passed + 10 skipped / 80 文件** | `pnpm test` |
| 覆盖率 | **94.35 / 85.22 / 93.77 / 94.35**（stmts/branch/funcs/lines） | `pnpm coverage`，阈值 90/85/90/90 |
| 类型检查 / 构建 | **7 包 typecheck / 5 包 build 全过** | `pnpm typecheck` / `pnpm build` |
| 设计门禁 | **6 道全过** | `pnpm design:check` |
| 远端 CI | **两个 job 全绿** | GitHub Actions run #4（`cf4fae1`）`verify` + `node20-core` |
| 移动端编译 | **H5 / 微信小程序 / App 三端 DONE** | `build:h5` / `build:mp-weixin` / `build:app` |
| MySQL 集成 | **10/10 PASS** | `mysql.persistence.test.ts`（需 `LC_TEST_DATABASE_URL`） |
| JSON→MySQL 导入 | **幂等**（重复两次结果一致） | `webhooks=1, deliveries=1, archives=1` 回读 |

> CI 覆盖：Node 22 全量门禁（设计门禁 → build → typecheck → 三端编译 → test → coverage →
> 服务端/安全/可观测性冒烟）+ Node 20 核心兼容（build → typecheck → test）。
> CI 不启动真实 MySQL；MySQL 集成测试需本机实例，属已知边界。

---

## 3. 已完成能力总览

### 3.1 协议与引擎

| 能力 | 状态 | 要点 |
|---|---|---|
| 协议包 `@lc/schema` | ✅ | Page / Node / Model / Flow / App 类型 + 校验 + 版本迁移；零运行时依赖 |
| 表达式引擎 `@lc/expression` | ✅ | 自研 tokenizer/parser/evaluator；37 内置函数、4 白名单、19 禁用键；禁赋值 |
| 渲染引擎 `@lc/renderer` | ✅ | 纯逻辑层 + 副作用注入；联动、条件、循环、校验、15 种动作；jsdom 组件测试 |
| 跨端渲染 | ✅ | Web（设计器）+ uni-app（H5/小程序/App）；rpx 令牌派生 |

### 3.2 物料与设计器

| 能力 | 状态 | 要点 |
|---|---|---|
| 物料库 | ✅ | 30+ 物料：基础/表单/数据/导航/反馈/图表/业务；META 注册表 |
| 画布渲染 | ✅ | 同进程 uni-shim + 增强器；rpx→px；选中/遮罩/动作拦截 |
| 拖拽编排 | ✅ | 拖入、换位、删除、大纲树、撤销重做、跨页剪贴板 |
| 属性配置 | ✅ | 基础 setter 真控件；未支持 setter 只读占位 |
| 页面/模型/权限/主题视图 | ✅ | 页面列表与删除、模型可视化建模、RBAC 面板、主题换色 |
| 版本管理 | ✅ | 版本列表、回滚、结构化 diff |
| 保存/发布链路 | ✅ | 校验不过不发 PUT；ETag/If-Match 乐观锁；409 不覆盖 |
| Webhook 管理 UI | ✅ | 订阅 CRUD、测试投递、日志过滤、指标告警、轮换、清理 |
| 物料市场面板 | ✅ | 受信远程物料：刷新/验签/安装/卸载/受控插入画布 |

### 3.3 运行时

| 能力 | 状态 | 要点 |
|---|---|---|
| 登录 / 应用菜单 / 动态页面 | ✅ | `pageId → Schema`，published 优先、草稿回退 |
| 标准列表 / 详情 / 门户页 | ✅ | 分页、排序、搜索、行内编辑、批量删除、卡片导航 |
| 表单草稿 | ✅ | 用户隔离 + 7 天过期 + 恢复提示 |
| 主题 | ✅ | 品牌色十档派生、圆角、深色；H5 生效 |
| 待办中心 / 审批 | ✅ | 待办列表、详情、同意/驳回、时间轴 |
| 埋点 / 错误上报 / Profiler | ✅ | 批量队列、不白屏、`?perf=1` 角标 |
| 远程物料 | ✅ | 受信元数据 + 内置组件白名单，不执行远程 JS |

### 3.4 服务端与存储

| 能力 | 状态 | 要点 |
|---|---|---|
| NestJS API | ✅ | 50 条路由；JWT、RBAC、限流、CORS、请求 ID |
| 动态 CRUD | ✅ | 模型/记录/文件/页面/RBAC/流程/运维/应用配置/Webhook |
| JSON 仓储 | ✅ | 默认/测试路径；单进程 `KeyedLock`；原子写 |
| MySQL 8 + Prisma | ✅ | 16 表；全部业务仓储双实现；迁移纳入发布流程 |
| 乐观锁 / 幂等 | ✅ | 页面、记录、流程实例 `revision` CAS；`If-Match`；审批幂等 + `pendingPatch` |
| 文件 | ✅ | 10MB 上限；MySQL `LONGBLOB` 或本地双文件 |
| 数据导入 | ✅ | `import:json-to-mysql` 覆盖页面/模型/记录/RBAC/流程/运维/配置/文件/**Webhook 三表** |

### 3.5 生产化

| 能力 | 状态 | 要点 |
|---|---|---|
| 安全加固 | ✅ | JWT 生产 fail-closed；CORS 白名单；普通/登录限流；启动自检 |
| 可观测性 | ✅ | `/health`、`/ready`、`X-Request-Id`、结构化访问日志 |
| 部署与备份 | ✅ | systemd、MySQL/JSON 备份、日志采集指引 |
| Webhook 生产化 | ✅ | 多副本租约、订阅限流、TTL 归档、DNS 级 SSRF、签名时间窗/重放缓存、自定义头黑名单、轮换宽限期、指标告警、管理 UI、删除订阅后日志可查 |
| 远程物料市场 | ✅（设计器侧） | ES256 验签、origin allowlist、本地缓存/安装状态、版本一致性、受控组件白名单 |
| 工程化 / CI | ✅ | pnpm workspace、6 道设计门禁、覆盖率阈值、GitHub Actions 双 Node 版本实跑 |

### 3.6 流程与业务

| 能力 | 状态 | 要点 |
|---|---|---|
| 流程定义 / 校验 | ✅ | `FlowSchema` + `validateFlow`；线性/条件跳过/驳回回退 |
| 审批动作 | ✅ | start / approve / reject；`onApprove.setField` 回写记录 |
| 待办与权限 | ✅ | `assignee` = starter / role；RBAC 通配豁免 |
| 门户与图表 | ✅ | 纯 SVG 三形态图表 + 指标卡 + 卡片导航 |
| 运维事件 | ✅ | 追加写入 + 环形裁剪；汇总/错误/性能 |

---

## 4. 未完成：纯未开发（按优先级）

> 这些是**能力缺口/后续增强**，不是已交付功能的缺陷。
> 优先级按「上生产/多实例」与「产品完整度」划分。

### P1 · 上生产前建议补齐

| # | 事项 | 现状与影响 | 来源 |
|---|---|---|---|
| 1 | Redis 共享限流 / 分布式锁 | 限流为进程内计数；多实例可绕过、Webhook 跨主机需 MySQL 行锁 | `security-hardening` §6 |
| 2 | 安全审计 / 账号锁定 / JWT `kid` 轮换 | 登录失败、429、CORS 拒绝不落审计；无账号维度退避；JWT 单密钥 | 同上 |
| 3 | 指标 / 追踪 / 告警 | 无 Prometheus/OTel/Sentry；仅有结构化日志与 `/health` | `observability-deployment` §6 |
| 4 | 对象存储 / CDN / Range / 下载鉴权 | 文件存 DB 或本地；大附件、断点续传、鉴权缺失 | README 已知限制 |
| 5 | 多环境晋级 / 灰度 / 压测基线 | 无环境分层、无灰度、无性能基线 | PROGRESS 未实现表 |
| 6 | 日志轮转 / 磁盘与连接池级 `/ready` | 日志交外部采集；`/ready` 只验证目录可写 | `observability-deployment` §6 |

### P2 · 产品与开放能力

| # | 事项 | 现状 | 来源 |
|---|---|---|---|
| 7 | 服务端物料市场 | 只有设计器侧受信元数据；无清单托管、发布审核、租户级安装状态 | `material-market.md` |
| 8 | Swagger UI / 客户端 SDK | 只有 `GET /openapi.json` | `openapi.md` |
| 9 | 第三方数据源连接器 | 仅平台内置模型/记录数据源 | `openapi.md` |
| 10 | 组织架构服务 | `dept` 降级 self；人员/部门为静态候选 | phase2-plan |
| 11 | 消息通知 / 导出 / 打印 | Phase 3 决策裁剪，仍未开发 | PROGRESS 未实现表 |
| 12 | 离线队列 / BPMN | 方案二期能力 | PROGRESS |
| 13 | 文件列表 / 删除 / 回收站 / 去重 / 病毒扫描 | 仅上传与读取 | README |
| 14 | 批量删除事务化 / 行级独立权限点 | 逐条串行、非原子；由模型 RBAC 兜底 | README |

### P3 · 设计器与渲染增强

| # | 事项 | 现状 | 来源 |
|---|---|---|---|
| 15 | 5 个复杂 setter | `slider/ruleEditor/fieldPicker/dataSourcePicker/eventBinder` 只读占位 | phase2-plan |
| 16 | 页面 name 手动编辑 / enum label 映射 | 新建默认 name=pageId；列表显示 enum 原始值 | designer-plan |
| 17 | 大纲树拖拽 / 框选 / 多选 / 右键层级 | 仅展示/选中/删除 | designer-plan |
| 18 | 智能匹配 / 按模型批量生成表单页 | 未开发 | designer-plan |
| 19 | 字段引用存在性校验 | 引用无效字段时运行时降级，不报错 | phase2-plan |
| 20 | 版本管理增强（note/互比/删除版本/整页 JSON） | 仅列出/回滚/diff | designer-plan |
| 21 | RBAC 用户管理 UI / 角色删除 | 用户为种子；角色只 upsert | phase2-plan |
| 22 | 渲染 L-1/L-2/L-3/L-6/L-7 | 根变量级联动、全量重算、隐藏子树不解算、物料映射空、`app` 仅生命周期 | PROGRESS L 表 |
| 23 | 图表跟随主题色 / 交互式图例/tooltip | 纯 SVG，不随主题；无 hover | README / design-system |
| 24 | 标准页 `cardTemplate` / `filter` 表达式 / `search.fields` | 未开发 | phase2-plan |
| 25 | 流程可视化编辑器 / condition 分支树 / 转办加签 / 详情页审批插槽 | 接口直建、条件仅跳过 | phase3-plan |

### P4 · 移动端增强

| # | 事项 | 现状 |
|---|---|---|
| 26 | 小程序主题动态化 | 主题仅 H5 生效 |
| 27 | 物料按需裁剪 / 包体积优化 | 未开发 |
| 28 | App 打包脚本 | 仅产出 HBuilderX 可导入资源 |

---

## 5. 未完成：受环境阻塞（非能力问题）

| 事项 | 阻塞原因 | 已做到哪一步 |
|---|---|---|
| 微信小程序真机验证 | 本机无微信开发者工具 | `build:mp-weixin` 产物级验证通过（分包、`wx:if` 链、主包体积） |
| Android APK / iOS IPA | 无 HBuilderX + 签名证书 | `build:app` 产出可导入资源 |
| Gitee 托管 CI | Gitee Go Node 插件最高 15.12，项目需 ≥20 | Gitee 仅作代码镜像 |
| MySQL 集成测试 / 冒烟 | 需本机 MySQL 实例 | 已在本机 `lowcode_test` 实测 10/10 |
| 真机扫码 | 环境限制 | 以 H5 浏览器实测替代 |

---

## 6. 明确不做（设计边界）

| 事项 | 原因 |
|---|---|
| 远程 JS 组件下载 / 执行 | 安全边界：只接受受信元数据，禁止 `eval`/`new Function`/动态 `import` |
| 动态表方案 A（每个模型建物理表） | 沿用方案 B：JSON 记录 + 模型定义；MySQL 存 `data_records` |
| Turborepo | 用 `pnpm -r` 递归即可满足当前规模（D-4，可选项） |
| BPMN 标准建模 | 轻量状态机已满足当前审批场景，BPMN 留二期 |

---

## 7. 文档地图

### 当前有效（规范与运行手册）

| 文档 | 用途 |
|---|---|
| [`OPERATIONS.md`](OPERATIONS.md) | **操作手册**：本地启动、设计器建页/发布、多端构建、MySQL 切换、部署备份、故障排查 |
| [`protocol.md`](protocol.md) | 对外协议规范（Expr/Page/Action/Material/Model/Flow/App/错误码/接口） |
| [`openapi.md`](openapi.md) | OpenAPI 3.1：获取、50 条路由、鉴权/乐观锁/幂等约定 |
| [`material-market.md`](material-market.md) | 远程物料清单格式、验签、白名单与配置 |
| [`design-system.md`](design-system.md) / [`design-system-ops.md`](design-system-ops.md) | 设计规范与 6 道门禁台账 |
| [`observability-deployment-2026-10-21.md`](observability-deployment-2026-10-21.md) | 探针 / 请求 ID / 访问日志 / systemd / 备份 |
| [`security-hardening-2026-10-20.md`](security-hardening-2026-10-20.md) | JWT / CORS / 限流实现与剩余风险 |
| [`adr/`](adr/) | 11 篇架构决策记录（追加式，不删改） |
| [`PROGRESS.md`](PROGRESS.md) | 逐批历史台账、偏差与缺陷留档 |

### 已归档（历史过程，结论不再代表现状）

见 [`archive/README.md`](archive/README.md)。

---

## 8. 如何复验

完整命令与期望值见 [`PROGRESS.md`](PROGRESS.md) 的「如何验证本批次交付」。最短路径：

```powershell
cd D:\mimo\lowcode
pnpm install --frozen-lockfile
pnpm design:check      # 6 道设计门禁
pnpm build             # 必须先于 typecheck（workspace types 指向 dist）
pnpm typecheck
pnpm test              # 1174 passed + 10 skipped
pnpm coverage          # 94.35 / 85.22 / 93.77 / 94.35
pnpm -F @lc/runtime build:h5
pnpm -F @lc/runtime build:mp-weixin
pnpm -F @lc/runtime build:app
```

远端：push 到 GitHub `main` 触发 `.github/workflows/ci.yml`，期望 `verify` + `node20-core` 两个 job 全绿。
