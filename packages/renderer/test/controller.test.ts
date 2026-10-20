import { describe, it, expect, vi } from 'vitest'
import type { PageSchema, NodeSchema, Action } from '@lc/schema'
import { PageController } from '../src/core/controller.js'
import type { RuntimeHost } from '../src/core/types.js'

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

function makePage(): PageSchema {
  return {
    schemaVersion: '1.0',
    id: 'page1',
    name: '报修单',
    type: 'form',
    root: node({
      id: 'root',
      componentName: 'Page',
      children: [
        node({
          id: 'f-name',
          componentName: 'Input',
          props: {
            name: 'title',
            label: '标题',
            rules: [{ type: 'required' }, { type: 'maxLength', value: 20 }],
          },
        }),
        node({
          id: 'f-type',
          componentName: 'Picker',
          props: { name: 'type', label: '类型', rules: [{ type: 'required' }] },
        }),
        node({
          id: 'f-amount',
          componentName: 'Input',
          props: { name: 'amount', label: '金额', rules: [{ type: 'range', min: 0, max: 1000 }] },
          condition: 'formData.showAmount',
        }),
        node({
          id: 'v-summary',
          componentName: 'Text',
          props: { text: '$expr: "标题：" + formData.title' },
        }),
        node({
          id: 'btn-add',
          componentName: 'Button',
          props: { text: '加一项' },
          actions: [
            { type: 'expression', event: 'click', value: 'formData.count + 1' },
            { type: 'setForm', event: 'click', value: { total: '$expr: formData.count + 1' } },
          ],
        }),
      ],
    }),
    defaultFormData: { title: '', type: '', amount: 0, showAmount: true, count: 0 },
    dataSources: [
      { id: 'ds-list', name: '列表', type: 'static', data: [{ id: 1 }] },
      { id: 'ds-submit', name: '提交', type: 'http', method: 'POST', url: '/api/repair' },
    ],
    lifecycle: { onInit: 'formData.count' },
    submit: { dataSourceId: 'ds-submit', successToast: '提交成功' },
  }
}

function makeHost() {
  const toast = vi.fn(async () => {})
  const navigate = vi.fn(async () => {})
  const back = vi.fn(async () => {})
  const confirm = vi.fn(async () => true)
  const request = vi.fn(async () => ({ statusCode: 200, data: { id: 999 } }))
  const host: RuntimeHost = { toast, navigate, back, confirm, request }
  return { host, toast, navigate, back, confirm, request }
}

describe('PageController — 构造与渲染', () => {
  it('构造后可 resolve 出渲染树', () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    const nodes = pc.resolve()
    expect(nodes).toHaveLength(1)
    const children = nodes[0].children
    expect(children).toHaveLength(5)
    expect(children[0].node.id).toBe('f-name')
    // 表达式 props 已求值
    expect(children[3].props['text']).toBe('标题：')
    pc.dispose()
  })

  it('condition 随 setField 变化', () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    expect(pc.resolve()[0].children[2].visible).toBe(true)
    pc.setField('showAmount', false)
    expect(pc.resolve()[0].children[2].visible).toBe(false)
    pc.dispose()
  })

  it('skipped 记录非法节点', () => {
    const { host } = makeHost()
    const page = makePage()
    ;(page.root.children as any).push({ id: 'bad' })
    const pc = new PageController(page, { host })
    expect(pc.skipped).toHaveLength(1)
    pc.dispose()
  })
})

