# 低代码平台协议规范（protocol.md）

> 版本：**v1.0** ｜ 对应 `schemaVersion`: **1.0.0** ｜ 编写日期：2026-09-29 ｜ **第 10 章修订：2026-10-10**（补方案 8.3 动态 CRUD 9 个接口、记录查询语义 10.4、服务端错误码 11 → 19；**协议结构 0~9 章未变，故不升 `schemaVersion`**）｜ **第 2 章修订：2026-10-14**（Phase 2 批 2 新增 `PageSchema.detail?: DetailPageConfig` + 2.7 节 + 2.6 实现状态注记；**可选字段新增，向后兼容，不升 `schemaVersion`**，D-P2-2）｜ **第 2 章修订：2026-10-20**（Phase 3 批 4 新增 `PageSchema.portal?: PortalPageConfig` + 2.9 节；**可选字段新增，向后兼容，不升 `schemaVersion`**，D-P3-11）｜ **第 10 章修订：2026-10-20**（Phase 3 批 5 新增 `POST/GET /ops/events` + `GET /ops/summary` + `OPS_INVALID`；**纯服务端接口，协议结构未变，不升 `schemaVersion`**，D-P3-12）｜ **第 10 章修订：2026-10-22**（Phase 4 乐观锁与记录编辑：页面/记录/流程实例 `revision`、`ETag`/`If-Match`、`Idempotency-Key`、`pendingPatch` outbox；`DetailPageConfig` 新增可选 `editable`/`deletable`；新增 `INVALID_IF_MATCH` / `VERSION_CONFLICT` / `FLOW_CONFLICT` / `IDEMPOTENCY_KEY_REUSED`；**可选字段新增，向后兼容，不升 `schemaVersion`**，ADR-011）｜ **第 10 章修订：2026-10-27**（Phase 4 物料市场：清单签名、发布审核状态机、租户级安装；新增 `MARKET_*` / `TENANT_INVALID` 错误码；**纯服务端接口，协议结构未变，不升 `schemaVersion`**）
>
> **事实源（唯一权威）**：`lowcode/packages/schema/src/types/*.ts`（结构）+ `lowcode/packages/schema/src/validate/index.ts`（校验规则）+ `lowcode/packages/expression/src/`（表达式语义）+ `lowcode/apps/server/src/`（第 10 章接口）。
> 本文件是面向**协议使用者（设计器 / 运行时 / 服务端 / 第三方集成方）**的规范说明，字段结构以 TS 类型为准，语义与约束以本文件为准。
> **同步规则见附录 B**：改协议必须「先改 TS 类型 → 补/改校验与测试 → 更新本文件 → 需要时升 `schemaVersion`」。

---

## 0. 通用约定

### 0.1 版本铁律（方案 3.7）

1. 任何 `PageSchema` / `ModelSchema` / `AppSchema` **必须携带 `schemaVersion`**，格式为三段式 `\d+\.\d+\.\d+`；
2. 运行时加载任何 Schema **必须先 `migrate()`** 再使用；
3. 迁移函数**只增不删**，且必须有单测。

当前协议版本常量：`SCHEMA_VERSION = '1.0.0'`，已知版本链 `VERSION_HISTORY = ['1.0.0']`。详见第 9 章。

### 0.2 标识符规则

| 场景 | 规则 | 校验 |
|---|---|---|
| 节点 `id`、权限点 `perm` | `/^[A-Za-z_][\w-]*$/`，**页面内全局唯一**，发布后不可变 | `E_REQUIRED` / `E_DUPLICATE_ID` / `E_PERM_FORMAT` |
| 服务端页面 id | `/^[A-Za-z_][\w-]{0,63}$/`（防路径穿越，服务层与仓储层双重校验） | `400 INVALID_PAGE_ID` |
| 模型 `code` | 仅小写字母/数字/下划线且字母开头（`/^[a-z][a-z0-9_]*$/`） | `E_CODE_FORMAT` |
| 数据源 `id` | 页面内唯一（无格式正则，缺失/重复即报错） | `E_REQUIRED` / `E_DUPLICATE_ID` |
| 节点 `componentName` | 首字母大写，必须存在于物料注册表 | `E_MATERIAL_NAME` / `E_UNKNOWN_MATERIAL` |

### 0.3 Issue 结构（校验结果的统一形状）

```jsonc
{
  "valid": false,            // errors.length === 0
  "errors":   [{ "code": "E_EXPR_SYNTAX", "severity": "error",   "path": "root.children[1].condition", "message": "…" }],
  "warnings": [{ "code": "W_PAGE_NAME",   "severity": "warning", "path": "name", "message": "…" }]
}
```

- **error**：阻断保存/发布；
- **warning**：可保存，设计器需提示（如「loop 没有子节点不会生效」）。

### 0.4 表达式占位符约定

| 位置 | 写法 |
|---|---|
| `condition` / 校验规则 `expression` / 动作 `expression` / 数据源 `transform` / 生命周期钩子 | **直接写表达式**：`formData.amount > 100` |
| `props` 的值、数据源 `params` 的值、`loop` | **字符串占位**：`"$expr: formData.amount > 100"`（`loop` 两种写法均接受） |

---

## 1. Expr 协议（受限表达式）

事实源：`packages/expression/src/`。**零 `eval`、零 `new Function`**：自研 tokenizer → 递归下降 parser → AST 求值器。

### 1.1 语法能力

**运算符**（按优先级从低到高，常规 JS 语义）：

| 类别 | 运算符 |
|---|---|
| 三元 | `cond ? a : b`、箭头 `x => expr`（可作高阶函数参数） |
| 空值 | `??`（空值合并） |
| 逻辑 | `||`、`&&`、`!` |
| 比较 | `===`、`!==`、`==`、`!=`、`<`、`<=`、`>`、`>=` |
| 加减 | `+`、`-`（`+` 数值优先：一侧为数字则按数值相加，否则字符串拼接） |
| 乘除模 | `*`、`/`、`%` |
| 成员 | `.`、`[]`、可选链 `?.`（链式取值空值容错，不断错） |
| 调用 | `fn(a, b)`、方法调用 `obj.method()`（方法名过白名单，见 1.5） |

**字面量**：数字（含小数/科学计数）、字符串（单双引号，转义 `\n \r \t \\ \' \" \uXXXX`）、数组 `[1, 2]`、对象 `{ a: 1 }`、关键字 `true / false / null / undefined`。

### 1.2 明确禁止（词法层就不存在）

- **赋值**：没有单 `=` 运算符（`==`/`===` 是比较）——**表达式纯度铁律**，改表单值一律走 Action `setForm` 或生命周期 `app.setFormData`；
- 自增自减 `++` `--`、位运算 `& | ^ ~`、幂 `**`；
- 语句块 / 分号序列（一个表达式 = 一个值）；
- `eval` / `new Function` / `import` / `require` / `this`。

### 1.3 作用域（根变量）

求值 scope 的**顶层键固定**（渲染引擎 `context.ts` 构造）：

| 根变量 | 含义 | 示例 |
|---|---|---|
| `formData` | 当前页面表单数据（可写仅经 `ctx.set/patch`，不可经表达式） | `formData.amount` |
| `appData` | 应用级共享数据 | `appData.orgId` |
| `globalData` | 平台级共享数据 | `globalData.env` |
| `user` | 当前登录用户 | `user.name`、`user.dept` |
| `urlParams` | 路由参数 | `urlParams.id` |
| `ds` | 数据源状态**只读视图**（`ds.<id>.data / .loading / .error`） | `ds.dsList.data` |
| `app` | **受信 API，仅生命周期表达式可见**（详见第 11 章） | `app.setFormData({…})` |

> `props` / `condition` / `loop` / 校验规则 / `expression` 动作的求值作用域**不含 `app`** —— 渲染期表达式 100% 纯净，不会产生渲染期副作用。

**依赖提取**：`refs(expr)` 返回**根变量名集合**（如 `['formData']`）。联动粒度为**根变量级**（限制 L-1）：`formData.a` 变更会重算所有依赖 `formData` 的节点（宁多算不漏算）。

### 1.4 内置函数（37 个，`BUILTINS`）

| 分类 | 函数 |
|---|---|
| 字符串（11） | `len` `upper` `lower` `trim` `contains` `startsWith` `endsWith` `indexOf` `split` `replace` `str` |
| 数值（6） | `num` `abs` `ceil` `floor` `round` `fixed` |
| 日期时间（4） | `now` `today` `formatDate` `dateDiff` |
| 聚合（5） | `sum` `avg` `count` `min` `max` |
| 格式化（2） | `fmtMoney` `fmtPercent` |
| 结构（4） | `jsonParse` `jsonStringify` `keys` `values` |
| 逻辑（5） | `ifNull` `coalesce` `in` `notIn` `between` |

用法示例：`fmtMoney(formData.amount)`、`dateDiff(user.birthday, today(), 'year')`、`sum(ds.dsList.data, 'price')`。

### 1.5 方法白名单（对象方法调用）

只有白名单内方法可调用，且**按 receiver 类型自动选表**；表外方法一律抛错：

| receiver 类型 | 白名单 | 数量 |
|---|---|---|
| `Array` | `filter` `map` `reduce` `reduceRight` `find` `findIndex` `some` `every` `sort` `slice` `join` `includes` `indexOf` `lastIndexOf` `concat` `reverse` `flat` `fill` | **18** |
| `String` | `includes` `indexOf` `lastIndexOf` `startsWith` `endsWith` `slice` `substring` `split` `replace` `replaceAll` `toUpperCase` `toLowerCase` `trim` `trimStart` `trimEnd` `padStart` `padEnd` `repeat` `charAt` `charCodeAt` | **20** |
| `Number` | `toFixed` `toPrecision` | 2 |
| 普通对象 | `hasOwn` | 1 |
| 函数 | 无（不允许对函数调方法） | 0 |

### 1.6 安全模型

1. **`FORBIDDEN_KEYS`（19 项）**：`__proto__` `constructor` `prototype` `__defineGetter__` `__defineSetter__` `__lookupGetter__` `__lookupSetter__` `valueOf` `toString` `call` `apply` `bind` `eval` `Function` `globalThis` `window` `process` `require` `import`
   —— 成员**访问**与**调用**两个环节都检查，防原型链逃逸；**对受信对象同样生效**。
2. **受信对象 `markTrusted`**：只有被显式标记的对象（当前仅生命周期的 `app`）可绕过**方法白名单**；`FORBIDDEN_KEYS` 仍拦截。
3. **容错语义**（业务友好，不白屏）：
   - 未知标识符 → 返回 `undefined` + 回调 `onUnknownVar`（`@lc/expression` 的 `EvalOptions` 选项，可定位写错的字段名；渲染层暂未透传，见第 8 章注）；
   - `undefined.null` 链式取值 → `undefined`（不抛错）；
   - 渲染期表达式抛错 → 该节点 **`exprError: true`，默认可见**，回调 `onExprError`；
   - `condition` 求值为假 / `undefined` → 节点隐藏。
4. **安全用例**：`packages/expression/test/security.test.ts` 45 个用例（原型攻击 / 白名单 / 受信边界）。

### 1.7 校验接入

`validatePage(schema, { checkExpr })` 传入表达式检查器（服务端与设计器都注入 `checkExpr` from `@lc/expression`），对以下位置做**保存前语法检查**，失败报 `E_EXPR_SYNTAX`：

`condition` ｜ `loop`（先剥离 `$expr:` 前缀）｜ `expression` 类动作 `value` ｜ 数据源 `transform` ｜ 校验规则 `type=expression` ｜ 生命周期钩子（数组逐步检查，路径形如 `lifecycle.onInit[1]`）。

---

## 2. Page 协议（页面 + 节点树）

事实源：`packages/schema/src/types/page.ts` + `node.ts`。

