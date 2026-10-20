/**
 * 节点协议 —— 页面组件树的最小单元。
 * 参照《低代码引擎搭建基础协议规范》并按企业级移动场景扩展。
 */

/** 属性编辑器（Setter）类型，设计器据此自动渲染属性面板。 */
export type SetterType =
  | 'input'
  | 'textarea'
  | 'number'
  | 'switch'
  | 'select'
  | 'color'
  | 'slider'
  | 'optionList'
  | 'ruleEditor'
  | 'expression'
  | 'fieldPicker'
  | 'dataSourcePicker'
  | 'eventBinder'

/** 属性面板中一个可编辑项的描述。 */
export interface SettingDesc {
  /** 'label' → node.props.label；'style.x' → node.style.x；'event' → node.actions */
  key: string
  label: string
  setter: SetterType
  options?: Array<{ label: string; value: unknown }>
  placeholder?: string
  help?: string
  /** 该设置项自身是否显示（表达式） */
  condition?: string
  required?: boolean
}

/** 校验规则。 */
export type Rule =
  | { type: 'required'; message?: string }
  | { type: 'pattern'; value: string; message?: string }
  | { type: 'range'; min?: number; max?: number; message?: string }
  | { type: 'maxLength'; value: number; message?: string }
  | { type: 'expression'; value: string; message?: string }
  | { type: 'async'; dsId: string; message?: string }

/** 动作（事件绑定）。event 为物料声明的事件名，如 onClick / onChange。 */
export type Action =
  | { event: string; type: 'expression'; value: string }
  | {
      event: string
      type: 'navigate'
      value: { pageId: string; params?: Record<string, unknown>; mode?: 'push' | 'redirect' | 'switchTab' }
    }
  | { event: string; type: 'datasource'; value: { dsId: string; params?: Record<string, unknown> } }
  | { event: string; type: 'http'; value: { dsId: string; params?: Record<string, unknown> } }
  | { event: string; type: 'setForm'; value: Record<string, unknown> }
  | { event: string; type: 'setApp'; value: Record<string, unknown> }
  | { event: string; type: 'toast'; value: { text: string; icon?: 'success' | 'error' | 'none' } }
  | { event: string; type: 'confirm'; value: { text: string; onOk?: Action } }
  | { event: string; type: 'dialog'; value: { template: string } }
  | { event: string; type: 'submit'; value?: Record<string, unknown> }
  | { event: string; type: 'back'; value?: Record<string, unknown> }
  | { event: string; type: 'copy'; value: { expr: string } }
  | { event: string; type: 'scan'; value?: Record<string, unknown> }
  | { event: string; type: 'phone'; value: { expr: string } }
  | { event: string; type: 'location'; value?: Record<string, unknown> }

export type ActionType = Action['type']

/** 可视化配置的样式（禁止自由写 CSS 文本，保证跨端一致）。 */
export interface NodeStyle {
  margin?: string
  padding?: string
  background?: string
  color?: string
  borderRadius?: string
  fontSize?: string
  textAlign?: 'left' | 'center' | 'right'
  width?: string
  height?: string
  flex?: number
}

/** 组件树节点。 */
export interface NodeSchema {
  /** 全局唯一，发布后不可变（撤销重做、埋点、diff 都依赖它） */
  id: string
  /** 物料名，首字母大写，必须存在于物料注册表 */
  componentName: string
  props?: Record<string, unknown>
  style?: NodeStyle
  /** 渲染条件表达式，默认 true */
  condition?: string | boolean
  /** 循环数据表达式，如 formData.items */
  loop?: string
  /** [迭代项名, 索引名]，默认 ["item", "index"] */
  loopArgs?: [string, string]
  actions?: Action[]
  /** 权限点：无权限时整节点不渲染（而非仅 disabled） */
  perm?: string
  children?: NodeSchema[]
}

/** 遍历组件树的回调。返回 false 可中断遍历。 */
export function walkNode(
  node: NodeSchema,
  visitor: (node: NodeSchema, parent: NodeSchema | null, depth: number) => void | false,
  parent: NodeSchema | null = null,
  depth = 0,
): void {
  if (visitor(node, parent, depth) === false) return
  for (const child of node.children ?? []) walkNode(child, visitor, node, depth + 1)
}

/** 按 id 查找节点。 */
export function findNode(root: NodeSchema, id: string): NodeSchema | null {
  let hit: NodeSchema | null = null
  walkNode(root, (n) => {
    if (n.id === id) {
      hit = n
      return false
    }
    return undefined
  })
  return hit
}

/** 收集组件树中出现的全部 componentName（用于构建期物料裁剪）。 */
export function collectComponentNames(root: NodeSchema): string[] {
  const set = new Set<string>()
  walkNode(root, (n) => {
    set.add(n.componentName)
  })
  return [...set]
}
