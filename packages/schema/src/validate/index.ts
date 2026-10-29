import type { PageSchema, MaterialSchema, ModelSchema, NodeSchema, Action, DataSourceSchema } from '../types/index.js'
import { isValidVersion, isKnownVersion, SCHEMA_VERSION } from '../version.js'
import { walkNode } from '../types/node.js'

export type Severity = 'error' | 'warning'

export interface Issue {
  /** 稳定错误码，便于 IDE/设计器定位与国际化 */
  code: string
  severity: Severity
  /** 如 root.children[2] */
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: Issue[]
  warnings: Issue[]
}

export interface ValidateOptions {
  /** 已注册的物料名；提供则校验 componentName 是否存在 */
  materials?: string[]
  /** 模型字段 key；提供则校验表单控件 name 是否命中 */
  modelFields?: string[]
  /** 表达式语法检查器；提供则校验 condition/loop/表达式类 action */
  checkExpr?: (expr: string) => { ok: boolean; message?: string }
  /** 是否允许警告（默认 true） */
  includeWarnings?: boolean
}

const CODE_RE = /^[a-z][a-z0-9_]*$/
const ID_RE = /^[A-Za-z_][\w-]*$/

class Collector {
  readonly errors: Issue[] = []
  readonly warnings: Issue[] = []
  error(code: string, path: string, message: string) {
    this.errors.push({ code, severity: 'error', path, message })
  }
  warn(code: string, path: string, message: string) {
    this.warnings.push({ code, severity: 'warning', path, message })
  }
  toResult(): ValidationResult {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    }
  }
}

/* ------------------------------------------------------------------ */
/* 表达式检查                                                          */
/* ------------------------------------------------------------------ */

function checkExprField(c: Collector, opt: ValidateOptions, expr: string, path: string, label: string) {
  if (!opt.checkExpr) return
  const r = opt.checkExpr(expr)
  if (!r.ok) c.error('E_EXPR_SYNTAX', path, `${label}表达式语法错误：${r.message ?? '未知错误'}`)
}

/* ------------------------------------------------------------------ */
/* Action 校验                                                         */
/* ------------------------------------------------------------------ */

function validateAction(c: Collector, opt: ValidateOptions, action: Action, path: string, dsIds: Set<string>) {
  if (!action.event) c.error('E_ACTION_INVALID', path, 'action 缺少 event 字段')
  switch (action.type) {
    case 'expression':
      if (typeof action.value !== 'string' || !action.value.trim()) {
        c.error('E_ACTION_INVALID', path, 'expression 类型的 action 必须提供非空 value 表达式')
      } else {
        checkExprField(c, opt, action.value, path, '动作')
      }
      break
    case 'navigate':
      if (!action.value?.pageId) c.error('E_ACTION_INVALID', path, 'navigate 动作缺少 value.pageId')
      break
    case 'datasource':
    case 'http':
      if (!action.value?.dsId) {
        c.error('E_ACTION_INVALID', path, `${action.type} 动作缺少 value.dsId`)
      } else if (!dsIds.has(action.value.dsId)) {
        c.error('E_DS_MISSING', path, `${action.type} 动作引用了不存在的数据源「${action.value.dsId}」`)
      }
      break
    case 'toast':
      if (!action.value?.text) c.error('E_ACTION_INVALID', path, 'toast 动作缺少 value.text')
      break
    case 'confirm':
      if (!action.value?.text) c.error('E_ACTION_INVALID', path, 'confirm 动作缺少 value.text')
      break
    case 'copy':
    case 'phone':
      if (!action.value?.expr) c.error('E_ACTION_INVALID', path, `${action.type} 动作缺少 value.expr`)
      break
    case 'setForm':
    case 'setApp':
      if (!action.value || typeof action.value !== 'object') {
        c.error('E_ACTION_INVALID', path, `${action.type} 动作缺少 value`)
      }
      break
    default:
      break
  }
}

/* ------------------------------------------------------------------ */
/* 数据源校验                                                          */
/* ------------------------------------------------------------------ */

