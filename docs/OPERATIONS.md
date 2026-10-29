# 平台操作手册（OPERATIONS）

> 面向：本地开发、演示、部署与日常运维。
> 环境基线：Node.js ≥ 20（CI 用 22 与 20）、pnpm 12、MySQL 8（可选）。
> 相关文档：[`README.md`](../README.md)（快速启动）、[`PROGRESS.md`](PROGRESS.md)（能力与剩余工作）、
> [`protocol.md`](protocol.md)（对外契约）、[`openapi.md`](openapi.md)（接口清单）、
> [`DECISIONS.md`](DECISIONS.md)（架构决策）。
> 安全机制与可观测性契约的实现边界见本文 **附录 A / 附录 B**。

---

## 0. 三条常用路径

| 我要做什么 | 看哪一节 |
|---|---|
| 第一次跑起来、看演示 | §1 → §2 → §4.1 |
| 用设计器建页面并发布 | §3（重点 §3.7） |
| 切 MySQL、备份、部署上线 | §5 → §6 |
| 出问题了 | §7 故障排查 → §8 命令速查 |
| 查安全配置的启动校验规则 | 附录 A |
| 查探针/日志/请求 ID 的字段契约 | 附录 B |

默认端口：

| 进程 | 地址 | 说明 |
|---|---|---|
| 服务端 NestJS | `http://127.0.0.1:3000` | API 前缀 `/api/v1` |
| 设计器 | `http://127.0.0.1:5174` | `/api` 已代理到 3000 |
| 运行时 H5 | `http://127.0.0.1:5173` | uni-app dev server |

---

## 1. 环境准备

### 1.1 依赖

```bash
node -v      # 必须 ≥ 20
pnpm -v      # 12.x
```

MySQL 仅在选择 `LC_STORAGE=mysql` 时需要（MySQL 8，`utf8mb4`）。

### 1.2 安装依赖

```bash
cd D:\mimo\lowcode          # Linux/macOS: cd /path/to/lowcode
pnpm install --frozen-lockfile
```

`postinstall` 会自动执行 `prisma generate`，不需要数据库连接。

### 1.3 选择存储模式

| 模式 | 启用方式 | 适用 | 数据位置 |
|---|---|---|---|
| JSON（默认） | 不设置 `LC_STORAGE` | 单测、演示、单机 | `apps/server/data/` |
| MySQL | `LC_STORAGE=mysql` + `DATABASE_URL` | 生产、多实例 | MySQL 20 张表 |

> 仓库**不提交** `apps/server/data/`。新克隆首次启动是空库，没有演示页面，需要在设计器里新建。

---

## 2. 首次启动（JSON 模式，约 5 分钟）

开 **三个终端**，顺序不要乱。

### 2.1 终端 A：服务端

```bash
pnpm -F @lc/server build
pnpm -F @lc/server start
```

预期日志：`Nest application successfully started`，监听 `3000`。

> 服务端**没有 watch 模式**。改了 `apps/server/src` 必须重新 `build` 再重启，否则跑的还是旧代码。

### 2.2 终端 B：设计器

```bash
pnpm -F @lc/designer-web dev
```

浏览器打开 `http://127.0.0.1:5174`。设计器会用 `admin / admin123` 自动登录（仅开发种子）。

### 2.3 终端 C：H5 运行时

```bash
pnpm -F @lc/runtime dev:h5
```

浏览器打开 `http://127.0.0.1:5173`，会跳到登录页。

### 2.4 验收

```bash
curl -s http://127.0.0.1:3000/api/v1/health
```

预期返回含 `"status":"ok"`、`"storage":"json"`。再确认：

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

预期返回 `accessToken`。

### 2.5 开发账号

| 账号 | 密码 | 角色 | 说明 |
|---|---|---|---|
| `admin` | `admin123` | `admin` | `'*'` 通配，全部权限 |
| `designer` | `designer123` | `designer` | 受 RBAC 约束，用来看权限差异 |

> JSON 模式账号是**内存种子**；MySQL 模式必须执行 `pnpm -F @lc/server seed:mysql` 才有账号。
> 生产环境不要使用这两个账号。

---

## 3. 设计器操作

设计器是三栏布局：左栏「物料 / 大纲」、中间手机画布、右栏属性；顶栏是页面与全局操作。

顶栏按语义分成两个菜单，低频入口不占常驻宽度：

| 菜单 | 内容 |
|---|---|
| **页面** | 画布内：当前页名 / 类型 / 版本号 · 输入 pageId 打开 · 新建页面（先选模型）· 页面列表 · 删除当前页；任何视图：工作区（门户设计 / 页面画布 / 数据模型 / 权限管理 / 主题配置 / Webhook 集成 / 物料市场，当前项带 ✓） |
| **更多** | 撤销 / 重做 · 历史版本 · 复制 / 剪切 / 粘贴 · 快捷键与帮助 · 切换主题 · API 文档 |

**进入设计器 = 落在「门户设计」清单（一级首页）**，不是某张页面。此时「页面」菜单降级为纯工作区导航：不出现 pageId 输入、新建页面、删除当前页——清单页没有「当前可见页」，暴露删除只会误删用户看不见的页。页面级动作（保存 / 发布 / 撤销 / 重做 / 保存徽标 / 底栏校验摘要）同样只在**画布**出现。

窗口变窄时，撤销 / 重做（< 1200px）与顶栏主题按钮（< 900px）会收起，等价入口都在 **更多** 里，不会出现「功能消失」。

### 3.1 打开、新建、删除页面

