import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DataSourceSchema } from '@lc/schema'
import { DataSourceRunner, resolveParams } from '../src/core/datasource.js'
import { createPageContext, type PageContext } from '../src/core/context.js'
import type { HttpResponse, RuntimeHost } from '../src/core/types.js'

function makeHost(): { host: Pick<RuntimeHost, 'request'>; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(async (): Promise<HttpResponse> => ({ statusCode: 200, data: { list: [1, 2] } }))
  return { host: { request: spy as any }, spy }
}

function setup(schemas: DataSourceSchema[], form: Record<string, unknown> = {}) {
  const ctx = createPageContext({ defaultFormData: form })
  const { host, spy } = makeHost()
  const changes: string[] = []
  const runner = new DataSourceRunner(
    { ctx, host, onStateChange: (id) => changes.push(id) },
    schemas,
  )
  return { ctx, host, spy, runner, changes }
}

describe('resolveParams', () => {
  it('递归解析 $expr 占位，override 覆盖', () => {
    const ctx = createPageContext({ defaultFormData: { city: 'BJ', uid: 7 } })
    const out = resolveParams(
      { a: '$expr: formData.city', b: 1, nested: { c: '$expr: formData.uid' }, arr: ['$expr: formData.city'] },
      ctx.scope,
      { b: 2, d: 9 },
    )
    expect(out).toEqual({ a: 'BJ', b: 2, nested: { c: 7 }, arr: ['BJ'], d: 9 })
  })
})

