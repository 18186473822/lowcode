/**
 * theme-panel.test.ts —— 批 3 D-P3-8：ThemePanel 应用主题配置视图。
 *
 * 覆盖：挂载拉取回填（radius 去 px / dark 三态映射）、脏态门禁（基线不变不发 put）、
 * 保存 patch（null 清除语义）与 saved 事件、客户端格式门禁（非法值不发请求）、
 * 加载 / 保存失败红字可见不静默、重试可恢复。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ThemePanel from '../src/panel/ThemePanel.vue'
import type { ThemeApi, ThemePatch } from '../src/panel/theme-types'
import type { AppTheme } from '@lc/schema'

function mockApi(cfg?: AppTheme) {
  const get = vi.fn().mockResolvedValue(cfg)
  const put = vi.fn().mockResolvedValue({ primary: '#ff6600', radius: '12px' } as AppTheme)
  const api: ThemeApi = { get, put }
  return { api, get, put }
}

function text(wrapper: ReturnType<typeof mount>, testid: string): string {
  const el = wrapper.find(`[data-testid="${testid}"]`)
  expect(el.exists()).toBe(true)
  return el.text()
}

describe('批 3：ThemePanel 主题配置视图', () => {
  it('挂载即拉取并回填：radius 去 px、dark 布尔 → 三态映射', async () => {
    const { api, get } = mockApi({ primary: '#ff6600', radius: '12px', dark: true })
    const wrapper = mount(ThemePanel, { props: { api } })
    await flushPromises()

    expect(get).toHaveBeenCalledTimes(1)
    expect((wrapper.find('[data-testid="theme-primary"]').element as HTMLInputElement).value).toBe('#ff6600')
    expect((wrapper.find('[data-testid="theme-radius"]').element as HTMLInputElement).value).toBe('12')
    expect((wrapper.find('[data-testid="theme-dark"]').element as HTMLSelectElement).value).toBe('dark')
  })

  it('无配置（undefined）→ 表单全空 + 跟随系统；基线不变时保存钮禁用', async () => {
    const { api } = mockApi(undefined)
    const wrapper = mount(ThemePanel, { props: { api } })
    await flushPromises()

    expect((wrapper.find('[data-testid="theme-primary"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('[data-testid="theme-dark"]').element as HTMLSelectElement).value).toBe('')
    expect((wrapper.find('[data-testid="theme-save"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('编辑后可保存：put 收到 patch（空值 = null 清除、dark 三态映射）+ saved 事件', async () => {
    const { api, put } = mockApi(undefined)
    const wrapper = mount(ThemePanel, { props: { api } })
    await flushPromises()

    await wrapper.find('[data-testid="theme-primary"]').setValue('#2b6de8')
    await wrapper.find('[data-testid="theme-radius"]').setValue('12')
    await wrapper.find('[data-testid="theme-dark"]').setValue('dark')
    await wrapper.find('[data-testid="theme-save"]').trigger('click')
    await flushPromises()

    const patch = put.mock.calls[0][0] as ThemePatch
    expect(patch).toEqual({ primary: '#2b6de8', radius: '12px', dark: true })
    expect(wrapper.emitted('saved')).toBeTruthy()
    // 保存成功 → 基线刷新，按钮回到禁用
    expect((wrapper.find('[data-testid="theme-save"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('清除语义：清空 primary + dark 回「跟随系统」→ patch 发 null', async () => {
    const { api, put } = mockApi({ primary: '#ff6600', radius: '12px', dark: false })
    const wrapper = mount(ThemePanel, { props: { api } })
    await flushPromises()

    await wrapper.find('[data-testid="theme-primary"]').setValue('')
    await wrapper.find('[data-testid="theme-dark"]').setValue('')
    await wrapper.find('[data-testid="theme-save"]').trigger('click')
    await flushPromises()

    const patch = put.mock.calls[0][0] as ThemePatch
    expect(patch.primary).toBeNull()
    expect(patch.dark).toBeNull()
    expect(patch.radius).toBe('12px') // 未动的键保持原值
  })

  it('客户端门禁：非法 primary 不发 put，红字可见', async () => {
    const { api, put } = mockApi(undefined)
    const wrapper = mount(ThemePanel, { props: { api } })
    await flushPromises()

    await wrapper.find('[data-testid="theme-primary"]').setValue('red')
    await wrapper.find('[data-testid="theme-save"]').trigger('click')
    await flushPromises()

    expect(put).not.toHaveBeenCalled()
    expect(text(wrapper, 'theme-error')).toContain('primary')
  })

  it('加载失败 → 错误态可见；重试可恢复', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('网络错误')).mockResolvedValue(undefined)
    const put = vi.fn()
    const api: ThemeApi = { get, put }
    const wrapper = mount(ThemePanel, { props: { api } })
    await flushPromises()
    expect(text(wrapper, 'theme-error')).toContain('网络错误')

    await wrapper.find('[data-testid="theme-error-action"]').trigger('click') // 重试按钮（PanelState action）
    await flushPromises()
    expect(get).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="theme-primary"]').exists()).toBe(true)
  })

  it('保存失败 → 红字可见不静默', async () => {
    const { api, put } = mockApi(undefined)
    put.mockRejectedValue(new Error('仅管理员可修改应用配置'))
    const wrapper = mount(ThemePanel, { props: { api } })
    await flushPromises()

    await wrapper.find('[data-testid="theme-primary"]').setValue('#2b6de8')
    await wrapper.find('[data-testid="theme-save"]').trigger('click')
    await flushPromises()

    expect(text(wrapper, 'theme-error')).toContain('管理员')
  })
})
