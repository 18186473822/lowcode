# Phase 2 落地方案 —— 企业级能力（拆批 + 批次详设）

> **状态**：**批 1 ✅ + 批 2 ✅ + 批 3 ✅ + 批 4 ✅ + 批 5 ✅ + 批 6 ✅ + 批 7 ✅ 已完成 —— Phase 2 七批全部收口**（批 1~5 均 2026-10-14；批 6 于 2026-10-15 完成（双账号 DoD 四点全过）；批 7 于 2026-10-15 完成（请假申请三页 Demo 全流程十步留档 + mp 分包产物验证），出口判据「30 分钟搭出申请-列表-详情；小程序端跑通（产物级，真机受环境限制 L-5）」达成，见 PROGRESS「已实现 19~25」）｜ **下一批**：无（Phase 2 完结，后续为 Phase 3「流程与体验」或环境尾巴 mp 真机/CI 实跑）｜ **前置**：Phase 1 主线已收口（出口判据 1/2/3 全通，见 PROGRESS「已实现 18」）｜ **日期**：2026-10-15

## 1. 目标与出口判据（主方案 Phase 2 原文）

**出口判据**：业务人员 30 分钟内搭出一个「申请-列表-详情」完整应用；小程序端跑通。

**事项表**：数据模型引擎（可视化建模 + 字段引用检查）｜ 物料补到 30 个 ｜ 列表/详情标准页（`type=list|detail` 配置化）｜ 联动与表达式面板 ｜ 撤销重做/大纲树/复制粘贴 ｜ 版本管理（历史/回滚/diff）｜ 权限体系（RBAC + 页面/按钮/数据行级）｜ 多端打包。

## 2. 现状盘点（2026-10-14 实测调研结论）

| 层 | 已有（Phase 0/1 遗留资产） | 缺口（Phase 2 要补） |
|---|---|---|
| 协议（`packages/schema`） | ✅ `ModelSchema`/`FieldSchema`/`FieldType` ×15（含 enum/relation/file/user/dept）+ `permissions`/`dataScope`/`formPageId`/`listPageId`；✅ `validateModel` 校验器；✅ `PageType` 含 `list/detail/portal` + `ListPageConfig`（modelId/filter/sort/columns/cardTemplate/pagination/search/detailPageId 全字段） | 协议基本**零缺口**（Phase 0 设计时已前瞻），仅随批次补校验细节 |
| 服务端（`apps/server`） | ✅ `GET /models`、`GET/PUT /models/:id`（upsert + 校验）；✅ records 动态 CRUD ×4（filter/sort/page 内存过滤，方案 B）；✅ 页面 publish/**rollback**/versions | ⬜ `DELETE /models/:id`；⬜ 方案 A 动态表（自动 SQL）——**本 Phase 不做**，沿方案 B（D-9）；⬜ datasources ×2、流程 ×3（见 §5 范围外） |
| 渲染引擎（`packages/renderer`） | ✅ form 页渲染全链路（联动/校验/动作/数据源）；✅ **`type=list\|detail` 渲染**（Phase 2 批 2：`lc-list-page`/`lc-detail-page` + datasource model GET 修复） | ⬜ `cardTemplate` 自定义卡片、`filter` 表达式过滤、`search.fields` 字段限定（批 2 未做项，见 PROGRESS「已实现 20」） |
| 运行时壳（`packages/runtime`） | ✅ 登录/菜单/`pageId` 路由（view 页）；✅ **view 按 `type` 分发 + `rid` 路由参数 + 标准页跳转接线**（批 2） | ⬜ 下拉刷新（`meta.pullDown`）与触底加载（批 2 以「加载更多」按钮替代） |
| 设计器（`packages/designer`） | ✅ 批 1~5（画布/拖拽/属性/字段绑定/必填联动/动作绑定）；✅ `DesignerApi.listModels/getModel`（批 4 注入）；✅ **模型可视化建模 UI**（Phase 2 批 1：视图切换 + ModelPanel + model-ops 纯函数 + putModel）；✅ **撤销重做/大纲树/复制粘贴**（Phase 2 批 4，D-P2-7 快照双栈） | ⬜ list 页配置面板、版本 UI、权限 UI |
| 物料（`packages/materials`） | ✅ **30 个（批 3 完成 2026-10-14）**：META 13→31（展示 30），`FieldType` 全集对齐 + 5 项明确不做（组织服务/真文件协议/省市区/Tab 容器/Icon 字体包，见 PROGRESS D-P2-4） | — |

**结论**：Phase 2 不是「从零建」，而是把 Phase 0 前瞻协议**逐层兑现**；服务端改动很轻（多为 UI/渲染层），主战场在 designer 与 renderer。

## 3. 批次拆分（7 批，6 周）

