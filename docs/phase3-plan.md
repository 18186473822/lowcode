# Phase 3 落地方案 —— 流程与体验（拆批 + 批次详设）

> **状态**：**批 1 ✅ 收口（2026-10-15）｜批 2 ✅ 收口（2026-10-16）｜批 3 ✅ 收口（2026-10-19）｜批 4 ✅ 收口（2026-10-20）｜批 5 ✅ 收口（2026-10-20）** ｜ **Phase 3 全部收口** ｜ **前置**：Phase 2 七批全收口（出口判据达成，见 PROGRESS「已实现 30」）｜ **日期**：2026-10-20
>
> 拆批决策（2026-10-15 与负责人对齐）：**按 5 批推进**（原拟 6 批，「数据导出/打印」批整批裁剪留 Phase 4；消息通知同步裁剪）。出口判据经确认。

## 1. 目标与出口判据

**主方案 Phase 3 原文**（4 周）：

- 轻量流程引擎（状态机）+ 审批物料（ApprovalBar / Timeline）+ 待办中心
- 草稿、离线提交、消息通知（订阅消息 / 短信）
- 图表物料、门户 Portal 页面、主题配置（主色/圆角/深色模式）
- 真机预览扫码、Schema 性能 Profiler、埋点与错误上报
- 数据导出 / 打印模板

**出口判据（本方案拟定，2026-10-15 经确认）**：业务人员搭出一个**带审批的申请应用**：提交 → 审批人在待办中心看到任务 → 同意 → 记录状态变更、时间轴可见；门户页有图表、主题换色生效。

**事项表出处**：流程详设见主方案 **8.6**（轻量状态机 JSON 形状，不做 BPMN）；草稿见 **7.3**（首期本地草稿，离线队列二期）；图表范围见风险 **R10**（只做 3 种）。

## 2. 现状盘点（2026-10-15 实测调研结论）

| 层 | 已有（Phase 0~2 遗留资产） | 缺口（Phase 3 要补） |
|---|---|---|
| 协议（`packages/schema`） | ✅ `AppSchema` 已前瞻：`flows?: string[]`、`theme?: AppTheme{primary,radius,dark}`、`AppMenuItem`（`type:'builtin'` + `target:'todoList'` + `badge:'todo'`）；✅ `PageType` 含 `'portal'` + `validate` 放行 + designer `setPageType('portal')` 已测 | ~~缺 `FlowSchema` 类型与 `validateFlow`~~ **批 1 已补**；portal 页无 `PortalPageConfig` 配置结构（批 4） |
| 服务端（`apps/server`） | ✅ records 动态 CRUD（提交联动落点）；✅ bootstrap 按页面 `appId` 分组合成菜单 | ~~无 flow 模块~~ **批 1 已补**（定义/实例/任务/审批动作 + 提交联动）；**无独立 App 实体**（主题/应用配置无处存储，批 3） |
| 物料（`packages/materials`） | ✅ 30 物料 6 分组（批 3） | **缺 ApprovalBar / Timeline（biz 组 2 个）**；**缺 Chart ×3 + Statistic（data 组）**——grep 全仓零命中 |
| 运行时（`packages/runtime`） | ✅ 菜单/登录/`pageId` 路由/列表详情分发；✅ 分包结构（批 7） | **无待办内置页**（菜单 `target:'todoList'` 无落点）；**无主题 CSS 变量**（批 3）；无草稿 storage（批 3） |
| 设计器（`packages/designer`） | ✅ 标准页配置/字段绑定/权限/历史全链路 | 流程定义无编辑入口（批 1 接口直建，UI 化见批 1「明确未做」）；portal 无专属配置面板（批 4）；主题/应用配置入口零（批 3） |
| 观测 | ✅ `safeEval` 表达式兜底有 fallback（不白屏） | 埋点/错误上报**无服务端落点**（批 5）；Schema 加载无计时 Profiler（批 5） |

## 3. 拆批表（5 批）

| 批次 | 目标 | 依赖 | DoD |
|---|---|---|---|
| **批 1：流程引擎核心（状态机）** ✅ 2026-10-15 收口 | 协议补 `FlowSchema` + `validateFlow`；服务端 flow 模块（定义 CRUD + 实例 + 任务 + 审批动作）；**记录提交联动启动实例**；协议文档回写（§10.1 流程组 —— **勘误**：初稿误写 §11，实为 §10 追加组，§11 是生命周期受信 API） | 无（Phase 2 收口） | 流程定义建好 → 提交绑定模型的记录 → 服务端查到实例与待办任务 → `approve` 后状态按 `onApprove.setField` 落到记录、`reject` 按 `onReject` 回退；接口冒烟脚本留档 → **实绩见 §4（20 用例集成测试即冒烟）** |
| **批 2：审批物料 + 待办中心** ✅ 2026-10-16 收口 | 物料 `ApprovalBar`（同意/驳回）+ `Timeline`（流转时间轴）；runtime **内置待办页**（菜单 `target:'todoList'` 落点）；设计器物料面板 + 页面/物料绑流程配置；H5 审批闭环实测 | 批 1 | H5 全流程：申请页提交 → 待办页见任务 → 点开详情点「同意」→ 记录状态变 `approved` → Timeline 显示流转（提交/同意两节点） → **实绩见 §5** |
| **批 3：本地草稿 + 主题配置** ✅ 2026-10-19 收口 | 表单页本地草稿（storage `key=pageId+userId`，进入提示恢复，提交成功即清，方案 7.3 首期口径）；新增**应用存储**（`apps.json`）+ `theme`（primary/radius/dark）落 CSS 变量 + 设计器主题配置入口 | 独立（可与批 1/2 并行） | 填一半刷新 → 进入提示恢复草稿 → 提交成功后草稿清；改 primary 主色 → runtime 全站按钮/导航变色、dark 开关生效（服务端回读 apps.json B-35）—— **实绩见 §6** |
| **批 4：图表物料 ×3 + Portal 页型** ✅ 2026-10-20 收口 | `Chart` 物料 3 种形态（柱/折/饼，**纯 SVG 手写不引 echarts**，R10 风控）+ `Statistic` 指标卡；portal 页型渲染（`lc-portal` 标准页）+ 设计器 portal 配置面板 | 独立 | 设计器配 portal 页（卡片导航）+ 拖 Chart 绑模型聚合数 → H5 渲染出柱/折/饼三形态与指标卡 —— **实绩见 §7（H5 实测通过 + 冒烟 13 项）** |
| **批 5：埋点与错误上报 + Schema Profiler** ✅ 2026-10-20 收口 | 服务端 ops 接口（埋点/错误事件表）；renderer 表达式错误/渲染错误回调上报（方案 791 兑现）；Schema 加载与渲染耗时 Profiler（设计器/runtime 可见） | 独立 | 表达式求值失败 → 不白屏 + 服务端查到错误事件；页面加载完成 → 耗时指标可见（接口回读）—— **实绩见 §8（H5 实测 + 冒烟 23 项）** |

