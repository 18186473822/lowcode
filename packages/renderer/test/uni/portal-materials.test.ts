/**
 * portal-materials.test.ts —— 门户组件库 4 物料的行为锁（2026-10-28 批 2）
 *
 * 覆盖：
 *  ① 共享纯函数：`asArray` 容错（数组 / JSON 文本 / 非法）、`groupDigits`、`rpxValue`；
 *  ② PortalBanner：轮播叠层渲染 / 圆点 / 自动切换 / 点击载荷 / 非法配置空态；
 *  ③ PortalNotice：多条轮换 / 单条 text 兜底 / 点击载荷；
 *  ④ PortalStat：千分位与单位 / 列宽 / 空态；
 *  ⑤ PortalTodo：静态数据零请求 / 宿主取数 + limit 截断 / 401 提示 / 空态。
 *
 * 边界：物料用真实组件直接 mount（jsdom 下 view/text/image 为未知标签，不影响断言）；
 *       计时器统一走 fake timers，避免轮播 interval 泄漏到别的用例。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { LC_FLOW_HOST_KEY, type LcFlowHost } from '@lc/materials'
import { asArray, groupDigits } from '@lc/materials/src/props-utils'
import LcPortalBanner from '@lc/materials/src/portal-banner/index.vue'
import LcPortalNotice from '@lc/materials/src/portal-notice/index.vue'
import LcPortalStat from '@lc/materials/src/portal-stat/index.vue'
import LcPortalTodo from '@lc/materials/src/portal-todo/index.vue'

afterEach(() => {
  vi.useRealTimers()
})

/* ------------------------------------------------------------------ */
/* 纯函数                                                              */
/* ------------------------------------------------------------------ */

describe('props-utils —— JSON 驱动物料的容错读取', () => {
  it('asArray：数组原样、JSON 文本解析、其余回退空数组', () => {
    const arr = [{ a: 1 }]
    expect(asArray(arr)).toBe(arr)
    expect(asArray('[{"a":1}]')).toEqual([{ a: 1 }])
    expect(asArray('  ')).toEqual([])
    expect(asArray('{"a":1}')).toEqual([]) // 对象不是数组
    expect(asArray('oops')).toEqual([])
    expect(asArray(null)).toEqual([])
    expect(asArray(42)).toEqual([])
  })

  it('groupDigits：千分位且保留小数/负号', () => {
    expect(groupDigits(1234567)).toBe('1,234,567')
    expect(groupDigits(-1234.5)).toBe('-1,234.5')
    expect(groupDigits(999)).toBe('999')
  })
})

/* ------------------------------------------------------------------ */
/* 轮播图                                                              */
/* ------------------------------------------------------------------ */

describe('PortalBanner（轮播图）', () => {
  const items = [
    { title: '横幅一', desc: '说明一' },
    { title: '横幅二', image: '/static/b.png' },
  ]

  it('渲染全部轮播项，首帧激活；有图走 image、无图走占位', () => {
    const w = mount(LcPortalBanner, { props: { items } })
    const slides = w.findAll('.lc-banner__slide')
    expect(slides).toHaveLength(2)
    expect(slides[0]!.classes()).toContain('lc-banner__slide--active')
    expect(slides[1]!.classes()).not.toContain('lc-banner__slide--active')
    // 无图：占位块不重复标题（标题只在下方说明条里出现一次）
    expect(slides[0]!.find('.lc-banner__fallback').exists()).toBe(true)
    expect(slides[0]!.find('image').exists()).toBe(false)
    expect(slides[0]!.findAll('.lc-banner__title')).toHaveLength(1)
    expect(slides[0]!.find('.lc-banner__title').text()).toBe('横幅一')
    expect(w.find('image').attributes('src')).toBe('/static/b.png')
    expect(w.find('.lc-banner__desc').text()).toBe('说明一')
    expect(w.findAll('.lc-banner__dot')).toHaveLength(2)
    w.unmount()
  })

  it('自动播放：到间隔后切到下一张并循环；indicator=false 不出圆点', async () => {
    vi.useFakeTimers()
    const w = mount(LcPortalBanner, { props: { items, interval: 1000 } })
    expect(w.findAll('.lc-banner__dot')[0]!.classes()).toContain('lc-banner__dot--active')

    vi.advanceTimersByTime(1000)
    await w.vm.$nextTick()
    expect(w.findAll('.lc-banner__slide')[1]!.classes()).toContain('lc-banner__slide--active')

    vi.advanceTimersByTime(1000)
    await w.vm.$nextTick()
    expect(w.findAll('.lc-banner__slide')[0]!.classes()).toContain('lc-banner__slide--active')

    await w.setProps({ indicator: false })
    expect(w.findAll('.lc-banner__dot')).toHaveLength(0)
    w.unmount()
  })

  it('点击上传 index；点圆点直接跳该张', async () => {
    const w = mount(LcPortalBanner, { props: { items } })
    await w.findAll('.lc-banner__slide')[1]!.trigger('tap')
    expect(w.emitted('itemClick')).toEqual([[1]])

    await w.findAll('.lc-banner__dot')[1]!.trigger('tap')
    expect(w.findAll('.lc-banner__slide')[1]!.classes()).toContain('lc-banner__slide--active')
    w.unmount()
  })

  it('高度按「rpx ÷ 750」换算成百分比内边距（内联 rpx 在浏览器无效，画布会塌成 0）', () => {
    const w = mount(LcPortalBanner, { props: { items, height: 300 } })
    expect(w.attributes('style')).toContain('padding-top: 40%')
    // 非法/缺省高度回退 300rpx
    const fallback = mount(LcPortalBanner, { props: { items, height: 'oops' as unknown as number } })
    expect(fallback.attributes('style')).toContain('padding-top: 40%')
    w.unmount()
    fallback.unmount()
  })

  it('items 为空或非法 JSON → 空态提示，不报错', () => {
    const empty = mount(LcPortalBanner, { props: { items: [] } })
    expect(empty.find('.lc-banner__empty').exists()).toBe(true)
    empty.unmount()

    const bad = mount(LcPortalBanner, { props: { items: '[{oops' } })
    expect(bad.find('.lc-banner__empty').exists()).toBe(true)
    bad.unmount()
  })
})