### 2.1 PageSchema

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schemaVersion` | `string` | ✅ | 三段式，见第 9 章 |
| `id` | `string` | ✅ | 页面 id |
| `name` | `string` | ✅ | 展示名（缺失报 `W_PAGE_NAME`） |
| `type` | `'form' \| 'list' \| 'detail' \| 'portal' \| 'custom'` | ✅ | `list` 必须配 `list`（2.6）；`detail` 必须配 `detail`（2.7，Phase 2 批 2 起）；`portal` 可配 `portal`（2.9，Phase 3 批 4 起） |
| `meta` | 对象 | — | `icon / theme / pullDownRefresh / navigationBar{display,title,style}` |
| `root` | `NodeSchema` | ✅ | 组件树根节点 |
| `dataSources` | `DataSourceSchema[]` | — | 见 2.4 |
| `lifecycle` | `PageLifecycle` | — | 见 2.3 |
| `submit` | `PageSubmit` | — | `{ dataSourceId, successToast?, successAction? }`，`dataSourceId` 必须指向已声明数据源（`E_SUBMIT_DS_MISSING`） |
| `list` | `ListPageConfig` | `type=list` 时✅ | 见 2.6 |
| `detail` | `DetailPageConfig` | `type=detail` 时✅ | 见 2.7（**Phase 2 批 2 新增**，D-P2-2） |
| `portal` | `PortalPageConfig` | `type=portal` 时可选 | 见 2.9（**Phase 3 批 4 新增**，D-P3-11）；`type=portal` 但省略本字段 = 纯拖拽门户（合法） |
| `params` | `PageParam[]` | — | 路由参数 `{ name, required?, default? }`，name 不可重复 |
| `defaultFormData` | `Record<string, unknown>` | — | 表单初值 |

### 2.2 NodeSchema（组件树节点）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | **全局唯一**，发布后不可变（撤销重做 / 埋点 / diff 都依赖它） |
| `componentName` | `string` | 物料名，首字母大写 |
| `props` | `Record<string, unknown>` | 属性；值可为 `"$expr: …"` 占位（0.4）；表单控件的 `props.name` 是字段绑定名 |
| `style` | `NodeStyle` | **可视化配置白名单**：`margin padding background color borderRadius fontSize textAlign width height flex`（白名单外报 `W_STYLE_KEY`，禁止自由 CSS 文本，保证跨端一致） |
| `condition` | `string \| boolean` | 显隐表达式（或布尔），默认 true |
| `loop` | `string` | 循环数据表达式（可带 `$expr:` 前缀）；无子节点报 `W_LOOP_NO_TEMPLATE` |
| `loopArgs` | `[string, string]` | 迭代项/索引名，默认 `["item", "index"]` |
| `actions` | `Action[]` | 事件绑定，见第 3 章 |
| `perm` | `string` | 权限点（`/^[A-Za-z_][\w-]*$/`）；**无权限时整节点不渲染** |
| `children` | `NodeSchema[]` | 子节点（仅容器物料接受） |

> **校验规则的挂载位置**：表单控件的规则挂在 **`props.rules`**（`Rule[]`，设计器把 `material.defaultRules` 合并进 `props.rules`，运行时 `resolveNodeRules` 读取）；模型字段规则挂在 `FieldSchema.rules`（前后端双端执行）。**`NodeSchema` 本身没有 `rules` 字段。**

### 2.3 生命周期（`PageLifecycle`）

```jsonc
"lifecycle": {
  "onInit":  "app.setFormData({ applicant: user.name })",   // 构造完成后立即执行
  "onMount": ["app.loadDs('ds_dept')", "app.toast('已就绪')"], // 首次渲染前，数组 = 按序多步
  "onSubmit": null                                            // 提交校验通过后、写库前
}
```

- 钩子体 `LifecycleHook = string | string[]`（**第 3 批新增**）：数组按序执行，单步失败不阻断后续步骤，报告含 `step` 序号；
- 钩子内**可写字段**，但只能通过第 11 章的受信 `app` API，**不能赋值**（1.2）；
- 三钩子均在 `lifecycleScope` 求值（含 `app`）；渲染期表达式无 `app`。

### 2.4 数据源（`DataSourceSchema`）

| 字段 | 说明 |
|---|---|
| `id` / `name` | id 页面内唯一；name 缺失 `W_DS_NAME` |
| `type` | `http` / `model` / `static` / `formula`（`formula` 报 `W_DS_FORMULA`，Phase 2 支持） |
| `method` / `url` | 仅 `http`：`url` 必填（`E_DS_URL`），method 只能 `GET`/`POST`（`E_DS_METHOD`） |
| `modelId` | 仅 `model`：必填（`E_DS_MODEL`） |
| `data` | 仅 `static`：静态数据 |
| `params` | 请求参数，值可为 `"$expr: …"` 占位（渲染期解析，嵌套对象/数组递归） |
| `transform` | 取数后的转换表达式（纯函数，输入为原始响应） |
| `resultPath` | 取哪段数据作为结果，如 `data.list` |
| `cache` | `{ enable, ttl }`（ttl 秒） |
| `trigger` | `init`（onMount 自动发起）/ `manual`（动作触发）/ `watch:<字段>`（字段变更触发；缺字段名 `E_DS_TRIGGER`） |

### 2.5 校验规则（`Rule`，6 种）

```ts
{ type: 'required';    message? }                       // 必填
{ type: 'pattern';     value: string; message? }        // 正则（不合法报 E_RULE_PATTERN）
{ type: 'range';       min?; max?; message? }           // 数值区间
{ type: 'maxLength';   value: number; message? }        // 最大长度
{ type: 'expression';  value: string; message? }        // 自定义表达式（返回真 = 通过）
{ type: 'async';       dsId: string; message? }         // 异步数据源校验（如服务端查重）
```

- 挂载位置见 2.2 注（控件 `props.rules` / 模型 `FieldSchema.rules`），物料 `defaultRules` 由设计器合并进 `props.rules`；
- 运行时语义：默认**值变更即校验 + 提交全量校验**；隐藏字段（`condition=false` 子树不解算）不参与——限制 L-3。

### 2.6 列表页（`ListPageConfig`，`type=list` 必填）

`{ modelId ✅, filter?, sort?, columns?, cardTemplate?, pagination?, pullDown?, search?, detailPageId?, editable?, deletable? }`
—— 企业级最高频页面走配置化，无需拖拽。

| 字段 | 说明 |
|---|---|
| `modelId` | ✅ 必填数据模型（缺失报 `E_REQUIRED`） |
| `columns` | 展示字段；也作为**行内编辑**的可编辑字段（缺省 = 模型全部字段） |
| `editable` | 是否显示行「编辑」；缺省 `false`。点击后先 `GET records?filter={"id":rid}&size=1` 拉最新单条，展开复用详情页的内联编辑器；保存走 `PUT` 部分合并 + `If-Match` |
| `deletable` | 是否显示行勾选框、全选与批量删除；缺省 `false`。逐条串行 `DELETE`，每条都用该行 `revision` 构造 `If-Match`；409 保留该行，不自动覆盖/重试 |

> **实现状态（Phase 2 批 2 兑现，2026-10-14）**：`modelId / sort[0] / columns / pagination.size / search / detailPageId` 已由 `lc-list-page` 实现 —— records 查询（`page/size/sort` 透传）、列渲染**三级降级**（`columns` → 模型全部字段 → 记录首行键）、分页「加载更多」追加、搜索为**前端包含过滤**（`search.fields` 字段限定暂未区分）、点行跳 detail 页（`detailPageId` + `rid`）。**暂未实现**（运行时忽略，不报错）：`filter`（表达式过滤——服务端 records filter 仅等值）、`cardTemplate`（自定义卡片渲染，当前按「列名:值」行渲染）、`pullDown`（下拉刷新）、滚动触底加载（以按钮替代）。`root` 树在 list 页**运行时忽略**（画布仅占位）。校验：缺 `list` 或 `list.modelId` 报 `E_REQUIRED`。
>
> **列表写操作（Phase 4，2026-10-22）**：`editable` 行内编辑只覆盖 `columns`（缺省全部模型字段），保存前会重新拉取单条，避免列表行缺少字段或 `revision` 过期；409 保留草稿与编辑器，提示「本次保存未生效」，点「重新加载」后才用最新 `revision` 重挂载并重试；400 `RECORD_INVALID` 的 `errors[].path/message` 映射到字段错误。`deletable` 批量删除只对**当前可见行**全选，搜索变化会清理不可见行的选择；删除完当前页且仍有剩余数据时自动回到第一页；部分失败保留未删行与选择，刷新后可用最新 `revision` 重试。设计器属性面板提供「行内编辑 / 批量删除」复选框，未勾选写 `undefined`（协议缺省只读）。

### 2.7 详情页（`DetailPageConfig`，`type=detail` 必填）

`{ modelId ✅, fields?, backPageId?, editable?, deletable? }`
—— 由路由参数 `rid`（列表点行携带的记录主键）定位单条：`GET /models/:modelId/records?filter={"id":rid}&size=1`（服务端等值过滤，记录主键即 `id`）。

| 字段 | 说明 |
|---|---|
| `modelId` | ✅ 必填数据模型（缺失报 `E_REQUIRED` `detail.modelId`，与 2.6 对称） |
| `fields` | 展示字段（模型字段 key；数组顺序即展示顺序）；缺省 = 模型全部字段 |
| `backPageId` | 返回按钮的目标页 id；缺省 = 历史栈返回（壳层 `navigateBack`，栈底兜底回菜单不卡死） |
| `editable` | 是否在详情页显示「编辑」；缺省 `false`（存量详情页保持只读）。编辑只覆盖展示字段中非 `readonly` / 非 `auto` 的项，保存走 `PUT` 部分合并 + `If-Match` |
| `deletable` | 是否在详情页显示「删除」；缺省 `false`。二次确认后走 `DELETE` + `If-Match`，服务端软删 |

> **实现状态（Phase 2 批 2 新增，2026-10-14，D-P2-2）**：`lc-detail-page` 已全量兑现 `modelId / fields / backPageId`；展示名取模型定义，模型定义加载失败**降级用记录键**（错误不静默）；记录不存在红字可见。`root` 树同 list 页运行时忽略。**标准页跳转约定**：list/detail 页间跳转由组件 emit `navigate`/`back` 事件、壳层接 `uni` 导航 —— 协议**不新增 RuntimeHost 方法**（沿纯逻辑层分层，renderer 零 uni 依赖）。
>
> **记录编辑/删除（Phase 4，2026-10-22）**：`editable/deletable` 为显式开关（缺省只读）。详情页内联编辑器按字段类型使用 `switch / picker / textarea / input`；保存与删除均从记录响应体的 `revision` 构造 `If-Match`（uni 宿主不暴露响应头）。409 `VERSION_CONFLICT` **不自动覆盖、不自动重试**：保留草稿并提示「本次未生效」，用户点「重新加载」后才拉取最新版本；400 `RECORD_INVALID` 的 `errors[].path/message` 映射到字段级错误。保存/删除成功后 emit `saved`/`deleted`，runtime 列表页在 `onShow` 返回时重挂载刷新，避免列表残留旧行。设计器属性面板提供「允许编辑 / 允许删除」复选框。

### 2.8 完整最小示例

```jsonc
{
  "schemaVersion": "1.0.0",
  "id": "p_leave",
  "name": "请假申请",
  "type": "form",
  "root": {
    "id": "root",
    "componentName": "Page",
    "children": [
      { "id": "n_days", "componentName": "NumberInput",
        "props": { "name": "days", "label": "天数",
                   "rules": [{ "type": "range", "min": 1, "max": 30 }] },
        "condition": "formData.type === 'annual'",
        "actions": [
          { "event": "onChange", "type": "setForm", "value": { "reviewed": false } },
          { "event": "onBlur", "type": "toast", "value": { "text": "天数已记录", "icon": "none" } }
        ] }
    ]
  },
  "dataSources": [
    { "id": "ds_dept", "name": "部门", "type": "http", "method": "GET", "url": "/api/depts",
      "params": { "kw": "$expr: formData.kw" }, "trigger": "init" },
    { "id": "ds_submit", "name": "提交请假", "type": "http", "method": "POST", "url": "/api/leaves",
      "trigger": "manual" }
  ],
  "lifecycle": { "onInit": "app.setFormData({ applicant: user.name })" },
  "submit": { "dataSourceId": "ds_submit", "successToast": "提交成功" },
  "defaultFormData": { "type": "annual", "days": 1 }
}
```

> 注意：`app` 只在 `lifecycle` 内可见；`props` / `condition` / 动作的 `expression` 类型均拿不到 `app`（L-7），副作用请用 `toast` / `setForm` 等动作类型。

### 2.9 门户页（`PortalPageConfig`，`type=portal` 可选）

`{ title?, columns?, cards }` —— **卡片导航（配置化）+ 拖拽区（`root` 树）共存**：卡片区在上、`root` 树在下，一次配置即可拼出「首页导航 + 数据看板」。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | `string` | — | 门户标题；缺省用页面 `name` |
| `columns` | `number` | — | 卡片列数，缺省 `2`；运行时收敛到 1~4（避免脏值撑破布局） |
| `cards` | `PortalCard[]` | ✅ | 导航卡片；**可空数组**（= 纯拖拽门户，合法） |

`PortalCard`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | `string` | ✅ 卡片标题（缺失报 `E_REQUIRED`，path `portal.cards[i].title`） |
| `desc` | `string` | 副标题 / 说明 |
| `icon` | `string` | 图标（emoji 或图标名，纯展示） |
| `pageId` | `string` | 点击跳转的低代码页面 id（与 `url` 二选一） |
| `url` | `string` | 点击打开的外部地址（与 `pageId` 二选一；**仅 H5 生效**） |
| `badge` | `string` | 角标文案（如 `3` / `新`） |

**点击语义（不新增 RuntimeHost 方法，沿 2.7 的事件约定）**：

- `pageId` → 组件 emit `navigate` → 壳层 `uni.navigateTo('/pages/view/index?pageId=…')`；
- `url` → 组件 emit `open-url` → 壳层 `window.open`（MP 端忽略，不报错）；
- 两者都缺 → 卡片仅展示、不可点（不报错，允许「占位卡」）。

> **实现状态（Phase 3 批 4 新增，2026-10-20，D-P3-11）**：`packages/renderer/src/uni/lc-portal-page.vue` 已兑现三字段 + 卡片事件；`packages/runtime/src/pages/view/index.vue` 按 `schema.type === 'portal'` 分发到门户页并接 `onOpenUrl`；设计器属性面板「门户」区（`data-testid=portal-config / portal-title / portal-columns / portal-card-i`）可增删改卡片、切换页型为「门户」；`PageType` 增加 `portal`，但 **`isStdPage` 仍只含 list/detail**（门户的 `root` 树要渲染，不占位）。服务端冒烟：`node apps/server/scripts/smoke-p3b4.mjs`（13 项断言：落库回读 + 非法卡片 400 `SCHEMA_INVALID`）。**未做**：卡片拖拽排序 / 卡片内自定义物料 / 门户级数据源（卡片角标自动取数）——见 [`PLANS.md`](PLANS.md) §3。

---

## 3. Action 协议（15 种动作）

事实源：`packages/schema/src/types/node.ts` 的 `Action` 可辨识联合（`event` + `type` 判别）；执行器 `packages/renderer/src/core/action.ts`。

| # | `type` | `value` 形状 | 说明 |
|---|---|---|---|
| 1 | `expression` | `string`（表达式） | 求值执行（**无赋值**，作用域无 `app`） |
| 2 | `navigate` | `{ pageId, params?, mode? }` | `mode`: `push` / `redirect` / `switchTab` |
| 3 | `datasource` | `{ dsId, params? }` | 触发数据源取数 |
| 4 | `http` | `{ dsId, params? }` | 同上（http 类数据源） |
| 5 | `setForm` | `Record<string, unknown>` | 写表单字段（**表达式改值的唯一正道**，D-1） |
| 6 | `setApp` | `Record<string, unknown>` | 写应用级共享数据 |
| 7 | `toast` | `{ text, icon? }` | `icon`: `success` / `error` / `none` |
| 8 | `confirm` | `{ text, onOk?: Action }` | 模态确认，`onOk` 可嵌套动作 |
| 9 | `dialog` | `{ template: string }` | 弹窗（模板支持 `{{field}}`） |
| 10 | `submit` | `Record<string, unknown>?` | 触发页面提交链路（方案 7.2 五步） |
| 11 | `back` | `Record<string, unknown>?`（可选） | 返回上一页 |
| 12 | `copy` | `{ expr }` | 复制表达式结果到剪贴板 |
| 13 | `scan` | `Record<string, unknown>?`（可选） | 扫码 |
| 14 | `phone` | `{ expr }` | 拨号 |
| 15 | `location` | `Record<string, unknown>?`（可选） | 获取定位 |

**执行语义**（`runActions`）：

- 按 `event` 过滤（物料声明的事件名，如 `onClick` / `onChange`），**顺序执行**；默认失败中断，`continueOnError` 可配置为继续；
- 宿主能力缺失（如小程序无 `copy`）→ `{ ok: false, error: '当前环境不支持该操作' }` 并触发 `onUnsupported`，**不抛错**；
- 未知 `type` → `{ ok: false, error: '不支持的动作类型：<type>' }`，不抛错；
- **`submit` 透传提交结果**：`controller.submit()` 返回的 `{ ok, error }`（校验不过 / 提交数据源失败）原样进入 `ActionResult` —— 失败**不再恒 `ok:true`**（2026-10-12 修正，否则壳层无法把失败呈现给用户）；处理器未返回结果时视为成功（向后兼容）；
- 校验：`event` 必填；各类型 `value` 必填项缺失报 `E_ACTION_INVALID`；`datasource`/`http` 的 `dsId` 必须存在（`E_DS_MISSING`）。

---

## 4. Material 协议（物件）

事实源：`packages/schema/src/types/material.ts`。一个物料 = 一个 uni-app 组件 + 一份元信息。

| 字段 | 说明 |
|---|---|
| `name` | 与 `componentName` 一致，首字母大写（`E_MATERIAL_NAME`） |
| `title` / `icon` / `category` / `order` | 面板展示；`category` ∈ `basic / layout / form / data / nav / feedback / biz` |
| `isContainer` | 是否接受 `children` |
| `version` / `platforms` | 语义化版本；`platforms` ⊆ `H5 / MP-WEIXIN / MP-ALIPAY / APP`（默认全端） |
| `defaultProps` | 默认属性（必填） |
| `settings: SettingDesc[]` | **属性面板描述**，设计器据此自动生成 UI（必填数组） |
| `styleSettings` | 该物料开放的 `NodeStyle` 键子集 |
| `events` | 会 emit 的事件名清单（动作绑定候选项） |
| `supports` | `{ condition?, loop?, perm? }` 能力声明 |
| `hasField` | 是否需要绑定字段名（表单类 true；true 时 settings 应含 name 选择器 → `W_MATERIAL_FIELD`） |
| `defaultRules` / `actionTypes` | 默认校验规则 / 关联动作能力 |

**SettingDesc**：`{ key, label, setter, options?, placeholder?, help?, condition?, required? }`
**SetterType（13 种）**：`input textarea number switch select color slider optionList ruleEditor expression fieldPicker dataSourcePicker eventBinder`
—— `key` 支持路径：`'label'` → `node.props.label`；`'style.x'` → `node.style.x`；`'event'` → `node.actions`。

---

## 5. Model 协议（数据模型）

事实源：`packages/schema/src/types/model.ts`。企业级地基，首期 15 种字段类型。

**FieldType（15）**：`id string text number money boolean date datetime enum relation file user dept location json`

**FieldSchema 关键字段**：`key`（表单控件 `props.name` 必须命中它）/ `name` / `type` / `length` / `precision` / `required` / `unique` / `defaultValue` / `options`（enum 必填，`E_FIELD_ENUM`）/ `refModel`+`refField`（relation 必填，`E_FIELD_RELATION`）/ `maxCount`+`accept`（file）/ `auto`（`now`/`autoIncrement`）/ `readonly` / `placeholder` / `help` / `rules`（2.5，**前后端双端执行**）。

**ModelSchema**：`schemaVersion` / `id` / `name` / `code`（物理表名，小写下划线，`E_CODE_FORMAT`）/ `type`（`table`/`view`）/ `fields`（至少 1 个，`E_REQUIRED`；缺主键 `W_MODEL_NO_ID` 平台自动补）/ `indexes`（引用不存在字段报 `E_INDEX_FIELD`）/ `permissions`（CRUD → 角色数组）/ `dataScope`（`all / dept / deptAndChild / self`，行级数据权限）/ `formPageId` / `listPageId`。

---

## 6. App 协议（应用）

事实源：`packages/schema/src/types/app.ts`。一个 App = 页面 + 菜单 + 模型 + 流程 + 主题。

```jsonc
{
  "schemaVersion": "1.0.0",
  "id": "app_oa",
  "name": "OA 助手",
  "entry": { "type": "portal" },
  "menus": [
    { "id": "m1", "name": "请假", "type": "page", "pageId": "p_leave", "badge": "todo",
      "children": [] }
  ],
  "theme": { "primary": "#2b6de8", "radius": "8rpx", "dark": false },
  "pages": ["p_leave"],
  "models": ["m_leave"],
  "appData": { "orgId": null }
}
```

`AppMenuItem.type`：`page`（配 `pageId`）/ `portal` / `builtin`（配 `target`：`todoList` / `contacts` / `profile` …）/ `url`（配 `url`）；支持任意层级 `children`。

---

## 7. 校验与错误码全集

`validatePage(schema, opt)` / `validateMaterial` / `validateModel`，`ValidateOptions`：

| 选项 | 作用 |
|---|---|
| `materials: string[]` | 提供则校验 `componentName` 是否注册（不提供则跳过，如服务端不感知物料时） |
| `modelFields: string[]` | 提供则校验表单控件 `props.name` 是否命中模型字段（`W_FIELD_UNKNOWN`） |
| `checkExpr` | 提供则校验表达式语法（1.7） |
| `includeWarnings` | 默认 true |

**错误码（E = error 阻断，W = warning 提示）**：

| 分类 | 错误码 E_* | 警告码 W_* |
|---|---|---|
| 通用 | `E_REQUIRED` `E_DUPLICATE_ID` `E_EXPR_SYNTAX` `E_SCHEMA_VERSION` | `W_SCHEMA_OUTDATED` |
| 页面 / 节点 | `E_PAGE_TYPE` `E_PERM_FORMAT` `E_UNKNOWN_MATERIAL` | `W_PAGE_NAME` `W_LOOP_NO_TEMPLATE` `W_FIELD_UNKNOWN` `W_STYLE_KEY` |
| 数据源 / 提交 | `E_DS_MISSING` `E_DS_URL` `E_DS_METHOD` `E_DS_MODEL` `E_DS_TRIGGER` `E_SUBMIT_DS_MISSING` | `W_DS_NAME` `W_DS_DATA` `W_DS_FORMULA` |
| 动作 | `E_ACTION_INVALID` | — |
| 物料 | `E_MATERIAL_NAME` | `W_MATERIAL_TITLE` `W_MATERIAL_VERSION` `W_MATERIAL_FIELD` |
| 模型 | `E_CODE_FORMAT` `E_FIELD_ENUM` `E_FIELD_RELATION` `E_RULE_PATTERN` `E_INDEX_FIELD` | `W_FIELD_NAME` `W_MODEL_NO_ID` |

合计：**20 个错误码 + 13 个警告码**（与 `validate/index.ts` 同步，新增即更新本表）。

---

## 8. 运行时构造契约（`PageControllerOptions`）

事实源：`packages/renderer/src/core/controller.ts`。设计器 / uni 壳据此构造 `PageController`：

**数据与权限（非回调）**：

| 选项 | 说明 |
|---|---|
| `host: RuntimeHost` | **必填**，宿主能力注入（uni 端注入 `uni.*` 封装，测试注入 mock）；能力缺失时动作降级提示 |
| `user?` / `urlParams?` / `appData?` / `globalData?` | 表达式根作用域初值（1.3） |
| `hasPerm?: (perm) => boolean` | 权限判定；未提供视为全部有权限 |

**回调（埋点 / 调试 / 触发重渲染）**：

| 回调 | 触发时机 | 载荷 |
|---|---|---|
| `onHook` | 生命周期钩子执行报告（`HookReporter`） | `{ hook, ok, step?, error? }`（数组钩子带 `step`） |
| `onExprError` | 任何表达式求值抛错（含数据源 `ds:<id>` 错误） | `{ nodeId, expr, error }`（渲染期默认可见 + `exprError` 标记，不白屏） |
| `onLoopOverflow` | loop 展开超出上限（防渲染风暴） | `{ nodeId, limit, actual }` |
| `onDataSourceChange` | 数据源状态变化 | `(id, state)`，Vue 层据此触发重渲染 |
| `onActionResult` | 每个动作执行完毕 | `ActionResult`（埋点 / 调试） |
| `onUnsupported` | 动作类型或宿主能力缺失 | `(type)`，降级提示而非抛错 |

> **两个易混淆点**：① 「未知标识符 → `undefined`」的 `onUnknownVar` 是 `@lc/expression` 求值器的选项，**渲染引擎暂未透传**（渲染期统一走 `onExprError`）；② 字段变更对外无直接回调——联动与 `watch` 数据源由内部 `ctx.onFieldChange` 驱动，对外观测请用 `onActionResult`（`setForm`）/ `onDataSourceChange`。

---

## 9. 版本与迁移

| 规则 | 说明 |
|---|---|
| 当前版本 | `SCHEMA_VERSION = '1.0.0'` |
| 版本判定 | **高于当前** → `MigrationError('E_MIGRATION_UNKNOWN_VERSION')` 拒绝加载；**等于当前** → 直接使用；**低于当前** → 沿 `VERSION_HISTORY` 链找迁移函数逐级升级，**断档** → `MigrationError('E_MIGRATION_MISSING')`（D-5 语义，实现为抛错而非状态枚举） |
| 迁移入口 | `migrate(schema)`：加载任何 Schema 的第一步；只增不删、必有单测。失败错误码：`E_MIGRATION_INPUT` / `E_MIGRATION_NO_VERSION` / `E_MIGRATION_BAD_VERSION` / `E_MIGRATION_UNKNOWN_VERSION` / `E_MIGRATION_MISSING` / `E_MIGRATION_RESULT` |
| 降级提示 | `schemaVersion` 低于当前且未迁移 → `W_SCHEMA_OUTDATED` |

---

## 10. 服务端接口契约（REST，前缀 `/api/v1`）

事实源：`apps/server/src/`。**鉴权**：除 `GET /health`、`GET /ready`、`POST /auth/login`、`GET /files/:fileId`、`GET /openapi.json` 外全部要求 `Authorization: Bearer <JWT>`（HS256，8 小时）。密钥 `LC_JWT_SECRET` **生产必填且 ≥32 字符**；生产缺失/过短/使用仓库内置开发值会拒绝启动。跨域与限流见 §10.5。OpenAPI 文档见 §10.7。

### 10.1 接口清单

**运维探针（Phase 4 可观测性，无需登录）**

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| GET | `/health` | — | `200 { status: 'ok', storage: 'json'|'mysql', version, uptimeSeconds, timestamp }`（`version` 取 `LC_APP_VERSION`，默认 `0.1.0`） |
| GET | `/ready` | — | `200 { status: 'ok', storage, checks, timestamp }`；JSON 模式 `checks = { dataDir: 'ok' }`，MySQL 模式 `checks = { dataDir: 'ok', database: 'ok' }`；数据目录不可写或 `SELECT 1` 失败 → `503 { code: 'NOT_READY', message, storage, checks, timestamp }` |
| GET | `/openapi.json` | — | `200` OpenAPI 3.1.0 文档（`servers[0].url = /api/v1`，路径不含前缀）；**公开只读**、仍计入普通限流；响应带 `Cache-Control: public, max-age=300`。见 §10.7 |

> 两探针**不鉴权、不计入限流**；所有响应带 `X-Request-Id`（客户端合法值原样复用，否则生成 UUID）。访问日志默认 production 开启，单行 JSON 只含 `requestId/method/path/status/durationMs/ip/userAgent`，**不记 query、body、Authorization**；`LC_ACCESS_LOG=1/0` 可覆盖。

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | `200 { accessToken, tokenType: 'Bearer', expiresIn: 28800, user: { id, username, displayName, roles }, perms: string[] }`（**Phase 2 批 6 扩 `perms`**：用户全部角色的权限点并集、**含 `'*'` 通配**表示超级角色，见 10.5） |
| GET | `/auth/me` | — | `200 { user: { sub, username, roles } }` |
| GET | `/apps/bootstrap` | — | `200 { user: { sub, username, roles }, perms: string[], apps: [{ id, name, pages: [{ id, name, type, status, currentVersion, updatedAt }] }], theme? }`（启动聚合：用户 + **权限点** + 应用菜单 + **主题（批 3）**；无独立应用实体，应用按页面 `appId` 分组、`name` 即 `appId`；菜单只含页面元数据，打开页面再拉 Schema；**Phase 2 批 6：扩 `perms` + 菜单按 RBAC `canSeePage` 过滤** —— 无页面授权条目=全员可见，用户角色命中或 `'*'` 才下发该页；**Phase 3 批 3：顶层 `theme` 来自 `GET /apps/config`，无配置时缺键**） |
| GET | `/apps/config` | — | `200 { theme?: { primary?: '#RRGGBB', radius?: '12px', dark?: boolean } }`（**批 3 / D-P3-8**：应用配置读取，登录即可；无配置时无 `theme` 键；存储 `<DATA_DIR>/apps.json`） |
| PUT | `/apps/config` | `{ theme: { primary?, radius?, dark? } }`（**patch 语义**：缺键保留旧值、显式 `null` 清除该键） | `200 { theme }`（合并后的完整 theme；**仅 `'*'` 通配角色**，否则 `403 PERMISSION_DENIED`；校验失败 `400 APP_CONFIG_INVALID`：primary 须 `#RGB/#RRGGBBB`、radius 须如 `12px` 的 px 串、dark 须布尔、未知键拒绝） |
| POST | `/pages/validate` | `{ schema }` | `200 { valid, errors, warnings }`（**恒 200**，设计器渲染问题列表） |
| GET | `/pages` | — | `200 Array<{ id, appId, name, type, status, currentVersion, revision, versionCount, updatedAt, createdAt }>`（**页面列表（2026-10-20 补）**：轻量摘要、`updatedAt` **倒序**、同刻按 `id` 升序；**不含 `draft` / `versions` 全文** —— 换页请再调 `GET :id/schema`；可见性口径与 `GET /apps/bootstrap` 完全一致（无条目=全员可见，`'*'` 恒通）） |
| DELETE | `/pages/:id` | — | `200 { pageId, deleted: true, removedVersions: number }`（**删除页面（2026-10-20 补）**：草稿与**全部历史版本一并删除**、不可恢复；**仅 `'*'` 通配角色**，否则 `403 PERMISSION_DENIED`；不存在 `404 PAGE_NOT_FOUND`；`id` 非法 `400 INVALID_PAGE_ID`） |
| GET | `/pages/:id/schema?version=` | `version`: `draft`（默认）/ `published` / `vN` | 见 10.2；响应带页面行 `revision` 与 `ETag`；**页面可见性守卫（批 6）**：用户对页面无权限时 `403 PAGE_FORBIDDEN`（draft/published/vN 一视同仁，防直达绕过菜单） |
| PUT | `/pages/:id/schema` | `{ schema, appId? }`，可选 `If-Match` | `200 { pageId, status: 'draft', currentVersion, revision, updatedAt, validation: { valid: true, warnings } }`，响应带新 `ETag`；版本冲突 `409 VERSION_CONFLICT` |
| POST | `/pages/:id/publish` | `{ note? }`（≤500 字），可选 `If-Match` | `200 { pageId, status: 'published', version, revision, publishedAt, createdBy, note? }`，响应带新 `ETag` |
| POST | `/pages/:id/rollback` | `{ version: number }`（≥1 整数），可选 `If-Match` | `200 { pageId, status: 'draft', currentVersion, revision, rolledBackTo, updatedAt }`，响应带新 `ETag` |
| GET | `/pages/:id/versions` | — | `200 { pageId, status: 'draft' \| 'published', currentVersion, versions: Array<{ version, createdBy, createdAt, note? }> }`（**版本历史列表**，`versions` **倒序**且**不含 schema 全文** —— 查全文走 `GET :id/schema?version=vN`；Phase 2 批 5 / D-P2-8） |

