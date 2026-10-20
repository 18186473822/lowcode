import { describe, it, expect } from 'vitest'
import {
  createEmptyPage,
  validatePage,
  validateMaterial,
  validateModel,
  walkNode,
  findNode,
  collectComponentNames,
  collectFieldNames,
  SCHEMA_VERSION,
  type PageSchema,
  type MaterialSchema,
  type ModelSchema,
} from '../src/index.js'

/** 构造一个最小合法页面 */
function minimalPage(): PageSchema {
  const p = createEmptyPage('pg_test', '测试页')
  p.root.children = [
    { id: 'n1', componentName: 'Input', props: { name: 'applicant', label: '申请人' } },
    { id: 'n2', componentName: 'Button', props: { text: '提交' } },
  ]
  return p
}

describe('validatePage —— 正常页面', () => {
  it('空页面校验通过', () => {
    const r = validatePage(createEmptyPage('pg_a', 'A'))
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('带组件与数据源的页面校验通过', () => {
    const p = minimalPage()
    p.dataSources = [
      { id: 'ds1', name: '部门', type: 'http', method: 'GET', url: '/api/depts' },
    ]
    p.root.children![1].actions = [{ event: 'onClick', type: 'datasource', value: { dsId: 'ds1' } }]
    const r = validatePage(p, { materials: ['Page', 'Input', 'Button'] })
    expect(r.valid).toBe(true)
  })
})

describe('validatePage —— 版本', () => {
  it('缺少 schemaVersion 报错', () => {
    const p: any = minimalPage()
    delete p.schemaVersion
    const r = validatePage(p)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.code === 'E_SCHEMA_VERSION')).toBe(true)
  })

  it('版本格式非法报错', () => {
    const p: any = minimalPage()
    p.schemaVersion = 'v1'
    expect(validatePage(p).errors.some((e) => e.code === 'E_SCHEMA_VERSION')).toBe(true)
  })

  it('平台未知版本报错', () => {
    const p: any = minimalPage()
    p.schemaVersion = '9.9.9'
    const r = validatePage(p)
    expect(r.errors.some((e) => e.code === 'E_SCHEMA_VERSION')).toBe(true)
  })

  it('当前版本不产生过期警告', () => {
    expect(minimalPage().schemaVersion).toBe(SCHEMA_VERSION)
    const r = validatePage(minimalPage())
    expect(r.warnings.some((w) => w.code === 'W_SCHEMA_OUTDATED')).toBe(false)
  })
})

describe('validatePage —— 组件树', () => {
  it('缺少 root 报错', () => {
    const p: any = minimalPage()
    p.root = undefined
    const r = validatePage(p)
    expect(r.errors.some((e) => e.code === 'E_REQUIRED' && e.path === 'root')).toBe(true)
  })

  it('节点 id 重复报错', () => {
    const p = minimalPage()
    p.root.children![1].id = 'n1'
    const r = validatePage(p)
    expect(r.errors.some((e) => e.code === 'E_DUPLICATE_ID')).toBe(true)
  })

  it('引用未注册物料报错（发布应被拒绝）', () => {
    const p = minimalPage()
    p.root.children![0].componentName = 'NotExists'
    const r = validatePage(p, { materials: ['Page', 'Input', 'Button'] })
    const e = r.errors.find((x) => x.code === 'E_UNKNOWN_MATERIAL')
    expect(e).toBeTruthy()
    expect(e!.path).toContain('root.children[0]')
  })

  it('不传 materials 时跳过物料存在性检查', () => {
    const p = minimalPage()
    p.root.children![0].componentName = 'Whatever'
    expect(validatePage(p).valid).toBe(true)
  })

  it('表单 name 不在模型字段中给出警告（非阻断）', () => {
    const p = minimalPage()
    const r = validatePage(p, { modelFields: ['amount'] })
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => w.code === 'W_FIELD_UNKNOWN')).toBe(true)
  })

  it('非白名单样式项给出警告', () => {
    const p = minimalPage()
    ;(p.root.children![0].style as any) = { color: 'red', position: 'absolute' }
    const r = validatePage(p)
    expect(r.warnings.some((w) => w.code === 'W_STYLE_KEY')).toBe(true)
  })

  it('设置 loop 但缺少循环模板给出警告', () => {
    const p = minimalPage()
    p.root.children![0].loop = 'formData.items'
    const r = validatePage(p)
    expect(r.warnings.some((w) => w.code === 'W_LOOP_NO_TEMPLATE')).toBe(true)
  })

  it('loop 配合子节点时不产生警告（正常用法）', () => {
    const p = minimalPage()
    p.root.children![0] = {
      id: 'loopNode',
      componentName: 'FormGroup',
      loop: 'formData.items',
      children: [{ id: 'inner', componentName: 'Text' }],
    }
    const r = validatePage(p, { materials: ['Page', 'Input', 'Button', 'FormGroup', 'Text'] })
    expect(r.warnings.some((w) => w.code === 'W_LOOP_NO_TEMPLATE')).toBe(false)
  })

  it('路由参数重复报错', () => {
    const p = minimalPage()
    p.params = [{ name: 'id' }, { name: 'id' }]
    expect(validatePage(p).errors.some((e) => e.code === 'E_DUPLICATE_ID')).toBe(true)
  })
})

