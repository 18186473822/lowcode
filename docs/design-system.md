# 跨端 UI 设计系统规范 v1.0

> **覆盖范围**：Web 端设计器（`apps/designer-web`）+ 移动端运行时（runtime H5）
> **主题**：亮色 / 暗色双主题
> **设计稿**：Ardot 画布《LowCode 跨端 UI 设计系统》——本文档与画布板块一一对应
> **定位**：唯一真相源。实现与本文档冲突时，以本文档为准；本文档未覆盖处，先补规范再写代码。

---

## 0. 交付物对照表

| 画布板块 | 文档章节 | 代码落点 |
|---|---|---|
| B1 封面 · 令牌三层结构 | §1 §2 | 新增 `packages/tokens`（建议） |
| B2 设计令牌 · 色彩 | §2.2 §2.5 | `apps/designer-web/src/style.css` 转 CSS 变量 |
| B3 设计令牌 · 排版与尺度 | §2.3 §2.4 | 同上 |
| B4 组件库 · 按钮与表单 | §3.2 §3.3 | `packages/designer/src/panel/*`、`packages/materials/*` |
| B5 组件库 · 导航与反馈 | §3.4 | 同上 |
| B6 Web 端 · 设计器关键界面 | §6 §7.1 | `apps/designer-web/src/App.vue` |
| B7 页面流程与导航结构 | §4 | 无需改动（信息架构确认） |
| B8 跨端异常状态族 | §5 | `store.saveState` / `modelError` / H5 校验链路 |
| B9 移动端 · 关键页面 | §7.2 | `packages/renderer` + runtime 页面 |
| B10 响应式适配方案 | §6 §8 | 新样式体系 |

---

## 1. 令牌架构

三层，单向依赖，**页面只允许引用第 2、3 层**：

| 层 | 变量集 | 是否含语义 | 谁能用 | 例子 |
|---|---|---|---|---|
| L1 原始层 | `Primitive` / `Scale` | 否 | 仅 L2 | `brand-500 #2B6DE8`、`space-4 16px` |
| L2 语义层 | `Semantic`（Light / Dark 双模式） | 是 | L3 与页面 | `bg-surface`、`text-primary`、`action-primary` |
| L3 组件层 | `Component`（Light / Dark 双模式） | 是 | 仅该组件 | `btn-h-md 32`、`input-h 32`、`panel-radius 8` |

命名规则：`层级域-用途[-状态]`，全小写连字符。语义层禁止出现颜色名（`blue-500`），组件层禁止跨组件复用（`btn-h-md` 不得被输入框引用）。

**变量集总量**：Ardot 侧 **5 组 / 133 项** —— `Primitive` 35 · `Scale` 41 · `Semantic` 31 · `Component` 21 · `Effects` 5。
**代码侧令牌**：`packages/tokens/src/tokens.css` 的 `:root` 共 **167 项**，暗色覆盖 **47 项**。两侧差额由 `pnpm tokens:check` 持续可见（§9.1）：多出的是**设计器 chrome 专属令牌**（`--lc-topbar-*` 含 4 态徽标、`--lc-device-*`、`--lc-drag-hint*`、`--lc-focus-ring`、`--lc-font-ui/mono`、`--lc-gradient-brand` 等实现侧扩展）；布局尺寸类见 §9.2 不计入令牌。

**令牌包**：`@lc/tokens`（`packages/tokens`）—— 令牌的**唯一持有者**。设计器、渲染引擎、物料库、移动端运行时都依赖它，任何一端都不得自建色值。

**单位按端发**：`tokens.css`（px，Web 用）是唯一手写源；`tokens.rpx.css`（rpx，uni 用）由 `scripts/build-tokens-rpx.mjs` 派生，产物过期会被门禁拦截。移动端构建把 rpx 转成 `rem`，因此**同一份组件代码**在设计器得 `16px`、在移动端得 `1rem`（随屏宽缩放）。

### 1.1 落地状态

| 项 | 状态 |
|---|---|
| 令牌层（亮 + 暗） | ✅ `@lc/tokens`（`packages/tokens`）持有；各端以 `@lc/tokens/tokens.css` 引入 |
| **移动端色值令牌化** | ✅ materials + renderer + runtime 共 **331 处**替换，见 §10 |
| `apps/designer-web/src/style.css` 令牌化 | ✅ 硬编码色值 **0** |
| 7 个面板组件令牌化 | ✅ `MaterialPanel` / `OutlineTree` / `LcCanvas` / `HistoryDialog` / `PropsPanel` / `ModelPanel` / `RbacPanel` + `shim.css` |
| 亮暗主题切换 | ✅ 顶栏「暗色 / 亮色」按钮，持久化到 `localStorage`，首帧前生效（无闪白） |
| 面板共用件取值对齐 | ✅ `.setter` 标签列 72 · 属性行高 30 · 字号 13 三处统一 |
| 面板共用件去重 | ✅ 收敛到 `packages/designer/src/styles/panel.css`（原先 3 份 scoped 副本） |
| 状态视图（空 / 加载 / 错误） | ✅ `packages/designer/src/components/PanelState.vue` + `.lc-state*` / `.lc-skeleton*`，接入 6 个面板 |
| 面板头部统一 | ✅ `.panel-head` / `.panel-head__meta`（三个面板同一形态，去掉大纲树自带的 `__head` 与重复描边） |
| **物料面板图标** | ✅ 33 个 16×16 线性图标（`canvas/material-icons.ts`），7 条回归守卫 + 规格表 `docs/material-icons.html` |
| 响应式断点落地 | ✅ `apps/designer-web/src/use-breakpoint.ts` + 抽屉折叠 + Wide 栏宽扩容 + 窄屏提示 |
| **§5 异常状态族（跨端）** | ✅ `core/state-kind.ts` 分类器 + `uni/lc-state-view.vue` + `PanelState.vue`；list/detail/壳层/6 面板全接入 |
| 画布工具条 + 标尺 | ✅ §7.1 高 40：设备档位（375/750/H5）· 缩放 50–150% · 标尺（8px 细刻度 / 40px 粗刻度）+ 双轴 + 内容区中心参考线 |
| **对比度审计** | ✅ `pnpm contrast:check`（19 组 × 双模式，基线回归 + 缺口清单，§2.2.1） |
| 按钮六态 | ✅ §3.2 全落：默认 / 悬停 / 点击 / 聚焦 / **加载（宽度不变 + 阻断重复提交）** / 禁用 |
| 跨端单位 | ✅ `tokens.rpx.css` 派生 + 移动端 349 处 rpx 字面量令牌化 |
| 设计一致性门禁 | ✅ `pnpm design:check`：令牌漂移（132 项 / 179 处零漂移）+ 全仓色值字面量扫描（**0 处**） |
| 测试 | 全仓 **51 文件 / 865 用例**；覆盖率 Stmts 96.18% · Branch 87.63% · Funcs 96.4%（门槛 90/85/90/90） |

