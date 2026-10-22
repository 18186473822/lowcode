# OpenAPI 接口文档（Phase 4 · 开放集成第一 ~ 二批）

服务端在运行时直接输出 **OpenAPI 3.1.0** 文档，供外部系统、Swagger UI、Apifox、Postman、OpenAPI Generator 等工具导入。文档由代码中的显式声明生成，并通过路由反射测试与实际 Nest controller 逐条比对，避免“文档写了、接口没有”或“接口加了、文档没写”。

## 1. 获取方式

```bash
# 服务端默认 http://localhost:3000
curl -s http://localhost:3000/api/v1/openapi.json > openapi.json
```

- 路径：`GET /api/v1/openapi.json`
- 鉴权：**公开只读**，不需要 JWT；仍计入普通接口限流。
- 缓存：响应带 `Cache-Control: public, max-age=300`。
- 响应头：`X-Request-Id`（全局可观测性约定）。
- `servers[0].url = /api/v1`，文档内的路径不含该前缀；网关改写前缀时可直接复用同一份文档。

## 2. 导入工具

| 工具 | 方式 |
|---|---|
| Swagger UI | 将 `openapi.json` 配置为 `url` / `SWAGGER_JSON`，或在线粘贴 JSON |
| Apifox / Postman | 导入 OpenAPI 3.1 JSON，自动生成接口集合 |
| OpenAPI Generator | 以 `openapi.json` 为输入生成 TypeScript / Java / Python 客户端 |
| 代码内校验 | 调用 `buildOpenApi()`（`apps/server/src/open/openapi.ts`）取得同一份对象 |

> 本批只提供机器可读文档，不内置 Swagger UI 页面；生产环境建议用独立网关或文档站托管，避免把 UI 依赖塞进 API 服务。

## 3. 覆盖范围（48 条路由）

| 分组 | 方法 | 路径 | 鉴权 |
|---|---|---|---|
| System | GET | `/health` | 公开 |
| System | GET | `/ready` | 公开 |
| System | GET | `/openapi.json` | 公开 |
| Auth | POST | `/auth/login` | 公开 |
| Auth | GET | `/auth/me` | Bearer |
| Apps | GET | `/apps/bootstrap` | Bearer |
| Apps | GET | `/apps/config` | Bearer |
| Apps | PUT | `/apps/config` | Bearer + `*` |
| Pages | GET | `/pages` | Bearer |
| Pages | POST | `/pages/validate` | Bearer |
| Pages | GET | `/pages/{id}/schema` | Bearer + 页面可见性 |
| Pages | PUT | `/pages/{id}/schema` | Bearer |
| Pages | POST | `/pages/{id}/publish` | Bearer |
| Pages | POST | `/pages/{id}/rollback` | Bearer |
| Pages | GET | `/pages/{id}/versions` | Bearer |
| Pages | DELETE | `/pages/{id}` | Bearer + `*` |
| Models | GET | `/models` | Bearer |
| Models | GET | `/models/{id}` | Bearer |
| Models | PUT | `/models/{id}` | Bearer |
| Records | POST | `/models/{modelId}/records` | Bearer + 模型 create |
| Records | GET | `/models/{modelId}/records` | Bearer + 模型 read + dataScope |
| Records | PUT | `/models/{modelId}/records/{rid}` | Bearer + 模型 update |
| Records | DELETE | `/models/{modelId}/records/{rid}` | Bearer + 模型 delete |
| Files | POST | `/files/upload` | Bearer |
| Files | GET | `/files/{fileId}` | 公开 |
| Flows | GET | `/flows` | Bearer |
| Flows | GET | `/flows/tasks/todo` | Bearer |
| Flows | GET | `/flows/instances` | Bearer |
| Flows | GET | `/flows/instances/{instanceId}` | Bearer |
| Flows | GET | `/flows/{flowId}` | Bearer |
| Flows | PUT | `/flows/{flowId}` | Bearer |
| Flows | DELETE | `/flows/{flowId}` | Bearer |
| Flows | POST | `/flows/instances/{instanceId}/tasks/{taskId}` | Bearer + assignee |
| RBAC | GET | `/rbac/roles` | Bearer |
| RBAC | PUT | `/rbac/roles/{key}` | Bearer |
| RBAC | PUT | `/rbac/pages/{pageId}` | Bearer |
| Ops | POST | `/ops/events` | Bearer |
| Ops | GET | `/ops/events` | Bearer + `*` |
| Ops | GET | `/ops/summary` | Bearer + `*` |
| Webhooks | GET | `/webhooks` | Bearer + `*` |
| Webhooks | POST | `/webhooks` | Bearer + `*` |
| Webhooks | GET | `/webhooks/{id}` | Bearer + `*` |
| Webhooks | PUT | `/webhooks/{id}` | Bearer + `*` |
| Webhooks | DELETE | `/webhooks/{id}` | Bearer + `*` |
| Webhooks | POST | `/webhooks/{id}/rotate-secret` | Bearer + `*` |
| Webhooks | POST | `/webhooks/{id}/test` | Bearer + `*` |
| Webhooks | GET | `/webhooks/{id}/deliveries` | Bearer + `*` |
| Webhooks | POST | `/webhooks/deliveries/{deliveryId}/retry` | Bearer + `*` |

