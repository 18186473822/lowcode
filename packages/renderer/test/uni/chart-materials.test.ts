/**
 * chart-materials.test.ts —— 图表 / 指标卡物料行为锁（Phase 3 批 4，D-P3-10）
 *
 * 覆盖：
 *  ① chart-svg 纯函数：静态解析 / 客户端聚合（count·sum·avg·max·min）/ 排序截断 /
 *     三形态 SVG 生成 / XML 转义 / UTF-8 base64 / 指标格式化；
 *  ② Chart 组件：静态 data 直渲（零请求）/ 未配数据空态（零请求）/ 模型取数经
 *     inject 宿主（聚合渲染）/ 取数失败红字；
 *  ③ Statistic 组件：千分位 + 单位 + 趋势箭头。
 *
 * 边界：物料用真实组件直接 mount（jsdom 下 uni 标签为未知元素）；数据通道经 provide 注入
 * mock host（D-P3-4，与 ApprovalBar/Timeline 同款）。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { LC_FLOW_HOST_KEY, type LcFlowHost } from '@lc/materials'
import LcChart from '@lc/materials/src/chart/index.vue'
import LcStatistic from '@lc/materials/src/statistic/index.vue'
import {
  aggregateSeries,
  parseSeries,
  buildChartSvg,
  toDataUri,
  utf8ToBase64,
  escapeXml,
  formatNumber,
  formatStatistic,
  RECORDS_SIZE_MAX,
} from '@lc/materials/src/chart/chart-svg'

/* ------------------------------------------------------------------ */
/* 纯函数                                                              */
/* ------------------------------------------------------------------ */

describe('chart-svg —— parseSeries（静态数据）', () => {
  it('合法 JSON 文本 → 数据点；label 缺省用 name/key 或序号', () => {
    expect(parseSeries('[{"label":"一月","value":3},{"name":"二月","value":"5"}]')).toEqual([
      { label: '一月', value: 3 },
      { label: '二月', value: 5 },
    ])
    expect(parseSeries('[{"value":1}]')).toEqual([{ label: '#1', value: 1 }])
  })

  it('容错：非数组 / 非法 JSON / value 非数值 → [] 或丢弃该项', () => {
    expect(parseSeries('')).toEqual([])
    expect(parseSeries('not json')).toEqual([])
    expect(parseSeries('{"a":1}')).toEqual([])
    expect(parseSeries('[{"label":"x"},{"value":2}]')).toEqual([{ label: '#2', value: 2 }])
    expect(parseSeries(null)).toEqual([])
  })
})

describe('chart-svg —— aggregateSeries（客户端聚合）', () => {
  const rows = [
    { dept: '技术', amount: 10 },
    { dept: '技术', amount: 20 },
    { dept: '市场', amount: 5 },
    { dept: '', amount: 1 },
  ]

  it('count：组内行数，按数值降序 + limit 截断', () => {
    expect(aggregateSeries(rows, { dimension: 'dept', metric: 'count' })).toEqual([
      { label: '技术', value: 2 },
      { label: '市场', value: 1 },
      { label: '（空）', value: 1 },
    ])
  })

  it('sum / avg / max / min 取指标字段', () => {
    const sum = aggregateSeries(rows, { dimension: 'dept', metric: 'sum', metricField: 'amount' })
    expect(sum.find((p) => p.label === '技术')).toEqual({ label: '技术', value: 30 })
    const avg = aggregateSeries(rows, { dimension: 'dept', metric: 'avg', metricField: 'amount' })
    expect(avg.find((p) => p.label === '技术')).toEqual({ label: '技术', value: 15 })
    const max = aggregateSeries(rows, { dimension: 'dept', metric: 'max', metricField: 'amount' })
    expect(max.find((p) => p.label === '技术')).toEqual({ label: '技术', value: 20 })
    const min = aggregateSeries(rows, { dimension: 'dept', metric: 'min', metricField: 'amount' })
    expect(min.find((p) => p.label === '技术')).toEqual({ label: '技术', value: 10 })
  })

  it('limit 截断为前 N（降序）；缺维度 / 空行 → []', () => {
    expect(aggregateSeries(rows, { dimension: 'dept', metric: 'count', limit: 1 })).toEqual([
      { label: '技术', value: 2 },
    ])
    expect(aggregateSeries(rows, { metric: 'count' })).toEqual([])
    expect(aggregateSeries([], { dimension: 'dept', metric: 'count' })).toEqual([])
  })
})

