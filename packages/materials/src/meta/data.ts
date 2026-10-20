/**
 * meta —— 数据展示类物料元信息（Detail / Cell / List，Phase 2 批 3）。
 * 事实源：各物料 index.vue 的实际 props 与 emit（Detail 纯展示；Cell emit click；List emit itemClick）。
 */
import type { MaterialSchema } from '@lc/schema'

export const DATA_META: MaterialSchema[] = [
  {
    name: 'Detail',
    title: '描述组',
    category: 'data',
    order: 1,
    version: '1.0.0',
    defaultProps: {
      items: [
        { label: '标题', value: '内容' },
        { label: '备注', value: '—' },
      ],
    },
    settings: [
      {
        key: 'items',
        label: '描述项（JSON）',
        setter: 'textarea',
        placeholder: '[{"label":"标题","value":"内容"}]',
        help: '只读键值对展示；value 支持字符串/数字/布尔',
      },
    ],
    events: [],
    supports: { condition: true, loop: false, perm: false },
  },
  {
    name: 'Cell',
    title: '单元格',
    category: 'data',
    order: 2,
    version: '1.0.0',
    defaultProps: { label: '标题', value: '', icon: '', arrow: true, border: true },
    settings: [
      { key: 'label', label: '标题', setter: 'input' },
      { key: 'value', label: '值', setter: 'input' },
      { key: 'icon', label: '前置图标', setter: 'input', placeholder: '如 success / user（内置图标集）' },
      { key: 'arrow', label: '右侧箭头', setter: 'switch' },
      { key: 'border', label: '底部分割线', setter: 'switch' },
    ],
    events: ['click'],
    supports: { condition: true, loop: true, perm: true },
  },
  {
    name: 'List',
    title: '列表',
    category: 'data',
    order: 3,
    version: '1.0.0',
    defaultProps: {
      items: [
        { title: '事项一', desc: '描述信息' },
        { title: '事项二' },
      ],
    },
    settings: [
      {
        key: 'items',
        label: '列表项（JSON）',
        setter: 'textarea',
        placeholder: '[{"title":"标题","desc":"描述"}]',
        help: '静态数据列表（导航/快捷入口）；模型驱动列表用「列表标准页」',
      },
    ],
    events: ['itemClick'],
    supports: { condition: true, loop: false, perm: true },
  },
  /* ---------------- Phase 3 批 4：图表与指标（D-P3-10） ---------------- */
  {
    name: 'Chart',
    title: '图表',
    category: 'data',
    order: 4,
    version: '1.0.0',
    defaultProps: {
      chartType: 'bar',
      title: '统计图',
      data: '',
      modelId: '',
      dimension: '',
      metric: 'count',
      metricField: '',
      limit: 8,
      height: 200,
    },
    settings: [
      {
        key: 'chartType',
        label: '图表形态',
        setter: 'select',
        options: [
          { label: '柱状图', value: 'bar' },
          { label: '折线图', value: 'line' },
          { label: '饼图', value: 'pie' },
        ],
      },
      { key: 'title', label: '标题', setter: 'input' },
      {
        key: 'data',
        label: '静态数据（JSON）',
        setter: 'textarea',
        placeholder: '[{"label":"一月","value":12}]',
        help: '非空则优先于模型取数，用于静态预览',
      },
      { key: 'modelId', label: '模型 id', setter: 'input', placeholder: '如 m_leave（与维度同配才取数）' },
      { key: 'dimension', label: '维度字段', setter: 'input', placeholder: '分组字段 key，如 dept' },
      {
        key: 'metric',
        label: '聚合方式',
        setter: 'select',
        options: [
          { label: '计数', value: 'count' },
          { label: '求和', value: 'sum' },
          { label: '平均', value: 'avg' },
          { label: '最大', value: 'max' },
          { label: '最小', value: 'min' },
        ],
      },
      { key: 'metricField', label: '数值字段', setter: 'input', placeholder: 'sum/avg/max/min 的字段 key' },
      { key: 'limit', label: '取前 N 项', setter: 'number' },
      { key: 'height', label: '高度(px)', setter: 'number' },
    ],
    supports: { condition: true, loop: false, perm: true },
  },
  {
    name: 'Statistic',
    title: '指标卡',
    category: 'data',
    order: 5,
    version: '1.0.0',
    defaultProps: { label: '指标', value: 0, unit: '', precision: 0, trend: 'flat' },
    settings: [
      { key: 'label', label: '指标名称', setter: 'input' },
      { key: 'value', label: '指标值', setter: 'input', placeholder: '数字或 $expr 表达式' },
      { key: 'unit', label: '单位', setter: 'input', placeholder: '如 % / 元 / 人' },
      { key: 'precision', label: '小数位', setter: 'number' },
      {
        key: 'trend',
        label: '趋势',
        setter: 'select',
        options: [
          { label: '上升', value: 'up' },
          { label: '下降', value: 'down' },
          { label: '持平', value: 'flat' },
        ],
      },
    ],
    supports: { condition: true, loop: false, perm: true },
  },
]