function validateDataSources(c: Collector, opt: ValidateOptions, list: DataSourceSchema[]) {
  const ids = new Set<string>()
  list.forEach((ds, i) => {
    const path = `dataSources[${i}]`
    if (!ds.id) {
      c.error('E_REQUIRED', path, '数据源缺少 id')
    } else if (ids.has(ds.id)) {
      c.error('E_DUPLICATE_ID', path, `数据源 id 重复：${ds.id}`)
    } else {
      ids.add(ds.id)
    }
    if (!ds.name) c.warn('W_DS_NAME', path, '数据源缺少 name（设计器中将显示为空）')

    if (ds.type === 'http') {
      if (!ds.url) c.error('E_DS_URL', path, 'http 类型数据源缺少 url')
      if (ds.method && !['GET', 'POST'].includes(ds.method)) {
        c.error('E_DS_METHOD', path, `不支持的 method：${ds.method}`)
      }
    } else if (ds.type === 'model') {
      if (!ds.modelId) c.error('E_DS_MODEL', path, 'model 类型数据源缺少 modelId')
    } else if (ds.type === 'static') {
      if (ds.data === undefined) c.warn('W_DS_DATA', path, 'static 类型数据源未提供 data')
    } else if (ds.type === 'formula') {
      c.warn('W_DS_FORMULA', path, 'formula 数据源将在 Phase 2 提供完整支持')
    }

    if (ds.transform) checkExprField(c, opt, ds.transform, `${path}.transform`, '数据源 transform ')
    if (ds.trigger?.startsWith('watch:')) {
      const field = ds.trigger.slice('watch:'.length)
      if (!field) c.error('E_DS_TRIGGER', path, 'watch 触发器缺少字段名')
    }
  })
  return ids
}

/* ------------------------------------------------------------------ */
/* 节点校验                                                            */
/* ------------------------------------------------------------------ */

function validateNode(
  c: Collector,
  opt: ValidateOptions,
  node: NodeSchema,
  path: string,
  ctx: { ids: Set<string>; dsIds: Set<string>; materials?: Set<string> },
) {
  if (!node.id) {
    c.error('E_REQUIRED', `${path}.id`, '节点缺少 id')
  } else if (ctx.ids.has(node.id)) {
    c.error('E_DUPLICATE_ID', `${path}.id`, `节点 id 重复：${node.id}（id 必须全局唯一）`)
  } else {
    ctx.ids.add(node.id)
  }

  if (!node.componentName) {
    c.error('E_REQUIRED', `${path}.componentName`, '节点缺少 componentName')
  } else if (ctx.materials && !ctx.materials.has(node.componentName)) {
    c.error(
      'E_UNKNOWN_MATERIAL',
      `${path}.componentName`,
      `引用了未注册的物料「${node.componentName}」（发布将被拒绝）`,
    )
  }

  if (node.condition !== undefined && typeof node.condition !== 'boolean') {
    checkExprField(c, opt, node.condition, `${path}.condition`, 'condition ')
  }

  if (node.loop) {
    // loop 允许带 `$expr:` 前缀（与 props 表达式占位一致），校验前先剥离，避免误报语法错误
    const loopExpr = node.loop.startsWith('$expr:') ? node.loop.slice('$expr:'.length).trim() : node.loop
    checkExprField(c, opt, loopExpr, `${path}.loop`, 'loop ')
    if (!node.children || node.children.length === 0) {
      c.warn('W_LOOP_NO_TEMPLATE', path, '设置了 loop 但没有子节点作为循环模板，该配置不会生效')
    }
  }

  if (node.perm !== undefined && !ID_RE.test(node.perm)) {
    c.error('E_PERM_FORMAT', `${path}.perm`, `权限点格式不合法：${node.perm}`)
  }

  // 表单字段绑定检查
  const name = node.props?.['name']
  if (typeof name === 'string' && name && opt.modelFields && opt.modelFields.length > 0) {
    if (!opt.modelFields.includes(name)) {
      c.warn(
        'W_FIELD_UNKNOWN',
        `${path}.props.name`,
        `字段「${name}」不存在于当前数据模型中，提交时该值可能被丢弃`,
      )
    }
  }

  // 样式合法性
  if (node.style) {
    for (const k of Object.keys(node.style)) {
      if (!(k in VALID_STYLE_KEYS)) {
        c.warn('W_STYLE_KEY', `${path}.style.${k}`, `样式项「${k}」不在可视化配置白名单内，跨端可能不生效`)
      }
    }
  }

  // 动作
  if (node.actions?.length) {
    node.actions.forEach((a, i) => validateAction(c, opt, a, `${path}.actions[${i}]`, ctx.dsIds))
  }

  // 子节点
  node.children?.forEach((child, i) => validateNode(c, opt, child, `${path}.children[${i}]`, ctx))
}