---

## 2. 视觉规范

### 2.1 设计基调

沿用现有工程蓝升级：保留主色 `#2B6DE8` 与深色顶栏 `#1F2329`，补齐色阶、层级与状态体系。气质 = 企业级生产力工具：克制、工程感、信息密度偏高、装饰最少。

### 2.2 色彩令牌

#### 原始层 · 色阶

| 色阶 | 取值 |
|---|---|
| **brand** | 50 `#EFF5FF` · 100 `#DBE8FE` · 200 `#BFD7FE` · 300 `#93BBFD` · 400 `#6096FA` · **500 `#2B6DE8`（主色）** · 600 `#1E5ED0` · 700 `#1A4BA8` · 800 `#1A3F85` · 900 `#16306A` |
| **neutral** | 0 `#FFFFFF` · 50 `#F7F9FB` · 100 `#EEF1F5`（画布底） · 200 `#E3E8EE`（默认边框） · 300 `#CBD3DC`（强边框） · 400 `#9AA5B1`（三级文字） · 500 `#6B7684`（二级文字） · 600 `#4B5563` · 700 `#374151` · 800 `#1F2329`（一级文字 / 顶栏） · 900 `#14181D` |
| **success** | 50 `#E9F5EE` · 500 `#1A9C4A` · 600 `#188038` |
| **warning** | 50 `#FFF8E6` · 500 `#E08700` · 600 `#B96F00` |
| **danger** | 50 `#FDECEA` · 500 `#D93025` · 600 `#B3261E` |
| **dark（暗色底）** | 0 `#0F1319` · 100 `#171C24` · 200 `#1E242E` · 300 `#2A313C` · 400 `#3A434F` |

#### 语义层 · Light / Dark 映射

| 令牌 | 用途 | Light | Dark |
|---|---|---|---|
| `bg-canvas` | 画布底 / 页面底 | `#EEF1F5` | `#0F1319` |
| `bg-surface` | 面板 / 卡片 / 输入框底 | `#FFFFFF` | `#171C24` |
| `bg-subtle` | 次级填充 / 表头 | `#F7F9FB` | `#1E242E` |
| `bg-inverse` | 反转区块 / 顶栏 | `#1F2329` | `#F7F9FB` |
| `text-primary` | 标题与正文主体 | `#1F2329` | `#E8ECF2` |
| `text-label` | 表单标签 / 面板字段名（高于次要文字，保证密集面板可读） | `#374151` | `#C6CDD8` |
| `text-secondary` | 说明 / 表格正文 | `#6B7684` | `#9AA5B1` |
| `text-tertiary` | 占位符 / 辅助 / 禁用文字 | `#9AA5B1` | `#6B7684` |
| `text-link` | 链接色 | `#2B6DE8` | `#6096FA` |
| `text-danger` | 错误文字 | `#D93025` | `#F87171` |
| `border-default` | 面板描边 / 分割线 | `#E3E8EE` | `#2A313C` |
| `border-strong` | 强边框 / 输入框描边 | `#CBD3DC` | `#3A434F` |
| `border-focus` | 聚焦环 | `#2B6DE8` | `#6096FA` |
| `action-primary` | 主按钮底 / 选中态 | `#2B6DE8` | `#4D88F0` |
| `action-primary-hover` | 悬停 | `#1E5ED0` | `#6096FA` |
| `action-primary-active` | 按下 | `#1A4BA8` | `#2B6DE8` |
| `action-primary-subtle` | 弱化底 / 提示条 | `#EFF5FF` | `#1A3F85` |
| `status-success` | 成功 | `#188038` | `#34D399` |
| `status-success-bg` | 成功底 | `#E9F5EE` | `#10281A` |
| `status-warning` | 警示 | `#B96F00` | `#FBBF24` |
| `status-warning-bg` | 警示底 | `#FFF8E6` | `#2B1F04` |
| `status-danger` | 危险 / 错误 | `#D93025` | `#F87171` |
| `status-danger-bg` | 危险底 | `#FDECEA` | `#2C1412` |
| `status-info-bg` | 信息底 | `#EFF6FF` | `#14213D` |
| `overlay-scrim` | 遮罩 | `rgba(20,24,29,.45)` | `rgba(0,0,0,.60)` |

**对比度要求**：正文对其背景 ≥ 4.5:1；≥18px 或 14px 粗体 ≥ 3:1；控件边界与焦点环 ≥ 3:1。

### 2.2.1 对比度审计（门禁 + 现状）

```bash
pnpm contrast:check            # CI：与基线比对，退化 >0.05 判失败
node scripts/check-contrast.mjs --update   # 改配色后重建基线 docs/contrast.json
node scripts/check-contrast.mjs --strict   # 缺口清零后切到这条（既有缺口也判失败）
```

**为什么用「基线回归」而不是直接全量卡 4.5**：现有配色已有 12 处低于 AA。若一上来就全量卡，
门禁会长期红灯、被无视 —— 那比没有门禁更糟。所以策略是：**锁住不退化 + 如实列出缺口 +
新增组合必须直接达标**（新增的不许带病进场）。缺口修完再加 `--strict`。

**当前状态**：19 组 × 双模式 = 38 项，**达标 26 / 缺口 12 / 退化 0**。

**12 处缺口与已验证的修复值**（括号内为改后实测比值，均已用实际令牌背景色验算）

| 模式 | 组合 | 现值 | 需 | 建议 |
|---|---|---|---|---|
| 亮 | `status-danger` on `status-danger-bg` | 4.17 | 4.5 | danger → `#C42A20`（4.96） |
| 亮 | `status-success` on `status-success-bg` | 4.48 | 4.5 | success → `#157A33`（4.86）；**差 0.02，纯取整级修正** |
| 亮 | `status-warning` on `status-warning-bg` | 3.71 | 4.5 | warning → `#A85C05`（4.72） |
| 亮 | `border-strong` on `bg-surface` | 1.51 | 3 | border-strong → `#8A94A6`（3.06）；输入框边界过淡是**可感知的真实可用性问题** |
| 亮 | `text-tertiary` on `bg-surface` | 2.50 | 4.5 | ⚠️ 无解：达到 4.5 只能取 `#6B7684`（＝`text-secondary`，层级塌陷）。建议**约束用途**而非改色：tertiary 仅用于装饰 / 禁用态，占位与提示改用 secondary |
| 亮 | `text-on-brand-muted` on `action-primary` | 3.60 | 4.5 | 需要可读的正文改用 `text-on-brand`（4.71）；muted 仅用于装饰性小字 |
| 暗 | `action-primary-text` / `text-on-brand` on `action-primary` | 3.45 | 4.5 | **暗色下品牌面是浅蓝（`#4D88F0`），白字必然不够** —— 标签改深墨 `#0F151D`（5.32）。这正是 Material 3 的做法 |
| 暗 | `text-on-brand-muted` on `action-primary` | 2.77 | 4.5 | 同上，改用不透明深墨 |
| 暗 | `text-tertiary` on `bg-surface` | 3.70 | 4.5 | tertiary → `#8B96A3`（5.69） |
| 暗 | `status-danger-active` on `bg-surface` | 3.58 | 4.5 | 按下态 → `#F09A98`（7.96） |
| 暗 | `border-strong` on `bg-surface` | 1.82 | 3 | border-strong → `#6B7684`（3.70） |

