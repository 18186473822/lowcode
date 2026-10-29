/**
 * meta —— 基础展示类物料元信息（Text / Image）。
 * 事实源：协议 4 章 MaterialSchema + 各物料 index.vue 的实际 props（designer 批 2）。
 */
import type { MaterialSchema } from '@lc/schema'

export const BASIC_META: MaterialSchema[] = [
  {
    name: 'Text',
    title: '文本',
    category: 'basic',
    order: 1,
    version: '1.0.0',
    defaultProps: { text: '文本内容' },
    settings: [
      { key: 'text', label: '文本内容', setter: 'textarea' },
      { key: 'style.color', label: '文字颜色', setter: 'color' },
      { key: 'style.fontSize', label: '字号(px)', setter: 'number' },
    ],
    supports: { condition: true, loop: true },
  },
  {
    name: 'Image',
    title: '图片',
    category: 'basic',
    order: 2,
    version: '1.0.0',
    // width/height 单位 rpx（组件按 wrapStyle 拼接）；750rpx = 画布 375 宽的整宽
    defaultProps: { src: '', mode: 'aspectFill', width: 750, height: 360 },
    settings: [
      { key: 'src', label: '图片地址', setter: 'input', placeholder: '/static/xxx.png 或 $expr 表达式' },
      {
        key: 'mode',
        label: '裁剪模式',
        setter: 'select',
        options: [
          { label: '保持比例填充（aspectFill）', value: 'aspectFill' },
          { label: '缩放至完全可见（aspectFit）', value: 'aspectFit' },
          { label: '拉伸填充（scaleToFill）', value: 'scaleToFill' },
          { label: '宽度自适应（widthFix）', value: 'widthFix' },
        ],
      },
      { key: 'width', label: '宽度(rpx)', setter: 'number' },
      { key: 'height', label: '高度(rpx)', setter: 'number' },
      { key: 'radius', label: '圆角(rpx)', setter: 'number' },
      { key: 'lazyLoad', label: '懒加载', setter: 'switch' },
    ],
    supports: { condition: true, loop: true },
  },
  /* ---------------- Phase 2 批 3 ---------------- */
  {
    name: 'Tag',
    title: '标签',
    category: 'basic',
    order: 3,
    version: '1.0.0',
    defaultProps: { text: '标签', type: 'primary' },
    settings: [
      { key: 'text', label: '标签文字', setter: 'input' },
      {
        key: 'type',
        label: '样式类型',
        setter: 'select',
        options: [
          { label: '主要', value: 'primary' },
          { label: '成功', value: 'success' },
          { label: '警告', value: 'warning' },
          { label: '错误', value: 'danger' },
          { label: '中性', value: 'info' },
        ],
      },
    ],
    supports: { condition: true, loop: true },
  },
  {
    name: 'Icon',
    title: '图标',
    category: 'basic',
    order: 4,
    version: '1.0.0',
    defaultProps: { name: 'success', size: 32 },
    settings: [
      {
        key: 'name',
        label: '图标名',
        setter: 'select',
        options: [
          { label: '成功', value: 'success' },
          { label: '警告', value: 'warn' },
          { label: '错误', value: 'error' },
          { label: '信息', value: 'info' },
          { label: '首页', value: 'home' },
          { label: '用户', value: 'user' },
          { label: '设置', value: 'set' },
          { label: '日期', value: 'date' },
          { label: '搜索', value: 'search' },
          { label: '更多', value: 'more' },
          { label: '返回', value: 'back' },
        ],
      },
      { key: 'size', label: '字号(rpx)', setter: 'number' },
    ],
    supports: { condition: true, loop: true },
  },
  /* ---------------- 门户组件库（2026-10-28 批 2） ---------------- */
  {
    name: 'PortalBanner',
    title: '轮播图',
    category: 'basic',
    order: 5,
    version: '1.0.0',
    // 不用 uni swiper：设计器画布是纯 Vue 工程，swiper 会退化成未知行内元素
    defaultProps: {
      items: [
        { title: '门户横幅一', desc: '在右栏配置图片与跳转' },
        { title: '门户横幅二' },
      ],
      height: 300,
      interval: 3000,
      autoplay: true,
      indicator: true,
    },
    settings: [
      {
        key: 'items',
        label: '轮播项（JSON）',
        setter: 'json',
        placeholder: '[{"title":"标题","desc":"说明","image":"/static/a.png"}]',
        help: 'image 留空显示令牌色占位块；标题/说明渲染在图片下方（不压图，保证暗色可读）',
      },
      { key: 'height', label: '高度(rpx)', setter: 'number', help: '按屏宽/750 等比换算（300 ≈ 屏宽的 40%）' },
      { key: 'interval', label: '切换间隔(ms)', setter: 'number', help: '<=0 不自动切换；单张不轮播' },
      { key: 'autoplay', label: '自动播放', setter: 'switch' },
      { key: 'indicator', label: '显示圆点', setter: 'switch' },
    ],
    events: ['itemClick'],
    supports: { condition: true, loop: false, perm: true },
  },
  {
    name: 'PortalNotice',
    title: '公告条',
    category: 'basic',
    order: 6,
    version: '1.0.0',
    defaultProps: {
      title: '公告',
      items: ['欢迎使用移动门户', '门户组件可在左栏「基础组件 / 业务组件」中拖入'],
      interval: 4000,
      more: true,
    },
    settings: [
      {
        key: 'items',
        label: '公告项（JSON）',
        setter: 'json',
        placeholder: '["第一条公告","第二条公告"]',
        help: '字符串数组或 [{"text":"…","pageId":"…"}]；多条按间隔轮换',
      },
      { key: 'text', label: '单条兜底文案', setter: 'input', help: '公告项为空时显示这一条' },
      { key: 'title', label: '左侧标签', setter: 'input', placeholder: '缺省「公告」' },
      { key: 'interval', label: '轮换间隔(ms)', setter: 'number' },
      { key: 'more', label: '显示箭头', setter: 'switch' },
    ],
    events: ['itemClick'],
    supports: { condition: true, loop: false, perm: true },
  },
  {
    name: 'PortalGrid',
    title: '魔方',
    category: 'basic',
    order: 7,
    version: '1.0.0',
    // 云程口径的「魔方」：小格入口 + 图标字 + 名称，3/4 列
    defaultProps: {
      title: '',
      columns: 4,
      items: [
        { icon: '考', title: '考勤', pageId: '' },
        { icon: '报', title: '报销', pageId: '' },
        { icon: '审', title: '审批', pageId: '' },
        { icon: '档', title: '档案', pageId: '' },
      ],
    },
    settings: [
      {
        key: 'items',
        label: '入口项',
        setter: 'pageItemList',
        help: '每行：图标字 + 名称 + 目标页面（留空只发 itemClick，由「动作」处理）',
      },
      { key: 'columns', label: '每行列数', setter: 'number', help: '3 或 4（缺省 4）' },
      { key: 'title', label: '分组标题', setter: 'input', placeholder: '留空不显示标题' },
    ],
    events: ['itemClick'],
    supports: { condition: true, loop: false, perm: true },
  },
]