**依赖关系**：批 1 → 批 2 串行；批 3/4/5 相互独立。建议顺序 1 → 2 → 3 → 4 → 5。

## 4. 批 1 详设：流程引擎核心（状态机）✅（2026-10-15 收口）

**落点（三层）**

| 层 | 内容 |
|---|---|
| 协议 `packages/schema` | **新** `src/types/flow.ts`（`FlowSchema` / `FlowNode` / `FlowAssignee` / `FlowNodeType`，形状 = 8.6 原文 + `name` 补充；不带 `schemaVersion` —— 与 `ModelSchema` 同类的服务端数据实体）；`types/index.ts` 导出；`validate/index.ts` **新增 `validateFlow`**（结构硬约束：首 start / 尾 end / approve≥1 / 节点 id 唯一 / onReject 引用存在；字段：`E_FLOW_ID/NAME/MODEL/MODE/NODE_*/ASSIGNEE/CONDITION/ONREJECT/ONAPPROVE`；表达式经注入 `checkExpr` 出 `E_EXPR_SYNTAX`；降级与忽略出 `W_FLOW_DEPT_ASSIGNEE / W_FLOW_START_ASSIGNEE / W_FLOW_CONDITION_IGNORED / W_FLOW_END_NO_SETFIELD`） |
| 服务端 `apps/server` | **新模块 `flow/`** 5 文件：`flow.types.ts`（`FlowInstance`/`FlowTask`/`FlowHistoryEntry` 运行时形状 + `FlowRepository` 契约）、`file-flow.repository.ts`（`flows.json` + `flow-instances.json` 双文件，原子写，实例只追加/就地更新不删）、`flow.service.ts`（定义 CRUD / 提交联动 / 推进纯逻辑 `advanceFrom` / 审批动作 / 待办与 assignee 判定）、`flow.controller.ts`（7 接口，路由静态段先于 `:flowId` 声明，POST 显式 `@HttpCode(200)`）、`flow.module.ts`；`app.module.ts` 注册 |
| 接线（D-P3-3 依赖方向） | `RECORD_REPOSITORY` provider **从 ModelModule 提升至 `@Global` StorageModule**（FlowService 回写与 RecordService 写入同源单实例，防文件仓 read-modify-write 分裂）；`ModelModule imports FlowModule` **单向**（RecordService 提交后调 `onRecordCreated`），FlowModule 不 import ModelModule —— 避免循环；`record.service.create` 在 `save` 后联动（**弱保证**：`onRecordCreated` 内部全量 try-catch，失败只记日志不回滚记录） |

**关键决策**

- **D-P3-1 推进语义**：`start` 自动通过；`approve` 停下建 pending 任务；`mode=condition` 且 condition 求值假 → **跳过**（history `skip`；求值异常按 `true` 走审批 —— **fail-open 防漏审**）；`end` → 实例 `approved` + 应用 `setField`；`reject` 有 `onReject` 回退（指向 `start` = history `reenter` 重建任务）无则 `rejected` 终态。`linear` 忽略 condition（validateFlow 出 warning 提示）。
- **D-P3-2 assignee 判定**（`FlowService.canDecide`，单一事实源）：`starter` = 实例发起人；`role` = `user.roles` 命中 **或 RBAC `permsOf` 含 `'*'` 超级豁免**；`dept` 协议保留、运行时**不可命中**（与批 6 dataScope dept 降级同口径，`validateFlow` 出 warning）。
- **D-P3-3 存储与回写顺序**：`setField` 回写**不经表单 sanitize**（服务端内部直写 payload —— 8.6 `status: approved` 语义）；`decide` 顺序 = 校验 → 改内存实例 → **先回写记录 → 再落实例**（记录写失败抛 500、任务状态未落可重试；反向会先污染任务状态）。
- **B-43（教训，本批踩坑）**：vitest/esbuild **不 emit decorator metadata** —— Nest 服务构造参数**裸类型注入在测试容器中为 undefined**（生产 tsc 有 metadata、测试无 → 只在测试里炸）。修复：`FlowService` 的 `rbac` 补 `@Inject(RbacService)`；**规范**：本仓库 Nest 构造注入一律显式 `@Inject`（既有 record.service 风格的深层原因即此）。

**测试与验证**

- `packages/schema/test/validate-flow.test.ts` **15 用例**（8.6 合法夹具 + 结构/字段/审批人/表达式/引用全负例）→ schema 合计 **87 passed**。
- `apps/server/test/flow.test.ts` **20 用例**（真实 Nest 启动 + HTTP 全链路，**即批 1 冒烟脚本**）：定义 CRUD 与校验拦截（401/400 issues/不一致/404）→ **提交联动启动实例**（无绑定模型不启动）→ 待办过滤（admin `'*'` 豁免可见 / designer 不可见 / 直接审批 **403 TASK_FORBIDDEN**）→ A 主链 approve 推进 + **终态 `setField` 回写记录读回（B-35）** + 重复处理 `FLOW_TASK_STALE` → B starter 判定（发起人可见/非发起人 403）+ **驳回 reenter**（history `reject→reenter`、新任务 ≠ 旧任务）+ **驳回缺省终止** + 终态再动作 `FLOW_NOT_RUNNING` → C 条件跳过（amount=500 `skip` 停 n3 / 2000 停 n2）→ DELETE 后**实例审计保留** → server 合计 **135 passed**。
- 四连：`pnpm -r typecheck` **7 包 Done** / `pnpm -r build` **5 包 Done** / `pnpm -r test` **834 passed**（799 → 834，+15 +20 对齐）/ coverage 见 PROGRESS 验证基线行。
- 服务端回读：`GET /flows/instances?recordId=` 返回推进后 history/tasks；记录 `payload.status = 'approved'` 经 `GET records` 读回确认。
- **产物冒烟留档**：`apps/server/scripts/smoke-flow.mjs`（真实 dist + 真实 data 目录 12 项断言全过 `SMOKE OK` exit 0）—— 登录 → 建定义 → 非法拦截 → 提交联动启动 → 实例/待办 → approve → **setField 回写读回（B-35）** → 终态再审批 `FLOW_NOT_RUNNING` → 定义删除 204/404；实测补抓两处语义：enum 选项须取 `options[0].value`（对象数组）、终态再审批先于任务检查报 `FLOW_NOT_RUNNING`（与中间节点 `FLOW_TASK_STALE` 两层防护）。

