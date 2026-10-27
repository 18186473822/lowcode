# 项目状态与变更记录（PROGRESS）

> 最后更新：2026-10-27 ｜ 状态基线：`e966a09`（CI run #12 全绿）
> 本文件合并了原 `STATUS.md` 与逐批台账（原文已删除，git 历史可追溯）。
> 只写经过实际验证的结论；数字均来自本机或 GitHub Actions 实跑。
> 操作与部署见 [`OPERATIONS.md`](OPERATIONS.md)，架构决策见 [`DECISIONS.md`](DECISIONS.md)，历史设计依据见 [`PLANS.md`](PLANS.md)。

---

## 1. 一句话结论

移动端低代码平台的主链路（协议 → 设计器 → 运行时 → 服务端 → MySQL）与 Phase 0~3 已全部收口；
Phase 4 的**安全加固、可观测性、MySQL 落库、并发控制、Webhook 生产化、远程物料（设计器侧）与服务端物料市场**已完成；
GitHub Actions 远端 CI 已实跑全绿。

**现有系统可直接支撑「单租户 + 单/少量服务实例」的内部业务应用落地**；
距离「多租户 SaaS + 开放生态」还差一批企业级平台能力（见 §4）。

---

## 2. 当前关键指标（实测）

| 指标 | 实测值 | 证据 |
|---|---|---|
| 数据库表 | **19 张** | `apps/server/prisma/schema.prisma` |
| OpenAPI 路由 | **64 条** | `apps/server/test/openapi.test.ts` 断言 + [`openapi.md`](openapi.md) |
| 测试 | **1206 passed + 10 skipped / 83 文件** | `pnpm test`（2026-10-27 实测） |
| 覆盖率 | **94.48 / 85.60 / 94.06 / 94.48**（stmts/branch/funcs/lines） | `pnpm coverage`，阈值 90/85/90/90 |
| 类型检查 / 构建 | **7 包 typecheck / 5 包 build 全过** | `pnpm typecheck` / `pnpm build` |
| 设计门禁 | **6 道全过** | `pnpm design:check` |
| 远端 CI | **两个 job 全绿** | GitHub Actions run #12（`e966a09`）`verify` + `node20-core` |
| 移动端编译 | **H5 / 微信小程序 / App 三端 DONE** | `build:h5` / `build:mp-weixin` / `build:app` |
| MySQL 集成 | **10/10 PASS（本机 + CI）** | `mysql.persistence.test.ts`（`LC_TEST_DATABASE_URL`；CI 由 MySQL 8 服务容器提供） |
| JSON→MySQL 导入 | **幂等**（重复两次结果一致） | `webhooks=1, deliveries=1, archives=1` 回读；`market.json` → 3 物料/3 版本/3 安装，两次导入三表快照一致（本机 `lowcode_test` + CI 实测） |

> CI 覆盖：Node 22 全量门禁（设计门禁 → build → typecheck → 三端编译 → test → coverage →
> MySQL 8 迁移/仓储集成/市场导入幂等/真启动冒烟 → 服务端/安全/可观测性冒烟）+
> Node 20 核心兼容（build → typecheck → test）。

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
| 服务端市场托管 | ✅ | 清单 ES256 签名、发布审核状态机、不可变版本快照、租户级安装状态 |

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
| NestJS API | ✅ | 64 条路由；JWT、RBAC、限流、CORS、请求 ID |
| 动态 CRUD | ✅ | 模型/记录/文件/页面/RBAC/流程/运维/应用配置/Webhook/物料市场 |
| JSON 仓储 | ✅ | 默认/测试路径；单进程 `KeyedLock`；原子写 |
| MySQL 8 + Prisma | ✅ | 19 表；全部业务仓储双实现；迁移纳入发布流程 |
| 乐观锁 / 幂等 | ✅ | 页面、记录、流程实例 `revision` CAS；`If-Match`；审批幂等 + `pendingPatch` |
| 文件 | ✅ | 10MB 上限；MySQL `LONGBLOB` 或本地双文件 |
| 数据导入 | ✅ | `import:json-to-mysql` 覆盖页面/模型/记录/RBAC/流程/运维/配置/文件/Webhook 三表/市场三表 |

### 3.5 生产化