const VALID_STYLE_KEYS: Record<string, true> = {
  margin: true,
  padding: true,
  background: true,
  color: true,
  borderRadius: true,
  fontSize: true,
  textAlign: true,
  width: true,
  height: true,
  flex: true,
}

/* ------------------------------------------------------------------ */
/* 页面校验                                                            */
/* ------------------------------------------------------------------ */

export function validatePage(schema: PageSchema, opt: ValidateOptions = {}): ValidationResult {
  const c = new Collector()

  if (!schema || typeof schema !== 'object') {
    c.error('E_REQUIRED', '', 'Schema 不是对象')
    return c.toResult()
  }

  // 版本
  if (!schema.schemaVersion) {
    c.error('E_SCHEMA_VERSION', 'schemaVersion', '缺少 schemaVersion（协议要求必填）')
  } else if (!isValidVersion(schema.schemaVersion)) {
    c.error('E_SCHEMA_VERSION', 'schemaVersion', `schemaVersion 格式不合法：${schema.schemaVersion}`)
  } else if (!isKnownVersion(schema.schemaVersion)) {
    c.error('E_SCHEMA_VERSION', 'schemaVersion', `平台不支持的协议版本：${schema.schemaVersion}`)
  } else if (schema.schemaVersion !== SCHEMA_VERSION) {
    c.warn('W_SCHEMA_OUTDATED', 'schemaVersion', `协议版本低于当前 ${SCHEMA_VERSION}，加载前需执行 migrate()`)
  }

  if (!schema.id) c.error('E_REQUIRED', 'id', '页面缺少 id')
  if (!schema.name) c.warn('W_PAGE_NAME', 'name', '页面缺少 name')
  if (!schema.type) c.error('E_REQUIRED', 'type', '页面缺少 type')
  else if (!['form', 'list', 'detail', 'portal', 'custom'].includes(schema.type)) {
    c.error('E_PAGE_TYPE', 'type', `未知的页面类型：${schema.type}`)
  }

  // 数据源
  const dsIds = new Set<string>()
  if (schema.dataSources) {
    for (const id of validateDataSources(c, opt, schema.dataSources)) dsIds.add(id)
  }

  // 提交配置必须指向真实数据源
  if (schema.submit && !dsIds.has(schema.submit.dataSourceId)) {
    c.error(
      'E_SUBMIT_DS_MISSING',
      'submit.dataSourceId',
      `提交配置引用了不存在的数据源「${schema.submit.dataSourceId}」`,
    )
  }

  // 组件树
  if (!schema.root) {
    c.error('E_REQUIRED', 'root', '页面缺少 root 组件树')
  } else {
    const ctx = {
      ids: new Set<string>(),
      dsIds,
      materials: opt.materials ? new Set(opt.materials) : undefined,
    }
    validateNode(c, opt, schema.root, 'root', ctx)
  }

  // list 页
  if (schema.type === 'list') {
    if (!schema.list) c.error('E_REQUIRED', 'list', 'type=list 的页面必须提供 list 配置')
    else if (!schema.list.modelId) c.error('E_REQUIRED', 'list.modelId', '列表配置缺少 modelId')
  }

  // detail 页（Phase 2 批 2，与 list 对称）
  if (schema.type === 'detail') {
    if (!schema.detail) c.error('E_REQUIRED', 'detail', 'type=detail 的页面必须提供 detail 配置')
    else if (!schema.detail.modelId) c.error('E_REQUIRED', 'detail.modelId', '详情配置缺少 modelId')
  }

  // portal 页（Phase 3 批 4）：卡片导航可空（纯拖拽门户合法）；给了卡片则逐条校验标题
  if (schema.type === 'portal' && schema.portal?.cards?.length) {
    schema.portal.cards.forEach((card, i) => {
      if (!card || typeof card.title !== 'string' || !card.title.trim()) {
        c.error('E_REQUIRED', `portal.cards[${i}].title`, `门户卡片缺少标题（第 ${i + 1} 张）`)
      }
    })
  }

  // 生命周期（值可为单表达式或按序执行的表达式数组）
  if (schema.lifecycle) {
    for (const [k, v] of Object.entries(schema.lifecycle)) {
      if (!v) continue
      const list = Array.isArray(v) ? v : [v]
      list.forEach((expr, i) => {
        const suffix = Array.isArray(v) ? `[${i}]` : ''
        if (expr) checkExprField(c, opt, expr, `lifecycle.${k}${suffix}`, `生命周期 ${k}${suffix} `)
      })
    }
  }

  // 路由参数唯一
  if (schema.params?.length) {
    const pset = new Set<string>()
    schema.params.forEach((p, i) => {
      if (pset.has(p.name)) c.error('E_DUPLICATE_ID', `params[${i}].name`, `路由参数名重复：${p.name}`)
      pset.add(p.name)
    })
  }

  return c.toResult()
}

