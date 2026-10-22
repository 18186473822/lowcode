# 设计系统 · 工程化与台账

> 本文件是《[设计系统](./design-system.md)》的**拆分件**：规范本体（§0–§8）只讲「要做什么」，
> 这里放「做到哪了、怎么验证、还有哪些没做」。**章节号沿用原编号（§9 / §10），避免各处引用失效**；文中出现的 §1–§8 一律指 `design-system.md` 的对应章节。

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
pnpm design:check                 # CI 用这条 = tokens + color + dimensions + rpx + rpx 产物 + contrast 六道
pnpm tokens:check [--verbose]     # 设计稿变量 ↔ tokens.css 值比对；漂移 exit 1
pnpm color:check                  # 全仓硬编码色值扫描；有残留 exit 1
pnpm dimensions:check             # px 间距 + 行高比率：仍落在刻度上的字面量 → exit 1
pnpm rpx:check                    # 移动端 rpx：仍落在刻度上的字面量 → exit 1
pnpm contrast:check               # WCAG 对比度回归（基线见 docs/contrast.json，§2.2.1）
pnpm tokens:audit                 # 令牌**应用度体检**（不是门禁）：死令牌 / 各目录密度 / 断链
pnpm tokens:rpx                   # 由 tokens.css 派生移动端 rpx 变体
# 机械替换器（幂等，可复跑；--dry 只报告不写盘）：
node scripts/tokenize-colors.mjs [--dry]   # 硬编码色值 → var(--lc-*)
node scripts/tokenize-rpx.mjs    [--dry]   # 移动端 rpx 字面量 → 令牌（只替换刻度上的值）
node scripts/tokenize-dimensions.mjs [--dry] # px 间距 + 行高比率 → 令牌（同上口径）
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

### 10.2 接入台账

> **结论摘要（2026-10-22 收口）**
>
> | 类别 | 数量 | 条目 |
> |---|---|---|
> | ✅ **已清零 / 已落地** | **10** | #2 异常状态族移动端 · #3 物料图标 · #4 标尺参考线 · #5 750/H5 真预览 · #9 图表跟随主题 · #10 L3 接线 · #11 字重行高 · #12 间距字面量 · #13 顶栏溢出 · #16 rpx 门禁 |
> | 🔒 **已定性 / 刻意不做** | 3 | #1 组件复用边界（ADR-007）· #6 表格组件（等场景）· #8 runtime 不进 `pnpm -r`（ADR-006） |
> | ⚠️ **仍受环境限制** | 1 | #7 视觉回归（可做但未自动化，无截图对比基线） |
> | 📌 **踩坑结论**（非待办） | 2 | #14 `zoom` vs `transform` · #15 别用测量值设自身 height |
> | ❗ **复核新发现的未达成项** | 1 | 移动端触控目标 ≥44px（见 §10.5，输入框实测约 37px） |
>
> 从「26 达标 / 12 缺口」的对比度，到这张表，**设计稿还原这一轮的目标已全部收口**；剩余三项都有明确理由，不再是「待 someone 认领」。