**明确未做（本批裁剪/留后）**：流程定义可视化编辑器（接口直建够 DoD，批 4 后评估）；`condition` 分支树（首期只做**跳过**不做多路分支）；`assignee=dept` 实际解析（无组织服务）；转办/加签动作（随批 2 ApprovalBar 再评估）；流程绑定的**页面级配置 UI**（批 2 物料侧一并做）；`onReject` 中间节点退回的二次条件求值（回退目标固定按当前 formData 重进推进链）。

## 5. 批 2 详设：审批物料 + 待办中心 ✅（2026-10-16 收口）

**落点（四层）**

| 层 | 内容 |
|---|---|
| 物料 `packages/materials` | **新** `approval-bar/index.vue`（可审 = 当前节点提示 + 同意/驳回按钮、终态 = ✓ 横幅、空态 = 占位；按钮用 **`@click` 非 `@tap`** —— uni 编译双端兼容，且纯 vite/jsdom 下 `@tap` 是 DOM 'tap' 事件 click 不触发，测试抓出后全物料统一）+ `timeline/index.vue`（`history` 倒序时间轴：动作/节点/操作人/时间/意见；decided 后按 `tlKey` 重建）+ `keys.ts`（`LcFlowHost` 接口 + `LC_FLOW_HOST_KEY` 注入键）+ `flow-utils.ts`（实例查询封装）+ `BIZ_META`（`biz:'业务'` 分组，META 30→32） |
| 渲染器 `packages/renderer` | `lc-renderer.vue` **provide 宿主**（D-P3-4）：画布侧注入**零请求 mock 宿主** → recordId 未绑定走占位态不白屏；`lc-node.vue` 分发链 +2（LEAF_MATERIALS 31 项）；节点 props 支持 **`$expr:` 求值**（D-P3-4b） |
| 运行时 `packages/runtime` | `src/host.ts` `createUniHost()`（意见输入 `uni.showModal({editable:true})` → 降级 `host.confirm`）+ `api.ts` 补 `fetchFlowInstance/fetchFlowTasks/fetchFlowTask` + **`pages/todo/index.vue`**（待办列表，onShow 重拉）+ **`pages/todo/detail.vue`**（内置详情页：状态头 + 记录字段 + 复用 ApprovalBar/Timeline；**独立 uni 页不经 lc-renderer，自行 provide 宿主**）+ `pages.json` 注册 + 菜单「工作台」组 `target:'todoList'` 落点（不改 bootstrap 协议）+ view 页 `options.urlParams` |
| 设计器 / 服务端 | designer-web 物料面板「业务」组 2 项 + `MATERIAL_MAP` 映射 + demo fixture +2 节点（30→32）+ 属性面板 settings（recordId 默认 `$expr: urlParams.rid` / modelId / flowId / perm + `decided` 事件接线）+ meta-sync 联动；服务端 **新** `GET /flows/instances/:instanceId`（D-P3-6，404 `FLOW_INSTANCE_NOT_FOUND`）+ protocol.md §10.1 补行 |

**关键决策**

- **D-P3-4 审批物料数据通道**：`LcFlowHost` + `LC_FLOW_HOST_KEY` 定义于 `materials/keys.ts`，renderer → materials **单向依赖**；宿主由「渲染处」provide —— 画布（mock 零请求）、待办详情页（`createUniHost()`）各自注入。
- **D-P3-4b recordId 绑定**：审批物料 `props.recordId` 默认 `$expr: urlParams.rid`，渲染层 `$expr:` 求值 → 详情路由自动取记录主键，配置者免手填；画布无 urlParams 求值空 → **占位态零请求**。
- **D-P3-5 待办中心两页**：列表 + 内置详情（复用物料渲染，decided 后 `tlKey` 重建时间轴）；菜单「工作台」组落点。
- **D-P3-6 单实例接口**：Timeline/详情页需按 `instanceId` 拿全量 `history + tasks`，`?recordId=` 批量查询不够 → 补单实例端点。
- **裁剪定案：标准详情页（type=detail）不支持内嵌物料插槽** —— 审批 UI 走待办中心内置详情页；自由页（form/custom）可拖物料；低代码详情页审批插槽留后批评估。
- **B-44（教训，本批踩坑）**：**vite `optimizeDeps` 预构建造成 `@lc/materials` 双实例** —— 页面 `import '@lc/materials'` 被打成 `/node_modules/.vite/deps/@lc_materials.js`（预构建 chunk 另建 symbol），easycom 物料组件的相对 `../keys` 走源码 `src/keys.ts` → **两条路径 symbol 不同 → provide/inject 断链**（页面报「审批宿主未注入」；vitest 无 optimizer **不复现**，单测全绿仍线上断链）。修复：物料组件**一律改从包入口 `@lc/materials` 导入**（dev 两侧同进 deps chunk 归一，vitest/生产 rollup 同样归一）。**附带限制**：`packages/materials` 在 runtime dev 的 **watch 根外** —— 改物料源码需**重启 runtime dev server** 才生效（transform 缓存不失效）。

**测试与验证**

