# lowcode —— 移动端低代码平台

uni-app + Vue 3 全端低代码平台。业务人员在 Web 设计器拖拽建页 → 发布 Schema → 移动端（H5 / 微信小程序）按 Schema 动态渲染，含模型建模、列表/详情标准页、RBAC、版本回滚、审批流程、门户看板。

> **状态**：Phase 0 / 1 / 2 / 3 全部收口（出口判据均达成）；Phase 4 主体完成，安全加固、可观测性、**MySQL 数据库**（用户/角色、页面/版本、模型/记录、RBAC、流程定义/实例、运维事件、应用配置、文件元数据/内容、Webhook 订阅/投递/归档、物料市场物料/版本/安装，共 19 表）、**页面/记录/流程实例乐观锁 + 审批幂等**（ADR-011）、**详情页记录编辑/删除**、**列表页行内编辑/批量删除**、**OpenAPI 3.1 文档（64 条路由）**、**Webhook 生产化**（多副本租约、订阅限流、TTL 归档、DNS 级 SSRF、轮换宽限期、管理 UI/指标）、**服务端物料市场**（清单托管与 ES256 签名、发布审核状态机、不可变版本快照、租户级安装状态）与**远程物料受信元数据闭环 + 物料市场面板**完成；**GitHub Actions 远端 CI 已实跑通过**（run #3/#4/#10/#11/#12，Node 22 全量门禁 + MySQL 8 集成/导入 + H5/小程序/App 编译 + Node 20 核心兼容两个 job 全绿）。当前能力与剩余工作见 [`docs/PROGRESS.md`](docs/PROGRESS.md)；仍受环境限制未完成：微信小程序真机验证、Android/iOS 安装包。
> **当前能力与剩余工作**见 [`docs/PROGRESS.md`](docs/PROGRESS.md)；上手与运维操作见 [`docs/OPERATIONS.md`](docs/OPERATIONS.md)；架构决策见 [`docs/DECISIONS.md`](docs/DECISIONS.md)；历史设计依据见 [`docs/PLANS.md`](docs/PLANS.md)。

---

## 环境要求

| 项 | 版本 |
|---|---|
| Node.js | ≥ 20（开发机实测 22.23.2） |
| pnpm | 12.6.0（见根 `package.json` 的 `packageManager`） |

```bash
pnpm install
```

## 快速启动

三个进程，建议按此顺序：

```bash
# ① 服务端（NestJS，默认 :3000）
pnpm -F @lc/server build
pnpm -F @lc/server start

# ② 设计器（Vite，:5174，/api 已代理到 :3000）
pnpm -F @lc/designer-web dev
#    → http://127.0.0.1:5174

# ③ 移动端 H5 运行时（uni-app，:5173）
pnpm -F @lc/runtime dev:h5
#    → http://127.0.0.1:5173
```

> 仓库**不包含**运行时数据 `apps/server/data/`（已在 `.gitignore` 中忽略）。新克隆环境首次启动是空库，现有演示页/记录不会跟随仓库；需通过设计器重新搭建，或导入 `apps/server/scripts/seed-pgc-demo.json`。
>
> **当前阶段决策（2026-10-22）**：核心业务数据已支持 **MySQL 8 + Prisma**；`LC_STORAGE=json`（默认）保留给单测/无数据库 CI，`mysql` 用于本地与生产。流程定义/实例、运维事件、应用配置已在第二批迁入 MySQL；文件元数据与内容已在第三批迁入 `files` 表（ADR-008 / ADR-009 / ADR-010）；Webhook 订阅与投递日志在开放集成第二批迁入 `webhook_subscriptions` / `webhook_deliveries`。页面、记录、流程实例写接口已启用 `revision` 乐观锁；审批支持 `Idempotency-Key`，流程结束回写记录走 `pendingPatch` 补偿（ADR-011）；标准详情页已提供记录编辑/删除入口（`detail.editable/deletable` 显式开启，PUT/DELETE 回传 `If-Match`，409 不覆盖他人修改）；标准列表页已提供行内编辑与批量删除（`list.editable/deletable` 显式开启，逐行 `If-Match`，冲突行保留选择，删空当前页自动回第一页）。

