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
]