- 新增 `renderer/test/uni/approval-materials.test.ts` **8 用例**（画布零请求 / 可审交互 / 待办未命中 / 终态 / 空实例 / 时间轴渲染 / 意见入史）+ meta-sync +1（33/32/31 叶子 + 批 2 biz 在册）+ lc-node 分发锁 +2（LEAF_MATERIALS 31 项）+ server `flow.test.ts` +1（单实例 200 / 404）。
- 四连全绿：`pnpm -r typecheck` exit 0 / `pnpm -r build` exit 0 / `pnpm -r test` **846 passed**（schema 87 + expression 117 + renderer 224 + server 136 + designer 282）/ coverage **96.47/87.71/96.81/96.47**（49 文件；`flow/` 分包 **94.79/81.20**）。
- **产物冒烟留档**：`apps/server/scripts/smoke-p3b2.mjs` **12/12 PASS**（登录 → 建流程 → 空列表 → 单实例 404 → 提交联动启动 → 待办命中 → 单实例 200 → 审批 → 记录回读 `approved` + `history=start,approve,end` → 终态再审 400）。
- **H5 闭环实测（DoD 逐条）**：登录 → 菜单「工作台/待办中心」→ leave_form 提交「提交成功」→ 待办列表命中 → 点开详情（状态头 + 字段 + ApprovalBar 当前节点 + Timeline 提交条）→ 点「同意」→ `uni.showModal` editable 填意见确定 → **头部「审批已通过」+ 终态横幅 + Timeline 同意（含意见）/完成流转** → 服务端回读 `instance.status=approved`、`history=start,approve,end`、**`record.status=approved`（B-35）**、todo 清零 → 返回列表 onShow 刷新已办消失。
- **设计器实测**：物料面板「业务」组 2 项 / 新建页 fixture 32 节点画布两物料**占位态零请求** / 选中节点属性面板 **recordId 默认 `$expr: urlParams.rid`** + 模型/流程/权限字段 + `decided` 事件接线。

**明确未做（本批裁剪/留后）**：低代码详情页（type=detail）内嵌审批插槽（后批评估）；转办/加签动作（沿批 1 裁剪维持）；`materials` 改动热更（watch 根外 —— 已知限制，重启 dev 生效）；mp 真机审批链路（环境无微信开发者工具）；待办消息提醒（随消息批裁剪口径）。

---

## 6. 批 3 详设：本地草稿 + 主题配置 ✅（2026-10-19 收口）

### 6.1 决策

**D-P3-7 表单本地草稿（renderer 管时机 + 宿主管存储）**

- `DraftStore { load / save / clear }` 进 `PageControllerOptions.draft`（**可选注入**：未注入 = 禁用 —— 画布 / list·detail 标准页 / 存量宿主 / 测试 mock 零影响）；**key 与存储介质归宿主**，controller 只管时机。
- 时机：字段变更 → `save`（**全空则 clear**，删光内容不留「空草稿」下次再提示）；`onMount`（数据源 init **之后** —— 用户填过的内容比取数默认值权威）→ `load` 非空 → `host.confirm`（恢复 / 不恢复）→ 确认 `patchFields` 回填、拒绝 `clear` 丢弃；提交成功（ds 成功段）与 `reset()` → `clear`。存储异常（配额 / 隐私模式）吞掉只上报，**不阻断表单**（草稿是体验增强）。
- 草稿快照与提交 payload **同源**：`collectFieldNames` 构造期收集一次（`fieldNames` 复用）。
- runtime 实现 `createUniDraft(pageId)`：key = `lc_draft:${username}:${pageId}`（**按用户隔离**，同设备切号不串草稿）；值 `{ data, at }`；**7 天过期**静默清。view 页 onLoad 注入（list/detail 不经 lc-renderer，常驻无害）。

**D-P3-8 应用配置与主题（apps.json + CSS 变量档位覆盖）**

- 服务端 `<DATA_DIR>/apps.json`（D-9 风格，顶层 `{ theme? }` 预留应用实体迁入）：`GET /apps/config`（登录即可）+ `PUT /apps/config`（**仅 `'*'` 通配角色**；**patch 语义**：缺键保留、显式 `null` 清除；校验 `#hex` / px 串 / 布尔 / 未知键拒绝 → 400 `APP_CONFIG_INVALID`）；bootstrap 顶层下发 `theme`（无配置缺键）。原子写 tmp+rename；读容错（缺文件 / 坏 JSON → `{}`）。
- runtime：`bootstrap()` 写主题缓存 `lc_theme` + `applyAppTheme()` —— primary → `deriveBrandPalette`（**renderer 纯函数**：HSL 固定目标亮度十档映射，与 tokens.css 原生梯度吻合）→ 覆盖 `--lc-brand-50..900`（**action / focus / link / gradient 语义变量皆派生自档位，覆盖即全站**）+ inline 补 `--lc-action-primary`（dark 块曾硬编码 `#4d88f0`，inline 特异性最高两态通吃 —— 实测发现并修复）；radius → 覆盖 `--lc-radius-sm/md`；`App.vue onLaunch` 从缓存恢复（bootstrap 前的直达页也有主题）+ menu 页 bootstrap 后应用。
- 档位覆盖**仅 H5 生效**（mp 无 `document` → no-op，走 tokens.rpx 静态默认）；radius 配置单位约定 **px**（setProperty 注入 rpx 浏览器不认识，服务端校验即限 px）。
- 纯函数进 `@lc/renderer` `core/theme-vars.ts`（保测试覆盖）；DOM 副作用留 runtime / designer-web 薄壳（副作用注入原则）。
- designer：第三视图 `theme`（`store.view` 扩）+ `ThemePanel`（primary 取色器+hex / radius px / dark 三态 select「跟随系统|强制浅|强制深」）+ `themeApi`（designer-web fetch 实现，与画布 `DesignerApi` 分域；类型独立 `panel/theme-types.ts` —— `<script setup>` 不能承载 export）；保存成功 → `emit('saved')` → `applyBrandVars` **设计器自身换肤预览**（所见即所得；dark 不联动 —— 设计器自身亮暗由独立 toggle 管理）。

**D-P3-9 dark 优先级：配置 > 系统偏好**

- `theme.dark: undefined` = 跟随系统（`initTheme` 的 matchMedia change 监听保持）；显式 `true/false` → 落 `data-theme` 且**系统监听让位**（模块级 `appDark` 标记，change 回调检查后跳过）。

### 6.2 分层落地