describe('chart-svg —— buildChartSvg（三形态）', () => {
  const series = [
    { label: 'A & B', value: 3 },
    { label: 'B', value: 5 },
  ]

  it('空数据 → 空串（组件走空态）', () => {
    expect(buildChartSvg({ type: 'bar', series: [], width: 320, height: 200 })).toBe('')
    expect(buildChartSvg({ type: 'bar', series, width: 0, height: 200 })).toBe('')
  })

  it('柱/折/饼分别产出 rect / polyline / path，且转义 XML 特殊字符', () => {
    const bar = buildChartSvg({ type: 'bar', series, width: 320, height: 200 })
    expect(bar).toContain('<svg')
    expect(bar).toContain('<rect')
    const line = buildChartSvg({ type: 'line', series, width: 320, height: 200 })
    expect(line).toContain('<polyline')
    const pie = buildChartSvg({ type: 'pie', series, width: 320, height: 200 })
    expect(pie).toContain('<path')
    // 标签 A & B → A &amp; B（截断后为 A &am…，但 & 必须已转义为 &amp;）
    expect(bar).toContain('&amp;')
    expect(bar).not.toContain('A & B')
  })

  it('escapeXml 四类字符', () => {
    expect(escapeXml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;')
  })
})

describe('chart-svg —— base64 / 指标格式化', () => {
  it('utf8ToBase64：ASCII 与中文（UTF-8）编码正确', () => {
    expect(utf8ToBase64('abc')).toBe('YWJj')
    expect(utf8ToBase64('中')).toBe('5Lit')
  })

  it('toDataUri：空串 → ""；非空 → 前缀 + base64', () => {
    expect(toDataUri('')).toBe('')
    expect(toDataUri('<svg/>')).toBe(`data:image/svg+xml;base64,${utf8ToBase64('<svg/>')}`)
  })

  it('formatNumber 千分位 + 定点；formatStatistic 空/非数值/单位', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(1234.567, 2)).toBe('1,234.57')
    expect(formatNumber(-1234)).toBe('-1,234')
    expect(formatStatistic(null)).toBe('—')
    expect(formatStatistic('', { unit: '人' })).toBe('—人')
    expect(formatStatistic(12345, { unit: '人' })).toBe('12,345人')
    expect(formatStatistic('文本')).toBe('文本')
  })
})

/* ------------------------------------------------------------------ */
/* Chart 组件                                                          */
/* ------------------------------------------------------------------ */

function mockHost(items: Array<Record<string, unknown>> = [], failStatus = 0) {
  const request = vi.fn(async () => ({ statusCode: failStatus || 200, data: { items, total: items.length } }))
  return { host: { request } as unknown as LcFlowHost, request }
}

function mountChart(props: Record<string, unknown>, host?: LcFlowHost) {
  return mount(LcChart, {
    props,
    global: host ? { provide: { [LC_FLOW_HOST_KEY as symbol]: host } } : {},
  })
}