describe('DataSourceRunner', () => {
  it('static 数据源直接返回 data', async () => {
    const { runner } = setup([{ id: 's1', name: '静态', type: 'static', data: [{ id: 1 }], trigger: 'manual' }])
    const data = await runner.load('s1')
    expect(data).toEqual([{ id: 1 }])
    expect(runner.get('s1').status).toBe('success')
    expect(runner.get('s1').loading).toBe(false)
  })

  it('http GET 拼接 query，POST 走 body', async () => {
    const { runner, spy } = setup([
      { id: 'h1', name: '查询', type: 'http', method: 'GET', url: '/api/list', params: { city: '$expr: formData.city' } },
      { id: 'h2', name: '写入', type: 'http', method: 'POST', url: '/api/save', params: { a: 1 } },
    ], { city: 'SH' })

    await runner.load('h1')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: '/api/list?city=SH' }))

    await runner.load('h2')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/api/save', data: { a: 1 } }))
  })

  it('model GET 把 params 拼 query string（filter 对象序列化 JSON），POST 走 body（批 2 修复）', async () => {
    const { runner, spy } = setup([
      {
        id: 'g1',
        name: '查询',
        type: 'model',
        modelId: 'm_e',
        method: 'GET',
        params: { filter: { id: 'r1' }, page: 1 },
      },
    ])
    await runner.load('g1')
    const getCall = spy.mock.calls[0]![0] as { method: string; url: string }
    expect(getCall.method).toBe('GET')
    expect(getCall.url.startsWith('/api/v1/models/m_e/records?')).toBe(true)
    const usp = new URLSearchParams(getCall.url.split('?')[1]!)
    expect(usp.get('filter')).toBe(JSON.stringify({ id: 'r1' }))
    expect(usp.get('page')).toBe('1')

    // POST 既有行为不变：params 走 body，无 query
    const { runner: r2, spy: s2 } = setup([
      { id: 'p1', name: '写入', type: 'model', modelId: 'm_e', method: 'POST', params: { a: 1 } },
    ])
    await r2.load('p1')
    expect(s2).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', url: '/api/v1/models/m_e/records', data: { a: 1 } }),
    )
  })

  it('非 2xx 抛错并置 error 状态，不向上抛异常', async () => {
    const ctx = createPageContext()
    const host = {
      request: vi.fn(async () => ({ statusCode: 500, data: 'boom' })) as any,
    }
    const runner = new DataSourceRunner({ ctx, host }, [{ id: 'e', name: 'x', type: 'http', method: 'GET', url: '/x' }])
    const data = await runner.load('e')
    expect(data).toBeNull()
    const st = runner.get('e')
    expect(st.status).toBe('error')
    expect(st.error).toContain('500')
  })

  it('网络异常也只标记 error', async () => {
    const ctx = createPageContext()
    const host = { request: vi.fn(async () => { throw new Error('网络断开') }) as any }
    const runner = new DataSourceRunner({ ctx, host }, [{ id: 'e', name: 'x', type: 'http', method: 'GET', url: '/x' }])
    expect(await runner.load('e')).toBeNull()
    expect(runner.get('e').error).toBe('网络断开')
  })

  it('数据源不存在时返回 null 并标记错误', async () => {
    const { runner } = setup([])
    expect(await runner.load('nope')).toBeNull()
    expect(runner.get('nope').status).toBe('error')
  })

  it('并发 load 复用同一个 Promise（去重）', async () => {
    const { runner, spy } = setup([{ id: 'c1', name: 'x', type: 'http', method: 'GET', url: '/c' }])
    const [a, b] = await Promise.all([runner.load('c1'), runner.load('c1')])
    expect(a).toEqual(b)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('TTL 缓存命中时不重复请求', async () => {
    const { runner, spy } = setup([
      { id: 'k1', name: 'x', type: 'http', method: 'GET', url: '/k', cache: { enable: true, ttl: 60 } },
    ])
    await runner.load('k1')
    await runner.load('k1')
    expect(spy).toHaveBeenCalledTimes(1)

    runner.clearCache('k1')
    await runner.load('k1')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('resultPath 取值 + transform 转换', async () => {
    const ctx = createPageContext()
    const host = { request: vi.fn(async () => ({ statusCode: 200, data: { meta: { total: 3 }, rows: [1, 2] } })) as any }
    const runner = new DataSourceRunner({ ctx, host }, [
      { id: 'r1', name: 'x', type: 'http', method: 'GET', url: '/r', resultPath: 'result.rows', transform: 'result.map(v => v * 2)' },
    ])
    expect(await runner.load('r1')).toEqual([2, 4])
  })

  it('transform 抛错时置 error', async () => {
    const { runner } = setup([
      { id: 't1', name: 'x', type: 'static', data: 1, transform: 'result.notAFn()' },
    ])
    expect(await runner.load('t1')).toBeNull()
    expect(runner.get('t1').status).toBe('error')
  })

  it('model 数据源走平台 REST', async () => {
    const { runner, spy } = setup([{ id: 'm1', name: 'x', type: 'model', modelId: 'order', method: 'POST' }])
    await runner.load('m1', { status: 1 })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/api/v1/models/order/records', data: { status: 1 } }))
  })

  it('model 缺 modelId 报错', async () => {
    const { runner } = setup([{ id: 'm2', name: 'x', type: 'model' }])
    expect(await runner.load('m2')).toBeNull()
    expect(runner.get('m2').error).toContain('modelId')
  })

  it('formula 数据源基于表达式计算', async () => {
    const ctx = createPageContext({ defaultFormData: { a: 2, b: 3 } })
    const runner = new DataSourceRunner(
      { ctx, host: { request: vi.fn() as any } },
      [{ id: 'f1', name: 'x', type: 'formula', transform: 'formData.a + formData.b' }],
    )
    expect(await runner.load('f1')).toBe(5)
  })

  it('formula 缺表达式报错', async () => {
    const { runner } = setup([{ id: 'f2', name: 'x', type: 'formula' }])
    expect(await runner.load('f2')).toBeNull()
    expect(runner.get('f2').error).toContain('计算表达式')
  })

  it('loadInit 只加载 trigger=init 的数据源', async () => {
    const { runner, spy } = setup([
      { id: 'i1', name: 'a', type: 'http', method: 'GET', url: '/a', trigger: 'init' },
      { id: 'i2', name: 'b', type: 'http', method: 'GET', url: '/b', trigger: 'manual' },
      { id: 'i3', name: 'c', type: 'http', method: 'GET', url: '/c' },
    ])
    await runner.loadInit()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].url).toBe('/a')
  })

  it('watch 触发器：字段变更（含子路径）自动取数', async () => {
    const { runner, spy } = setup([
      { id: 'w1', name: 'x', type: 'http', method: 'GET', url: '/w', trigger: 'watch:formData.city' },
    ])
    runner.startWatch()
    runner.startWatch() // 幂等

    await new Promise((r) => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledTimes(0)

    const ctx = (runner as any).opts.ctx as PageContext
    ctx.set('city', 'BJ')
    await new Promise((r) => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledTimes(1)

    // 子路径变更也触发
    ctx.set('city.code', '010')
    await new Promise((r) => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledTimes(2)

    runner.stopWatch()
    ctx.set('city', 'SH')
    await new Promise((r) => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('register 动态注册 + dispose 释放', async () => {
    const { runner, spy } = setup([])
    runner.register({ id: 'n1', name: 'x', type: 'http', method: 'GET', url: '/n' })
    expect(runner.get('n1').status).toBe('idle')
    expect(await runner.load('n1')).toEqual({ list: [1, 2] })
    expect(spy).toHaveBeenCalledTimes(1)
    runner.dispose()
    expect(runner.snapshot()).toHaveProperty('n1')
  })

  it('snapshot 返回全部状态', () => {
    const { runner } = setup([{ id: 's1', name: 'x', type: 'static', data: 1 }])
    expect(Object.keys(runner.snapshot())).toEqual(['s1'])
  })

  it('未知类型报错', async () => {
    const { runner } = setup([{ id: 'u1', name: 'x', type: 'weird' as any }])
    expect(await runner.load('u1')).toBeNull()
    expect(runner.get('u1').error).toContain('不支持')
  })
})