### 数据库（Phase 4 三批：MySQL 8 + Prisma）

默认 `LC_STORAGE=json`，不依赖数据库；需要事务/多进程写入时切 MySQL：

```bash
# 1. 建库与专用账号（示例；口令自行替换，勿提交 .env）
mysql -uroot -p -e "CREATE DATABASE lowcode CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -uroot -p -e "CREATE USER 'lc_app'@'localhost' IDENTIFIED BY '<strong-password>'; GRANT ALL PRIVILEGES ON lowcode.* TO 'lc_app'@'localhost'; FLUSH PRIVILEGES;"

# 2. 配置连接（apps/server/.env 已被 .gitignore 忽略）
cp apps/server/.env.example apps/server/.env   # 编辑 DATABASE_URL / LC_STORAGE=mysql

# 3. 生成客户端 + 应用迁移 + 开发种子
pnpm -F @lc/server prisma:generate
pnpm -F @lc/server prisma:migrate
pnpm -F @lc/server seed:mysql                 # 仅开发：admin/admin123、designer/designer123

# 4. 构建并以 MySQL 模式启动（start:mysql 会读取 apps/server/.env）
pnpm -F @lc/server build
pnpm -F @lc/server start:mysql

# 可选：把现有 JSON 页面/模型/记录/RBAC/流程/运维事件/应用配置/上传文件/Webhook 导入（幂等 upsert）
pnpm -F @lc/server import:json-to-mysql
```

| 变量 | 默认 | 说明 |
|---|---|---|
| `LC_STORAGE` | `json` | `json` / `mysql`；非法值启动失败 |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/db`，`LC_STORAGE=mysql` 时必填 |
| `LC_DATA_DIR` | `<cwd>/data` | JSON 模式下列表数据与上传文件根目录；MySQL 模式仅保留历史兼容目录，文件已入 `files` 表 |

> 服务端本身**不自动加载 `.env`**：`start:mysql` 用 Node `--env-file=.env`，生产请由 systemd/容器注入环境变量。Prisma CLI 会自动读取 `apps/server/.env`。
> MySQL 表：`users / roles / user_roles / pages / page_versions / models / data_records / rbac_page_grants / flow_definitions / flow_instances / ops_events / app_config / files / webhook_subscriptions / webhook_deliveries / webhook_delivery_archives / market_materials / market_material_versions / market_installs`（19 表）。流程定义删除不级联删除实例；文件元数据与 `LONGBLOB` 内容同行，上传/下载在同一事务边界内完成；删除 Webhook 订阅不级联删除投递日志，过期终态日志先归档到 `webhook_delivery_archives` 再删除；市场版本快照不可变，安装按 `(tenantId, materialId)` 唯一。

### 安全配置（Phase 4）

服务端**不自动加载 `.env`**，需在启动前注入环境变量。生产至少设置：

```bash
export NODE_ENV=production
export LC_JWT_SECRET="$(openssl rand -base64 48)"   # ≥32 字符
export LC_CORS_ORIGINS="https://lc.example.com"     # 生产未设置=不放行跨域
```

| 变量 | 默认 | 说明 |
|---|---|---|
| `LC_JWT_SECRET` | 非生产回退开发密钥 | 生产必填，≥32 字符；禁止仓库内置开发值 |
| `LC_CORS_ORIGINS` | 开发 `localhost:5173/5174` | 逗号分隔的完整源；拒绝 `*`、路径、查询 |
| `LC_RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口 |
| `LC_RATE_LIMIT_MAX` | `600` | 普通接口每 IP 每窗口上限 |
| `LC_LOGIN_RATE_LIMIT_MAX` | `20` | 登录接口每 IP 每窗口上限 |
| `LC_TRUST_PROXY` | `false` | 反向代理后设 `true`（仅信任一层） |

超限返回 `429 { code: 'RATE_LIMITED' }` 与 `Retry-After`。当前为单进程内存限流，多实例部署需换 Redis；详见 [`docs/OPERATIONS.md`](docs/OPERATIONS.md) 附录 A。

### 可观测性与部署探针（Phase 4）

