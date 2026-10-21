# lowcode —— 移动端低代码平台

uni-app + Vue 3 全端低代码平台。业务人员在 Web 设计器拖拽建页 → 发布 Schema → 移动端（H5 / 微信小程序）按 Schema 动态渲染，含模型建模、列表/详情标准页、RBAC、版本回滚、审批流程、门户看板。

> **状态**：Phase 0 / 1 / 2 / 3 全部收口（出口判据均达成）；Phase 4 已启动，安全加固、可观测性与 **MySQL 数据库第一批**（用户/角色、页面/版本、模型/记录、RBAC）完成，其余生产化与开放能力未启动。
> 进度明细见 [`docs/PROGRESS.md`](docs/PROGRESS.md)（台账，兼变更日志）；本轮修复记录见 [`docs/remediation-plan-2026-10-20.md`](docs/remediation-plan-2026-10-20.md)；仓库初始化与 CI 核对见 [`docs/p1-git-ci-2026-10-20.md`](docs/p1-git-ci-2026-10-20.md)。

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
> **当前阶段决策（2026-10-21）**：核心业务数据已支持 **MySQL 8 + Prisma**；`LC_STORAGE=json`（默认）保留给单测/无数据库 CI，`mysql` 用于本地与生产。flows / ops / apps.json 仍为 JSON，留下一批迁移（ADR-008）。

### 数据库（Phase 4 第一批：MySQL 8 + Prisma）

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

# 可选：把现有 JSON 页面/模型/记录/RBAC 导入（幂等 upsert）
pnpm -F @lc/server import:json-to-mysql
```

| 变量 | 默认 | 说明 |
|---|---|---|
| `LC_STORAGE` | `json` | `json` / `mysql`；非法值启动失败 |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/db`，`LC_STORAGE=mysql` 时必填 |
| `LC_DATA_DIR` | `<cwd>/data` | 上传文件与尚未迁移的 flows/ops/apps 仍使用该目录 |

> 服务端本身**不自动加载 `.env`**：`start:mysql` 用 Node `--env-file=.env`，生产请由 systemd/容器注入环境变量。Prisma CLI 会自动读取 `apps/server/.env`。
> MySQL 第一批表：`users / roles / user_roles / pages / page_versions / models / data_records / rbac_page_grants`。flows / ops / apps.json 下一批迁移；跨存储无分布式事务。

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

超限返回 `429 { code: 'RATE_LIMITED' }` 与 `Retry-After`。当前为单进程内存限流，多实例部署需换 Redis；详见 [`docs/security-hardening-2026-10-20.md`](docs/security-hardening-2026-10-20.md)。

### 可观测性与部署探针（Phase 4）

| 变量 | 默认 | 说明 |
|---|---|---|
| `LC_ACCESS_LOG` | production 开启 | 结构化访问日志开关；`1/0/true/false` 覆盖，非法值启动失败 |
| `LC_APP_VERSION` | `0.1.0` | `GET /api/v1/health` 返回的版本号，部署时注入构建版本 |

- `GET /api/v1/health`：存活探针，无需登录，返回 `{ status, storage, version, uptimeSeconds, timestamp }`。
- `GET /api/v1/ready`：就绪探针；JSON 模式检查 `LC_DATA_DIR`，MySQL 模式同时检查数据目录与 `SELECT 1`；不可用返回 `503 { code: 'NOT_READY', checks }`。
- 两个探针**不计入限流**；所有响应带 `X-Request-Id`（合法客户端值原样复用，否则生成 UUID）。
- 访问日志为**单行 JSON**，字段含 `requestId/method/path/status/durationMs/ip`，不记录 query、body、Authorization。
- 部署、systemd、备份与日志采集见 [`docs/observability-deployment-2026-10-21.md`](docs/observability-deployment-2026-10-21.md)。

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
  server/       NestJS 服务端（登录、页面、模型、记录、流程、RBAC、文件、运维事件）
  designer-web/ 设计器 PC 宿主（Vite + Element Plus + rpx→px 插件 + /api 代理）
docs/           协议规范、设计系统、分阶段方案、ADR、进度台账
scripts/        设计一致性门禁脚本（tokens / 色值 / 对比度 / 图标表）
```

分层约定（详见 `docs/adr/`）：**业务逻辑进 `packages/*` 的纯函数，副作用留在宿主薄壳**；设计器不直接发请求，一律经 `DesignerApi` 接口注入。

## 门禁

提交前应全绿：

```bash
pnpm design:check    # 设计一致性 4 道：令牌漂移 / 硬编码色值 / rpx 同步 / WCAG 对比度
pnpm -r typecheck    # 7 个包类型检查
pnpm -r build        # 构建（runtime 刻意不进此链，见 ADR-006）
pnpm -r test         # 单元测试（70 文件 / 1068 通过 + 4 条件跳过）
pnpm coverage        # 覆盖率聚合，阈值 90/85/90/90（实测 93.82/87.91/92.84/93.82）
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
pnpm -F @lc/server smoke:mysql            # MySQL 真启动 6 项（需 *_test 库 + 已构建）
```

## 关键文档

| 文档 | 内容 |
|---|---|
| [`docs/protocol.md`](docs/protocol.md) | **协议规范 v1.0** —— 对外契约（Expr / Page / Action / Material / Model / Flow / App + 错误码 + 服务端接口） |
| [`docs/design-system.md`](docs/design-system.md) | 跨端 UI 设计系统（令牌三层、断点、图标规范） |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | 实施进度台账：已实现 / 未实现 / 偏差 / 缺陷留档 |
| [`docs/observability-deployment-2026-10-21.md`](docs/observability-deployment-2026-10-21.md) | 探针 / 请求 ID / 访问日志 / systemd / JSON 数据备份 |
| [`docs/adr/`](docs/adr/) | 8 篇架构决策记录（含 ADR-008 MySQL/Prisma 第一批） |
| [`docs/phase2-plan.md`](docs/phase2-plan.md) / [`docs/phase3-plan.md`](docs/phase3-plan.md) | 分阶段拆批详设 |

## 已知限制

- **小程序真机未验证**：只有 `build:mp-weixin` 产物级检查，环境无微信开发者工具。
- **CI 未在真实环境跑过**：代码已推送 Gitee `origin/master`，但 Gitee 托管 CI 无法运行 Node 22；GitHub Actions workflow 已存在，GitHub 镜像/远端 Actions 尚未创建与实跑。
- **存储双轨**：`LC_STORAGE=json`（默认，单测/CI/无数据库）无事务、整文件读写，用户为内存种子；`LC_STORAGE=mysql` 已覆盖用户/角色、页面/版本、模型/记录、RBAC，但 flows / ops / apps.json 仍为 JSON，跨存储无分布式事务（ADR-008）。
- **MySQL 集成测试与冒烟需本机实例**：普通 `pnpm test` 用 JSON 路径；设置 `LC_TEST_DATABASE_URL` 才跑 MySQL 仓储测试，设置 `LC_SMOKE_DATABASE_URL` 才跑真启动冒烟（脚本拒绝非 `*_test` 库）。
- **MySQL 迁移必须纳入发布流程**：部署前执行 `prisma migrate deploy`，不要用 `db push` 代替生产迁移。
- **并发编辑无乐观锁**：同一页面同时开多个编辑方会互相覆盖（B-32），联调时请只留一个编辑方。
- 图表为纯 SVG 渲染，**不跟随主题色**（暗色下网格线对比度过高，见 `docs/design-system.md` §10.2 #9）。
