# 远程物料 / 物料市场（受信元数据 + 服务端托管）

> 状态：**客户端闭环 + 服务端托管均已实现**（2026-10-27）。
> - 客户端：清单验签、origin allowlist、Web Storage 缓存、安装状态、设计器市场面板、受控组件插入；
> - 服务端：清单托管与 ES256 签名、发布审核状态机、不可变版本快照、租户级安装状态、MySQL / JSON 双存储。
>
> **仍然不做**：下载、`eval`、`new Function` 或动态 `import` 远程 JS。清单只描述受信元数据与宿主内置组件预设。

## 1. 安全边界

- 市场清单是一个 JSON 信封 `{ alg, signature, manifest }`，使用 **ECDSA P-256 / SHA-256** 公钥验签；签名原文是 `canonicalJson(manifest)`。
- 客户端只接受命中 `VITE_LC_MATERIAL_MARKET_ALLOWLIST` origin 的清单 URL；生产默认只允许 HTTPS，`localhost`/`127.0.0.1` 仅用于开发。
- 拒绝 URL 内嵌账号密码、跨 origin 重定向；请求超时 10s、清单最大 1MB。
- 清单条目只允许两种：
  - `kind: "meta"`：纯元数据，不会进入运行时组件树；
  - `kind: "component"`：`component` 必须是宿主 `TRUSTED_COMPONENT_IDS` 中的内置 `componentName`（如 `Button`、`Input`），插入时复用宿主物料，只应用受信的 `meta.defaultProps`。
- 服务端发布校验复用 `@lc/schema` 的 `BUILTIN_COMPONENT_IDS`（33 项，单一事实源），未知组件直接 400，避免「服务端放行、客户端整份清单拒绝」。
- **不会**下载、`eval`、`new Function` 或动态 `import` 任何远程 JS。
- 设计器缓存与本地安装状态存于浏览器 `localStorage`；服务端安装记录是独立的租户级权威状态（见 §7），两者当前不自动同步。

## 2. 设计器配置

在 `apps/designer-web/.env.local`（或部署环境）设置：

```bash
# 直接指向服务端公开清单（同源部署时可用相对路径）
VITE_LC_MATERIAL_MARKET_URL=http://localhost:3000/api/v1/materials/manifest
VITE_LC_MATERIAL_MARKET_ALLOWLIST=http://localhost:3000
VITE_LC_MATERIAL_MARKET_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----"
```

公钥不是秘密；可用 `\n` 表示换行。未配置时「物料市场」面板只显示配置指引，不会发起网络请求。

本地联调且服务端未配置私钥时，服务端会生成**进程内临时密钥**并打印警告；此时执行
`curl http://localhost:3000/api/v1/materials/manifest/key` 取 `publicKey` 填入设计器。服务重启后公钥变化，需要重新获取。

## 3. 清单格式

```json
{
  "alg": "ES256",
  "signature": "<raw r||s 的 base64>",
  "manifest": {
    "schemaVersion": 1,
    "name": "低代码物料市场",
    "generatedAt": "2026-10-27T08:00:00.000Z",
    "materials": [
      {
        "id": "brand-button-2026",
        "name": "品牌按钮",
        "version": "1.0.0",
        "description": "品牌主色按钮预设",
        "category": "basic",
        "kind": "component",
        "component": "Button",
        "meta": {
          "name": "BrandButton",
          "title": "品牌按钮",
          "version": "1.0.0",
          "category": "basic",
          "defaultProps": { "text": "立即提交", "type": "primary" },
          "settings": []
        }
      }
    ]
  }
}
```

约束：

- `id`：小写字母开头，3~64 位，仅 `a-z0-9-`，清单内唯一；
- `version`：semver；安装记录与清单版本不一致时客户端 `resolveMeta()` 返回 `null`，避免静默降级；
- `meta.name`、`meta.title`、`meta.version`、`meta.category`、`meta.defaultProps`、`meta.settings` 必填；`meta` 序列化后不得超过 64 KB；
- `kind: "component"` 的 `component` 不在白名单 → **整份清单拒绝**，不做部分加载；
- 清单只包含 `published` 物料，按 `id` 升序；`generatedAt` 取已发布物料的最大 `updatedAt`（空市场为 `1970-01-01T00:00:00.000Z`），因此内容不变时签名与 ETag 保持稳定。

## 4. 验签与签名

客户端验签使用 WebCrypto：

```ts
const key = await crypto.subtle.importKey(
  'spki',
  spkiBytes,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify'],
)
const ok = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  key,
  signatureBytes,
  new TextEncoder().encode(canonicalJson(manifest)),
)
```