⚠️ **上表是建议，尚未落盘** —— 改配色会同时动 `tokens.css`、设计稿变量集与两端观感，需产品 / 设计确认后再改；确认后 `pnpm tokens:check` 与 `contrast:check --update` 各跑一次即可闭环。

> 另注：`text-secondary` 在亮色下是 4.62:1，**仅超出阈值 0.12** —— 任何对 `text-secondary` 或
> `bg-surface` 的微调都可能把它推过线，改动后务必重跑 `contrast:check`。

### 2.3 字体令牌

| 角色 | 字族 |
|---|---|
| 中文 | `Noto Sans SC`（回落 `PingFang SC` / `Microsoft YaHei`） |
| 拉丁与数字 | `Inter` |
| 代码 / ID / key | `Noto Sans Mono` |

字重仅用 4 档：`400 Regular` / `500 Medium` / `600 SemiBold` / `700 Bold`。

| 字阶令牌 | 字号 / 行高 | 字重 | 用途 |
|---|---|---|---|
| `display` | 28 / 36 | Bold | 页面主标题（弹层、欢迎页） |
| `h1` | 22 / 30 | SemiBold | 页面与弹层标题 |
| `h2` | 18 / 26 | SemiBold | 分组与面板标题 |
| `h3` | 16 / 24 | SemiBold | 卡片标题、区块小标题 |
| `body-lg` | 15 / 24 | Regular | 移动端表单正文、列表主文本 |
| **`body`** | **14 / 22** | Regular | **Web 全局基准**（面板、属性项） |
| `body-sm` | 13 / 20 | Regular | 表格正文、表单说明 |
| `caption` | 12 / 18 | Regular | 辅助说明、时间戳 |
| `micro` | 11 / 16 | Medium | 徽标、标签、状态点旁文字 |

规则：不得自造字号；正文不低于 13px；单行文本超长必须省略号截断并 `title` 提示。

### 2.4 间距 / 圆角 / 阴影 / 动效

**间距**（4px 基准，只允许取刻度值）：`space-1 4` · `space-2 8` · `space-3 12` · `space-4 16` · `space-5 20` · `space-6 24` · `space-8 32` · `space-10 40` · `space-12 48` · `space-16 64`

**圆角**：`xs 4`（标签） · `sm 6`（按钮 / 输入框） · `md 8`（面板 / 卡片） · `lg 12`（大卡片 / 弹层） · `xl 16`（移动端卡片区 / 手机壳） · `pill 999`（徽标 / 头像 / 开关）

**阴影**（层级用 elevation 表达，不用更粗的边框）：

| 令牌 | 取值 | 场景 |
|---|---|---|
| `e1` | `0 1px 3px rgba(16,24,40,.08)` | 静止面板 / 卡片 |
| `e2` | `0 4px 10px -2px rgba(16,24,40,.10)` | 悬停 / 悬浮卡片 |
| `e3` | `0 10px 24px -6px rgba(16,24,40,.14)` | 弹层 / 下拉菜单 |
| `e4` | `0 20px 40px -12px rgba(16,24,40,.18)` | 模态对话框 |

暗色主题不叠加更黑的阴影，改用 `border-strong` 描边区分层级。

**动效**：
- 时长 `fast 120ms`（悬停 / 按下反馈） · `base 200ms`（展开 / 切换 / 淡入） · `slow 320ms`（弹层进出、面板滑入）
- 缓动默认 `cubic-bezier(0.2, 0, 0, 1)`；进入用减速曲线，退出用加速曲线；**禁用弹性 / 回弹缓动**
- 仅动 `opacity` 与 `transform`，不动 `width/height/top/left` 等布局属性
- 骨架屏使用 1.2s 无限线性循环

---

## 3. 组件库

> **复用边界（ADR-007）**：令牌是全端唯一的共享层；组件只在**同构宿主**内共享 ——
> 33 个物料走 uni 宿主（画布 shim + 移动端，零分支），7 个设计器面板走 DOM 宿主（仅 Web）。
> **禁止跨宿主共享组件**：本节 §3.1 里「高 32（Web）· 44（移动端触屏）」这一行本身就是证据 ——
> 一个组件只能选一个高度，而规范要求两端不同。判据、判例与取舍见
> [`adr/007-cross-platform-reuse-boundary.md`](adr/007-cross-platform-reuse-boundary.md)。

### 3.1 组件清单（18 个可复用组件）

| 组 | 组件 | 尺寸档 |
|---|---|---|
| 按钮 | 主 / 次 / 文字 / 危险 / 工具栏·深色 | sm 24 · md 32 · lg 36–44 |
| 输入 | 输入框 / 下拉 / 多行文本域 / 数字输入 | 高 32（Web）· 44（移动端触屏） |
| 选择 | 复选（已选 / 未选） · 单选（已选 / 未选） · 开关（开 / 关） | 勾选框 16 · 开关 40×24 |
| 展示 | 徽标（成功 / 警示 / 危险） · 分段控件 · 工具条 · 表格 · 卡片 · 面板头 | — |
| 反馈 | 提示条（成功 / 警示 / 危险 / 信息） · 骨架屏 · 空状态 · 加载态 | — |

### 3.2 按钮规格与状态矩阵

**尺寸**：`sm 24 高`（工具条 / 表格内） · `md 32 高`（默认，主操作用） · `lg 36–42 高`（表单底部） · 移动端主按钮 `44 高`。圆角 `sm 6`，内边距竖向 8 / 横向 16（lg 竖向 11 / 横向 20）。

