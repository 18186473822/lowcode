/**
 * material-icons.ts —— 物料面板图标集（design-system.md §7.1 物料面板 / 画布 B6）
 *
 * 为什么内置路径而不引图标包：
 *   与 `lc-icon` 物料的既有约定一致（「不引字体包」，见该物料注释）。34 个图标若引
 *   lucide/heroicons 会带来 ~30KB 的 tree-shaken 依赖与一套外部版本约束，而这里只需
 *   34 个 16px 单色线性图标 —— 内联路径是更小的成本。
 *
 * 规格（34 个图标全部遵守，改任何一个都不要破例）：
 *   - **viewBox 16×16**，活区 2..14（四周留 2px 视觉呼吸）
 *   - **描边 1.5**，`stroke-linecap/linejoin: round`，`fill: none`
 *   - **单色**：全部用 `currentColor`，颜色由宿主 CSS 决定（悬停变主色）
 *   - 需要实心点时用 `fill="currentColor" stroke="none"`（如 Radio 圆心、Switch 滑块）
 *   - 一个语义一个隐喻，同类物料靠**构图**区分而非靠细节：
 *     Input(框+光标) / Select(框+下箭头) / Textarea(框+三行) / Picker(滚轮式三行渐变)
 *     / DatePicker(日历) / DateTimePicker(时钟) / Cell(框+右箭头) / Detail(键值对) / List(圆点行)
 *     / Chart(坐标轴+柱) / Statistic(卡片+上扬折线)
 *
 * 返回的是 `<svg>` 内部标记（不含 svg 标签），由调用方塞进统一外壳。
 */