| 操作 | 入口 | 说明 |
|---|---|---|
| 打开已有页 | 顶栏 **页面** 菜单 → 页面列表 | 列表按**模型分组**（组头「模型 请假单」），未绑定模型的页面单独一组；条目显示 `名称 / pageId / 类型 / vN` |
| 按 ID 打开 | 顶栏 **页面** 菜单 → 输入 pageId → **打开** | 适合已知 pageId |
| 新建 | 顶栏 **页面** 菜单 → **新建页面** | **必须先选数据模型**，填模块前缀（如 `leave`），勾选列表 / 表单 / 详情（默认三页）。生成的页面 id 为 `p_leave_list` / `p_leave_form` / `p_leave_detail`，**一次落盘**并自动串联：列表点行进详情、详情返回列表、表单提交成功回列表。同时回写模型的默认列表页 / 表单页。目标 id 已存在时**整体中止**，不会覆盖存量页面 |
| 删除 | 顶栏 **页面** 菜单 → **删除当前页** → **确认删除？** | 两步确认，10 秒内不点自动复位；会连带删除全部历史版本，并清掉模型上指向该页的默认页引用。服务端仅管理员（`'*'`）可删，非管理员会返回 403 |

> 没有数据模型时，「新建页面」只显示「去创建模型」入口，不允许无模型建页。模型面板底部「默认页面」可查看并一键打开模型对应的列表页 / 表单页。未保存过的页面不能删除（按钮置灰）。
>
> 模型默认页引用的清理由设计器在删除成功后**旁路**执行（失败只告警，不影响删除）；直接调用 `DELETE /pages/:id` 不会清，模型上可能留下指向已删页的 id —— 打开时按 `PAGE_NOT_FOUND` 提示，重新成组生成会覆盖。

### 3.2 拖拽与结构编辑

- 左栏切到 **物料**：按分类浏览，拖到画布目标容器。
- 左栏切到 **大纲**：查看树结构、点选节点、删除节点。
- 画布内选中节点后可拖动换位；拖到容器边缘可放入容器。
- 顶栏 **撤销 / 重做**（窄窗收在 **更多** 菜单），快捷键：`Ctrl+Z` / `Ctrl+Shift+Z`。
- **更多** 菜单里的 **复制 / 剪切 / 粘贴**，快捷键：`Ctrl+C` / `Ctrl+X` / `Ctrl+V`；选中节点按 `Delete` 或 `Backspace` 删除。

### 3.3 属性、字段绑定与动作

选中节点后，右栏属性面板按物料 META 自动生成：

| 区域 | 作用 |
|---|---|
| 页面类型 | 表单 / 列表 / 详情 / 门户 / 自定义 |
| 基础属性 | 标签、占位、必填、默认值等（`input/number/switch/select/textarea/color/optionList/expression` 为真控件） |
| 绑定字段 | 表单类物料可绑定当前模型的字段，提交时写入该字段 |
| 事件 · `xxx` | 绑定无参动作（如 `submit`、`reset`、`toast`） |

> `slider / ruleEditor / fieldPicker / dataSourcePicker / eventBinder` 目前是**只读占位**，会显示但不能编辑。

表达式写法与函数白名单见 [`protocol.md`](protocol.md)；引擎禁止赋值、禁止 `eval`。

### 3.4 数据模型

顶栏 **页面** 菜单 → 工作区 **数据模型**：

1. 输入模型 id（如 `m_leave`）→ **新建**。
2. 填模型名称、编码；在字段区增删字段，设置 `name / key / type / required / enum options`。
3. 需要数据权限时，在字段/模型区配置 CRUD 权限与 `dataScope`、角色可见性。
4. 点 **保存模型**。校验错误会显示在面板内，不会静默失败。

> 模型是列表页/详情页/表单提交的数据来源。标准流程是**先建模型，再在模型基础上成组生成页面**：页面 → 新建页面 → 选模型 → 勾选列表/表单/详情 → 生成。生成后模型会记住默认列表页 / 表单页，面板底部可直接打开。

### 3.5 页型与标准页

在右栏 **页面类型** 切换：

| 类型 | 运行时行为 | 设计器画布 |
|---|---|---|
| 表单 | 渲染 `root` 节点树，提交到「提交模型」 | 正常拖拽 |
| 列表 | 按右侧配置查询并分页渲染 | 根容器仅占位 |
| 详情 | 按配置加载单条记录 | 根容器仅占位 |
| 门户 | 顶部卡片导航 + 下方拖拽区 | 卡片区与右栏实时联动（设计态点卡不跳转），下方拖拽区正常 |
| 自定义 | 纯 `root` 渲染 | 正常拖拽 |

列表页配置：数据模型、详情页、每页条数、行内编辑、批量删除。
详情页配置：数据模型、返回页、编辑、删除。
门户页配置：标题、列数、卡片（标题/描述/图标/目标 pageId 或 URL/badge）。

> 行内编辑、批量删除、详情编辑/删除都默认关闭，需显式开启；写操作会带 `If-Match`，冲突返回 409，**不会自动覆盖**。

### 3.6 移动门户（门户清单 → 在线设计 → 手机预览）

入口：**打开设计器即是**移动门户清单（一级首页）；也可在任意视图用顶栏 **页面** 菜单 → 工作区 **门户设计** 回到清单。一个门户 = 一张 `type=portal` 的页面。

清单列：勾选、门户（名称 + 编码两行）、类型（圆点 + 系统内置 / 在线设计）、排序、备注、操作。

清单头部同时展示应用身份（应用名 / 图标）与入口页、门户页数、最近编辑；「门户页面 / 门户配置」用页签切换，右侧「工作区」栏直达数据模型、权限管理、主题配置、开放集成、物料市场。

| 行类型 | 来源 | 能否编辑 / 删除 |
|---|---|---|
| 系统内置 | 运行体内置路由，**不占页面表**：`default_apps`（应用入口）、`default_todo`（`/todo` 我的待办） | 否（只展示） |
| 在线设计 | 页面表里 `type=portal` 的记录 | 是（页面设计 / 编辑 / 删除） |

操作要点：