> “Bearer + `*`”表示接口内部还校验用户权限点包含 `'*'` 通配（超级角色）；“模型 create/read/update/delete”表示按 `ModelSchema.permissions[action]` 校验；“页面可见性”走 `RbacService.canSeePage`。Webhook 管理接口对非管理员返回 `403 ADMIN_REQUIRED`，不返回订阅 URL、密钥或投递体。

## 4. 文档约定

### 鉴权

- 登录：`POST /auth/login { username, password }`，返回 `accessToken`（HS256 JWT，8 小时）。
- 受保护接口统一：`Authorization: Bearer <accessToken>`。
- 公共接口在文档中显式写 `security: []`；其余接口继承顶层 `bearerAuth`。

### 乐观锁（ETag / If-Match）

| 资源 | 响应 ETag | 接受 `If-Match` |
|---|---|---|
| 页面 | `"page:<pageId>:<revision>"` | `PUT /pages/{id}/schema`、`POST /pages/{id}/publish`、`POST /pages/{id}/rollback` |
| 记录 | `"record:<modelId>/<rid>:<revision>"` | `PUT/DELETE /models/{modelId}/records/{rid}`（创建响应也给 ETag） |
| 流程实例 | `"flow:<instanceId>:<revision>"` | 审批不使用 `If-Match`，走 `Idempotency-Key`；GET/审批响应给 ETag |
| Webhook 订阅 | `"webhook:<id>:<revision>"` | `PUT/DELETE /webhooks/{id}`、`POST /webhooks/{id}/rotate-secret` |
| Webhook 投递 | `"webhook-delivery:<id>:<revision>"` | `POST /webhooks/deliveries/{deliveryId}/retry`；测试投递响应也给 ETag |

版本不一致返回：

```json
{
  "code": "VERSION_CONFLICT",
  "message": "版本冲突",
  "expectedRevision": 3,
  "currentRevision": 4
}
```

服务端**不自动覆盖、不自动重试**；调用方应重新 GET 最新资源后由用户决定。

### 审批幂等

`POST /flows/instances/{instanceId}/tasks/{taskId}` 支持 `Idempotency-Key`（去空格后 1~128 字符）。同一实例、同一任务、同一动作/意见/审批人的重放返回 `200` 当前实例；同键改内容返回 `409 IDEMPOTENCY_KEY_REUSED`。

### 错误体

```json
{
  "code": "RECORD_INVALID",
  "message": "记录校验未通过",
  "errors": [
    { "code": "E_REQUIRED", "severity": "error", "path": "name", "message": "请填写姓名" }
  ],
  "warnings": []
}
```

错误码全集与产生点见 [`protocol.md`](protocol.md) §10.3。

### 限流

- 普通接口默认 600 次/分钟/IP；登录默认 20 次/分钟/IP。
- 超限：`429 { code: 'RATE_LIMITED' }`，响应头含 `Retry-After`、`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`。
- 当前为单进程内存限流；多副本部署需接 Redis。

## 5. 维护与防漂移

- 文档构建器：`apps/server/src/open/openapi.ts`。
- 端点：`apps/server/src/open/open.controller.ts`，模块：`open.module.ts`。
- 契约测试：`apps/server/test/openapi.test.ts`，会：
  1. 反射全部 controller 的 `PATH_METADATA` / `METHOD_METADATA`，与文档路径/方法精确比对；
  2. 校验 `operationId` 唯一、路径参数声明完整、`$ref` 可解析、公共接口 `security: []`；
  3. 真实启动 Nest，请求 `GET /api/v1/openapi.json` 验证无需令牌可读。
- **新增/删除路由时必须同步修改 `openapi.ts`**，否则测试直接失败（当前基线 48 条）。

## 6. Webhook 管理接口

第二批新增 9 条 `/webhooks*` 管理接口，完整签名算法、事件信封、重试退避与投递状态见 [`protocol.md`](protocol.md) §10.8。OpenAPI 文档中仅暴露管理面：

- 订阅 CRUD + 密钥轮换 + 测试投递 + 投递日志分页 + 手动重投；
- 订阅/投递写接口的 ETag 与 `If-Match`、`409 VERSION_CONFLICT`/`409 DELIVERY_PENDING`；
- 创建/轮换响应包含完整 `secret`，其余响应只含 `secretPreview`；
- 事件推送本身是服务端出站 HTTP，不是 OpenAPI 描述的本服务入站路由。

## 7. 本批未包含

- 远程物料加载 / 物料市场。
- Swagger UI 内置页面。
- 第三方数据源连接器。