**数据模型与业务记录（方案 8.3 动态 CRUD，Phase 1 落地）**

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| GET | `/models` | — | `200 Array<{ id, name, code, type?, fieldCount, updatedAt }>`（按 `updatedAt` 倒序）。**勘误 2026-10-20**：原文写作 `{ items: [...] }`，与实现及前端 `listModels()` 消费形状不符，实现返回裸数组 |
| GET | `/models/:id` | — | `200` `ModelSchema` + `{ createdAt, updatedAt, createdBy, updatedBy }`；不存在 `404 MODEL_NOT_FOUND` |
| PUT | `/models/:id` | `ModelSchema`（**upsert**：不存在即建档） | `200` 定义体 + 审计字段 + `validation: { valid: true, warnings }` |
| POST | `/models/:modelId/records` | 业务字段对象 | `200 { ...payload, id, revision, createdAt, updatedAt, createdBy, updatedBy }`，响应带 `ETag` |
| GET | `/models/:modelId/records` | `?filter=&sort=&page=&size=`（见 10.4） | `200 { items, total, page, size }`（每项含 `revision`；软删记录不返回） |
| PUT | `/models/:modelId/records/:rid` | **部分**字段（合并后整体再校验），可选 `If-Match` | `200` 合并后的完整记录（含新 `revision`）；版本冲突 `409 VERSION_CONFLICT` |
| DELETE | `/models/:modelId/records/:rid` | 可选 `If-Match` | `200 { id, deleted: true, deletedAt, revision }`（**软删**，列表不再返回） |