| 状态 | 主按钮 | 次按钮 | 文字按钮 | 危险按钮 | 通用附加 |
|---|---|---|---|---|---|
| 默认 | 底 `action-primary` · 字 `#FFF` | 底 `bg-surface` · 描边 `border-strong` · 字 `#374151` | 无底 · 字 `action-primary` | 底 `status-danger` · 字 `#FFF` | — |
| 悬停 | 底 `action-primary-hover` | 底 `bg-subtle` | 底 `action-primary-subtle` | 底 `danger-600` | 200ms `fast` 过渡 |
| 点击 | 底 `action-primary-active` | 底 `bg-canvas` | 底 `brand-100` | 底 `#B3261E` | 无位移抖动 |
| 聚焦 | 原底 + 外扩 2px `brand-300` 环 | 同左 | 同左 | 同左 | 键盘可见，`:focus-visible` |
| 加载 | 底 `brand-400` · 字「处理中…」 | 字「处理中…」 | 同左 | 同左 | 锁定重复提交、**宽度不变** |
| 禁用 | 底 `neutral-200` · 字 `neutral-400` | 描边 `border-default` · 字 `neutral-400` | 字 `neutral-400` | 同左 | `cursor: not-allowed`，不响应事件 |

**约定**：一屏只允许一个主按钮；危险操作必须用危险色并配二次确认；次级操作在 1180px 以下收进「更多」溢出菜单。

### 3.3 表单控件规格

| 组件 | 默认 | 聚焦 | 检错 | 禁用 |
|---|---|---|---|---|
| 输入框 / 下拉 | 底 `input-bg` · 描边 `input-border` · 占位 `input-placeholder` | 描边 2px `input-border-focus` | 描边 `status-danger` + 下方 12px 红字 | 底 `bg-subtle` · 描边 `border-default` · 字 `neutral-300` |
| 复选 / 单选 | 未选：白底 + `border-strong` 描边；已选：`#2B6DE8` 实心 | 外扩 2px 主色环 | 同输入框 | 整体降为 `neutral-300` |
| 开关 | 关：`border-strong` 底 / 开：`action-primary` 底 | 2px 主色环 | — | 底 `neutral-200` |

**字段组结构**：`标签行（必填星号 + 标签）→ 控件 → 错误文案 / 帮助文字`。
**必填单一开关**：星号与校验规则必须同源——打开「必填」即同时写入 `props.required` 与 `props.rules` 的 `required` 规则，禁止只画星号不校验（对应现有 D-A12 决策）。

### 3.4 导航 / 数据 / 反馈

- **分段控件**：容器底 `bg-canvas` + `radius-md`，选中项白底 + `e1`；用于左栏「物料 / 大纲」页签（现有实现为下划线页签，两种均可，同一产品内保持一致）。
- **表格**：表头 `bg-subtle` + 12px Medium `text-secondary`；数据行内边距 竖向 10 / 横向 12；悬停行底 `bg-subtle`；行间 1px `border-default` 分隔线；单元格内容必须包一层 cell 容器，文本不得直接挂在行上。
- **提示条**：内边距 竖向 10 / 横向 12，圆角 `sm 6`，语义底 + 深一档同色字；图标 16×16；危险 / 警示提示条不得自动消失，成功提示 3s 后淡出。
- **空状态**：图标 48 + 标题 `h3` + 一句说明 + 一个主操作。**禁止只写「暂无数据」**。
- **骨架屏**：条高 16 / 12，圆角 4，`bg-subtle` 与 `neutral-200` 交替；延迟 300ms 再出现，避免闪烁。

---

## 4. 页面流程与导航结构

### 4.1 主流程（搭建端 → 发布 → 运行端）

| 步 | 动作 | 接口 / 说明 |
|---|---|---|
| 01 | 登录 | `POST /auth/login` → JWT 只落 `sessionStorage`，不进 store |
| 02 | 打开 / 新建页面 | 按 `pageId` 打开草稿；不存在时**保存即建档**（upsert），无独立建页接口 |
| 03 | 拖拽搭建 + 配置 | 物料拖入 → 换位 / 删除 → 属性面板配字段名、必填、事件、权限点 |
| 04 | 保存草稿 | 前端先跑 `validatePage`；**有错则本地阻断、不发请求**，底栏列错误 |
| 05 | 发布版本 vN | 草稿非 clean 时先自动保存再固化版本；移动端无需重新打包即生效 |
| 06 | 移动端打开 | runtime H5 按 `pageId` 取已发布版本渲染 |
| 07 | 填写表单 | 必填校验前置拦截空提交，错误逐字段标红且**不发请求** |
| 08 | 提交写入模型 | `POST /models/:id/records`，成功提示后返回列表 |
| 09 | 列表 / 详情 | 按数据权限（`dept` / `deptAndChild`）过滤可见记录 |

### 4.2 导航结构

**Web 设计器**（单页应用，`/designer?page=<id>`）：
- 顶栏 + 底栏常驻，三个互斥视图切换
- 视图 A 画布：左栏（物料 / 大纲）· 中栏 375 手机壳画布 · 右栏属性面板（提交模型 / 节点设置 / 事件 / 权限点）
- 视图 B 数据模型：左模型列表 · 右字段表与数据权限
- 视图 C 权限管理：左角色列表 · 右页面授权矩阵
- 切换视图不丢失页面上下文；有未保存改动先自动保存

**快捷键**：`Delete/Backspace` 删除 · `Ctrl+Z` / `Ctrl+Shift+Z` 撤销重做 · `Ctrl+C/X/V` 复制剪切粘贴 · `Enter` 打开页面

**移动端**：列表页 → 详情页 / 表单页，两级返回制，返回箭头固定在应用栏左上角，**不使用底部 Tab 栏**。

---

## 5. 异常状态族

| 状态 | 触发条件 | 呈现 | 关键约束 |
|---|---|---|---|
| **空状态** | 查询成功但结果集为 0；新页面无节点 | 居中图标 + 标题 + 说明 + 一个主操作 | 禁止只写「暂无数据」；必须给出口 |
| **加载中** | 首屏拉取 schema / 模型 / 记录 | 骨架屏优先；按钮级用内联加载态 | 延迟 300ms 出现避免闪烁；加载态锁定重复提交 |
| **接口错误** | 5xx；返回体不符协议 | 保留页面框架，就地错误块 + 「重试」 | 文案含接口路径与状态码 |
| **网络中断** | 请求失败；`navigator.onLine === false` | 已加载内容保留 + 就地重试条（移动端）/ 顶部警示条（Web） | 已填内容不丢失；不跳走当前页；恢复后自动消失 |
| **无权限** | 401 → 阻断式弹层引导重新登录 | 说明「已填内容不会丢」，登录后回原页 | 保留本地改动 |
| | 403 → 页面级占位 + 返回入口 | 隐藏越权操作，而非置灰 | 不给「重试」 |
| **校验失败** | 必填为空 / 格式不符 / 字段与模型不匹配 | 字段下方红字 + 边框转危险色；滚动到第一个错误 | 主按钮保持可点，但重复提交被拦截；错误汇总条仅在 ≥2 个字段出错时出现 |

**文案规范**：说清「发生了什么 + 你能做什么」；错误文案必须含可核对的技术信息；不复述用户已看到的信息；不使用感叹号与语气词；不把责任推给用户。

