# Phase 4 · 安全加固首批（2026-10-20）

> 对应挂账 #5：**JWT 密钥 fail-closed / CORS 白名单 / 限流**。
> 目标：生产环境不带默认密钥启动、跨域默认拒绝、登录接口可挡口令爆破；本地开发保持可用。
> 状态图例：✅ 已完成并验证 ｜ 🟡 部分完成 ｜ ⬜ 未开始 ｜ ❌ 未做（含理由）

---

## 1. 完成范围

| # | 事项 | 状态 | 实现 |
|---|---|---|---|
| 1 | JWT 密钥 fail-closed | ✅ | 生产未设置/过短/使用仓库内置开发密钥 → 启动失败（exit 1）；非生产未设置才回退开发密钥并打印警告 |
| 2 | CORS 白名单 | ✅ | `LC_CORS_ORIGINS` 逗号分隔、显式源、拒绝 `*`/路径/查询/凭据；生产未设置=不发送 CORS 允许头 |
| 3 | 登录限流 | ✅ | 单进程固定窗口；普通接口默认 600 次/分钟/IP，登录默认 20 次/分钟/IP；超限 `429 RATE_LIMITED` + `Retry-After` |
| 4 | 反向代理支持 | ✅ | `LC_TRUST_PROXY=true` 时启用 Express `trust proxy`，按 `X-Forwarded-For` 识别客户端 IP |
| 5 | 回归测试 | ✅ | `apps/server/test/security.test.ts` 25 例；服务端 176 → 201 例 |

**未做（不在本批）**：

- 多实例/Redis 共享限流（当前单进程内存计数）；
- 审计日志、账号锁定、刷新令牌/轮换；
- 用户体系落库（依赖数据库决策）。

---

## 2. 环境变量

