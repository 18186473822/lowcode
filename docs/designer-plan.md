# Web 端拖拽设计器 · 落地设计方案

> **状态**：**批 1~5 已全部完成**（批 1~2 2026-10-09、批 3 2026-10-10、批 4 字段绑定 2026-10-12、**批 5 出口判据闭环 2026-10-14**，均浏览器实测）—— **主方案 Phase 1 出口判据 1/2/3 全通**；**Phase 2 批 3（2026-10-14）已补 optionList + color setter（第 6/7 种），缺口收窄为 6 种**（见 PROGRESS「已实现 21」与 D-P2-6）；**Phase 2 批 4（2026-10-14）已补撤销重做/大纲树/复制粘贴三件可用性**（D-P2-7 不引 immer 快照双栈，见 PROGRESS「已实现 22」）；**Phase 2 批 5（2026-10-14）已补版本管理 UI**（顶栏「历史」弹层：列表/两步确认回滚/`diffSchema` 结构化对比，D-P2-8 补 `GET /pages/:id/versions`、D-P2-9 自研 diff，见 PROGRESS「已实现 23」）；**Phase 2 批 6（2026-10-15）已补权限 RBAC UI 三入口**（第三视图「权限管理」RbacPanel 角色/矩阵、属性面板节点权限点 setter、模型数据权限区块，D-P2-10/11/12，见 PROGRESS「已实现 24」）｜ **日期**：2026-10-15
> **上游**：《移动端低代码平台落地方案》第六章（6.1~6.6）、Phase 1 事项表「设计器 MVP」
> **关联**：`docs/protocol.md` 第 4 章（Material 协议）、`docs/PROGRESS.md`、`packages/materials/README.md`
> **本文档定位**：主方案第六章是「设计蓝图」，本文是**可执行的落地方案** —— 盘点现状缺口、解决主方案未解决的矛盾（PC 如何渲染 uni 物料）、给出分批实施与验收。
> **批 1 实测修正**：§4.1 末「B-22/B-23 实测修正」—— 方案期「7 标签组件 shim」假设被**部分推翻**（view/text/image/switch 直出），实现按实测落地。

---

## 1. 目标与范围

**一句话目标**（主方案 Phase 1 原文）：一个人能在设计器里拖出一个表单页，保存发布，移动端打开。

**MVP 范围**（严格对齐主方案 Phase 1 事项「设计器 MVP」）：

| 做 | 不做（Phase 2+，主方案已明确归属） |
|---|---|
| 物料面板（分类展示 + 拖入画布） | 多选 / 框选 / Ctrl+C/V / 右键层级操作 |
| 画布：拖入、选中、删除、排序 | 撤销重做（immer 快照，主方案 6.3-6） |
| 属性面板 **7 种 setter**（input / number / switch / select / textarea / **optionList / color**，后 2 种 Phase 2 批 3 补） | 其余 6 种 setter（expression / fieldPicker / ruleEditor / slider / dataSourcePicker / eventBinder——expression 随批 4 D-A11 字段绑定区覆盖） |
| 保存 / 加载（对接已有 server 接口） | 数据源面板、逻辑面板、JSON 源码模式 |
| designMode 选中框 / 拖拽指示线 | 大纲树拖拽（MVP 用「选中 + 删除/上下移」按钮代替）、扫码预览、设备切换 |

**出口判据**（= 主方案 Phase 1 出口判据第 1 步）：在设计器拖出「员工信息登记」表单 → 保存 → 发布 → ✅ **三步全通（2026-10-14）**：第 1 步由本设计器承接、第 2/3 步由运行时壳承接，**出口判据 1/2/3 已实测全过**（Demo 十步脚本见 PROGRESS「已实现 18」）。

---

## 2. 现状盘点（Phase 0 已有 vs 缺口）

### 2.1 已有（可直接复用）

| 资产 | 位置 | 对设计器的意义 |
|---|---|---|
| **协议**：MaterialSchema.settings / SettingDesc / 13 种 SetterType | `packages/schema` + `protocol.md` 第 4 章 | 属性面板**自动生成**的数据契约（6.4 的基础） |
| **物料 12 个**（uni 组件，扁平 props + update/click 事件契约） | `packages/materials/src/{text,input,textarea,number-input,radio,select,switch,upload,image,divider,button}` | 画布渲染对象；事件契约已 H5 实测 |
| **渲染引擎**：lc-renderer / lc-node + core 10 模块（376 用例） | `packages/renderer` | D2「共用渲染器」——画布直接挂 `lc-renderer` |
| **组件测试基建**：@vue/test-utils + jsdom + plugin-vue | `packages/renderer/vitest.config.ts` | designer 包复用同款配置模式 |
| **服务端**：登录（JWT）+ 保存/发布/回滚 5 个页面接口 | `apps/server` | 保存/加载链路现成：`POST /auth/login` → `GET/PUT /pages/:id/schema` → `POST /pages/:id/publish` |
| **easycom 物料解析**（uni 侧） | `runtime/src/pages.json` 三规则 | 运行时侧已通；PC 侧需另建映射（见 D-A2） |

### 2.2 缺口（本方案要补的）

| # | 缺口 | 归属批次 |
|---|---|---|
| G1 | `packages/designer` + `apps/designer-web` 工程（从零） | 批 1 |
| G2 | **PC 端 uni 物料渲染**：`<view>/<text>/<picker>/<radio>/<switch>/<image>` 在 PC Vue 不可用 + rpx 单位 PC 不识别 | 批 1（本文档 §4.1 专项决策） |
| G3 | **designMode**：lc-renderer/lc-node 无 mode prop，无选中框/插入指示/select 冒泡 | 批 1 |
| G4 | 物料 **meta 注册表**（12 份 meta.json + index.ts，流水线②③）——面板与属性面板的数据源 | 批 2 |
| G5 | **schema 树操作**纯函数（insert/remove/move/updateProp + id 生成）+ 单测 | 批 2 |
| G6 | 拖拽（HTML5 DnD + 锚点计算）与 Pinia 状态 | 批 2 |
| G7 | 属性面板 4 setter + 保存/加载对接 | 批 3 |

---

## 3. 总体架构

### 3.1 目录（对齐主方案 9.1）

