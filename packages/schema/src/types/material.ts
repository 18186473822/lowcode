import type { SettingDesc, Rule, ActionType } from './node.js'

/** 物料分类。 */
export type MaterialCategory = 'basic' | 'layout' | 'form' | 'data' | 'nav' | 'feedback' | 'biz'

/** 目标端能力声明。 */
export type Platform = 'H5' | 'MP-WEIXIN' | 'MP-ALIPAY' | 'APP'

/** 物件协议：一个物料 = 一个 uni-app 组件 + 一份元信息。 */
export interface MaterialSchema {
  /** 与组件树 componentName 一致，首字母大写 */
  name: string
  title: string
  icon?: string
  category: MaterialCategory
  order?: number
  /** 是否容器（可接受 children） */
  isContainer?: boolean
  version: string
  /** 支持的端，默认全部 */
  platforms?: Platform[]
  defaultProps: Record<string, unknown>
  /** 属性面板（设计器据此自动生成 UI） */
  settings: SettingDesc[]
  /** 可视化配置的样式项白名单 */
  styleSettings?: Array<keyof import('./node.js').NodeStyle>
  /** 该物料会 emit 的事件 */
  events?: string[]
  /** 是否支持 condition / loop / 权限 */
  supports?: { condition?: boolean; loop?: boolean; perm?: boolean }
  /** 该物料是否需要绑定字段名（表单类为 true） */
  hasField?: boolean
  /** 默认校验规则（可被节点覆盖） */
  defaultRules?: Rule[]
  /** 关联的动作能力（如 Button 关联 submit） */
  actionTypes?: ActionType[]
}
