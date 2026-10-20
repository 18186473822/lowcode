# 低代码平台协议规范（protocol.md）

> 版本：**v1.0** ｜ 对应 `schemaVersion`: **1.0.0** ｜ 编写日期：2026-09-29 ｜ **第 10 章修订：2026-10-10**（补方案 8.3 动态 CRUD 9 个接口、记录查询语义 10.4、服务端错误码 11 → 19；**协议结构 0~9 章未变，故不升 `schemaVersion`**）｜ **第 2 章修订：2026-10-14**（Phase 2 批 2 新增 `PageSchema.detail?: DetailPageConfig` + 2.7 节 + 2.6 实现状态注记；**可选字段新增，向后兼容，不升 `schemaVersion`**，D-P2-2）｜ **第 2 章修订：2026-10-20**（Phase 3 批 4 新增 `PageSchema.portal?: PortalPageConfig` + 2.9 节；**可选字段新增，向后兼容，不升 `schemaVersion`**，D-P3-11）｜ **第 10 章修订：2026-10-20**（Phase 3 批 5 新增 `POST/GET /ops/events` + `GET /ops/summary` + `OPS_INVALID`；**纯服务端接口，协议结构未变，不升 `schemaVersion`**，D-P3-12）
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

`{ modelId ✅, filter?, sort?, columns?, cardTemplate?, pagination?, pullDown?, search?, detailPageId? }`
—— 企业级最高频页面走配置化，无需拖拽。

> **实现状态（Phase 2 批 2 兑现，2026-10-14）**：`modelId / sort[0] / columns / pagination.size / search / detailPageId` 已由 `lc-list-page` 实现 —— records 查询（`page/size/sort` 透传）、列渲染**三级降级**（`columns` → 模型全部字段 → 记录首行键）、分页「加载更多」追加、搜索为**前端包含过滤**（`search.fields` 字段限定暂未区分）、点行跳 detail 页（`detailPageId` + `rid`）。**暂未实现**（运行时忽略，不报错）：`filter`（表达式过滤——服务端 records filter 仅等值）、`cardTemplate`（自定义卡片渲染，当前按「列名:值」行渲染）、`pullDown`（下拉刷新）、滚动触底加载（以按钮替代）。`root` 树在 list 页**运行时忽略**（画布仅占位）。校验：缺 `list` 或 `list.modelId` 报 `E_REQUIRED`。

### 2.7 详情页（`DetailPageConfig`，`type=detail` 必填）

`{ modelId ✅, fields?, backPageId? }`
—— 由路由参数 `rid`（列表点行携带的记录主键）定位单条：`GET /models/:modelId/records?filter={"id":rid}&size=1`（服务端等值过滤，记录主键即 `id`）。

| 字段 | 说明 |
|---|---|
| `modelId` | ✅ 必填数据模型（缺失报 `E_REQUIRED` `detail.modelId`，与 2.6 对称） |
| `fields` | 展示字段（模型字段 key；数组顺序即展示顺序）；缺省 = 模型全部字段 |
| `backPageId` | 返回按钮的目标页 id；缺省 = 历史栈返回（壳层 `navigateBack`，栈底兜底回菜单不卡死） |

> **实现状态（Phase 2 批 2 新增，2026-10-14，D-P2-2）**：`lc-detail-page` 已全量兑现三字段；展示名取模型定义，模型定义加载失败**降级用记录键**（错误不静默）；记录不存在红字可见。`root` 树同 list 页运行时忽略。**标准页跳转约定**：list/detail 页间跳转由组件 emit `navigate`/`back` 事件、壳层接 `uni` 导航 —— 协议**不新增 RuntimeHost 方法**（沿纯逻辑层分层，renderer 零 uni 依赖）。

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