服务端签名使用 Node `crypto.sign('sha256', data, { key, dsaEncoding: 'ieee-p1363' })`：

- `canonicalJson` 递归排序对象键、忽略 `undefined`，数组保持顺序；两端必须使用同一实现（`@lc/materials` 导出，服务端 `market.signing.ts` 复刻同一算法）；
- WebCrypto 与 Node 的 P1363 输出都是 **raw `r||s`**，不是 OpenSSL 默认 DER；服务端显式指定 `dsaEncoding`，否则客户端必然验签失败；
- 私钥只通过 `LC_MATERIAL_MARKET_PRIVATE_KEY`（PKCS#8 PEM，支持 `\n` 转义）注入，绝不进前端包。

密钥配置：

| 环境变量 | 说明 |
|---|---|
| `LC_MATERIAL_MARKET_PRIVATE_KEY` | PKCS#8 PEM 私钥，必须是 EC P-256；生产未配置时清单接口 503 |
| `LC_MATERIAL_MARKET_KID` | 可选密钥标识；缺省等于公钥指纹 |
| `LC_MATERIAL_MARKET_NAME` | 清单 `manifest.name`，缺省「低代码物料市场」 |

解析规则：

- 显式配置但格式非法、非 EC、非 P-256 → **启动即失败**，避免带病发布无法验签的清单；
- 生产未配置 → 市场清单/公钥接口返回 `503 MARKET_SIGNING_UNCONFIGURED`，不在生产自动生成临时密钥；
- 非生产未配置 → 生成进程内临时密钥并打印警告，便于本地联调。

## 5. 服务端 API

清单与公钥公开，其余接口需要 `Authorization: Bearer <JWT>`；管理员判定复用 RBAC 的 `*` 权限点。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/materials/manifest` | 公开 | ES256 签名清单；`If-None-Match` 命中返回 304 |
| GET | `/materials/manifest/key` | 公开 | 公钥、`sha256:` 指纹、`kid` |
| GET | `/materials` | 登录 | 目录；普通用户只见已发布，管理员可按状态筛选 |
| POST | `/materials` | 管理员 | 创建草稿，返回 ETag |
| GET | `/materials/:id` | 登录 | 详情；草稿对普通用户 404 |
| PUT | `/materials/:id` | 管理员 | 编辑（仅 draft/rejected/unpublished），`If-Match` |
| POST | `/materials/:id/submit` | 管理员 | 提交审核，`If-Match` |
| POST | `/materials/:id/review` | 管理员 | `approve` / `reject`，`If-Match` |
| POST | `/materials/:id/publish` | 管理员 | 发布并固化版本快照，`If-Match` |
| POST | `/materials/:id/unpublish` | 管理员 | 下架，`If-Match` |
| GET | `/materials/:id/versions` | 管理员 | 发布历史 |
| GET | `/materials/installs` | 登录 | 当前租户安装列表（`X-LC-Tenant`） |
| PUT | `/materials/installs/:materialId` | 登录 | 安装/升级到当前发布版本 |
| DELETE | `/materials/installs/:materialId` | 登录 | 卸载，`If-Match` |

路由顺序注意：`manifest`、`installs` 为静态段，必须声明在 `:id` 之前。

### 5.1 状态机

```text
create → draft ──submit──→ pending ──review──→ approved ──publish──→ published
             ↑                 │                    │                    │
             └───── rejected ←──┘                    └──（只读）           │
             ↑                                                             │
             └──────────────────── unpublish ←─────────────────────────────┘