服务端**不自动加载 `.env`**，必须在启动进程前注入。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `LC_JWT_SECRET` | 非生产回退开发密钥 | 生产必填，**≥32 字符**；禁止等于仓库内置开发密钥 |
| `LC_CORS_ORIGINS` | 开发：localhost:5173/5174 | 生产未设置=不发送 CORS 允许头；只接受完整源（如 `https://lc.example.com`） |
| `LC_RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口（1..86400000） |
| `LC_RATE_LIMIT_MAX` | `600` | 普通接口每 IP 每窗口上限 |
| `LC_LOGIN_RATE_LIMIT_MAX` | `20` | 登录接口每 IP 每窗口上限 |
| `LC_TRUST_PROXY` | `false` | 反向代理后设为 `true`；仅信任一层代理 |

生产启动示例（bash）：

```bash
export NODE_ENV=production
export LC_JWT_SECRET="$(openssl rand -base64 48)"
export LC_CORS_ORIGINS="https://lc.example.com"
export LC_TRUST_PROXY=true
node apps/server/dist/main.js
```

PowerShell：

```powershell
$env:NODE_ENV="production"
$env:LC_JWT_SECRET="<至少 32 字符的随机密钥>"
$env:LC_CORS_ORIGINS="https://lc.example.com"
$env:LC_TRUST_PROXY="true"
node apps/server/dist/main.js
```

---

## 3. 行为契约

### 3.1 启动期

| 场景 | 行为 |
|---|---|
| production + 无 `LC_JWT_SECRET` | 抛错，进程 exit 1，不监听端口 |
| production + 密钥 <32 字符 | 抛错，exit 1 |
| 任意环境 + 密钥等于仓库内置开发值 | 抛错，exit 1 |
| development/test + 无密钥 | 使用开发默认值，启动成功并打印警告 |
| `LC_CORS_ORIGINS=*` | 抛错，exit 1 |
| `LC_CORS_ORIGINS` 含路径/查询/非 http(s) | 抛错，exit 1 |
| 限流参数非正整数/越界 | 抛错，exit 1 |

### 3.2 请求期

- 允许的 `Origin`：返回 `Access-Control-Allow-Origin: <该源>`，`Vary: Origin`；
- 未在名单的 `Origin`：**不返回** `Access-Control-Allow-Origin`（浏览器侧拦截）；
- 预检 `OPTIONS`：不计入限流；
- 超限：`429`，响应体 `{ code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' }`；
- 响应头：`X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`；超限时额外 `Retry-After`（秒）。

> 登录限流按「所有登录尝试」计数（成功与失败都算），避免失败才计数被绕过。

---

## 4. 实现位置

| 文件 | 作用 |
|---|---|
| `apps/server/src/common/security.config.ts` | 密钥/CORS/限流参数解析与启动自检 |
| `apps/server/src/common/rate-limit.ts` | 固定窗口计数器 + Nest 中间件 |
| `apps/server/src/common/jwt.service.ts` | 改用 `resolveJwtSecret()`，生产 fail-closed |
| `apps/server/src/app.module.ts` | 注册全局限流中间件 |
| `apps/server/src/main.ts` | 启动自检、CORS 配置、trust proxy、错误退出 |
| `apps/server/test/security.test.ts` | 25 例安全回归 |
| `apps/server/scripts/smoke-security.mjs` | 真实启动冒烟（CORS / 登录 429 / 生产 fail-closed） |
| `apps/server/test/*.test.ts` | 测试密钥统一为 ≥32 字符 |
| `.github/workflows/ci.yml` | 增加 `Security smoke` 步骤；触发覆盖 `master`/`main` |

---

## 5. 验证记录

### 5.1 单元/集成测试

```text
pnpm -F @lc/server test
Test Files  10 passed (10)
Tests       201 passed (201)
```

覆盖点：

- JWT：非生产回退、生产缺密钥/短密钥/内置密钥拒绝、强密钥通过；
- CORS：开发默认源、显式白名单去重归一化、`*`/路径/查询/非 http(s)/非法 URL 拒绝、生产默认关闭；
- 限流：默认值与覆盖、非法参数、窗口到期恢复、不同 key 隔离、1000 次清理、中间件 429/Retry-After、OPTIONS 放行、真实 Nest 应用第 3 次登录 429。

### 5.2 真实启动冒烟（`apps/server/dist/main.js`）

```text
PASS CORS allowed preflight 204 + ACAO
PASS CORS disallowed origin has no ACAO
PASS login 200 + token + ACAO
PASS /auth/me 200
PASS second login 401
PASS third login 429 + RATE_LIMITED + Retry-After
PASS development fallback starts + warning
PASS production missing LC_JWT_SECRET -> exit 1
PASS production short LC_JWT_SECRET -> exit 1
PASS CORS wildcard -> exit 1
ALL SECURITY SMOKE PASSED
```

### 5.3 全量门禁

```text
pnpm -r typecheck    ✅ exit 0（7 包）
pnpm design:check    ✅ exit 0（4 道子检查）
pnpm -r build        ✅ exit 0（5 包；designer-web 1,233.98 kB / gzip 400.09 kB，体积告警非阻断）
pnpm -r test         ✅ 1057 passed / 68 文件（server 201）
pnpm coverage        ✅ 96.2 / 88.17 / 95.94 / 96.2（阈值 90/85/90/90，exit 0）
```

---

## 6. 剩余风险

1. **单实例限流**：计数在进程内，多副本部署时每个副本独立计数；扩容前需换 Redis 共享计数。
2. **无审计**：登录失败、429、CORS 拒绝目前只返回状态，不写安全审计日志。
3. **无账号锁定**：限流按 IP，分布式代理/僵尸网络仍可能绕过；后续可加账号维度退避。
4. **CORS 未设置即关闭**：生产若前后端分域部署，必须显式配 `LC_CORS_ORIGINS`，否则浏览器会拦截。
5. **密钥轮换**：当前只支持单密钥，无 `kid`/双密钥过渡；轮换需重启并让旧令牌自然过期（8h）。
