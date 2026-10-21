# 可观测性与部署基础（Phase 4，2026-10-21）

## 1. 背景与边界

本文最初在数据库暂缓时写；同日 MySQL 第一批（ADR-008）与第二批（ADR-009）已落地。当前为双轨：`LC_STORAGE=json`（默认，页面/模型/RBAC/流程/运维事件/应用配置都在 `LC_DATA_DIR`）与 `LC_STORAGE=mysql`（用户/角色、页面/版本、模型/记录、RBAC、流程定义/实例、运维事件、应用配置落库；上传文件与元数据仍在 `LC_DATA_DIR`）。本批仍不引入 Prometheus/OTel/Sentry，先把「部署后能判断进程活着、能按请求追踪、日志可被采集」做扎实。

**本批已实现**

| 能力 | 落点 |
|---|---|
| 存活/就绪探针 | `GET /api/v1/health`、`GET /api/v1/ready`（`apps/server/src/common/health.controller.ts`） |
| 请求 ID | 所有响应带 `X-Request-Id`；合法客户端值复用，否则 UUID（`common/observability.ts`） |
| 结构化访问日志 | 单行 JSON 写 stdout；默认 production 开启（`common/observability.ts`） |
| 探针免限流 | `/health`、`/ready` 跳过普通限流（`common/rate-limit.ts`） |
| 启动自检 | `LC_ACCESS_LOG` 非法值在监听端口前失败（`main.ts`） |
| 回归 | `test/observability.test.ts`（11 例）+ `scripts/smoke-observability.mjs`（4 项真实启动冒烟） |

**明确未实现**：指标（Prometheus / OpenTelemetry）、分布式追踪、日志轮转/集中式采集、告警、多实例共享限流；上传文件与文件元数据仍落 `LC_DATA_DIR`，不在数据库事务内。

## 2. 探针契约

### `GET /api/v1/health`（liveness）

无需登录，不查磁盘，只证明 Node 进程与 HTTP 栈可响应：

```json
{
  "status": "ok",
  "storage": "mysql",
  "version": "9.9.9",
  "uptimeSeconds": 123,
  "timestamp": "2026-10-21T09:00:00.000Z"
}
```

- `version` 取 `LC_APP_VERSION`，未设置回退 `0.1.0`；建议部署时注入构建号或镜像 tag。
- `uptimeSeconds` 取 `process.uptime()`，用于判断是否频繁重启。

### `GET /api/v1/ready`（readiness）

JSON 模式检查 `LC_DATA_DIR` 能否 `mkdir -p` 且可写；MySQL 模式同时执行 `SELECT 1`：

```json
{ "status": "ok", "storage": "mysql", "checks": { "dataDir": "ok", "database": "ok" }, "timestamp": "..." }
```

任一检查失败返回 `503`：

```json
{
  "code": "NOT_READY",
  "message": "存储未就绪",
  "storage": "mysql",
  "checks": { "dataDir": "ok", "database": "unavailable" },
  "timestamp": "..."
}
```

**探针取舍**：不鉴权、不计入限流，避免负载均衡高频探测消耗真实用户额度；`/ready` 不检查对象存储等尚未引入的下游。MySQL 模式已把数据库连接纳入就绪判据；每请求一次 `SELECT 1` 的成本可接受，若数据库压力敏感可改为连接池探活。

## 3. 请求 ID 与访问日志

### 请求 ID

- 客户端可传 `X-Request-Id`；仅接受 `[A-Za-z0-9._-]{8,128}`，其余（含空格、换行、超长、数组）一律生成 UUID。
- 服务端把最终 ID 写回响应头，并挂到 `req.requestId`，便于后续错误处理/业务日志复用。
- 建议反向代理生成并透传，例如 nginx：

```nginx
proxy_set_header X-Request-Id $request_id;
```

### 访问日志

字段固定，单行 JSON：

```json
{"level":"info","type":"access","at":"2026-10-21T09:00:00.000Z","requestId":"...","method":"GET","path":"/api/v1/pages","status":200,"durationMs":12,"ip":"10.0.0.8","userAgent":"Mozilla/5.0 ..."}
```

