/**
 * 宿主内置组件白名单（`componentName`）。
 *
 * 设计器（远程物料市场验签）与服务端（物料市场发布校验）共用同一份清单，
 * 避免两端各维护一份导致「服务端放行、客户端整份清单拒绝」。
 *
 * 新增物料组件时必须同步：`packages/materials/src/<name>/meta.json` 的 `name`、
 * 设计器 `material-map` 映射与 `packages/schema/test` 的基线用例。
 */
export const BUILTIN_COMPONENT_IDS: ReadonlySet<string> = new Set([
  'Text',
  'Input',
  'Textarea',
  'NumberInput',
  'Radio',
  'Select',
  'Switch',
  'Upload',
  'Image',
  'Divider',
  'Button',
  'DatePicker',
  'DateTimePicker',
  'MoneyInput',
  'Checkbox',
  'Picker',
  'UserPicker',
  'DeptPicker',
  'Cascader',
  'FileUpload',
  'Rate',
  'SearchBar',
  'Detail',
  'Cell',
  'List',
  'Tabs',
  'Tag',
  'Icon',
  'Progress',
  'ApprovalBar',
  'Timeline',
  'Chart',
  'Statistic',
])