export const MATERIAL_ICONS: Record<string, string> = {
  /* ---------------- basic ---------------- */
  // 图标 / 图形：四角星（sparkle）—— 「一个图形符号」的最小表达
  Icon: '<path d="M8 2.5c.9 3.1 2.4 4.6 5.5 5.5-3.1.9-4.6 2.4-5.5 5.5-.9-3.1-2.4-4.6-5.5-5.5C5.6 7.1 7.1 5.6 8 2.5Z"/>',
  // 图片：相框 + 太阳 + 山脊
  Image:
    '<rect x="2.5" y="3.5" width="11" height="9" rx="2"/><circle cx="5.9" cy="6.6" r="1.05"/><path d="M3.3 11.4 6 8.7a1.1 1.1 0 0 1 1.5 0l3.6 3.4"/>',
  // 标签：吊牌形 + 穿孔
  Tag: '<path d="M2.6 4.2a1.6 1.6 0 0 1 1.6-1.6h3.5c.4 0 .9.2 1.2.5l4.2 4.2a1.7 1.7 0 0 1 0 2.4l-3.4 3.4a1.7 1.7 0 0 1-2.4 0L3.1 8.9a1.7 1.7 0 0 1-.5-1.2V4.2Z"/><circle cx="6.1" cy="6.1" r="1"/>',
  // 文本：字母 T 的骨架
  Text: '<path d="M3.6 4.3h8.8M8 4.3v8.2"/>',

  /* ---------------- biz ---------------- */
  // 审批操作：剪贴板 + 勾（代表「通过」）
  ApprovalBar:
    '<rect x="3.1" y="3.5" width="9.8" height="10.1" rx="2"/><path d="M6.2 2.9h3.6a.8.8 0 0 1 .8.8v1.1a.8.8 0 0 1-.8.8H6.2a.8.8 0 0 1-.8-.8V3.7a.8.8 0 0 1 .8-.8Z"/><path d="m5.9 9.5 1.5 1.5 2.9-3.1"/>',
  // 流转时间轴：竖轴 + 实心/空心节点 + 右侧说明段
  Timeline:
    '<path d="M4.7 3.4v9.2"/><circle cx="4.7" cy="5.1" r="1.5" fill="currentColor" stroke="none"/><circle cx="4.7" cy="11" r="1.4"/><path d="M7.6 5.1h5M7.6 11h3.4"/>',

  /* ---------------- data ---------------- */
  // 单元格：一行容器 + 右侧指示箭头
  Cell: '<rect x="2.5" y="4.2" width="11" height="7.6" rx="2"/><path d="m10.1 6.7 1.5 1.3-1.5 1.3"/>',
  // 描述组：键值对（短键 + 长值），两行
  Detail:
    '<path d="M3.2 5.4h2.4M7.4 5.4h5.4M3.2 10.4h2.4M7.4 10.4h5.4"/>',
  // 列表：圆点行（与 Detail 的「键值对」构图区分）
  List:
    '<path d="M3.4 5h.01M5.9 5h6.7M3.4 8h.01M5.9 8h6.7M3.4 11h.01M5.9 11h6.7"/>',
  // 图表：坐标轴 + 两根柱（柱状语义的最小表达）
  Chart:
    '<path d="M3 3.4v9.2h10"/><rect x="5.1" y="7.9" width="1.9" height="4.7" rx=".5"/><rect x="8.6" y="5.4" width="1.9" height="7.2" rx=".5"/>',
  // 指标卡：卡片 + 上扬折线（数值/趋势语义）
  Statistic:
    '<rect x="2.5" y="4.1" width="11" height="7.8" rx="2"/><path d="M4.9 9.7 7 7.6l1.6 1.6 2.5-2.8"/><path d="M9.6 6.4h1.5v1.5"/>',

  /* ---------------- feedback ---------------- */
  // 按钮：胶囊 + 内部短标签
  Button: '<rect x="2.5" y="4.6" width="11" height="6.8" rx="3.4"/><path d="M6.3 8h3.4"/>',
  // 进度条：轨道 + 已推进的填充段
  Progress:
    '<rect x="2.5" y="6.4" width="11" height="3.2" rx="1.6"/><path d="M4.4 8h3.6" stroke-width="3.2"/>',
  // 评分：五角星
  Rate:
    '<path d="m8 2.5 1.7 3.4 3.7.5-2.7 2.6.6 3.7L8 11l-3.3 1.7.6-3.7-2.7-2.6 3.7-.5L8 2.5Z"/>',

  /* ---------------- form ---------------- */
  // 级联选择：双箭头「逐级深入」
  Cascader: '<path d="m4.4 4.4 3.2 3.6-3.2 3.6M9 4.4l3.2 3.6L9 11.6"/>',
  // 多选：方框 + 勾
  Checkbox: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.2"/><path d="m5.1 8.3 1.9 1.9 3.9-4.1"/>',
  // 日期选择：日历（顶栏分隔 + 两个挂环）
  DatePicker:
    '<rect x="2.5" y="3.9" width="11" height="9.6" rx="2"/><path d="M2.5 6.9h11M5.6 2.7v2.4M10.4 2.7v2.4"/>',
  // 日期时间：时钟（与日历构图区分，避免两个挂件叠在 16px 里糊成一团）
  DateTimePicker: '<circle cx="8" cy="8" r="5.3"/><path d="M8 4.9v3.5l2.4 1.4"/>',
  // 部门选择：组织树（上节点 + 连接线 + 两个下节点）
  DeptPicker:
    '<rect x="6.2" y="2.4" width="3.6" height="2.9" rx=".9"/><rect x="2.5" y="10.4" width="3.6" height="2.9" rx=".9"/><rect x="9.9" y="10.4" width="3.6" height="2.9" rx=".9"/><path d="M8 5.3v2.6M4.3 10.4V7.9h7.4v2.5"/>',
  // 文件上传：文档 + 向上箭头
  FileUpload:
    '<rect x="3.2" y="2.5" width="9.6" height="11" rx="2"/><path d="M8 10.4V5.8M6.2 7.6 8 5.8l1.8 1.8"/>',
  // 单行输入：框 + 文本光标
  Input: '<rect x="2.5" y="4.6" width="11" height="6.8" rx="1.9"/><path d="M6.1 6.4v3.2"/>',
  // 金额输入：¥（两横 + 竖 + 两撇）
  MoneyInput: '<path d="M5.1 3.6 8 7.9l2.9-4.3M8 7.9v4.5M5.4 8.7h5.2M5.4 10.7h5.2"/>',
  // 数字输入：井号（数字语义的最小符号）
  NumberInput: '<path d="M6.5 3.4 5.7 12.6M10.3 3.4l-.8 9.2M3.7 6.4h9M3.3 9.6h9"/>',
  // 选择器：滚轮式三行（中间实、两侧淡出）
  Picker:
    '<path d="M4.7 4.9h6.6" opacity=".5"/><path d="M3.4 8h9.2"/><path d="M4.7 11.1h6.6" opacity=".5"/>',
  // 单选：圆环 + 实心圆心
  Radio:
    '<circle cx="8" cy="8" r="5.3"/><circle cx="8" cy="8" r="2.1" fill="currentColor" stroke="none"/>',
  // 下拉选择：框 + 右端下箭头
  Select: '<rect x="2.5" y="4.6" width="11" height="6.8" rx="1.9"/><path d="m10.3 6.9 1.3 1.3-1.3 1.3"/>',
  // 开关：胶囊 + 右侧滑块（开启态）
  Switch:
    '<rect x="2.5" y="5" width="11" height="6" rx="3"/><circle cx="10.6" cy="8" r="1.75" fill="currentColor" stroke="none"/>',
  // 多行输入：框 + 三行（末行短，暗示换行）
  Textarea:
    '<rect x="2.5" y="3.5" width="11" height="9" rx="1.9"/><path d="M5 6.2h6M5 8.2h6M5 10.2h3.4"/>',
  // 图片上传：相框 + 向上箭头
  Upload:
    '<rect x="2.5" y="3.6" width="11" height="8.9" rx="2"/><path d="M8 10V6.1M6.4 7.7 8 6.1l1.6 1.6"/>',
  // 人员选择：人像（头 + 肩）
  UserPicker: '<circle cx="8" cy="5.7" r="2.6"/><path d="M2.9 13a5.1 5.1 0 0 1 10.2 0"/>',

  /* ---------------- layout ---------------- */
  // 分组标题：短粗标题段 + 细延伸线（同一基线）
  Divider: '<path d="M2.6 8h3.2" stroke-width="2.6"/><path d="M7.4 8h6"/>',
  // 分组容器：虚线框 + 内部两项
  FormGroup:
    '<rect x="2.5" y="2.5" width="11" height="11" rx="2.2" stroke-dasharray="2.2 2"/><path d="M5.3 6.4h5.4M5.3 9.6h3.4"/>',
  // 页面根容器：画布 + 内部居中内容块
  Page: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.2"/><path d="M5.4 5.6h5.2v4.8H5.4z"/>',

  /* ---------------- nav ---------------- */
  // 搜索框：放大镜
  SearchBar: '<circle cx="7.2" cy="7.2" r="4.3"/><path d="m10.5 10.5 3 3"/>',
  // 标签页：首个激活（实心）+ 第二个未激活 + 底部基线
  Tabs:
    '<rect x="2.5" y="4.6" width="5.1" height="2.7" rx="1.35" fill="currentColor" stroke="none"/><rect x="8.9" y="4.6" width="4.6" height="2.7" rx="1.35"/><path d="M2.5 9.3h11"/>',
}

/** 兜底：未登记物料画一个中性方块，避免面板出现空白格 */
const FALLBACK = '<rect x="3.2" y="3.2" width="9.6" height="9.6" rx="2"/>'

/** 取某个物料的图标内部标记；未登记时返回兜底图形 */
export function materialIcon(name: string): string {
  return MATERIAL_ICONS[name] ?? FALLBACK
}