| 变量 | 默认 | 说明 |
|---|---|---|
| `LC_ACCESS_LOG` | production 开启 | 结构化访问日志开关；`1/0/true/false` 覆盖，非法值启动失败 |
| `LC_APP_VERSION` | `0.1.0` | `GET /api/v1/health` 返回的版本号，部署时注入构建版本 |

- `GET /api/v1/health`：存活探针，无需登录，返回 `{ status, storage, version, uptimeSeconds, timestamp }`。
- `GET /api/v1/ready`：就绪探针；JSON 模式检查 `LC_DATA_DIR`，MySQL 模式同时检查数据目录与 `SELECT 1`；不可用返回 `503 { code: 'NOT_READY', checks }`。
- 两个探针**不计入限流**；所有响应带 `X-Request-Id`（合法客户端值原样复用，否则生成 UUID）。
- 访问日志为**单行 JSON**，字段含 `requestId/method/path/status/durationMs/ip`，不记录 query、body、Authorization。
- 部署、systemd、备份与日志采集见 [`docs/OPERATIONS.md`](docs/OPERATIONS.md) §6；探针/日志字段契约见附录 B。

### 开放接口文档（Phase 4）

```bash
# 公开只读；不需要 JWT，仍计入普通限流
curl -s http://localhost:3000/api/v1/openapi.json > openapi.json
```

- 标准 **OpenAPI 3.1.0**，`servers[0].url = /api/v1`，覆盖当前 **64 条**实际路由。
- 可直接导入 Swagger UI / Apifox / Postman / OpenAPI Generator；文档内已标注 Bearer 鉴权、`If-Match` 乐观锁、审批 `Idempotency-Key`、错误体与 409/413/429/503。
- 路径/方法由 `apps/server/test/openapi.test.ts` 反射 Nest 路由逐条比对，新增/删除接口未同步会直接测试失败。
- 获取、导入、维护说明与未包含项见 [`docs/openapi.md`](docs/openapi.md)，接口约定见 [`docs/protocol.md`](docs/protocol.md) §10.7。

### Webhook（Phase 4 开放集成第二批）

```bash
# 管理员登录后创建订阅；响应中的 secret 只返回一次
curl -s -X POST http://localhost:3000/api/v1/webhooks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"ERP","url":"https://erp.example.com/lc","events":["record.created","flow.completed"]}'
```

| 变量 | 默认 | 说明 |
|---|---|---|
| `LC_WEBHOOK_WORKER` | 开启 | 设为 `off` 关闭后台投递 worker；`NODE_ENV=test` 下始终不启动 |
| `LC_WEBHOOK_WORKER_INTERVAL_MS` | `5000` | worker 扫描间隔，最小 1000ms |
| `LC_WEBHOOK_LEASE_MS` | `90000` | 多副本投递租约；worker 崩溃后到期可被重领 |
| `LC_WEBHOOK_RETENTION_DAYS` | `30` | 终态投递日志保留天数；先归档再删除 |
| `LC_WEBHOOK_CLEANUP_INTERVAL_MS` | `3600000` | 自动清理节流间隔；`POST /webhooks/maintenance/cleanup` 可手动触发 |
| `LC_WEBHOOK_ALLOW_PRIVATE` | 未设置 | production 默认拒绝本机/内网 URL；内网集成显式设 `1` |
| `LC_WEBHOOK_ALERT_FAILURE_RATE` | `0.2` | 24h 失败率告警阈值 |
| `LC_WEBHOOK_ALERT_QUEUE_DEPTH` | `100` | 待投递队列深度告警阈值 |
| `LC_WEBHOOK_ALERT_PENDING_AGE_MS` | `900000` | 最老待投递年龄告警阈值 |