| 批 | 内容 | 依赖 | DoD（验收） |
|---|---|---|---|
| **批 1：模型可视化建模** ✅ **2026-10-14 完成** | 设计器内「数据模型」管理视图：模型列表 + 模型编辑器（字段表格增删改：key/name/type/required/enum options…）+ `DesignerApi.putModel` 保存链路。服务端**零改动**（PUT upsert + validateModel 已有）。决策 **D-P2-1**（视图切换不新开应用） | Phase 1 批 4 的 `listModels/getModel` 注入 | **DoD 五点全过**：列表列真实模型 → 新建 `m_leave`（enum 3 选项 / number required / text）→ 保存 → 服务端字段逐项核对 + 往返一致；门禁红字不发 PUT；回画布无损；designer 测试 135→**167**（+32）、全仓 **609 passed**、coverage **96.30/87.50/96.45/96.30** exit 0；详见 PROGRESS「已实现 19」 |
| **批 2：列表/详情标准页** ✅ **2026-10-14 完成** | renderer 支持 `type=list\|detail`（`ListPageConfig` 驱动：records 查询 + columns/cardTemplate 渲染 + 分页/搜索/下拉）；runtime view 页按 `type` 分发；设计器 list 页**配置面板**（非拖拽：选模型/列/搜索/detail 跳转）。决策 **D-P2-2**（协议补 `DetailPageConfig` + 跳转事件上抛不扩 RuntimeHost）、**D-P2-3**（新建页 name 残留撞名，随批 3/4） | 批 1（列表页要选得到模型） | **DoD 五点全过**：配置发布 v1 → 服务端回读逐项一致 → 列表页 2 条记录中文列名 → 点行进 detail（rid 定位 + 返回）→ 表单提交后列表即时可见（3 条 createdAt:desc）；schema 66→**72**、renderer 161→**179**、designer 167→**183**、全仓 **649 passed**、coverage **96.41/87.43/96.67/96.41** exit 0；服务端零改动；详见 PROGRESS「已实现 20」 |
| **批 3：物料 12→30** ✅ **2026-10-14 完成** | 日期时间、人员/部门选择器、级联、文件、Detail 描述组、Tabs、Cell 等（对齐 `FieldType` 全集映射）；设计器 setter 补齐余量（optionList/color） | 批 2（List/Detail 物料随批 2 首做） | **DoD 五点全过**：面板 30 项 6 分组 → 画布 32 遮罩 + 拖入 → 发布 demo v13 → H5 全渲染（5 类占位 + 无未知组件 + console 零错误）+ Rate/Checkbox 受控交互 → setter 写回 → 服务端回读 v13·31 节点；META 13→31、映射 11→29、测试 **649 → 689 passed**（renderer 210 / designer 192）、coverage **96.21/87.57/96.21/96.21** exit 0；服务端/协议零改动；决策 **D-P2-4/5/6**；详见 PROGRESS「已实现 21」 |
| **批 4：设计器可用性** ✅ **2026-10-14 完成** | 撤销重做（immer 双栈 → **D-P2-7 改不可变快照双栈，不引 immer**：`watch(schema)` 单一入栈接缝 + 栈上限 50 + `replaceSchema` 吞栈清栈）、大纲树（左栏「物料/大纲」页签，双向联动）、复制粘贴（内存剪贴板跨页保留 + `remapIds` 换 id + 三定位规则 + `keyboard.ts` 快捷键分发）；顺手 **D-P2-3**（新建页 name = pageId） | 独立（可与 2/3 并行） | **DoD 两硬点全过**：① 10 步操作（粘贴×10，34→44 行）Ctrl+Z×10 精确回 34、Ctrl+Shift+Z×10 回 44，按钮态全程正确；② 复制 → 新建 `p_b4_test` → 粘贴成功（剪贴板换页保留、新 id、内容同）；另：大纲双向联动/折叠/删除 + 服务端回读 `name=p_b4_test`（D-P2-3 实证）+ Delete 键回归 + console 零错误；designer 192→**223**（+31）、全仓 **720 passed**、coverage **96.36/87.55/96.5/96.36** exit 0；详见 PROGRESS「已实现 22」 |
| **批 5：版本管理 UI** ✅ **2026-10-14 完成** | 版本历史列表/回滚/对比 diff（**D-P2-8 实查：rollback 接口与版本数据已有、列表查询端点缺 → 补 `GET /pages/:id/versions` 轻量端点**；**D-P2-9** 自研结构化 `diffSchema` 零依赖，基线 = 当前画布） | 独立 | **DoD 全过**：p_b4_test 连发 v1~v3 →「历史」3 行倒序 + 当前徽标 → 对 v1 diff **2 处逐字命中实际改动**（+ 回滚后 0 差异空态）→ 两步确认回滚 → 画布回 v1 + undo 栈清 → **服务端回读 draft 深等 v1、currentVersion=3、列表 [3,2,1]**（B-35）+ console 零错误；designer 223→**257**、server 98→**101**、全仓 **757 passed**、coverage **96.51/87.8/96.67/96.51** exit 0；详设见 §9、PROGRESS「已实现 23」 |
| **批 6：权限 RBAC** ✅ **2026-10-15 完成** | 角色/菜单授权 + 页面/按钮级 + 数据行级（`dataScope`）；bootstrap 带权限、壳层守卫。**D-P2-10** rbac.json 单文件配置（`'*'` 通配 + 无条目=全员可见 + 种子回退）、**D-P2-11** `RbacService` 四层判定单一事实源（schema 守卫 403 `PAGE_FORBIDDEN` / perms 并集下发 + 整节点不渲染 / CRUD 403 `PERMISSION_DENIED` / dataScope self·`'*'` 豁免）、**D-P2-12** RbacPanel 第三视图 + 节点 perm setter + 模型数据权限区块 | 批 2（行级权限作用于列表） | **DoD 四点全过（双账号实测）**：①页面级 `pages:{p_emp_list:['admin']}` → admin 菜单 5 页 vs designer 4 页 + 直达 403「无权访问该页面」 ②按钮级 emp_form `perm=emp_submit` **发布 v4** → admin `'*'` 渲染 / designer `[]` 整按钮不渲染 ③行级 `dataScope=self` → admin 3 条 vs designer 0 条（测完回 all） ④rbac.json 服务端回读两角色 + 角色编辑门禁/保存/perms 即时生效；designer 257→**281**、server 101→**115**、全仓 **795 passed**、coverage **96.62/87.87/96.77/96.62** exit 0；**D-14 收口**（bootstrap 补 perms）；记 B-38/39/40；详设见 §10、PROGRESS「已实现 24」 |
| **批 7：出口判据 Demo + 多端** ✅ **2026-10-15 完成** | 30 分钟「申请-列表-详情」全流程 Demo（请假申请 = 本 Phase 产物集大成）；小程序分包/包体积/真机（L-5）。**B-41** 物料 defaultProps 6 处 `$expr:` demo 残留清理；**D-P2-13** 受控物料回显兜底（renderer `bindProps`：字段绑定物料 value 未配置时自动读 `formData[name]`，存量页面同步受益）；demo 页挪 `subPackages{root:'pages-demo'}` + `build:mp-weixin` 产物验证（主包 209.7KB = 2MB 限 10.2%、分包 1.33KB）；记 B-42（workspace 聚合 coverage 限并发继承不可靠 → 停 dev 服务 + CLI `--maxWorkers`） | 批 1~6 汇合 | **出口判据全通 + Demo 脚本十步留档**：菜单三页 → 空表单必填拦截 → Picker 选「事假」回显（D-P2-13 实证）→ 提交「提交成功」→ 服务端落库 1 条（B-35）→ 列表 1 条 → 点行 rid 详情 → 返回闭环；renderer 210→**214**、全仓 **799 passed**、coverage **96.62/87.91/96.77/96.62** exit 0；mp 真机维持 L-5 尾巴（环境无微信开发者工具）；详设见 PROGRESS「已实现 25」 |

**并行关系**：批 1→2 是主链；批 4/5 独立可插空；批 3 与批 2 有交集（List/Detail 物料随批 2 先行）；批 6 在 2 之后；批 7 汇合。