```
lowcode/
├── packages/
│   ├── designer/            ★ 设计器核心包（可单测的组件与逻辑）
│   │   ├── src/
│   │   │   ├── core/          schema-ops.ts（树操作纯函数）· anchor.ts（拖拽锚点计算）
│   │   │   ├── shim/          uni-shim：view/text/picker/radio/switch/image 的 PC 版 + uni API polyfill
│   │   │   ├── canvas/        画布组件（lc-renderer 包装 + mode=design + 选中遮罩）
│   │   │   ├── panel/         物料面板 / 属性面板（setter 渲染器）/ 工具栏
│   │   │   └── index.ts       对外导出 + material-map（PC 端物料静态注册）
│   │   ├── test/             vitest（core 单测 node 环境；组件测 jsdom）
│   │   └── vitest.config.ts  复用 renderer 模式：plugin-vue + environmentMatchGlobs
│   └── materials/            已有；批 2 补 meta.json × 12 + src/index.ts 注册表
├── apps/
│   ├── designer-web/        设计器应用（Vite + Vue3 + TS + Pinia + Element Plus）
│   │   ├── src/  main.ts · router · store(Pinia) · api(登录/存取) · 布局(6.2 三栏)
│   │   └── vite.config.ts   含 rpx→px 后处理（见 §4.1）
│   └── server/              已有（零改动，只消费接口）
└── config/vitest.projects.ts  追加 'packages/designer' 聚合
```

- **依赖方向**：`designer-web → designer → (materials, renderer, schema)`；`designer` 不依赖 Element Plus（setter 组件用 props 插槽解耦，EP 只出现在 web 应用层）——保证 designer 包纯单测。
- **不引入**：Turborepo（D-4）、iframe 画布（D6 维持）、远程物料（流水线⑤ Phase 2）。

### 3.2 数据流（单一事实源：PageSchema）

```
                    ┌──────────── Pinia store ────────────┐
                    │ schema: PageSchema（唯一可变源）      │
                    │ selectedId: string | null            │
                    │ mode: 'design'                       │
                    │ saveState: idle/saving/dirty/error   │
                    └───┬──────────┬──────────┬────────────┘
        渲染（reactive） │          │          │ 取数
   ┌────────────────────▼──┐  ┌────▼──────┐  ┌▼──────────────────┐
   │ 画布 Canvas            │  │ 属性面板   │  │ 物料面板           │
   │ <lc-renderer           │  │ settings  │  │ META_LIST 分类分组 │
   │  :schema :mode=design  │  │ → 4 setter│  │ draggable 源        │
   │  @select @change>      │  │ → update  │  │                    │
   └────────────────────┬───┘  └────┬──────┘  └────────┬───────────┘
        select/change 冒泡│          │ updateProp        │ drop(锚点)
   ┌────────────────────▼───────────▼──────────────────▼───────────┐
   │           schema-ops 纯函数（core/，全单测覆盖）                 │
   │   selectNode / insertNode / removeNode / moveNode / updateProp │
   └────────────────────────────┬──────────────────────────────────┘
                                │ 保存：validatePage → PUT /pages/:id/schema
                                ▼
                          apps/server（已有）
```

**关键约束**：所有对 schema 的修改**必须**经过 `schema-ops` 纯函数（便于单测与未来接 undo 栈）；视图组件不直接改 schema。

---

## 4. 关键技术决策

### 4.1 D-A1（核心）：PC 画布如何渲染 uni 物料 —— 同进程 + uni-shim 层

**矛盾**：主方案 D2/D6 定「共用渲染器、同进程画布」，但物料是 uni 组件（`<view> <picker> <switch> <radio-group> <image>` 等 uni 内置标签 + rpx 单位），PC Web 环境没有 uni 运行时，这些标签要么渲染为空白、要么样式全错。

**逐标签兼容性实测分析**（基于当前 12 物料实际使用的标签）：

| uni 标签 | PC Vue 行为 | 结论 |
|---|---|---|
| `<input> <textarea> <button>` | 是 HTML 内建标签，Vue 编译为原生元素 → **直接可用** | 无需处理（`type="digit"` 退化为 text，可接受） |
| `<view>` | 未知自定义元素；HTML 默认 `display:inline`，而 uni 里 view 是块级 → 物料依赖块级布局的样式（padding 竖向等）会错 | **需 shim → div** |
| `<text>` | 未知元素但 inline 语义与 uni 一致 | **需 shim → span**（保险，继承字体样式） |
| `<picker>` | 未知元素 → 空白、点击无反应 | **必须 shim**（PC 版下拉选择） |
| `<radio-group> <radio>` | 未知元素 → 空白 | **必须 shim**（PC 版单选） |
| `<switch>` | 未知元素 → 空白 | **必须 shim**（PC 版开关） |
| `<image>` | 未知元素 → 不显示图 | **必须 shim → img** |
| `uni.chooseImage / previewImage` | PC 无 `uni` 全局 → 物料内已有 `typeof uni` guard（安全降级不报错） | **需 uni API polyfill**（PC 文件选择器实现，让 Upload 可用） |
| rpx 单位 | 浏览器不认识 → 样式被丢弃 | **需后处理**（见下） |

**三方案对比**：

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **A. 同进程 + uni-shim（选中）** | 设计器工程全局注册 PC 版 uni 标签组件；rpx 经 postcss 转 px | 维持 D6；选中/测量/拖拽直接 DOM 操作最简；无跨文档通信 | shim 与真机存在视觉/交互漂移（**中风险**） |
| B. iframe 画布（runtime H5） | 画布 = iframe，postMessage 双向协议 | 100% 真实渲染 | 违背 D6；跨 iframe DnD 坑多（dragover 坐标换算、跨文档 drag 事件兼容）；通信协议复杂；选中测量要双向回传 |
| C. 设计态占位物料 | 每物料另写一套「设计态占位组件」 | 无 uni 依赖 | 双实现漂移**更大**（每物料两份）；12→42 个物料时维护翻倍 |

**决策：方案 A（同进程 + uni-shim）**，理由：

1. **shim 是「一次性 N 个标签」**（7 个），占位物料是「每物料一份实现」（12→42 份），成本随物料数线性放大；
2. shim 层**事件契约与 uni 对齐**（`picker change → {detail:{value:index}}`、`switch change → {detail:{value:boolean}}` 等同构载荷），物料代码**零改动**；
3. 漂移风险的兜底：主方案 6.1 已规划「H5 iframe 预览 + 扫码真机预览」（Phase 2 引入），设计态管布局与配置、预览态管真实交互 —— 业界通行的折中；
4. 与主方案 D6（「Vue3 同进程更好做选中/测量；H5 端可保留 iframe 做隔离」）一致，**不升决策**。

**实现要点**（批 1 实测后形态，见文末 B-22 修正）：

```ts
// packages/designer/src/shim/index.ts —— 注册清单（组件 shim 仅对「非保留标签」生效）
export const UNI_SHIMS = {
  picker: PickerShim,             // PC 下拉；emit('change', { detail: { value: index } })
  'radio-group': RadioGroupShim,  // 原生 change 冒泡收集 → emit('change', { detail: { value: stringValue } })
  radio: RadioShim,               // 原生 <input type=radio>（label 关联由浏览器标准行为兜住）
} as const
export function registerUniShim(app: App): void {
  for (const [name, c] of Object.entries(UNI_SHIMS)) app.component(name, c)
  installUniApi()                 // chooseImage/previewImage PC polyfill
}
// view / text / image / switch：**SVG 标签被 Vue 直出**，组件 shim 无效 → CSS 兜底 + 增强器（B-22）
```

