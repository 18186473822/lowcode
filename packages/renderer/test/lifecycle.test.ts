import { describe, it, expect, vi } from 'vitest'
import type { PageSchema, NodeSchema } from '@lc/schema'
import { evalExpr } from '@lc/expression'
import {
  createAppApi,
  createLifecycleScope,
  runHook,
  runHooks,
  normalizeHook,
  type LifecycleDeps,
} from '../src/core/lifecycle.js'
import { createPageContext, type PageContext } from '../src/core/context.js'
import { DataSourceRunner } from '../src/core/datasource.js'
import { PageController } from '../src/core/controller.js'
import { resolveTree } from '../src/core/resolve.js'
import { buildTree } from '../src/core/build.js'
import type { RuntimeHost } from '../src/core/types.js'

function makeHost() {
  const toast = vi.fn(async () => {})
  const navigate = vi.fn(async () => {})
  const back = vi.fn(async () => {})
  const confirm = vi.fn(async () => true)
  const request = vi.fn(async () => ({ statusCode: 200, data: { rows: [1] } }))
  const host: RuntimeHost = { toast, navigate, back, confirm, request }
  return { host, toast, navigate, back, confirm, request }
}

function makeDeps(form: Record<string, unknown> = {}) {
  const ctx = createPageContext({ defaultFormData: form })
  const { host, toast, navigate, back, confirm, request } = makeHost()
  const ds = new DataSourceRunner(
    { ctx, host },
    [{ id: 'ds_dept', name: '部门', type: 'http', method: 'GET', url: '/depts' }],
  )
  const deps: LifecycleDeps = { ctx, host, ds }
  return { ctx, host, ds, deps, toast, navigate, back, confirm, request }
}

/* ------------------------------------------------------------------ */
/* app.* API                                                            */
/* ------------------------------------------------------------------ */

