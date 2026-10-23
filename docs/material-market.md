# 远程物料 / 物料市场（受信元数据闭环）

> 状态：**已实现客户端闭环**（清单验签、origin allowlist、Web Storage 缓存、安装状态、设计器市场面板、受控组件插入）。
> **未实现**：服务端市场托管、发布审核、租户级安装状态、远程 JS 组件下载/执行。后者不应在浏览器里做；如确需远程组件，应走「服务端构建 + 固定版本 + SRI/CSP」的受控发布流程。

## 1. 安全边界

- 市场清单是一个 JSON 信封 `{ alg, signature, manifest }`，使用 **ECDSA P-256 / SHA-256** 公钥验签；签名原文是 `canonicalJson(manifest)`。
- 清单 URL 必须命中 `VITE_LC_MATERIAL_MARKET_ALLOWLIST` 的 origin；生产默认只允许 HTTPS，`localhost`/`127.0.0.1` 仅用于开发。
- 拒绝 URL 内嵌账号密码、跨 origin 重定向；请求超时 10s、清单最大 1MB。
- 清单条目只允许两种：
  - `kind: "meta"`：纯元数据，不会进入运行时组件树；
  - `kind: "component"`：`component` 必须是宿主 `TRUSTED_COMPONENT_IDS` 中的内置 `componentName`（如 `Button`、`Input`），插入时复用宿主物料，只应用受信的 `meta.defaultProps`。
- **不会**下载、`eval`、`new Function` 或动态 `import` 任何远程 JS。
- 缓存与安装状态存于浏览器 `localStorage`，按浏览器/工作区隔离；服务端不保存。

## 2. 设计器配置

在 `apps/designer-web/.env.local`（或部署环境）设置：

```bash
VITE_LC_MATERIAL_MARKET_URL=https://materials.example.com/manifest.json
VITE_LC_MATERIAL_MARKET_ALLOWLIST=https://materials.example.com
VITE_LC_MATERIAL_MARKET_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----"
```

公钥不是秘密；可用 `\n` 表示换行。未配置时「物料市场」面板只显示配置指引，不会发起网络请求。

## 3. 清单格式

```json
{
  "alg": "ES256",
  "signature": "<WebCrypto ECDSA 原始签名 r||s 的 base64>",
  "manifest": {
    "schemaVersion": 1,
    "name": "官方物料市场",
    "generatedAt": "2026-10-23T00:00:00.000Z",
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
- `version`：semver；安装记录与清单版本不一致时 `resolveMeta()` 返回 `null`，避免静默降级；
- `meta.name`、`meta.title`、`meta.version`、`meta.category`、`meta.defaultProps`、`meta.settings` 必填；
- `kind: "component"` 的 `component` 不在白名单 → **整份清单拒绝**，不做部分加载。

## 4. 验签与签名

验签使用 WebCrypto：

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

注意：

- `canonicalJson` 会递归排序对象键、忽略 `undefined`，数组保持顺序；市场发布端必须使用同一实现（`@lc/materials` 导出）。
- WebCrypto 的 ECDSA 签名是 **IEEE P1363 `r||s`**，不是 OpenSSL 默认的 DER。用 OpenSSL 签名时需转换，或直接用 WebCrypto 生成。
- 建议清单发布走 CI：构建清单 → 使用离线私钥签名 → 上传静态文件，私钥不进前端包。

## 5. 设计器操作

1. 顶栏「物料市场」；未配置时只显示环境变量指引。
2. 「刷新清单」→ 拉取、验签、schema 校验、写入缓存；失败时显示具体原因，不覆盖旧缓存。
3. 「安装」→ 写入本地安装状态；「卸载」→ 只移除安装状态，已插入画布的节点不受影响。
4. 受控组件安装后可「插入画布」：复用宿主的 `Button`/`Input` 等内置物料，应用 `meta.defaultProps`，随后回到画布并选中新节点。
5. 版本不一致、缓存损坏、签名失效都不会被当作可用物料。

## 6. 验证

```bash
pnpm -F @lc/designer test -- remote-material.test.ts
pnpm -F @lc/designer typecheck
pnpm design:check
```

覆盖：验签成功/失败、未授权 origin、非 HTTPS、账号密码、未知组件白名单拒绝、重复 id、非法 semver、缓存损坏清理、安装版本不一致。