**文件（方案 8.3）**

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| POST | `/files/upload` | `multipart/form-data`，字段名 **`file`**，需 Bearer | `200 { fileId, url, name, size, mimeType }`，其中 `url = /api/v1/files/<fileId>` |
| GET | `/files/:fileId` | — | `200` 文件字节（`Content-Type` 取上传时的 `mimeType`）；**公开读取，不校验令牌** |

> `GET /files/:fileId` 不挂鉴权的原因：`<image src>` / `uni.uploadFile` 拉取静态资源无法携带 `Authorization` 头，文件 url 视为公开只读（企业内网 Phase 1 可接受；对接 OSS 签名直传属 Phase 2）。**上传仍需登录**，超 10MB 由 multer 拦截为 `413`（`LIMIT_FILE_SIZE`）。

**权限 RBAC（Phase 2 批 6，D-P2-10/11）**

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| GET | `/rbac/roles` | — | `200 { roles: [{ key, name, perms }], pages: { [pageId]: string[] } }`（**全量配置读**：角色列表 + 页面授权映射；`pages` 无条目 = 该页全员可见） |
| PUT | `/rbac/roles/:key` | `{ name, perms }`（upsert：不存在即建） | `200 { key, name, perms }`；`perms` 逐项须匹配权限点格式（`[a-z][a-z0-9_]*`，或通配 `'*'`），非法项 `400 INVALID_REQUEST` |
| PUT | `/rbac/pages/:pageId` | `{ roles: string[] }`（upsert） | `200 { pageId, roles }`；**空数组 = 删除该页授权条目 → 恢复全员可见**；`pageId` 不符白名单 `400 INVALID_PAGE_ID` |

- 鉴权沿全局约定（Bearer），且三接口**要求管理员**（权限点含 `*`）；普通账号返回 `403 ADMIN_REQUIRED`。
- **判定落点**（单一事实源 `RbacService`）：页面级 = `GET /pages/:id/schema` 403 + bootstrap 菜单过滤；按钮级 = 节点 `perm` 字段与会话 `perms` 匹配，不匹配**整节点不渲染**（渲染层语义，见 12.1）；模型 CRUD = `ModelSchema.permissions[action]` 声明则角色交集否则 `403 PERMISSION_DENIED`（records 四接口）；行级 = `ModelSchema.dataScope`（records 查询链强制，`'*'` 豁免）。
- **存储**：JSON 模式为 `<LC_DATA_DIR>/rbac.json` 单文件（原子写）；MySQL 模式为 `roles` + `rbac_page_grants`（用户→角色在 `user_roles`）。两种实现共用种子配置：`roles = [{ key:'admin', name:'平台管理员', perms:['*'] }, { key:'designer', name:'设计器用户', perms:[] }]`、`pages = {}`（MySQL 空库读取时兜底，持久化由 `seed:mysql` 或首次 `save` 完成）。
- **用户→角色映射**：Phase 1 内存种子不变（admin→`['admin']`、designer→`['designer']`），用户管理 UI 不在本批（D-P2-12 裁剪项）。

**流程审批（Phase 3 批 1，D-P3-1 轻量状态机，方案 8.6）**

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| GET | `/flows` | — | `200 { flows: FlowSchema[] }` |
| GET | `/flows/:flowId` | — | `200` `FlowSchema`；不存在 `404 FLOW_NOT_FOUND` |
| PUT | `/flows/:flowId` | `FlowSchema`（**upsert**，路径 id 与 `body.flowId` 须一致） | `200` 定义体；校验未过 `400 INVALID_FLOW`（附 `issues`/`warnings` —— `validateFlow` + `checkExpr` 同源） |
| DELETE | `/flows/:flowId` | — | `204`（**只删定义，实例保留审计**）；不存在 `404 FLOW_NOT_FOUND` |
| GET | `/flows/tasks/todo` | — | `200 { items: [{ taskId, instanceId, flowId, flowName, modelId, recordId, nodeName, createdBy, createdAt }] }`（当前用户待办：running 实例**当前节点** pending 任务且 assignee 命中，`createdAt` 倒序） |
| GET | `/flows/instances?recordId=&modelId=` | 两参数均可选 | `200 { items: FlowInstance[] }`（**Timeline 时间轴数据源**：含 `tasks` + `history`，新实例在前；无过滤 = 全量，内部数据量小；读取时补偿未完成的 `pendingPatch`） |
| GET | `/flows/instances/:instanceId` | 路径参数 | `200 FlowInstance`（单实例全量：`tasks` + `history`，**待办详情页数据源**，2026-10-16 批 2 补；读取时补偿未完成的 `pendingPatch`；响应带 `ETag`）；不存在 `404 { code: 'FLOW_INSTANCE_NOT_FOUND' }` |
| POST | `/flows/instances/:instanceId/tasks/:taskId` | `{ action: 'approve' \| 'reject', comment? }`，可选 `Idempotency-Key`（1~128 字符） | `200` 推进后的 `FlowInstance`，响应带新 `ETag`（审批人不命中 `403 TASK_FORBIDDEN`、非 running `400 FLOW_NOT_RUNNING`、非当前 pending `400 FLOW_TASK_STALE`、任务/实例不存在 `404`；并发推进 `409 FLOW_CONFLICT`；同一键重放返回当前实例；同键改任务/动作/意见/审批人 `409 IDEMPOTENCY_KEY_REUSED`） |

