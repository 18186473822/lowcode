/**
 * publish-dialog.test.ts —— 发布版本弹窗（2026-10-29 P3）
 *
 * 覆盖：默认备注、备注透传、空串原样交给宿主、Esc/取消/遮罩关闭、
 * 发布中禁用重复提交、失败原因就地展示、版本号提示。
 *
 * 边界：弹窗是纯展示组件（不碰 store、不发请求）；发布动作与刷新在宿主 App.vue。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PublishDialog from '../src/components/PublishDialog.vue'

describe('PublishDialog', () => {
  it('默认备注「设计器发布」（用户不改直接回车即可发布）', () => {
    const w = mount(PublishDialog)
    const input = w.get('[data-testid="pub-note"]').element as HTMLInputElement
    expect(input.value).toBe('设计器发布')
    w.unmount()
  })

  it('未发布过提示 v1；已发布 v3 提示 v4', () => {
    const first = mount(PublishDialog)
    expect(first.get('[data-testid="pub-hint"]').text()).toContain('v1')
    first.unmount()

    const next = mount(PublishDialog, { props: { currentVersion: 3 } })
    expect(next.get('[data-testid="pub-hint"]').text()).toContain('v4')
    next.unmount()
  })

  it('改备注后确认 → emit confirm(新备注)', async () => {
    const w = mount(PublishDialog)
    await w.get('[data-testid="pub-note"]').setValue('  调整门户卡片顺序  ')
    await w.get('[data-testid="pub-confirm"]').trigger('click')
    // 两端空白由组件 trim 掉
    expect(w.emitted('confirm')?.[0]).toEqual(['调整门户卡片顺序'])
    w.unmount()
  })

  it('备注清空 → confirm("")（默认文案由宿主 api 层兜，不在这里编）', async () => {
    const w = mount(PublishDialog)
    await w.get('[data-testid="pub-note"]').setValue('   ')
    await w.get('[data-testid="pub-confirm"]').trigger('click')
    expect(w.emitted('confirm')?.[0]).toEqual([''])
    w.unmount()
  })

  it('回车确认；Esc、取消按钮、点遮罩都关闭', async () => {
    const w = mount(PublishDialog)
    await w.get('[data-testid="pub-note"]').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('confirm')).toHaveLength(1)

    await w.get('[data-testid="pub-note"]').trigger('keydown', { key: 'Escape' })
    await w.get('[data-testid="pub-cancel"]').trigger('click')
    await w.get('.lc-pub').trigger('click')
    expect(w.emitted('close')).toHaveLength(3)
    w.unmount()
  })

  it('发布中：按钮置灰且不重复提交', async () => {
    const w = mount(PublishDialog, { props: { saving: true } })
    const btn = w.get('[data-testid="pub-confirm"]')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain('发布中')
    await btn.trigger('click')
    expect(w.emitted('confirm')).toBeUndefined()
    w.unmount()
  })

  it('宿主发布失败 → 原因就地显示，不关窗', () => {
    const w = mount(PublishDialog, { props: { error: '校验 2 项错误，未保存' } })
    expect(w.get('[data-testid="pub-error"]').text()).toContain('校验 2 项错误')
    w.unmount()
  })
})