- 支持事件：`record.created/updated/deleted`、`flow.started`、`flow.task.approved/rejected`、`flow.completed/rejected`；`'*'` 可订阅全部。
- 投递头：`X-LC-Signature: t=<unix>,v1=<hex hmac>`，签名内容为 `<t>.<原始 JSON body>`；轮换宽限期内额外发 `X-LC-Signature-Previous`。另带 `X-LC-Event/Delivery/Subscription/Timestamp`。
- 默认最多 5 次，退避 `5s / 30s / 2min / 10min`；网络错误、超时、408/425/429/5xx 可重试，其余 4xx 直接失败。语义为**至少一次**，接收方必须按事件 id 或投递 id 幂等。
- 管理面 11 条接口仅 `'*'` 管理员可用；订阅/投递均支持 ETag + `If-Match`，409 不覆盖、不自动重试。设计器顶栏「Webhook 集成」提供订阅 CRUD、测试投递、日志过滤、指标告警、密钥轮换与清理。
- **多副本**：MySQL 使用 `FOR UPDATE SKIP LOCKED` 领取，保存结果按 `leaseOwner` CAS；JSON 模式用文件锁。订阅可用 `rateLimitPerMinute` 限流；投递日志按 30 天保留并归档。
- **SSRF**：只允许 `http/https`，发送前 DNS 解析并拒绝私网/保留地址，实际请求前二次解析；不跟随重定向，响应摘要最多 2KB。详细边界见 [`docs/protocol.md`](docs/protocol.md) §10.8。

开发账号（JSON 模式为内存种子；MySQL 模式由 `seed:mysql` 写入 `users / roles / user_roles`，**仅限本地**）：

| 账号 | 密码 | 角色 |
|---|---|---|
| `admin` | `admin123` | `admin`（`'*'` 通配，全部权限） |
| `designer` | `designer123` | `designer`（受 RBAC 约束） |

小程序产物：

```bash
pnpm -F @lc/runtime build:mp-weixin   # → packages/runtime/dist/build/mp-weixin
```

用微信开发者工具导入该目录即可（**真机验证尚未进行**，见「已知限制」）。

> ⚠️ 服务端**没有 watch 模式**：改了 `apps/server/src` 必须重新 `build` 再重启进程，否则跑的仍是旧代码（B-37）。
> ⚠️ 改了 `packages/*/src` 后，运行时需先 `pnpm -F <pkg> build`，再删 `packages/runtime/node_modules/.vite`，最后重启 dev——顺序不能乱（B-31 / B-47）。

## 目录结构

```
packages/
  schema/       协议包（Page / Node / Model / Flow / App 类型 + 校验 + 版本迁移）—— 零运行时依赖
  expression/   受限表达式引擎（自研 tokenizer/parser/evaluator，零 eval，37 内置函数）
  renderer/     渲染引擎：core/ 纯逻辑层 + uni/ 组件层（lc-renderer / lc-node / 标准页）
  materials/    33 个物料组件 + 35 份 META（designer 面板与运行时共用）
  designer/     设计器核心：Pinia store + schema-ops 纯函数 + 画布 + 各配置面板（不碰网络）
  tokens/       设计令牌唯一持有者（tokens.css / tokens.ts / rpx 产物）
  runtime/      uni-app 运行时壳（登录 / 菜单 / 待办 / 表单 / 列表 / 详情 / 门户）
apps/
  server/       NestJS 服务端（登录、页面、模型、记录、流程、RBAC、文件、运维事件、Webhook、OpenAPI）
  designer-web/ 设计器 PC 宿主（Vite + Element Plus + rpx→px 插件 + /api 代理）
docs/           协议规范、设计系统、分阶段方案、ADR、进度台账
scripts/        设计一致性门禁脚本（tokens / 色值 / 对比度 / 图标表）
```

分层约定（详见 [`docs/DECISIONS.md`](docs/DECISIONS.md)）：**业务逻辑进 `packages/*` 的纯函数，副作用留在宿主薄壳**；设计器不直接发请求，一律经 `DesignerApi` 接口注入。

## 门禁

提交前应全绿：

```bash
pnpm design:check    # 设计一致性 6 道：令牌漂移 / 硬编码色值 / 间距令牌 / px→rpx 未替换 / rpx 生成同步 / WCAG 对比度
pnpm -r typecheck    # 7 个包类型检查
pnpm -r build        # 构建（runtime 刻意不进此链，见 ADR-006）
pnpm -r test         # 单元测试（83 文件 / 1206 通过 + 10 跳过；注入 LC_TEST_DATABASE_URL 时 MySQL 仓储也执行）
pnpm coverage        # 覆盖率聚合，阈值 90/85/90/90（实测 94.48/85.60/94.06/94.48）
```

