/**
 * lc-portal-page.test.ts —— type=portal 标准门户页（Phase 3 批 4，D-P3-11）
 *
 * 覆盖：卡片区渲染（title/desc/badge/icon 映射）、点卡跳转（pageId → navigate；
 * url → open-url）、列数换算、纯拖拽门户（无 cards 不渲染卡片区）、无配置不崩。
 *
 * 边界：jsdom 下 uni 标签为未知元素；`lc-renderer` 子组件用 stub（本文件只测门户壳层）。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createEmptyPage, type PageSchema, type PortalCard } from '@lc/schema'
import type { PageControllerOptions } from '../../src/core/controller.js'
import LcPortalPage from '../../src/uni/lc-portal-page.vue'

function makeHost() {
  return {
    toast: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    back: vi.fn(async () => {}),
    confirm: vi.fn(async () => true),
    request: vi.fn(async () => ({ statusCode: 200, data: {} })),
  }
}

function portalSchema(cards?: PortalCard[], columns?: number, title?: string): PageSchema {
  const p = createEmptyPage('p_portal', '门户页')
  p.type = 'portal'
  p.portal = { cards: cards ?? [], ...(columns !== undefined ? { columns } : {}), ...(title ? { title } : {}) }
  return p
}

function mountPortal(schema: PageSchema) {
  return mount(LcPortalPage, {
    props: { schema, options: { host: makeHost() } as unknown as PageControllerOptions },
    global: { stubs: { 'lc-renderer': true } },
  })
}

const cards: PortalCard[] = [
  { title: '请假申请', desc: '发起请假', icon: 'date', pageId: 'leave_form', badge: '3' },
  { title: '帮助中心', url: 'https://example.com/help' },
]

describe('lc-portal-page —— 门户标准页', () => {
  it('渲染卡片：标题 / 说明 / 角标 / 内置图标映射', async () => {
    const w = mountPortal(portalSchema(cards, 2, '工作台'))
    await flushPromises()
    expect(w.text()).toContain('工作台')
    expect(w.findAll('.lc-card')).toHaveLength(2)
    expect(w.text()).toContain('请假申请')
    expect(w.text()).toContain('发起请假')
    expect(w.text()).toContain('3')
    expect(w.text()).toContain('📅') // date → 内置字形

    const w2 = mountPortal(portalSchema([{ title: '未知图标', icon: 'x' }]))
    await flushPromises()
    expect(w2.text()).toContain('x') // 未知 → 首字符
    w.unmount()
    w2.unmount()
  })

  it('点卡：配 pageId → emit navigate；配 url → emit open-url', async () => {
    const w = mountPortal(portalSchema(cards))
    await flushPromises()
    await w.findAll('.lc-card')[0]!.trigger('tap')
    expect(w.emitted('navigate')).toEqual([[{ pageId: 'leave_form', params: {} }]])
    await w.findAll('.lc-card')[1]!.trigger('tap')
    expect(w.emitted('open-url')).toEqual([['https://example.com/help']])
    w.unmount()
  })

  it('列数换算：columns=3 → 卡片宽度 100/3%', async () => {
    const w = mountPortal(portalSchema(cards, 3))
    await flushPromises()
    const style = String(w.findAll('.lc-card')[0]!.attributes('style'))
    expect(style).toContain('33.33')
    w.unmount()
  })

  it('无 cards（纯拖拽门户）→ 不渲染卡片区，仍渲染拖拽区（renderer stub）', async () => {
    const w = mountPortal(portalSchema([]))
    await flushPromises()
    expect(w.findAll('.lc-card')).toHaveLength(0)
    expect(w.find('lc-renderer-stub').exists()).toBe(true)
    w.unmount()
  })

  it('未配 portal 配置 → 不崩（cards 空）', async () => {
    const p = createEmptyPage('p_portal', '门户页')
    p.type = 'portal'
    const w = mountPortal(p)
    await flushPromises()
    expect(w.findAll('.lc-card')).toHaveLength(0)
    w.unmount()
  })
})