1. **查询**按「页面名称 / 页面编码」模糊匹配，点「查询」才应用；「重置」清空输入与条件。系统内置行同样参与过滤。
2. **分页**按「内置行 + 在线设计行」合并后的行序切分（10 / 20 / 50 条每页，可跳页），内置行不会每页重复出现。
3. **新增**填页面编码（主键，`^[A-Za-z_][\w-]{0,63}$`）、名称（留空 = 用编码）、排序、备注；确定后**直接落盘**一张空门户（`columns=4`、`cards=[]`）。
   编码已存在时**拒绝创建**并提示，不会覆盖存量页面（`PUT schema` 是 upsert）。
4. **编辑**只改名称 / 排序 / 备注，编码创建后不可改（换编码 = 另建页面）。排序与备注写在 `schema.portal.order` / `portal.remark`，**不是**服务端字段；保存先 `GET schema` 拿 revision 再带 `If-Match`，`409` 只提示、不自动覆盖。排序留空 = 排在已设置的后面，备注留空 = 删除该键。
5. **删除**是两步确认（首次点击只「上膛」，5 秒内不确认自动复位）；删除会连历史版本一起清掉，不可恢复。
6. **页面设计**是清单 → 画布的唯一入口：先 `GET schema` 取到最新内容，**成功后才切画布**（失败就地红字提示，留在清单，不带着旧页面进画布）；当前页有未保存修改时，第一次点击只提示「再点一次会丢弃」，第二次才真的换页。画布顶部有面包屑 `← 门户设计 / <门户名>`，点左侧随时原路返回；卡片区与右栏「导航卡片」实时联动（设计态点卡不跳转），下方是拖拽区。运行时卡片区在拖拽区上方。
7. 卡片字段：标题、说明、图标（内置字符集 `user` / `date` / `home` / `info` 等，未知值退化首字符）、跳转页 id（或 URL）、角标。卡片列数默认 4，四宫格图标块按序号轮换四组令牌色。
8. **手机预览**：先「保存」再「发布」；H5 打开 `http://127.0.0.1:5173/#/pages/view/index?pageId=<编码>`。从未发布过的页面回退草稿，可直接看到保存后的效果。点卡按配置跳转 `pageId`。

**门户组件库（拖拽区可用物料）**

门户页的左栏收敛为两组，表单控件 / 布局容器不出现（门户是首屏展示，不是录入页）：

| 分组 | 物料 |
|---|---|
| 基础组件 | 轮播图 / 公告条 / 文本 / 图片 / 图标 / 标签 / 分割线 / 进度条 |
| 业务组件 | 数据卡 / 待办列表 / 图表 / 指标卡 / 列表 / 单元格 / 描述组 / 流转时间轴 / 审批操作 |

9. **轮播图**：右栏「轮播项（JSON）」写 `[{"title":"…","desc":"…","image":"/static/a.png"}]`；`image` 留空显示令牌色占位块，标题/说明固定渲染在图片**下方**（不压图，亮/暗主题都可读）。高度按 rpx（缺省 300 ≈ 屏宽 40%）等比换算，`切换间隔(ms)` 设 `0` 可关掉自动播放。
10. **公告条**：`items` 写字符串数组（或 `[{"text":"…"}]`），多条按间隔轮换；只配一句话时可直接用「单条兜底文案」。
11. **数据卡**：主/副标题 + 数字格（`label` / `value` / `unit`），数字自动千分位，`columns` 控制每行列数（1~4）。
12. **待办列表**：**静态数据优先** —— `items` 非空时完全不发请求（设计期预览用）；留空则运行时经宿主拉 `GET /api/v1/flows/tasks/todo`（服务端按 canDecide 过滤），`limit` 截断条数，401 提示登录过期。
13. **JSON 类配置**（带 `(JSON)` 字样的字段）边打边解析：语法正确立即生效；写错只在下方红字提示「画布仍保留上一次合法内容」，**不会清空已有配置**。清空文本框等于删除该配置。

> 门户物料的面板 / 运行时分发 / 属性面板 `json` setter 细节见 [`protocol.md`](protocol.md) §2.9 与 §4。

> 门户清单会逐页 `GET schema` 读排序 / 备注（门户页通常个位数）；单页读取失败只把该行降级为「未设置」，不拖垮整张表。

### 3.7 保存、发布、版本（最容易踩坑）

| 按钮 | 作用 |
|---|---|
| **保存** | 保存草稿；校验不通过不会发请求 |
| **发布** | 生成已发布版本，运行时读取的是这个版本 |
| **历史** | 版本列表、`vN` 对比当前草稿、回滚到旧版（入口：**更多 → 历史版本**） |

关键规则：

1. **运行时优先读已发布版本**；只有从未发布过时才回退草稿。
   → 改完页面只看「保存」不点「发布」，H5 里看到的仍是旧内容。
2. 保存冲突返回 `409 VERSION_CONFLICT` 时，设计器**不会自动覆盖**，也不会自动重试。
   处理方式：在 **页面** 菜单里重新打开该页加载最新版本，再重做本次修改。
3. 发布前先看底栏校验错误；有错误时不要强行发布。
4. 页面删除不可恢复（除非有数据库/文件备份）。

### 3.8 权限管理

顶栏 **页面** 菜单 → 工作区 **权限管理**：

1. 新建角色 key（如 `employee`），填名称与权限点（逗号分隔，`*` 为通配）。
2. 在页面授权矩阵里勾选该角色可见的页面。
3. 节点级权限在画布选中节点后，于右栏设置 `perm`（权限表达式）。
4. 模型数据权限在 **数据模型** 面板中配置 CRUD 与 `dataScope`。

> 权限改动保存后，运行时需重新登录或刷新 bootstrap 才会拿到新的 `perms`。

### 3.9 主题配置

顶栏 **页面** 菜单 → 工作区 **主题配置**：品牌主色（十六进制）、主圆角（px）、深色模式（跟随系统/强制浅/强制深）。

- 保存成功会立即预览设计器换肤。
- 运行时 H5 生效；小程序端主题动态化尚未实现。
- 留空表示回落到设计令牌默认值。

### 3.10 Webhook 集成

顶栏 **页面** 菜单 → 工作区 **Webhook 集成**（仅 `'*'` 管理员可用）：