服务端冒烟脚本（前 5 个需先起服务；安全/可观测性脚本会自起临时实例）：

```bash
node apps/server/scripts/smoke-p3b5.mjs   # 埋点/Profiler
node apps/server/scripts/smoke-p3b4.mjs   # 门户/图表
node apps/server/scripts/smoke-p3b3.mjs   # 草稿/主题
node apps/server/scripts/smoke-p3b2.mjs   # 审批流
node apps/server/scripts/smoke-flow.mjs   # 流程引擎
pnpm smoke:security                       # JWT/CORS/限流 10 项
pnpm smoke:observability                  # 探针/请求 ID/访问日志 4 项
pnpm -F @lc/server smoke:mysql            # MySQL 真启动 10 项（需 *_test 库 + 已构建）
```

## 关键文档

| 文档 | 内容 |
|---|---|
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | **当前状态与变更记录**：能力清单、实测指标、剩余工作（按优先级）、环境阻塞、里程碑、缺陷教训 |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | **操作手册**：本地启动、设计器建页/发布、多端构建、MySQL 切换、部署备份、故障排查、安全/可观测性附录 |
| [`docs/protocol.md`](docs/protocol.md) | **协议规范 v1.0** —— 对外契约（Expr / Page / Action / Material / Model / Flow / App + 错误码 + 服务端接口） |
| [`docs/openapi.md`](docs/openapi.md) | OpenAPI 3.1 文档：获取/导入、64 条路由、鉴权/乐观锁/幂等/错误体约定、防漂移维护 |
| [`docs/material-market.md`](docs/material-market.md) | 物料市场：清单格式、ES256 验签/签名、服务端发布审核、租户级安装、origin allowlist 与受控组件白名单 |
| [`docs/design-system.md`](docs/design-system.md) | 跨端 UI 设计系统（令牌三层、断点、图标规范）+ 实施台账与 6 道门禁 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 架构决策记录 ADR-001~011（静态注册/表达式/仓储/MySQL/乐观锁等） |
| [`docs/PLANS.md`](docs/PLANS.md) | Phase 1~3 历史设计依据与关键决策（均已收口） |

## 已知限制