describe('validatePage —— 数据源与动作', () => {
  it('http 数据源缺 url 报错', () => {
    const p = minimalPage()
    p.dataSources = [{ id: 'ds1', name: 'x', type: 'http' }]
    expect(validatePage(p).errors.some((e) => e.code === 'E_DS_URL')).toBe(true)
  })

  it('数据源 id 重复报错', () => {
    const p = minimalPage()
    p.dataSources = [
      { id: 'ds1', name: 'a', type: 'http', url: '/a' },
      { id: 'ds1', name: 'b', type: 'http', url: '/b' },
    ]
    expect(validatePage(p).errors.some((e) => e.code === 'E_DUPLICATE_ID')).toBe(true)
  })

  it('model 数据源缺 modelId 报错', () => {
    const p = minimalPage()
    p.dataSources = [{ id: 'ds1', name: 'x', type: 'model' }]
    expect(validatePage(p).errors.some((e) => e.code === 'E_DS_MODEL')).toBe(true)
  })

  it('submit 引用不存在的数据源报错', () => {
    const p = minimalPage()
    p.submit = { dataSourceId: 'ds_missing' }
    expect(validatePage(p).errors.some((e) => e.code === 'E_SUBMIT_DS_MISSING')).toBe(true)
  })

  it('navigate 动作缺 pageId 报错', () => {
    const p = minimalPage()
    p.root.children![1].actions = [{ event: 'onClick', type: 'navigate', value: {} as any }]
    expect(validatePage(p).errors.some((e) => e.code === 'E_ACTION_INVALID')).toBe(true)
  })

  it('datasource 动作引用不存在的数据源报错', () => {
    const p = minimalPage()
    p.root.children![1].actions = [{ event: 'onClick', type: 'datasource', value: { dsId: 'nope' } }]
    expect(validatePage(p).errors.some((e) => e.code === 'E_DS_MISSING')).toBe(true)
  })

  it('提供 checkExpr 时校验 condition 语法', () => {
    const p = minimalPage()
    p.root.children![0].condition = 'formData.a +'
    const r = validatePage(p, {
      checkExpr: (e) => (e.endsWith('+') ? { ok: false, message: '意外结束' } : { ok: true }),
    })
    expect(r.errors.some((e) => e.code === 'E_EXPR_SYNTAX')).toBe(true)
  })

  it('list 页缺 list 配置报错', () => {
    const p = minimalPage()
    p.type = 'list'
    expect(validatePage(p).errors.some((e) => e.path === 'list')).toBe(true)
  })
})

describe('validateMaterial', () => {
  const ok: MaterialSchema = {
    name: 'Input',
    title: '单行输入',
    category: 'form',
    version: '1.0.0',
    hasField: true,
    defaultProps: { label: '标签', name: '' },
    settings: [
      { key: 'label', label: '标签文案', setter: 'input' },
      { key: 'name', label: '字段名', setter: 'fieldPicker' },
    ],
  }

  it('合法物料通过', () => {
    expect(validateMaterial(ok).valid).toBe(true)
  })

  it('物料名非大写开头报错', () => {
    expect(validateMaterial({ ...ok, name: 'input' }).errors.some((e) => e.code === 'E_MATERIAL_NAME')).toBe(true)
  })

  it('缺少 settings 报错', () => {
    const m: any = { ...ok }
    delete m.settings
    expect(validateMaterial(m).errors.some((e) => e.code === 'E_REQUIRED')).toBe(true)
  })

  it('settings key 重复报错', () => {
    const m = { ...ok, settings: [...ok.settings, { key: 'label', label: 'x', setter: 'input' }] }
    expect(validateMaterial(m).errors.some((e) => e.code === 'E_DUPLICATE_ID')).toBe(true)
  })

  it('hasField 但无 name 选择器给出警告', () => {
    const m = { ...ok, settings: [{ key: 'label', label: 'x', setter: 'input' }] }
    expect(validateMaterial(m).warnings.some((w) => w.code === 'W_MATERIAL_FIELD')).toBe(true)
  })
})