| 层 | 落地 |
|---|---|
| renderer | `core/types.ts` +DraftStore；`core/controller.ts` 接线（订阅存 / onMount 恢复 / submit·reset 清 / fieldNames 复用）；`core/theme-vars.ts` 新建（parseHex / rgbToHsl / hslToHex / deriveBrandPalette）；导出（运行时导出 36→40，exports 守卫同步） |
| server | `page/app-config.service.ts` 新建（validateTheme + patch 合并 + 原子写）；`app.controller` GET/PUT `config`（403 仅 `'*'` / 400 校验）+ bootstrap 扩 `theme`；page.module 注册（B-43 显式 @Inject） |
| runtime | `draft.ts` 新建（uni storage + 用户隔离 + 7 天过期）；`theme.ts` applyAppTheme + action-primary dark 修正 + 监听让位；`api.ts` bootstrap theme + setThemeCache/getThemeCache；view 页 draft 注入；App.vue 启动接线（initTheme 此前悬空，本批接上）；menu 页 bootstrap 后应用 |
| designer | store `view` / `switchView` 扩 `'theme'`；`panel/theme-types.ts` + `panel/ThemePanel.vue` 新建；index 导出 |
| designer-web | `themeApi`（api.ts）；theme.ts `applyBrandVars`；App.vue 顶栏「主题配置」按钮 + 视图区 + `onThemeSaved` 预览 |

### 6.3 测试与验证

- 新增 **34 用例**：renderer 17（draft 9：未注入零副作用 / 变更存 / 全空清 / 恢复确认回填 / 拒绝丢弃 / 无草稿不弹 / 提交清 / reset 清 / load 抛错不阻断；theme-vars 8：hex 解析 / HSL 往返 / 十档齐全 / 亮度单调）+ server 10（app-config e2e：401 / 初始空 / 403 / 三种 400 / 写读一致+文件落盘 B-35 / patch 保留 / null 清除 / bootstrap.theme）+ designer 7（ThemePanel：回填映射 / 空态禁保存 / patch+saved 事件 / null 清除 / 客户端门禁 / 加载失败重试 / 保存失败红字）。
- 四连：`pnpm -r typecheck` exit 0 / `pnpm -r build` exit 0 / `pnpm -r test` **924 passed**（六包实测：tokens 5 + schema 87 + expression 117 + renderer 259 + server 146 + designer 310；批 3 新增 34 逐例归因：renderer draft 9 + theme-vars 8 / server app-config 10 / designer theme-panel 7；批 2 记录 846 为五包口径不含 tokens）/ coverage ✅ **96.14/87.84/96.18/96.14 exit 0**（57 文件 91.94s；theme-vars 98.63、renderer core controller 97.24/96.25；B-45 修复后终轮实测——此前 8 轮退出码被 worker RPC 超时污染而测试与阈值全过，根因与处置见 B-45）。
- **冒烟留档** `apps/server/scripts/smoke-p3b3.mjs` **12/12 PASS**（401 / 读开放 / 403 / 两种 400 / 写回传 / GET 回读 B-35 / bootstrap.theme B-35 / patch 保留 / null 清除同步 / 三键全清还原）。
- **H5 实测（DoD 逐条）**：填天数+事由 → localStorage 落 `lc_draft:admin:leave_form` → 硬刷新 → `uni.showModal`「检测到上次未提交的草稿，是否恢复？」→ 点恢复 → 回填一致 → 提交「提交成功」→ **草稿清** → 再刷无提示表单空；「不恢复」路径：丢弃+清；主题：PUT `#e8442e/14px` → 刷新后 brand 十档派生（50=#fdefed / 500=#e8442e / 700=#a12312）+ `--lc-action-primary` 跟随 + radius 14px；`dark:true` → `data-theme=dark` 深色底（bg #0f1319）且 **action-primary dark 修正生效**（修复前 #4d88f0 → 修复后 #e8442e）；主题缓存 `lc_theme` 落地（直达页兜底）。
- **设计器实测**：顶栏「主题配置」→ 面板回填 `#e8442e / 14 / 强制深色`（三态映射）→ 基线一致禁保存 → 改 `#1fa971` + 跟随系统 → 保存「已保存 HH:mm:ss」+ **设计器自身换肤**（inline brand-500/action-primary=#1fa971）→ API/文件回读一致、dark 键清除（B-35 三级留档：e2e 测试 / 冒烟 / 实测）。

### 6.4 明确未做（批 3 口径）

- mp 端主题动态化（无 document；走 tokens.rpx 静态默认值）+ mp 真机草稿链路（环境无微信开发者工具）。
- 草稿列表 / 多版本草稿 / 离线队列（方案 7.3 二期）；草稿 save 无 debounce（uni 同步写小 JSON 无感，量大再优化）。
- 主题写权限细化（现限 `'*'` 通配角色，无独立 `app:config` 权限点）；设计器主题「未保存实时预览」（现保存成功才换肤）。
- 多应用各自 theme（apps.json 顶层单主题，与 bootstrap 单 theme 对齐；有应用实体后演进）。
- uni H5 `showModal` 确认后 DOM 清理有延迟/残留（功能无碍：promise 正常 resolve、回填/丢弃逻辑正确；reload 即清）。
- ~~coverage workspace 模式偶发 vitest worker RPC 超时~~ → **本批已根治（B-45）**：rpcTimeout 下沉各项目配置 + 命令加 `--no-file-parallelism`，终轮 exit 0（此前 8 轮 100% 被 `snapshotSaved`/`fetch` 超时污染退出码，测试与阈值本身全过）。

---

## 7. 批 4 详设：图表物料 ×3 + Portal 页型 ✅（2026-10-20 收口）

> 范围（拆批表原文）：`Chart` 物料 3 种形态（柱/折/饼，**纯 SVG 手写不引 echarts**，R10 风控）+ `Statistic` 指标卡；portal 页型渲染（`lc-portal` 标准页）+ 设计器 portal 配置面板。
> DoD：设计器配 portal 页（卡片导航）+ 拖 Chart 绑模型聚合数 → H5 渲染出柱/折/饼三形态与指标卡。

### 7.1 决策

**D-P3-10 图表物料（纯 SVG，不引 echarts，R10 风控）**