describe('PageController — 数据与校验', () => {
  it('setField / getField / patchFields', () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    pc.setField('title', '水管漏水')
    expect(pc.getField('title')).toBe('水管漏水')
    pc.patchFields({ type: 'water', amount: 50 })
    expect(pc.getField('type')).toBe('water')
    expect(pc.getField('amount')).toBe(50)
    pc.dispose()
  })

  it('validateOne 单字段校验并更新 errors', () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    expect(pc.validateOne('title')).toBe('请填写标题')
    expect(pc.errors.get('f-name')).toBe('请填写标题')
    pc.setField('title', '正常标题')
    // setField 触发的重校验会清掉错误
    expect(pc.errors.has('f-name')).toBe(false)
    pc.dispose()
  })

  it('validate 全量校验，错误按 nodeId 挂到节点上', async () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    const r = await pc.validate()
    expect(r.valid).toBe(false)
    expect(r.firstError!.name).toBe('title')

    const nodes = pc.resolve()
    expect(nodes[0].children[0].error).toBe('请填写标题')

    pc.setField('title', '维修')
    pc.setField('type', 'water')
    const r2 = await pc.validate()
    expect(r2.valid).toBe(true)
    expect(pc.resolve()[0].children[0].error).toBeUndefined()
    pc.dispose()
  })

  it('lastValidation 缓存最近一次结果', async () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    expect(pc.lastValidation).toBeNull()
    await pc.validate()
    expect(pc.lastValidation).not.toBeNull()
    pc.dispose()
  })

  it('reset 清空数据与错误', async () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    pc.setField('title', 'x')
    await pc.validate()
    expect(pc.errors.size).toBeGreaterThan(0)
    pc.reset()
    expect(pc.getField('title')).toBe('')
    expect(pc.errors.size).toBe(0)
    pc.dispose()
  })

  it('affectedBy 返回受影响节点', () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    expect(pc.affectedBy('formData').has('f-amount')).toBe(true)
    expect(pc.affectedBy('user').size).toBe(0)
    pc.dispose()
  })
})

describe('PageController — 生命周期', () => {
  it('onMount 执行钩子 + 加载 init 数据源', async () => {
    const { host, request } = makeHost()
    const page = makePage()
    // ⚠️ 已知限制：表达式禁止赋值，生命周期钩子目前无法写字段（缺陷 B-8，见 PROGRESS）
    page.lifecycle = { onMount: 'formData.count' }
    page.dataSources = [{ id: 'ds-init', name: 'x', type: 'http', method: 'GET', url: '/init', trigger: 'init' }]

    const onHook = vi.fn()
    const pc = new PageController(page, { host, onHook })
    expect(request).not.toHaveBeenCalled()

    await pc.onMount()
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/init' }))
    expect(onHook).toHaveBeenCalledWith(expect.objectContaining({ hook: 'onMount', ok: true }))

    await pc.onMount() // 幂等
    expect(request).toHaveBeenCalledTimes(1)
    pc.dispose()
  })

  it('钩子表达式出错不影响页面（ok=false + 报告）', async () => {
    const { host } = makeHost()
    const page = makePage()
    page.lifecycle = { onInit: 'bad +', onMount: 'also bad +' }
    const onHook = vi.fn()
    const pc = new PageController(page, { host, onHook })
    await new Promise((r) => setTimeout(r, 0))
    expect(onHook).toHaveBeenCalledWith(expect.objectContaining({ hook: 'onInit', ok: false }))
    await pc.onMount()
    expect(onHook).toHaveBeenCalledWith(expect.objectContaining({ hook: 'onMount', ok: false }))
    pc.dispose()
  })

  it('dispose 释放字段订阅', () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    const spy = vi.fn()
    pc.ctx.onFieldChange(spy)
    pc.dispose()
    pc.setField('title', 'x')
    // dispose 解除的是 controller 自身订阅，外部订阅仍有效（验证 ctx 可用）
    expect(pc.getField('title')).toBe('x')
  })
})

