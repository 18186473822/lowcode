/**
 * Phase 2 批 2：标准页校验（type=list / type=detail，与既有 list 校验对称补齐 detail）。
 * 配置缺失必须红字可见（设计器底栏 touch 即时校验拦截保存）。
 */
import { describe, it, expect } from 'vitest'
import { createEmptyPage, validatePage, type PageSchema } from '../src/index.js'

function stdPage(type: 'list' | 'detail'): PageSchema {
  const p = createEmptyPage('pg_std', '标准页')
  p.type = type
  return p
}

function hasError(r: { errors: Array<{ code: string; path: string; message: string }> }, path: string): boolean {
  return r.errors.some((e) => e.code === 'E_REQUIRED' && e.path === path)
}

describe('validatePage —— type=list（Phase 2 批 2）', () => {
  it('无 list 配置 → E_REQUIRED list', () => {
    const r = validatePage(stdPage('list'))
    expect(r.valid).toBe(false)
    expect(hasError(r, 'list')).toBe(true)
    expect(hasError(r, 'list.modelId')).toBe(false)
  })

  it('有 list 但缺 modelId → E_REQUIRED list.modelId', () => {
    const p = stdPage('list')
    p.list = { modelId: '', columns: [] }
    const r = validatePage(p)
    expect(r.valid).toBe(false)
    expect(hasError(r, 'list.modelId')).toBe(true)
  })

  it('配齐 modelId → 通过（root 空树允许）', () => {
    const p = stdPage('list')
    p.list = { modelId: 'm_leave', columns: ['days'] }
    const r = validatePage(p)
    expect(r.valid).toBe(true)
  })
})

describe('validatePage —— type=detail（Phase 2 批 2，与 list 对称）', () => {
  it('无 detail 配置 → E_REQUIRED detail', () => {
    const r = validatePage(stdPage('detail'))
    expect(r.valid).toBe(false)
    expect(hasError(r, 'detail')).toBe(true)
    expect(hasError(r, 'detail.modelId')).toBe(false)
  })

  it('有 detail 但缺 modelId → E_REQUIRED detail.modelId', () => {
    const p = stdPage('detail')
    p.detail = { modelId: '' }
    const r = validatePage(p)
    expect(r.valid).toBe(false)
    expect(hasError(r, 'detail.modelId')).toBe(true)
  })

  it('配齐 modelId → 通过；list/detail 只按当前 type 查（对方配置残留不报错）', () => {
    const p = stdPage('detail')
    p.detail = { modelId: 'm_leave', fields: ['days'] }
    // 残留的 list 配置（切类型前的）不应触发 list 校验
    p.list = { modelId: '' }
    const r = validatePage(p)
    expect(r.valid).toBe(true)
    expect(r.errors.filter((e) => e.path.startsWith('list'))).toHaveLength(0)
  })
})

describe('validatePage —— type=portal（Phase 3 批 4）', () => {
  it('无 portal 配置 → 合法（纯拖拽门户）', () => {
    const r = validatePage(stdPage('portal'))
    expect(r.valid).toBe(true)
  })

  it('cards 为空数组 → 合法', () => {
    const p = stdPage('portal')
    p.portal = { cards: [] }
    expect(validatePage(p).valid).toBe(true)
  })

  it('卡片缺 title → E_REQUIRED portal.cards[i].title；配齐则通过', () => {
    const p = stdPage('portal')
    p.portal = { cards: [{ title: '' }, { title: '请假申请', pageId: 'leave_form' }] }
    const r = validatePage(p)
    expect(r.valid).toBe(false)
    expect(hasError(r, 'portal.cards[0].title')).toBe(true)
    expect(hasError(r, 'portal.cards[1].title')).toBe(false)

    p.portal = { cards: [{ title: '请假申请', pageId: 'leave_form' }] }
    expect(validatePage(p).valid).toBe(true)
  })
})