describe('validateModel', () => {
  const ok: ModelSchema = {
    schemaVersion: SCHEMA_VERSION,
    id: 'md_a',
    name: '报销单',
    code: 'expense_order',
    fields: [
      { key: 'id', name: '主键', type: 'id' },
      { key: 'amount', name: '金额', type: 'money', required: true },
      { key: 'type', name: '类型', type: 'enum', options: [{ label: '差旅', value: 'travel' }] },
    ],
  }

  it('合法模型通过', () => {
    expect(validateModel(ok).valid).toBe(true)
  })

  it('表名格式非法报错', () => {
    expect(validateModel({ ...ok, code: 'Expense-Order' }).errors.some((e) => e.code === 'E_CODE_FORMAT')).toBe(true)
  })

  it('字段 key 重复报错', () => {
    const m = { ...ok, fields: [...ok.fields, { key: 'amount', name: 'x', type: 'number' }] }
    expect(validateModel(m).errors.some((e) => e.code === 'E_DUPLICATE_ID')).toBe(true)
  })

  it('枚举字段缺 options 报错', () => {
    const m = { ...ok, fields: [{ key: 'st', name: '状态', type: 'enum' }] }
    expect(validateModel(m).errors.some((e) => e.code === 'E_FIELD_ENUM')).toBe(true)
  })

  it('关联字段缺 refModel 报错', () => {
    const m = { ...ok, fields: [{ key: 'dept', name: '部门', type: 'relation' }] }
    expect(validateModel(m).errors.some((e) => e.code === 'E_FIELD_RELATION')).toBe(true)
  })

  it('非法正则规则报错', () => {
    const m = {
      ...ok,
      fields: [{ key: 'p', name: '电话', type: 'string', rules: [{ type: 'pattern' as const, value: '([' }] }],
    }
    expect(validateModel(m).errors.some((e) => e.code === 'E_RULE_PATTERN')).toBe(true)
  })

  it('索引引用不存在字段报错', () => {
    const m = { ...ok, indexes: [{ fields: ['nope'] }] }
    expect(validateModel(m).errors.some((e) => e.code === 'E_INDEX_FIELD')).toBe(true)
  })

  it('缺主键仅警告不阻断', () => {
    const m = { ...ok, fields: [{ key: 'a', name: 'A', type: 'string' }] }
    const r = validateModel(m)
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => w.code === 'W_MODEL_NO_ID')).toBe(true)
  })
})

describe('树工具函数', () => {
  const p = minimalPage()
  p.root.children!.push({
    id: 'n3',
    componentName: 'FormGroup',
    children: [{ id: 'n4', componentName: 'Textarea', props: { name: 'reason' } }],
  })

  it('walkNode 遍历所有节点', () => {
    const ids: string[] = []
    walkNode(p.root, (n) => {
      ids.push(n.id)
    })
    expect(ids).toEqual(['node_pg_test_root', 'n1', 'n2', 'n3', 'n4'])
  })

  it('findNode 可定位深层节点', () => {
    expect(findNode(p.root, 'n4')?.componentName).toBe('Textarea')
    expect(findNode(p.root, 'nope')).toBeNull()
  })

  it('collectComponentNames 返回去重物料清单（供构建期裁剪）', () => {
    expect(collectComponentNames(p.root).sort()).toEqual(
      ['Button', 'FormGroup', 'Input', 'Page', 'Textarea'].sort(),
    )
  })

  it('collectFieldNames 收集表单字段', () => {
    expect(collectFieldNames(p.root).sort()).toEqual(['applicant', 'reason'].sort())
  })
})
