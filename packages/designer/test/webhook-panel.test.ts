/** WebhookPanel：订阅列表、创建一次性密钥、ETag 写回、删除二次确认。 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WebhookPanel from '../src/panel/WebhookPanel.vue'
import type { WebhookApi, WebhookSubscription } from '../src/panel/webhook-types'

function subscription(overrides: Partial<WebhookSubscription> = {}): WebhookSubscription {
  return {
    id: 'wh1',
    name: '订单同步',
    url: 'https://example.com/hook',
    events: ['*'],
    headers: { Authorization: 'Bearer x' },
    rateLimitPerMinute: 0,
    active: true,
    maxAttempts: 5,
    timeoutMs: 10000,
    revision: 3,
    secretPreview: 'abcd…wxyz',
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    ...overrides,
  }
}

function mockApi(initial: WebhookSubscription) {
  const list = vi.fn().mockResolvedValue({ items: [initial] })
  const create = vi.fn().mockResolvedValue({
    data: subscription({ id: 'wh2', name: '新订阅', revision: 1 }),
    secret: 'plain-secret-once',
    etag: '"webhook:wh2:1"',
  })
  const update = vi.fn().mockResolvedValue({ data: subscription({ name: '改名' }), etag: '"webhook:wh1:4"' })
  const remove = vi.fn().mockResolvedValue(undefined)
  const rotate = vi.fn().mockResolvedValue({
    data: subscription({ revision: 4 }),
    secret: 'rotated-secret-once',
  })
  const test = vi.fn().mockResolvedValue({
    data: {
      id: 'd1',
      status: 'success',
      responseStatus: 200,
      attempts: [{ attempt: 1, at: '2026-10-23T00:00:00.000Z', ok: true, status: 200, durationMs: 12 }],
      attemptCount: 1,
    },
    etag: '"webhook-delivery:d1:1"',
  })
  const deliveries = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, size: 10 })
  const metrics = vi.fn().mockResolvedValue({
    total: 1,
    pending: 0,
    success: 1,
    failed: 0,
    last24hTotal: 1,
    last24hSuccess: 1,
    last24hFailed: 0,
    generatedAt: '2026-10-23T00:00:00.000Z',
    failureRate: 0,
    thresholds: { failureRate: 0.2, queueDepth: 100, pendingAgeMs: 900000 },
    alerts: [],
    ok: true,
  })
  const cleanup = vi.fn().mockResolvedValue({ archived: 2 })
  const api: WebhookApi = {
    list,
    create,
    update,
    remove,
    rotate,
    test,
    deliveries,
    metrics,
    cleanup,
  }
  return { api, list, create, update, remove, rotate, test, deliveries, metrics, cleanup }
}

function panel(api: WebhookApi) {
  return mount(WebhookPanel, { props: { api } })
}

describe('WebhookPanel', () => {
  it('挂载拉列表与指标；新建后一次性密钥必须可见', async () => {
    const m = mockApi(subscription())
    const wrapper = panel(m.api)
    await flushPromises()

    expect(m.list).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('订单同步')
    expect(wrapper.find('[data-testid="webhook-metrics"]').text()).toContain('正常')

    await wrapper.find('[data-testid="webhook-new"]').trigger('click')
    await wrapper.find('[data-testid="webhook-name"]').setValue('新订阅')
    await wrapper.find('[data-testid="webhook-url"]').setValue('https://example.com/new')
    await wrapper.find('.wh-form').trigger('submit')
    await flushPromises()

    expect(m.create).toHaveBeenCalledTimes(1)
    const payload = m.create.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ name: '新订阅', events: ['*'], rateLimitPerMinute: 0 })
    expect(wrapper.find('[data-testid="webhook-secret"]').text()).toContain('plain-secret-once')
  })

  it('编辑写回 If-Match；删除需要二次确认', async () => {
    const m = mockApi(subscription())
    const wrapper = panel(m.api)
    await flushPromises()

    await wrapper.find('[data-testid="webhook-item-wh1"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="webhook-name"]').setValue('改名')
    await wrapper.find('.wh-form').trigger('submit')
    await flushPromises()

    expect(m.update).toHaveBeenCalledTimes(1)
    expect(m.update.mock.calls[0][2]).toBe('"webhook:wh1:3"')

    await wrapper.find('[data-testid="webhook-delete"]').trigger('click')
    expect(m.remove).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="webhook-delete"]').text()).toContain('确认删除')
    await wrapper.find('[data-testid="webhook-delete"]').trigger('click')
    await flushPromises()
    expect(m.remove).toHaveBeenCalledTimes(1)
    expect(m.remove.mock.calls[0][1]).toBe('"webhook:wh1:3"')
  })

  it('轮换密钥后展示新密钥；非法请求头不发请求', async () => {
    const m = mockApi(subscription())
    const wrapper = panel(m.api)
    await flushPromises()

    await wrapper.find('[data-testid="webhook-item-wh1"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="webhook-rotate"]').trigger('click')
    await flushPromises()
    expect(m.rotate).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="webhook-secret"]').text()).toContain('rotated-secret-once')

    await wrapper.find('[data-testid="webhook-headers"]').setValue('{bad')
    await wrapper.find('.wh-form').trigger('submit')
    await flushPromises()
    expect(m.update).toHaveBeenCalledTimes(0)
    expect(wrapper.find('[data-testid="webhook-error"]').text()).toContain('JSON')
  })
})
