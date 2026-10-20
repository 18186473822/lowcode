/**
 * state-kind.test.ts —— 移动端异常状态分类（design-system.md §5）
 *
 * 覆盖重点：
 *   ① 401 / 403 / 404 必须分流成不同状态与出口 —— 这是「不静默」的核心；
 *   ② 网络失败的**本仓契约**是 `resolve({ statusCode: 0 })` 而非 reject（见 runtime/src/host.ts），
 *      分类器要能识别，且不能把「配置缺少 modelId」这类非网络异常误判成网络中断；
 *   ③ 状态码只存在于消息文本里的错误（renderer 现有格式「请求失败（401）：url」）也要能分类。
 */
import { describe, it, expect } from 'vitest'
import {
  classifyError,
  emptyState,
  loadingState,
  statusOf,
  isNetworkError,
} from '../src/core/state-kind'

describe('statusOf：取 HTTP 状态码', () => {
  it('结构化字段优先（ApiError.status）', () => {
    expect(statusOf({ status: 401 })).toBe(401)
    expect(statusOf({ statusCode: 403 })).toBe(403)
  })

  it('退回消息文本（renderer 既有格式「请求失败（401）：url」）', () => {
    expect(statusOf(new Error('请求失败（401）：/api/v1/models'))).toBe(401)
    expect(statusOf(new Error('请求失败(403): /x'))).toBe(403)
  })

  it('取不到返回 0（网络层失败的信号）', () => {
    expect(statusOf(new Error('boom'))).toBe(0)
    expect(statusOf(undefined)).toBe(0)
  })
})

describe('isNetworkError：区分网络层与服务端错误码', () => {
  it('statusCode 0 + 空/网络特征消息 → 网络失败', () => {
    expect(isNetworkError({ statusCode: 0 })).toBe(true)
    expect(isNetworkError(new Error('request:fail'))).toBe(true)
    expect(isNetworkError(new Error('无法连接服务端'))).toBe(true)
  })

  it('配置类异常（无状态码、非网络特征）不算网络失败', () => {
    expect(isNetworkError(new Error('列表配置缺少 modelId'))).toBe(false)
    expect(isNetworkError(new Error('model 数据源缺少 modelId'))).toBe(false)
  })

  it('有明确状态码时按消息特征判', () => {
    expect(isNetworkError({ statusCode: 500 })).toBe(false)
  })
})

describe('classifyError：按状态分流到不同出口', () => {
  it('401 → 引导重新登录，且说明「已填内容不会丢」', () => {
    const s = classifyError({ status: 401 }, { pageId: 'emp_form' })
    expect(s.kind).toBe('no-auth')
    expect(s.actionText).toBe('去登录')
    expect(s.text).toContain('不会丢')
  })

  it('403 → 提示无权限 + 返回菜单，并指明是哪个页面', () => {
    const s = classifyError({ status: 403 }, { pageId: 'emp_form' })
    expect(s.kind).toBe('forbidden')
    expect(s.actionText).toBe('返回菜单')
    expect(s.text).toContain('emp_form')
  })

  it('404 → 页面不存在（不给「重试」，重试无意义）', () => {
    const s = classifyError({ status: 404 })
    expect(s.kind).toBe('not-found')
    expect(s.actionText).toBeUndefined()
  })

  it('网络中断 → 提示已加载内容仍在 + 重试', () => {
    const s = classifyError({ statusCode: 0 })
    expect(s.kind).toBe('error')
    expect(s.title).toBe('网络连接中断')
    expect(s.text).toContain('仍在')
    expect(s.actionText).toBe('重试')
  })

  it('5xx 等服务端错误 → 就地显示可核对信息 + 重试', () => {
    const s = classifyError({ statusCode: 500 })
    expect(s.kind).toBe('error')
    expect(s.actionText).toBe('重试')
    expect(s.text).toContain('500')
  })

  it('消息里带状态码的 Error 同样能分类', () => {
    expect(classifyError(new Error('模型取数失败（401）')).kind).toBe('no-auth')
    expect(classifyError(new Error('模型取数失败（403）')).kind).toBe('forbidden')
  })
})

describe('空态 / 加载态：必须有出口', () => {
  it('空态默认带出口动作', () => {
    const s = emptyState('当前模型下还没有记录。', '重新加载')
    expect(s.kind).toBe('empty')
    expect(s.actionText).toBe('重新加载')
    expect(s.title).not.toBe('暂无数据') // 规范禁止只写「暂无数据」
  })

  it('加载态区分首屏与翻页', () => {
    expect(loadingState(0).text).toBe('')
    expect(loadingState(12).title).toContain('更多')
    expect(loadingState(12).text).toContain('12')
  })
})