### 5.1 实现：跨端共用一套分类，两端各自呈现

**分类器**：`packages/renderer/src/core/state-kind.ts`（纯函数，可单测）

| 输入 | 输出 kind | 出口 |
|---|---|---|
| 401 | `no-auth` 登录已过期 | 去登录（壳层） |
| 403 | `forbidden` 无权访问 | 返回菜单（壳层） |
| 404 | `not-found`（可用 `notFoundTitle / notFoundText` 覆盖成记录级文案） | 无（重试无意义） |
| 网络层失败 | `error` 网络连接中断 | 重试 |
| 其他 | `error` 加载失败（含状态码） | 重试 |

**两个必须知道的判定细节**（均已被单测锁住）：

1. **本仓的网络失败契约是 `resolve({ statusCode: 0 })` 而非 reject** —— 见 `packages/runtime/src/host.ts` 的 `uni.request fail` 分支。因此 `status === 0` 且无消息即网络失败；但「配置缺少 modelId」这类异常同样没有状态码，靠消息特征区分，避免误报成「网络中断」。
2. **404 要区分「页面不存在」与「记录不存在」** —— 详情页取不到的是记录，故 `classifyError` 提供 `notFoundTitle / notFoundText` 覆盖，否则用户会看到「页面不存在」而困惑。

**两端呈现**：

| 端 | 组件 | 接入处 |
|---|---|---|
| Web 设计器 | `packages/designer/src/components/PanelState.vue` + `.lc-state*` | 6 个面板（模型加载 / 空态 / 错误 + 重试） |
| 移动端 | `packages/renderer/src/uni/lc-state-view.vue` + `.lc-state*`（uni `view`/`text` + 内联 SVG） | `lc-list-page` / `lc-detail-page` / 壳层 `pages/view/index.vue` |

**移动端分层**（沿 D-A2：跨端能力只经 host / 事件上抛）：
- `error`（含网络中断 / 5xx）→ **本地重试**，不劳烦壳层；
- `no-auth` / `forbidden` → 上抛 `state-action` 事件，由壳层跳登录 / 回菜单（renderer 不直接调 uni API）；
- **翻页失败不清空已加载行**：保留行 + 页内重试条，且重试续拉**下一页**而非重置回第一页（保留滚动位置）。

⚠️ 已知限制：内联 SVG 仅 H5 支持，mp-weixin 端图标不渲染，但标题 / 说明 / 出口仍完整（不会退化成「无声失败」）。全端覆盖需改为 base64 data-URI + `<image>`。

---

## 6. 响应式适配

### 6.1 断点（min-width 递进，移动优先）

| 断点 | 范围 | 栅格 | 设计器行为 | 运行时行为 |
|---|---|---|---|---|
| **Mobile** | `< 640px` | 单列流式 · 边距 16 · 卡片间距 12 | 不提供完整编辑态，仅预览 / 查看数据 | 单列满宽；表单标签在上、控件满宽；底部操作条固定 |
| **Tablet** | `640–1023px` | 8 栏 · 槽 16 · 边距 24 · 最大内容 960 | 左右栏折叠为**抽屉**，顶栏出现呼出按钮；画布仍 375 居中 | 表单可双列；列表卡片两列 |
| **Desktop** | `1024–1439px` | 12 栏 · 槽 16 · 边距 24 · 最大内容 1440 | **主档**：三栏全展开 240 / 自适应 / 300；1024 时右栏可压缩到 260 | H5 内容居中 |
| **Wide** | `≥ 1440px` | 12 栏 · 槽 24 · 边距 32 · 最大内容 1760 | 左右栏可加宽至 280 / 340；画布区可平铺多设备壳 | 单卡片最大 720，避免超宽行 |

### 6.2 栅格规则

- 每栏宽 = `(容器宽 − 11 × 槽) / 12`
- 布局一律用 flex 或 12 栏栅格表达，**禁止写死像素宽度**；面板与卡片用可伸缩策略随父级伸展
- 只有语义固定尺寸允许写死：手机壳 375、图标 16/20/24、触控目标 44
- 断点用 `min-width` 递进，不用 `max-width` 倒推，避免中间档位叠加冲突
- 优先使用容器查询（`@container`）让组件脱离页面宽度自适应

---

## 7. 关键页面布局说明

### 7.1 Web 设计器（1440×900 基准）

| 区域 | 规格 |
|---|---|
| 顶栏 | 高 48 · 深色 `bg-inverse` · 左品牌 + 页面标识 / 右操作区 · 按钮高 26–32 · 组间 1×18 分隔符 |
| 画布工具条 | 高 40 · 白底 · 左设备切换（375 / 750 / H5）· 右缩放与标尺开关 · 与画布 1px 分隔 |
| 左栏 物料面板 | 宽 240 · 白底 · 页签高 38 · 分组标题 12 `text-tertiary` · 物料项内边距 竖向 8 / 横向 10 · 项间距 8 · **每项 = 16px 线性图标 + 名称**（图标默认 `text-tertiary`，悬停随项变 `action-primary`） |
| 中栏 画布 | 宽度自适应 · 底 `bg-canvas` · 手机壳 375×620 居中、圆角 16、1px 描边 · 选中节点用 2px 主色描边 + 左上角节点标签（标签置于描边上方，避免被裁剪） |
| 右栏 属性面板 | 宽 300 · 白底 · 区块标题 13 SemiBold · 属性行高 30、标签列 72 · 区块间距 14，用 1px 分隔线分组 |
| 底栏 | 高 32 · 白底 + 上描边 · 左校验摘要（危险色，最多 3 条后折叠）/ 右操作状态（三级文字，含上次发布时间） |

**属性面板区块顺序**：提交模型（页面级，始终可见）→ 节点设置（`settings` 驱动）→ 事件（`events` 驱动）→ 权限点（按钮级）。
**选中遮罩**：`2px action-primary` 描边 + 标签胶囊（`#2B6DE8` 底、白字、11px、圆角 4、高 18）；遮罩本身不得裁剪标签。

### 7.2 移动端（375×812 基准）

纵向分区固定：**状态栏 28 + 应用栏 44 + 内容区（自适应）+ 底部安全区 34**。

| 页面 | 结构要点 |
|---|---|
| **表单页** | 错误汇总条（≥2 字段出错时出现）→ 字段组 ×N → 弹性留白 → 主按钮（sticky 于安全区之上，高 44） |
| **列表页** | 搜索框（高 40，`bg-subtle` 底）→ 筛选胶囊行 → 列表卡片（圆角 12、内边距 14、头像 36 + 名称 15 Medium + 次要信息 12 + 右侧状态文字）→ 触底加载文案 |
| **详情页** | 首部卡（`action-primary-subtle` 底，头像 48 + 名称 16 SemiBold + 状态摘要）→ 信息卡（白色圆角 12，行内边距竖向 12，标签列 100 `text-secondary` + 值 `body-lg`）→ 底部操作条（次操作左 / 主操作右，固定） |

