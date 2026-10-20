/**
 * Phase 2 批 2：标准页组件（lc-list-page / lc-detail-page）
 *
 * 覆盖：行渲染与列名来源（模型定义/列降级）、分页「加载更多」追加、前端搜索过滤、
 * 点行 emit 跳转（含无 detailPageId 不跳）、请求失败红字 + 重试、配置缺失红字且不发请求、
 * detail 的 filter 定位、fields 过滤、返回（back / backPageId navigate）、值格式化。
 *
 * 环境：vitest.config environmentMatchGlobs 已将 test/uni/** 映射为 jsdom。
 * uni 标签（view/text/input/button）在 jsdom 下渲染为未知元素，@tap 手动 trigger('tap')。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createEmptyPage, type PageSchema } from '@lc/schema'
import type { PageControllerOptions } from '../../src/core/controller.js'
import LcListPage from '../../src/uni/lc-list-page.vue'
import LcDetailPage from '../../src/uni/lc-detail-page.vue'
import { displayCell } from '../../src/uni/display'

/* ---------------- fixtures ---------------- */

const modelDef = {
  schemaVersion: '1.0.0',
  id: 'm_e',
  name: '员工',
  code: 'm_e',
  fields: [
    { key: 'empName', name: '姓名', type: 'string' },
    { key: 'dept', name: '部门', type: 'string' },
  ],
}

const records = [
  { id: 'r1', empName: '张三', dept: '技术部' },
  { id: 'r2', empName: '李四', dept: '市场部' },
  { id: 'r3', empName: '王五', dept: '技术部' },
]

interface Override {
  /** 第 N 次 records 请求失败（1=首屏，2=翻页），用于 §5 分类与重试用例 */
  recordsFailOnCall?: number
  /** recordsFailOnCall 命中时返回的状态码（401 / 403 / 500 / 0=网络失败） */
  recordsFailStatus?: number
  /** 模型定义请求 404（列名降级用例） */
  modelDefFail?: boolean
}

/** mock host：/records 走分页 + filter 等值过滤，/models/:id 走定义 */
function makeHost(override: Override = {}) {
  let recordsCalls = 0
  const spy = vi.fn(
    async (req: { method: string; url: string }): Promise<{ statusCode: number; data: unknown }> => {
      if (req.url.includes('/records')) {
        recordsCalls += 1
        if (
          override.recordsFailOnCall !== undefined &&
          recordsCalls === override.recordsFailOnCall
        ) {
          return { statusCode: override.recordsFailStatus ?? 500, data: null }
        }
        const usp = new URLSearchParams(req.url.split('?')[1] ?? '')
        let list = records
        const f = usp.get('filter')
        if (f) {
          const cond = JSON.parse(f) as Record<string, unknown>
          list = list.filter((r) => Object.entries(cond).every(([k, v]) => r[k] === v))
        }
        const page = Number(usp.get('page') ?? 1)
        const size = Number(usp.get('size') ?? 10)
        const start = (page - 1) * size
        return {
          statusCode: 200,
          data: { items: list.slice(start, start + size), total: list.length, page, size },
        }
      }
      if (req.url.includes('/models/m_e')) {
        if (override.modelDefFail) return { statusCode: 404, data: { message: 'nf' } }
        return { statusCode: 200, data: modelDef }
      }
      return { statusCode: 404, data: { message: 'nf' } }
    },
  )
  return { host: { request: spy }, spy }
}

function mountList(
  list: NonNullable<PageSchema['list']>,
  override?: Override,
): { w: ReturnType<typeof mount>; spy: ReturnType<typeof vi.fn> } {
  const p = createEmptyPage('p_list', '员工列表')
  p.type = 'list'
  p.list = list
  const { host, spy } = makeHost(override)
  const w = mount(LcListPage, {
    props: { schema: p, options: { host } as unknown as PageControllerOptions },
  })
  return { w, spy }
}

