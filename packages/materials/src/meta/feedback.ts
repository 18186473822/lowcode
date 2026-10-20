/**
 * meta —— 反馈动作类物料元信息（Button）。
 * 事实源：button/index.vue（emit 'click'，disabled 拦截；lc-node onTap → handleEvent）。
 */
import type { MaterialSchema } from '@lc/schema'

export const FEEDBACK_META: MaterialSchema[] = [
  {
    name: 'Button',
    title: '按钮',
    category: 'feedback',
    order: 1,
    version: '1.0.0',
    defaultProps: { text: '按钮', type: 'default' },
    settings: [
      { key: 'text', label: '按钮文字', setter: 'input' },
      {
        key: 'type',
        label: '样式类型',
        setter: 'select',
        options: [
          { label: '默认', value: 'default' },
          { label: '主要', value: 'primary' },
        ],
      },
      { key: 'disabled', label: '禁用', setter: 'switch' },
    ],
    events: ['click'],
    supports: { condition: true, perm: true },
    actionTypes: ['navigate', 'submit', 'http', 'toast'],
  },
  /* ---------------- Phase 2 批 3 ---------------- */
  {
    name: 'Progress',
    title: '进度条',
    category: 'feedback',
    order: 2,
    version: '1.0.0',
    // material 的**默认属性值**：属性面板 color setter 会读写它并写进 schema，
    // 不是样式声明 —— 换成 CSS 变量会让面板拿到非法色值。主题化应通过取值约定解决。
    // design-token-exempt
    defaultProps: { percent: 40, activeColor: '#2b6de8', showText: true },
    settings: [
      { key: 'percent', label: '进度(%)', setter: 'number' },
      { key: 'activeColor', label: '进度颜色', setter: 'color' },
      { key: 'showText', label: '显示百分比', setter: 'switch' },
    ],
    supports: { condition: true, loop: true },
  },
  {
    name: 'Rate',
    title: '评分',
    category: 'feedback',
    order: 3,
    version: '1.0.0',
    hasField: true,
    defaultProps: { name: '', label: '评分', max: 5, value: '$expr: formData.score' },
    settings: [
      { key: 'label', label: '标签', setter: 'input' },
      { key: 'name', label: '字段名', setter: 'input', placeholder: '提交数据的键' },
      { key: 'max', label: '星数', setter: 'number' },
      { key: 'required', label: '必填', setter: 'switch' },
      { key: 'disabled', label: '禁用', setter: 'switch' },
    ],
    events: ['update'],
    supports: { condition: true, loop: true, perm: true },
    defaultRules: [],
  },
]