> **注意**：`input/textarea/button` 是 HTML 内建标签，Vue 编译器**不走组件解析**，全局注册不生效也不需要 —— 天然可用；但其**事件形状不同**（uni 有 `e.detail.value`，原生没有）→ 物料 `onInput` 已做双端回退（`e.detail?.value ?? e.target.value`）。

**rpx → px**：画布固定 375px 宽（手机壳，主方案 6.2），基准 750 → `1rpx = 0.5px`。自写 Vite/postcss 插件（约 10 行：正则替换 `(\d*\.?\d+)rpx` → `值×0.5px`），只作用于 `@lc/materials` 与 `@lc/renderer/uni` 的样式；设计器自身 UI 用 px 不受影响。设备切换（6.3-7，Phase 2）时改换算系数即可。

**物料在 PC 的加载（easycom 失效问题）**：easycom 是 uni 编译期机制，纯 Vite 工程没有 —— 设计器手写静态映射（正是主方案 4.3 的 `material-map` 形态，L-6 空映射的设计器侧补齐）：

```ts
// packages/designer/src/material-map.ts（批 1 手写 12 条；未来 schema-cli 按流水线④自动生成）
import LcText from '@lc/materials/src/text/index.vue'
// …12 个静态 import
export const MATERIAL_MAP = { Text: LcText, Input: LcInput, /* … */ } as const
// registerDesignerMaterials(app)：按 easycom 同款 kebab 命名全局注册 lc-* → 供 lc-node 解析
```

**与运行时的一致性保障**：lc-node 对物料的引用方式（`v-bind` 扁平 props + `@update/@click`）在 PC 完全一致；漂移只发生在「shim 标签的渲染细节」，用预览态兜底（风险表 R1）。

#### D-A1 批 1 实测修正（B-22 / B-23，2026-10-09 jsdom + 浏览器双实测）

方案期假设「非 HTML 内建标签 → `resolveComponent` → 全局组件注册生效」，**对部分标签不成立**：

| 实测发现 | 影响标签 | 修正实现 |
|---|---|---|
| **B-22**：`view / text / image / switch` **恰好都是 SVG 标签**，Vue 编译期按保留元素**直出**（dev 警告 `Do not use built-in or reserved HTML elements as component id`），组件注册被拒绝 | view, text, image, switch | **view/text**：全局 CSS 兜底（`view{display:block}` `text{display:inline}`）；**image**：增强器把 `src` 同步为背景图（MutationObserver 盯 `src` 属性，$expr 换图跟随）；**switch**：增强器事件委托（点击切 `checked` attribute + 派发 `CustomEvent('change',{detail:{value}})`，uni 契约同构）。**原则：只加 attribute/派发事件，不替换节点** → DOM 与 vnode 同构，Vue patch 安全 |
| **B-23**：`checked`/`disabled` **不在 Vue 的 boolean-attr 名单**，对未知元素 `:checked="false"` 落成 `setAttribute('checked','false')`（**字符串 "false"，attribute 仍存在**）→ `hasAttribute` 判定误反 | switch（增强器） | `isOn/isDisabled` 排除 `"false"` 值；CSS 用 `switch[checked]:not([checked='false'])`；jsdom 回归用例 + 浏览器实测双锁 |
| **事件形状差异**：原生 `<input>/<textarea>` 的 input 事件**无 `e.detail`**（uni 才有）→ 物料按 uni 形状读取会写空值 | input, textarea, number-input | 物料 `onInput` 双端回退：`e.detail?.value ?? e.target.value`（**已改 3 个物料**，uni 端行为不变） |
| **组件 shim 成立部分**（实测确认）：`picker / radio / radio-group` 不在保留名单，组件解析正常 | picker, radio, radio-group | 按原方案执行 ✓；radio 用**原生 input**——物料的 `<label>` 包裹让「点文字选中」由浏览器标准行为兜住 |

> R2 风险评级由 🟢 调整为 **🟡 已实测兜底**：直出组的兜底全部落地（CSS + 增强器），但「增强器与 Vue patch 的共存」依赖「不替换节点」原则，后续改 shim 需维持该约束。

### 4.2 D-A2：designMode 扩展（renderer 唯一的向后兼容改造）

- `lc-renderer` 加 `mode?: 'runtime' | 'design'`（**缺省 `runtime`，现有 uni 工程与 376 用例零回归**）；
- `mode=design` 时 `lc-node` 在节点内容外渲染**遮罩层**（绝对定位、不撑开布局）：
  - `hover` → 高亮边框；`click.stop` → `emit('select', nodeId)`；
  - **`select` 必须逐层冒泡到 lc-renderer**（与 `change` 完全同款 —— B-19 的教训直接迁移：递归处忘绑 `@select` 就是「点子节点选不中」的新缺陷，组件测试同步加回归用例）；
  - 插入指示线：画布层根据 dragover 锚点渲染 2px 指示线（逻辑在 designer 包，不动 lc-node）；
- design 态禁副作用：`handleEvent` 不执行真实导航/提交（动作拦截在 lc-renderer design 分支，或由设计器传 `onAction` 空实现 —— 批 1 定实现取最小改动者）；
- 表达式照常求值（`defaultFormData` 兜底），**不做 mock 数据源注入**（Phase 2）。

### 4.3 D-A3：schema 树操作放 designer 包 core 层（不污染 renderer）

`packages/designer/src/core/schema-ops.ts`：

```ts
generateNodeId(): string                         // 唯一 id（协议只要求唯一字符串）
insertNode(schema, parentId, index, material): { schema, newId }   // 用 defaultProps + meta
removeNode(schema, nodeId): { schema, removed: NodeSchema | null }// 保 root 不可删
moveNode(schema, nodeId, targetParent, index): { schema }
updateProp(schema, nodeId, key /* 'props.xxx' | 'style.xxx' */, value): { schema }
updateActions(schema, nodeId, actions): { schema }
```

- **纯函数 + 输入输出新 schema**（不原地改），为 Phase 2 的 undo 快照预留接缝 → ✅ **Phase 2 批 4 已兑现**（D-P2-7：快照栈直接存 `PageSchema` 引用，**不引 immer** —— clone-then-replace 本身即提供不可变历史）；
- 全部 vitest 单测（node 环境），纳入 `pnpm coverage` 聚合与阈值门禁；
- 是否可从 renderer core 复用：resolve/build 是「Schema → RenderNode」方向，不含树编辑 —— **不复用、不迁移**，保持 renderer 职责纯渲染。

### 4.4 D-A4：属性面板数据源 = materials 本地注册表（不做 server 物料接口）