## 4. 批 1 详设 —— 模型可视化建模（2026-10-14 开工）

### 4.1 D-P2-1：模型管理 UI 形态 —— 设计器内嵌视图切换（不新开应用）

| 候选 | 说明 | 结论 |
|---|---|---|
| A. 独立「模型管理」子应用 | 新工程/新路由/共享登录态 | ❌ 工程成本高，Phase 2 出口判据是「30 分钟搭应用」的连续流，模型管理是高频前置动作，割裂体验 |
| **B. 设计器内视图切换** | 顶栏「数据模型」按钮 ↔ 画布视图切换，同一应用复用登录态/布局/`DesignerApi` | ✅ **选 B**：改动收敛在 designer 包 + designer-web 顶栏；与批 4「大纲树」等面板同模式扩展 |

### 4.2 范围与落点

| 落点 | 变更 |
|---|---|
| `packages/designer` | **新** `panel/ModelManager.vue`（视图切换下的模型列表：GET 摘要 + 新建/打开/删除）与 `panel/ModelEditor.vue`（字段表格：行增删/上下移，列 = key/name/type 下拉/required switch/enum options 编辑；顶层 name/code 输入）；**store** 扩模型编辑态（`models[]`/`editingModel`/`modelDirty`/`putModel` action）；**schema-ops 之外新纯函数** `model-ops.ts`（字段行增删改/校验：key 唯一、必填项齐全）——沿 D-A3「视图只发意图」纪律 |
| `packages/designer/src/api.ts`（DesignerApi 接口） | 扩 `putModel(model: ModelSchema)`（批 4 已有 listModels/getModel） |
| `apps/designer-web/src/api.ts` | 实现 `putModel` → `PUT /models/:id`（Bearer 同款） |
| `apps/designer-web/src/App.vue` | 顶栏「数据模型」切换按钮 |
| 服务端 / 协议 | **零改动**（PUT upsert + `validateModel` 已就位） |

### 4.3 边界（本批不做）

删除模型接口（`DELETE /models/:id`，防误删牵连记录，留批 6 权限后评估）；relation 字段的可视化关联配置（type 可选但 refModel 编辑留占位）；字段拖拽排序（用上下移按钮）；模型 diff/版本（批 5）。

### 4.4 DoD

1. 浏览器实测：顶栏「数据模型」→ 列表显示真实模型（`m_employee` 含字段数）；
2. 新建 `m_leave`：字段 `leaveType`（enum，选项 事假/病假/年假）、`days`（number + required）、`reason`（text）→ 保存成功提示；
3. 服务端核对：`GET /models` 含 `m_leave`；`GET /models/m_leave` 字段 key/name/type/required/options 逐项一致；
4. 非法输入被拦：重复 key / 空 key 红字提示，保存不发 PUT；
5. designer 新增单测（model-ops 纯函数 + 面板交互）；`pnpm -r typecheck/build/test` + `pnpm coverage` 全绿；回画布编辑 emp_form 不受影响。

## 5. 范围外声明（沿主方案与台账既有结论）

数据源配置管理 ×2 接口、流程类 ×3 接口（`POST /flows/...` 等）不在本 Phase 7 批内（审批流属 Phase 3「流程与体验」）；方案 A 动态表（自动 SQL）不做（沿 D-9 方案 B JSON 存储）；portal 门户页型不在出口判据路径上（菜单即 Phase 1 的 bootstrap 分组，够用）。

## 6. 与主方案一致性声明

| 主方案条目 | 本方案处理 |
|---|---|
| Phase 2 事项「数据模型引擎（可视化建模 + 字段引用检查）」 | ✅ 可视化建模 = 批 1；字段引用检查 = 批 2 **部分落地**（validate 既有 `list.modelId` + 本批补 `detail.modelId` 必配校验；**columns/fields 引用字段的存在性校验未做**——无效列运行时降级回退 key 不报错，留批 3 或后续补） |
| 事项「物料补到 30 个」 | ✅ **批 3 完成（2026-10-14）**（List/Detail 随批 2 先行；18 新物料对齐 `FieldType` 全集，见 PROGRESS「已实现 21」与 D-P2-4） |
| 事项「列表/详情标准页」 | ✅ 批 2 核心 |
| 事项「联动与表达式面板」 | ⚠️ **收窄**：expression setter 自动补全与跨字段校验并入批 4 可用性批次（表达式引擎与依赖收集 Phase 0 已有，本 Phase 只补面板体验） |
| 事项「撤销重做/大纲树/复制粘贴」 | ✅ 批 4 |
| 事项「版本管理」 | ✅ 批 5（rollback 服务端已有；**D-P2-8 补 `GET /pages/:id/versions` 列表端点** + D-P2-9 自研 diff，非纯 UI） |
| 事项「权限体系」 | ✅ 批 6 |
| 事项「多端打包」 | ✅ 批 7（含 mp 真机 L-5 尾巴收口） |
| 出口判据「30 分钟搭出申请-列表-详情；小程序端跑通」 | ✅ 批 7 汇合验证（Demo 脚本照 Phase 1 惯例留档 PROGRESS） |

## 6B. 批 3 详设 —— 物料 12→30（2026-10-14 定稿并**当日完成**，DoD 五点全过）

**目标**：展示物料 12 → **30**（META 13 → 31，Page 不可拖不计展示数），对齐 `FieldType` 全集映射与方案缺口清单；设计器 setter 补齐余量。服务端**零改动**、协议**零变更**（`MaterialSchema` 已够用）。

**18 个新物料清单**（对齐列注明动机；`D-P2-x` 决策随 PROGRESS 回写）：