- **只记 path，不记 query**（避免 `?token=` 等敏感参数）；不记 body、Authorization、Cookie。
- `durationMs` 为响应 `finish` 时减去请求进入时间；被中断的请求不计。
- 默认 `NODE_ENV=production` 开启；非生产默认关闭，避免本地测试刷屏。`LC_ACCESS_LOG=1` / `0`（兼容 `true/false/yes/no/on/off`）显式覆盖；非法值启动失败。
- 日志写 stdout，交给 systemd/journald、Docker 日志驱动或云日志采集；当前不做文件轮转。

## 4. 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `LC_ACCESS_LOG` | production 开启 | 访问日志开关；非法值启动失败 |
| `LC_APP_VERSION` | `0.1.0` | 健康检查版本号 |
| `LC_STORAGE` | `json` | `json` / `mysql`；非法值启动失败 |
| `DATABASE_URL` | — | MySQL 连接串；`LC_STORAGE=mysql` 时必填 |
| `LC_DATA_DIR` | `<cwd>/data` | 上传文件与未迁移 JSON 数据根目录；`/ready` 检查其可写 |
| `LC_JWT_SECRET` | 非生产回退开发密钥 | 生产必填 ≥32 字符 |
| `LC_CORS_ORIGINS` | 开发 localhost | 生产显式白名单 |
| `LC_TRUST_PROXY` | `false` | 反代后设 `true`（仅一层） |
| `LC_RATE_LIMIT_*` | 见 README | 单进程内存限流 |

> 服务端**不自动加载 `.env`**。systemd 用 `EnvironmentFile=`，容器用 `-e/--env-file`，shell 用 `export`。

## 5. systemd 示例

```ini
[Unit]
Description=LowCode Server (NestJS, LC_STORAGE=json|mysql)
After=network.target

[Service]
Type=simple
User=lowcode
Group=lowcode
WorkingDirectory=/opt/lowcode
EnvironmentFile=/etc/lowcode/server.env
ExecStart=/usr/bin/node /opt/lowcode/apps/server/dist/main.js
Restart=on-failure
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/lowcode

[Install]
WantedBy=multi-user.target
```

`/etc/lowcode/server.env` 示例：

```bash
NODE_ENV=production
PORT=3000
LC_DATA_DIR=/var/lib/lowcode/data
LC_JWT_SECRET=<至少 32 字符的随机值>
LC_CORS_ORIGINS=https://lc.example.com
LC_TRUST_PROXY=true
LC_ACCESS_LOG=1
LC_APP_VERSION=2026.10.21
```

部署前必须在本机完成构建（服务端无 watch，跑的是 `dist/main.js`）：

```bash
pnpm install --frozen-lockfile
pnpm -r build
```

## 6. 反向代理与探针配置

nginx 片段（示意）：

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Request-Id $request_id;
}

