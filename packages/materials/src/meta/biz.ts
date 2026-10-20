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
]