/* ------------------------------------------------------------------ */
/* 公告条                                                              */
/* ------------------------------------------------------------------ */

describe('PortalNotice（公告条）', () => {
  it('字符串数组轮换；点击 emit 当前条 index', async () => {
    vi.useFakeTimers()
    const w = mount(LcPortalNotice, { props: { items: ['第一条', '第二条'], interval: 2000 } })
    expect(w.find('.lc-notice__text').text()).toBe('第一条')

    vi.advanceTimersByTime(2000)
    await w.vm.$nextTick()
    expect(w.find('.lc-notice__text').text()).toBe('第二条')

    await w.find('.lc-notice').trigger('tap')
    expect(w.emitted('itemClick')).toEqual([[1]])
    w.unmount()
  })

  it('items 为空 → 回退单条 text；都没有 → 配置提示', () => {
    const one = mount(LcPortalNotice, { props: { items: [], text: '系统维护通知' } })
    expect(one.find('.lc-notice__text').text()).toBe('系统维护通知')
    one.unmount()

    const none = mount(LcPortalNotice)
    expect(none.find('.lc-notice__empty').exists()).toBe(true)
    none.unmount()
  })

  it('对象数组取 text 字段（json setter 的 {"text":…} 形态）', () => {
    const w = mount(LcPortalNotice, { props: { items: [{ text: '对象公告' }] } })
    expect(w.find('.lc-notice__text').text()).toBe('对象公告')
    w.unmount()
  })
})

/* ------------------------------------------------------------------ */
/* 数据卡                                                              */
/* ------------------------------------------------------------------ */

describe('PortalStat（数据卡）', () => {
  it('标题/副标题 + 数字格千分位与单位', () => {
    const w = mount(LcPortalStat, {
      props: {
        title: '经营概览',
        subtitle: '本月',
        items: [
          { label: '订单', value: 12345, unit: '单' },
          { label: '金额', value: '6789.5', unit: '元' },
          { label: '完成率', value: '92%' },
        ],
        columns: 3,
      },
    })
    expect(w.find('.lc-portal-stat__title').text()).toBe('经营概览')
    expect(w.find('.lc-portal-stat__subtitle').text()).toBe('本月')

    const cells = w.findAll('.lc-portal-stat__cell')
    expect(cells).toHaveLength(3)
    expect(cells[0]!.find('.lc-portal-stat__value').text()).toBe('12,345')
    expect(cells[0]!.find('.lc-portal-stat__unit').text()).toBe('单')
    expect(cells[1]!.find('.lc-portal-stat__value').text()).toBe('6,789.5')
    // 非数值原样展示（$expr 求值失败时也不崩）
    expect(cells[2]!.find('.lc-portal-stat__value').text()).toBe('92%')
    // 列宽按 columns 均分
    expect(cells[0]!.attributes('style')).toContain('33.333')
    w.unmount()
  })

  it('列数收敛 1~4；无数据 → 空态', async () => {
    const w = mount(LcPortalStat, { props: { items: [{ label: 'A', value: 1 }], columns: 9 } })
    expect(w.find('.lc-portal-stat__cell').attributes('style')).toContain('25%')
    await w.setProps({ columns: 0 })
    expect(w.find('.lc-portal-stat__cell').attributes('style')).toContain('100%')
    await w.setProps({ items: [] })
    expect(w.find('.lc-portal-stat__empty').exists()).toBe(true)
    w.unmount()
  })
})