| 能力 | 状态 | 要点 |
|---|---|---|
| 安全加固 | ✅ | JWT 生产 fail-closed；CORS 白名单；普通/登录限流；启动自检（[`OPERATIONS.md`](OPERATIONS.md) 附录 A） |
| 可观测性 | ✅ | `/health`、`/ready`、`X-Request-Id`、结构化访问日志（附录 B） |
| 部署与备份 | ✅ | systemd、MySQL/JSON 备份、日志采集指引 |
| Webhook 生产化 | ✅ | 多副本租约、订阅限流、TTL 归档、DNS 级 SSRF、签名时间窗/重放缓存、自定义头黑名单、轮换宽限期、指标告警、管理 UI |
| 远程物料市场 | ✅（设计器 + 服务端） | ES256 验签/签名、origin allowlist、本地缓存；服务端清单托管、审核、版本快照、租户安装；受控组件白名单 |
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

## 4. 未完成：能力缺口（按优先级）

> 这些是后续增强，不是已交付功能的缺陷。优先级按「上生产/多实例」与「产品完整度」划分。

### P1 · 上生产前建议补齐

| # | 事项 | 现状与影响 |
|---|---|---|
| 1 | Redis 共享限流 / 分布式锁 | 限流为进程内计数；多实例可绕过、Webhook 跨主机需 MySQL 行锁 |
| 2 | 安全审计 / 账号锁定 / JWT `kid` 轮换 | 登录失败、429、CORS 拒绝不落审计；无账号维度退避；JWT 单密钥（附录 A.5） |
| 3 | 指标 / 追踪 / 告警 | 无 Prometheus/OTel/Sentry；仅有结构化日志与 `/health`（附录 B.5） |
| 4 | 对象存储 / CDN / Range / 下载鉴权 | 文件存 DB 或本地；大附件、断点续传、鉴权缺失 |
| 5 | 多环境晋级 / 灰度 / 压测基线 | 无环境分层、无灰度、无性能基线 |
| 6 | 日志轮转 / 连接池级 `/ready` | 日志交外部采集；`/ready` 只验证目录可写与 `SELECT 1` |

### P2 · 产品与开放能力

| # | 事项 | 现状 |
|---|---|---|
| 7 | 租户成员关系 / 配额 | 市场与安装状态仅按 `X-LC-Tenant` 隔离，成员校验由网关/身份提供方承担；无租户管理 API、配额与用量限制 |
| 8 | Swagger UI / 客户端 SDK | 只有 `GET /openapi.json` |
| 9 | 第三方数据源连接器 | 仅平台内置模型/记录数据源 |
| 10 | 组织架构服务 | `dept` 降级 self；人员/部门为静态候选 |
| 11 | 消息通知 / 导出 / 打印 | Phase 3 决策裁剪，仍未开发 |
| 12 | 离线队列 / BPMN | 方案二期能力 |
| 13 | 文件列表 / 删除 / 回收站 / 去重 / 病毒扫描 | 仅上传与读取 |
| 14 | 批量删除事务化 / 行级独立权限点 | 逐条串行、非原子；由模型 RBAC 兜底 |

### P3 · 设计器与渲染增强

| # | 事项 | 现状 |
|---|---|---|
| 15 | 5 个复杂 setter | `slider/ruleEditor/fieldPicker/dataSourcePicker/eventBinder` 只读占位 |
| 16 | 页面 name 手动编辑 / enum label 映射 | 新建默认 `name = pageId`；列表显示 enum 原始值 |
| 17 | 大纲树拖拽 / 框选 / 多选 / 右键层级 | 仅展示/选中/删除 |
| 18 | 智能匹配 / 按模型批量生成表单页 | 未开发 |
| 19 | 字段引用存在性校验 | 引用无效字段时运行时降级，不报错 |
| 20 | 版本管理增强（note/互比/删除版本/整页 JSON） | 仅列出/回滚/diff |
| 21 | RBAC 用户管理 UI / 角色删除 | 用户为种子；角色只 upsert |
| 22 | 渲染 L-1/L-2/L-3/L-6/L-7 | 根变量级联动、全量重算、隐藏子树不解算、物料映射空、`app` 仅生命周期 |
| 23 | 图表跟随主题色 / 交互式图例/tooltip | 纯 SVG，不随主题；无 hover |
| 24 | 标准页 `cardTemplate` / `filter` 表达式 / `search.fields` | 未开发 |
| 25 | 流程可视化编辑器 / condition 分支树 / 转办加签 / 详情页审批插槽 | 接口直建、条件仅跳过 |

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
| 大体量 MySQL 压测 | 需独立压测环境与数据 | 功能级 MySQL 集成、市场导入幂等与真启动冒烟已纳入 CI；未做百万级数据量/长事务压测 |
| 真机扫码 | 环境限制 | 以 H5 浏览器实测替代 |

