/**
 * meta —— 布局容器类物料元信息（Page / FormGroup / Divider）。
 * 事实源：lc-node.vue 容器分支（Page 不读 props；FormGroup 读 title/label + required）。
 */
import type { MaterialSchema } from '@lc/schema'

export const LAYOUT_META: MaterialSchema[] = [
  {
    name: 'Page',
    title: '页面根容器',
    category: 'layout',
    order: 0,
    isContainer: true,
    version: '1.0.0',
    // lc-node 的 Page 分支为空模板（仅承载 children），不读任何 props —— settings 为空是诚实表达
    defaultProps: {},
    settings: [],
    supports: { loop: false },
  },
  {
    name: 'FormGroup',
    title: '分组容器',
    category: 'layout',
    order: 1,
    isContainer: true,
    version: '1.0.0',
    defaultProps: { title: '分组标题' },
    settings: [
      { key: 'title', label: '分组标题', setter: 'input' },
      { key: 'required', label: '标题标必填星', setter: 'switch' },
    ],
    supports: { condition: true, loop: true },
  },
  {
    name: 'Divider',
    title: '分割线',
    category: 'layout',
    order: 2,
    version: '1.0.0',
    defaultProps: { text: '', direction: 'center' },
    settings: [
      { key: 'text', label: '中间文字', setter: 'input', placeholder: '留空则只显示线' },
      {
        key: 'direction',
        label: '文字位置',
        setter: 'select',
        options: [
          { label: '居左', value: 'left' },
          { label: '居中', value: 'center' },
          { label: '居右', value: 'right' },
        ],
      },
    ],
    supports: { condition: true, loop: true },
  },
]