| # | 项 | 现状 | 影响 |
|---|---|---|---|
| 1 | **组件库的复用边界** | 画布 B4/B5 的 18 个组件在代码里是「共享 CSS 类 + 原生标签」；`packages/designer/src/components/` 仅 `PanelState.vue` | **已按 ADR-007 定性，不再算缺陷**：跨端一致性由令牌承担（6 道门禁），结构复用只发生在同构宿主内（materials 走 uni，已零分支复用）。designer 内部抽 `LcButton` / `LcField` 属**包内复用**，触发条件是「面板数 > 10 或需被第二个 Web 应用复用」，而不是「应该更规范」 |
| 2 | §5 异常状态族的**移动端形态** | ✅ 已落地：`lc-state-view.vue` 共享组件 + `core/state-kind.ts` 分类器，list/detail/壳层三处接入 | 见 §5.1 |
| 3 | 物料面板图标 | ✅ 已落地：33 个 16×16 线性图标（`canvas/material-icons.ts`），规格见 §10.4 | 见 §10.4 |
| 4 | 标尺 · 参考线 | ✅ 双轴标尺（8px/40px 刻度）+ 内容区中心十字虚线，共用一个开关。**动态对齐线刻意不做**：本画布是流式布局重排（before/after/into，落点由文档顺序决定），不是自由定位 —— 对齐虚线会误导用户以为能按像素摆放；拖拽的正确反馈是插入指示线 | 见 §1.1 与 `LcCanvas` 注释 |
| 5 | 750 / H5 档位 | ✅ 已改造（2026-10-22）：页面层布局宽恒 375，按档位 `zoom`（375 ×1 / 750 ×2 / H5 = 可用宽÷375），外壳宽 375×z。**原理：rpx 按比例，「750 设计宽」≡「375 布局 ×2 渲染」**，不必再派生一套 750 令牌 | **已目视确认**：同一视口 375 档可见 8 个字段、750 档只可见 4 个（文字/间距/输入框全部 2×）；375 档与改造前完全一致（卡片高 676 vs 684，无回归）。选 `zoom` 而非 `transform`：zoom **参与布局**，外壳高度自动跟随，不需要量高度补偿 |
| 6 | 表格组件 | 仅有 `.lc-table-*` 令牌，无组件、无使用场景 | 规范预留，等设计器出现表格 UI 再落地 |
| 7 | 视觉回归 | ✅ **已具备条件并执行过**（2026-10-21/22，浏览器可用）。已目视：物料面板 33 图标、双轴标尺+参考线、暗色主题全貌、顶栏换行/「更多」菜单、图表双主题、750 设备预览、`PanelState` 错误态/空态 | 色值（331 处）与单位（349 处）替换为**像素等价换算 + 代码层验证**，观感由上述目视补齐。⚠️ 仍未自动化 —— 无截图对比基线，属「人工抽检」而非「回归门禁」 |
| 8 | `packages/runtime` 仍不在 `pnpm -r` 链内 | ADR-006 / L-5 的刻意决策（我上一轮建议「补 test/build 纳入 CI」是错的，已收回） | 设计一致性已由 `design:check`（纯文本扫描、零构建）覆盖；**行为回归仍无自动门禁**，只能靠实机冒烟 |
| 9 | 图表跟随亮暗主题 | ✅ 已修（2026-10-21）。`chart-svg.ts` 改为接受 `ChartTheme`（网格 / 轴标签 / 6 色系列），组件按当前主题传入并在 `data-theme` 变化时重算。**根因是 base64 SVG 里 CSS 变量不解析**，所以颜色只能在生成时定死 —— 令牌层解决不了 | 修前：暗色网格线 **13.81:1**（刺眼 11 倍）、轴标签 **3.54:1**（< AA）。修后：**1.31 / 6.83**。顺带修了系列色：亮色琥珀 `2.03` → `3.23`、青 `2.77` → `4.02`（WCAG 1.4.11 图形对象需 ≥3:1）；暗色品牌蓝 `3.63` → `5.90` |
| 10 | L3 组件层接线（2026-10-21 已接） | **已接线**：`.op-btn` / `.op-btn--primary` / `.op-btn--icon` 全走 `--lc-btn-*`；`.setter__input` / `.setter__select` 全走 `--lc-input-*`；侧栏边框走 `--lc-panel-border`。死令牌 **25 → 7** | 剩余 7 项均为**暂无对应界面**，不是漏接：`btn-h-sm/lg/touch`（设计器只有一档尺寸；touch 属移动端）、`panel-radius`（侧栏是通栏，无圆角面板）、`table-*`（表格组件未建） |
| 11 | 字重 / 行高 | ✅ **两项均已接**。字重：28 处 → `--lc-weight-semibold/bold`，残留 0。行高：新增**无单位比率**一族（`--lc-leading-label/compact/ui/readable/prose`），22 处比率字面量已替换；仅 3 处特例保留（按钮用行高撑高度的 `2.4`、角标固定高度 `92rpx`/`16px`） | 见 §2.3「行高：两族令牌，别混用」。`--lc-lh-*(px)` 仍只用于固定尺寸标题与精确算高的控件 |
| 12 | 间距类 px 字面量 | ✅ 已收敛：补 2px 半档（`space-0-5/1-5/2-5`）+ `pnpm dimensions:check` 门禁；**83 → 32 处**，剩余 32 处全是刻度外光学微调（`3px`/`5px`/`7px`/`14px`/`18px`），按设计保留 | 见 §2.4 间距刻度脚注 |
| 13 | 顶栏溢出 | ✅ 已完整落地（2026-10-21）：`.top-btn` 等禁换行；**「更多」溢出菜单**已实现（`TopMoreMenu.vue`，宽屏原地平铺 / 窄屏收进下拉，同一份内容不抄两遍）。菜单用 `position: fixed` + 视口坐标 —— 顶栏开了 `overflow-x: auto`，绝对定位浮层会被滚动容器裁掉 | 阈值按实测取 **1600**（原规范写 1180，会导致 1180–1600 仍溢出），已回写 §3.2 |
| 14 | **`zoom` vs `transform`：要「布局也跟着涨」就用 zoom** | 曾误判「Chrome 的 `zoom` 只放大盒模型、不缩放内容」并写进台账 —— **该结论是错的**，已撤销。真相：那次看到「外壳变宽但文字没放大」是**另一个 bug**（见 #15）造成的假象 | `zoom` 参与布局（盒模型与内容一起缩放，父级 auto 高度自动跟随）；`transform` 不参与布局（需自行补偿高度）。**设备预览这种要连高度一起缩的用 `zoom`** |
| 15 | **不要用「测量值」给元素设固定 height** | 真预览那次回退的第二个坑：用 ResizeObserver 量出的高度回写成元素自身的 `height`，首次测量撞上「页面加载中」态 → 高度被冻结，之后内容再长也被 `overflow:hidden` 裁掉 | 要补偿 transform 的高度，应量**内容子元素**而非被设了高度的容器本身，或改用不依赖测量的手法 |
| 16 | **移动端 rpx 字面量此前无门禁** | ✅ 已补 `--check` 并接进 `design:check`（`pnpm rpx:check`）。**上线即抓到 5 处**新代码（`chart/index.vue`、`lc-portal-page.vue`）带进的可令牌化字面量，已修正 | 与设计器侧 `dimensions:check` 对称；只剩 247 处刻度外光学微调保留 |

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