---

## 6. 明确不做（设计边界）

| 事项 | 原因 |
|---|---|
| 远程 JS 组件下载 / 执行 | 安全边界：只接受受信元数据，禁止 `eval` / `new Function` / 动态 `import` |
| 动态表方案 A（每个模型建物理表） | 沿用方案 B：JSON 记录 + 模型定义；MySQL 存 `data_records` |
| Turborepo | `pnpm -r` 递归已满足当前规模（ADR-006） |
| BPMN 标准建模 | 轻量状态机已满足当前审批场景，BPMN 留二期 |

---

## 7. 里程碑（按日期）

| 日期 | 阶段 | 结果 |
|---|---|---|
| 2026-09-29 | Phase 0 批 1~3 | Monorepo、协议/表达式/渲染三包成形；服务端骨架 + 协议 v1.0（524 行） |
| 2026-10-08 | Phase 0 收尾 | uni-app 运行时壳、H5 全链路实测、CI 与覆盖率骨架（实测 95.6%） |
| 2026-10-09 | Phase 0 收尾 | 组件层 jsdom 冒烟 7 例；ADR-001~006 建档 |
| 2026-10-09 | Phase 1 批 1 | 物料库归位（12 物料）、设计器画布可渲染、浏览器实测 |
| 2026-10-09 | Phase 1 批 2 | 拖入/换位/删除、大纲树、快捷键、DnD 指示线 |
| 2026-10-10 | Phase 1 批 3 | 4 类 setter、保存/打开/发布链路、ETag 冲突处理 |
| 2026-10-10 | Phase 1 补充 | 服务端模型/记录/文件 CRUD（10MB 上限、三步校验） |
| 2026-10-12 | Phase 1 批 4 | 页面↔模型双层字段绑定（D-A11） |
| 2026-10-12 | Phase 1 补充 | `/apps/bootstrap`、运行时壳登录/菜单/统一渲染入口 |
| 2026-10-14 | Phase 1 批 5 | 必填联动 + 动作绑定；**Phase 1 出口判据全通** |
| 2026-10-14 | Phase 2 批 1 | 模型可视化建模（字段表格 + 协议同源校验） |
| 2026-10-14 | Phase 2 批 2 | 列表/详情标准页 + `DetailPageConfig` |
| 2026-10-14 | Phase 2 批 3 | 物料 12→30（META 31），setter 补 optionList/color |
| 2026-10-14 | Phase 2 批 4 | 撤销重做双栈、大纲树双向选中、跨页剪贴板 |
| 2026-10-14 | Phase 2 批 5 | `GET /pages/:id/versions` + 自研结构化 diff + 历史弹窗 |
| 2026-10-15 | Phase 2 批 6 | RBAC 单文件配置 + 四层判定（页面/按钮/模型/行级） |
| 2026-10-15 | Phase 2 批 7 | 请假三页 Demo + 小程序分包；**Phase 2 收口** |
| 2026-10-15 | Phase 3 批 1 | `FlowSchema`/`validateFlow`、7 接口、提交联动启动实例 |
| 2026-10-16 | Phase 3 批 2 | `ApprovalBar`/`Timeline`、`LcFlowHost` 注入、待办中心两页 |
| 2026-10-19 | Phase 3 批 3 | 表单草稿（7 天过期）、主题十档派生、dark 优先级 |
| 2026-10-20 | Phase 3 批 4 | 纯 SVG 图表 + `Statistic`、Portal 页型；修 4 个真实缺陷 |
| 2026-10-20 | Phase 3 批 5 | 运维事件三接口、上报队列、双端 Profiler；**Phase 3 全收口** |
| 2026-10-20 | 修复批次 | Profiler 硬编码色值、`GET/DELETE /pages`、设计器页面下拉与两步删除 |
| 2026-10-20 | Phase 4 · 安全 | JWT fail-closed、CORS 白名单、普通/登录限流、启动自检 |
| 2026-10-21 | Phase 4 · 可观测性 | `/health`、`/ready`、`X-Request-Id`、结构化访问日志 |
| 2026-10-21 | Phase 4 · MySQL 第一批 | 8 表：用户/角色/页面/版本/模型/记录/页面授权（ADR-008） |
| 2026-10-21 | Phase 4 · MySQL 第二批 | 流程/实例/运维事件/应用配置 4 表（ADR-009）；ops 改追加写入 |
| 2026-10-22 | Phase 4 · MySQL 第三批 | `files` 表（`LONGBLOB`），上传下载字节一致（ADR-010） |
| 2026-10-23 | Phase 4 · 开放集成 | Webhook 多副本/限流/归档/SSRF/轮换/UI + 远程物料闭环 |
| 2026-10-23 | 工程化 | GitHub Actions run #3/#4 双 job 全绿；修 B-48/B-49 |
| 2026-10-23 | 文档 | 新增 `OPERATIONS.md` 操作手册；CI run #6 全绿 |
| 2026-10-27 | 文档整合 | 合并为 8 个文档并删除 23 个冗余文件；修 B-50 时间依赖测试；CI run #8 全绿 |
| 2026-10-27 | 服务端物料市场 | 清单 ES256 签名 + `If-None-Match`、审核/发布状态机、不可变版本快照、租户级安装；3 表 + 5 条 MySQL 仓储用例；路由 50→64；CI run #10/#11 全绿 |
| 2026-10-27 | MySQL 导入实测 | `market.json` → 市场三表 3/3/3；重复执行快照一致；`MysqlMarketRepository` 回读字段一致；CI run #12 全绿 |
| 2026-10-27 | 安全修复 | RBAC 三个管理接口补管理员校验（权限点 `*`），封堵任意登录用户自提权；补 403 回归测试、OpenAPI 403 与协议文档 |

