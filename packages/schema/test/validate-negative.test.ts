/**
 * 校验器负向分支补齐（覆盖率缺口定向）：
 * 2026-10-08 实测 schema 包 stmts 87.94%（方案 9.2 硬指标 ≥ 90%），缺口集中在
 * validateAction / validateDataSources 的各错误分支与 validatePage 的入参防御分支。
 * 本文件按「未覆盖行」定向补齐，全部断言真实错误码（不为凑数断言恒真条件）。
 */
import { describe, it, expect } from 'vitest'
import { createEmptyPage, validatePage, MigrationRegistry, type PageSchema } from '../src/index.js'

function base(): PageSchema {
  const p = createEmptyPage('pg_neg', '负向页')
  p.root.children = [{ id: 'n1', componentName: 'Input', props: { name: 'f1', label: '字段' } }]
  return p
}

describe('validatePage —— 入参防御与页面级负向', () => {
  it('schema 非对象 → E_REQUIRED', () => {
    const r = validatePage(null as unknown as PageSchema)
    expect(r.valid).toBe(false)
    expect(r.errors[0]?.code).toBe('E_REQUIRED')
  })

  it('未知历史版本（0.9.0）→ E_SCHEMA_VERSION（W_SCHEMA_OUTDATED 分支当前不可达：VERSION_HISTORY 仅含 1.0.0，待协议升版后补测）', () => {
    const p = base()
    p.schemaVersion = '0.9.0'
    const r = validatePage(p)
    expect(r.errors.some((e) => e.code === 'E_SCHEMA_VERSION')).toBe(true)
    expect(r.warnings.some((w) => w.code === 'W_SCHEMA_OUTDATED')).toBe(false)
  })

  it('未知页面 type → E_PAGE_TYPE', () => {
    const p = base()
    ;(p as any).type = 'wizard'
    expect(validatePage(p).errors.some((e) => e.code === 'E_PAGE_TYPE')).toBe(true)
  })
})

describe('validatePage —— 节点负向', () => {
  it('节点缺 id → E_REQUIRED', () => {
    const p = base()
    p.root.children = [{ componentName: 'Input' } as any]
    expect(validatePage(p).errors.some((e) => e.code === 'E_REQUIRED' && e.path.includes('id'))).toBe(true)
  })

  it('节点缺 componentName → E_REQUIRED', () => {
    const p = base()
    p.root.children = [{ id: 'nX' } as any]
    expect(validatePage(p).errors.some((e) => e.code === 'E_REQUIRED' && e.path.includes('componentName'))).toBe(true)
  })

  it('perm 格式非法 → E_PERM_FORMAT', () => {
    const p = base()
    p.root.children = [{ id: 'n3', componentName: 'View', perm: 'bad perm!' } as any]
    expect(validatePage(p).errors.some((e) => e.code === 'E_PERM_FORMAT')).toBe(true)
  })
})

describe('validatePage —— 动作负向矩阵', () => {
  it('各类型动作缺字段 → E_ACTION_INVALID；缺 dsId 引用 → E_DS_MISSING', () => {
    const p = base()
    p.root.children![0].actions = [
      { event: 'onClick', type: 'expression', value: '' }, // 非空表达式校验
      { event: 'onClick', type: 'expression', value: 'formData.a +' }, // 非法表达式（checkExprField 分支）
      { event: 'onClick', type: 'toast', value: {} }, // 缺 value.text
      { event: 'onClick', type: 'confirm', value: {} }, // 缺 value.text
      { event: 'onClick', type: 'copy', value: {} }, // 缺 value.expr
      { event: 'onClick', type: 'phone', value: {} }, // 缺 value.expr
      { event: 'onClick', type: 'setForm', value: null }, // 缺对象 value
      { event: 'onClick', type: 'setApp', value: 'nope' }, // value 非对象
      { event: 'onClick', type: 'http', value: {} }, // 缺 value.dsId
      { event: 'onClick', type: 'datasource', value: { dsId: 'not-exist' } }, // 引用不存在的数据源
      { event: 'onClick', type: 'not-a-type' as any, value: {} }, // default 分支（未知类型放行）
    ]
    const r = validatePage(p)
    const invalids = r.errors.filter((e) => e.code === 'E_ACTION_INVALID')
    // expression空值 / toast / confirm / copy / phone / setForm / setApp / http缺dsId = 8 个
    expect(invalids.length).toBeGreaterThanOrEqual(8)
    expect(r.errors.some((e) => e.code === 'E_DS_MISSING')).toBe(true)
    // 未知类型不报 E_ACTION_INVALID（default 放行，交给运行时）
    expect(invalids.some((e) => e.path.includes('not-a-type'))).toBe(false)
  })

  it('合法 expression 动作不报错（checkExprField else 分支）', () => {
    const p = base()
    p.root.children![0].actions = [{ event: 'onClick', type: 'expression', value: 'formData.a + 1' }]
    expect(validatePage(p).errors.filter((e) => e.code === 'E_ACTION_INVALID')).toHaveLength(0)
  })
})

describe('validatePage —— 数据源负向', () => {
  it('缺 id / 非法 method / static 无 data / formula 未实现 / watch 空字段', () => {
    const p = base()
    p.dataSources = [
      { name: '缺id', type: 'http', url: '/a' } as any,
      { id: 'm1', name: '方法非法', type: 'http', url: '/b', method: 'PUT' } as any,
      { id: 's1', name: '静态', type: 'static' } as any, // data undefined → W_DS_DATA
      { id: 'f1', name: '公式', type: 'formula' } as any, // → W_DS_FORMULA
      { id: 'w1', name: '监听', type: 'http', url: '/c', trigger: 'watch:' } as any, // watch 空字段
    ]
    const r = validatePage(p)
    expect(r.errors.some((e) => e.code === 'E_REQUIRED' && e.path.startsWith('dataSources'))).toBe(true)
    expect(r.errors.some((e) => e.code === 'E_DS_METHOD')).toBe(true)
    expect(r.errors.some((e) => e.code === 'E_DS_TRIGGER')).toBe(true)
    expect(r.warnings.some((w) => w.code === 'W_DS_DATA')).toBe(true)
    expect(r.warnings.some((w) => w.code === 'W_DS_FORMULA')).toBe(true)
  })
})

describe('MigrationRegistry —— size 访问器', () => {
  it('注册前为 0、注册后为 1', () => {
    const reg = new MigrationRegistry()
    expect(reg.size).toBe(0)
    reg.register({ from: '0.9.0', to: '1.0.0', run: (s) => s })
    expect(reg.size).toBe(1)
  })
})