- 新增两物料（data 组）：**`Chart`**（一组件三形态：`chartType: 'bar' | 'line' | 'pie'`）+ **`Statistic`**（指标卡）。
- **跨端渲染方案**：SVG 字符串 → base64 data URI → `<image :src>`。理由：uni 三端**不支持裸 `<svg>` 标签**（MP 不渲染未知标签），而 `<image>` 的 data URI 三端通用；SVG 生成下沉为**纯函数**（`materials/src/chart/chart-svg.ts`）零 DOM 依赖、可单测。
- **数据三通道（优先级）**：① `props.data`（JSON 文本，静态预览，setter=textarea）；② `props.modelId` + `dimension`/`metric('count'|'sum'|'avg'|'max'|'min')`/`metricField`/`limit` → 经 inject `LC_FLOW_HOST_KEY.request` 拉 `GET /api/v1/models/:modelId/records?size=limit` 后**客户端聚合**（聚合是纯展示派生，**不新增服务端接口**）；③ 无数据 / 无宿主 → 空态占位（画布零请求，同 ApprovalBar 画布安全口径）。
- **依赖方向**：纯函数与物料同住 `@lc/materials`（物料**不反向依赖** `@lc/renderer`，沿 D-P3-4）；测试借 **renderer 测试工程**（renderer → materials 单向，已用于 ApprovalBar/Timeline 物料行为锁）。
- `Statistic`：`label` / `value`（支持 `$expr` 联动）/ `unit` / `precision` / `trend`（`up|down|flat` 文案色，纯展示）。

**D-P3-11 Portal 页型**

- 协议：新增 `PortalPageConfig { title?; columns?; cards: PortalCard[] }` + `PortalCard { title; desc?; icon?; pageId?; url?; badge? }`、`PageSchema.portal?`。
- 校验：portal 页**不强制**提供配置（无 cards 合法）——portal = **卡片导航（配置）+ 自由拖拽区（NodeSchema 树）**混合页；仅当给 cards 时逐条校验 `title` 非空（`E_REQUIRED` `portal.cards[i].title`）。
- 渲染 `lc-portal-page.vue`：上区卡片网格（icon + title + desc + badge；点卡 → emit `navigate({pageId})`，配 `url` 则 emit `open-url`）+ 下区 `<lc-renderer :schema :options>` 渲染拖入的图表/统计/KPI 树；事件契约同 list/detail（`navigate` / `state-action`）。
- 运行时 `pages/view/index.vue` 分发扩为 tri-branch：`list | detail | portal` → 对应标准页，其余 → `lc-renderer`。
- 设计器：`PropsPanel` 页面类型下拉 +「门户」；portal 配置区块（标题 / 列数 / 卡片行增删改：title·desc·icon·pageId·badge）；`schema-ops.updatePortalConfig`（浅合并）+ `setPageType` 切 portal 初始化骨架 `{cards:[]}`；store `setPortalConfig`。**画布仍渲染节点树**（图表可拖入）——portal **不进** `isStdPage` 占位锁。

### 7.2 分层落地

| 层 | 落地 |
|---|---|
| schema | `types/page.ts` +`PortalPageConfig`/`PortalCard`/`portal?`；`validate` portal 软校验；`index` 导出 |
| materials | `chart/chart-svg.ts`（纯函数：`aggregateSeries` / `buildChartSvg` → SVG 串 / `toDataUri`）+ `chart/index.vue`；`statistic/index.vue`；`meta/data.ts` +Chart(order 4)/Statistic(order 5) |
| renderer | `lc-node.vue` +2 分发分支（Chart / Statistic）；`lc-portal-page.vue` 新建 |
| runtime | `pages/view/index.vue` 分发 `portal` → `lc-portal-page`（接线 @navigate） |
| designer | `material-map.ts` +`lc-chart`/`lc-statistic`；`schema-ops` `updatePortalConfig` + `setPageType` portal 骨架；`store` `setPortalConfig`；`PropsPanel` 类型项 + portal 配置区块 |
| designer-web | portal 画布提示条（说明卡片运行时渲染、画布展示拖拽区） |

### 7.3 测试与验证

- **新增用例**：schema（portal 校验 3）+ designer（`updatePortalConfig`/类型骨架/PropsPanel 门户区块 ~6）+ renderer（chart-svg 纯函数聚合与三形态 ~10、Statistic 格式化 ~4、`lc-portal-page` ~5、lc-node 分发锁 +2）。
- **同步锁更新**：`meta-sync`（33→**35** / 展示 32→**34** / 叶子 31→**33**）、`lc-node-materials`（叶子 31→**33**）。
- **四连**：`typecheck` / `build` / `test` / `coverage`；**冒烟** + **H5 实测 DoD**（portal 卡片跳转 + 柱/折/饼三形态 + 指标卡 + 模型聚合）。

### 7.4 明确未做（批 4 口径）

- 图表交互（tooltip / 图例点击 / 动画）；更多图型（散点/雷达/漏斗，R10 只做 3 种）；服务端聚合接口（现为客户端聚合，数据量大时演进）。
- portal 卡片拖拽排序 / 富卡片模板（首期纯 JSON 配置）；portal 与 `AppMenuItem(type:'portal')` 的强绑定（现为独立 pageId 导航）。
- 图表数据源走 `dataSources[]` 声明式通道（现经 modelId 直连 + 静态 data 两通道）。
- mp 真机验证（SVG data URI 在微信 `image` 的兼容性未验，环境无开发者工具）。

### 7.5 实绩（2026-10-20）