---

## 8. 关键缺陷与教训

> 完整缺陷编号（B-1~B-50）的逐条记录已随台账合并进本表；只保留仍具迁移价值的部分。

| 编号 | 现象 | 根因 | 固化措施 |
|---|---|---|---|
| B-15 | `node dist/main.js` 启动 `SyntaxError` | 对 CJS 包用具名导入，Node ESM 探测失败；vitest 预打包兜底掩盖 | 改默认导入；**vitest 通过 ≠ 运行时可用，必须构建产物真实启动** |
| B-18 | 页面顶部渲染「未知组件：Page」 | `lc-node` v-if 链缺容器分支 | 补容器分支 + 组件回归用例 |
| B-19 | 输入改值后视图不刷新 | 递归节点未冒泡 `@change` | 递归绑定事件 + jsdom 回归锁 |
| B-20 | `pnpm -r test` 全挂 | vitest 向上发现 workspace 根配置 | 配置移入 `config/` 隔离 |
| B-21 | 中文物料文件乱码、SFC 编译失败 | PowerShell 默认 ANSI 读写 UTF-8 | 改用专用编辑工具或显式 `-Encoding utf8` |
| B-29 | 服务端 34 用例全红、设计器 502 | 本机 IPv6 `::1` 被拦，监听绑到 `::`/`localhost` | 三处显式绑 `127.0.0.1` |
| B-31 | 改 `packages/*` 不生效 | 消费 `dist` + Vite 依赖预构建缓存 | 顺序：build 包 → 删 `.vite` → 重启 dev |
| B-35 | 自动化脚本操作后数据错位 | 脚本中断留半编辑态、复用已释放 key | 每步服务端回读核对，不信任前端结果 |
| B-37 | 新接口 404，误判「接口未实现」 | 服务端无 watch，旧进程持旧路由表 | build 后必须重启进程 |
| B-41 | 新拖入物料自带 demo 字段绑定 | META `defaultProps` 残留 `$expr: formData.*` | 注册表默认值与 demo fixture 分离 |
| B-44 | 审批宿主「未注入」，单测却全绿 | Vite 预构建产物与 easycom 源码双实例，symbol 不一致 | 物料统一从包入口导入；provide/inject 断链优先查模块实例 |
| B-45 | coverage 偶发 exit 码污染 | `--workspace` 根配置不下发 worker（`rpcTimeout` 在 vitest 2.1.9 并不存在） | 消除日志洪泛 + `--no-file-parallelism` |
| B-46 | renderer 测试 150s 超时 | 缺 21 个物料 stub → Vue warn 洪泛 → stdout 回压阻塞 RPC | 补全 stub；测试日志量也是稳定性因素 |
| B-47 | 改物料后运行时不更新 | `.vite` 依赖预打包缓存未失效 | 删 `packages/runtime/node_modules/.vite` |
| B-48 | rpx 令牌在 CI 静默失效 | CRLF 换行导致生成/比对不一致 | 生成脚本按 LF 归一 + CI 校验 |
| B-49 | CI typecheck 找不到 workspace 类型 | `types` 指向 `dist` | **必须先 `build` 再 `typecheck`** |
| B-50 | Webhook 指标测试在 2026-10-23 之后必红 | fixture 用固定 `createdAt = 2026-10-22`，而 metrics 按真实「最近 24 小时」统计 | 时间窗口断言一律用相对当前时间；固定时间只用于纯逻辑用例 |
| B-51 | 任意登录用户可 `PUT /rbac/roles/designer` 给自己角色加 `*` | RBAC 三个接口只挂 `AuthGuard`，漏了管理面鉴权；`perms` 实时读取使提权立即生效 | 管理面接口统一 `permsOf(user).includes('*')` 判定；新增 403 回归测试锁定 |