- **小程序真机未验证**：只有 `build:mp-weixin` 产物级检查，环境无微信开发者工具。
- **CI 已实跑通过**：GitHub Actions（[run #12](https://github.com/18186473822/lowcode/actions/runs/40447645078) `e966a09`，此前 run #11 `1e60966` / run #10 `d2aef26` / run #9 `35d6890` / run #8 `b0c0e28` / run #6 `ff07ff9` / run #4 `cf4fae1` / run #3 `f5fb6f0`）`verify`（Node 22：设计门禁 → build → typecheck → H5/小程序/App 编译 → test → coverage → MySQL 8 迁移/仓储集成/市场导入幂等/真启动冒烟 → 服务端/安全/可观测性冒烟）与 `node20-core`（Node 20：build → typecheck → test）两个 job 全部步骤 success。Gitee 托管 CI 不支持 Node 22，只能作镜像。详见 [`docs/PROGRESS.md`](docs/PROGRESS.md) §2。
- **移动端产物有限制**：H5、微信小程序、App 资源均已本地与远端 CI 编译通过；但未做微信真机验证，也未生成 Android APK/iOS IPA，需要本机 HBuilderX/开发者工具与签名证书。
- **OpenAPI 只提供机器可读文档**：`GET /api/v1/openapi.json` 覆盖 64 条路由（含 11 条 Webhook 管理接口与 14 条物料市场接口），但未内置 Swagger UI 页面，也未生成客户端 SDK；物料市场只托管受信元数据，不下载/执行远程 JS。
- **物料市场租户边界**：服务端只校验 `X-LC-Tenant` 格式，不维护成员关系；网关必须覆盖该头并完成认证，否则客户端可伪造租户。设计器当前仍按本地存储渲染安装状态，与服务端安装记录不自动同步。
- **物料市场签名密钥**：生产必须注入 `LC_MATERIAL_MARKET_PRIVATE_KEY`（EC P-256 PKCS#8），未配置时清单/公钥接口返回 503；非生产会生成进程内临时密钥，重启后公钥变化。私钥轮换需同时更新设计器 `VITE_LC_MATERIAL_MARKET_PUBLIC_KEY`。
- **存储双轨**：`LC_STORAGE=json`（默认，单测/CI/无数据库）无事务、整文件读写，用户为内存种子，**并发写只靠单进程 `KeyedLock`**；`LC_STORAGE=mysql` 已覆盖用户/角色、页面/版本、模型/记录、RBAC、流程定义/实例、运维事件、应用配置、文件元数据/内容、Webhook 订阅/投递/归档，以及物料市场物料/版本/安装（ADR-008 / ADR-009 / ADR-010），并用行级 `revision` CAS 支持多实例并发写（ADR-011）。
- **ops 事件并发裁剪**：MySQL 已改为事务内追加 + 按 `seq` 淘汰最旧，不再整表 delete + create；多实例同时裁剪仍可能瞬时略超 500 条，下一次上报会收敛。JSON 模式用单进程写队列，跨进程仍非原子。
- **文件入库但不做对象存储**：MySQL 模式文件存 `files.content`（`LONGBLOB`，单文件 10MB），SQL 备份即可覆盖；大附件、CDN、Range 下载与独立对象存储仍属后续。JSON 模式继续写 `files/` + `files-meta/` 两个本地文件。存量切换必须先执行 `pnpm -F @lc/server import:json-to-mysql`，MySQL 模式不会自动双读旧磁盘文件；文件列表/删除/回收站、哈希去重、病毒扫描与下载鉴权也尚未实现。
- **MySQL 集成测试与冒烟**：普通 `pnpm test` 用 JSON 路径；设置 `LC_TEST_DATABASE_URL` 才跑 MySQL 仓储测试，设置 `LC_SMOKE_DATABASE_URL` 才跑真启动冒烟（脚本拒绝非 `*_test` 库）。远端 CI 的 `verify` job 已自动执行 MySQL 8 迁移、仓储集成测试、`market.json` 导入幂等验证与真启动冒烟。
- **MySQL 迁移必须纳入发布流程**：部署前执行 `prisma migrate deploy`，不要用 `db push` 代替生产迁移。Webhook 生产化迁移为 `20261023090000_webhook_hardening`（订阅/投递字段 + `webhook_delivery_archives`），已在本地 `lowcode` 与 `lowcode_test` 实跑。
- **Webhook 多副本依赖 MySQL 行锁**：JSON 模式只能在单机内用文件锁保证互斥；跨主机多副本必须 `LC_STORAGE=mysql`。投递语义仍是至少一次，接收方必须按事件 id/投递 id 幂等。JSON→MySQL 导入脚本已覆盖订阅、投递、归档，并在真实 MySQL 上重复导入验证幂等；物料市场三表同样实测 3/3/3 且重复导入快照一致。
- **乐观锁覆盖面**：页面保存/发布/回滚、记录更新/删除、流程审批已接 `revision`/CAS；设计器、标准详情页与标准列表页均携带 `If-Match`。业务记录编辑/删除需显式开启 `detail.editable/deletable` 或 `list.editable/deletable`（缺省只读）；列表行内编辑先拉最新单条再保存，批量删除逐条串行且每行一个 `If-Match`，`409 VERSION_CONFLICT` 不自动覆盖，保留草稿/选择并要求重新加载。批量删除不是原子事务，部分失败会保留未删行与选择，刷新后可用最新 revision 重试；行编辑/删除目前无独立权限点，仍由模型 RBAC + 服务端 403 兜底。流程审批物料会在同一动作重试时复用 `Idempotency-Key`；不带键的旧客户端仍可写，但重复审批只能收到 `FLOW_TASK_STALE` / `FLOW_NOT_RUNNING`。
- **流程回写为至少一次**：审批结束后实例先落终态并写 `pendingPatch`，再回写记录；进程中断时由后续读/审批补偿，短暂窗口内可能出现「流程已通过、记录字段尚未更新」，`setField` 重复补偿无副作用。JSON 模式多副本无法保证并发安全，多实例部署必须用 MySQL。
- **图表为纯 SVG 渲染**，**不跟随主题色**（暗色下网格线对比度过高，见 `docs/design-system.md` §10.2 #9）。
