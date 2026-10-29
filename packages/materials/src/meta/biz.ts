/**
 * meta —— 业务类物料元信息（ApprovalBar / Timeline，Phase 3 批 2，D-P3-4）。
 *
 * 事实源：两物料 index.vue 的实际 props 与 emit。
 * recordId defaultProps 直接带 `$expr: urlParams.rid` —— 详情页路由带 rid 即**拖入即用**，
 * 业务人员零配置；画布 urlParams 恒空 → 求值空 → 物料占位态（不发请求）。
 */
import type { MaterialSchema } from '@lc/schema'

export const BIZ_META: MaterialSchema[] = [
  {
    name: 'ApprovalBar',
    title: '审批操作',
    category: 'biz',
    order: 1,
    version: '1.0.0',
    defaultProps: {
      recordId: '$expr: urlParams.rid',
      modelId: '',
      flowId: '',
    },
    settings: [
      {
        key: 'recordId',
        label: '记录 id（表达式）',
        setter: 'input',
        placeholder: '$expr: urlParams.rid',
        help: '取当前记录主键；默认绑定路由参数 rid，详情页免改。留空则只显示占位',
      },
      {
        key: 'modelId',
        label: '模型 id',
        setter: 'input',
        placeholder: '按模型过滤实例（可空）',
        help: '一条记录挂多个流程实例时收窄查询范围',
      },
      {
        key: 'flowId',
        label: '流程 id',
        setter: 'input',
        placeholder: '只操作指定流程（可空）',
        help: '一条记录有多个流程定义时精确取用；空 = 取进行中的那个',
      },
    ],
    events: ['decided'],
    supports: { condition: true, loop: false, perm: false },
  },
  {
    name: 'Timeline',
    title: '流转时间轴',
    category: 'biz',
    order: 2,
    version: '1.0.0',
    defaultProps: {
      recordId: '$expr: urlParams.rid',
      modelId: '',
      flowId: '',
    },
    settings: [
      {
        key: 'recordId',
        label: '记录 id（表达式）',
        setter: 'input',
        placeholder: '$expr: urlParams.rid',
        help: '取当前记录主键；默认绑定路由参数 rid，详情页免改',
      },
      { key: 'modelId', label: '模型 id', setter: 'input', placeholder: '可空', help: '同审批条' },
      { key: 'flowId', label: '流程 id', setter: 'input', placeholder: '可空', help: '同审批条' },
    ],
    events: [],
    supports: { condition: true, loop: false, perm: false },
  },
  /* ---------------- 门户组件库（2026-10-28 批 2） ---------------- */
  {
    name: 'PortalStat',
    title: '数据卡',
    category: 'biz',
    order: 3,
    version: '1.0.0',
    // 一卡多指标：主副标题 + 数字格（与 Statistic「单 KPI + 趋势」分工）
    defaultProps: {
      title: '数据概览',
      subtitle: '本月',
      items: [
        { label: '待办', value: 12 },
        { label: '已办', value: 86 },
        { label: '超时', value: 3 },
      ],
      columns: 3,
    },
    settings: [
      { key: 'title', label: '主标题', setter: 'input' },
      { key: 'subtitle', label: '副标题', setter: 'input', placeholder: '说明统计口径/区间（可空）' },
      {
        key: 'items',
        label: '数字格（JSON）',
        setter: 'json',
        placeholder: '[{"label":"待办","value":12,"unit":"条"}]',
        help: '每项 label + value；value 可为数字或 $expr 表达式，数字自动千分位',
      },
      { key: 'columns', label: '每行列数(1~4)', setter: 'number' },
    ],
    supports: { condition: true, loop: false, perm: true },
  },
  {
    name: 'PortalTodo',
    title: '待办列表',
    category: 'biz',
    order: 4,
    version: '1.0.0',
    defaultProps: {
      title: '我的待办',
      limit: 5,
      items: [],
      autoLoad: true,
      showCount: true,
    },
    settings: [
      { key: 'title', label: '标题', setter: 'input' },
      { key: 'limit', label: '最多条数(1~50)', setter: 'number' },
      {
        key: 'autoLoad',
        label: '拉取待办',
        setter: 'switch',
        help: '开：运行时 GET /flows/tasks/todo；关：只用下方静态数据',
      },
      {
        key: 'items',
        label: '静态数据（JSON）',
        setter: 'json',
        placeholder: '[{"title":"报销审批","tag":"待审批","time":"10-28 09:30"}]',
        help: '非空则不请求接口（设计期预览用）；行字段兼容流程待办 flowName/nodeName',
      },
      { key: 'showCount', label: '显示条数', setter: 'switch' },
    ],
    events: ['itemClick'],
    supports: { condition: true, loop: false, perm: true },
  },
  {
    name: 'PortalFlowList',
    title: '常用流程',
    category: 'biz',
    order: 98,
    version: '1.0.0',
    // 自动读 /flows，只列配置了 startPageId 的流程（配了才发得起来）
    defaultProps: {
      title: '常用流程',
      limit: 5,
      autoLoad: true,
      items: [],
    },
    settings: [
      { key: 'title', label: '标题', setter: 'input' },
      { key: 'limit', label: '最多条数(1~20)', setter: 'number' },
      {
        key: 'autoLoad',
        label: '拉取流程',
        setter: 'switch',
        help: '开：运行时 GET /flows，只列配了 startPageId 的；关：只用下方静态数据',
      },
      {
        key: 'items',
        label: '静态数据（JSON）',
        setter: 'json',
        placeholder: '[{"name":"请假审批","meta":"表单 · m_leave"}]',
        help: '非空则不请求接口（设计期预览用）',
      },
    ],
    events: ['itemClick'],
    supports: { condition: true, loop: false, perm: true },
  },
  {
    name: 'PortalPageEntry',
    title: '页面入口',
    category: 'biz',
    order: 99,
    version: '1.0.0',
    // 云程「业务组件」的口径：从已配置页面里挑一个，直接变成入口卡
    defaultProps: {
      title: '',
      desc: '',
      icon: '入',
      pageId: '',
    },
    settings: [
      { key: 'title', label: '标题', setter: 'input', placeholder: '留空显示页面编码' },
      { key: 'desc', label: '说明', setter: 'input', placeholder: '一行说明（可留空）' },
      { key: 'icon', label: '图标字', setter: 'input', placeholder: '单字，如 请' },
      {
        key: 'pageId',
        label: '目标页面',
        setter: 'pagePicker',
        help: '从已保存页面里选；运行时点击直达该页',
      },
    ],
    events: ['itemClick'],
    supports: { condition: true, loop: false, perm: true },
  },
]