- **提交联动**：`POST /models/:modelId/records` 成功后按 `modelId` 匹配定义**自动启动实例**并推进到首个审批节点（**弱保证**：启动失败只记日志、不影响记录提交 —— 记录是业务真相）。
- **推进语义**：`start` 自动通过（history 记 `start` / 驳回重入记 `reenter`）；`approve` 在 `mode=condition` 且 `condition` 求值为假时**跳过**（求值异常按 `true` 走审批，fail-open 防漏审），否则创建 pending 任务停下等审批；到达 `end` → 实例 `approved` 并应用 `onApprove.setField`；`reject` 有 `onReject` 则回退到目标节点、无则实例 `rejected` 终态。
- **assignee 命中（单一事实源 `FlowService.canDecide`）**：`starter` = 实例发起人；`role` = 用户角色命中 **或 RBAC perms 含 `'*'` 超级豁免**；`dept` 首期无组织服务**不可命中**（与批 6 dataScope dept 降级同口径）。
- **setField 回写**：服务端内部直写记录 payload（**不经表单 sanitize** —— 8.6 `status: approved` 回写语义）；顺序 = **先 CAS 落实例（写入 `pendingPatch` outbox）、再 CAS 回写记录、最后清空 outbox**。记录写失败或进程退出时，后续 GET 实例 / 列表 / 审批会补偿（见 10.6）。
- **存储**：JSON 模式为 `<LC_DATA_DIR>/flows.json`（定义）+ `flow-instances.json`（实例，只追加与就地更新，不删），原子写同 rbac.json；MySQL 模式为 `flow_definitions` / `flow_instances`。`FlowInstance` 形状 = `{ id, flowId, modelId, recordId, status: running\|approved\|rejected, currentNodeId, createdBy, createdAt, updatedAt, revision, pendingPatch?, tasks[], history[] }`，history `action` ∈ `start\|approve\|reject\|skip\|end\|reenter`。

**运维事件（Phase 3 批 5，D-P3-12：埋点 / 错误 / 性能）**

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| POST | `/ops/events` | `{ events: OpsEventInput[] }`（**1~50 条**） | `200 { accepted, total, dropped }`（`accepted` = 本次入库条数；`total` = 落库后总条数；`dropped` = 因超过 500 上限被淘汰的旧事件数；结构非法 `400 OPS_INVALID`） |
| GET | `/ops/events?type=&pageId=&since=&limit=` | 四参数均可选；`type` ∈ `error\|perf\|event`；`since` 为 ISO 时间；`limit` 默认 50 上限 200 | `200 { items: OpsEvent[], total }`（**新 → 旧**；`total` 为过滤后总数） |
| GET | `/ops/summary?pageId=&since=` | 两参数均可选 | `200 { total, byType: { error, perf, event }, errors: { total, lastAt }, perf: { count, avgMs, p95Ms, maxMs }, lastAt }`（`perf` 按 `durationMs` 升序取 **p95 = 第 ⌈n×0.95⌉ 个**；无样本时全 0 / `lastAt: null`） |

`OpsEventInput`（写入）/ `OpsEvent`（读回）：

```ts
{ type: 'error' | 'perf' | 'event', name: string /* ≤64 */,
  pageId?: string, pageVersion?: number | 'draft',
  source?: 'runtime' | 'designer' | 'server',      // 缺省 'runtime'
  message?: string,                                 // error 必填
  durationMs?: number,                              // perf 必填，[0, 600000]
  detail?: Record<string, unknown> }
// 读回额外有：id（`evt_<uuid>`）、userId（令牌 sub）、at（服务端 ISO 时间）
```

- **鉴权取舍：写开放、读收紧**。写 = 登录即可（任何用户都会产生错误/性能事件，要求管理员令牌会丢现场）；读 `GET /ops/events`、`GET /ops/summary` = **仅 `'*'` 通配角色**，否则 `403 PERMISSION_DENIED`。
- **身份与时间服务端权威**：`userId` 取令牌 `sub`、`at` 取服务端时间；客户端传入的同名字段被忽略（防冒充/伪造时序）。
- **校验策略**：结构性错误 `400 OPS_INVALID`（`type`/`name` 缺失或非法、`pageId` 白名单、`pageVersion` 非负整数或 `'draft'`、`source` 枚举、`detail` 非对象、`perf` 缺 `durationMs`、`error` 缺 `message`、条数越界）—— message 汇总最多 3 处且带 `events[i]` 下标；**数据性超限只截断不报错**（`message` > 500 截断加 `…`；`detail` 序列化 > 2000 → 存 `{ truncated: true, preview }`）。
- **存储与保留**：`<LC_DATA_DIR>/ops/events.json` 单文件 `{ version: 1, events: [] }` 原子写（临时文件 + rename）；**环形上限 500 条**（新入队后从头部丢最旧）；文件损坏时改名备份并视为空表（埋点不阻塞业务）。

### 10.2 版本语义（对应方案 8.4 双表模型）

```
pages(id, app_id, name, type, current_version, status, revision)
page_versions(page_id, version, schema, created_by, created_at, note)
data_records(model_id, id, payload, revision, ...)
flow_instances(id, ..., status, revision, pending_patch_json)
      ↑ 发布即插入一条；回滚 = 把某条 version 复制为新的 current draft（需再发布才生效）
```

- `status`：`published` = 草稿已全部发布；`draft` = 存在未发布改动（首次 PUT 自动建档也是 `draft`）；
- `GET ?version=draft` → `{ version: 'draft', schema, revision, updatedAt, updatedBy }`；
- `GET ?version=published|vN` → `{ version: number, schema, revision, createdAt, createdBy, note }`；
- **历史不可变**：回滚只改草稿，`currentVersion` 不回退，旧版本始终可读；
- **`revision`**：页面行级乐观锁，行从 `0` 起，首次保存草稿即 `1`（建档本身算一次写），之后每次成功写（保存/发布/回滚）**单调 +1**；读取响应同时用 `ETag: "page:<id>:<revision>"` 暴露。记录与流程实例同规则，但**创建响应为 `0`**，ETag 前缀分别为 `record:<modelId>/<recordId>:<n>`、`flow:<instanceId>:<n>`。
- 写接口的 `If-Match` **可选**：旧客户端不带仍可写，服务端仍用请求开始读到的 `revision` 做 CAS，避免「读→写」窗口丢更新；一旦携带，`If-Match` 与当前 `revision` 不等即 `409 VERSION_CONFLICT`，响应体含 `expectedRevision` / `currentRevision`。格式非法（空串、非本资源 ETag、非数字）→ `400 INVALID_IF_MATCH`。
- **并发实现**：JSON 模式用进程内 `KeyedLock` 串行化同一资源的「读→判版本→写」，只保证单进程；MySQL 模式用 `UPDATE ... WHERE revision = ?` 行级 CAS，多实例安全。JSON 多实例部署不在支持范围（文件仓储本身也不支持共享目录并发写）。
- 存储实现：`LC_STORAGE=json`（默认）为 `<LC_DATA_DIR>/pages/<id>.json` 原子写；`LC_STORAGE=mysql` 使用 Prisma + MySQL 的 `pages` / `page_versions` 双表（ADR-008）。接口 `PageRepository` 不变。

### 10.3 服务端错误码

HTTP 状态 + 业务 `code`（错误体形如 `{ code, message, errors? }`）：

| 状态 | code | 场景 |
|---|---|---|
| 400 | `INVALID_REQUEST` | 字段缺失/类型错（登录入参、note、rollback version、请求体非对象、`body.id` 与路径 id 不一致、`Idempotency-Key` 空或 >128 字符） |
| 400 | `INVALID_IF_MATCH` | `If-Match` 非空但格式非法：不是本资源的 `"<kind>:<id>:<revision>"`、revision 非非负整数 |
| 400 | `INVALID_PAGE_ID` | 页面 id 不符合白名单 |
| 400 | `INVALID_VERSION` | `?version=` 不是 draft/published/vN |
| 400 | `SCHEMA_INVALID` | **Schema 校验未通过，附完整 `errors`/`warnings`** |
| 400 | `INVALID_MODEL_ID` / `INVALID_RECORD_ID` | 模型 id / 记录 id 不符合白名单（防路径穿越，与页面 id 同规则） |
| 400 | `MODEL_INVALID` | **模型定义校验未通过，附 `errors`/`warnings`**（与 `SCHEMA_INVALID` 形状对齐） |
| 400 | `INVALID_QUERY` | `filter`/`sort`/`page`/`size` 非法（未知字段、坏 JSON、方向错、`size` 超 100 等）；物料市场（批 40）`status`/`category`/`kind`/`q` 非法 |
| 400 | `RECORD_INVALID` | **记录校验未通过，附 `errors`**（sanitize → 类型 → 规则三步） |
| 400 | `INVALID_FLOW` | **流程定义（批 1）**：`validateFlow` 未通过（附 `issues`/`warnings`）或路径 `flowId` 与 `body.flowId` 不一致 |
| 400 | `FLOW_NOT_RUNNING` | 对已终态（approved/rejected）实例执行审批动作 |
| 400 | `FLOW_TASK_STALE` | 任务非当前 pending（已处理或已被驳回重入的新任务替代） |
| 400 | `APP_CONFIG_INVALID` | **应用配置写入（批 3）**：`PUT /apps/config` theme 校验未通过（附 issues 拼接 message：非法 hex / 非 px 串 / 非布尔 / 未知配置项 / theme 非对象） |
| 400 | `OPS_INVALID` | **运维事件（批 5）**：`POST /ops/events` 批量结构非法（条数 1~50、`type`/`name`/`pageId`/`pageVersion`/`source`/`detail` 形状、`perf` 缺 `durationMs`、`error` 缺 `message`）或 `GET /ops/events` 的 `type`/`since`/`limit` 非法；message 带 `events[i]` 定位（**数据超长不触发本码，走截断**） |
| 400 | `WEBHOOK_INVALID` | **Webhook 配置（批 39）**：`POST/PUT /webhooks` 入参校验失败（未知字段、name/url/events/secret/active/maxAttempts/timeoutMs 非法、`events` 为空或 `'*'` 与其他事件混用、URL 非 http(s)/含账号口令/生产指向内网）；`errors[]` 汇总全部问题 |
| 400 | `MARKET_MATERIAL_INVALID` | **物料市场（批 40）**：创建/编辑/审核/安装入参校验失败（未知字段、id/name/version/kind/category/component/meta 非法、`kind=meta` 带 `component`、驳回未填 note、安装版本非 semver）；`errors[]` 逐项定位 |
| 400 | `TENANT_INVALID` | `X-LC-Tenant` 不是 1~64 位小写字母/数字/连字符，或首字符非字母数字 |
| 401 | `UNAUTHORIZED` | 无/坏/过期令牌、Authorization 头格式错 |
| 401 | `INVALID_CREDENTIALS` | 用户不存在或口令错（**同一错误码防枚举**） |
| 403 | `PAGE_FORBIDDEN` | **页面可见性守卫（批 6）**：`GET /pages/:id/schema` 用户角色不在该页授权（`pages` 有条目且未命中、也无 `'*'`）；无条目 = 全员可见不触发 |
| 403 | `PERMISSION_DENIED` | **模型 CRUD 守卫（批 6）**：`ModelSchema.permissions[action]` 已声明且用户角色不在交集（无 `'*'`）；records 四接口按 create/read/update/delete 分别强制；**应用配置写入（批 3）**：`PUT /apps/config` 用户 perms 不含 `'*'`；**运维事件读取（批 5）**：`GET /ops/events` / `GET /ops/summary` 用户 perms 不含 `'*'` |
| 403 | `ADMIN_REQUIRED` | **Webhook 管理（批 39）**：9 个 `/webhooks*` 接口均要求用户 perms 含 `'*'`；普通登录用户（如 designer）访问管理面时返回本码，不返回配置或密钥。**物料市场（批 40）**：物料创建/编辑/提交/审核/发布/下架/版本历史均要求 `'*'`；普通用户显式按 `status` 筛选目录也返回本码 |
| 403 | `TASK_FORBIDDEN` | **流程审批动作（批 1）**：当前用户非任务 assignee（role 未命中且无 `'*'`、非发起人、dept 降级不可命中） |
| 404 | `PAGE_NOT_FOUND` / `DRAFT_NOT_FOUND` / `VERSION_NOT_FOUND` | 页面/草稿/版本不存在 |
| 404 | `MODEL_NOT_FOUND` / `RECORD_NOT_FOUND` / `FILE_NOT_FOUND` | 模型未建档 / 记录不存在或已软删 / 文件不存在 |
| 404 | `FLOW_NOT_FOUND` / `FLOW_INSTANCE_NOT_FOUND` / `FLOW_TASK_NOT_FOUND` | 流程定义 / 实例 / 任务不存在（批 1） |
| 404 | `WEBHOOK_NOT_FOUND` / `WEBHOOK_DELIVERY_NOT_FOUND` | Webhook 订阅 / 投递记录不存在（批 39）；删除订阅后投递日志仍保留在存储中，但当前投递日志接口仍要求订阅存在，需运维直接查库或后续补管理入口 |
| 404 | `MARKET_MATERIAL_NOT_FOUND` | 物料不存在；或草稿/待审/驳回/下架物料对普通用户不可见（批 40） |
| 404 | `MARKET_INSTALL_NOT_FOUND` | 卸载时该租户未安装该物料（批 40） |
| 409 | `NOT_PUBLISHED` | 取 `published` 但从未发布 |
| 409 | `NO_DRAFT` | 发布时没有草稿 |
| 409 | `VERSION_CONFLICT` | **乐观锁冲突**：页面保存/发布/回滚或记录更新/删除时，`If-Match` 或服务端读到的 `revision` 已过期；响应含 `expectedRevision` / `currentRevision`（记录另含 `modelId`） |
| 409 | `FLOW_CONFLICT` | **流程实例并发冲突**：审批推进时实例 `revision` CAS 失败（另一请求已先推进），客户端应重新 GET 实例后再决定 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | **审批幂等键复用**：同一 `Idempotency-Key` 已用于同实例的其他任务，或同一任务但动作/意见/审批人不同；相同内容的重放返回 `200` 当前实例，不报此错 |
| 409 | `DELIVERY_PENDING` | **Webhook 手动重投（批 39）**：投递仍为 `pending` 且 `nextAttemptAt` 在当前时间之后，说明自动重试尚未到期；响应带 `nextAttemptAt`，客户端应稍后再试 |
| 409 | `MARKET_MATERIAL_EXISTS` | 创建物料时 id 已存在（批 40） |
| 409 | `MARKET_STATE_CONFLICT` | 物料当前状态不允许该动作（如编辑 pending、发布 draft、审核 draft），响应带 `currentStatus`（批 40） |
| 409 | `MARKET_VERSION_EXISTS` | 同一 `materialId + version` 已发布过；需提升 `version` 后重新提交审核（批 40） |
| 409 | `MARKET_NOT_PUBLISHED` | 安装非 `published` 物料，响应带 `currentStatus`（批 40） |
| 409 | `MARKET_VERSION_MISMATCH` | 安装/升级请求版本不等于当前发布版本，响应带 `publishedVersion`；不允许静默升降级（批 40） |
| 503 | `MARKET_SIGNING_UNCONFIGURED` | 生产环境未配置 `LC_MATERIAL_MARKET_PRIVATE_KEY`，清单与公钥接口不可用（批 40） |
| 413 | （multer `LIMIT_FILE_SIZE`） | 文件超 10MB；Nest 包装为 413，**无业务 `code`** |