describe('Chart —— 图表物料', () => {
  it('静态 data → 直接渲染图（data URI image），零请求', async () => {
    const { host, request } = mockHost()
    const w = mountChart(
      { chartType: 'pie', title: '占比', data: '[{"label":"A","value":1},{"label":"B","value":2}]' },
      host,
    )
    await flushPromises()
    expect(w.text()).toContain('占比')
    const img = w.find('image')
    expect(img.exists()).toBe(true)
    expect(String(img.attributes('src'))).toContain('data:image/svg+xml;base64,')
    expect(request).not.toHaveBeenCalled()
    w.unmount()
  })

  it('饼图 → 渲染静态图例（分类 + 数值）；柱/折不渲染图例', async () => {
    const data = '[{"label":"技术","value":2},{"label":"市场","value":1}]'
    const pie = mountChart({ chartType: 'pie', data })
    await flushPromises()
    expect(pie.find('.lc-chart__legend').exists()).toBe(true)
    expect(pie.findAll('.lc-chart__legend-item')).toHaveLength(2)
    expect(pie.text()).toContain('技术')
    expect(pie.text()).toContain('市场')
    expect(pie.text()).toContain('2')
    pie.unmount()

    const bar = mountChart({ chartType: 'bar', data })
    await flushPromises()
    expect(bar.find('.lc-chart__legend').exists()).toBe(false)
    bar.unmount()
  })

  it('有图时不渲染空态提示（v-if 条件互斥，防「图文并存」）', async () => {
    const w = mountChart({ chartType: 'bar', data: '[{"label":"A","value":1}]' })
    await flushPromises()
    expect(w.find('image').exists()).toBe(true)
    expect(w.find('.lc-chart__hint').exists()).toBe(false)
    w.unmount()
  })

  it('无 data 无模型 → 空态占位，零请求', async () => {
    const { host, request } = mockHost()
    const w = mountChart({ chartType: 'bar' }, host)
    await flushPromises()
    expect(w.find('image').exists()).toBe(false)
    expect(w.text()).toContain('图表')
    expect(request).not.toHaveBeenCalled()
    w.unmount()
  })

  it('绑定模型 + 维度 → 经宿主取数并聚合渲染（含 limit）', async () => {
    const rows = [
      { dept: '技术' },
      { dept: '技术' },
      { dept: '市场' },
    ]
    const { host, request } = mockHost(rows)
    const w = mountChart({ chartType: 'bar', modelId: 'm_e', dimension: 'dept', limit: 1 }, host)
    await flushPromises()
    expect(request).toHaveBeenCalledTimes(1)
    const url = String((request.mock.calls[0]![0] as { url: string }).url)
    expect(url).toContain('/api/v1/models/m_e/records')
    // 样本量 = limit×20（limit 1 → 20），且不得超过服务端 size 上限
    expect(Number(new URL(url, 'http://x').searchParams.get('size'))).toBe(20)
    expect(w.find('image').exists()).toBe(true)
    w.unmount()
  })

  it('样本量按服务端上限截断（limit×20 超 MAX_SIZE → 取上限，不再 400）', async () => {
    const { host, request } = mockHost([])
    const w = mountChart({ chartType: 'bar', modelId: 'm_e', dimension: 'dept', limit: 8 }, host)
    await flushPromises()
    const url = String((request.mock.calls[0]![0] as { url: string }).url)
    const size = Number(new URL(url, 'http://x').searchParams.get('size'))
    expect(size).toBe(RECORDS_SIZE_MAX)
    expect(size).toBeLessThanOrEqual(100) // 与 apps/server record.service MAX_SIZE 一致
    w.unmount()
  })

  it('取数失败（500）→ 红字错误，不抛错', async () => {
    const { host } = mockHost([], 500)
    const w = mountChart({ chartType: 'line', modelId: 'm_e', dimension: 'dept' }, host)
    await flushPromises()
    expect(w.text()).toContain('图表取数失败')
    w.unmount()
  })

  it('无宿主（画布态）→ 空态不请求', async () => {
    const w = mountChart({ chartType: 'bar', modelId: 'm_e', dimension: 'dept' })
    await flushPromises()
    expect(w.find('image').exists()).toBe(false)
    w.unmount()
  })
})

/* ------------------------------------------------------------------ */
/* Statistic 组件                                                      */
/* ------------------------------------------------------------------ */

describe('Statistic —— 指标卡', () => {
  it('千分位 + 单位 + 趋势箭头', () => {
    const w = mount(LcStatistic, {
      props: { label: '总人数', value: 12345, unit: '人', precision: 0, trend: 'up' },
    })
    expect(w.text()).toContain('总人数')
    expect(w.text()).toContain('12,345')
    expect(w.text()).toContain('人')
    expect(w.text()).toContain('↑')
    w.unmount()
  })

  it('空值 → —；down 趋势 ↓', () => {
    const w = mount(LcStatistic, { props: { label: '增长率', value: '', unit: '%', trend: 'down' } })
    expect(w.text()).toContain('—%')
    expect(w.text()).toContain('↓')
    w.unmount()
  })
})