1. **新建订阅**：名称、目标 URL、事件（如 `record.created`、`flow.completed`，`*` 为全部）、可选限流/自定义头。
2. 创建成功后密钥**只显示一次**，立即保存到密钥管理系统。
3. **测试投递** 验证连通性；**日志** 按状态过滤查看投递结果。
4. **密钥轮换** 可设置宽限期，宽限期内旧密钥仍可用。
5. **清理归档** 手动触发过期日志归档（默认保留 30 天）。

投递语义是**至少一次**，接收方必须按事件 id 或投递 id 幂等。签名校验：

```text
X-LC-Signature: t=<unix>,v1=<hex hmac>
签名内容 = "<t>.<原始 JSON body>"
```

生产环境默认拒绝私网/本机 URL；内网联调需显式设置 `LC_WEBHOOK_ALLOW_PRIVATE=1`（仅限可信环境）。

### 3.11 物料市场（服务端托管 + 设计器受信元数据）

服务端提供清单托管与签名、发布审核状态机、租户级安装状态；设计器拉取并验签清单，只插入宿主内置组件，**不下载/执行远程 JS**。设计器入口：**页面** 菜单 → 工作区 **物料市场**。

服务端（生产建议配置签名私钥，否则清单接口 503）：

```bash
LC_MATERIAL_MARKET_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
LC_MATERIAL_MARKET_KID=market-2026-10
LC_MATERIAL_MARKET_NAME=低代码物料市场
```

设计器构建环境：

```bash
VITE_LC_MATERIAL_MARKET_URL=https://lc.example.com/api/v1/materials/manifest
VITE_LC_MATERIAL_MARKET_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
VITE_LC_MATERIAL_MARKET_ALLOWLIST=https://lc.example.com
```

公钥从 `GET /api/v1/materials/manifest/key` 获取（公开）。写入 `apps/designer-web/.env.local` 后重启 dev server。

发布流程：

1. 管理员 `POST /materials` 创建草稿（`kind=component` 的 `component` 必须在宿主白名单）；
2. `POST /materials/:id/submit` → `review`（可驳回并写理由）→ `publish`；
3. 发布固化不可变版本快照，同一版本不可重复发布；`POST /materials/:id/unpublish` 下架后清单立即移除；
4. 写操作均带 `ETag`/`If-Match`，`409` 不自动覆盖、不自动重试。

租户安装：

- `X-LC-Tenant` 由网关认证后注入（缺省 `default`），服务端只校验格式；
- 只允许安装当前已发布版本，版本不一致返回 `409 MARKET_VERSION_MISMATCH`；
- JSON 模式数据在 `<LC_DATA_DIR>/market.json`；MySQL 模式为 `market_materials` / `market_material_versions` / `market_installs` 三表。

行为边界：

- 只接受 **ECDSA P-256 签名**的元数据，并校验 origin allowlist。
- 只允许插入**宿主内置组件白名单**里的物料，复用本地组件。
- **不下载、不执行远程 JS**。
- 设计器本地安装态与 Web Storage 缓存在面板内维护，暂不与服务端安装记录自动同步。

完整契约与错误码见 [`material-market.md`](material-market.md)。

---

## 4. 运行时与多端

### 4.1 H5 路由

| 场景 | URL |
|---|---|
| 登录 | `http://127.0.0.1:5173/#/pages/login/index` |
| 首页/菜单 | `http://127.0.0.1:5173/#/pages/index/index` |
| 指定页面 | `http://127.0.0.1:5173/#/pages/view/index?pageId=<pageId>` |
| 待办中心 | 登录后从首页进入 |

> `pageId` 必须是**已保存**的页面；未发布时会回退草稿，已发布时读发布版本。

### 4.2 登录、表单、审批

1. `admin / admin123` 登录。
2. 首页展示 bootstrap 下发的可见菜单（受 RBAC 过滤）。
3. 打开表单页填写；带 `onSubmit` 的动作会提交到配置的模型。
4. 表单支持本地草稿：用户隔离、7 天过期，重新进入会提示恢复。
5. 提交后若模型配置了流程，会在 **待办中心** 生成待办；详情页可同意/驳回并查看时间轴。
6. 审批通过后按 `onApprove.setField` 回写业务记录。

### 4.3 构建小程序与 App

```bash
pnpm -F @lc/runtime build:h5          # → packages/runtime/dist/build/h5
pnpm -F @lc/runtime build:mp-weixin   # → packages/runtime/dist/build/mp-weixin
pnpm -F @lc/runtime build:app         # → packages/runtime/dist/build/app
```

- 小程序：用微信开发者工具导入 `packages/runtime/dist/build/mp-weixin`。
- App：产物供 HBuilderX 导入；仓库不生成 APK/IPA。
- 真机/小程序尚未做真机验证，只做了产物级检查。

### 4.4 真机与局域网调试

`packages/runtime/src/api.ts` 的 `API_ORIGIN` 默认是 `http://127.0.0.1:3000`：

- 真机调试必须改成开发机局域网 IP，如 `http://192.168.1.10:3000`。
- 小程序还需在微信公众平台配置 request 合法域名；本地可用开发者工具「不校验合法域名」。
- 改完后重新编译小程序/H5。

### 4.5 改了代码不生效？

| 改了什么 | 必须做什么 |
|---|---|
| `apps/server/src` | `pnpm -F @lc/server build` → 重启服务端（无 watch） |
| `packages/*/src` | `pnpm -F <pkg> build` → 删除 `packages/runtime/node_modules/.vite` → 重启 runtime dev |
| 设计器源码 | Vite 自动热更新；异常时重启 `dev` |
| 设计令牌 | `pnpm tokens:rpx` 后重启；提交前跑 `pnpm design:check` |

---

## 5. MySQL 模式

### 5.1 建库与账号