/* ------------------------------------------------------------------ */
/* 待办列表                                                            */
/* ------------------------------------------------------------------ */

describe('PortalTodo（待办列表）', () => {
  function mountWithHost(todo: unknown, props: Record<string, unknown> = {}) {
    const host: LcFlowHost = {
      request: vi.fn(async () => ({ statusCode: 200, data: todo })),
    }
    const w = mount(LcPortalTodo, {
      props,
      global: { provide: { [LC_FLOW_HOST_KEY as symbol]: host } },
    })
    return { w, host }
  }

  it('静态数据优先：零请求，按 limit 截断，标题/标签/时间都渲染', async () => {
    const { w, host } = mountWithHost(undefined, {
      title: '待我处理',
      limit: 1,
      items: [
        { title: '报销审批', tag: '待审批', desc: '张三 · 10-28 09:30' },
        { title: '请假审批', tag: '已办' },
      ],
    })
    await flushPromises()
    expect(host.request).not.toHaveBeenCalled()
    expect(w.find('.lc-todo__title').text()).toBe('待我处理')
    expect(w.findAll('.lc-todo__row')).toHaveLength(1)
    expect(w.find('.lc-todo__flow').text()).toBe('报销审批')
    expect(w.find('.lc-todo__tag').text()).toBe('待审批')
    expect(w.find('.lc-todo__meta').text()).toBe('张三 · 10-28 09:30')
    // 条数徽标按截断后的可见行数（1）
    expect(w.find('.lc-todo__count').text()).toBe('1')
    w.unmount()
  })

  it('无静态数据 → 经宿主 GET /flows/tasks/todo 取数并渲染流程字段', async () => {
    const { w, host } = mountWithHost({
      items: [
        {
          taskId: 't1',
          flowName: '采购申请',
          nodeName: '部门经理审批',
          createdBy: '李四',
          createdAt: '2026-10-28T01:05:00.000Z',
        },
      ],
    })
    await flushPromises()
    expect(host.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/api/v1/flows/tasks/todo' }),
    )
    const row = w.find('.lc-todo__row')
    expect(row.find('.lc-todo__flow').text()).toBe('采购申请')
    expect(row.find('.lc-todo__tag').text()).toBe('部门经理审批')
    expect(row.find('.lc-todo__meta').text()).toContain('发起：李四')
    w.unmount()
  })

  it('limit 截断接口返回；点击行 emit index', async () => {
    const { w } = mountWithHost(
      { items: [{ flowName: 'A' }, { flowName: 'B' }, { flowName: 'C' }] },
      { limit: 2 },
    )
    await flushPromises()
    const rows = w.findAll('.lc-todo__row')
    expect(rows).toHaveLength(2)
    await rows[1]!.trigger('tap')
    expect(w.emitted('itemClick')).toEqual([[1]])
    w.unmount()
  })

  it('401 → 登录过期提示；空列表 → 暂无待办；autoLoad=false 不发请求', async () => {
    const deny: LcFlowHost = { request: vi.fn(async () => ({ statusCode: 401, data: null })) }
    const denied = mount(LcPortalTodo, {
      global: { provide: { [LC_FLOW_HOST_KEY as symbol]: deny } },
    })
    await flushPromises()
    expect(denied.find('.lc-todo__err').text()).toContain('登录已过期')
    denied.unmount()

    const empty = mount(LcPortalTodo, {
      global: { provide: { [LC_FLOW_HOST_KEY as symbol]: { request: vi.fn(async () => ({ statusCode: 200, data: { items: [] } })) } } },
    })
    await flushPromises()
    expect(empty.find('.lc-todo__state').text()).toContain('暂无待办')
    empty.unmount()

    const off = mount(LcPortalTodo, { props: { autoLoad: false } })
    await flushPromises()
    expect(off.find('.lc-todo__state').text()).toContain('暂无待办')
    off.unmount()
  })

  it('未注入宿主（老宿主）时不发请求、静默空态', async () => {
    const w = mount(LcPortalTodo)
    await flushPromises()
    expect(w.find('.lc-todo__state').text()).toContain('暂无待办')
    expect(w.find('.lc-todo__err').exists()).toBe(false)
    w.unmount()
  })
})