function mountDetail(
  detail: NonNullable<PageSchema['detail']>,
  recordId = 'r1',
  override?: Override,
): { w: ReturnType<typeof mount>; spy: ReturnType<typeof vi.fn> } {
  const p = createEmptyPage('p_d', '员工详情')
  p.type = 'detail'
  p.detail = detail
  const { host, spy } = makeHost(override)
  const w = mount(LcDetailPage, {
    props: {
      schema: p,
      options: { host } as unknown as PageControllerOptions,
      recordId,
    },
  })
  return { w, spy }
}

const twoColList: NonNullable<PageSchema['list']> = {
  modelId: 'm_e',
  columns: ['empName', 'dept'],
  detailPageId: 'p_d',
  pagination: { mode: 'page', size: 2 },
  search: { fields: ['empName', 'dept'] },
}

/* ---------------- display ---------------- */

describe('displayCell（标准页值格式化）', () => {
  it('空值占位、布尔中文、对象 JSON、其余 String', () => {
    expect(displayCell(null)).toBe('—')
    expect(displayCell(undefined)).toBe('—')
    expect(displayCell('')).toBe('—')
    expect(displayCell(true)).toBe('是')
    expect(displayCell(false)).toBe('否')
    expect(displayCell({ a: 1 })).toBe('{"a":1}')
    expect(displayCell(0)).toBe('0')
    expect(displayCell('张三')).toBe('张三')
  })
})

/* ---------------- lc-list-page ---------------- */