```bash
mysql -uroot -p -e "CREATE DATABASE lowcode CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -uroot -p -e "CREATE USER 'lc_app'@'localhost' IDENTIFIED BY '<strong-password>'; GRANT ALL PRIVILEGES ON lowcode.* TO 'lc_app'@'localhost'; FLUSH PRIVILEGES;"
```

测试库（跑集成测试时用，脚本会拒绝非 `*_test` 库）：

```bash
mysql -uroot -p -e "CREATE DATABASE lowcode_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
```

### 5.2 配置

```bash
cp apps/server/.env.example apps/server/.env
```

编辑 `apps/server/.env`：

```bash
DATABASE_URL="mysql://lc_app:<strong-password>@127.0.0.1:3306/lowcode"
LC_STORAGE=mysql
LC_DATA_DIR=./data
```

> 服务端**不自动加载 `.env`**：本地用 `start:mysql`（Node `--env-file`），生产用 systemd/容器注入。
> `DATABASE_URL` 带引号时，脚本派生测试库需要先去掉引号再替换库名。

### 5.3 迁移与种子

```bash
pnpm -F @lc/server prisma:generate
pnpm -F @lc/server prisma:migrate     # prisma migrate deploy
pnpm -F @lc/server seed:mysql         # 仅开发：admin/designer 账号与角色
```

> 生产只用 `prisma migrate deploy`，**不要用 `db push`** 代替迁移。

### 5.4 启动

```bash
pnpm -F @lc/server build
pnpm -F @lc/server start:mysql
```

验收：

```bash
curl -s http://127.0.0.1:3000/api/v1/ready
```

预期 `{"status":"ok","storage":"mysql","checks":{"dataDir":"ok","database":"ok"}}`。

### 5.5 从 JSON 导入存量数据

切换前先导入（幂等 upsert，可重复执行）：

```bash
pnpm -F @lc/server import:json-to-mysql
```

覆盖：页面/版本、模型/记录、RBAC、流程定义/实例、运维事件、应用配置、文件元数据与内容、Webhook 订阅/投递/归档、物料市场物料/版本/安装。

> MySQL 模式**不会自动双读**旧 `files/` 目录；不导入会导致旧附件 404。

### 5.6 本地验证 MySQL

```bash
# PowerShell 示例：先从 .env 取 DATABASE_URL，去引号，替换库名
$url = (Select-String -Path apps/server/.env -Pattern '^DATABASE_URL=').Line.Split('=',2)[1].Trim('"') -replace '/lowcode(\?|$)','/lowcode_test$1'
$env:LC_TEST_DATABASE_URL = $url
$env:LC_SMOKE_DATABASE_URL = $url
pnpm -F @lc/server prisma:migrate
pnpm -F @lc/server exec vitest run test/mysql.persistence.test.ts
pnpm -F @lc/server verify:market-import
pnpm -F @lc/server smoke:mysql
```

预期：`mysql.persistence.test.ts` 10/10 PASS；市场导入验证输出 `3/3/3` 且两次快照一致；真启动冒烟 10 项 PASS。

### 5.7 切换检查清单

- [ ] 已备份 JSON 数据目录
- [ ] `prisma migrate deploy` 成功，20 张表齐全
- [ ] `import:json-to-mysql` 已执行，回读计数与源一致（含市场三表）
- [ ] `/ready` 返回 `database: ok`
- [ ] 设计器可登录（MySQL 模式必须 `seed:mysql` 或已有用户）
- [ ] 运行时能打开已发布页面
- [ ] 旧 `files/` 附件可下载

---

## 6. 生产部署与运维

### 6.1 构建

```bash
pnpm install --frozen-lockfile
pnpm design:check
pnpm build            # 必须先于 typecheck：workspace types 指向 dist
pnpm typecheck
pnpm test
pnpm coverage
```

> CI 顺序同样是 **design:check → build → typecheck → 三端编译 → test → coverage**。

### 6.2 环境变量

```bash
NODE_ENV=production
PORT=3000
LC_STORAGE=mysql
DATABASE_URL=mysql://lc_app:<password>@127.0.0.1:3306/lowcode
LC_DATA_DIR=/var/lib/lowcode/data
LC_JWT_SECRET=<至少 32 字符随机值>
LC_CORS_ORIGINS=https://lc.example.com
LC_TRUST_PROXY=true
LC_ACCESS_LOG=1
LC_APP_VERSION=2026.10.27
# 物料市场签名（EC P-256 PKCS#8 PEM；单行可用 \n 转义）
LC_MATERIAL_MARKET_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
LC_MATERIAL_MARKET_KID=market-2026-10
LC_MATERIAL_MARKET_NAME=低代码物料市场
```

| 变量 | 生产要求 |
|---|---|
| `LC_JWT_SECRET` | 必填 ≥32 字符，禁止仓库内置开发值 |
| `LC_CORS_ORIGINS` | 显式白名单；不设置=不放行跨域 |
| `LC_TRUST_PROXY` | 仅在可信反代后设为 `true`（只信任一层） |
| `LC_RATE_LIMIT_MAX` | 普通接口每 IP 每窗口上限（默认 600） |
| `LC_LOGIN_RATE_LIMIT_MAX` | 登录接口上限（默认 20） |
| `LC_WEBHOOK_WORKER` | 默认开启；设为 `off` 可关闭投递 worker |
| `LC_MATERIAL_MARKET_PRIVATE_KEY` | **生产建议必填**：EC P-256 PKCS#8 私钥；未配置时清单/公钥接口 503，非生产会生成临时密钥 |
| `LC_MATERIAL_MARKET_KID` | 可选密钥标识，缺省等于公钥 `sha256:` 指纹 |
| `LC_MATERIAL_MARKET_NAME` | 可选清单市场名称，缺省「低代码物料市场」 |

生产未设置 `LC_JWT_SECRET`、密钥过短或等于开发值，服务会在监听端口前 **exit 1**。显式配置了非法/非 P-256 的市场私钥同样启动失败。

### 6.3 systemd