**适配要点**：`rpx` 以 750 为基准，`1rpx = 0.5px`；键盘弹出时底部按钮上移保持可见；数字字段唤起数字键盘。

---

## 8. 跨端一致性策略与验收清单

### 8.1 策略

1. **单一令牌源** —— 色彩 / 字体 / 间距 / 圆角 / 阴影只有一份定义（4 组变量集），两端各自消费，任一端不得私自定义颜色或字号。
2. **同一组件语义** —— 按钮 / 输入框 / 徽标 / 表格在两端的取值来自同一组件层令牌，差异只在尺寸档位（Web 默认 32，移动端主按钮 44）。
3. **密度显式声明** —— Web 用 Compact / Medium，移动端用 Medium / Airy；同一屏内不混用密度模式。
4. **布局同构** —— 同一份 schema 在两端渲染出相同的信息层级，差异只在「折叠方式」而非「信息顺序」。
5. **状态对齐** —— 六态在两端都存在并映射到同一令牌；移动端触控反馈须在 100ms 内出现。
6. **文案同源** —— 同一语义的错误文案在两端共用一个文案键；不各写一份。
7. **主题一致** —— 亮暗切换只改模式取值，不改组件用法。

### 8.2 验收清单

- [ ] 375 / 768 / 1440 三档实测：无横向滚动、无内容被裁切
- [ ] 三档下同一页面信息顺序一致，主操作位置不变
- [ ] 亮暗主题切换后对比度仍满足 WCAG AA（正文 4.5:1，大字 3:1）
- [ ] 移动端所有可点目标 ≥ 44×44，元素间距 ≥ 8
- [ ] 键盘可完成设计器全部核心操作，焦点环始终可见
- [ ] 空 / 加载 / 错误 / 网络中断 / 无权限 / 校验失败 六态在两端均可复现
- [ ] 组件全部引用语义层或组件层令牌，硬编码色值为 **0 处**

---

## 9. 实施落点与进度

| 优先级 | 动作 | 位置 | 状态 |
|---|---|---|---|
| P0 | 令牌层落地：`:root` 亮色 + `[data-theme="dark"]` 暗色 | `packages/tokens/src/tokens.css` | ✅ 已完成 |
| P0 | 设计器外壳色值全部替换为令牌 | `apps/designer-web/src/style.css` | ✅ 已完成（硬编码 0） |
| P0 | 顶栏按钮统一为「工具栏·深色 / 主」两类，组间加分隔符 | `apps/designer-web/src/App.vue` | ✅ 已完成 |
| P0 | 亮暗主题接线：`theme.ts` + 顶栏切换按钮 + 首帧前生效 | `apps/designer-web/src/theme.ts` | ✅ 已完成 |
| P0 | 面板组件色值令牌化（含 uni-shim） | `packages/designer/src/panel/*`、`canvas/LcCanvas.vue`、`shim/shim.css` | ✅ 已完成 |
| P1 | 属性面板区块间距、行高、标签列宽按 §7.1 收敛 | `packages/designer/src/panel/PropsPanel.vue` | ✅ 已完成（三面板取值统一） |
| P1 | 物料面板项、页签按 §7.1 收敛 | `packages/designer/src/panel/MaterialPanel.vue` | ✅ 已完成 |
| P1 | 空 / 加载 / 错误状态的**视图层呈现**补齐 | `packages/designer/src/components/PanelState.vue` + 6 个面板 | ✅ 已完成（§5 三态落地，含 14 个新用例） |
| P1 | 面板共用件去重：`.setter` / `.op-btn` / `.panel-err` 提为共享样式 | `packages/designer/src/styles/panel.css` | ✅ 已完成 |
| P2 | 面板头部统一：物料面板用 `.panel-title`、大纲树用自带 `__head`，两者视觉不一致 | `MaterialPanel.vue` / `OutlineTree.vue` | ✅ 已完成（`.panel-head` 共享形态） |
| P2 | 断点与栅格落地：设计器 Tablet 抽屉折叠、Wide 栏宽扩容、Mobile 窄屏提示 | `apps/designer-web/src/use-breakpoint.ts` + `App.vue` + `style.css` | ✅ 已完成（§6 四档） |
| P2 | 由设计变量导出 W3C tokens JSON（与 `tokens.css` 双向校验，防手抄漂移） | `scripts/check-tokens.mjs` + `docs/tokens.w3c.json` | ✅ 已完成（`pnpm tokens:check`） |
| P2 | 顶栏 `批 N · …`、物料面板 `拖拽接入画布 · 批 2` 等**构建期文案**替换为产品文案 | `App.vue` / `MaterialPanel.vue` | ✅ 已完成（顶栏改为页面标识 `pageId + 发布状态`） |
| P1 | 抽取 `@lc/tokens` 令牌包（两个消费端出现后，令牌不再住在 designer 包内） | `packages/tokens` | ✅ 已完成（4 个包依赖它） |
| P1 | **移动端色值令牌化**：materials / renderer / runtime 共 331 处 | `scripts/tokenize-colors.mjs` 执行 | ✅ 已完成（§10） |
| P1 | 移动端主题接线（跟随系统偏好） | `packages/runtime/src/theme.ts` + `main.ts` | ✅ 已完成 |
| P1 | **色值字面量门禁**（覆盖不进重构建链的 runtime / materials） | `scripts/check-color-literals.mjs` | ✅ 已完成，已入 CI |
| P1 | **§5 异常状态族（移动端）**：分类器 + 共享状态视图 + 三处接入 | `core/state-kind.ts` + `uni/lc-state-view.vue` | ✅ 已完成（§5.1，+12 用例） |
| P1 | 跨端单位：派生 rpx 变体 + 移动端 rpx 字面量令牌化（349 处） | `scripts/build-tokens-rpx.mjs` + `scripts/tokenize-rpx.mjs` | ✅ 已完成（§10.3） |
| P1 | 按钮六态补齐（点击 / 加载） | `packages/designer/src/styles/panel.css` + `style.css` | ✅ 已完成（§3.2） |
| P1 | 画布工具条 + 标尺 | `App.vue` + `style.css` + `LcCanvas.vue`（`device` / `zoom` props） | ✅ 已完成（§7.1） |
| P2 | 手机壳规格对齐文档（375×620 / 圆角 16） | `packages/tokens/src/tokens.css` | ✅ 已完成 |

### 9.1 设计一致性门禁