> **实现状态（Phase 3 批 4 新增，2026-10-20，D-P3-11）**：`packages/renderer/src/uni/lc-portal-page.vue` 已兑现三字段 + 卡片事件；`packages/runtime/src/pages/view/index.vue` 按 `schema.type === 'portal'` 分发到门户页并接 `onOpenUrl`；设计器属性面板「门户」区（`data-testid=portal-config / portal-title / portal-columns / portal-card-i`）可增删改卡片、切换页型为「门户」；`PageType` 增加 `portal`，但 **`isStdPage` 仍只含 list/detail**（门户的 `root` 树要渲染，不占位）。服务端冒烟：`node apps/server/scripts/smoke-p3b4.mjs`（13 项断言：落库回读 + 非法卡片 400 `SCHEMA_INVALID`）。**未做**：卡片拖拽排序 / 卡片内自定义物料 / 门户级数据源（卡片角标自动取数）——见 `phase3-plan.md` §7.4。

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

事实源：`apps/server/src/`。**鉴权**：除登录外全部要求 `Authorization: Bearer <JWT>`（HS256，8 小时，密钥 `LC_JWT_SECRET`）。

### 10.1 接口清单

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | `200 { accessToken, tokenType: 'Bearer', expiresIn: 28800, user: { id, username, displayName, roles }, perms: string[] }`（**Phase 2 批 6 扩 `perms`**：用户全部角色的权限点并集、**含 `'*'` 通配**表示超级角色，见 10.5） |
| GET | `/auth/me` | — | `200 { user: { sub, username, roles } }` |
| GET | `/apps/bootstrap` | — | `200 { user: { sub, username, roles }, perms: string[], apps: [{ id, name, pages: [{ id, name, type, status, currentVersion, updatedAt }] }], theme? }`（启动聚合：用户 + **权限点** + 应用菜单 + **主题（批 3）**；无独立应用实体，应用按页面 `appId` 分组、`name` 即 `appId`；菜单只含页面元数据，打开页面再拉 Schema；**Phase 2 批 6：扩 `perms` + 菜单按 RBAC `canSeePage` 过滤** —— 无页面授权条目=全员可见，用户角色命中或 `'*'` 才下发该页；**Phase 3 批 3：顶层 `theme` 来自 `GET /apps/config`，无配置时缺键**） |
| GET | `/apps/config` | — | `200 { theme?: { primary?: '#RRGGBB', radius?: '12px', dark?: boolean } }`（**批 3 / D-P3-8**：应用配置读取，登录即可；无配置时无 `theme` 键；存储 `<DATA_DIR>/apps.json`） |
| PUT | `/apps/config` | `{ theme: { primary?, radius?, dark? } }`（**patch 语义**：缺键保留旧值、显式 `null` 清除该键） | `200 { theme }`（合并后的完整 theme；**仅 `'*'` 通配角色**，否则 `403 PERMISSION_DENIED`；校验失败 `400 APP_CONFIG_INVALID`：primary 须 `#RGB/#RRGGBBB`、radius 须如 `12px` 的 px 串、dark 须布尔、未知键拒绝） |
| POST | `/pages/validate` | `{ schema }` | `200 { valid, errors, warnings }`（**恒 200**，设计器渲染问题列表） |
| GET | `/pages` | — | `200 Array<{ id, appId, name, type, status, currentVersion, versionCount, updatedAt, createdAt }>`（**页面列表（2026-10-20 补）**：轻量摘要、`updatedAt` **倒序**、同刻按 `id` 升序；**不含 `draft` / `versions` 全文** —— 换页请再调 `GET :id/schema`；可见性口径与 `GET /apps/bootstrap` 完全一致（无条目=全员可见，`'*'` 恒通）） |
| DELETE | `/pages/:id` | — | `200 { pageId, deleted: true, removedVersions: number }`（**删除页面（2026-10-20 补）**：草稿与**全部历史版本一并删除**、不可恢复；**仅 `'*'` 通配角色**，否则 `403 PERMISSION_DENIED`；不存在 `404 PAGE_NOT_FOUND`；`id` 非法 `400 INVALID_PAGE_ID`） |
| GET | `/pages/:id/schema?version=` | `version`: `draft`（默认）/ `published` / `vN` | 见 10.2；**页面可见性守卫（批 6）**：用户对页面无权限时 `403 PAGE_FORBIDDEN`（draft/published/vN 一视同仁，防直达绕过菜单） |
| PUT | `/pages/:id/schema` | `{ schema, appId? }` | `200 { pageId, status: 'draft', currentVersion, updatedAt, validation: { valid: true, warnings } }` |
| POST | `/pages/:id/publish` | `{ note? }`（≤500 字） | `200 { pageId, status: 'published', version, publishedAt, createdBy, note? }` |
| POST | `/pages/:id/rollback` | `{ version: number }`（≥1 整数） | `200 { pageId, status: 'draft', currentVersion, rolledBackTo, updatedAt }` |
| GET | `/pages/:id/versions` | — | `200 { pageId, status: 'draft' \| 'published', currentVersion, versions: Array<{ version, createdBy, createdAt, note? }> }`（**版本历史列表**，`versions` **倒序**且**不含 schema 全文** —— 查全文走 `GET :id/schema?version=vN`；Phase 2 批 5 / D-P2-8） |

