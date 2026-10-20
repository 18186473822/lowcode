/**
 * meta —— 导航类物料元信息（Tabs / SearchBar，Phase 2 批 3）。
 * 事实源：各物料 index.vue 的实际 props 与 emit（Tabs emit switch；SearchBar emit update/confirm）。
 */
import type { MaterialSchema } from '@lc/schema'

export const NAV_META: MaterialSchema[] = [
  {
    name: 'Tabs',
    title: '标签页',
    category: 'nav',
    order: 1,
    version: '1.0.0',
    defaultProps: {
      items: [{ label: '标签一' }, { label: '标签二' }, { label: '标签三' }],
      activeIndex: 0,
    },
    settings: [
      {
        key: 'items',
        label: '标签项（JSON）',
        setter: 'textarea',
        placeholder: '[{"label":"标签一"}]',
        help: '面板 children 嵌套切换留后续（见台账未做项）',
      },
      { key: 'activeIndex', label: '激活下标', setter: 'number' },
    ],
    events: ['switch'],
    supports: { condition: true, loop: false, perm: false },
  },
  {
    name: 'SearchBar',
    title: '搜索框',
    category: 'nav',
    order: 2,
    version: '1.0.0',
    hasField: true,
    defaultProps: { name: '', placeholder: '搜索', value: '$expr: formData.keyword', showButton: false },
    settings: [
      { key: 'name', label: '字段名', setter: 'input', placeholder: '搜索词写入 formData 的键，如 keyword' },
      { key: 'placeholder', label: '占位提示', setter: 'input' },
      { key: 'showButton', label: '常驻搜索按钮', setter: 'switch' },
      { key: 'disabled', label: '禁用', setter: 'switch' },
    ],
    events: ['update', 'confirm'],
    supports: { condition: true, loop: false, perm: true },
    defaultRules: [],
  },
]