```

- `draft / rejected / unpublished` 可编辑、可重新提交；编辑会清空上一轮审核结论并回到 `draft`；
- `pending / approved / published` 不可编辑；`approved` 只能发布；
- 发布把条目固化为不可变 `MarketMaterialVersion`（`materialId + version` 唯一）；同一版本重复发布返回 `409 MARKET_VERSION_EXISTS`，必须提升 `version` 后重新审核；
- 状态对外字段：`draft`、`pending`、`approved`、`rejected`、`published`、`unpublished`。

### 5.2 乐观锁与错误码

- 所有写接口返回 `ETag: "material:<id>:<revision>"`；安装接口返回 `"material-install:<tenantId>/<materialId>:<revision>"`；
- `If-Match` 可选：缺省按无条件写处理，但服务端仍用请求开始读到的 `revision` 做 CAS；一旦携带且不匹配 → `409 VERSION_CONFLICT`，**不自动覆盖、不自动重试**；
- 格式非法（非本资源 ETag、revision 非整数）→ `400 INVALID_IF_MATCH`。

| 状态 | code | 场景 |
|---|---|---|
| 400 | `MARKET_MATERIAL_INVALID` | 物料字段校验失败，`errors[]` 定位字段 |
| 400 | `INVALID_QUERY` | `status` / `category` / `kind` / `q` 非法 |
| 400 | `TENANT_INVALID` | `X-LC-Tenant` 格式非法 |
| 403 | `ADMIN_REQUIRED` | 非管理员写操作，或普通用户按状态筛选 |
| 404 | `MARKET_MATERIAL_NOT_FOUND` | 物料不存在，或未发布物料对普通用户不可见 |
| 404 | `MARKET_INSTALL_NOT_FOUND` | 卸载时该租户未安装 |
| 409 | `MARKET_MATERIAL_EXISTS` | 创建时 id 重复 |
| 409 | `MARKET_STATE_CONFLICT` | 当前状态不允许该动作，响应带 `currentStatus` |
| 409 | `MARKET_VERSION_EXISTS` | 同 `materialId + version` 已发布过 |
| 409 | `MARKET_NOT_PUBLISHED` | 安装非 `published` 物料，响应带 `currentStatus` |
| 409 | `MARKET_VERSION_MISMATCH` | 安装版本不等于当前发布版本，响应带 `publishedVersion` |
| 409 | `VERSION_CONFLICT` | `If-Match` 或 CAS 冲突，响应带 `expectedRevision` / `currentRevision` |
| 503 | `MARKET_SIGNING_UNCONFIGURED` | 生产未配置签名私钥 |

## 6. 租户

- 租户标识来自请求头 `X-LC-Tenant`，格式 `^[a-z0-9][a-z0-9-]{0,63}$`；缺省 `default`；
- 服务端**只校验格式**，不维护租户成员关系；成员/身份由网关或身份提供方保证，网关必须覆盖而不是透传客户端伪造的该头；
- 安装记录主键 `(tenantId, materialId)`，不同租户完全隔离；
- 安装只允许当前已发布版本：重复安装同一版本幂等；版本不一致返回 `MARKET_VERSION_MISMATCH`（不允许静默升/降级）。

## 7. 存储

- `LC_STORAGE=json`（默认）：单文件 `<DATA_DIR>/market.json`，形如 `{ materials, versions, installs }`，临时文件 + rename 原子写，单进程 `KeyedLock` 串行化；
- `LC_STORAGE=mysql`：`market_materials`、`market_material_versions`、`market_installs` 三表；发布在事务内完成「revision CAS + 版本快照插入」；
- 版本快照不建外键，删除物料仍保留历史用于审计；
- 导入实测（2026-10-27）：`market.json` 的 3 物料 / 3 版本 / 3 安装导入 `lowcode_test`，重复执行后三表行内容快照完全一致，`MysqlMarketRepository` 回读字段一致；本机与 CI 均通过；
- JSON 模式下多实例共享同一数据目录不受支持（与其它文件仓储同一口径）；MySQL 模式支持多实例。

## 8. 设计器操作

1. 顶栏「物料市场」；未配置时只显示环境变量指引。
2. 「刷新清单」→ 拉取、验签、schema 校验、写入缓存；失败时显示具体原因，不覆盖旧缓存。
3. 「安装」→ 写入本地安装状态；「卸载」→ 只移除安装状态，已插入画布的节点不受影响。
4. 受控组件安装后可「插入画布」：复用宿主 `Button`/`Input` 等内置物料，应用 `meta.defaultProps`，随后回到画布并选中新节点。
5. 版本不一致、缓存损坏、签名失效都不会被当作可用物料。

服务端安装接口目前供管理面/多端共享状态使用；设计器仍以本地安装状态渲染，二者同步不在本轮范围。

## 9. 验证

```bash
pnpm -F @lc/server test -- market.test.ts market-unit.test.ts
pnpm -F @lc/server typecheck
pnpm -F @lc/designer test -- remote-material.test.ts
pnpm -F @lc/designer typecheck
pnpm design:check
```

MySQL 导入验证（需要 `*_test` 库；CI 已自动执行）：

```bash
LC_SMOKE_DATABASE_URL='mysql://.../lowcode_test' pnpm -F @lc/server verify:market-import
```

覆盖：

- 服务端：签名清单可验签、ETag/304、公钥端点、审核状态机、驳回理由、版本唯一性、If-Match 409、租户隔离、安装幂等/版本一致性/卸载冲突、字段与权限校验；MySQL 三表导入与重复导入幂等由 `verify-market-import.mjs` 覆盖；
- 客户端：验签成功/失败、未授权 origin、非 HTTPS、账号密码、未知组件白名单拒绝、重复 id、非法 semver、缓存损坏清理、安装版本不一致。
