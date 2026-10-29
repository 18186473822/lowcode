/**
 * meta-sync.test.ts —— META 注册表同步锁（Phase 2 批 3）
 *
 * 背景：批 3 展示物料 12 → 30（META 31 项排除 Page）。META_LIST 是物料面板与
 *       属性面板的单一数据源（PLANS.md §1 D-A4）——注册表与组件/映射一旦脱节，
 *       面板出现「拖入即未知组件」的断链。本文件锁死数量、唯一性、新名在册与
 *       settings 齐备四件事。
 */
import { describe, it, expect } from 'vitest'
import { META_LIST, META_MAP } from '@lc/materials'
import { MATERIAL_MAP } from '../src/material-map'

/** 批 3 新增 18 物料（对齐 FieldType 全集 + 方案缺口清单，详设见 PLANS.md §2B） */
const BATCH3_NEW = [
  'DatePicker',
  'DateTimePicker',
  'MoneyInput',
  'Checkbox',
  'Picker',
  'UserPicker',
  'DeptPicker',
  'Cascader',
  'FileUpload',
  'Detail',
  'Cell',
  'List',
  'Tabs',
  'SearchBar',
  'Tag',
  'Icon',
  'Progress',
  'Rate',
] as const

const LEGAL_CATEGORIES = new Set(['basic', 'layout', 'form', 'data', 'nav', 'feedback', 'biz'])

/** Phase 3 批 2 新增 2 物料（biz 组审批物料，详设见 PLANS.md §3 D-P3-4） */
const BATCH2_NEW = ['ApprovalBar', 'Timeline'] as const

/** Phase 3 批 4 新增 2 物料（data 组图表 / 指标卡，详设见 PLANS.md §3 D-P3-10） */
const BATCH4_NEW = ['Chart', 'Statistic'] as const

/** 2026-10-28 门户组件库批 2 新增 4 物料（basic 2 + biz 2，见 docs/OPERATIONS.md §3.6） */
const PORTAL_NEW = ['PortalBanner', 'PortalNotice', 'PortalStat', 'PortalTodo'] as const

describe('META 注册表同步（批 3：31 / 30；门户批 2：39 / 38；P2 魔方与页面入口后：41 / 40）', () => {
  it('META_LIST 共 41 项（含 Page），展示项（排除 Page）= 40', () => {
    expect(META_LIST).toHaveLength(41)
    expect(META_LIST.filter((m) => m.name !== 'Page')).toHaveLength(40)
  })

  it('名称唯一，且 META_MAP 与 META_LIST 双向一致', () => {
    const names = META_LIST.map((m) => m.name)
    expect(new Set(names).size).toBe(41)
    expect(Object.keys(META_MAP).sort()).toEqual([...names].sort())
  })

  it('批 3 的 18 个新物料全部在册', () => {
    for (const name of BATCH3_NEW) {
      expect(META_MAP[name], `${name} 未注册`).toBeDefined()
    }
  })

  it('批 2 的 2 个审批物料全部在册（biz 组）', () => {
    for (const name of BATCH2_NEW) {
      expect(META_MAP[name], `${name} 未注册`).toBeDefined()
      expect(META_MAP[name]!.category).toBe('biz')
    }
    // recordId 默认带表达式绑定 —— 拖入详情页即自动关联路由 rid（D-P3-4）
    expect(META_MAP.ApprovalBar!.defaultProps.recordId).toBe('$expr: urlParams.rid')
    expect(META_MAP.Timeline!.defaultProps.recordId).toBe('$expr: urlParams.rid')
  })

  it('批 4 的 2 个图表物料全部在册（data 组）', () => {
    for (const name of BATCH4_NEW) {
      expect(META_MAP[name], `${name} 未注册`).toBeDefined()
      expect(META_MAP[name]!.category).toBe('data')
    }
    expect(META_MAP.Chart!.defaultProps.chartType).toBe('bar')
  })

  it('门户组件库 4 个物料在册（basic 2 + biz 2）', () => {
    for (const name of PORTAL_NEW) {
      expect(META_MAP[name], `${name} 未注册`).toBeDefined()
    }
    expect(META_MAP.PortalBanner!.category).toBe('basic')
    expect(META_MAP.PortalNotice!.category).toBe('basic')
    expect(META_MAP.PortalStat!.category).toBe('biz')
    expect(META_MAP.PortalTodo!.category).toBe('biz')
    // JSON 驱动的物料一律用 json setter（写回解析后的数组，而不是 JSON 文本）
    expect(META_MAP.PortalBanner!.settings.find((s) => s.key === 'items')!.setter).toBe('json')
    expect(META_MAP.PortalStat!.settings.find((s) => s.key === 'items')!.setter).toBe('json')
  })

  it('分类全部合法，且同分类内 order 不重复', () => {
    for (const m of META_LIST) {
      expect(LEGAL_CATEGORIES.has(m.category), `${m.name} 分类非法: ${m.category}`).toBe(true)
    }
    const byCat = new Map<string, number[]>()
    for (const m of META_LIST) {
      const arr = byCat.get(m.category) ?? []
      arr.push(m.order ?? 0)
      byCat.set(m.category, arr)
    }
    for (const [cat, orders] of byCat) {
      expect(new Set(orders).size, `${cat} 分类内 order 重复: ${orders.join(',')}`).toBe(orders.length)
    }
  })

  it('除 Page 外每项 settings 与 defaultProps 非空、version 为 semver 三段', () => {
    for (const m of META_LIST) {
      expect(m.version, `${m.name} version 非法`).toMatch(/^\d+\.\d+\.\d+$/)
      if (m.name === 'Page') continue // 诚实空：lc-node Page 分支不读任何 props
      expect(m.settings.length, `${m.name} settings 为空`).toBeGreaterThan(0)
      expect(Object.keys(m.defaultProps).length, `${m.name} defaultProps 为空`).toBeGreaterThan(0)
    }
  })

  it('designer material-map 覆盖全部 39 个叶子物料组件（kebab 标签口径）', () => {
    // 展示 40 = 39 叶子组件 + Page（无组件，lc-node 内联容器分支）
    const leafNames = META_LIST.filter((m) => m.name !== 'Page' && m.name !== 'FormGroup').map((m) => m.name)
    expect(leafNames).toHaveLength(39)
    const toKebab = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
    for (const name of leafNames) {
      expect(MATERIAL_MAP[`lc-${toKebab(name)}`], `${name} 缺 designer 映射`).toBeDefined()
    }
    // FormGroup 同 Page 无物料组件（容器内联）
    expect(MATERIAL_MAP['lc-form-group']).toBeUndefined()
  })
})