```bash
pnpm design:check                 # CI 用这条 = tokens:check + color:check + rpx 产物校验 + contrast:check
pnpm tokens:check [--verbose]     # 设计稿变量 ↔ tokens.css 值比对；漂移 exit 1
pnpm color:check                  # 全仓硬编码色值扫描；有残留 exit 1
pnpm contrast:check               # WCAG 对比度回归（基线见 docs/contrast.json，§2.2.1）
pnpm tokens:rpx                   # 由 tokens.css 派生移动端 rpx 变体
# 机械替换器（幂等，可复跑；--dry 只报告不写盘）：
node scripts/tokenize-colors.mjs [--dry]   # 硬编码色值 → var(--lc-*)
node scripts/tokenize-rpx.mjs    [--dry]   # rpx 字面量 → var(--lc-*)，只替换落在刻度上的值
```

**① 令牌漂移门禁（`tokens:check`）**

- **基准**：`docs/tokens.w3c.json` —— 设计稿变量集的 W3C DTCG 导出（Ardot `export_variables`，`format: w3c-json`）。
- **判定**：单通道差 ≤ 1/255 视为「浮点取整误差」（设计稿变量以 0~1 浮点存储，无法规避）；**≥ 2 判为漂移并失败**。
- **设计稿改动后**：重新导出覆盖 `docs/tokens.w3c.json`，再跑一次门禁。
- **首次接入即抓到的真实漂移**（此前靠手抄，全部静默存在）：
  1. `Component/btn-h-sm` 设计稿变量写着 28，但画布与本文档 §3.2 都是 24 —— **设计文件自相矛盾**；已修变量为 24。
  2. 暗色 `border-strong`（`#3B424F`）与 `dark-400`（`#3D4757`）不一致 —— 已统一到 `dark-400`。
  3. `dark-400`、暗色 `text-danger` / `status-danger`、`canvas-shell` 在 `tokens.css` 里被抄错，已按设计稿修正。

**② 色值字面量门禁（`color:check`）**

- 扫描 `apps/*/src` 与 `packages/*/src` 的全部 `.vue/.css/.ts`，报出任何 `#hex` / `rgb()` / `hsl()` / `oklch()`。
- **它覆盖 `packages/runtime` 与 `packages/materials`** —— 这两个包按 ADR-006 / L-5 刻意不进 `pnpm -r build`（uni 构建重且依赖网络、物料在 jsdom 不可挂载），此前因此完全没有设计门禁覆盖，也就积累出 28 个自造色。本门禁**纯文本扫描、不构建、不联网**，绕开了这个矛盾。
- 豁免：令牌源文件 `packages/tokens/src`；以及行内标记 `design-token-exempt`（当前 4 处，均为平台 chrome 模拟或 material 数据默认值，见代码注释）。
- **它抓到的第一个真问题**：`tokenize-colors.mjs` 曾把 `materials/meta/feedback.ts` 的 `activeColor: '#2b6de8'` 误改成 `var(--lc-action-primary)` —— 那是**属性面板 color setter 读写的数据默认值**，不是样式。已回滚并加豁免标记。这条说明：色值门禁必须与「人工确认哪些是数据、哪些是样式」配合，不能只靠正则。

### 9.2 边界：哪些不算令牌

以下属于**页面布局尺寸**，写在 §7.1 与 `style.css` 里，不进令牌层（进令牌会让「换主题/换品牌」牵动布局，得不偿失）：顶栏 48 / 底栏 32 / 左栏 220–280 / 右栏 280–340 / 画布工具条 40。

同理，**设计器 chrome 专属令牌**（`--lc-topbar-*` 含 4 态徽标、`--lc-device-*`、`--lc-drag-hint*`、`--lc-focus-ring`）在设计稿变量集中不存在，属实现侧扩展，已在门禁报告中列为「信息」而非漂移。

## 10. 覆盖度自查（2026-10-16）

> 口径：硬编码色值计数 = `grep -rohE '#[0-9a-fA-F]{3,8}\b|rgba?\([0-9]' <目录> | wc -l`

### 10.1 已接入（有验证）

| 设计内容 | 落点 | 验证 |
|---|---|---|
| 设计令牌三层（色彩 / 字体 / 间距 / 圆角 / 阴影 / 动效） | `packages/tokens/src/tokens.css`（`:root` 167 项 + 暗色 47 项） | `pnpm tokens:check` 133 项 / 185 处零漂移 |
| 设计器外壳布局（§7.1 顶栏 / 三栏 / 底栏） | `apps/designer-web/src/style.css` + `App.vue` | **硬编码色值 0** |
| 亮暗双主题 | `apps/designer-web/src/theme.ts` + 顶栏切换按钮 | 产物含两套值与 `data-theme` 块 |
| 面板共用件 + 空/加载/错误三态 | `styles/panel.css` + `components/PanelState.vue` | 6 面板接入，14 条用例 |
| 响应式四档 | `apps/designer-web/src/use-breakpoint.ts` + `style.css` 媒体查询 | 产物含抽屉规则 / 媒体查询 / 窄屏提示层 |
| uni-shim 控件外观（switch / picker / radio） | `packages/designer/src/shim/shim.css` | 令牌化完成 |
| **移动端（materials / renderer / runtime）** | 331 处色值 → `var(--lc-*)`（`scripts/tokenize-colors.mjs`） | **硬编码色值 0** |
| 移动端主题 | `packages/runtime/src/theme.ts` + `main.ts` 引入 `@lc/tokens/tokens.rpx.css` | 跟随系统偏好，挂载前落到根节点 |
| **跨端单位** | `tokens.css`（px）→ `tokens.rpx.css`（rpx）派生；移动端 349 处 rpx 字面量令牌化 | 设计器产物 `--lc-space-4:16px`；移动端 `1rem`（=32rpx）—— 逐项像素等价 |
| 画布工具条 + 按钮六态 | `App.vue`（设备/缩放/标尺）+ `panel.css` / `style.css`（六态 + loading） | 产物含 `canvas-chip` / `canvas-ruler`；设计器 21 文件 / 296 用例 |
| 全仓五个 UI 目录 | designer-web / designer / renderer / runtime / materials | **硬编码色值 0 处**（豁免 4 处，均为平台 chrome 模拟或数据默认值） |

### 10.2 未接入 / 部分接入