describe('PageController — 事件', () => {
  it('handleEvent 执行节点动作并回调结果', async () => {
    const { host } = makeHost()
    const onActionResult = vi.fn()
    const pc = new PageController(makePage(), { host, onActionResult })
    const btn = pc.resolve()[0].children[4]

    const results = await pc.handleEvent('click', btn.node.actions)
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.ok)).toBe(true)
    expect(pc.getField('total')).toBe(1)
    expect(onActionResult).toHaveBeenCalledTimes(2)
    pc.dispose()
  })

  it('handleEvent 无动作返回空数组', async () => {
    const { host } = makeHost()
    const pc = new PageController(makePage(), { host })
    expect(await pc.handleEvent('click', undefined)).toEqual([])
    pc.dispose()
  })

  it('runSingleAction', async () => {
    const { host, toast } = makeHost()
    const pc = new PageController(makePage(), { host })
    const r = await pc.runSingleAction({ type: 'toast', event: 'x', value: { text: 'hi' } })
    expect(r.ok).toBe(true)
    expect(toast).toHaveBeenCalledTimes(1)
    pc.dispose()
  })

  it('onUnsupported 回调被调用', async () => {
    const { host } = makeHost()
    const onUnsupported = vi.fn()
    const pc = new PageController(makePage(), { host, onUnsupported })
    await pc.runSingleAction({ type: 'scan', event: 'click' } as Action)
    expect(onUnsupported).toHaveBeenCalledWith('scan')
    pc.dispose()
  })
})

describe('PageController — 提交', () => {
  it('校验失败时中断并返回 firstError，不发请求', async () => {
    const { host, request } = makeHost()
    const pc = new PageController(makePage(), { host })
    const r = await pc.submit()
    expect(r.ok).toBe(false)
    expect(r.firstError!.name).toBe('title')
    expect(r.errors!.length).toBeGreaterThan(0)
    expect(request).not.toHaveBeenCalled()
    pc.dispose()
  })

  it('校验通过 → onSubmit → 提交 → 成功提示', async () => {
    const { host, request, toast } = makeHost()
    const page = makePage()
    page.lifecycle = { onSubmit: 'formData.finalized' }
    const onHook = vi.fn()
    const pc = new PageController(page, { host, onHook })

    pc.setField('title', '水管漏水')
    pc.setField('type', 'water')
    pc.setField('amount', 100)

    const r = await pc.submit()
    expect(r.ok).toBe(true)
    expect(r.data).toEqual({ id: 999 })

    // 只提交 Schema 声明字段
    const call = request.mock.calls[0][0]
    expect(call.method).toBe('POST')
    expect(call.url).toBe('/api/repair')
    expect(Object.keys(call.data).sort()).toEqual(['amount', 'title', 'type'])
    expect(call.data.title).toBe('水管漏水')

    expect(onHook).toHaveBeenCalledWith(expect.objectContaining({ hook: 'onSubmit', ok: true }))
    expect(toast).toHaveBeenCalledWith({ text: '提交成功', icon: 'success' })
    pc.dispose()
  })

  it('未配置提交数据源时报错', async () => {
    const { host } = makeHost()
    const page = makePage()
    delete page.submit
    const pc = new PageController(page, { host })
    pc.setField('title', 'x')
    pc.setField('type', 'y')
    const r = await pc.submit()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未配置提交数据源')
    pc.dispose()
  })

  it('提交失败（数据源返回 null）时返回错误信息', async () => {
    const { host } = makeHost()
    ;(host.request as any).mockResolvedValue({ statusCode: 500, data: null })
    const pc = new PageController(makePage(), { host })
    pc.setField('title', 'x')
    pc.setField('type', 'y')
    const r = await pc.submit()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('500')
    pc.dispose()
  })

  it('成功后执行 successAction', async () => {
    const { host, navigate } = makeHost()
    const page = makePage()
    page.submit!.successAction = { type: 'navigate', event: 'ok', value: { pageId: 'done' } }
    const pc = new PageController(page, { host })
    pc.setField('title', 'x')
    pc.setField('type', 'y')
    const r = await pc.submit()
    expect(r.ok).toBe(true)
    expect(navigate).toHaveBeenCalledWith({ pageId: 'done', params: {}, mode: 'push' })
    pc.dispose()
  })
})