/* ------------------------------------------------------------------ */
/* 物料校验                                                            */
/* ------------------------------------------------------------------ */

export function validateMaterial(m: MaterialSchema): ValidationResult {
  const c = new Collector()
  if (!m?.name) c.error('E_REQUIRED', 'name', '物料缺少 name')
  else if (!/^[A-Z][A-Za-z0-9]*$/.test(m.name)) {
    c.error('E_MATERIAL_NAME', 'name', `物料名必须首字母大写：${m.name}`)
  }
  if (!m.title) c.warn('W_MATERIAL_TITLE', 'title', '物料缺少 title（左侧物料面板将显示为空）')
  if (!m.category) c.error('E_REQUIRED', 'category', '物料缺少 category')
  if (!m.version) c.warn('W_MATERIAL_VERSION', 'version', '物料缺少 version')
  if (!m.defaultProps) c.error('E_REQUIRED', 'defaultProps', '物料缺少 defaultProps')
  if (!Array.isArray(m.settings)) c.error('E_REQUIRED', 'settings', '物料缺少 settings（属性面板无法生成）')
  else {
    const keys = new Set<string>()
    m.settings.forEach((s, i) => {
      if (!s.key) c.error('E_REQUIRED', `settings[${i}].key`, '设置项缺少 key')
      else if (keys.has(s.key)) c.error('E_DUPLICATE_ID', `settings[${i}].key`, `设置项 key 重复：${s.key}`)
      else keys.add(s.key)
      if (!s.setter) c.error('E_REQUIRED', `settings[${i}].setter`, `设置项 ${s.key} 缺少 setter`)
    })
  }
  if (m.hasField) {
    const hasName = m.settings?.some((s) => s.key === 'name')
    if (!hasName) c.warn('W_MATERIAL_FIELD', 'settings', 'hasField=true 的物料应在属性面板提供 name 字段选择器')
  }
  return c.toResult()
}

/* ------------------------------------------------------------------ */
/* 数据模型校验                                                        */
/* ------------------------------------------------------------------ */

export function validateModel(m: ModelSchema): ValidationResult {
  const c = new Collector()
  if (!m?.id) c.error('E_REQUIRED', 'id', '模型缺少 id')
  if (!m.name) c.error('E_REQUIRED', 'name', '模型缺少 name')
  if (!m.code) {
    c.error('E_REQUIRED', 'code', '模型缺少 code（物理表名）')
  } else if (!CODE_RE.test(m.code)) {
    c.error('E_CODE_FORMAT', 'code', `物理表名只能是小写字母/数字/下划线且以字母开头：${m.code}`)
  }
  if (!Array.isArray(m.fields) || m.fields.length === 0) {
    c.error('E_REQUIRED', 'fields', '模型至少需要一个字段')
    return c.toResult()
  }

  const keys = new Set<string>()
  let hasId = false
  m.fields.forEach((f, i) => {
    const path = `fields[${i}]`
    if (!f.key) c.error('E_REQUIRED', `${path}.key`, '字段缺少 key')
    else if (keys.has(f.key)) c.error('E_DUPLICATE_ID', `${path}.key`, `字段 key 重复：${f.key}`)
    else keys.add(f.key)
    if (!f.name) c.warn('W_FIELD_NAME', `${path}.name`, `字段 ${f.key} 缺少展示名`)
    if (!f.type) c.error('E_REQUIRED', `${path}.type`, `字段 ${f.key} 缺少 type`)
    if (f.type === 'id') hasId = true
    if (f.type === 'enum' && (!f.options || f.options.length === 0)) {
      c.error('E_FIELD_ENUM', `${path}.options`, `枚举字段 ${f.key} 必须提供 options`)
    }
    if (f.type === 'relation' && !f.refModel) {
      c.error('E_FIELD_RELATION', `${path}.refModel`, `关联字段 ${f.key} 必须提供 refModel`)
    }
    if (f.rules) {
      f.rules.forEach((r, ri) => {
        if (r.type === 'pattern') {
          try {
            new RegExp(r.value)
          } catch {
            c.error('E_RULE_PATTERN', `${path}.rules[${ri}]`, `正则表达式不合法：${r.value}`)
          }
        }
        if (r.type === 'expression') {
          checkExprField(c, optOf(m), r.value, `${path}.rules[${ri}]`, '校验规则 ')
        }
      })
    }
  })

  if (!hasId) c.warn('W_MODEL_NO_ID', 'fields', '模型缺少 type=id 的主键字段，将由平台自动补充')

  m.indexes?.forEach((ix, i) => {
    for (const f of ix.fields) {
      if (!keys.has(f)) c.error('E_INDEX_FIELD', `indexes[${i}]`, `索引引用了不存在的字段：${f}`)
    }
  })

  return c.toResult()
}