> **批 2 落地注记（2026-10-09）**：`meta.json` 改为 **TS 文件 `meta/*.ts` + 类型标注**（`satisfies MaterialSchema`，编译期校验；JSON 无法享受类型检查）；分 4 组文件（basic/layout/form/feedback）+ `index.ts` barrel 导出 `META_LIST`。**META_LIST 共 13 项**（Page + FormGroup + 11 物料组件），**面板展示 12 项**（过滤 Page——root 不可拖入）。Page 的 `settings=[]`（容器分支不读 props，诚实表达）。META 单一来源在 `@lc/materials`，`src/index.ts` 只导出 meta 数据（物料组件仍 easycom/手写 material-map）。

- 批 2 给 12 物料补 `meta.json`（MaterialSchema：defaultProps / settings / events / isContainer / category…，协议 4 章）+ `src/index.ts` 导出 `META_LIST`；
- 设计器 import `META_LIST` → 物料面板按 `category` 分组、属性面板按 `settings` 渲染 setter；
- server 物料清单接口（流水线⑤「可远程扩展物料」）→ Phase 2；
- **MVP 4 种 setter**（主方案 Phase 1 原文）：`input` / `number` / `switch` / `select`，按 `SettingDesc.setter` 分发，未支持的 setter 渲染为只读占位 + 提示「Phase 2 支持」（不静默丢配置）。
- key 路径约定（主方案 6.4）：`props.*` → `node.props`，`style.*` → `node.style`，`event` → `node.actions`。

### 4.5 D-A5：拖拽 = 自研 HTML5 DnD（继承主方案 6.1，细化 MVP 交互）

> **批 2 落地修正（B-25，2026-10-09）**：**双机制并存** —— ① **物料拖入**走 HTML5 DnD（拖拽源是 HTML `li` 元素，实测 browser.drag 全链可用）；② **画布内节点换位改自研 mouse 手势**（mousedown → 超 4px 阈值武装 → mousemove 计算锚点 → mouseup 落库）：实测 **SVG `view` 元素上 `draggable` 的 dragstart 会 fire，但浏览器不建立拖拽会话**（dragover/drop 全缺，CDP 与真实行为均如此），而 mouse 事件在 SVG 上是 100% 标准行为。两机制**共用同一套 `anchor` 锚点计算与指示线**；与 click 选中互斥靠位移阈值 + 吞掉武装后的 click。遮罩的 `draggable`/`dragstart` 已移除（HTML5 DnD 的 node 分支在 drop 侧保留兼容，无源触发）。

- **拖入**：物料面板项 `draggable` → 画布 `dragover` 计算**最近锚点**（容器内 `before / after / into` 三态）→ 2px 指示线 → `drop` 调 `insertNode`；
- **排序**：选中画布内节点后拖拽换位（同一套锚点计算，源改为节点 id → `moveNode`）；辅助：工具栏「上移/下移」按钮（键盘可达性 + 实现兜底）；
- **删除**：选中后 Delete 键 / 工具栏删除按钮（容器内最后一个子节点删除后父容器保留）；
- 锚点算法 `core/anchor.ts` 纯函数（给定鼠标坐标 + 节点 DOMRect 列表 → 插入点），单测覆盖；
- **不做**（Phase 2 → 部分已兑现）：框选、多选、**Ctrl+C/V（✅ Phase 2 批 4 已做：复制/剪切/粘贴 + 快捷键）**、方向键微调、右键层级、树内拖拽（大纲树——批 4 大纲树只做展示/选中/删除，**拖拽仍未做**）。

### 4.6 D-A6：保存/加载链路（全部复用已有接口）

```
打开：GET /pages/:id/schema（带 JWT）→ 深拷贝入 store.schema（只读快照）
编辑：任何变更 → saveState=dirty（顶栏「未保存」标记）
保存：validatePage(schema)（前端先跑，错误数显示底栏）
      → 通过则 PUT /pages/:id/schema → 成功 saveState=idle
发布：POST /pages/:id/publish（出口判据要求「保存发布」）
登录：POST /auth/login（admin/admin123 种子账号）→ token 存 pinia + sessionStorage
```

- 页面列表（顶栏「页面列表」6.2）：MVP 做「输入 pageId 打开 / 新建」两个动作即可，浏览列表接口（`GET /pages`）server 侧 Phase 1 动态 CRUD 批次再对齐；
- 校验错误：`validatePage` 返回的 `errors[].path` 定位到节点并在画布标红（MVP 至少显示错误条数 + 错误消息列表）。

### 4.7 D-A7：状态管理与工程配置

- Pinia 单 store（§3.2 字段）；**不引入** undo（Phase 2 → ✅ **Phase 2 批 4 已引入**：`watch(schema)` 单一接缝 + past/future 双栈，D-P2-7）、不引入路由库多页面（MVP 单页：`/designer?page=<id>` query 打开）；
- Element Plus 仅用于设计器自身 UI（顶栏/对话框/setter 输入控件）；
- TS strict、禁 any 于协议层（9.2）；designer 包进 `config/vitest.projects.ts` 聚合，阈值门禁沿用 90/85/90/90。

### 4.8 D-A8：批 2 落地决策与方案微调注记（2026-10-09）

批 2 实施中相对方案原文的**微调与新决策**，留档防漂移：

| # | 方案原文 | 实际落地 | 理由 |
|---|---|---|---|
| 1 | `meta.json` × 12 | **TS 文件 `meta/*.ts`**（4 分组 + barrel，`satisfies` 校验）× 13（含 Page），面板展示 12 | JSON 无类型检查；`defaultProps`/`settings` 与协议类型编译期对齐 |
| 2 | store 放 `apps/designer-web` | **store + MaterialPanel + PropsPanel 进 `packages/designer`**（`src/store/`、`src/panel/`），designer-web 保持薄壳（App.vue 接线） | 面板/仓可被 `setActivePinia` 单测；包内聚（core+store+panel 同包） |
| 3 | `insertNode(schema, parentId, index, material)` | **`insertNode(schema, material, { parentId?, index? })`** | 可选参数对象，调用点可读性；纯函数性质不变 |
| 4 | 节点拖拽 MIME 单一来源在 renderer | **物料 MIME `LC_MATERIAL_MIME` 在 designer `core/dnd.ts`；节点 MIME 在 renderer `design.ts`（后随 B-25 降级为 drop 侧兼容）** | 拖拽源在谁手里、常量归谁；B-25 后节点主路径不再走 MIME |
| 5 | 指示线随 DOM 定位 | **`position: fixed` + `getBoundingClientRect` 视口坐标** | 画布设备壳可滚动，视口坐标免换算 |
| 6 | 排序 = 拖拽换位 | **拖拽换位（自研 mouse 手势，见 D-A5 修正）+ 上移/下移按钮 + Delete/Backspace 键删除** | 键盘可达性与兜底；SVG DnD 实测不可用（B-25） |
| 7 | 属性面板 settings 列出字段 | **三列只读列表**（label/key/setter），setter 渲染批 3（✅ 已完成，见 D-A9） | 批 2 验收仅要求「列出」 |
| 8 | —— | **lc-renderer 加 `selectedId` 受控 prop**（store.selectedId → 画布遮罩选中样式闭环） | B-24 修复的配套：schema 整树替换后选中态须受控同步 |
| 9 | —— | 物料面板项 / 画布遮罩补 `role="button"` + `tabindex` + `aria-label` | 键盘可达性；也便于自动化工具定位 |

