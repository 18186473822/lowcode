/** 模型字段类型（首期清单，够用不贪）。 */
export type FieldType =
  | 'id'
  | 'string'
  | 'text'
  | 'number'
  | 'money'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'relation'
  | 'file'
  | 'user'
  | 'dept'
  | 'location'
  | 'json'

/** 枚举选项。 */
export interface EnumOption {
  label: string
  value: string | number
}

/** 字段定义。 */
export interface FieldSchema {
  /** 物理/逻辑字段名，页面表单控件的 name 必须命中它 */
  key: string
  /** 展示名 */
  name: string
  type: FieldType
  length?: number
  precision?: number
  required?: boolean
  unique?: boolean
  defaultValue?: unknown
  /** type=enum */
  options?: EnumOption[]
  /** type=relation */
  refModel?: string
  refField?: string
  /** type=file */
  maxCount?: number
  accept?: string
  /** 自动生成：now / autoIncrement */
  auto?: 'now' | 'autoIncrement' | true
  /** 只读（展示用派生字段） */
  readonly?: boolean
  /** 表单项专用：占位、帮助文案 */
  placeholder?: string
  help?: string
  /** 服务端与前端都要执行的校验 */
  rules?: import('./node.js').Rule[]
}

/** 数据权限范围。 */
export type DataScope = 'all' | 'dept' | 'deptAndChild' | 'self'

/** 数据模型协议（企业级的地基）。 */
export interface ModelSchema {
  schemaVersion: string
  id: string
  name: string
  /** 物理表名（实际会拼租户前缀），仅字母数字下划线 */
  code: string
  type?: 'table' | 'view'
  fields: FieldSchema[]
  indexes?: Array<{ fields: string[]; type?: 'unique' | 'normal' }>
  permissions?: Partial<Record<'create' | 'read' | 'update' | 'delete', string[]>>
  /** 默认数据权限（行级） */
  dataScope?: DataScope
  /** 关联的默认表单页 / 列表页 */
  formPageId?: string
  listPageId?: string
}