location = /healthz { proxy_pass http://127.0.0.1:3000/api/v1/health; }
location = /readyz  { proxy_pass http://127.0.0.1:3000/api/v1/ready; }
```

- 反代后设 `LC_TRUST_PROXY=true`，否则限流按反代 IP 计数、日志 IP 也会失真。
- 就绪探针建议 `initialDelaySeconds: 3`、`periodSeconds: 10`、`timeoutSeconds: 2`、`failureThreshold: 3`。
- **不要把 `X-Forwarded-For` 直接暴露给公网**；只有可信反代链才开 `LC_TRUST_PROXY`。

## 7. JSON 数据备份与恢复（`LC_STORAGE=json`）

JSON 模式下数据都在 `LC_DATA_DIR`（生产示例 `/var/lib/lowcode/data`）：

| 路径 | 内容 |
|---|---|
| `pages/<id>.json` | 页面草稿与历史版本 |
| `models/<id>.json` | 模型定义与记录 |
| `rbac.json` | 角色与页面授权 |
| `flows.json` / `flow-instances.json` | 流程定义与实例 |
| `ops/events.json` | 运维事件（环形 500 条） |
| `apps.json` | 主题配置 |

建议：

1. **停机或文件系统快照备份**：JSON 是「单文件原子写」，但跨文件没有事务；运行中直接拷贝可能得到不同时间点的组合。
2. 备份命令示例（停机窗口）：
   ```bash
   systemctl stop lowcode
   rsync -a --delete /var/lib/lowcode/data/ /backup/lowcode/data-$(date +%F-%H%M)/
   systemctl start lowcode
   ```
3. 恢复：停服 → 用备份覆盖 `LC_DATA_DIR` → `curl -fsS http://127.0.0.1:3000/api/v1/ready` 确认 200 → 再放流量。
4. 定期做**恢复演练**；只备份不演练等于没有备份。
5. 迁数据库前的兼容策略：仓储接口已按 `PageRepository` / `RecordRepository` 等抽象，迁 Prisma 时保留 JSON 作为导入源；本批不改变数据形状。

### MySQL 模式（两批）

`LC_STORAGE=mysql` 时，用户/角色、页面/版本、模型/记录、RBAC、流程定义/实例、运维事件、应用配置均在 MySQL；`LC_DATA_DIR` 只保留上传文件与文件元数据（`files/`、`files-meta/`），文档中的 `flows.json` 等 JSON 路径仅用于 JSON 模式或历史迁移源。两部分要分别备份：

```bash
# 数据库一致性快照（InnoDB）
mysqldump --single-transaction --routines --triggers \
  --default-character-set=utf8mb4 -u lc_app -p lowcode > /backup/lowcode-$(date +%F-%H%M).sql

# 上传文件与元数据（建议停机或快照）
rsync -a /var/lib/lowcode/data/files/ /backup/lowcode/files-$(date +%F-%H%M)/
rsync -a /var/lib/lowcode/data/files-meta/ /backup/lowcode/files-meta-$(date +%F-%H%M)/
```

恢复顺序：停服 → 导入 SQL → 恢复文件目录 → `prisma migrate deploy` 确认 schema 版本 → `curl -fsS .../ready` 应返回 `database: ok`。备份文件含业务数据，按敏感数据管理权限与保留周期。

## 8. 验证记录（2026-10-21）

| 项 | 结果 |
|---|---|
| `pnpm -F @lc/server typecheck` | exit 0 |
| `pnpm -F @lc/server test` | 13 文件（12 通过 + 1 跳过）/ 214 用例通过 + 7 跳过（新增数据库第二批仓储与 ops 队列用例） |
| `pnpm -F @lc/server build` | exit 0 |
| `node apps/server/scripts/smoke-observability.mjs` | 4/4 PASS |
| `pnpm smoke:security` | 10/10 PASS（沿用上批） |
| MySQL 仓储集成 / 真启动冒烟 | 7/7 PASS / 9/9 PASS（`lowcode_test`；含 ops 并发追加） |
| 全量门禁 | 见 `docs/PROGRESS.md` 最新行 |

冒烟覆盖：`/health` 200 + 版本 + 请求 ID 回写；非法 ID 替换 UUID；`/ready` 200 + `dataDir: ok`；404 请求访问日志为单行 JSON、path 不含 query token。

## 9. 剩余风险

- **单实例限流**：限流仍是进程内计数；多副本会各算各的额度。扩副本前需换 Redis 等共享限流。MySQL 模式已支持多进程读写，但页面/记录没有乐观锁，并发编辑仍可能后写覆盖先写。
- **运维事件追加写入**：`ops_events` 已由整表 delete + create 改为事务内追加 + 按 `seq` 裁剪；多实例同时裁剪仍可能瞬时略超 500 条，下一次上报收敛。JSON 模式用单进程写队列，跨进程非原子。
- **上传文件仍在本地盘**：`files/` 与 `files-meta/` 不在 MySQL 事务内，跨机部署需共享存储或对象存储；数据库备份与文件备份要分别做恢复演练。
- **无指标/追踪/告警**：目前只能靠探针和访问日志；错误率、P95、队列积压没有时序数据。下一批可接 OpenTelemetry + Prometheus，或在现有 ops 事件上做聚合告警。
- **日志无轮转**：交给外部采集；若直接重定向到文件，需要 logrotate。
- **健康检查暴露版本**：低风险；如不希望暴露，设 `LC_APP_VERSION` 为通用值或后续加开关。
- **`/ready` 的目录检查仍只验证权限**：磁盘满、inode 耗尽等要到实际写入才暴露；MySQL 模式已额外检查 `SELECT 1`，但连接池耗尽等仍可能在业务请求时暴露。