- **代码**：schema（`PortalPageConfig`/`PortalCard`/`portal?` + 软校验 3 例）、materials（`chart/chart-svg.ts` 纯函数 + `chart/index.vue` + `statistic/index.vue` + meta order 4/5）、renderer（`lc-node.vue` 2 分支 + 新建 `uni/lc-portal-page.vue` + `exports` 补子路径）、runtime（`view/index.vue` 三态分发 + `onOpenUrl` + `pages.json` easycom）、designer（`schema-ops.updatePortalConfig`/`setPageType`、`store.setPortalConfig`、`PropsPanel` 门户区块、物料图标 Chart/Statistic）、designer-web（门户提示条）。
- **门禁（实测）**：`typecheck` exit 0（7 包）/ `build` exit 0（5 包 Done）/ `test` **965 passed**（schema 90 + renderer 289〔20 文件〕 + server 146 + designer 318 + expression 117 + tokens 5）/ `coverage` **96.23 · 87.87 · 95.99 · 96.23** exit 0（60 文件、59.53s）。
- **冒烟**：`apps/server/scripts/smoke-p3b4.mjs` **13/13 PASS**（合法 PUT → `validation.valid` → draft 回读 cards 3/Chart×3/Statistic×1 → 卡片空标题 400 `SCHEMA_INVALID` + path `portal.cards[0].title` → 复原）。
- **H5 DoD（逐条）**：门户标题「运营工作台」+ 3 卡（请假申请 badge 3 / 员工列表 / 帮助中心）；**点卡跳 `?pageId=leave_form`** ✓；柱/折/饼三形态均由 `<image>` 渲染 data URI（SVG 内含「技术部/运营部/（空）」聚合标签）；饼图静态图例「运营部 1 / 技术部 1 /（空）1」；指标卡「员工总数 3 人 ↑」；无多余空态、无 `uni.async.error`。
- **设计器 DoD**：`pageId=pgc_demo` 打开 → 页型 `portal` + 门户提示条；属性面板回填 title/columns/3 卡（pageId 与 url 分通道）；画布 3 个 Chart 空态（**零请求**）+ Statistic「员工总数 3 人 ↑」。
- **实测修掉的 4 个真实缺陷**：① `@lc/renderer` `exports` 漏 `./uni/lc-portal-page.vue`（easycom 失败，H5 假象「连接服务器超时」）→ 补 exports + `uni-exports.test.ts` 双向一致锁；② 取数 `size=160` 超服务端 `MAX_SIZE=100` → `Math.min(limit*20, RECORDS_SIZE_MAX)`；③ 饼图无标签 → 静态图例（+3 例）；④ 图例 `v-if` 打断空态 `v-if` 链 → 柱/折「图片 + 空态」并存 → 空态改独立条件（+1 例回归锁）。
- **新教训**：**B-46**（Vue warn 洪泛 → stdout 回压 → `snapshotSaved` RPC 超时；顺带勘误 B-45：vitest 2.1.9 无 `rpcTimeout`）、**B-47**（materials 改动需清 `node_modules/.vite`）、**B-48**（`uni.async.error` 假象 → 用 `import()` 抓真实错误）。

## 8. 批 5 详设：埋点与错误上报 + Schema Profiler ✅（2026-10-20 收口）

> 范围（拆批表原文）：服务端 ops 接口（埋点/错误事件表）；renderer 表达式错误/渲染错误回调上报（方案 791 兑现）；Schema 加载与渲染耗时 Profiler（设计器/runtime 可见）。
> DoD：表达式求值失败 → 不白屏 + 服务端查到错误事件；页面加载完成 → 耗时指标可见（接口回读）。

### 8.1 决策

**D-P3-12 事件模型与服务端 ops 接口**

- **一张事件表**（`<DATA_DIR>/ops/events.json`，`{version:1, events:[]}` 整表原子写，D-9 风格）：`OpsEvent { id, type:'error'|'perf'|'event', name, pageId?, pageVersion?, source:'runtime'|'designer'|'server', userId?, message?, durationMs?, detail?, at }`。
- **环形上限 500 条**（超出丢最旧并在响应 `dropped` 里计数）：埋点只用于「出问题能查到现场」，不是分析型数仓；后续接 OTel 时整模块替换。
- **接口三件套**（`protocol.md` §10.1「运维事件」）：
  - `POST /api/v1/ops/events` —— 登录即可；body `{events:[1..50]}`；返回 `{accepted,total,dropped}`（200，显式 `@HttpCode`）；
  - `GET /api/v1/ops/events?type=&pageId=&since=&limit=` —— **仅 `'*'` 管理员**；新→旧，`limit` 默认 50 上限 200；
  - `GET /api/v1/ops/summary?pageId=&since=` —— **仅 `'*'` 管理员**；`{total, byType, errors:{total,lastAt}, perf:{count,avgMs,p95Ms,maxMs}, lastAt}`（DoD「接口回读」用 perf 段）。
- **权限取舍：写开放、读收紧**。写：任何登录用户都会产生错误/性能事件，要求管理员令牌只会丢现场；`userId` 一律取令牌 `sub`，客户端传入被忽略（防冒充）。读：事件含页面 id / 错误消息 / 用户 id，属运维数据。
- **校验策略：结构性错误 400 `OPS_INVALID`，数据性超限截断**。结构（type/name/pageId/pageVersion/source/detail 形状、条数 >50、perf 缺 `durationMs`、error 缺 `message`）→ 400 且消息带 `events[i]` 下标；`message` >500、`detail` 序列化 >2000 → 截断（`…` / `{truncated,preview}`）后入库 —— **埋点不得反噬业务**。

**D-P3-13 客户端上报与「不白屏」**

- **纯逻辑队列下沉 `@lc/renderer`**（`core/ops.ts` `createOpsQueue`）：`send` 由宿主注入，批量（默认 10）/定时（2s）/失败保留本批待下次重试/超 `maxQueue` 丢最旧/`dispose` 清定时器；`push` 永不抛错。选 renderer 而非 runtime：runtime 无测试工程，队列是埋点最易错的部分（批量边界、失败重试），必须可单测。
- **runtime 适配层**（`src/ops.ts` `createUniOpsReporter`）：`uni.request` 发送（带 token，失败静默）；`meta` 为**引用** —— Schema 到手前就能创建上报器（加载失败本身要留现场），拿到版本号后回填 `pageVersion`；`error/perf/event` 三语义方法 + `flush/dispose`。
- **接线点**（`pages/view/index.vue`）：`onExprError`→`expr`、`onLoopOverflow`→`loop-overflow`、`onActionResult(!ok)`→`action`、`onUnsupported`→`unsupported-action`、Schema 加载失败→`schema-load`；`onHide/onUnload` flush。
- **不白屏**：沿用 renderer 既有兜底（单表达式失败只标 `exprError`，其余节点照常渲染；非法节点进 `skipped` 跳过），批 5 补**回归锁**（坏 props/condition/loop + 正常节点同页 → 正常节点仍可见、`exprErrors` 计数正确、非法节点计入 `skipped`）。

**D-P3-14 Profiler（设计器 / runtime 可见）**