**记录/模型校验的 `errors[]` Issue 码**（由服务端产生，与页面校验共用同一 `Issue` 形状；页面侧全集见第 7 章）：

| Issue 码 | 产生点 |
|---|---|
| `E_FIELD_KEY` | 模型：字段 key 格式非法或占用系统保留名（`id/createdAt/updatedAt/createdBy/updatedBy/deletedAt`） |
| `E_FIELD_TYPE` | 模型：`type` 不在 15 种白名单内；记录：值与 `FieldSchema.type` 不符（含枚举越界） |
| `E_FIELD_LENGTH` | 记录：字符串超出 `field.length` 上限 |
| `E_REQUIRED` | 模型：`fields` 为空；记录：`required: true` 且值为空（模型级必填，页面层不感知） |
| `E_RULE_FAILED` | 记录：`pattern` / `range` / `maxLength` 等规则未通过（`required` 规则仍出 `E_REQUIRED`） |
| `E_EXPR_SYNTAX` | 模型：`expression` 规则**保存前语法检查**（`checkExpr`，与页面保存同源） |
| `E_SCHEMA_VERSION` | 模型：`schemaVersion` 非三段 semver（`validateModel` 不查版本，服务端补） |
| `E_CODE_FORMAT` / `E_DUPLICATE_ID` 等 | 模型定义经 `validateModel`（@lc/schema）产出，与第 7 章同源 |
| `E_FLOW_*` | 流程：`validateFlow`（@lc/schema，批 1）产出 —— 结构 `E_FLOW_START_POS`/`E_FLOW_END_POS`/`E_FLOW_APPROVE_MISSING`/`E_FLOW_NODE_ID`/`E_FLOW_ONREJECT_REF`、字段 `E_FLOW_ID`/`E_FLOW_NAME`/`E_FLOW_MODEL`/`E_FLOW_MODE`/`E_FLOW_ASSIGNEE`/`E_FLOW_CONDITION`/`E_FLOW_ONAPPROVE`；表达式仍 `E_EXPR_SYNTAX`；dept 降级 / linear 忽略 condition 等为 warning `W_FLOW_*`（不拦截保存） |

### 10.4 记录查询语义（`GET /models/:modelId/records`）

方案 B（JSON 文件存储）为「全量读出 → 内存过滤/排序/分页」；Phase 2 升方案 A 后换成自动 SQL，**接口形状不变**。

| 参数 | 格式 | 语义 |
|---|---|---|
| `filter` | URL 编码的 JSON 对象，如 `{"age":22}` | **等值匹配且严格类型**（`20` 命中、`"20"` 不命中；`null` 匹配 `null`/缺省）；多键为 **AND**；键必须是「声明字段 ∪ 系统字段」，值只支持标量/`null` |
| `sort` | `field:asc` \| `field:desc`（方向缺省 `asc`） | 单字段排序；**不传默认 `createdAt:desc`**；空值（`null`/`undefined`）恒排末尾 |
| `page` | 正整数，默认 `1` | 越界返回空 `items`（`total` 仍为过滤后总数） |
| `size` | 正整数，默认 `20`，**上限 `100`** | 超限 → `400 INVALID_QUERY`（`size 取值 1~100`） |

- **系统字段**（可参与 `filter`/`sort`，但**不可出现在写入 payload**）：`id` `revision` `createdAt` `updatedAt` `createdBy` `updatedBy`；`revision` 为乐观锁版本号（新建 `0`，每次更新/软删 `+1`），响应中的每条记录都带；
- **软删**：`DELETE` 只置 `deletedAt`，列表默认排除，记录再读/再改/再删均 `404 RECORD_NOT_FOUND`；`deletedAt` 不作为查询字段暴露；
- **审计字段服务端权威**：请求体伪造 `createdAt/createdBy/revision` 无效（保存时覆盖）。

### 10.5 安全与限流（Phase 4 安全加固）

| 项 | 契约 |
|---|---|
| JWT 密钥 | `LC_JWT_SECRET` ≥32 字符；`NODE_ENV=production` 未设置/过短/等于仓库内置开发值 → 启动失败（exit 1）。非生产未设置才回退开发密钥并打印警告 |
| CORS | `LC_CORS_ORIGINS` 逗号分隔的完整源；拒绝 `*`、路径、查询、凭据、非 http(s)。生产未设置=不发送 `Access-Control-Allow-Origin`；开发默认放行 `localhost:5173` / `127.0.0.1:5173` / `localhost:5174` / `127.0.0.1:5174` |
| 普通限流 | 默认 600 次/分钟/IP；窗口 `LC_RATE_LIMIT_WINDOW_MS`，上限 `LC_RATE_LIMIT_MAX` |
| 登录限流 | `POST /auth/login` 默认 20 次/分钟/IP（成功与失败都计数）；上限 `LC_LOGIN_RATE_LIMIT_MAX` |
| 超限响应 | `429 { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' }`；响应头 `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`，超限加 `Retry-After`（秒） |
| 代理 | `LC_TRUST_PROXY=true` 启用 Express `trust proxy`（仅一层），按 `X-Forwarded-For` 识别客户端 IP；直接暴露时保持 false，防伪造 |
| 预检 | `OPTIONS` 不计入限流 |
| 健康探针 | `GET /health` / `GET /ready` 不鉴权、不计入限流；`/ready` 在 JSON 模式检查 `LC_DATA_DIR` 可创建/可写，MySQL 模式同时执行 `SELECT 1` |
| 请求 ID | 所有响应带 `X-Request-Id`；合法客户端值（`[A-Za-z0-9._-]{8,128}`）复用，否则生成 UUID |
| 访问日志 | production 默认开启，`LC_ACCESS_LOG` 可覆盖；单行 JSON，不记录 query/body/Authorization |

> 当前限流为**单进程内存计数**；多副本部署需换 Redis 等共享存储。安全实现与验证见 [`OPERATIONS.md`](OPERATIONS.md) 附录 A；探针/日志/部署见附录 B 与 §6。

**存储模式（Phase 4 第一批）**

| `LC_STORAGE` | 数据位置 | 适用 |
|---|---|---|
| `json`（默认） | `<LC_DATA_DIR>/pages / models / data / rbac.json / flows.json / flow-instances.json / ops/events.json / apps.json / files/ / webhooks.json / webhook-deliveries.json / market.json` + 内存用户种子 | 单测、无 MySQL 的 CI、本地快速演示 |
| `mysql` | MySQL 8：`users / roles / user_roles / pages / page_versions / models / data_records / rbac_page_grants / flow_definitions / flow_instances / ops_events / app_config / files / webhook_subscriptions / webhook_deliveries / webhook_delivery_archives / market_materials / market_material_versions / market_installs`（19 表） | 本地联调、生产；需 `DATABASE_URL` |