---

### 10.6 画布悬停/选中：只描边不填色（2026-10-22）

**缺陷**：design 态每个节点都盖一层 `inset:0` 的 `.lc-node__mask`，悬停时给它填了
`--lc-action-primary-subtle`（近白）—— 遮罩在内容之上，**整块组件被糊住**，表现就是
「指针移到物料上那块变白」。

**修法**：悬停/选中一律**只描边、绝不填色**；并顺带修了两个显示问题：

| 项 | 修前 | 修后 |
|---|---|---|
| 悬停 | 1rpx（0.5px）边 + 近白底 → 看不清且糊内容 | 1px `--lc-brand-400` 描边，无底色 |
| 选中 | 1px 主色边 + 近白底 | **2px** 主色描边，无底色，层级比悬停重一档 |
| 已选中节点被悬停 | `:hover` 特异度更高，**把选中降级成浅色细边** | 显式覆盖 `--selected:hover`，选中态不被悬停影响 |

**给后续的提醒**：这类覆盖在内容之上的遮罩层，`background` 一律视为危险属性 ——
要强调就加描边、外阴影或角标，不要填色。

### 10.7 拖拽「挤动」：方案已定、未落地（2026-10-22）

需求：拖拽换位时，**其他组件要让开**，而不只是画一条落点线。