```ini
[Unit]
Description=LowCode Server
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

```bash
systemctl daemon-reload
systemctl enable --now lowcode
systemctl status lowcode
journalctl -u lowcode -f
```

### 6.4 nginx

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

设计器与 H5 为静态产物，按普通静态站点托管即可；需保证前端访问的 API 域名与 `LC_CORS_ORIGINS` 一致。

### 6.5 探针

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/ready
```

- `/health`：进程存活，不查磁盘。
- `/ready`：JSON 模式查数据目录可写；MySQL 模式额外 `SELECT 1`。
- 两者免登录、免限流；所有响应带 `X-Request-Id`。
- 建议：`initialDelaySeconds=3`、`periodSeconds=10`、`timeoutSeconds=2`、`failureThreshold=3`。

### 6.6 备份与恢复

**MySQL（推荐生产）**

```bash
mysqldump --single-transaction --routines --triggers \
  --default-character-set=utf8mb4 -u lc_app -p lowcode > /backup/lowcode-$(date +%F-%H%M).sql
```

恢复：停服 → `mysql ... lowcode < backup.sql` → `pnpm -F @lc/server prisma:migrate` → `/ready` 返回 `database: ok` → 放流量。

**JSON**

```bash
systemctl stop lowcode
rsync -a --delete /var/lib/lowcode/data/ /backup/lowcode/data-$(date +%F-%H%M)/
systemctl start lowcode
```

恢复：停服 → 覆盖 `LC_DATA_DIR` → `/ready` 200 → 放流量。

> 跨文件没有事务，运行中直接拷贝可能拿到不同时间点组合；尽量停机或做文件系统快照。
> 备份含业务数据与附件，按敏感数据管理权限与保留周期；**只备份不演练等于没有备份**。

### 6.7 日志与限流

- 访问日志为单行 JSON，写 stdout，默认 production 开启；字段含 `requestId/method/path/status/durationMs/ip`，不记 query/body/Authorization。
- 日志轮转交给 journald / Docker / 云日志；若重定向到文件需自行配置 logrotate。
- 限流为**单进程内存计数**：普通 600/min/IP、登录 20/min/IP，超限 `429 RATE_LIMITED` + `Retry-After`。
- 多实例部署前必须换 Redis 等共享限流，否则每个副本各算各的额度。

### 6.8 Webhook 多副本

- `LC_STORAGE=mysql` 时用 `FOR UPDATE SKIP LOCKED` 领取任务，按 `leaseOwner` CAS 回写；worker 崩溃 90s 后可重领。
- JSON 模式只有单机文件锁，**跨主机多副本必须用 MySQL**。
- 投递日志默认保留 30 天，先归档到 `webhook_delivery_archives` 再删除。
- 健康指标与告警在设计器「Webhook 集成」面板查看。

---

## 7. 故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 设计器打开空白 / 接口 502 | 服务端没起、没 build、端口不是 3000 | 看终端 A 日志；`curl :3000/api/v1/health`；重新 `build` 再 `start` |
| 设计器一直登不上 | MySQL 模式没有用户 | 执行 `pnpm -F @lc/server seed:mysql`（仅开发），或检查 `users` 表 |
| 登录 401 | 密码错 / 用户不存在 / token 过期 | 清 `sessionStorage` 后重登；MySQL 模式查 `users` |
| 保存返回 409 | 别人先保存了，`If-Match` 不匹配 | 点 **打开** 重新加载最新版本，再重做修改；系统不会自动覆盖 |
| H5 看不到刚改的内容 | 只「保存」未「发布」 | 设计器点 **发布**；运行时优先读发布版本 |
| 运行时 404 `PAGE_NOT_FOUND` | pageId 拼错 / 页面未保存 | 设计器确认 pageId 并保存 |
| 运行时 409 `NOT_PUBLISHED` | 页面从未发布 | 点 **发布**；开发期也会回退草稿，但发布后才稳定 |
| 小程序白屏 | `API_ORIGIN` 还是 127.0.0.1 / 未配合法域名 | 改局域网 IP，重新编译；开发者工具可临时关闭域名校验 |
| 改了 `packages/*` 不生效 | 运行时用了旧的 Vite 预构建缓存 | 先 build 该包，删 `packages/runtime/node_modules/.vite`，再重启 |
| 改了服务端代码不生效 | 服务端无 watch | 重新 `pnpm -F @lc/server build` 并重启 |
| 请求 429 | 触发限流 | 等待窗口结束；开发期可调 `LC_RATE_LIMIT_MAX` / `LC_LOGIN_RATE_LIMIT_MAX` |
| 上传 413 | 单文件超过 10MB | 压缩或分片；对象存储/Range 尚未实现 |
| Webhook 一直不投递 | worker 被关、URL 是私网、目标不可达 | 检查 `LC_WEBHOOK_WORKER`；内网需 `LC_WEBHOOK_ALLOW_PRIVATE=1`；看投递日志错误 |
| Webhook 验签失败 | 时间戳超窗 / body 被改写 / 用错密钥 | 用原始 body 计算；校验 `t`；轮换宽限期内兼容旧密钥 |
| `/ready` 503 | 数据目录不可写 / 数据库连不上 | 看 `checks` 字段；修权限或 `DATABASE_URL` |
| `prisma migrate` 失败 | 库不存在 / 账号权限不足 / 迁移历史不一致 | 建库授权；核对 `_prisma_migrations`；生产不要 `db push` |
| `design:check` 红灯 | 令牌漂移、硬编码色值、rpx 未生成、对比度不足 | 按报错文件修；`pnpm tokens:rpx` 重新生成；不要改门禁绕过 |
| 3000/5173/5174 被占用 | 端口冲突 | 停旧进程；服务端可用 `PORT` 改端口，同时改设计器代理与运行时 `API_ORIGIN` |

---

## 8. 命令速查