### 4.9 D-A9：批 3 落地决策与方案微调注记（2026-10-10）

批 3 实施中的**微调与新决策**，留档防漂移：

| # | 方案原文 | 实际落地 | 理由 |
|---|---|---|---|
| 1 | EP 用于 setter 输入控件（D-A7） | **setter 用原生控件**（text/number input、checkbox、select，样式自绘） | 面板既有按钮全为原生（风格一致）；designer 包组件 VTU 直测零 stub 污染；D-A7「用于」非「必须」 |
| 2 | 登录 token 存 pinia + sessionStorage | **登录封装在 `designer-web/src/api.ts`**（首次请求自动 login，token 只落 sessionStorage）；store 只认 `DesignerApi` 接口（注入式） | store 不碰网络（D-A3 副作用注入同款）；单测 mock api 免登录链路 |
| 3 | 保存前 validatePage 一次 | **touch() 即时校验**：任何 schema 修改同步重跑 `validatePage` → 底栏常显错误数；save 前再跑一次作门禁 | 同步纯函数、demo 规模零成本；错误即时可见（验收「校验错误可见」） |
| 4 | —— | **校验不过不发 PUT**（本地阻断 → saveState=error + 错误数入 statusText）；**publish 时草稿非 idle 自动先 save**（同受门禁） | 免服务端 400 往返；发布语义 =「当前所见内容固化」 |
| 5 | —— | demo fixture `schemaVersion` 必须三段 semver：`'1.0'` → `'1.0.0'`（**B-27**） | validatePage 正则 `^\d+\.\d+\.\d+$`；批 3 首跑即抓出（此前 fixture 从未过校验，B-17） |
| 6 | GET 页面不存在的语义 | 一律 `saveState=error` + statusText 提示，**保存即建档**（server saveDraft upsert 自动创建） | 「新建」与「保存」双路径合一：输入新 pageId 直接保存即可建档，无需独立建页接口 |

---

### 4.10 D-A11：批 4 落地决策 —— 页面↔模型字段绑定的双层配置（2026-10-12）

**问题**：批 4 依赖②「把表单字段映射到记录字段」。协议里这件事本就拆在两处：

- `PageSubmit.dataSourceId` → 指向一条 `type:'model'` 的 `DataSourceSchema`（其 `modelId` = 目标模型）；
- 表单控件的 `props.name`（协议 2.2 **字段绑定名**）= renderer `collectFieldNames` 组装提交 payload 的键 = 模型字段 `key`。

而**运行时侧早已就绪**（`runModel()` → `POST /models/:id/records`、`controller.submit()` 组 payload），本批只补「配置 UI + schema 写入」，**纯设计器侧工作**。

**决策：分两层配置，判定与写入全走 schema-ops 纯函数**（D-A3 约束不变，视图只发意图）

| 层 | UI 位置 | schema 写入 |
|---|---|---|
| 页面级「提交模型」 | 属性面板顶部，**与选中态无关、始终可见** | `setSubmitModel(schema, modelId\|null)`：**原位 upsert** 固定 id `ds_submit` 的 `{type:'model', method:'POST', modelId}` 并令 `submit.dataSourceId='ds_submit'`（已有 `successToast`/`successAction` 保留）；传 `null` 清除且**只删 `ds_submit`**，用户自建的 http/static 源不误伤 |
| 节点级「绑定字段」 | 属性面板 settings 区块上方，**`selectedMeta.hasField` 才显示** | 复用 `setProp(nodeId, 'name', key)`：写 `props.name`，传 `''` 写 `undefined`（解绑后不进 payload） |

**关键点**：

1. **`method` 固定 `POST`** —— renderer `runModel` 缺省即 POST → `POST /models/:id/records`（新建一行），与服务端契约严格一致；
2. **读写路径严格对称** —— `readSubmitModel(schema)` 与 `setSubmitModel` 共用同一套推导（`submit.dataSourceId` → ds → `type==='model'` → `modelId`）；ds 非 model 类型（如 http）或缺 `modelId` 一律视作「未配置」，换页 / 打开已配置页面自动回填；
3. **原位替换** —— `ds_submit` 在 `dataSources` 数组中原位更新（不删再 push）→ schema diff 稳定、数组顺序不变；
4. **模型数据经 `DesignerApi` 注入**（新增 `listModels()` / `getModel()`，D-A3 同款副作用注入）—— designer 包不碰 fetch，单测用 mock；**字段按 `modelId` 缓存**（同模型不重复请求、换模型即失效），**失败时清空字段**（防「残留别的模型字段误导配置」），错误文案落 `modelError` 在面板**红字可见不静默**；
5. **两侧同源** ——「绑定字段」下拉与 settings 里的「字段名」input 是**同一个 `props.name`**，绑定后两处同步（实测已验）；
6. **本批不做**：智能匹配（model 字段 `enum` 自动换 Select 物料）、批量「按模型一键生成表单页」、`props.name` 与模型字段一致性的**校验拦截**（当前允许绑任意字段名，由服务端 sanitize 兜底丢弃未知键）—— 属后续批次，本批只保证「能选、能写、能存」。

> **实测修正两条**：**B-30** —— `store.setApi` 必须在 App.vue **setup 顶层**注入（Vue 父 `onMounted` 晚于子组件，首屏面板会拿不到 api）；**B-29** —— `vite.config.ts` 需显式 `host:'127.0.0.1'` 且 proxy target 用 `127.0.0.1`（本机 `::1` 被拦时 dev 直接 502，与服务端测试 `app.listen(0)` 同根因）。

### 4.11 D-A12 / D-A13：批 5 落地决策 —— 必填联动与最小动作绑定（2026-10-14）

**问题**：批 5 出口判据要求「校验拦截空必填」与「按钮触发提交」，实操发现设计器存在**两处能力断层**，不补齐则判据无法从 UI 上搭出来：

1. **必填断层**：物料的 `required` prop **只渲染星号**（`<text v-if="required">*</text>`），校验引擎 `collectRules` 只认 `props.rules` —— 「开了必填只出星号、提交却不拦」；
2. **动作无 UI**：`node.actions` 一直是提交扳机的载体（协议第 8 章动作），但属性面板从未有动作配置区块（批 3 只留了 `readNodeValue('event')` 读路径），Button 的 `submit` 无从在 UI 上配置；
3. 附带：Text 的「文本内容」是 `setter:'textarea'`，批 3 只实现 4 种 setter → 占位挡住「改标题」这一步。