- **controller 自计时**（宿主零插桩）：`ControllerStats { buildMs, mountMs, resolveMs, nodeCount, exprErrors, loopOverflows, skipped }`，`stats` 返回副本；`onExprError`/`onLoopOverflow` 在 controller 内包一层计数，**对外回调语义不变**。
- **展示纯函数共用**（`@lc/renderer` `core/perf.ts`）：`formatPerf`（`加载 120ms · 构建 3ms · 渲染 45ms · 挂载 8ms · 33 节点`，缺项省略）+ `roundMs` + `countNodes`；runtime 与设计器同一口径。
- **runtime**：`?perf=1` 才显示右下角只读角标（默认不打扰真实用户）；上报 `schema-load`（请求耗时）与 `render`（schema 就绪 → 首帧 nextTick）两条 perf 事件，`detail` 带 `nodes/buildMs/mountMs`。
- **设计器**：顶栏徽标 `加载 x · 渲染 y · n 节点`，hover 看采样 JSON；`openPage` 记 `schemaMs`，`LcCanvas` 在 schema 变化/首挂载的 `nextTick` 后 emit `rendered{ms,nodes}` → `store.markRender` 合并；**不上报服务端**（设计器只做本地性能可见性，避免开发期噪声污染运维数据）。

### 8.2 分层落地

| 层 | 落地 |
|---|---|
| renderer | **新** `core/ops.ts`（`createOpsQueue`）、`core/perf.ts`（`formatPerf/roundMs/countNodes`）；`core/controller.ts` +`ControllerStats`/`stats`/计时与计数包装；`index.ts` 导出 4 项 |
| runtime | **新** `src/ops.ts`（`createUniOpsReporter`）；`pages/view/index.vue` 接线 5 类事件 + 两条 perf + `?perf=1` 角标 + `onHide/onUnload` flush |
| server | **新** `src/ops/`（`ops.types.ts` / `file-ops.repository.ts` / `ops.service.ts` / `ops.controller.ts` / `ops.module.ts`）；`app.module.ts` 注册 |
| designer | `store` +`perf/perfText/markRender`、`openPage` 计时；`LcCanvas` +`rendered` 事件与采样；依赖 `@lc/renderer` 的 `countNodes/formatPerf` |
| designer-web | 顶栏性能徽标（`data-testid=designer-perf`，title=采样 JSON）；`@rendered` 接线；`style.css` 徽标样式 |

### 8.3 测试与验证

- **新增用例 41**：renderer +20（`ops.test.ts` 7：批量/定时/失败保留/丢最旧/dispose/同步异常；`perf.test.ts` 7：取整/摘要/节点数；`controller-stats.test.ts` 6：计时/计数/回调语义/`skipped`/副本）；server +15（`ops.test.ts`：鉴权、结构校验含 `events[i]`、补字段防伪造、截断、过滤排序、limit 夹取、summary 分位、空页、落盘形状、环形 500）；designer +6（`perf.test.ts`：初始/加载/失败不采样/合并/独立渲染/取最新）。
- **同步锁更新**：`exports.test.ts` 40 → **44**（新增 `createOpsQueue` + perf 3 函数）。
- **冒烟**：`smoke-p3b5.mjs` 23 项（含 designer 读 403、校验失败不落库、可重复执行的时间戳 pageId）。
- **四连 + 实测**：`typecheck` / `build` / `test` / `coverage`；H5 用坏表达式页验证「不白屏 + 事件可查 + 角标可见」，设计器验证徽标数值。

### 8.4 明确未做（批 5 口径）

- 事件表**不做检索型索引 / 全文搜索 / 按日分片**（单文件 500 条环形）；不做 OTel / Sentry 对接、告警与看板。
- 前端**不做离线补传持久化**（队列在内存，页面隐藏 flush；强杀/断网期间事件会丢，二期可落 storage）。
- 设计器不向服务端上报 perf；`source='designer'` 已在协议预留但当前无写入方。
- 渲染错误仅覆盖「表达式/循环/非法节点/加载失败/动作失败」；**Vue 组件内部抛错**未接 `app.config.errorHandler`（uni-app 三端行为不一致，留 Phase 4 稳定性专项）。
- Profiler 只有耗时与节点数，**无内存 / 帧率 / 长任务**；mp 真机未验。

### 8.5 实绩（2026-10-20）

- **门禁（实测）**：`typecheck` exit 0（7 包）/ `build` exit 0（5 包 Done）/ `test` **1006 passed**（tokens 5 + expression 117 + schema 90 + renderer **309**〔23 文件〕 + server **161** + designer **324**）/ `coverage` **96.17 · 87.84 · 95.83 · 96.17** exit 0（65 文件、52.38s）。
- **冒烟**：`apps/server/scripts/smoke-p3b5.mjs` **23/23 PASS**（上报 3 条 → 回读新→旧 + 服务端补 id/at/userId → summary `byType`/`errors`/`perf avg 82.5 · p95 120 · max 120` → designer 读 403 `PERMISSION_DENIED` → perf 缺 durationMs 400 `OPS_INVALID` + `events[0]` → 51 条 400 → 失败不落库）。
- **H5 DoD（逐条）**：新建 `pgc_ops_bad`（正常文本 + `$expr: formData.x +`）→ 页面**仍渲染「正常节点可见」**（不白屏）；角标 `加载 91ms · 构建 2ms · 渲染 40ms · 3 节点`；`GET /ops/events?pageId=pgc_ops_bad` 查到 2 条 `expr` 错误（`nodeId=t_bad`、`expr=formData.x +`、消息「意外的表达式结束（13 列）」）+ 2 条 perf；`GET /ops/summary` 返回 `perf {count:2, avgMs:48, p95Ms:69, maxMs:69}`。
- **门户回归**：`pgc_demo&perf=1` → 三卡 + 柱/折/饼 + 饼图图例 + 指标卡全在，角标 `加载 172ms · 渲染 95ms · 5 节点`；去掉 `perf=1` → 角标不渲染（`?.perf=1` 开关生效）。
- **设计器 DoD**：打开默认页 → 顶栏 `加载 331ms · 渲染 73ms · 34 节点`，`title` 含 `{"schemaMs":331,"nodes":34,"renderMs":72.7}`；画布 34 节点正常。
- **实现中修掉的细节**：首帧采样时异步 `onMount` 尚未结束 → `mountMs=0` 显示「挂载 0ms」→ runtime 角标把 0 视为未采到（不展示）；设计器侧不展示 mount。

---

*本文档随批次推进回写状态；批次决策编号 **D-P3-x**，教训/偏差沿台账 B-xx/D-xx 全局编号。*
