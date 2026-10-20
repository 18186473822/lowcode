import { describe, it, expect, vi } from 'vitest'
import type { Action } from '@lc/schema'
import { runAction, runActions, type ActionRuntime } from '../src/core/action.js'
import { createPageContext } from '../src/core/context.js'
import { DataSourceRunner } from '../src/core/datasource.js'
import type { RuntimeHost } from '../src/core/types.js'

function makeRuntime(overrides: Partial<RuntimeHost> = {}) {
  const ctx = createPageContext({ defaultFormData: { n: 3, name: '张三' } })
  const host: RuntimeHost = {
    toast: vi.fn(async () => {}),
    confirm: vi.fn(async () => true),
    navigate: vi.fn(async () => {}),
    back: vi.fn(async () => {}),
    request: vi.fn(async () => ({ statusCode: 200, data: { ok: 1 } })),
    ...overrides,
  }
  const ds = new DataSourceRunner({ ctx, host }, [
    { id: 'ds1', name: 'x', type: 'static', data: [1, 2] },
    { id: 'ds2', name: 'x', type: 'http', method: 'GET', url: '/x' },
  ])
  const rt: ActionRuntime = { ctx, host, ds }
  return { ctx, host, ds, rt }
}

describe('runAction — 无副作用类', () => {
  it('expression：返回求值结果', async () => {
    const { rt } = makeRuntime()
    const r = await runAction({ type: 'expression', event: 'click', value: 'formData.n * 10' }, rt)
    expect(r).toEqual({ type: 'expression', ok: true, value: 30 })
  })

  it('expression 语法错误：返回 ok=false 不抛异常', async () => {
    const { rt } = makeRuntime()
    const r = await runAction({ type: 'expression', event: 'click', value: 'formData.n +' }, rt)
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('setForm：写入表单（含 $expr 占位）', async () => {
    const { rt, ctx } = makeRuntime()
    const action: Action = { type: 'setForm', event: 'click', value: { total: '$expr: formData.n * 2', fixed: 1 } }
    const r = await runAction(action, rt)
    expect(r.ok).toBe(true)
    expect(ctx.get('total')).toBe(6)
    expect(ctx.get('fixed')).toBe(1)
  })

  it('setApp：写入应用数据', async () => {
    const { rt } = makeRuntime()
    await runAction({ type: 'setApp', event: 'click', value: { k: 'v' } }, rt)
    expect(rt.ctx.data.appData).toMatchObject({ k: 'v' })
  })
})

describe('runAction — 宿主副作用类', () => {
  it('toast：模板占位被替换', async () => {
    const { rt, host } = makeRuntime()
    await runAction({ type: 'toast', event: 'click', value: { text: '共 {{formData.n}} 项', icon: 'success' } }, rt)
    expect(host.toast).toHaveBeenCalledWith({ text: '共 3 项', icon: 'success' })
  })

  it('toast 默认 icon=none', async () => {
    const { rt, host } = makeRuntime()
    await runAction({ type: 'toast', event: 'click', value: { text: 'hi' } }, rt)
    expect(host.toast).toHaveBeenCalledWith({ text: 'hi', icon: 'none' })
  })

  it('navigate：参数求值 + mode 默认 push', async () => {
    const { rt, host } = makeRuntime()
    await runAction(
      { type: 'navigate', event: 'click', value: { pageId: 'p2', params: { from: '$expr: formData.name' } } },
      rt,
    )
    expect(host.navigate).toHaveBeenCalledWith({ pageId: 'p2', params: { from: '张三' }, mode: 'push' })
  })

  it('back', async () => {
    const { rt, host } = makeRuntime()
    const r = await runAction({ type: 'back', event: 'click' }, rt)
    expect(r.ok).toBe(true)
    expect(host.back).toHaveBeenCalledTimes(1)
  })

  it('confirm：确认后执行 onOk 子动作', async () => {
    const { rt, host } = makeRuntime()
    const action: Action = {
      type: 'confirm',
      event: 'click',
      value: { text: '确定删除？', onOk: { type: 'toast', event: 'ok', value: { text: '已删除' } } },
    }
    const r = await runAction(action, rt)
    expect(host.confirm).toHaveBeenCalledWith({ text: '确定删除？' })
    expect(host.toast).toHaveBeenCalledWith({ text: '已删除', icon: 'none' })
    expect(r.type).toBe('toast') // 返回子动作结果
  })

  it('confirm：取消时不执行 onOk', async () => {
    const { rt, host } = makeRuntime()
    ;(host.confirm as any).mockResolvedValueOnce(false)
    const r = await runAction(
      { type: 'confirm', event: 'click', value: { text: 'x', onOk: { type: 'toast', event: 'ok', value: { text: 'no' } } } },
      rt,
    )
    expect(r.ok).toBe(false)
    expect(host.toast).not.toHaveBeenCalled()
  })

  it('datasource / http：带参取数', async () => {
    const { rt, ds } = makeRuntime()
    const r = await runAction({ type: 'datasource', event: 'click', value: { dsId: 'ds1', params: { a: 1 } } }, rt)
    expect(r.ok).toBe(true)
    expect(r.value).toEqual([1, 2])
    expect(ds.get('ds1').status).toBe('success')

    const r2 = await runAction({ type: 'http', event: 'click', value: { dsId: 'ds2', params: {} } }, rt)
    expect(r2.ok).toBe(true)
  })

  it('取数失败返回 ok=false 且带错误信息', async () => {
    const { rt } = makeRuntime()
    const r = await runAction({ type: 'datasource', event: 'click', value: { dsId: 'missing' } }, rt)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('取数失败')
  })

  it('submit：无处理器时报错，有处理器时调用', async () => {
    const { rt } = makeRuntime()
    const r = await runAction({ type: 'submit', event: 'click' }, rt)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未配置')

    const onSubmit = vi.fn(async () => {})
    const r2 = await runAction({ type: 'submit', event: 'click' }, { ...rt, onSubmit })
    expect(r2.ok).toBe(true)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('submit：处理器返回失败结果时透传 ok=false 与错误信息（失败不再误报成功）', async () => {
    const { rt } = makeRuntime()
    const onSubmit = vi.fn(async () => ({ ok: false, error: '模型取数失败（400）' }))
    const r = await runAction({ type: 'submit', event: 'click' }, { ...rt, onSubmit })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('模型取数失败（400）')
  })

  it('宿主能力缺失时降级提示（copy / scan / phone / location / dialog）', async () => {
    const { rt, host } = makeRuntime()
    const unsupported = vi.fn()
    const rt2 = { ...rt, onUnsupported: unsupported }

    const cases: Action[] = [
      { type: 'copy', event: 'click', value: { expr: 'x' } },
      { type: 'scan', event: 'click' },
      { type: 'phone', event: 'click', value: { expr: '110' } },
      { type: 'location', event: 'click' },
      { type: 'dialog', event: 'click', value: { template: 't1' } },
    ]
    for (const c of cases) {
      const r = await runAction(c, rt2)
      expect(r.ok).toBe(false)
      expect(r.error).toBe('当前环境不支持该操作')
    }
    expect(unsupported).toHaveBeenCalledTimes(5)
    expect(host.toast).toHaveBeenCalledTimes(5)
  })

  it('宿主能力存在时正常执行', async () => {
    const copy = vi.fn()
    const scan = vi.fn(async () => 'SCAN_OK')
    const callPhone = vi.fn()
    const getLocation = vi.fn(async () => ({ latitude: 1, longitude: 2 }))
    const openDialog = vi.fn()
    const { rt } = makeRuntime({ copy, scan, callPhone, getLocation, openDialog })

    expect((await runAction({ type: 'copy', event: 'click', value: { expr: 'xyz' } }, rt)).ok).toBe(true)
    expect((await runAction({ type: 'scan', event: 'click' }, rt)).value).toBe('SCAN_OK')
    expect((await runAction({ type: 'phone', event: 'click', value: { expr: '110' } }, rt)).ok).toBe(true)
    expect((await runAction({ type: 'location', event: 'click' }, rt)).value).toEqual({ latitude: 1, longitude: 2 })
    expect((await runAction({ type: 'dialog', event: 'click', value: { template: 't1' } }, rt)).ok).toBe(true)
    expect(callPhone).toHaveBeenCalledWith('110')
  })

  it('未知动作类型不抛异常', async () => {
    const { rt } = makeRuntime()
    const r = await runAction({ type: 'unknown', event: 'click' } as unknown as Action, rt)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('不支持')
  })

  it('宿主抛错被 catch，返回 ok=false', async () => {
    const { rt } = makeRuntime({
      navigate: vi.fn(async () => { throw new Error('路由不存在') }),
    })
    const r = await runAction({ type: 'navigate', event: 'click', value: { pageId: 'x' } }, rt)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('路由不存在')
  })
})

describe('runActions', () => {
  it('只执行匹配事件的动作，按顺序', async () => {
    const { rt, host } = makeRuntime()
    const actions: Action[] = [
      { type: 'toast', event: 'click', value: { text: '1' } },
      { type: 'toast', event: 'submit', value: { text: '2' } },
      { type: 'navigate', event: 'click', value: { pageId: 'p' } },
    ]
    const results = await runActions('click', actions, rt)
    expect(results.map((r) => r.type)).toEqual(['toast', 'navigate'])
    expect(host.toast).toHaveBeenCalledTimes(1)
    expect(host.navigate).toHaveBeenCalledTimes(1)
  })

  it('动作失败时中断后续（默认）', async () => {
    const { rt, host } = makeRuntime()
    const actions: Action[] = [
      { type: 'expression', event: 'click', value: 'bad +' },
      { type: 'toast', event: 'click', value: { text: 'never' } },
    ]
    const results = await runActions('click', actions, rt)
    expect(results).toHaveLength(1)
    expect(results[0].ok).toBe(false)
    expect(host.toast).not.toHaveBeenCalled()
  })

  it('continueOnError 时继续执行', async () => {
    const { rt, host } = makeRuntime()
    const actions: Action[] = [
      { type: 'expression', event: 'click', value: 'bad +' },
      { type: 'toast', event: 'click', value: { text: 'after' } },
    ]
    const results = await runActions('click', actions, rt, { continueOnError: true })
    expect(results).toHaveLength(2)
    expect(host.toast).toHaveBeenCalledTimes(1)
  })

  it('无动作 / 空数组返回 []', async () => {
    const { rt } = makeRuntime()
    expect(await runActions('click', undefined, rt)).toEqual([])
    expect(await runActions('click', [], rt)).toEqual([])
  })
})