```bash
# 安装与本地启动
pnpm install --frozen-lockfile
pnpm -F @lc/server build && pnpm -F @lc/server start
pnpm -F @lc/designer-web dev
pnpm -F @lc/runtime dev:h5

# 质量门禁（提交前）
pnpm design:check
pnpm build
pnpm typecheck
pnpm test
pnpm coverage

# 多端构建
pnpm -F @lc/runtime build:h5
pnpm -F @lc/runtime build:mp-weixin
pnpm -F @lc/runtime build:app

# MySQL
pnpm -F @lc/server prisma:generate
pnpm -F @lc/server prisma:migrate
pnpm -F @lc/server seed:mysql
pnpm -F @lc/server import:json-to-mysql
pnpm -F @lc/server start:mysql

# 冒烟（前 5 个需先起服务；安全/可观测性自起临时实例）
node apps/server/scripts/smoke-p3b5.mjs
node apps/server/scripts/smoke-p3b4.mjs
node apps/server/scripts/smoke-p3b3.mjs
node apps/server/scripts/smoke-p3b2.mjs
node apps/server/scripts/smoke-flow.mjs
pnpm smoke:security
pnpm smoke:observability
pnpm -F @lc/server smoke:mysql

# 探针
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/ready
curl -fsS http://127.0.0.1:3000/api/v1/openapi.json > openapi.json
```

---

## 9. 安全红线

1. **不要提交 `.env`**，不要把生产密钥写进仓库、截图或日志。
2. 生产必须设置 `LC_JWT_SECRET`（≥32 字符）与 `LC_CORS_ORIGINS`；开发默认值不得上线。
3. `LC_TRUST_PROXY=true` 只在可信反代后开启，且不要把 `X-Forwarded-For` 直接暴露公网。
4. 写接口统一 `ETag` / `If-Match`；遇到 409 **不自动覆盖、不自动重试**。
5. Webhook 密钥只在创建/轮换时显示一次；接收方必须做幂等与时间窗校验。
6. 远程物料只接受受信元数据与内置组件白名单，**永不下载/执行远程 JS**。
7. 生产迁移只用 `prisma migrate deploy`，禁用 `db push`。
8. 备份、导出文件与投递日志都可能含个人信息，按敏感数据管理。

---

## 附录 A：安全机制与实现边界

> 来源：原 `security-hardening-2026-10-20.md`（已合并，git 历史可追溯）。
> 本附录写「怎么校验、失败什么行为」；部署命令见 §6，红线见 §9。

### A.1 四项机制

| # | 机制 | 实现 |
|---|---|---|
| 1 | JWT 密钥 fail-closed | 生产未设置 / 长度 <32 / 等于仓库内置开发值 → 启动失败（exit 1）；非生产未设置才回退开发密钥并打印警告 |
| 2 | CORS 白名单 | `LC_CORS_ORIGINS` 逗号分隔、必须是完整源；拒绝 `*`、带路径、带查询、非 `http(s)`；生产未设置 = 不发送 CORS 允许头 |
| 3 | 限流 | 单进程固定窗口；普通接口默认 600 次/分钟/IP，登录默认 20 次/分钟/IP；超限 `429 RATE_LIMITED` + `Retry-After` |
| 4 | 反向代理 | `LC_TRUST_PROXY=true` 时启用 Express `trust proxy`，按 `X-Forwarded-For` 取客户端 IP（**只信任一层**） |