describe('lc-list-page（type=list 标准列表页）', () => {
  it('渲染行：列名取模型定义、分页 size=2、total 与「加载更多」可见', async () => {
    const { w, spy } = mountList(twoColList)
    await flushPromises()
    expect(w.findAll('.lc-row')).toHaveLength(2)
    expect(w.text()).toContain('姓名')
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('李四')
    expect(w.text()).toContain('已显示 2/3')
    // 请求：模型定义 1 + records 1，且带 page/size
    expect(spy).toHaveBeenCalledTimes(2)
    const rec = spy.mock.calls.map((c) => c[0] as { url: string }).find((c) => c.url.includes('/records'))!
    expect(rec.url).toContain('page=1')
    expect(rec.url).toContain('size=2')
  })

  it('加载更多：page+1 追加行，尾页按钮消失显示「共 3 条」', async () => {
    const { w } = mountList(twoColList)
    await flushPromises()
    await w.get('.lc-list-page__more-btn').trigger('tap')
    await flushPromises()
    expect(w.findAll('.lc-row')).toHaveLength(3)
    expect(w.find('.lc-list-page__more-btn').exists()).toBe(false)
    expect(w.text()).toContain('共 3 条')
  })

  it('前端搜索：包含匹配可见列，不重新请求', async () => {
    const { w, spy } = mountList(twoColList)
    await flushPromises()
    const calls = spy.mock.calls.length
    await w.get('.lc-list-page__input').setValue('李四')
    expect(w.findAll('.lc-row')).toHaveLength(1)
    expect(w.text()).toContain('李四')
    expect(spy.mock.calls.length).toBe(calls)
    await w.get('.lc-list-page__input').setValue('不存在')
    // §5：空状态必须有标题 + 说明 + 出口，禁止只写「暂无数据」
    expect(w.text()).toContain('还没有数据')
    expect(w.text()).toContain('可以调整搜索条件')
    expect(w.find('[data-testid="list-empty-action"]').exists()).toBe(true)
  })

  it('点行 emit navigate（detailPageId + rid）；未配置 detailPageId 则不跳', async () => {
    const { w } = mountList(twoColList)
    await flushPromises()
    await w.findAll('.lc-row')[0]!.trigger('tap')
    expect(w.emitted('navigate')).toEqual([[{ pageId: 'p_d', params: { rid: 'r1' } }]])

    const { w: w2 } = mountList({ modelId: 'm_e', columns: ['empName'] })
    await flushPromises()
    await w2.findAll('.lc-row')[0]!.trigger('tap')
    expect(w2.emitted('navigate')).toBeUndefined()
  })

  it('records 500 → 分类为「加载失败」+ 就地显示可核对信息 + 重试成功恢复', async () => {
    const { w, spy } = mountList(twoColList, { recordsFailOnCall: 1, recordsFailStatus: 500 })
    await flushPromises()
    // §5：错误文案必须含可核对信息（这里是状态码），且给出口
    expect(w.text()).toContain('加载失败')
    expect(w.text()).toContain('500')
    expect(w.find('[data-testid="list-error-action"]').exists()).toBe(true)
    await w.get('[data-testid="list-error-action"]').trigger('tap')
    await flushPromises()
    expect(w.text()).toContain('张三')
    expect(w.find('[data-testid="list-error"]').exists()).toBe(false)
  })

  it('缺 modelId → 红字且不发任何请求', async () => {
    const { w, spy } = mountList({ modelId: '', columns: [] })
    await flushPromises()
    expect(w.text()).toContain('列表配置缺少 modelId')
    expect(spy).not.toHaveBeenCalled()
  })

  /* ---------------- §5 异常状态分类 ---------------- */

  it('401 → no-auth 状态：引导重新登录，且上抛壳层（renderer 不直接跳转）', async () => {
    const { w } = mountList(twoColList, { recordsFailOnCall: 1, recordsFailStatus: 401 })
    await flushPromises()
    expect(w.find('[data-testid="list-no-auth"]').exists()).toBe(true)
    expect(w.text()).toContain('登录已过期')
    expect(w.text()).toContain('不会丢')
    expect(w.find('[data-testid="list-no-auth-action"]').text()).toContain('去登录')
    await w.get('[data-testid="list-no-auth-action"]').trigger('tap')
    expect(w.emitted('state-action')).toEqual([['no-auth']])
  })

  it('403 → forbidden 状态：提示无权限 + 返回菜单，并指明页面', async () => {
    const { w } = mountList(twoColList, { recordsFailOnCall: 1, recordsFailStatus: 403 })
    await flushPromises()
    expect(w.find('[data-testid="list-forbidden"]').exists()).toBe(true)
    expect(w.text()).toContain('无权访问')
    expect(w.text()).toContain('p_list')
    await w.get('[data-testid="list-forbidden-action"]').trigger('tap')
    expect(w.emitted('state-action')).toEqual([['forbidden']])
  })

  it('statusCode 0（网络失败契约）→ 「网络连接中断」而非笼统错误，重试可恢复', async () => {
    const { w } = mountList(twoColList, { recordsFailOnCall: 1, recordsFailStatus: 0 })
    await flushPromises()
    expect(w.text()).toContain('网络连接中断')
    expect(w.text()).toContain('仍在')
    await w.get('[data-testid="list-error-action"]').trigger('tap')
    await flushPromises()
    expect(w.text()).toContain('张三')
  })

  it('翻页失败：保留已加载行 + 就地重试条（§5「已加载内容不丢失」）', async () => {
    const { w } = mountList(twoColList, { recordsFailOnCall: 2, recordsFailStatus: 0 })
    await flushPromises()
    // 首屏 2 条正常渲染
    expect(w.findAll('.lc-row')).toHaveLength(2)
    expect(w.text()).toContain('张三')
    // 翻页失败：**不清空已加载行**，改为页内重试条
    await w.get('.lc-list-page__more-btn').trigger('tap')
    await flushPromises()
    expect(w.findAll('.lc-row')).toHaveLength(2)
    expect(w.text()).toContain('张三')
    expect(w.find('[data-testid="list-inline-error"]').exists()).toBe(true)
    // 重试成功后恢复（第 3 次请求成功 → 追加载入第 3 条）
    await w.get('.lc-list-page__retry').trigger('tap')
    await flushPromises()
    expect(w.findAll('.lc-row')).toHaveLength(3)
    expect(w.find('[data-testid="list-inline-error"]').exists()).toBe(false)
  })

  it('columns 为空 → 展示模型全部字段', async () => {
    const { w } = mountList({ modelId: 'm_e', columns: [], pagination: { mode: 'page', size: 10 } })
    await flushPromises()
    expect(w.text()).toContain('姓名')
    expect(w.text()).toContain('部门')
  })

  it('模型定义 404 → 列名回退 key（记录数据不受影响）', async () => {
    const { w } = mountList(twoColList, { modelDefFail: true })
    await flushPromises()
    expect(w.text()).toContain('empName')
    expect(w.text()).toContain('张三')
  })

  it('配置 sort → 透传服务端 sort 参数', async () => {
    const { w, spy } = mountList({ ...twoColList, sort: [{ field: 'empName', order: 'asc' }] })
    await flushPromises()
    const rec = spy.mock.calls.map((c) => c[0] as { url: string }).find((c) => c.url.includes('/records'))!
    expect(rec.url).toContain('sort=empName%3Aasc')
    expect(w.findAll('.lc-row').length).toBeGreaterThan(0)
  })
})