/** 模型校验暂无外部表达式检查器（服务端不强制），返回空配置。 */
function optOf(_m: ModelSchema): ValidateOptions {
  return {}
}

/* ------------------------------------------------------------------ */
/* 便捷：合并多份结果                                                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 流程定义校验（Phase 3 批 1 / D-P3-1，形状见主方案 8.6）              */
/* ------------------------------------------------------------------ */

/**
 * 校验流程定义：结构硬约束（首 start / 尾 end / approve≥1 / id 唯一 / onReject 引用存在）
 * 与审批人、条件表达式的可校验项。`opt.checkExpr` 提供时校验 condition 语法。
 */
export function validateFlow(flow: unknown, opt: ValidateOptions = {}): ValidationResult {
  const c = new Collector()
  if (!flow || typeof flow !== 'object') {
    c.error('E_FLOW_INVALID', '', '流程定义必须是对象')
    return c.toResult()
  }
  const f = flow as Record<string, unknown>

  if (typeof f['flowId'] !== 'string' || !ID_RE.test(f['flowId'])) {
    c.error('E_FLOW_ID', 'flowId', 'flowId 缺失或不合标识符格式（字母/数字/-/_，首字符字母或下划线）')
  }
  if (typeof f['name'] !== 'string' || !f['name'].trim()) {
    c.error('E_FLOW_NAME', 'name', 'name 缺失（待办与时间轴展示需要）')
  }
  if (typeof f['modelId'] !== 'string' || !f['modelId']) {
    c.error('E_FLOW_MODEL', 'modelId', 'modelId 缺失（流程必须绑定数据模型）')
  }
  if (
    f['startPageId'] !== undefined &&
    (typeof f['startPageId'] !== 'string' || !ID_RE.test(f['startPageId']))
  ) {
    c.error(
      'E_FLOW_START_PAGE',
      'startPageId',
      'startPageId 必须是页面编码（字母或下划线开头，仅字母/数字/-/_）',
    )
  }
  if (f['mode'] !== 'linear' && f['mode'] !== 'condition') {
    c.error('E_FLOW_MODE', 'mode', `mode 必须是 linear | condition，实际 ${JSON.stringify(f['mode'])}`)
  }

  const nodes = f['nodes']
  if (!Array.isArray(nodes) || nodes.length === 0) {
    c.error('E_FLOW_NODES_EMPTY', 'nodes', 'nodes 必须是非空数组')
    return c.toResult()
  }

  const ids = new Set<string>()
  nodes.forEach((raw, i) => {
    const path = `nodes[${i}]`
    if (!raw || typeof raw !== 'object') {
      c.error('E_FLOW_NODE_INVALID', path, '节点必须是对象')
      return
    }
    const n = raw as Record<string, unknown>
    const id = typeof n['id'] === 'string' ? n['id'] : ''
    if (!id) c.error('E_FLOW_NODE_ID', `${path}.id`, '节点 id 缺失')
    else if (ids.has(id)) c.error('E_FLOW_NODE_ID', `${path}.id`, `节点 id 重复：${id}`)
    else ids.add(id)
    if (typeof n['name'] !== 'string' || !n['name']) {
      c.error('E_FLOW_NODE_NAME', `${path}.name`, '节点 name 缺失')
    }
    const type = n['type']
    if (type !== 'start' && type !== 'approve' && type !== 'end') {
      c.error('E_FLOW_NODE_TYPE', `${path}.type`, `type 必须是 start | approve | end，实际 ${JSON.stringify(type)}`)
      return
    }
    if (type === 'approve') {
      const a = n['assignee'] as Record<string, unknown> | undefined
      if (!a || typeof a !== 'object') {
        c.error('E_FLOW_ASSIGNEE', `${path}.assignee`, 'approve 节点必须配置 assignee')
      } else {
        const at = a['type']
        if (at !== 'role' && at !== 'dept' && at !== 'starter') {
          c.error(
            'E_FLOW_ASSIGNEE',
            `${path}.assignee.type`,
            `assignee.type 必须是 role | dept | starter，实际 ${JSON.stringify(at)}`,
          )
        } else if (at === 'role' && (typeof a['value'] !== 'string' || !a['value'])) {
          c.error('E_FLOW_ASSIGNEE', `${path}.assignee.value`, 'assignee.type=role 必须提供 value（角色 key）')
        } else if (at === 'dept') {
          c.warn('W_FLOW_DEPT_ASSIGNEE', `${path}.assignee`, 'dept 审批人首期无组织服务、运行时不可命中（与 dataScope dept 降级同口径）')
        }
      }
    }
    if (type === 'start' && n['assignee'] !== undefined) {
      c.warn('W_FLOW_START_ASSIGNEE', `${path}.assignee`, 'start 节点不消费 assignee')
    }
    const cond = n['condition']
    if (cond !== undefined) {
      if (typeof cond !== 'string' || !cond.trim()) {
        c.error('E_FLOW_CONDITION', `${path}.condition`, 'condition 必须是非空表达式字符串')
      } else {
        checkExprField(c, opt, cond, `${path}.condition`, 'condition ')
        if (f['mode'] === 'linear') {
          c.warn('W_FLOW_CONDITION_IGNORED', `${path}.condition`, 'mode=linear 忽略 condition（需要条件跳过请设 mode=condition）')
        }
      }
    }
    const onReject = n['onReject']
    if (onReject !== undefined && (typeof onReject !== 'string' || !onReject)) {
      c.error('E_FLOW_ONREJECT', `${path}.onReject`, 'onReject 必须是节点 id 字符串')
    }
    const oa = n['onApprove']
    if (oa !== undefined && (!oa || typeof oa !== 'object' || (oa as Record<string, unknown>)['setField'] === undefined)) {
      c.error('E_FLOW_ONAPPROVE', `${path}.onApprove`, 'onApprove 仅支持 { setField: {...} } 形状')
    }
  })

  // 结构硬约束（在逐节点检查后执行，避免空数组时重复报）
  const first = nodes[0] as Record<string, unknown> | undefined
  if (first && first['type'] !== 'start') {
    c.error('E_FLOW_START_POS', 'nodes[0]', '首节点必须是 start')
  }
  const last = nodes[nodes.length - 1] as Record<string, unknown> | undefined
  if (last && last['type'] !== 'end') {
    c.error('E_FLOW_END_POS', `nodes[${nodes.length - 1}]`, '末节点必须是 end')
  }
  if (!nodes.some((n) => (n as Record<string, unknown>)['type'] === 'approve')) {
    c.error('E_FLOW_APPROVE_MISSING', 'nodes', '至少需要一个 approve 节点')
  }
  // onReject 引用存在性（id 集合已收集完）
  nodes.forEach((raw, i) => {
    const n = raw as Record<string, unknown>
    const onReject = n['onReject']
    if (typeof onReject === 'string' && !ids.has(onReject)) {
      c.error('E_FLOW_ONREJECT_REF', `nodes[${i}].onReject`, `onReject 指向不存在的节点：${onReject}`)
    }
    if (n['type'] === 'end' && n['onApprove'] === undefined) {
      c.warn('W_FLOW_END_NO_SETFIELD', `nodes[${i}].onApprove`, 'end 节点未配置 setField：流程结束不回写业务状态')
    }
  })

  return c.toResult()
}

export function mergeResults(...rs: ValidationResult[]): ValidationResult {
  const errors = rs.flatMap((r) => r.errors)
  const warnings = rs.flatMap((r) => r.warnings)
  return { valid: errors.length === 0, errors, warnings }
}

/** 收集页面用到的字段名（供校验器与设计器复用）。 */
export function collectFieldNames(root: NodeSchema): string[] {
  const out = new Set<string>()
  walkNode(root, (n) => {
    const name = n.props?.['name']
    if (typeof name === 'string' && name) out.add(name)
  })
  return [...out]
}
