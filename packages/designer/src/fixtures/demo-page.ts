/**
 * demo-page.ts —— 32 物料全量演示 Schema（designer-web 画布与组件测试共用单一来源）
 *
 * 覆盖：31 个物料组件节点 + Page root + FormGroup 容器（组内嵌套子节点），
 * 表单字段全走 `$expr: formData.*` 受控链路 —— 与 H5 demo（runtime demo/static-page）同构。
 * Phase 2 批 3 起为 **30 展示物料全量**（META 31 项排除 Page）；
 * Phase 3 批 2 +2 → **32 展示全量**（META 33 项排除 Page；biz 组 ApprovalBar/Timeline，
 * 画布 urlParams 恒空 → `$expr: urlParams.rid` 求值空 → 物料占位态，不发请求）。
 */
import type { PageSchema, NodeSchema } from '@lc/schema'

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

export function demoPage(): PageSchema {
  return {
    schemaVersion: '1.0.0', // 协议 semver 三段（validatePage：^\d+\.\d+\.\d+$）
    id: 'p_designer',
    name: '画布演示',
    type: 'form',
    root: node({
      id: 'root',
      componentName: 'Page',
      children: [
        node({ id: 'n-text', componentName: 'Text', props: { text: '标题' } }),
        node({
          id: 'n-input',
          componentName: 'Input',
          props: { name: 'f1', label: '姓名', value: '$expr: formData.f1' },
        }),
        node({
          id: 'n-ta',
          componentName: 'Textarea',
          props: { name: 'f2', label: '备注', value: '$expr: formData.f2' },
        }),
        node({
          id: 'n-num',
          componentName: 'NumberInput',
          props: { name: 'f3', label: '金额', value: '$expr: formData.f3' },
        }),
        node({
          id: 'n-radio',
          componentName: 'Radio',
          props: {
            name: 'f4',
            label: '状态',
            options: [
              { label: '待审批', value: 'pending' },
              { label: '已通过', value: 'approved' },
            ],
            value: '$expr: formData.f4',
          },
        }),
        node({
          id: 'n-sel',
          componentName: 'Select',
          props: {
            name: 'f5',
            label: '部门',
            options: [
              { label: '研发', value: 'rd' },
              { label: '市场', value: 'mkt' },
            ],
            value: '$expr: formData.f5',
          },
        }),
        node({
          id: 'n-sw',
          componentName: 'Switch',
          props: { name: 'f6', label: '加急', value: '$expr: formData.f6' },
        }),
        node({
          id: 'n-up',
          componentName: 'Upload',
          props: { name: 'f7', label: '照片', value: '$expr: formData.f7' },
        }),
        node({ id: 'n-img', componentName: 'Image', props: { src: '/x.png' } }),
        node({ id: 'n-div', componentName: 'Divider', props: { text: '—— 分割 ——' } }),
        /* ---------------- Phase 2 批 3：18 新物料（30 全量演示） ---------------- */
        node({
          id: 'n-dp',
          componentName: 'DatePicker',
          props: { name: 'f8', label: '请假日期', value: '$expr: formData.f8' },
        }),
        node({
          id: 'n-dtp',
          componentName: 'DateTimePicker',
          props: { name: 'f9', label: '开始时间', value: '$expr: formData.f9' },
        }),
        node({
          id: 'n-money',
          componentName: 'MoneyInput',
          props: { name: 'f10', label: '预算金额', prefix: '¥', value: '$expr: formData.f10' },
        }),
        node({
          id: 'n-ck',
          componentName: 'Checkbox',
          props: {
            name: 'f11',
            label: '报销类型',
            options: [
              { label: '交通', value: 'traffic' },
              { label: '餐饮', value: 'meal' },
              { label: '住宿', value: 'hotel' },
            ],
            value: '$expr: formData.f11',
          },
        }),
        node({
          id: 'n-pk',
          componentName: 'Picker',
          props: {
            name: 'f12',
            label: '优先级',
            options: [
              { label: '高', value: 'high' },
              { label: '中', value: 'mid' },
              { label: '低', value: 'low' },
            ],
            value: '$expr: formData.f12',
          },
        }),
        node({
          id: 'n-upk',
          componentName: 'UserPicker',
          props: {
            name: 'f13',
            label: '审批人',
            candidates: [
              { label: '张三', value: 'u_zhang' },
              { label: '李四', value: 'u_li' },
            ],
            value: '$expr: formData.f13',
          },
        }),
        node({
          id: 'n-dpk',
          componentName: 'DeptPicker',
          props: {
            name: 'f14',
            label: '所属部门',
            candidates: [
              { label: '研发部', value: 'd_rd' },
              { label: '市场部', value: 'd_mkt' },
            ],
            value: '$expr: formData.f14',
          },
        }),
        node({
          id: 'n-cc',
          componentName: 'Cascader',
          props: {
            name: 'f15',
            label: '出差地区',
            options: [
              {
                label: '广东省',
                value: 'gd',
                children: [
                  { label: '深圳市', value: 'sz', children: [{ label: '南山区', value: 'ns' }] },
                  { label: '广州市', value: 'gz' },
                ],
              },
              { label: '湖南省', value: 'hn', children: [{ label: '长沙市', value: 'cs' }] },
            ],
            value: '$expr: formData.f15',
          },
        }),
        node({
          id: 'n-fu',
          componentName: 'FileUpload',
          props: { name: 'f16', label: '附件材料', maxCount: 5, value: '$expr: formData.f16' },
        }),
        node({
          id: 'n-rate',
          componentName: 'Rate',
          props: { name: 'f18', label: '服务评分', max: 5, value: '$expr: formData.f18' },
        }),
        node({
          id: 'n-sb',
          componentName: 'SearchBar',
          props: { name: 'f17', placeholder: '搜索报销单', value: '$expr: formData.f17' },
        }),
        node({
          id: 'n-detail',
          componentName: 'Detail',
          props: {
            items: [
              { label: '单号', value: 'BX-2026-001' },
              { label: '状态', value: '待审批' },
              { label: '金额', value: '¥ 1,280.00' },
            ],
          },
        }),
        node({
          id: 'n-cell',
          componentName: 'Cell',
          props: { label: '当前节点', value: '部门经理审批', arrow: true },
        }),
        node({
          id: 'n-list',
          componentName: 'List',
          props: {
            items: [
              { title: '我的申请', desc: '查看我提交的单据' },
              { title: '待我审批', desc: '3 条待处理' },
            ],
          },
        }),
        node({
          id: 'n-tabs',
          componentName: 'Tabs',
          props: { items: [{ label: '全部' }, { label: '待审批' }, { label: '已完成' }], activeIndex: 0 },
        }),
        node({ id: 'n-tag', componentName: 'Tag', props: { text: '待审批', type: 'warning' } }),
        node({ id: 'n-icon', componentName: 'Icon', props: { name: 'success', size: 40 } }),
        node({ id: 'n-progress', componentName: 'Progress', props: { percent: 60, showText: true } }),
        // Phase 3 批 2：审批物料（biz 组）—— recordId 走表达式绑定，画布求值空 → 占位态
        node({ id: 'n-ab', componentName: 'ApprovalBar', props: { recordId: '$expr: urlParams.rid' } }),
        node({ id: 'n-tl', componentName: 'Timeline', props: { recordId: '$expr: urlParams.rid' } }),
        node({ id: 'n-btn', componentName: 'Button', props: { text: '提交' } }),
        node({
          id: 'n-fg',
          componentName: 'FormGroup',
          props: { title: '基本信息' },
          children: [node({ id: 'n-in-fg', componentName: 'Text', props: { text: '组内' } })],
        }),
      ],
    }),
    defaultFormData: {
      f1: '',
      f2: '',
      f3: '',
      f4: 'pending',
      f5: '',
      f6: false,
      f7: [],
      f8: '',
      f9: '',
      f10: '',
      f11: [],
      f12: '',
      f13: '',
      f14: '',
      f15: [],
      f16: [],
      f17: '',
      f18: 0,
    },
  } as PageSchema
}