**决策**：

| 编号 | 决策 | 落地 |
|---|---|---|
| **D-A12** | **`required` 单一开关、两层联动** —— settings「必填」switch 一处控制星号（`props.required`）与校验规则（`props.rules` 里 `{type:'required'}`）；`store.setProp` 写路径在 `key==='required'` 时分叉追加/移除规则 | schema-ops 新增 `setRequiredRule` / `readRequiredRule` 纯函数：追加到**末尾**（不打乱既有规则顺序）、关闭时**只移 required、他规则保留**、目标态 no-op 且未配置 rules 时不建空数组；生效前提 = 节点已绑 `props.name`（与 `collectRules` 收集条件一致） |
| **D-A13** | **最小动作绑定** —— 属性面板新增「事件」区块（`selectedMeta.events` 驱动），事件 → 动作类型下拉；**无参动作可写入**（`submit/back/scan/location`，协议中 `value?` 可选），有参动作（navigate/http/toast）**占位禁用**「参数配置 Phase 2」 | store 加 `setNodeAction(nodeId, event, type\|null)` → schema-ops `updateActions`（同事件**原位替换**、`null` 解除、他事件不误伤）；面板回填读 `node.actions` 按 event 过滤 |
| （顺手） | **textarea setter**（第 5 种）—— 复用 `onInput` 写路径，`rows=3` | Text「文本内容」等 textarea 型 settings 从占位变为可编辑；批 3 的「其余 9 种占位」清单收窄为 8 |

**关键点**：

1. **全部改动收敛在 designer 包**（schema-ops / store / PropsPanel 三处），renderer/schema/server **零改动** —— 写入的都是既有协议字段（`props.rules` / `node.actions`），协议不升版本；
2. **联动放在 `store.setProp` 写路径而非面板 UI 层** —— 任何调用方（面板、未来的批量操作）改 `required` 都自动联动，避免两处 UI 各写各的漂移；「只改星号不动校验」的场景不存在；
3. **B-34 教训**：面板操作期间 `browser.fill` ref 错位曾把「员工信息登记」写进 `v-model="store.pageId"` 的顶栏输入框（直连 store 状态），导致后续保存报「非法的页面 id」—— 受控输入操作前先核对目标元素。

---

## 5. 分批实施计划（每批可验收）

| 批 | 内容 | 验收（DoD） |
|---|---|---|
| **批 1：画布能渲染** ✅ **2026-10-09 完成** | ① `apps/designer-web` + `packages/designer` 骨架（Vite/TS/Pinia/EP）② uni-shim：picker/radio/radio-group 组件 + view/text CSS + image/switch 增强器 + uni API polyfill + rpx→px 插件 ③ `material-map` 注册 12 物料 ④ lc-renderer `mode=design`（选中框/hover/select 冒泡/动作拦截，provide/inject 免递归透传）⑤ 画布挂 demo schema | **实测全过**：12 物料渲染与 375 布局正确（rpx 0 残留）、picker/switch/radio/image 交互可用、点选中 + 嵌套节点（n-in-fg）选中 + 右面板联动、0 未知组件、console 0 error；`pnpm -r test` **390 passed**（designer 12）；截图 `docs/screenshots/designer-batch1.png` |
| **批 2：能拖入删除** ✅ **2026-10-09 完成** | ① `schema-ops` 纯函数 + `anchor` 算法 + 全单测 ② 物料面板（META 分组 + draggable）③ 画布 DnD（into/before/after 指示线）④ 节点删除/排序 ⑤ materials 补 meta ×13（TS 形态，D-A8）+ 注册表 | **实测全过**：拖入 defaultProps 生效 + 画布重渲染 + 自动选中（B-24 修复）；拖拽换位（自研 mouse 手势 B-25）：root↔容器 before/after/into 全通；上移/下移/删除按钮 + Delete 键生效、root 三钮禁用；属性面板按 settings 列出（Input 6 行/Button 3 行）；指示线真实视口坐标渲染；console 0 error；`pnpm -r test` **462 passed**（designer 81）；schema-ops 覆盖含于 designer 分组 |
| **批 3：能配置保存** ✅ **2026-10-10 完成** | ① 属性面板 4 setter（input/number/switch/select，**原生控件** D-A9-1）+ 未支持 setter 只读占位（textarea/color/optionList/expression… 提示 `Phase 2 支持`，不静默丢配置）② 保存/加载（api.ts 自动登录 → GET → PUT，DesignerApi 注入 D-A9-2）③ 发布按钮（非 idle 自动先保存 D-A9-4）④ 底栏校验错误显示（touch() 即时校验 D-A9-3） | **实测全过**：改 `label` 画布**立即刷新**（属性面板/画布/受控回显三处同步 + dirty 徽标）；改 `disabled` 画布对应控件禁用生效；保存建档 → reload **回读一致**（`已打开 demo（draft）`、12 节点/首子 n-text 不变）；重复保存**幂等**（连续两次均 idle/已保存）；造重复 id → 底栏「⚠ 1 项校验错误：节点 id 重复」+ 保存被本地阻断（error/有错误，未发 PUT）+ 打开即恢复服务端版；发布 `v1`；打开不存在页 → error 提示、保存即建档（upsert D-A9-6）；console **0 JS error**；`pnpm -r test` **482 passed**（designer 101，+20 新用例） |
| **批 4：页面↔模型字段绑定** ✅ **2026-10-12 完成** | ① schema-ops 加 `setSubmitModel` / `readSubmitModel` / `SUBMIT_DS_ID`（页面级纯函数）② `DesignerApi` 扩 `listModels()/getModel()` + store 加模型列表 / 字段缓存 / `submitModelId` getter / `setSubmitModel` / `setFieldBinding` ③ PropsPanel 加「提交模型」（页面级，与选中态无关）与「绑定字段」（`selectedMeta.hasField`）两区块 + 引导文案与错误红字 ④ designer-web `api.ts` 补两方法、`App.vue` setApi 上提 setup 顶层（**B-30**）。决策见 **D-A11** | **实测全过**：浏览器 5 点 —— 下拉从 `GET /models` 列 2 个真实模型 → 选中后 help 显示 `提交新增记录 → POST /models/m_employee/records` → 选中画布 Input 后字段下拉列 3 字段（来自 `GET /models/:id`）→ 绑定 `empName` 后与 settings「字段名」同步 → 保存后服务端 `GET /pages/demo/schema` 三处配置**全部落库 6/6 PASS**；`pnpm -r test` **559 passed**（designer 101→**123**，+22 新用例）；coverage **96.13/87.58/96.98/96.13** exit 0（designer 分包 stmts 97.42→**97.52**）；顺带修 **B-29**（本机 `::1` 被拦致 34 用例全红 + dev 502） |
| **批 5：出口判据闭环** ✅ **2026-10-14 完成** | ① 能力补齐（判据硬缺口）：**D-A12 必填联动**（「必填」开关 = 星号 `props.required` + 校验 `props.rules` 一处控制）、**D-A13 最小动作绑定**（事件 → 动作下拉，无参动作可写 / 有参占位 Phase 2）、textarea setter（第 5 种，Text 标题可改）② 集成实跑：设计器拖「`emp_form` 员工信息登记」→ 绑 `empName`/`dept` + 双字段必填 → 配 `click→submit` → 提交模型 `m_employee` → 保存发布 v1 ③ runtime H5 打开 → 空提交**前端拦截**（红字双字段 + 0 网络请求）→ 填写提交 **200** → 服务端查到记录 | **出口判据 1/2/3 全通** ✅：服务端 schema 逐项核对（`props.rules` ×2 + `actions` + `ds_submit` 全落库）+ H5 十步实测 + 记录实查 `张三/技术部/admin`；designer 测试 123→**135**、全仓 **577 passed**、coverage **96.19/87.71/97.05/96.19** exit 0（designer 分包 stmts 97.69）；**Demo 脚本十步留档 PROGRESS「已实现 18」**；判据 3「列表页」按裁剪口径以服务端查询验证（台账 **D-15**） |