相关环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `LC_JWT_SECRET` | 非生产回退开发密钥 | 生产必填，≥32 字符，禁止等于仓库内置开发值 |
| `LC_CORS_ORIGINS` | 开发：`localhost:5173/5174` | 生产显式白名单；只接受完整源，如 `https://lc.example.com` |
| `LC_RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口（毫秒） |
| `LC_RATE_LIMIT_MAX` | `600` | 普通接口每 IP 每窗口上限 |
| `LC_LOGIN_RATE_LIMIT_MAX` | `20` | 登录接口每 IP 每窗口上限 |
| `LC_TRUST_PROXY` | `false` | 反代后设 `true`；仅信任一层 |

生产启动示例（bash）：

```bash
export NODE_ENV=production
export LC_JWT_SECRET="$(openssl rand -base64 48)"
export LC_CORS_ORIGINS="https://lc.example.com"
export LC_TRUST_PROXY=true
node apps/server/dist/main.js
```

### A.2 启动期行为

| 场景 | 行为 |
|---|---|
| production + 无 `LC_JWT_SECRET` | 抛错，进程 exit 1，不监听端口 |
| production + 密钥 <32 字符 | 抛错，exit 1 |
| 任意环境 + 密钥等于仓库内置开发值 | 抛错，exit 1 |
| development/test + 无密钥 | 使用开发默认值，启动成功并打印警告 |
| `LC_CORS_ORIGINS=*` | 抛错，exit 1 |
| `LC_CORS_ORIGINS` 含路径 / 查询 / 非 http(s) | 抛错，exit 1 |
| 限流参数非正整数 / 越界 | 抛错，exit 1 |

### A.3 请求期行为

- 允许的 `Origin`：返回 `Access-Control-Allow-Origin: <该源>` 与 `Vary: Origin`；
- 未在名单的 `Origin`：**不返回** `Access-Control-Allow-Origin`（由浏览器拦截）；
- 预检 `OPTIONS` 不计入限流；
- 超限：`429`，响应体 `{ "code": "RATE_LIMITED", "message": "请求过于频繁，请稍后再试" }`；
- 响应头：`X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`；超限时额外 `Retry-After`（秒）；
- 登录限流按**所有登录尝试**计数（成功与失败都算），避免「只有失败才计数」被绕过。

### A.4 实现位置

| 文件 | 作用 |
|---|---|
| `apps/server/src/common/security.config.ts` | 密钥 / CORS / 限流参数解析与启动自检 |
| `apps/server/src/common/rate-limit.ts` | 固定窗口计数器 + Nest 中间件 |
| `apps/server/src/common/jwt.service.ts` | 使用 `resolveJwtSecret()`，生产 fail-closed |
| `apps/server/src/app.module.ts` | 注册全局限流中间件 |
| `apps/server/src/main.ts` | 启动自检、CORS、trust proxy、错误退出 |
| `apps/server/test/security.test.ts` | 安全回归用例 |
| `apps/server/scripts/smoke-security.mjs` | 真实启动冒烟（CORS / 登录 429 / 生产 fail-closed） |

### A.5 验证方式与边界

```bash
pnpm -F @lc/server test          # security.test.ts 覆盖密钥/CORS/限流
pnpm smoke:security              # 自起临时实例，10 项真实冒烟
```

该批次（2026-10-20）实测：`security.test.ts` 25 例，服务端 201 例全通过；冒烟 10/10 PASS（含「CORS 黑名单源无 ACAO」「第 3 次登录 429」「生产缺密钥 exit 1」）。

**剩余风险**（未实现，不要当成已有能力）：

1. **单实例限流**：计数在进程内，多副本各算各的额度；扩容前需换 Redis 等共享计数。
2. **无审计日志**：登录失败、429、CORS 拒绝只返回状态，不写安全审计。
3. **无账号锁定**：限流按 IP，代理池/僵尸网络仍可能绕过；可后续加账号维度退避。
4. **CORS 未设置即关闭**：前后端分域部署时必须显式配 `LC_CORS_ORIGINS`，否则浏览器会拦截。
5. **密钥轮换**：只支持单密钥，无 `kid` / 双密钥过渡；轮换需重启，旧令牌自然过期（8h）。

---

## 附录 B：可观测性契约与边界

> 来源：原 `observability-deployment-2026-10-21.md`（已合并，git 历史可追溯）。
> 本附录定「探针返回什么、日志记什么」；systemd / nginx / 备份命令见 §6。

### B.1 探针契约

`GET /api/v1/health`（liveness）：无需登录，不查磁盘，只证明 Node 进程与 HTTP 栈可响应。

```json
{
  "status": "ok",
  "storage": "mysql",
  "version": "9.9.9",
  "uptimeSeconds": 123,
  "timestamp": "2026-10-21T09:00:00.000Z"
}
```

- `version` 取 `LC_APP_VERSION`，未设置回退 `0.1.0`；建议注入构建号或镜像 tag。
- `uptimeSeconds` 取 `process.uptime()`，用于判断是否频繁重启。

`GET /api/v1/ready`（readiness）：JSON 模式检查 `LC_DATA_DIR` 可 `mkdir -p` 且可写；MySQL 模式额外执行 `SELECT 1`。

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

**取舍**：探针不鉴权、不计入限流，避免负载均衡高频探测消耗真实用户额度；`/ready` 只检查已引入的下游（数据目录、数据库），不含对象存储。

### B.2 请求 ID

- 客户端可传 `X-Request-Id`；仅接受 `[A-Za-z0-9._-]{8,128}`，其余（含空格、换行、超长、数组）一律生成 UUID。
- 服务端把最终 ID 写回响应头，并挂到 `req.requestId`，供错误处理与业务日志复用。
- 建议由反向代理生成并透传：nginx `proxy_set_header X-Request-Id $request_id;`。

### B.3 访问日志

字段固定，单行 JSON 写 stdout：

```json
{"level":"info","type":"access","at":"2026-10-21T09:00:00.000Z","requestId":"...","method":"GET","path":"/api/v1/pages","status":200,"durationMs":12,"ip":"10.0.0.8","userAgent":"Mozilla/5.0 ..."}
```

- **只记 path，不记 query**（避免 `?token=` 等敏感参数）；不记 body、`Authorization`、`Cookie`。
- `durationMs` 为响应 `finish` 时减去请求进入时间；被中断的请求不计。
- 默认 `NODE_ENV=production` 开启；非生产默认关闭，避免本地测试刷屏。`LC_ACCESS_LOG=1/0`（兼容 `true/false/yes/no/on/off`）显式覆盖；非法值启动失败。
- 日志交给 journald / Docker 日志驱动 / 云日志采集；当前**不做文件轮转**。

相关环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `LC_ACCESS_LOG` | production 开启 | 访问日志开关；非法值启动失败 |
| `LC_APP_VERSION` | `0.1.0` | 健康检查版本号 |
| `LC_STORAGE` | `json` | `json` / `mysql`；非法值启动失败 |
| `DATABASE_URL` | — | `LC_STORAGE=mysql` 时必填 |
| `LC_DATA_DIR` | `<cwd>/data` | JSON 模式数据根目录；MySQL 模式仅历史兼容；`/ready` 检查可写 |

> 服务端**不自动加载 `.env`**：systemd 用 `EnvironmentFile=`，容器用 `-e/--env-file`，shell 用 `export`。

### B.4 JSON 模式数据布局

`LC_STORAGE=json` 时数据都在 `LC_DATA_DIR`（生产示例 `/var/lib/lowcode/data`）：

| 路径 | 内容 |
|---|---|
| `pages/<id>.json` | 页面草稿与历史版本 |
| `models/<id>.json` | 模型定义与记录 |
| `rbac.json` | 角色与页面授权 |
| `flows.json` / `flow-instances.json` | 流程定义与实例 |
| `ops/events.json` | 运维事件（环形 500 条） |
| `apps.json` | 主题配置 |

跨文件没有事务，运行中直接拷贝可能拿到不同时间点组合：尽量停机或做文件系统快照，备份与恢复步骤见 §6.6。

### B.5 验证方式与边界

```bash
pnpm -F @lc/server test          # observability.test.ts
pnpm smoke:observability         # 自起临时实例，4 项真实冒烟
```

该批次（2026-10-22）实测：`observability.test.ts` 11 例通过；冒烟 4/4 PASS（探针字段、请求 ID 复用与伪造回退、访问日志开关、非法值启动失败）。

**明确未实现**：指标（Prometheus / OpenTelemetry）、分布式追踪、日志轮转与集中采集、告警、多实例共享限流、对象存储 / CDN / Range 下载（大附件场景）。