**数据模型与业务记录（方案 8.3 动态 CRUD，Phase 1 落地）**

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| GET | `/models` | — | `200 Array<{ id, name, code, type?, fieldCount, updatedAt }>`（按 `updatedAt` 倒序）。**勘误 2026-10-20**：原文写作 `{ items: [...] }`，与实现及前端 `listModels()` 消费形状不符，实现返回裸数组 |
| GET | `/models/:id` | — | `200` `ModelSchema` + `{ createdAt, updatedAt, createdBy, updatedBy }`；不存在 `404 MODEL_NOT_FOUND` |
| PUT | `/models/:id` | `ModelSchema`（**upsert**：不存在即建档） | `200` 定义体 + 审计字段 + `validation: { valid: true, warnings }` |
| POST | `/models/:modelId/records` | 业务字段对象 | `200 { ...payload, id, createdAt, updatedAt, createdBy, updatedBy }` |
| GET | `/models/:modelId/records` | `?filter=&sort=&page=&size=`（见 10.4） | `200 { items, total, page, size }`（软删记录不返回） |
| PUT | `/models/:modelId/records/:rid` | **部分**字段（合并后整体再校验） | `200` 合并后的完整记录 |
| DELETE | `/models/:modelId/records/:rid` | — | `200 { id, deleted: true, deletedAt }`（**软删**，列表不再返回） |

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

- 鉴权沿全局约定（Bearer）；三接口**无管理员角色细分**（登录即可调，管理面鉴权细分属后续批次）。
- **判定落点**（单一事实源 `RbacService`）：页面级 = `GET /pages/:id/schema` 403 + bootstrap 菜单过滤；按钮级 = 节点 `perm` 字段与会话 `perms` 匹配，不匹配**整节点不渲染**（渲染层语义，见 12.1）；模型 CRUD = `ModelSchema.permissions[action]` 声明则角色交集否则 `403 PERMISSION_DENIED`（records 四接口）；行级 = `ModelSchema.dataScope`（records 查询链强制，`'*'` 豁免）。
- **存储**：`<LC_DATA_DIR>/rbac.json` 单文件（原子写，与 pages/models 同款）；**文件不存在时返回种子配置**：`roles = [{ key:'admin', name:'平台管理员', perms:['*'] }, { key:'designer', name:'设计器用户', perms:[] }]`、`pages = {}`（首启即有超级角色语义，不依赖手工初始化）。
- **用户→角色映射**：Phase 1 内存种子不变（admin→`['admin']`、designer→`['designer']`），用户管理 UI 不在本批（D-P2-12 裁剪项）。