> 批 1~4 不依赖运行时壳批次，与其**并行推进**；批 5 已汇合（2026-10-14 出口判据全通）—— **4 批实施计划全部完成**。

---

## 6. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| R1 | shim 与真机视觉/交互漂移（设计态所见 ≠ 手机所得） | 🟡 中 | 物料只用 uni 标准标签（禁用生僻组件）；批 4 用真机 Demo 验收；主方案 6.1 的「H5 iframe 预览 + 扫码」Phase 2 引入常态化对账 |
| R2 | Vue 对 `view/text/...` 的解析与预期不符（编译成原生元素而非组件） | 🟡 已实测 | **批 1 实测（B-22）**：`view/text/image/switch` 是 SVG 标签被 Vue 直出，组件 shim 无效 —— 已按 §4.1 修正落地（CSS 兜底 + image/switch 增强器，不替换节点）；`picker/radio/radio-group` 组件 shim 成立 |
| R3 | rpx 转换遗漏 / 只在部分文件生效 | 🟢 低 | postcss include 显式圈定 `@lc/materials`、`@lc/renderer`；批 1 视觉走查 12 物料 |
| R4 | designMode 改造引入运行时回归（B-18/B-19 类） | 🟡 中 | `mode` 缺省 runtime 零行为变化；`select` 冒泡配组件测试回归用例（套用 B-19 模式）；全量 376+ 用例门禁 |
| R5 | DnD 细节坑（dragover 频繁触发、drop 落点抖动） | 🟢 低 | 锚点计算纯函数化 + 单测；dragover 节流（rAF）；「上移/下移」按钮作兜底路径 |
| R5+ | **SVG `view` 遮罩的 HTML5 DnD 会话不建立**（批 1 已预警的 B-22 同族风险，批 2 实测兑现 → **B-25**） | 🔴 已规避 | 节点换位改**自研 mouse 手势**（mousedown/move/up，SVG 上 100% 标准），物料拖入保留 HTML5 DnD（HTML 源可用）；见 §4.5 修正 |
| R6 | 属性面板 setter 范围失控（协议 13 种都想做） | 🟢 低 | 主方案 Phase 1 明文 4 种；其余渲染只读占位 |
| R7 | materials meta 与组件 props 漂移 | 🟢 低 | meta 单测断言 `defaultProps` 键 ⊆ 组件 props（协议校验 `validateMaterial` 已有 40 用例基础） |

---

## 7. 与主方案的一致性声明

| 主方案决策 | 本方案处理 |
|---|---|
| D2 共用 core/renderer | ✅ 画布直接挂 `lc-renderer`，designMode 是唯一扩展点 |
| D6 画布同进程（不用 iframe） | ✅ 维持（D-A1 选方案 A 的直接依据）；iframe 仅作 Phase 2 预览态 |
| 6.1 选型表（DnD 自研 / settings 自动生成 / Element Plus / Pinia） | ✅ 全部继承；撤销重做已落地 → **Phase 2 批 4（D-P2-7 改快照双栈，不引 immer）** |
| 6.3~6.4 交互与属性面板设计 | ✅ MVP 收窄到「拖入/选中/删除/排序 + 4 setter」，其余明确挂 Phase 2 |
| 4.3 material-map | ✅ 设计器侧先手写 12 条（L-6 的设计器形态），schema-cli 自动生成属流水线④ |
| Phase 1 事项「设计器 MVP」 | ✅ 批 1~5 全部完成（2026-10-14）；批 5 已汇合**出口判据 1/2/3 全通** |

**新增决策编号 D-A1~D-A13**（本文档内定义），动工后按台账惯例回写 `PROGRESS.md` 决策表与 ADR（可并入 ADR-007「设计器画布 uni-shim」）。

---

## 8. 开工前置检查清单

- [x] 本文档评审通过（重点：D-A1 方案 A 是否接受 shim 漂移风险）—— 2026-10-09 放行开工；B-22/B-23 实测修正已回写 §4.1
- [ ] 主方案第六章若有回写需求（如 6.1 画布行补充「+ uni-shim」注记）→ 随批 1 一并执行
- [x] 批 1 环境：Node 22 / pnpm workspace（现状满足）；Element Plus 走 npmmirror（.npmrc 已就位）
- [x] 台账 `PROGRESS.md` 登记 Phase 1 批次计划（设计器批 1~3 与运行时壳批次并行关系）

---

*批 1 已完成（2026-10-09）：工程/画布/designMode/shim/增强器全落地，浏览器实测与全量门禁通过（详见 PROGRESS）。*

*批 3 已完成（2026-10-10）：4 setter 真渲染（原生控件）+ DesignerApi 注入式保存链路（自动登录/打开/保存/发布）+ touch() 即时校验与底栏错误显示全落地；实测修正 B-27（demo fixture schemaVersion 须三段 semver），决策注记 D-A9（6 条）；482 passed + coverage 96.06/87.75/96.43/96.06 exit 0 + 浏览器实测全过（详见 PROGRESS「已实现 14」）。*

*（2026-10-10 · 并行批次）服务端动态 CRUD 已完成 —— 批 5 的服务端前置（记录提交 / 查询 / 软删 / 文件上传与读取）就此就绪，接口契约见 `protocol.md` §10.1。本次为纯后端批次，designer 包无代码改动。*

