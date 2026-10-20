/**
 * 批 3 D-P3-7 —— 表单草稿：controller 只管时机（变更存 / mount 恢复 / 提交·重置清），
 * 存储介质归宿主（DraftStore 注入）；未注入 = 全链禁用零副作用。
 */
import { describe, it, expect, vi } from 'vitest'
import type { PageSchema, NodeSchema } from '@lc/schema'
import { PageController } from '../src/core/controller.js'
import type { RuntimeHost, DraftStore } from '../src/core/types.js'

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

function makePage(): PageSchema {
  return {
    schemaVersion: '1.0',
    id: 'page-draft',
    name: '请假申请',
    type: 'form',
    root: node({
      id: 'root',
      componentName: 'Page',
      children: [
        node({ id: 'f-reason', componentName: 'Input', props: { name: 'reason', label: '事由' } }),
        node({ id: 'f-days', componentName: 'Input', props: { name: 'days', label: '天数' } }),
      ],
    }),
    defaultFormData: { reason: '', days: '' },
    dataSources: [{ id: 'ds-submit', name: '提交', type: 'http', method: 'POST', url: '/api/leave' }],
    submit: { dataSourceId: 'ds-submit', successToast: '提交成功' },
  }
}

function makeHost(confirmResult = true) {
  const toast = vi.fn(async () => {})
  const navigate = vi.fn(async () => {})
  const back = vi.fn(async () => {})
  const confirm = vi.fn(async () => confirmResult)
  const request = vi.fn(async () => ({ statusCode: 200, data: { id: 1 } }))
  const host: RuntimeHost = { toast, navigate, back, confirm, request }
  return { host, confirm, request }
}

/** 内存 DraftStore：load/save/clear 全 spy，data 为真实载体 */
function makeDraft(initial: Record<string, unknown> | null = null) {
  const store = {
    data: initial as Record<string, unknown> | null,
    load: vi.fn(() => store.data),
    save: vi.fn((d: Record<string, unknown>) => {
      store.data = d
    }),
    clear: vi.fn(() => {
      store.data = null
    }),
  }
  const draft: DraftStore = store
  return { draft, store }
}

describe('表单草稿 —— D-P3-7', () => {
  it('未注入 draft：变更 / 提交全链无异常且零副作用', async () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    pc.setField('reason', '事假')
    await pc.onMount()
    expect(pc.getField('reason')).toBe('事假')
    const r = await pc.submit()
    expect(r.ok).toBe(true)
    pc.dispose()
  })

  it('字段变更触发 save，快照仅含 Schema 声明字段', async () => {
    const { host } = makeHost()
    const { draft, store } = makeDraft()
    const pc = new PageController(makePage(), { host, draft })
    pc.setField('reason', '病假')
    pc.setField('days', '3')
    expect(store.save).toHaveBeenCalled()
    expect(store.data).toEqual({ reason: '病假', days: '3' })
    pc.dispose()
  })

  it('表单删光 → 草稿清（不留空草稿）', async () => {
    const { host } = makeHost()
    const { draft, store } = makeDraft({ reason: '病假', days: '3' })
    const pc = new PageController(makePage(), { host, draft })
    pc.setField('reason', '')
    pc.setField('days', '')
    expect(store.clear).toHaveBeenCalled()
    expect(store.data).toBeNull()
    pc.dispose()
  })

  it('onMount 有草稿 + 确认 → 回填', async () => {
    const { host, confirm } = makeHost(true)
    const { draft, store } = makeDraft({ reason: '年假', days: '2' })
    const pc = new PageController(makePage(), { host, draft })
    await pc.onMount()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(String(confirm.mock.calls[0][0].text)).toContain('草稿')
    expect(pc.getField('reason')).toBe('年假')
    expect(pc.getField('days')).toBe('2')
    expect(store.clear).not.toHaveBeenCalled()
    pc.dispose()
  })

  it('拒绝恢复 → 丢弃（clear），表单保持默认值', async () => {
    const { host } = makeHost(false)
    const { draft, store } = makeDraft({ reason: '年假', days: '2' })
    const pc = new PageController(makePage(), { host, draft })
    await pc.onMount()
    expect(store.clear).toHaveBeenCalled()
    expect(pc.getField('reason')).toBe('')
    pc.dispose()
  })

  it('无草稿 / 空草稿 → 不弹确认', async () => {
    const { host, confirm } = makeHost(true)
    const { draft } = makeDraft(null)
    const pc = new PageController(makePage(), { host, draft })
    await pc.onMount()
    expect(confirm).not.toHaveBeenCalled()
    pc.dispose()
  })

  it('提交成功 → 草稿清', async () => {
    const { host } = makeHost(true)
    const { draft, store } = makeDraft({ reason: '病假', days: '3' })
    const pc = new PageController(makePage(), { host, draft })
    await pc.onMount()
    store.clear.mockClear()
    pc.setField('reason', '病假')
    const r = await pc.submit()
    expect(r.ok).toBe(true)
    expect(store.clear).toHaveBeenCalled()
    pc.dispose()
  })

  it('reset → 草稿清（重置即放弃）', async () => {
    const { host } = makeHost(true)
    const { draft, store } = makeDraft({ reason: '病假', days: '3' })
    const pc = new PageController(makePage(), { host, draft })
    pc.reset()
    expect(store.clear).toHaveBeenCalled()
    pc.dispose()
  })

  it('load 抛错不阻断挂载（草稿是体验增强，失败只上报）', async () => {
    const { host } = makeHost(true)
    const onExprError = vi.fn()
    const draft: DraftStore = {
      load: () => {
        throw new Error('storage broken')
      },
      save: () => {},
      clear: () => {},
    }
    const pc = new PageController(makePage(), { host, draft, onExprError })
    await expect(pc.onMount()).resolves.toBeUndefined()
    expect(onExprError).toHaveBeenCalled()
    pc.dispose()
  })
})