**流程审批（Phase 3 批 1，D-P3-1 轻量状态机，方案 8.6）**

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| GET | `/flows` | — | `200 { flows: FlowSchema[] }` |
| GET | `/flows/:flowId` | — | `200` `FlowSchema`；不存在 `404 FLOW_NOT_FOUND` |
| PUT | `/flows/:flowId` | `FlowSchema`（**upsert**，路径 id 与 `body.flowId` 须一致） | `200` 定义体；校验未过 `400 INVALID_FLOW`（附 `issues`/`warnings` —— `validateFlow` + `checkExpr` 同源） |
| DELETE | `/flows/:flowId` | — | `204`（**只删定义，实例保留审计**）；不存在 `404 FLOW_NOT_FOUND` |
| GET | `/flows/tasks/todo` | — | `200 { items: [{ taskId, instanceId, flowId, flowName, modelId, recordId, nodeName, createdBy, createdAt }] }`（当前用户待办：running 实例**当前节点** pending 任务且 assignee 命中，`createdAt` 倒序） |
| GET | `/flows/instances?recordId=&modelId=` | 两参数均可选 | `200 { items: FlowInstance[] }`（**Timeline 时间轴数据源**：含 `tasks` + `history`，新实例在前；无过滤 = 全量，内部数据量小） |
| GET | `/flows/instances/:instanceId` | 路径参数 | `200 FlowInstance`（单实例全量：`tasks` + `history`，**待办详情页数据源**，2026-10-16 批 2 补）；不存在 `404 { code: 'FLOW_INSTANCE_NOT_FOUND' }` |
| POST | `/flows/instances/:instanceId/tasks/:taskId` | `{ action: 'approve' \| 'reject', comment? }` | `200` 推进后的 `FlowInstance`（审批人不命中 `403 TASK_FORBIDDEN`、非 running `400 FLOW_NOT_RUNNING`、非当前 pending `400 FLOW_TASK_STALE`、任务/实例不存在 `404`） |

- **提交联动**：`POST /models/:modelId/records` 成功后按 `modelId` 匹配定义**自动启动实例**并推进到首个审批节点（**弱保证**：启动失败只记日志、不影响记录提交 —— 记录是业务真相）。
- **推进语义**：`start` 自动通过（history 记 `start` / 驳回重入记 `reenter`）；`approve` 在 `mode=condition` 且 `condition` 求值为假时**跳过**（求值异常按 `true` 走审批，fail-open 防漏审），否则创建 pending 任务停下等审批；到达 `end` → 实例 `approved` 并应用 `onApprove.setField`；`reject` 有 `onReject` 则回退到目标节点、无则实例 `rejected` 终态。
- **assignee 命中（单一事实源 `FlowService.canDecide`）**：`starter` = 实例发起人；`role` = 用户角色命中 **或 RBAC perms 含 `'*'` 超级豁免**；`dept` 首期无组织服务**不可命中**（与批 6 dataScope dept 降级同口径）。
- **setField 回写**：服务端内部直写记录 payload（**不经表单 sanitize** —— 8.6 `status: approved` 回写语义）；顺序 = **先回写记录、再落实例**（记录写失败直接抛、任务状态未落可重试）。
- **存储**：`<LC_DATA_DIR>/flows.json`（定义）+ `flow-instances.json`（实例，只追加与就地更新，不删），原子写同 rbac.json；`FlowInstance` 形状 = `{ id, flowId, modelId, recordId, status: running\|approved\|rejected, currentNodeId, createdBy, createdAt, updatedAt, tasks[], history[] }`，history `action` ∈ `start\|approve\|reject\|skip\|end\|reenter`。

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
pages(id, app_id, name, type, current_version, status)
page_versions(page_id, version, schema, created_by, created_at, note)
      ↑ 发布即插入一条；回滚 = 把某条 version 复制为新的 current draft（需再发布才生效）