| # | name | 标题 | category | 对齐依据 | 实现要点 |
|---|---|---|---|---|---|
| 1 | `DatePicker` | 日期选择 | form | FieldType `date` | `<picker mode="date">`（shim 既有） |
| 2 | `DateTimePicker` | 日期时间 | form | FieldType `datetime` | date + time 两个半宽 picker 拼值 |
| 3 | `MoneyInput` | 金额输入 | form | FieldType `money` | digit 输入 + ¥ 前缀 |
| 4 | `Checkbox` | 多选 | form | FieldType `enum`(multi) | **纯 view 模拟**（shim 无 checkbox-group，零新增 shim） |
| 5 | `Picker` | 选择器 | form | 通用单列 | `<picker>` + options |
| 6 | `UserPicker` | 人员选择 | form | FieldType `user`；方案缺口清单 | 静态 candidates（组织服务未有，见未做） |
| 7 | `DeptPicker` | 部门选择 | form | FieldType `dept`；方案缺口清单 | 同上 |
| 8 | `Cascader` | 级联选择 | form | FieldType `relation`；方案缺口清单 | **逐级 picker 链**（picker-view 无 shim，双端可用优先） |
| 9 | `FileUpload` | 文件上传 | form | FieldType `file`；方案缺口清单 | `input type="file"` + 文件名列表回显 |
| 10 | `Detail` | 描述组 | data | 方案缺口清单；FieldType `json` 展示 | 只读键值对，items 走 textarea JSON |
| 11 | `Cell` | 单元格 | data | 方案缺口清单 | label/value/arrow + emit click |
| 12 | `List` | 列表 | data | 方案缺口清单 | items → Cell 行 + emit itemClick |
| 13 | `Tabs` | 标签页 | nav | 方案缺口清单 | items + active 高亮 + emit switch（面板嵌套容器留后续） |
| 14 | `SearchBar` | 搜索框 | nav | 企业高频 | input + emit update/confirm |
| 15 | `Tag` | 标签 | basic | 常用展示 | text + 预设色 type |
| 16 | `Icon` | 图标 | basic | 常用展示 | 内置字符图标集（不引字体包） |
| 17 | `Progress` | 进度条 | feedback | 常用反馈 | percent 宽度条 |
| 18 | `Rate` | 评分 | feedback | 常用反馈 | ★ 点选 emit update |

**实现原则**：① 表单类统一契约 `props{name,label,value,required,disabled,error}` + `emit('update',{name,value})`（受控 `$expr: formData.*`，与现 7 物料一致）；② 目录 `src/<kebab>/index.vue`，easycom 兜底自动解析（runtime 零配置）；③ 样式沿 input 物料色板与 rpx 规范；④ 展示类（data/nav/basic/feedback）无字段契约，纯 props 展示 + 各自交互 emit。

**setter 余量**（PropsPanel 现有 input/number/switch/select/textarea 5 种，SetterType 共 13）：批 3 补 **optionList**（选项行增删改——Radio/Select META 已声明的欠账 + Checkbox 需要）与 **color**（Tag/Progress）；`expression` 不补（批 4 D-A11 字段绑定区已覆盖其语义）；`slider/ruleEditor/fieldPicker/dataSourcePicker/eventBinder` 留后续批。

**接入四处**：materials 组件 ×18 + meta（新建 `data.ts`/`nav.ts`，form/basic/feedback 追加）+ renderer `lc-node` v-if 链 ×18 + designer `material-map` ×18（designer-web 面板/属性自动跟随 META_LIST）。

**测试**：renderer `test/uni` 30 物料分发遍历（无「未知组件」= 分发链完整性锁）；designer META_LIST 同步测试（31 项/名称唯一/新名全在/分类合法）+ PropsPanel optionList/color 用例。materials 包沿现状不入 vitest 聚合（覆盖率排除，渲染正确性走遍历 stub 测试 + H5 实测）。

**DoD**：① 30 物料设计器面板全出现（按 6 分类）；② 画布拖入新物料可渲染可配置；③ **30 物料全渲染实测**（H5 runtime demo 页 + jsdom 遍历双口径）；④ meta 注册表同步（31 项一致性测试绿）；⑤ 四连全绿 + designer/renderer 分包覆盖 ≥90。

**本批明确未做**（随 PROGRESS 终记）：UserPicker/DeptPicker 接组织架构服务（静态候选先行）；真实文件上传协议（仅文件名回显）；Cascader 省市区内置数据（自定义 options 树）；Tab 面板容器嵌套（children 分组切换）；Icon 字体包（字符图标集）；`ruleEditor/fieldPicker/dataSourcePicker/eventBinder` 四个复杂 setter；Relation 字段的 refModel 联动选择（批 1 遗留）。

## 7. 开工前置检查清单