/* ---------------- lc-detail-page ---------------- */

describe('lc-detail-page（type=detail 标准详情页）', () => {
  it('按 rid 定位单条记录（filter={"id":rid}），字段与值渲染', async () => {
    const { w, spy } = mountDetail({ modelId: 'm_e' }, 'r1')
    await flushPromises()
    expect(w.text()).toContain('姓名')
    expect(w.text()).toContain('张三')
    const rec = spy.mock.calls
      .map((c) => c[0] as { url: string })
      .find((c) => c.url.includes('/records'))!
    expect(decodeURIComponent(rec.url)).toContain('filter={"id":"r1"}')
    expect(decodeURIComponent(rec.url)).toContain('size=1')
  })

  it('detail.fields 过滤展示字段（只显示配置项）', async () => {
    const { w } = mountDetail({ modelId: 'm_e', fields: ['dept'] }, 'r1')
    await flushPromises()
    expect(w.text()).toContain('部门')
    expect(w.text()).toContain('技术部')
    expect(w.text()).not.toContain('姓名')
  })

  it('记录不存在 → 记录级 404 状态（标题 + 说明，不误报成「页面不存在」）', async () => {
    const { w } = mountDetail({ modelId: 'm_e' }, 'r999')
    await flushPromises()
    // §5：区分「记录不存在」与「页面不存在」，且文案说清能做什么
    expect(w.text()).toContain('记录不存在')
    expect(w.text()).toContain('可能已被删除')
    expect(w.text()).not.toContain('页面不存在')
  })

  it('缺 rid → 红字且不发 records 请求（不卡加载态）', async () => {
    const { w, spy } = mountDetail({ modelId: 'm_e' }, '')
    await flushPromises()
    expect(w.text()).toContain('缺少记录 id（rid）')
    const recCalls = spy.mock.calls.filter((c) => (c[0] as { url: string }).url.includes('/records'))
    expect(recCalls).toHaveLength(0)
  })

  it('缺 modelId → 红字且不发任何请求（不卡加载态）', async () => {
    const { w, spy } = mountDetail({ modelId: '' }, 'r1')
    await flushPromises()
    expect(w.text()).toContain('详情配置缺少 modelId')
    expect(spy).not.toHaveBeenCalled()
  })

  it('返回：未配 backPageId → emit back；配了 → emit navigate 目标页', async () => {
    const { w } = mountDetail({ modelId: 'm_e' }, 'r1')
    await flushPromises()
    await w.get('.lc-detail-page__back').trigger('tap')
    expect(w.emitted('back')).toHaveLength(1)

    const { w: w2 } = mountDetail({ modelId: 'm_e', backPageId: 'p_list' }, 'r1')
    await flushPromises()
    await w2.get('.lc-detail-page__back').trigger('tap')
    expect(w2.emitted('back')).toBeUndefined()
    expect(w2.emitted('navigate')).toEqual([[{ pageId: 'p_list', params: {} }]])
  })

  it('模型定义 404 → 字段回退记录键（记录仍可见）', async () => {
    const { w } = mountDetail({ modelId: 'm_e' }, 'r1', { modelDefFail: true })
    await flushPromises()
    expect(w.text()).toContain('empName')
    expect(w.text()).toContain('张三')
  })
})