```

- `status`：`published` = 草稿已全部发布；`draft` = 存在未发布改动（首次 PUT 自动建档也是 `draft`）；
- `GET ?version=draft` → `{ version: 'draft', schema, updatedAt, updatedBy }`；
- `GET ?version=published|vN` → `{ version: number, schema, createdAt, createdBy, note }`；
- **历史不可变**：回滚只改草稿，`currentVersion` 不回退，旧版本始终可读；
- 存储实现：Phase 0 为 JSON 文件（`<LC_DATA_DIR>/pages/<id>.json`，原子写），接口 `PageRepository` 对齐双表，Phase 1 换 Prisma + PostgreSQL 只换实现（D-9）。

### 10.3 服务端错误码

HTTP 状态 + 业务 `code`（错误体形如 `{ code, message, errors? }`）：

| 状态 | code | 场景 |
|---|---|---|
| 400 | `INVALID_REQUEST` | 字段缺失/类型错（登录入参、note、rollback version、请求体非对象、`body.id` 与路径 id 不一致） |
| 400 | `INVALID_PAGE_ID` | 页面 id 不符合白名单 |
| 400 | `INVALID_VERSION` | `?version=` 不是 draft/published/vN |
| 400 | `SCHEMA_INVALID` | **Schema 校验未通过，附完整 `errors`/`warnings`** |
| 400 | `INVALID_MODEL_ID` / `INVALID_RECORD_ID` | 模型 id / 记录 id 不符合白名单（防路径穿越，与页面 id 同规则） |
| 400 | `MODEL_INVALID` | **模型定义校验未通过，附 `errors`/`warnings`**（与 `SCHEMA_INVALID` 形状对齐） |
| 400 | `INVALID_QUERY` | `filter`/`sort`/`page`/`size` 非法（未知字段、坏 JSON、方向错、`size` 超 100 等） |
| 400 | `RECORD_INVALID` | **记录校验未通过，附 `errors`**（sanitize → 类型 → 规则三步） |
| 400 | `INVALID_FLOW` | **流程定义（批 1）**：`validateFlow` 未通过（附 `issues`/`warnings`）或路径 `flowId` 与 `body.flowId` 不一致 |
| 400 | `FLOW_NOT_RUNNING` | 对已终态（approved/rejected）实例执行审批动作 |
| 400 | `FLOW_TASK_STALE` | 任务非当前 pending（已处理或已被驳回重入的新任务替代） |
| 400 | `APP_CONFIG_INVALID` | **应用配置写入（批 3）**：`PUT /apps/config` theme 校验未通过（附 issues 拼接 message：非法 hex / 非 px 串 / 非布尔 / 未知配置项 / theme 非对象） |
| 400 | `OPS_INVALID` | **运维事件（批 5）**：`POST /ops/events` 批量结构非法（条数 1~50、`type`/`name`/`pageId`/`pageVersion`/`source`/`detail` 形状、`perf` 缺 `durationMs`、`error` 缺 `message`）或 `GET /ops/events` 的 `type`/`since`/`limit` 非法；message 带 `events[i]` 定位（**数据超长不触发本码，走截断**） |
| 401 | `UNAUTHORIZED` | 无/坏/过期令牌、Authorization 头格式错 |
| 401 | `INVALID_CREDENTIALS` | 用户不存在或口令错（**同一错误码防枚举**） |
| 403 | `PAGE_FORBIDDEN` | **页面可见性守卫（批 6）**：`GET /pages/:id/schema` 用户角色不在该页授权（`pages` 有条目且未命中、也无 `'*'`）；无条目 = 全员可见不触发 |
| 403 | `PERMISSION_DENIED` | **模型 CRUD 守卫（批 6）**：`ModelSchema.permissions[action]` 已声明且用户角色不在交集（无 `'*'`）；records 四接口按 create/read/update/delete 分别强制；**应用配置写入（批 3）**：`PUT /apps/config` 用户 perms 不含 `'*'`；**运维事件读取（批 5）**：`GET /ops/events` / `GET /ops/summary` 用户 perms 不含 `'*'` |
| 403 | `TASK_FORBIDDEN` | **流程审批动作（批 1）**：当前用户非任务 assignee（role 未命中且无 `'*'`、非发起人、dept 降级不可命中） |
| 404 | `PAGE_NOT_FOUND` / `DRAFT_NOT_FOUND` / `VERSION_NOT_FOUND` | 页面/草稿/版本不存在 |
| 404 | `MODEL_NOT_FOUND` / `RECORD_NOT_FOUND` / `FILE_NOT_FOUND` | 模型未建档 / 记录不存在或已软删 / 文件不存在 |
| 404 | `FLOW_NOT_FOUND` / `FLOW_INSTANCE_NOT_FOUND` / `FLOW_TASK_NOT_FOUND` | 流程定义 / 实例 / 任务不存在（批 1） |
| 409 | `NOT_PUBLISHED` | 取 `published` 但从未发布 |
| 409 | `NO_DRAFT` | 发布时没有草稿 |
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

- **系统字段**（可参与 `filter`/`sort`，但**不可出现在写入 payload**）：`id` `createdAt` `updatedAt` `createdBy` `updatedBy` `deletedAt`；
- **软删**：`DELETE` 只置 `deletedAt`，列表默认排除，记录再读/再改/再删均 `404 RECORD_NOT_FOUND`；
- **审计字段服务端权威**：请求体伪造 `createdAt/createdBy` 无效（保存时覆盖）。

---

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