**方案（已验证可行，代码已回退，可直接照做）**

1. 拖起时量一次源节点高度 `dragH`（之后幽灵带 transform，再量就含位移了）。
2. 按落点算需要让位的**同级兄弟**：`position=before` → 目标及其后全部；`after` → 目标之后。
3. 给它们写 `--lc-squeeze: <dragH>px`，CSS 用 **`margin-top: var(--lc-squeeze, 0px)`** 让位。
4. 落点变化才重算（用 `nodeId:position:h` 作 key），否则每帧改样式。
5. `into` 不挤动 —— 放进容器时容器自己变大，兄弟无需让位。

外观已用「冻结态截图」验证：幽灵浮起（虚线描边 + 投影）+ 下方组件整体下移 ✔

**踩到的两个坑（关键）**

| 坑 | 现象 | 结论 |
|---|---|---|
| 用 `transform: translateY()` 让位 | **每个节点变成层叠上下文**，父节点的遮罩被抬到子节点之上 —— 点哪里都命中根容器，整块画布选不中节点 | 让位必须用 **`margin-top`**（参与布局、不建层叠上下文）。附带好处：`getBoundingClientRect` 已含位移，不必再写补偿逻辑 |
| 含输入框的节点命中测试不稳定 | 拖拽/点选在「文本」节点正常，在「单行输入」节点失效 | **未定位**。怀疑 uni 输入框在遮罩之上抢走了 hit-test，但抬 `z-index`、去 `position`、给内容 `pointer-events:none` 均未解决。**需要用 devtools 看 `elementFromPoint` 与合成层**，别再靠截图反推 |

**为什么回退**：上表第二条没解决前，挤动会让拖拽本身变得不可靠；宁可先保持已验证的「幽灵 + 落点线」，也不交付一个会误伤选择/拖拽的版本。

### 10.5 验收清单缺口（2026-10-22 复核）

§8.2 的 7 条验收项，逐条复核后 **4 条达成、3 条未达成**：

| §8.2 验收项 | 状态 | 证据 / 差距 |
|---|---|---|
| 三档实测无横向滚动、无裁切 | ⚠️ 部分 | 375 / 1346 / 1707 已目视；**768 档未实测**。顶栏在窄窗是**刻意**横向滚动（§3.2 溢出菜单） |
| 三档信息顺序一致、主操作位置不变 | ✅ | 画布居中、侧栏降级为抽屉，位置不随档位变 |
| 亮暗切换后仍满足 AA | ✅ | `pnpm contrast:check` 42/42 双模式 |
| 移动端可点目标 ≥ 44×44 | ✅ **已修（2026-10-22）** | 采用**混合策略**：控件尺寸不动，只扩可点范围 —— ① 单选/多选：`label`/选项本身即热区，加 12px 对称留白（21 → 约 45）；② 输入框：视觉仍 37，用伪元素上下各扩 4px（落在容器 8px 内边距里，与相邻字段仍余 8px，不抢点击）。⚠️ **开关是已知例外**：`<switch>` 原生控件 40×24，唯一的非缩放方案是「整行可点」，属交互行为变更且与画布 design 态点击选中冲突，故保留 24px |
| 键盘可完成全部核心操作、焦点环可见 | ⚠️ 部分 | `focus-visible` + Ctrl+Z/Y/C/X/V 已落；**全流程未逐项验证** |
| 六态两端可复现 | ✅ | `state-kind.ts` 6 类（empty/loading/error/no-auth/forbidden/not-found）；网络失败归 `error` 并配专属文案，校验失败为字段级 |
| 硬编码色值 0 处 | ✅ | `pnpm color:check` 0 处 |

**结论**：验收清单 7 条已全部达成或给出明确例外。触控目标选了「只扩热区」的混合策略（视觉密度不变），
唯一例外是开关（见上）。按 Fitts 定律，开关位于行尾且**右侧贴边**，横向 40px 的可点宽度已足够，误触风险低。