describe('createAppApi —— app.setFormData / getFormData / setAppData', () => {
  it('setFormData 一次写多个字段（经 patch，只触发一次联动）', () => {
    const { ctx, deps } = makeDeps({ a: 1 })
    const app = createAppApi(deps)
    const notify = vi.fn()
    ctx.onFieldChange(notify)

    app.setFormData({ a: 2, b: 'x' })

    expect(ctx.get('a')).toBe(2)
    expect(ctx.get('b')).toBe('x')
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('setFormData 非对象入参被忽略（防脏数据）', () => {
    const { ctx, deps } = makeDeps({ a: 1 })
    const app = createAppApi(deps)
    app.setFormData(null as unknown as Record<string, unknown>)
    app.setFormData('oops' as unknown as Record<string, unknown>)
    expect(ctx.get('a')).toBe(1)
  })

  it('setFormData 支持方案 3.1 的双参写法', () => {
    const { ctx, deps } = makeDeps({ name: '赵六' })
    const app = createAppApi(deps)
    // 方案 3.1 原文示例：app.setFormData('applicant', user.name)
    app.setFormData('applicant', ctx.get('name'))
    expect(ctx.get('applicant')).toBe('赵六')

    app.setAppData('orgId', 'O9')
    expect(ctx.data.appData).toMatchObject({ orgId: 'O9' })
  })

  it('双参写法的 key 为空 / 对象写法的数组入参被忽略', () => {
    const { ctx, deps } = makeDeps({ a: 1 })
    const app = createAppApi(deps)
    app.setFormData('', 9)
    app.setFormData([1, 2] as unknown as Record<string, unknown>)
    expect(ctx.get('a')).toBe(1)
    expect(ctx.data.formData).toEqual({ a: 1 })
  })

  it('getFormData 支持路径读取', () => {
    const { deps } = makeDeps({ user: { name: '张三' } })
    expect(createAppApi(deps).getFormData('user.name')).toBe('张三')
    expect(createAppApi(deps).getFormData('nope')).toBeUndefined()
  })

  it('setAppData 写入应用级共享数据', () => {
    const { ctx, deps } = makeDeps()
    createAppApi(deps).setAppData({ orgId: 'O1' })
    expect(ctx.data.appData).toMatchObject({ orgId: 'O1' })
  })

  it('setAppData 非对象入参被忽略', () => {
    const { ctx, deps } = makeDeps()
    createAppApi(deps).setAppData(42 as unknown as Record<string, unknown>)
    expect(ctx.data.appData).toEqual({})
  })
})

describe('createAppApi —— 宿主副作用代理', () => {
  it('toast 默认 icon=none，可指定', async () => {
    const { deps, toast } = makeDeps()
    const app = createAppApi(deps)
    await app.toast('你好')
    await app.toast('成功', 'success')
    expect(toast).toHaveBeenNthCalledWith(1, { text: '你好', icon: 'none' })
    expect(toast).toHaveBeenNthCalledWith(2, { text: '成功', icon: 'success' })
  })

  it('navigate 默认 push，参数可省略', async () => {
    const { deps, navigate } = makeDeps()
    await createAppApi(deps).navigate('p2', { from: 'a' })
    expect(navigate).toHaveBeenCalledWith({ pageId: 'p2', params: { from: 'a' }, mode: 'push' })

    await createAppApi(deps).navigate('p3')
    expect(navigate).toHaveBeenLastCalledWith({ pageId: 'p3', params: {}, mode: 'push' })
  })

  it('back / confirm 透传到宿主', async () => {
    const { deps, back, confirm } = makeDeps()
    await createAppApi(deps).back()
    expect(back).toHaveBeenCalledTimes(1)
    expect(await createAppApi(deps).confirm('删除？')).toBe(true)
    expect(confirm).toHaveBeenCalledWith({ text: '删除？' })
  })

  it('loadDs 触发数据源引擎取数', async () => {
    const { deps, request } = makeDeps()
    const data = await createAppApi(deps).loadDs('ds_dept')
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/depts' }))
    expect(data).toEqual({ rows: [1] })
  })
})

/* ------------------------------------------------------------------ */
/* 作用域与安全                                                          */
/* ------------------------------------------------------------------ */

describe('createLifecycleScope —— 注入与安全边界', () => {
  it('注入后 app 可用，且作用域数据原样保留', () => {
    const { ctx, deps } = makeDeps({ n: 1 })
    const scope = createLifecycleScope(ctx.scope, deps)
    expect((scope as any).formData.n).toBe(1)
    expect(typeof (scope as any).app.setFormData).toBe('function')
  })

  it('app 被 markTrusted：允许调用自己的方法', () => {
    const { ctx, deps } = makeDeps()
    const scope = createLifecycleScope(ctx.scope, deps)
    expect(evalExpr("app.setFormData({ a: 5 })", scope)).toBeUndefined()
    expect(ctx.get('a')).toBe(5)
  })

  it('受信对象仍受 FORBIDDEN_KEYS 拦截（原型链攻击不放行）', () => {
    const { deps } = makeDeps()
    const scope = createLifecycleScope(createPageContext().scope, deps)
    // constructor / call / apply / bind 属禁用键，即便对象受信也拒绝
    expect(() => evalExpr('app.constructor', scope)).toThrow()
    expect(() => evalExpr('app.call(1)', scope)).toThrow()
    expect(() => evalExpr('app.bind(1)', scope)).toThrow()
  })

  it('app 上不存在的方法报「不允许/不是可调用的函数」', () => {
    const { deps } = makeDeps()
    const scope = createLifecycleScope(createPageContext().scope, deps)
    expect(() => evalExpr('app.deleteEverything()', scope)).toThrow()
  })

  it('对象受信不等于任意对象受信：普通对象方法仍走白名单', () => {
    const { ctx, deps } = makeDeps({ o: { a: 1 } })
    const scope = createLifecycleScope(ctx.scope, deps)
    // hasOwnProperty 不在数组/对象方法白名单 → 应被拒
    expect(() => evalExpr('formData.hasOwnProperty("n")', scope)).toThrow()
  })
})

/* ------------------------------------------------------------------ */
/* runHook                                                              */
/* ------------------------------------------------------------------ */

describe('runHook —— 执行与报告', () => {
  it('空表达式跳过并上报 ok', async () => {
    const report = vi.fn()
    expect(await runHook('onInit', undefined, createPageContext().scope, report)).toEqual([
      { hook: 'onInit', ok: true },
    ])
    expect(await runHook('onInit', '   ', createPageContext().scope)).toHaveLength(1)
    expect(report).toHaveBeenCalledWith({ hook: 'onInit', ok: true })
  })

  it('单表达式成功执行并写表单', async () => {
    const { ctx, deps } = makeDeps({ name: '李四' })
    const scope = createLifecycleScope(ctx.scope, deps)
    const report = vi.fn()

    const results = await runHook('onInit', 'app.setFormData({ applicant: formData.name })', scope, report)

    expect(ctx.get('applicant')).toBe('李四')
    expect(results).toEqual([{ hook: 'onInit', ok: true, step: undefined }])
    expect(report).toHaveBeenCalledWith({ hook: 'onInit', ok: true, step: undefined })
  })

  it('数组按序执行，每步带 step 序号', async () => {
    const { ctx, deps, toast } = makeDeps()
    const scope = createLifecycleScope(ctx.scope, deps)
    const report = vi.fn()

    const results = await runHook(
      'onMount',
      ['app.setFormData({ a: 1 })', 'app.setAppData({ b: 2 })', "app.toast('就绪')"],
      scope,
      report,
    )

    expect(ctx.get('a')).toBe(1)
    expect(ctx.data.appData).toMatchObject({ b: 2 })
    expect(toast).toHaveBeenCalledWith({ text: '就绪', icon: 'none' })
    expect(results.map((r) => r.step)).toEqual([0, 1, 2])
    expect(results.every((r) => r.ok)).toBe(true)
    expect(report).toHaveBeenCalledTimes(3)
  })

  it('单步失败不中断后续步骤，失败项带错误信息', async () => {
    const { ctx, deps, toast } = makeDeps()
    const scope = createLifecycleScope(ctx.scope, deps)

    const results = await runHook('onInit', ['app.nope(1)', 'app.setFormData({ ok: 1 })'], scope)

    expect(results[0].ok).toBe(false)
    expect(results[0].error).toBeTruthy()
    expect(results[0].step).toBe(0)
    expect(results[1].ok).toBe(true)
    expect(ctx.get('ok')).toBe(1)
    expect(toast).not.toHaveBeenCalled()
  })

  it('异步副作用作为钩子顶层调用会被 await', async () => {
    const { ctx, deps, request, ds } = makeDeps()
    const scope = createLifecycleScope(ctx.scope, deps)

    await runHook('onMount', "app.loadDs('ds_dept')", scope)

    expect(request).toHaveBeenCalledTimes(1)
    // 钩子必须等待取数完成：state 已是 success（否则为 loading 说明没 await）
    expect(ds.get('ds_dept').status).toBe('success')
    expect(ctx.data.ds).toEqual({}) // ds.* 是纯数据视图，状态由 runner 管理
  })

  it('runHooks 顺序执行多组钩子', async () => {
    const { ctx, deps } = makeDeps()
    const scope = createLifecycleScope(ctx.scope, deps)
    const results = await runHooks(
      [
        ['onInit', 'app.setFormData({ x: 1 })'],
        ['onSubmit', 'app.setFormData({ y: 2 })'],
      ],
      scope,
    )
    expect(results).toHaveLength(2)
    expect(ctx.get('x')).toBe(1)
    expect(ctx.get('y')).toBe(2)
  })

  it('normalizeHook 过滤空值', () => {
    expect(normalizeHook(undefined)).toEqual([])
    expect(normalizeHook(null)).toEqual([])
    expect(normalizeHook('')).toEqual([])
    expect(normalizeHook('  ')).toEqual([])
    expect(normalizeHook(['a', '', ' b '])).toEqual(['a', ' b '])
    expect(normalizeHook('x')).toEqual(['x'])
  })
})

/* ------------------------------------------------------------------ */
/* 负向测试：渲染期表达式拿不到 app                                      */
/* ------------------------------------------------------------------ */

describe('安全边界 —— 渲染期表达式无 app', () => {
  function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
    return p as NodeSchema
  }

  it('condition 中调用 app.toast 不会触达宿主（副作用被隔离在生命周期）', () => {
    const { ctx, deps, toast } = makeDeps({ flag: true })
    const tree = buildTree(
      node({
        id: 'root',
        componentName: 'Page',
        children: [node({ id: 'x', componentName: 'Text', condition: "app.toast('boom')", children: [] })],
      }),
    )
    // 渲染期用的是 ctx.scope（不含 app），而不是 lifecycleScope
    const out = resolveTree(tree, { scope: ctx.scope })

    // 核心安全属性：宿主从未被调用
    expect(toast).not.toHaveBeenCalled()
    // 语义：未知标识符 → undefined（引擎既有设计，不抛错）→ condition falsy → 节点隐藏
    expect(out[0].children[0].visible).toBe(false)
    expect(out[0].children[0].exprError).toBeFalsy()
    expect(deps.ctx).toBe(ctx)
  })

  it('props 中引用 app 同样取不到值', () => {
    const { ctx, toast } = makeDeps()
    const tree = buildTree(
      node({ id: 'root', componentName: 'Page', children: [node({ id: 'p', componentName: 'Text', props: { t: '$expr: app.toast("x")' }, children: [] })] }),
    )
    const out = resolveTree(tree, { scope: ctx.scope })
    expect(out[0].children[0].props['t']).toBeUndefined()
    expect(toast).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ */
/* 与 PageController 集成                                               */
/* ------------------------------------------------------------------ */

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

function pageWith(lifecycle: PageSchema['lifecycle']): PageSchema {
  return {
    schemaVersion: '1.0',
    id: 'p_lc',
    name: '钩子页',
    type: 'form',
    root: node({ id: 'root', componentName: 'Page', children: [] }),
    defaultFormData: { name: '王五' },
    lifecycle,
    dataSources: [{ id: 'ds_x', name: 'x', type: 'http', method: 'GET', url: '/x' }],
  }
}

describe('PageController 集成 —— 生命周期通过 app 写能力', () => {
  it('onInit（数组形式）在构造时执行并写入默认值', async () => {
    const { host } = makeHost()
    const pc = new PageController(
      pageWith({ onInit: ["app.setFormData({ applicant: formData.name, org: '总部' })"] }),
      { host },
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(pc.getField('applicant')).toBe('王五')
    expect(pc.getField('org')).toBe('总部')
    pc.dispose()
  })

  it('onMount 里 loadDs 触发取数', async () => {
    const { host, request } = makeHost()
    const pc = new PageController(pageWith({ onMount: "app.loadDs('ds_x')" }), { host })
    await pc.onMount()
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/x' }))
    pc.dispose()
  })

  it('onSubmit 补默认值发生在 payload 组装之前', async () => {
    const { host, request } = makeHost()
    const page = pageWith({ onSubmit: "app.setFormData({ computed: 'C' })" })
    page.root.children = [node({ id: 'f', componentName: 'Input', props: { name: 'computed' } })]
    page.submit = { dataSourceId: 'ds_submit' }
    page.dataSources!.push({ id: 'ds_submit', name: '提交', type: 'http', method: 'POST', url: '/save' })

    const pc = new PageController(page, { host })
    const r = await pc.submit()
    expect(r.ok).toBe(true)
    expect(request.mock.calls[0][0].data).toMatchObject({ computed: 'C' })
    pc.dispose()
  })

  it('钩子失败只上报不阻断页面（onInit 写坏字段仍可渲染）', async () => {
    const { host } = makeHost()
    const onHook = vi.fn()
    const pc = new PageController(pageWith({ onInit: 'app.bogus(1)' }), { host, onHook })
    await new Promise((r) => setTimeout(r, 0))
    expect(onHook).toHaveBeenCalledWith(expect.objectContaining({ hook: 'onInit', ok: false }))
    expect(pc.resolve()).toHaveLength(1)
    pc.dispose()
  })

  it('onHook 上报含 step 序号', async () => {
    const { host } = makeHost()
    const onHook = vi.fn()
    const pc = new PageController(pageWith({ onMount: ['bad +', "app.setFormData({ z: 1 })"] }), { host, onHook })
    await pc.onMount()

    // 构造期会先上报一次 onInit（体为空 → ok），故 onMount 的两步是第 2、3 次调用
    const mountCalls = onHook.mock.calls.filter((c) => c[0].hook === 'onMount')
    expect(mountCalls).toHaveLength(2)
    expect(mountCalls[0][0]).toEqual(expect.objectContaining({ ok: false, step: 0 }))
    expect(mountCalls[0][0].error).toBeTruthy()
    expect(mountCalls[1][0]).toEqual(expect.objectContaining({ ok: true, step: 1 }))
    pc.dispose()
  })
})