*批 4 已完成（2026-10-12）：**页面↔模型字段绑定**落地 —— 页面级「提交模型」+ 节点级「绑定字段」双层配置（决策 **D-A11**，全走 schema-ops 纯函数 `setSubmitModel`/`readSubmitModel`），`DesignerApi` 扩 `listModels()/getModel()`，模型字段按 `modelId` 缓存；浏览器实测 5 点 + 服务端落库 **6/6 PASS**（下拉列真实模型 → help 显示真实接口 → 字段下拉来自 `GET /models/:id` → 绑定后与「字段名」同步 → 保存后 `ds_submit`/`submit`/`props.name` 三处落库）；designer 测试 101→**123**、全仓 **559 passed**、coverage **96.13/87.58/96.98/96.13** exit 0（designer 分包 stmts 97.42→97.52）；实测修正 **B-29**（本机 `::1` 被拦 → server 测试 34 用例全红 + vite dev 502 → 3 处显式绑 `127.0.0.1`）与 **B-30**（`setApi` 上提 setup 顶层，父 onMounted 晚于子）。详见 PROGRESS「已实现 16」。*

*批 5 已完成（2026-10-14）：**出口判据闭环**收口 —— 能力补齐 **D-A12 必填联动**（修「开了必填只出星号、提交不拦」断层）+ **D-A13 最小动作绑定**（submit 扳机首次有 UI）+ textarea setter（第 5 种，标题可改），落点全在 designer 包、renderer/schema/server 零改动；集成实跑 `emp_form` 拖搭 → published v1 → runtime H5 空提交红字拦截 0 请求 → 填写提交 200 → 服务端实查记录 `张三/技术部/admin`，**主方案 Phase 1 出口判据 1/2/3 全通**；designer 测试 123→**135**、全仓 **577 passed**、coverage **96.19/87.71/97.05/96.19** exit 0；实测记 **B-33**（dev 预构建半成品：ready 49s 异常信号 + 对照实验分诊）与 **B-34**（fill 错位污染 `v-model` 直连的 pageId）。**本方案批 1~5 至此全部完成**，详见 PROGRESS「已实现 18」与 Demo 十步脚本。*

*（2026-10-14 · Phase 2 批 5）版本管理 UI 已完成 —— 顶栏「历史」按钮 → `HistoryDialog.vue` 手写 modal（列表三态 + 当前发布徽标 + 行内**两步确认**回滚，回滚成功 `openPage()` 重载 → `replaceSchema` 连带清 undo 栈）；`DesignerApi` 扩三处（`getSchema(pageId, version?)` / `listVersions` / `rollback`，接口变更由 typecheck 锁 designer-web 同步实现）+ `api.ts` 三方法 fetch 实现；**D-P2-9** 自研 `core/schema-diff.ts` `diffSchema` 纯函数零依赖（按 id 对齐、子树只报顶层、顺序 remove→add→change→move，**基线 = 内存当前画布**）—— 不引 JSON diff 库（沿 D-P2-7 零依赖原则）；服务端侧 **D-P2-8** 补 `GET /pages/:id/versions`（protocol.md §10.1 已登记），改 server 源码须 **build + 重启进程**（**B-37**：无 watch，旧进程持旧路由表致新端点 404）；designer 测试 223→**257**（+34：schema-diff 12 + version-store 9 + history-dialog 13）、全仓 **757 passed**、coverage **96.51/87.8/96.67/96.51** exit 0；**明确未做**：发布 note 编辑、vN vs vM 互比、草稿快照、删除版本、整页 JSON 查看。详见 PROGRESS「已实现 23」。*

*（2026-10-15 · Phase 2 批 6）权限 RBAC UI 已完成 —— 设计器第三视图「权限管理」`RbacPanel.vue`（角色列表/新建/编辑 + **门禁红字**拦截非法权限点不发 PUT + 页面授权矩阵 `cell-{pageId}-{roleKey}` 勾选，`togglePageRole` 乐观更新 + 失败先重拉回滚）+ 属性面板**节点权限点 setter**（`data-testid=node-perm`，放 settings 之后保既有 setter DOM 顺序，空=清除；schema-ops `setNodePerm` 纯函数）+ 模型编辑器**「数据权限」区块**（`dataScope` 下拉 dept/deptAndChild 置灰无组织服务 + CRUD 四行 × 角色勾选）；store 扩 RBAC 态与 10 个 actions（`view` 增 `'rbac'`），`DesignerApi` +4 方法（designer-web `api.ts` 同步 + App.vue 顶栏「权限管理」切换）；**`'*'` 通配同源豁免**修在双端（服务端 controller 校验与 designer `roleGateErrors` 原 `PERM_RE` 会拒种子角色）；designer 测试 257→**281**（+24：rbac-store 11 + rbac-panel 8 + schema-ops 3 + panel 1 + model 1，6 个 mockApi 工厂随接口扩 4 方法）、全仓 **795 passed**、coverage **96.62/87.87/96.77/96.62** exit 0；实测记 **B-40**（新 controller 用 AuthGuard 时 module 必须 `imports: [AuthModule]`，否则 DI 启动 V8 native 崩、vitest 表象 Worker exited）与 **B-39**（uni 运行中改 hash 跨会话导航复用旧实例，权限态验证须硬刷新）。**明确未做**：用户管理 UI、角色删除接口、perm 批量收集器。详见 PROGRESS「已实现 24」。*

*（2026-10-15 · Phase 2 批 7）出口判据 Demo + 多端打包已完成 —— 设计器**零代码改动**（纯 UI 操作 Demo），但两处修复直接影响设计器体验：**B-41** 物料注册表污染清理（`packages/materials/src/meta/form.ts` 6 个表单物料 `defaultProps` 带 `$expr: formData.<demo字段>` 残留，demo fixture 受控字段泄漏进注册表 → 新拖入任何页面都携带指向不存在字段的表达式；6 处全清、`DEMO_OPTIONS` 保留为画布预览占位 → **拖入即干净**，设计器实测新 Picker「绑定值（表达式）」为空）与 **D-P2-13 受控物料回显兜底**（落在 renderer `lc-node.vue` `bindProps`，设计器画布 design 态 formData 恒空 → 行为不变）；Demo 用设计器既有能力全链路走通：newPage demo 模板批量清理（选中 + Delete 键）→ HTML5 DnD 拖入 4 物料 → **mouse 手势换位**（B-25 路径，mousedown 须从节点元素冒泡至画布根、mousemove/mouseup 绑 window）→ 属性面板 field-binding/optionList/label 配置 → 保存发布。**明确未做**（涉及设计器的缺口）：页面 name 手动编辑（菜单显示英文 pageId）、enum label 映射（列表/详情显示原始值 `a` 非「事假」，字段显示映射留后续批次）。详见 PROGRESS「已实现 25」。*
