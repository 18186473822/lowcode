import type { PageSchema } from '@lc/schema'

/**
 * 手写页面 Schema —— 两个阶段的验收链路：
 *
 * Phase 0 出口判据（保留回归）：
 *  - Text 静态文本 / Input 双向绑定（`$expr:` 求值注入）/ 联动 Text（formData.count + 1）
 *  - Button 动作链：click → toast
 *
 * Phase 1 第 1 批（物料 12 个）：
 *  - 容器：Page（根）+ FormGroup（分组头 + 递归）
 *  - 展示：Text / Image / Divider
 *  - 表单：Input / Textarea / NumberInput / Radio / Select / Switch / Upload
 *  - 反馈：Button
 */
export const demoPage: PageSchema = {
  schemaVersion: '1.0.0',
  id: 'p_demo',
  name: '静态渲染演示',
  type: 'form',
  root: {
    id: 'root',
    componentName: 'Page',
    children: [
      {
        id: 't_title',
        componentName: 'Text',
        props: { text: '低代码运行时壳 · Phase 1 物料 12 个演示' },
      },
      {
        id: 'i_name',
        componentName: 'Input',
        props: {
          name: 'username',
          label: '用户名',
          placeholder: '请输入用户名',
          value: '$expr: formData.username',
        },
      },
      {
        id: 't_hello',
        componentName: 'Text',
        props: { text: '$expr: "你好，" + formData.username + "！count+1 = " + (formData.count + 1)' },
      },
      { id: 'd_1', componentName: 'Divider', props: { text: '基本信息（FormGroup 容器）' } },
      {
        id: 'g_basic',
        componentName: 'FormGroup',
        props: { title: '基本信息', required: true },
        children: [
          {
            id: 'f_remark',
            componentName: 'Textarea',
            props: {
              name: 'remark',
              label: '备注',
              placeholder: '请输入备注',
              maxLength: 100,
              value: '$expr: formData.remark',
            },
          },
          {
            id: 'f_amount',
            componentName: 'NumberInput',
            props: {
              name: 'amount',
              label: '金额',
              unit: '元',
              placeholder: '请输入金额',
              value: '$expr: formData.amount',
            },
          },
          {
            id: 'f_status',
            componentName: 'Radio',
            props: {
              name: 'status',
              label: '状态',
              direction: 'horizontal',
              options: [
                { label: '待审批', value: 'pending' },
                { label: '已通过', value: 'approved' },
                { label: '已驳回', value: 'rejected' },
              ],
              value: '$expr: formData.status',
            },
          },
          {
            id: 'f_dept',
            componentName: 'Select',
            props: {
              name: 'dept',
              label: '所属部门',
              placeholder: '请选择部门',
              options: [
                { label: '研发部', value: 'rd' },
                { label: '市场部', value: 'mkt' },
                { label: '人事部', value: 'hr' },
              ],
              value: '$expr: formData.dept',
            },
          },
          {
            id: 'f_urgent',
            componentName: 'Switch',
            props: {
              name: 'urgent',
              label: '是否加急',
              help: '加急件将在 24 小时内处理',
              value: '$expr: formData.urgent',
            },
          },
        ],
      },
      { id: 'd_2', componentName: 'Divider', props: { text: '附件与图片' } },
      {
        id: 'f_photos',
        componentName: 'Upload',
        props: {
          name: 'photos',
          label: '现场照片',
          maxCount: 3,
          value: '$expr: formData.photos',
        },
      },
      {
        id: 'img_banner',
        componentName: 'Image',
        // data URI（内联 SVG）：不依赖外网图床；小程序端真机验证时换网络路径（L-5）
        props: {
          src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='160'><rect width='400' height='160' fill='%232b6de8'/><text x='200' y='90' font-size='22' fill='white' text-anchor='middle'>LC Image Demo</text></svg>",
          height: 200,
          mode: 'aspectFill',
        },
      },
      {
        id: 'b_demo',
        componentName: 'Button',
        props: { text: '触发 toast 动作', type: 'primary' },
        actions: [
          { event: 'click', type: 'toast', value: { text: '表达式与动作链路通了！', icon: 'success' } },
        ],
      },
    ],
  },
  defaultFormData: {
    username: '世界',
    count: 41,
    remark: '',
    amount: '',
    status: 'pending',
    dept: '',
    urgent: false,
    photos: [],
  },
}