- `mysql` 模式启动期校验连接串；`/ready` 额外检查数据库。开发用户由 `seed:mysql` 写入，JSON 数据可由 `import:json-to-mysql` 幂等导入。
- **所有业务仓储均有 JSON / MySQL 双实现**（含流程、运维事件、应用配置、文件）；跨仓储仍无分布式事务，流程 setField 用 `pendingPatch` 补偿（10.6）。详见 [ADR-008](DECISIONS.md#adr-008) / [ADR-009](DECISIONS.md#adr-009) / [ADR-010](DECISIONS.md#adr-010) / [ADR-011](DECISIONS.md#adr-011)。

### 10.6 乐观锁、审批幂等与流程 outbox（Phase 4，ADR-011）

**① ETag / If-Match**

| 资源 | 响应 ETag | 接受 `If-Match` 的写接口 |
|---|---|---|
| 页面 | `"page:<pageId>:<revision>"` | `PUT /pages/:id/schema`、`POST /pages/:id/publish`、`POST /pages/:id/rollback` |
| 记录 | `"record:<modelId>/<recordId>:<revision>"` | `PUT/DELETE /models/:modelId/records/:rid`（创建响应也给 ETag） |
| 流程实例 | `"flow:<instanceId>:<revision>"` | 审批接口**不**使用 `If-Match`，走 `Idempotency-Key`；GET/审批响应给 ETag 供缓存/诊断 |

- `If-Match` 接受带引号或 `W/` 前缀的单个 ETag；多个逗号值、空串、其他资源 id 均 `400 INVALID_IF_MATCH`。
- **不携带 `If-Match` 仍兼容**：服务端读取当前 `revision` 后以该值做 CAS，请求内不会静默丢更新；并发请求只有一个成功，其余 `409 VERSION_CONFLICT`。
- 冲突响应示例：`409 { code: 'VERSION_CONFLICT', expectedRevision: 3, currentRevision: 4 }`；记录另带 `modelId`。
- 页面/记录 ETag 同时覆盖写响应；记录列表逐项返回 `revision`，不设置单条 ETag（HTTP 响应头只能有一个）。

**② `Idempotency-Key`（仅审批动作）**

- 格式：去空格后 1~128 字符；非法 → `400 INVALID_REQUEST`。作用域 = **单个流程实例**。
- 首次成功审批时，键与 `action` / `comment` / `decidedBy` 一起记入任务；重放（同实例 + 同任务 + 同动作/意见/审批人）直接 `200` 返回当前实例，**不重复推进、不重复写历史、不重复回写记录**。
- 同键但任务/动作/意见/审批人不同 → `409 IDEMPOTENCY_KEY_REUSED`。
- 终态重放优先于 `FLOW_NOT_RUNNING`：最后一次审批的响应丢失后重试，仍返回 `200` 当前实例，而不是误报「流程已结束」。
- 不带键的旧客户端保持原行为：重复审批仍由 `FLOW_TASK_STALE` / `FLOW_NOT_RUNNING` 拒绝。待办审批物料会在同一动作重试时复用键（动作或意见变化才换新键）。

**③ 流程 `pendingPatch` outbox**

1. 审批到达 `end` 时，先在实例 CAS 中写入 `pendingPatch = { status: 'approved', ... }`，实例进入终态；
2. 再对记录做 CAS 回写（按记录当前 `revision`，冲突则重读重试）；
3. 成功后清空 `pendingPatch`；若记录写失败或进程在 1~2 之间退出，实例保留 outbox；
4. 之后任意 `GET /flows/instances`、`GET /flows/instances/:id` 或审批请求会先补偿 outbox，再返回/推进。

语义为**至少一次**回写：`setField` 是幂等赋值（同一字段同一值重复写无副作用），不会因补偿产生重复业务记录。实例先落终态、记录后回写，因此短暂窗口内可能看到「流程已通过但记录字段尚未更新」；补偿会收敛，前端不应把该窗口当作失败。

**④ 边界与现状**

- JSON 仓储锁是**单进程**的；多副本部署必须用 `LC_STORAGE=mysql`（行级 CAS）。文件仓储也不适合多实例共享目录并发写。
- 设计器已携带 `If-Match` 保存/发布/回滚；**业务记录已有前端编辑/删除入口**（详情页 `detail.editable/deletable` 显式开启，PUT/DELETE 均从记录 `revision` 构造 `If-Match`，409 保留草稿并要求重新加载；删除为服务端软删）。列表页在从详情返回的 `onShow` 重挂载刷新。
- 本批未实现自动重试中间件；`Idempotency-Key` 的重放由调用方（待办审批物料）在同一次用户动作内复用。

### 10.7 OpenAPI 文档（Phase 4 开放集成第一批）

| 项 | 契约 |
|---|---|
| 端点 | `GET /api/v1/openapi.json`（公开只读，无需 JWT；仍计入普通限流） |
| 版本 | OpenAPI **3.1.0**；`servers = [{ url: '/api/v1' }]`，`paths` 不含全局前缀 |
| 鉴权声明 | 顶层 `security: [{ bearerAuth: [] }]`；公共接口显式 `security: []`（health / ready / openapi.json / auth/login / files/{fileId} / materials/manifest / materials/manifest/key） |
| 覆盖 | 当前 **64 条**实际路由；含页面/记录/流程/Webhook/物料 `If-Match`、审批 `Idempotency-Key`、错误体与 304/409/413/429/503 响应 |
| 缓存 | `Cache-Control: public, max-age=300` |
| 实现 | `apps/server/src/open/openapi.ts`（构建器）+ `open.controller.ts` / `open.module.ts` |
| 防漂移 | `apps/server/test/openapi.test.ts` 反射 Nest 路由元数据，路径/方法少一条或多一条即失败；并校验 `operationId` 唯一、路径参数完整、`$ref` 可解析、公共接口鉴权 |
| 使用 | 可导入 Swagger UI / Apifox / Postman / OpenAPI Generator；详细说明见 [`openapi.md`](openapi.md) |

> 本批只交付机器可读文档，不内置 Swagger UI 页面。Webhook 共 11 条管理接口已纳入文档；远程物料市场为设计器侧受信元数据闭环（见 [`material-market.md`](material-market.md)），服务端市场 API 仍属后续批次。

### 10.8 Webhook 订阅、签名投递与重试（Phase 4 开放集成生产化）

Webhook 用于把业务写操作与流程状态变化推送给外部系统。设计取舍：**订阅与投递日志分表**、**事件先落盘再由 worker 发送**、**HMAC 签名 + 至少一次投递**；Webhook 故障不得影响记录/流程主链路。生产化补齐：**多副本租约**、**订阅级限流**、**投递归档**、**DNS 级 SSRF**、**轮换宽限期**、**验签/重放工具**。

**① 管理接口（11 条，全部 Bearer + `'*'`）**

设计器顶栏「Webhook 集成」提供完整管理 UI：订阅 CRUD、自定义头、限流、测试投递、日志分页过滤、指标告警、密钥轮换与清理归档；所有写操作回传 `If-Match`，409 不自动覆盖。

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| GET | `/webhooks` | — | `200 { items: WebhookSubscriptionView[] }`（`updatedAt` 倒序；secret 脱敏为 `secretPreview`） |
| POST | `/webhooks` | `{ name, description?, url, events, secret?, headers?, rateLimitPerMinute?, active?, maxAttempts?, timeoutMs? }` | `200` 新建订阅 + **完整 `secret`（仅此一次）**，响应带 `ETag: "webhook:<id>:<revision>"` |
| GET | `/webhooks/:id` | — | `200 WebhookSubscriptionView`，响应带 `ETag`；不存在 `404 WEBHOOK_NOT_FOUND` |
| PUT | `/webhooks/:id` | 上述字段的子集（**patch 语义**，`description: null` 清除；不接受 `secret`），可选 `If-Match` | `200` 更新后的订阅 + 新 `ETag`；非法 `400 WEBHOOK_INVALID`，冲突 `409 VERSION_CONFLICT` |
| DELETE | `/webhooks/:id` | 可选 `If-Match` | `200 { id, deleted: true }`；**投递日志保留**；不存在 / 冲突同上 |
| POST | `/webhooks/:id/rotate-secret` | 可选 `If-Match`；`{ graceSeconds?: 0~604800 }`（默认 86400） | `200` 订阅视图 + **新完整 `secret`**；旧密钥在宽限期内额外签 `X-LC-Signature-Previous`，rev +1 |
| POST | `/webhooks/:id/test` | — | `200 WebhookDelivery`（同步发送一次；事件类型固定 `webhook.test`，`source: 'test'`，可绕过 `active=false` 与订阅限流） |
| GET | `/webhooks/:id/deliveries?status=&eventType=&page=&size=` | `status` ∈ `pending\|success\|failed`；`eventType` 为已知投递事件；`page` 默认 1；`size` 默认 20、上限 100 | `200 { items, total, page, size }`（`createdAt` 倒序，同刻按 id 倒序）；**订阅删除后仍可查** |
| POST | `/webhooks/deliveries/:deliveryId/retry` | 可选 `If-Match`（投递 ETag） | `200 WebhookDelivery`（**同步重投一次**）；未到自动重试时间 `409 DELIVERY_PENDING`；不存在 `404 WEBHOOK_DELIVERY_NOT_FOUND` |
| GET | `/webhooks/metrics` | — | `200 WebhookMetrics`（队列/成功率/24h 失败率/积压年龄 + `alerts[]` + `ok`） |
| POST | `/webhooks/maintenance/cleanup` | — | `200 { archived }`；先归档再删除过期终态日志 |

- **管理员边界**：非 `'*'` 用户 403 `ADMIN_REQUIRED`（不是 `PERMISSION_DENIED`）；管理接口不向普通用户暴露 URL/密钥/投递体。
- **乐观锁**：订阅 ETag `"webhook:<id>:<revision>"`，投递 ETag `"webhook-delivery:<id>:<revision>"`。写接口不带 `If-Match` 仍兼容，但服务端用读到的 revision 做 CAS；携带且不匹配立即 `409 VERSION_CONFLICT`，**不自动覆盖、不自动重试**。
- **密钥**：创建时可自带 16~128 字符 `secret`，否则服务端生成 32 字节随机十六进制（64 字符）；列表/详情只返回 `secretPreview`（前 4 + `…` + 后 4）。轮换只走专用接口，避免普通更新把密钥带入日志/表单。宽限期旧密钥预览为 `previousSecretPreview`，到期后不再附带旧签名。
- **字段约束**：`name` 1~64；`description` ≤500；`url` ≤2048；`events` 非空、最多 20 项、去重；`headers` 最多 20 组、键名小写、值 ≤1024 且禁止换行；`rateLimitPerMinute` 0~6000（0 = 不限）；`active` 默认 `true`；`maxAttempts` 1~10 默认 5；`timeoutMs` 1000~30000 默认 10000。未知字段直接拒绝（`WEBHOOK_INVALID`）。
- **自定义请求头**：订阅可配置 `Authorization` 等业务头；`Host`、`Content-Length`、`Transfer-Encoding`、`Connection`、`Upgrade`、`TE`、`Trailer`、`Proxy-*` 与所有 `X-LC-*` 为系统保留，禁止覆盖。发送时先铺自定义头，再用系统头覆盖，确保签名/事件头不可伪造。

**② 订阅模型与事件**

```ts
WebhookSubscriptionView = {
  id: string, name: string, description?: string,
  url: string, events: string[],
  headers: Record<string, string>, rateLimitPerMinute: number,
  active: boolean, maxAttempts: number, timeoutMs: number,
  revision: number, createdBy: string, updatedBy: string,
  createdAt: string, updatedAt: string,
  secretPreview: string,
  previousSecretExpiresAt?: string, previousSecretPreview?: string
}
```

| 事件 `type` | 触发点 | `data` 主要字段 |
|---|---|---|
| `record.created` | 记录创建成功后 | `modelId, recordId, record`（`record` 为含 id/revision/审计字段的扁平记录） |
| `record.updated` | 记录更新 CAS 成功后 | `modelId, recordId, record` |
| `record.deleted` | 记录软删成功后 | `modelId, recordId, deletedAt, revision` |
| `flow.started` | 流程实例启动并完成 start 自动推进后 | `instanceId, flowId, modelId, recordId, status, revision` |
| `flow.task.approved` | 审批动作成功、记录回写补偿后 | `instanceId, flowId, modelId, recordId, taskId, nodeId, nodeName, action, comment?, status, revision` |
| `flow.task.rejected` | 驳回动作成功、记录回写补偿后 | 同上（`action: 'reject'`） |
| `flow.completed` | 实例进入 `approved` 终态 | `instanceId, flowId, modelId, recordId, status, revision` |
| `flow.rejected` | 实例进入 `rejected` 终态 | 同上 |
| `webhook.test` | **仅** `POST /webhooks/:id/test` | `message, subscriptionId`；不可被订阅 |

- `events` 支持 `'*'` 订阅全部业务事件；`'*'` 必须单独使用，不能与具体事件混用。
- 事件信封固定为：

```json
{
  "id": "e0d1c2b3-...",
  "type": "record.created",
  "occurredAt": "2026-10-22T12:00:00.000Z",
  "actor": "admin",
  "data": { "modelId": "m_order", "recordId": "r_001", "record": { "id": "r_001" } }
}
```

- 同一事件投递给多个订阅时，`event.id` 相同、每条投递的 `X-LC-Delivery` 不同；接收方应按事件 id 或投递 id 做**幂等**。
- 删除/停用订阅不会取消已入队的历史投递：worker 发现订阅不存在或已停用，会把该投递标为 `failed`（测试投递不受停用影响）。

**③ 投递请求与签名**

每次投递为 `POST <subscription.url>`，`Content-Type: application/json; charset=utf-8`，body 是事件信封的**原始 JSON 字节**。请求头：

| 头 | 值 |
|---|---|
| `X-LC-Signature` | `t=<unix 秒>,v1=<hex hmac>` |
| `X-LC-Signature-Previous` | 轮换宽限期内存在；同一 `<t>` 用旧密钥签名 |
| `X-LC-Event` | 事件类型（含 `webhook.test`） |
| `X-LC-Delivery` | 投递记录 id（每次尝试不变） |
| `X-LC-Subscription` | 订阅 id |
| `X-LC-Timestamp` | 同 `t`，便于直接读取 |
| `User-Agent` | `lowcode-webhook/1.0` |

签名算法：`v1 = HEX(HMAC-SHA256(secret, "<t>.<原始 JSON body>"))`。服务端导出 `apps/server/src/webhook/webhook.verify.ts`，包含**时间窗（默认 300s）**、常量时间比较、旧密钥回退与 `WebhookReplayCache`（默认 10 分钟、容量 10000）。Node 校验示例：

```ts
import { verifyWebhookSignature, WebhookReplayCache } from './webhook.verify.js'

const result = verifyWebhookSignature({
  secret: process.env.WEBHOOK_SECRET!,
  previousSecret: process.env.WEBHOOK_SECRET_PREVIOUS,
  rawBody,
  header: req.headers['x-lc-signature'] as string | undefined,
  toleranceSeconds: 300,
})
if (!result.ok) return res.status(401).end(result.reason)
const replay = new WebhookReplayCache()
if (replay.checkAndRemember(req.headers['x-lc-delivery'] as string)) return res.status(409).end('replay')
```

- 签名覆盖**原始 body**，接收方必须在 JSON 解析前保留原始字符串；重新序列化会改变签名。
- 服务端不校验接收方返回体，只读取最多 2KB 作为日志摘要；2xx 视为成功，`3xx` 不跟随（`redirect: 'manual'`）且按失败处理。
- 多副本接收方应把 `WebhookReplayCache` 替换为 Redis `SET NX EX`，键建议用 `event.id` 或 `X-LC-Delivery`。

**④ 重试、状态与 worker**

- 成功：HTTP `2xx` → `status: 'success'`。
- 可重试：网络错误、超时、`408`、`425`、`429`、`5xx`，且 `attemptCount < maxAttempts` → `pending`，按 `5s / 30s / 2min / 10min` 退避（之后保持 10min）。
- 不可重试：其余 `4xx`（如 400/401/403/404）或达到 `maxAttempts` → `failed`，不自动再试。
- 每次尝试都追加到 `attempts`：`{ attempt, at, ok, status?, durationMs, responseBody?, error? }`；顶层同时保留最后一次的 `responseStatus/responseBody/error`。
- 手动重投：要求投递已 `success/failed` 或已到重试时间；重置 `attemptCount = 0`、清空最后一次错误字段，但**保留历史 `attempts`**，同步发送一次。重投前后各 +1 revision，因此响应 revision 可能比原值大 2。
- 后台 worker 默认每 5s 扫描到期 `pending`（单批最多 20 条）；`LC_WEBHOOK_WORKER=off` 关闭，`LC_WEBHOOK_WORKER_INTERVAL_MS` 调整间隔（最小 1000ms）。`NODE_ENV=test` 不启动定时器，测试直接调用 `dispatchDue()` / `dispatchDelivery()`。
- **多副本租约**：claim 时写入 `leaseOwner` + `leaseExpiresAt`（默认 90s，`LC_WEBHOOK_LEASE_MS`）。MySQL 使用 `FOR UPDATE SKIP LOCKED` 原子领取；JSON 模式用文件锁 + 单写者。租约未过期的投递不会被其它副本发送；worker 崩溃后租约到期可被重新领取。保存投递结果时 JSON/MySQL 都以 `leaseOwner` 做 CAS，旧 worker 不能覆盖新 worker 的结果，因此投递语义仍是**至少一次**，接收方必须按 `event.id` / `X-LC-Delivery` 幂等。
- **订阅级限流**：`rateLimitPerMinute` 非 0 时，worker 统计最近 60s 内该订阅的已尝试投递数；达到上限就把当前投递的 `nextAttemptAt` 延后 5s，不消耗尝试次数、不发请求。手动测试投递与手动重投不受限流影响。
- **清理归档**：默认保留 30 天（`LC_WEBHOOK_RETENTION_DAYS`），只处理 `success/failed` 终态日志；先写归档再删除。`dispatchDue()` 每轮异步触发维护，但按 `LC_WEBHOOK_CLEANUP_INTERVAL_MS`（默认 1h）节流；也可 `POST /webhooks/maintenance/cleanup` 手动执行。

**⑤ SSRF、指标与存储**

- URL 只允许 `http/https`，拒绝内嵌账号口令；`NODE_ENV=production` 默认拒绝 `localhost`、`.local/.internal`、回环/私网/链路本地/保留地址。内网集成需显式 `LC_WEBHOOK_ALLOW_PRIVATE=1`。
- **DNS 级 SSRF**：发送前对主机名做 `dns.lookup(all)`，任一解析结果落入私网/保留网段即拒绝；实际 `fetch` 前再做一次解析，降低 DNS rebinding 窗口。所有解析结果都必须通过检查，不能只取第一条。
- 不跟随重定向（`redirect: 'manual'`）；响应体最多读取 2KB 作为摘要；默认超时由订阅 `timeoutMs` 控制。
- **指标告警**：`GET /webhooks/metrics` 返回队列深度、24h 成功/失败、失败率、最老待投递年龄；阈值由 `LC_WEBHOOK_ALERT_FAILURE_RATE`（默认 0.2）、`LC_WEBHOOK_ALERT_QUEUE_DEPTH`（默认 100）、`LC_WEBHOOK_ALERT_PENDING_AGE_MS`（默认 15 分钟）控制。任一超限 `ok=false` 并在 `alerts[]` 给出中文原因。
- JSON 模式：`<LC_DATA_DIR>/webhooks.json`（订阅）、`webhook-deliveries.json`（投递）、`webhook-delivery-archive.json`（归档），均临时文件 + rename 原子写，`KeyedLock` 串行化；多进程 worker 通过文件锁互斥。
- MySQL 模式：`webhook_subscriptions` / `webhook_deliveries` / `webhook_delivery_archives`（迁移 `20261023090000_webhook_hardening`）；订阅写操作走 `revision` CAS，投递按 `nextAttemptAt + createdAt` 扫描并用 `FOR UPDATE SKIP LOCKED` 领取。
- 删除订阅不级联删除投递日志；`GET /webhooks/:id/deliveries` 不再校验订阅是否存在，删除后仍可按订阅 id 查历史日志。密钥、投递体、响应摘要属敏感数据：管理接口只对 `'*'` 开放，日志查询不返回密钥；归档文件/表需按数据保留策略单独授权。

### 10.9 物料市场（Phase 4 开放集成第三批）

| 方法 | 路径 | 鉴权 | 契约 |
|---|---|---|---|
| GET | `/materials/manifest` | 公开 | `200 { alg, signature, manifest }`，`ETag` + `Cache-Control: public, max-age=60`；`If-None-Match` 命中 `304`；未配置签名私钥 `503 MARKET_SIGNING_UNCONFIGURED` |
| GET | `/materials/manifest/key` | 公开 | `200 { alg, publicKey, fingerprint, kid }`；公钥非秘密 |
| GET | `/materials` | Bearer | `200 { items }`；普通用户只见 `published`，管理员可按 `status/category/kind/q` 筛选 |
| POST | `/materials` | Bearer + `*` | `200 MarketMaterial` + `ETag`；重复 id `409 MARKET_MATERIAL_EXISTS` |
| GET | `/materials/:id` | Bearer | `200`；未发布物料对普通用户 `404 MARKET_MATERIAL_NOT_FOUND` |
| PUT | `/materials/:id` | Bearer + `*`，可选 `If-Match` | 仅 `draft/rejected/unpublished`；编辑后回到 `draft` 并清空审核结论 |
| POST | `/materials/:id/submit` | Bearer + `*`，可选 `If-Match` | `draft/rejected/unpublished → pending` |
| POST | `/materials/:id/review` | Bearer + `*`，可选 `If-Match` | `{ decision: 'approve' \| 'reject', note? }`；`reject` 必须填 `note` |
| POST | `/materials/:id/publish` | Bearer + `*`，可选 `If-Match` | 仅 `approved → published`；固化版本快照，重复版本 `409 MARKET_VERSION_EXISTS` |
| POST | `/materials/:id/unpublish` | Bearer + `*`，可选 `If-Match` | `published → unpublished`，清单立即移除 |
| GET | `/materials/:id/versions` | Bearer + `*` | `200 { items }`，发布快照倒序 |
| GET | `/materials/installs` | Bearer + `X-LC-Tenant` | `200 { items }`，只返回当前租户 |
| PUT | `/materials/installs/:materialId` | Bearer + `X-LC-Tenant`，可选 `If-Match` | `{ version }` 必须等于当前发布版本；未发布 `409 MARKET_NOT_PUBLISHED`，版本不一致 `409 MARKET_VERSION_MISMATCH` |
| DELETE | `/materials/installs/:materialId` | Bearer + `X-LC-Tenant`，可选 `If-Match` | `200 { tenantId, materialId, removed: true }`；未安装 `404 MARKET_INSTALL_NOT_FOUND` |

状态机：`draft → pending → approved/rejected → published → unpublished`；`rejected/unpublished` 可重新编辑回 `draft`。

- **签名**：ES256（P-256/SHA-256），签名原文 `canonicalJson(manifest)`；Node 输出 `dsaEncoding: 'ieee-p1363'` 的 raw `r||s`，base64 放入 `signature`；
- **清单稳定性**：只含 `published` 物料，按 id 升序；`generatedAt = max(updatedAt)`（空市场 `1970-01-01T00:00:00.000Z`），内容不变时 ETag/签名稳定；
- **组件白名单**：`kind=component` 的 `component` 必须命中 `@lc/schema` 的 `BUILTIN_COMPONENT_IDS`；`kind=meta` 禁止带 `component`；
- **租户**：`X-LC-Tenant` 必须匹配 `^[a-z0-9][a-z0-9-]{0,63}$`（缺省 `default`）；服务端只校验格式，成员关系由网关/身份提供方保证；
- **乐观锁**：物料 `"material:<id>:<rev>"`，安装 `"material-install:<tenantId>/<materialId>:<rev>"`；`If-Match` 不匹配 `409 VERSION_CONFLICT`，不自动覆盖；
- **存储**：JSON `<LC_DATA_DIR>/market.json`（`{ materials, versions, installs }`）；MySQL `market_materials` / `market_material_versions` / `market_installs`，发布在事务内完成 CAS + 快照插入；
- **安全边界**：服务端只托管元数据，不接收、不构建、不分发远程 JS；客户端依旧不下载、`eval`、动态 `import` 远程代码。

## 11. 生命周期受信 API（`app.*`）

**作用域边界**：仅在 `onInit` / `onMount` / `onSubmit` 的求值上下文中注入（`createLifecycleScope`），并经 `markTrusted` 标记——绕过**方法白名单**但**不绕过 `FORBIDDEN_KEYS`**（19 项照拦）。

| 方法 | 说明 |
|---|---|
| `app.setFormData({ a: 1, b: 2 })` / `app.setFormData('a', 1)` | 写表单字段（两种签名都支持；触发联动 + 单字段校验） |
| `app.getFormData('a.b')` | 读字段（支持路径） |
| `app.setAppData({ k: v })` / `app.setAppData('k', v)` | 写应用级共享数据 |
| `app.loadDs('ds_dept', params?)` | 触发数据源取数；作为钩子**顶层调用会被 await** |
| `app.toast(text, icon?)` | 轻提示（默认 `none`） |
| `app.navigate(pageId, params?, mode?)` | 跳转（默认 `push`） |
| `app.back()` | 返回上一页 |
| `app.confirm(text)` | 模态确认，返回 `Promise<boolean>` |

**约定**：

- 钩子数组形式逐步执行，单步失败**不阻断**后续步骤（报告带 `step`）；
- 异步方法请作为**整个钩子表达式的顶层调用**（如 `"app.loadDs('ds_x')"`），不要嵌进算术表达式；
- 渲染期（`props`/`condition`/`loop`/规则/`expression` 动作）**看不到 `app`**，副作用一律走第 3 章动作类型（限制 L-7）。

---

## 附录 A：可直接运行的校验示例

```ts
import { validatePage } from '@lc/schema'
import { checkExpr } from '@lc/expression'

const result = validatePage(pageSchema, { checkExpr })
if (!result.valid) console.table(result.errors) // { code, severity, path, message }
```

服务端等价 REST 调用：

```http
POST /api/v1/pages/validate
Authorization: Bearer <token>
Content-Type: application/json

{ "schema": { … } }
→ 200 { "valid": false, "errors": [{ "code": "E_EXPR_SYNTAX", … }] }
```

## 附录 B：本文件与实现的同步规则

1. **结构改动**（新增/修改字段、类型）：先改 `packages/schema/src/types/*.ts` → 补 `validate` 规则与测试 → 更新本文件对应字段表 → 按第 9 章决定是否升 `schemaVersion`；
2. **语义改动**（容错、白名单、错误码）：改实现 + 测试 → 更新第 1 / 7 / 10 章对应表格；
3. **数字类结论**（内置函数数、白名单数、动作数、错误码数）：**必须以运行时实测为准**（如 `Object.keys(BUILTINS).length`），禁止凭印象写入（本文件 v1.0 编写时即因此勘误了台账中的 51/16/21 等错误数字，见台账 B-17）；
4. 每批交付在 `docs/PROGRESS.md` 记录本文件的变更点。