---

## 9. 如何复验

```powershell
cd D:\mimo\lowcode
pnpm install --frozen-lockfile
pnpm design:check      # 6 道设计门禁
pnpm build             # 必须先于 typecheck（workspace types 指向 dist）
pnpm typecheck
pnpm test              # 1206 passed + 10 skipped / 83 文件
pnpm coverage          # 94.48 / 85.60 / 94.06 / 94.48
pnpm -F @lc/runtime build:h5
pnpm -F @lc/runtime build:mp-weixin
pnpm -F @lc/runtime build:app
```

MySQL 相关（本机需实例；CI 已用 MySQL 8 服务容器自动执行）：

```powershell
$env:LC_TEST_DATABASE_URL = 'mysql://.../lowcode_test'
$env:LC_SMOKE_DATABASE_URL = $env:LC_TEST_DATABASE_URL
pnpm -F @lc/server prisma:migrate
pnpm -F @lc/server exec vitest run test/mysql.persistence.test.ts
pnpm -F @lc/server verify:market-import
pnpm -F @lc/server smoke:mysql
```

安全 / 可观测性冒烟（自起临时实例）：

```powershell
pnpm smoke:security
pnpm smoke:observability
```

远端：push 到 GitHub `main` 触发 `.github/workflows/ci.yml`，期望 `verify` + `node20-core` 两个 job 全绿。

---

## 10. 文档地图

| 文档 | 用途 |
|---|---|
| [`PROGRESS.md`](PROGRESS.md) | **本文件**：当前状态、能力总览、剩余工作、里程碑、缺陷教训 |
| [`OPERATIONS.md`](OPERATIONS.md) | 操作与运维：启动、建页发布、多端构建、MySQL、部署备份、排障、安全/可观测性附录 |
| [`protocol.md`](protocol.md) | 对外协议规范（Expr / Page / Action / Material / Model / Flow / App / 错误码 / 接口） |
| [`openapi.md`](openapi.md) | OpenAPI 3.1：获取方式、64 条路由、鉴权/乐观锁/幂等约定 |
| [`material-market.md`](material-market.md) | 服务端市场（清单托管/审核/发布/租户安装）+ 设计器侧清单格式、验签、白名单与配置 |
| [`design-system.md`](design-system.md) | 设计规范（§1~§8）+ 实施台账与 6 道门禁（§9~§10） |
| [`DECISIONS.md`](DECISIONS.md) | 架构决策记录 ADR-001~011（追加式，不删改） |
| [`PLANS.md`](PLANS.md) | Phase 1~3 的历史设计依据与决策摘要（均已收口） |

保留的非 Markdown 资产：`contrast.json`、`tokens.w3c.json`（门禁脚本依赖），`material-icons.html`（图标审核页），`screenshots/`（实测证据）。