| # | 项 | 现状 | 影响 |
|---|---|---|---|
| 1 | **组件库的复用边界** | 画布 B4/B5 的 18 个组件在代码里是「共享 CSS 类 + 原生标签」；`packages/designer/src/components/` 仅 `PanelState.vue` | **已按 ADR-007 定性，不再算缺陷**：跨端一致性由令牌承担（4 道门禁），结构复用只发生在同构宿主内（materials 走 uni，已零分支复用）。designer 内部抽 `LcButton` / `LcField` 属**包内复用**，触发条件是「面板数 > 10 或需被第二个 Web 应用复用」，而不是「应该更规范」 |
| 2 | §5 异常状态族的**移动端形态** | ✅ 已落地：`lc-state-view.vue` 共享组件 + `core/state-kind.ts` 分类器，list/detail/壳层三处接入 | 见 §5.1 |
| 3 | 物料面板图标 | ✅ 已落地：33 个 16×16 线性图标（`canvas/material-icons.ts`），规格见 §10.4 | 见 §10.4 |
| 4 | 标尺 · 参考线 | ✅ 双轴标尺（8px/40px 刻度）+ 内容区中心十字虚线，共用一个开关 | 见 §1.1 |
| 5 | 750 / H5 档位是「占位预览」 | rpx→px 基准被构建期插件固定在 375，750 档只放大外壳宽度、内容绝对尺寸不变 | 要做成「真·设备预览」需渲染层支持 per-device rpx 基准 |
| 6 | 表格组件 | 仅有 `.lc-table-*` 令牌，无组件、无使用场景 | 规范预留，等设计器出现表格 UI 再落地 |
| 7 | 视觉回归 | 无浏览器目视（环境无 Chromium） | 色值（331 处）与单位（349 处）替换均为**像素等价换算 + 代码层验证**，但界面观感与暗色主题仍需实测 |
| 8 | `packages/runtime` 仍不在 `pnpm -r` 链内 | ADR-006 / L-5 的刻意决策（我上一轮建议「补 test/build 纳入 CI」是错的，已收回） | 设计一致性已由 `design:check`（纯文本扫描、零构建）覆盖；**行为回归仍无自动门禁**，只能靠实机冒烟 |
| 9 | **图表不跟随亮暗主题** | `materials/src/chart/chart-svg.ts` 产出 SVG 后转 `data:image/svg+xml;base64` —— **CSS 变量在 base64 图片里无法解析**，网格线 `#E5E7EB` / 轴标签 `#6B7280` 只能写字面量（已加 `design-token-exempt` 并注明根因） | 实测（对 `bg-surface`）：<br>亮 网格线 **1.24:1**、轴标签 **4.83:1** ✔<br>暗 网格线 **13.81:1** ✘（亮了 11 倍，扎眼）、轴标签 **3.54:1** ✘（< 4.5，低于 AA）<br>**修法**：让组件按当前主题把色值作为参数传入 SVG 生成函数（`theme.ts` 已能给出模式），生成前替换、主题切换时重算 |

### 10.3 移动端单位：已落地的方案

移动端单位是 `rpx`（750 基准），设计器是 `px`。**采用方案 A：令牌只以 `px` 定义一份，派生 rpx 变体按端消费**，不维护第二份手写 rpx 令牌（那会让 `tokens:check` 只能覆盖一半）。

**实现**

- `scripts/build-tokens-rpx.mjs`：由 `tokens.css` 派生 `tokens.rpx.css`。规则是**只把带 `px` 的数值 ×2 转 rpx**；颜色、无单位数值（字重 400）、`ms`、字符串型令牌一律不动。`--check` 模式保证产物不漂移（已进 `design:check`）。
- `scripts/tokenize-rpx.mjs`：把移动端代码里的 rpx 字面量换成令牌。**只替换落在刻度上的值**（`n rpx` 恰好等于某令牌的 rpx 值），因此替换是**像素等价**的；未命中刻度的 195 处（`1rpx` 发丝线、`6rpx`、`999rpx` 等等）保持字面量并列入报告 —— 绝不「就近归并」，那会真的改变布局。
- 属性感知：同一个 rpx 值在不同属性上属不同刻度（`24rpx` 可能是 `space-3` 间距、`radius-lg` 圆角、或 `font-caption` 字号）。

**实测结果**

| | 设计器（Web） | 移动端（uni H5） |
|---|---|---|
| 源 | `tokens.css` | `tokens.rpx.css`（派生） |
| `--lc-space-4` 产物值 | `16px` | `1rem`（= 32rpx，随屏宽缩放） |
| `--lc-font-body` 产物值 | `14px` | `.875rem`（= 28rpx） |
| 产物残留 `rpx` | — | **0** |

**同一份组件代码**（如 `padding: var(--lc-space-4)`）在两端都正确：设计器得固定 16px（画布 375），移动端得随屏宽缩放的 1rem。移动端构建把 rpx 转成 `rem`，因此**令牌里的 rpx 也必须经构建处理** —— 实测产物残留 0 个 `rpx`，确认 `node_modules` 下的令牌 CSS 同样走该转换。

### 10.4 图标系统（物料面板，33 个）

**为什么内置路径而不引图标包**：33 个 16px 单色图标若引 lucide / heroicons，会带来一份外部依赖 + 版本约束 + tree-shaking 不确定性；与 `lc-icon` 物料既有的「不引字体包」约定也不一致。手绘内联路径是更小的成本。

**规格**（改任何一个都不要破例）

| 项 | 值 |
|---|---|
| viewBox | `16 × 16` |
| 活区 | `2 – 14`（四周留 2px 呼吸） |
| 描边 | `1.5`，`stroke-linecap / linejoin: round` |
| 填充 | `none`；仅实心点用 `fill="currentColor" stroke="none"`（Radio 圆心、Switch 滑块、Tabs 激活页签） |
| 上色 | 全部 `currentColor` —— 面板项默认 `text-tertiary`，悬停随父级变 `action-primary` |

**隐喻分配原则**：一个语义一个隐喻；相近物料靠**构图**区分，不靠细节差异。

| 易混组 | 区分方式 |
|---|---|
| Input / Select / Textarea / Picker | 框 + 光标 / 框 + 右箭头 / 框 + 三行（末行短）/ 无框三行（中间实两侧淡出＝滚轮） |
| Cell / Detail / List | 框 + 右箭头 / 两行「短键+长值」/ 三行「圆点 + 线」 |
| DatePicker / DateTimePicker | 日历（顶栏分隔 + 两个挂环）/ 时钟（**不做叠挂件** —— 16px 下必糊） |
| Cascader / DeptPicker | 双箭头「逐级深入」/ 组织树（上节点 + 连接线 + 两个下节点） |
| FileUpload / Upload | 文档 + 上箭头 / 相框 + 上箭头 |

**回归守卫**（`packages/designer/test/material-icons.test.ts`，7 条）：
每个可拖物料都有图标（防新增漏配）· 无僵尸图标 · 未登记走兜底 · **每个图标都是合法 SVG**（防手绘路径语法错）· 无硬编码色值 · 不内嵌 `<svg>` / 不引外部资源 · 显式坐标不越网格。

**审阅入口**：`pnpm icons:sheet` → `docs/material-icons.html`（按 3× / 2× / **1×** 三档并排，重点看 16px 那列是否仍可辨认）。该文件由脚本从源码生成，勿手改。

---

*文档版本 v1.1 · 与设计稿《LowCode 跨端 UI 设计系统》同步*