- [x] 本文档评审与放行（批 1 随调研完成即开工，2026-10-14）
- [x] 现状盘点完成（协议/服务端/renderer/designer 四层，§2）
- [x] 批 1 服务端前置就绪（`GET/PUT /models/:id` + `validateModel`，零改动）
- [x] 台账 PROGRESS 登记 Phase 2 批次计划（「已实现 19」+ 下一步计划）
- [x] 批 1 完成（2026-10-14，DoD 五点全过）
- [x] 批 2 完成（2026-10-14，DoD 五点全过；协议补 `DetailPageConfig` + validate 对称校验已登记 protocol.md，见 PROGRESS「已实现 20」）
- [x] 批 3 物料 12→30（✅ **2026-10-14 完成**：对齐 `FieldType` 全集 + setter optionList/color + DoD 五点全过；D-P2-3 页面名编辑**未顺手**，留批 4+）
- [x] 批 4 设计器可用性（✅ **2026-10-14 完成**：**D-P2-7** 撤销不引 immer 快照双栈 + watch 单一接缝、大纲树、跨页剪贴板 + keyboard.ts 分发；DoD 两硬点全过；**D-P2-3 已修**（新建页 name = pageId）；详设见 §8）
- [x] 批 5 版本管理 UI（✅ **2026-10-14 完成**：**D-P2-8** 补 `GET /pages/:id/versions`、**D-P2-9** 自研 `diffSchema`；DoD 全过 —— v1~v3 历史/回滚/服务端核对；**B-37** 服务端无 watch 须 build+重启；详设见 §9）
- [x] 批 6 权限 RBAC（✅ **2026-10-15 完成**：**D-P2-10** rbac.json 单文件 + 种子、**D-P2-11** 四层判定、**D-P2-12** 权限 UI 三入口；DoD 四点全过（双账号菜单差异+403 / 按钮整节点不渲染 / 行级 self / rbac.json 回读）；记 **B-38**（coverage 限并发）/**B-39**（uni hash 假象）/**B-40**（Nest 守卫 DI 链）；详设见 §10）

---

## 8. 批 4 详设 —— 设计器可用性：撤销重做 / 大纲树 / 复制粘贴（2026-10-14 定稿开工，✅ **当日完成**，DoD 两硬点全过 —— 实测与数字见 PROGRESS「已实现 22」）

**范围**（§3 拆分原文）：撤销重做（immer 双栈）、大纲树、复制粘贴；**顺手**：D-P2-3 新建页撞名。
**DoD**（§3 原文两硬点）：① 10 步操作撤销/重做准确；② 剪贴板跨页粘贴。

### 决策 D-P2-7：撤销不引 immer，用「不可变快照双栈」

- 现状 schema-ops **16 个 op 全线 clone-then-replace**（`schema-ops.ts` 递归深拷贝保留 undefined），store 内 `schema.value` 恒整替、旧引用永不被原地修改 —— **快照栈直接存 `PageSchema` 引用即获得 immer 等价的不可变历史**，零结构共享但零语义风险。
- 引 immer 代价：新依赖 + 16 op 全改 `produce` 形态（或外层包装仍需全量深拷贝防 mutation 逃逸）；收益仅省内存 —— schema KB 级、**栈上限 50 步**，全量快照 < 1MB 可忽略。
- 结论：`past: PageSchema[]` / `future: PageSchema[]` 双栈 + 上限 50（超出丢最旧），**零新依赖**。

### 入栈机制：watch 单一接缝（防漏 13 个变更入口）

- store 内 `watch(schema, (next, prev) => …)`（Vue 默认 pre flush：同一同步 action 内的连写 —— 如 `setProp` 的 required 联动两连赋值 —— **合并为一次入栈**）。
- 回调语义：`suspendHistory` 为真 → 吞掉本次（不入栈、消费 flag）；否则 `past.push(prev)` + `future=[]`。
- `suspendHistory` 置位者 = **换页/重置类**入口：`openPage` / `newPage` / `replaceSchema` / `undo` / `redo` 自身 —— 换内容不是编辑，不入栈；`openPage`/`newPage`/switchView 换页时**清空双栈**（历史跨页无意义，跨页撤销会把 A 页 schema 覆盖到 B 页 = 数据事故）。
- `undo()`：`future.push(current)` → `schema.value = past.pop()`（suspend 吞 watch）→ `touch()` 重校验 → 清理失效选中（`selectedId` 不在恢复后的树中 → `clearSelect`）；`redo()` 对称。
- getters：`canUndo` / `canRedo`（按钮禁用态）；`clipboard` **不随换页清空**（DoD ② 跨页粘贴的前提）。
- 快捷键与删除键同挂 `App.vue onKey`（输入态排除逻辑复用）：`Ctrl/Cmd+Z` 撤销、`Ctrl/Cmd+Shift+Z` 或 `Ctrl+Y` 重做、`Ctrl/Cmd+C/X/V` 复制/剪切/粘贴；键位分发逻辑抽 `@lc/designer` 内纯函数 **`core/keyboard.ts`**（event → 意图枚举），App 只接线 —— 可单测。

### 大纲树（左栏 Tab「物料 / 大纲」）

- 新组件 `panel/OutlineTree.vue`：从 `store.schema.root` 递归渲染树行（缩进 + 有 children 才有展开箭头 + META label（如「单行输入」）+ 小字 componentName）；root 行显示「页面」。
- 交互：点击行 → `store.select(id)`（画布选中 ↔ 树高亮双向联动）；行 hover 显删除按钮（root 除外，复用 `removeById`）；本地展开态 `Set`（默认全展开），**选中变化自动展开父链**（复用 `schema-ops.ancestorIds`）。
- 左栏顶部两页签切换（`MaterialPanel` / `OutlineTree` 互斥）；**不做**：大纲树内拖拽排序（画布/属性面板已有排序入口）、跨树多选。

### 复制粘贴（内存剪贴板，跨页保留）

- `schema-ops` 新增纯函数：
  - `cloneSubtree(node)` —— 导出既有递归 clone 的节点级包装；
  - **`remapIds(node)`** —— 递归 `generateNodeId()` 重映射整棵子树 id（防粘贴 id 冲突，validate 的重复 id 门禁是硬约束）；
  - **`pasteNode(schema, clipboard, hit?)`** —— 粘贴定位三规则：① 有选中且选中是**容器**（有 `children`）→ 插其 children 末尾；② 有选中且为叶子 → 插其**同级之后**；③ 无选中 → root 末尾 —— 返回 `OpResult`（粘贴根新 id 供选中）。
- store：`clipboard: NodeSchema | null` + `copyById(nodeId)`（root 不可拷）/ `cutById`（copy + removeById）/ `paste()`（落 `pasteNode` → 选中新根 → touch）。
- 入口：**顶栏「复制/剪切/粘贴」按钮**（可视、可实测）+ 快捷键；粘贴按钮 disabled 态由 `clipboard` 有无驱动。
- 跨页：`openPage`/`newPage` **不清 clipboard** —— 复制 → 打开另一页 → 粘贴成功 = DoD ②。

### D-P2-3 顺手修

- `newPage(id)`：`const s = demoPage(); s.name = target; replaceSchema(s)` —— 新建页 `schema.name` 从模板名「画布演示」改为 **pageId**，菜单撞名消除（name 编辑入口仍无，仅默认值修复）。

### 明确不做（本批）

- 大纲树拖拽排序 / 多选；跨标签页与系统剪贴板（内存剪贴板口径）；历史持久化（刷新即清）；immer 结构共享（D-P2-7 否决）；右键上下文菜单（顶栏按钮 + 快捷键代替）；模型视图（ModelPanel）内的 undo（只对页面 schema 栈）。

### 测试与验收

- 测试：store undo/redo（**10 步操作序列** → undo×10 回初始 → redo×10 回终态、栈上限 50、换页清栈、失效选中清理、canUndo/canRedo）；`pasteNode`/`remapIds` 纯函数（嵌套 id 全换新、三定位规则、root 不可拷）；`keyboard.ts` 意图分发（含输入态不拦截）；OutlineTree（树行数 = 节点数、点击互选中、高亮、折叠、父链自动展开、删除联动）。
- DoD 实测：① 浏览器 10 步操作（拖入×2 / 改 label / 删除 / 移动 / 改样式…）→ Ctrl+Z×10 逐级回退至初始 → 重做×10 回终态；② 复制节点 → 新建页 → 粘贴 → 新 id 内容同；③ 大纲树与画布双向联动；④ 新建页 name = pageId。
- 目标数字：测试 689 → 预计 **+30 上下**；coverage 门禁 90/85/90/90 不降。

---

## 9. 批 5 详设 —— 版本管理 UI：历史列表 / 回滚 / 对比 diff（2026-10-14 定稿开工，✅ **当日完成**，DoD 全过 —— 实测与数字见 PROGRESS「已实现 23」）

**范围**（§3 拆分原文）：版本历史列表、回滚、对比 diff（服务端 rollback/versions「已有」）。
**DoD**（§3 原文）：**发布 v1~v3 → 历史可见 → 回滚 → 服务端核对**。

### 现状与缺口（调研结论）

- 服务端已有：`POST /pages/:id/rollback`（历史版 → 新草稿，3 个测试在案）、`GET /pages/:id/schema?version=vN`（按版取全文）、`publish` 固化 `page_versions`；
- **缺**：版本**列表查询接口**——`versions` 数据（`PageVersionRecord[]`）只存于 repo，HTTP 层无端点 → 历史面板拿不到列表。台账「rollback/versions 已有」指数据结构与回滚接口已有，**列表端点需补**。

### 决策 D-P2-8：服务端补只读 `GET /pages/:id/versions`

- 返回轻量列表（**不含 schema 全文**）：`{pageId, status, currentVersion, versions: [{version, createdBy, createdAt, note}]}`，**倒序**（v3 在前）；查看某版全文走既有 `GET :id/schema?version=vN`。
- 服务端改动仅 controller + service 各一个方法（repo 数据已有，零存储改动）；**协议变更登 protocol.md**（新端点）。

### 决策 D-P2-9：自研结构化 diff（零依赖，不引 JSON diff 库）

- `designer/src/core/schema-diff.ts`：**`diffSchema(before: PageSchema, after: PageSchema): DiffEntry[]`** —— 纯函数，before = 历史版 vN、after = 当前画布（**基线口径 = 内存当前 schema**，用户所见即所比，省一次拉取）。
- 对齐键 = **节点 id**（设计态 id 稳定）；条目四类：
  - `add` / `remove`：节点仅一侧存在 —— **子树只报顶层**（父已报则跳过子，防噪音）；
  - `change`：`componentName` 变化，或 `props` 键并集逐键对比（值 `JSON.stringify` 比较，截断展示；消失的键 after 显示「（无）」）；
  - `move`：同 id 节点的 `parentId`/同级 `index` 变化（root 无 move）。
- 深比较仅到「对象值整体 JSON」粒度（`style` 不逐键展开）——版本 diff 关心语义变化，不追内部细节。

### 版本面板（手写 modal，不引 Element Plus、不切视图）

- 形态选型：整页视图切换（批 1 模型面板同款）丢画布上下文、右栏 Tab 过挤 —— **顶栏「历史」按钮 → 居中 modal 弹层**（手写 fixed 遮罩 + 面板，与既有手写 CSS 同风格；EP 实际未使用不引入）。
- 组件 `panel/HistoryDialog.vue`：
  - 打开 → store `openHistory()` 拉列表；行 = `vN 徽标 + 时间 + 作者 + note + 当前发布标记`；空历史 / 加载失败 / 加载中三态；
  - 行操作 **「对比当前草稿」** → store `compareVersion(v)` 拉 vN 全文 + `diffSchema` → 条目列表（add 绿 / remove 红 / change·move 橙，`节点名 · props.label: "旧" → "新"`），无差异空态；
  - 行操作 **「回滚到此版」** → **内联两步确认**（点一次变红「确认回滚到 vN？」+ 取消；不用 `window.confirm` 便于组件测试）→ store `rollbackTo(v)`；成功 → `openPage()` 重载回滚后草稿（历史栈随 `replaceSchema` 清空、saveState 回 idle）+ 关弹窗 + `statusText` 提示「已回滚到 vN（草稿，需重新发布生效）」；
  - **不做**：发布备注 note 编辑（publish 沿现状固定文案）、vN vs vM 互比（只做 vs 当前画布）、草稿自动快照（历史仅发布版）、删除版本（服务端无接口）、版本详情整页 JSON 查看（diff 条目够用）。

### 接口与状态接线

- `DesignerApi` 扩三处（**接口变更由 typecheck 锁 designer-web 同步实现**）：
  - `getSchema(pageId, version?)` —— 加可选 `version`（透传 `?version=vN`，既有调用不传不受影响）；
  - `listVersions(pageId)` → 上述列表响应；
  - `rollback(pageId, version)` → `{rolledBackTo}`。
- store 新状态：`historyOpen` / `versions` / `versionsLoading` / `versionsError` / `diffEntries` / `diffVersion`；actions：`openHistory` / `closeHistory` / `compareVersion` / `rollbackTo` / `clearDiff`。
- designer-web `api.ts` +3 方法实现（fetch 同款 `req` helper）；App.vue 顶栏 +「历史」按钮。

### 测试与验收

- **server**（api.test，+约 5）：列表倒序与字段齐备、未发布空列表、页 404、回滚既有 3 用例回归。
- **designer**（+约 19）：
  - `schema-diff.test.ts`（+7）：空 diff / add / remove / 子树只报顶层 / change 多键与键消失 / componentName 变 / move 换父换序 / 组合场景；
  - store（+6）：openHistory 拉取与失败态、rollbackTo 成功重载（mock getSchema 返回回滚内容）+ 失败、compareVersion 产出 diffEntries、`getSchema` 的 version 参数透传、关闭清 diff；
  - `HistoryDialog.test.ts`（+6）：列表行渲染与倒序、当前版标记、三态（空/错/载）、对比条目渲染、两步确认回滚触发、关闭。
- **DoD 实测（浏览器）**：① 页面连发 3 版（v1→v3，每版改动可辨）→「历史」列表 **3 行倒序**可见；② 对 v1「对比当前草稿」→ diff 条目与实际改动一致；③ 回滚 v1（两步确认）→ 画布变回 v1 内容、弹窗关闭、undo 栈清空；④ **服务端核对**（B-35）：`GET schema` 的 draft === v1 内容 + `rolledBackTo=1`；⑤ console 零错误。
- 目标数字：全仓 720 → 预计 **+30 上下**（server ~+5、designer ~+19、其余既有回归不动）；coverage 门禁 90/85/90/90 不降。

---

## 10. 批 6 详设 —— 权限 RBAC：角色/页面/按钮/数据行级（2026-10-15 定稿开工）

**范围**（§3 拆分原文）：角色/用户/菜单授权 + 页面/按钮级 + 数据行级（`dataScope`）；bootstrap 带权限、壳层守卫。
**DoD**（§3 原文）：**两角色登录：菜单差异 + 按钮禁用 + 列表行过滤实测**。

### 现状与缺口（2026-10-15 实测调研）

| 层 | 已有 | 缺口 |
|---|---|---|
| 协议 | ✅ `NodeSchema.perm`（+`E_PERM_FORMAT` 校验）、`ModelSchema.permissions`（CRUD→角色数组）、`ModelSchema.dataScope`（all/dept/deptAndChild/self）**三件全在**（Phase 0 前瞻）；renderer `hasPerm` 选项与「无权限整节点不渲染」语义已实现 | ⬜ 角色数据与授权配置无存储；页面可见性无处声明 |
| 服务端 | ✅ identity（JWT/AuthGuard，`AuthUser{sub,username,roles}`）、种子两用户（admin/designer） | ⬜ 无 RBAC 存储与判定服务；`bootstrap` 不含权限（D-14）；`GET schema` 无页面守卫；records CRUD 无 `permissions`/`dataScope` 强制（台账明确未做） |
| runtime | ✅ 菜单 bootstrap / view 渲染 / 401 去登录 | ⬜ `options.hasPerm` 未注入（perm 默认全通）；403 无专门错误态；perms 无会话存取 |
| designer | ✅ 批 1「数据模型」第三视图模式（D-P2-1）；模型编辑器（仅 name/code+字段）；属性面板节点区块 | ⬜ 节点 `perm` 无 setter；模型编辑器无 `permissions`/`dataScope` 配置；无角色/页面授权 UI |

### 决策 D-P2-10：RBAC 配置集中单文件 + 角色权限点（`*` 通配）

- **`<DATA_DIR>/rbac.json`** 一份文件承载全部授权配置（沿 D-9 JSON 文件风格，FileRbacRepository 原子写同款）：
  `{ roles: [{ key, name, perms: string[] }], pages: { [pageId]: string[] } }`
  - `roles[].perms` —— 该角色拥有的**权限点**集合（与节点 `perm` 同格式 `^[A-Za-z_][\w-]*$`）；**`'*'` 为通配**（拥有全部权限点 = 超级角色，种子 admin 即 `['*']`）；
  - `pages` —— 页面可见性白名单映射：**无条目 = 全员可见**（向后兼容现状）；有条目（可为空数组）= 仅数组内角色可见（`'*'` 角色恒通）；
- 用户→角色**不动**（沿种子：admin→admin、designer→designer；UserStore 内存实现，用户管理 UI 本批不做）；
- 页面存储 `PageRecord` **零改动**（授权不混入页面内容，配置集中一处）。

### 决策 D-P2-11：四层权限判定语义（服务端单一事实源 `RbacService`）

| 层 | 判定 | 缺省行为 |
|---|---|---|
| ① 页面级（菜单+读） | `canSeePage(user, pageId)`：`pages[pageId]` 未配置 → true；配置 → user 角色并集 perms 含 `'*'` 或与白名单有交集 | **全开**（兼容既有页面/实测） |
| ② 按钮级 | 用户权限点集合（角色 perms 并集）含节点 `perm`；`'*'` 恒通；renderer 既有「无权限整节点**不渲染**」（协议 3.6，DoD「按钮禁用」按此更强口径执行并注明） | 节点无 `perm` → 通 |
| ③ 模型 CRUD 级 | `model.permissions[action]` 未声明 → 通（向后兼容）；声明 → 与 user 角色**有交集**才放行（403 `PERMISSION_DENIED`）；`'*'` 恒通 | 全开 |
| ④ 数据行级 | `model.dataScope`：`all`/缺省 → 不过滤；`self` → `createdBy === user.username`（list 追加过滤 / update·delete 命中行归属检查 403）；`'*'` 角色豁免不过滤；**`dept`/`deptAndChild` 无组织服务（沿 D-P2-4）按 `self` 保守降级**（宁少看不多看，登记偏差） | 不过滤 |

- 守卫落点：`GET /pages/:id/schema`（403 `PAGE_FORBIDDEN`）+ `bootstrap` 菜单过滤 + records 四接口（list 过滤行、update/delete 查归属、create 仅查 ③）；
- 页面写路径（PUT schema/publish/rollback/versions）与模型管理接口**不设页面可见性**（设计器仅 admin 登录，属管理面，登记边界）。

### 决策 D-P2-12：权限管理 UI = 设计器第三视图（沿 D-P2-1）+ 两处属性面板补区块

- **「权限管理」视图**（顶栏三切换：画布 / 数据模型 / 权限管理）：
  - 角色管理：列表（key/name/perms 摘要）+ 新建（key 校验同 RBAC id）+ 行编辑（name + perms **逗号分隔文本**，逐项 `E_PERM_FORMAT` 红字门禁，保存 PUT upsert）；
  - 页面授权：全页面行 × 角色勾选矩阵；**勾任意角色 = 仅这些角色可见；全部取消 = 删条目恢复全员可见**（空数组「无人可见」不作为 UI 可达状态，`'*'` 恒通兜底）；页面列表来源 = `bootstrap`（designer 复用，零新接口）；
- **节点 perm setter**（属性面板）：非 root 节点「权限点」input（顶层字段，非 props；空 = 清除；格式错由校验门禁红字拦保存，与 setProp 同口径）；`schema-ops` 新纯函数 `setNodePerm`；
- **模型编辑器补「数据权限」区块**（批 1 遗留）：`dataScope` 下拉（`all`/`self` 可选；`dept`/`deptAndChild` **置灰 +「需组织服务」提示**，防配了不生效的陷阱）+ `permissions` CRUD 四行 × 角色勾选（角色列表来自 RBAC）；
- **用户管理不做**：种子用户角色固定（UserStore 内存），角色分配 UI 无持久支撑，登记未实现。

### 接口与会话变更（协议登 protocol.md §10）

| 变更 | 内容 |
|---|---|
| **新** `GET /rbac/roles` | 角色列表 `[{key,name,perms}]`（Bearer） |
| **新** `PUT /rbac/roles/:key` | upsert 角色 `{name, perms}`（key 校验、perms 逐项格式校验，非法 400） |
| **新** `PUT /rbac/pages/:pageId` | upsert 页面授权 `{roles: string[]}`（缺省/空对象体外：`{roles: null}` 或空数组语义见上） |
| **扩展** `POST /auth/login` | 响应加 `perms: string[]`（登录即得，直达 view 页也有） |
| **扩展** `GET /apps/bootstrap` | 响应加 `perms` + `apps` 按 ① 过滤（**D-14 收口**） |
| **守卫** `GET /pages/:id/schema` | 无页面可见性 → 403 `PAGE_FORBIDDEN`（协议错误码表 +2） |

- runtime 会话：`setSession` 存 `perms`；view 页 `options.hasPerm = (p) => perms 含 p 或 '*'`（**fail-closed**：无 perms 缓存时 perm 节点全隐，进菜单/登录后刷新）；403 专门错误态「无权访问该页面」。

### 落点表

| 落点 | 变更 |
|---|---|
| `apps/server/src/rbac/`（新模块） | `rbac.types.ts`（RbacStore 契约+DI token）/ `file-rbac.repository.ts`（原子写）/ `rbac.service.ts`（permsOf/canSeePage/checkModelAction/scopeFilter 四判定纯逻辑+存储）/ `rbac.controller.ts`（3 接口）/ `rbac.module.ts`；identity（login 响应 +perms，imports RbacModule）、app.controller（bootstrap 过滤+perms）、page.controller/service（schema 守卫）、record.controller/service（四接口强制，list 签名加 user） |
| `packages/designer` | `core/schema-ops.ts` +`setNodePerm`；store +权限视图态（roles/pageAuth/编辑态/actions ~10）+ `setNodePerm` action + `DesignerApi` 扩 3（listRoles/putRole/putPageAuth，bootstrap 复用既有？——无，加 `listPages`）；`panel/RbacPanel.vue`（角色+页面矩阵）；`panel/PropsPanel.vue` 节点 perm setter；`panel/ModelEditor.vue` dataScope/permissions 区块 |
| `apps/designer-web` | `api.ts` +4 方法；`App.vue` 顶栏「权限管理」按钮 + 视图挂载 + 批次徽标改批 6 |
| `packages/runtime` | `api.ts` 会话存 perms + login/bootstrap 透传；`pages/view/index.vue` `hasPerm` 注入 + 403 错误态 |

### 测试与 DoD 实测脚本

- **server**（+约 25）：`rbac.service` 纯逻辑（permsOf 并集/`*`、canSeePage 四态、checkModelAction 未声明/交集/空数组/`*`、scopeFilter all/self/dept 降级）；api（3 接口 upsert+校验、bootstrap 过滤+perms、schema 403、records permissions 403、dataScope self list 过滤与 update 归属 403、admin `*` 豁免）；
- **designer**（+约 22）：`setNodePerm` 纯函数、store（loadRoles/saveRole/页面矩阵/perm setter/模型权限区块）、RbacPanel（角色行/编辑门禁/矩阵勾选）、ModelEditor 新区块、既有 mockApi 工厂随 `DesignerApi` 扩形状补齐；
- **renderer 零改动**（`hasPerm` 既有实现，perm 不可见语义已锁）；runtime 无单测聚合，走浏览器实测；
- **DoD 四点（浏览器 + B-35 服务端回读）**：
  1. **菜单差异**：权限视图配「p_emp_list 仅 admin」→ admin 登录菜单全量 / designer 登录缺该页；直达 URL → 403 错误态；
  2. **按钮级**：emp_form submit 节点设 perm `emp:submit`（designer 角色无此点）→ admin 可见 / designer **整按钮不渲染**（协议口径）；保存发布服务端回读 perm 落库；
  3. **行级过滤**：m_employee `dataScope=self` + `permissions.read` 含两角色 → designer 建 2 条/admin 建 1 条 → designer 列表 2 条、admin（`*` 豁免）3 条 → **改回 all 恢复**（不污染批 7）；
  4. **RBAC 持久**：`rbac.json` 回读（roles/pages 逐项）+ reload 后全链路 console 零错误。
- 目标数字：全仓 757 → 预计 **+45 上下**（server ~+25、designer ~+22）；coverage 门禁 90/85/90/90 不降。

### 本批明确不做

用户管理 UI（内存种子、角色分配无持久支撑）；角色删除与 key 重命名（防悬挂引用）；`dept`/`deptAndChild` 真实现（无组织服务，降级 self 已登记）；「无人可见」页面状态（`'*'` 恒通兜底足够）；页面写路径/模型管理接口的页面可见性（管理面仅 admin）；perm 权限点的批量收集器（手输逗号分隔，收集器留后续）；API 级细粒度权限（仅页面/节点/模型/行四层）。

---

---

## 11. 批 7 详设 —— 出口判据 Demo + 多端打包（2026-10-15 完成）

### 11.1 Demo 结构（请假申请 = 批 1~6 汇合产物）

| 页 | 页型 | 配置 | 汇合的批次能力 |
|---|---|---|---|
| `leave_form` v2 | form | Picker(leaveType·3选项)/NumberInput(days·必填)/Textarea(reason) + Button「提交请假」`actions:[{event:click,type:submit}]`；页面级 `ds_submit → m_leave` | 批 1（模型 m_leave）+ 批 3（Picker/Textarea 物料）+ 批 4（字段绑定）+ 批 5（必填联动/动作绑定） |
| `leave_list` v2 | list | modelId=m_leave、3 列、detailPageId=leave_detail | 批 1 + 批 2（标准页） |
| `leave_detail` v1 | detail | modelId=m_leave、3 字段、backPageId=leave_list | 批 1 + 批 2 |

- **十步脚本 + 用时说明**：见 PROGRESS「已实现 25」（搭建动作约 20 分钟，在 30 分钟口径内；缺陷修复另计）。
- **D-P2-13 受控物料回显兜底**（renderer `bindProps`：`value===undefined && name` 自动读 `formData[name]`）——Picker 选「事假」回显即其实证；存量表单页同步受益。
- **B-41**：物料 defaultProps 6 处 `$expr:` demo 残留全清（拖入即干净）。

### 11.2 多端打包

- demo 页挪 `subPackages{root:'pages-demo'}`（主包留 login/index/view 三页）；源码目录 `src/pages/demo` → `src/pages-demo`；菜单跳转改径 `/pages-demo/index`。
- `build:mp-weixin` 产物：主包 **209.7KB**（2MB 限的 10.2%）/ 分包 **1.33KB**；wxml 跨分包 easycom 正常。
- 构建期 Schema 扫描裁剪（方案 9.3 used-materials.json）不做——easycom 按用注册 + 余量充足；App 端打包脚本裁剪（有 App 需求再做）。

### 11.3 本批明确不做

mp 真机/微信开发者工具（L-5 尾巴维持）；enum label 映射（列表/详情显示原始值 `a` 非「事假」，字段显示映射留后续）；页面 name 手动编辑（菜单显示英文 pageId，既有记录）；App 打包脚本；物料按需裁剪流水线。

---

*本文档随批次推进回写状态；批次决策编号 **D-P2-x**，教训/偏差沿台账 B-xx/D-xx 全局编号。*
