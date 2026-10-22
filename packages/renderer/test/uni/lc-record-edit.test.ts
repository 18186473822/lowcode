/**
 * Phase 4：标准详情页的记录编辑/删除入口。
 *
 * 重点不是「按钮能点」，而是写请求契约：
 *  - 必须带 If-Match（由响应体 revision 构造，不能依赖 uni 响应头）；
 *  - 409 不自动覆盖、不自动重试，保留草稿并给「重新加载」出口；
 *  - 400 RECORD_INVALID 的字段错误落到对应控件；
 *  - 未配置 editable/deletable 的存量详情页保持只读。
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createEmptyPage, type PageSchema } from '@lc/schema'
import type { PageControllerOptions } from '../../src/core/controller.js'
import LcDetailPage from '../../src/uni/lc-detail-page.vue'

const baseRecord: Record<string, unknown> = {
  id: 'r1',
  revision: 3,
  empName: '张三',
  dept: '技术部',
  active: true,
  level: 'A',
  meta: { a: 1 },
  age: 18,
}

const modelDef = {
  schemaVersion: '1.0.0',
  id: 'm_e',
  name: '员工',
  code: 'm_e',
  fields: [
    { key: 'empName', name: '姓名', type: 'string', required: true },
    { key: 'dept', name: '部门', type: 'string' },
    { key: 'active', name: '在职', type: 'boolean' },
    {
      key: 'level',
      name: '级别',
      type: 'enum',
      options: [
        { label: '初级', value: 'A' },
        { label: '高级', value: 'B' },
      ],
    },
    { key: 'meta', name: '扩展', type: 'json' },
    { key: 'age', name: '年龄', type: 'number' },
  ],
}

interface HostOptions {
  /** 自定义 PUT 响应（不设置时按 payload 成功合并并 revision+1） */
  putResp?: { statusCode: number; data: unknown }
  /** 自定义 DELETE 响应（不设置时成功） */
  deleteResp?: { statusCode: number; data: unknown }
  /** 模型定义请求失败（验证不会把整条记录降级成文本编辑） */
  modelFail?: boolean
}

function makeHost(opts: HostOptions = {}) {
  let record = { ...baseRecord }
  const request = vi.fn(
    async (req: {
      method: string
      url: string
      headers?: Record<string, string>
      data?: unknown
    }): Promise<{ statusCode: number; data: unknown }> => {
      if (req.method === 'PUT') {
        if (opts.putResp) return opts.putResp
        record = {
          ...record,
          ...(req.data as Record<string, unknown>),
          revision: Number(record.revision ?? 0) + 1,
        }
        return { statusCode: 200, data: record }
      }
      if (req.method === 'DELETE') {
        if (opts.deleteResp) return opts.deleteResp
        return { statusCode: 200, data: { id: 'r1', revision: Number(record.revision ?? 0) + 1 } }
      }
      if (req.method === 'GET' && req.url.includes('/records')) {
        return { statusCode: 200, data: { items: [record], total: 1, page: 1, size: 1 } }
      }
      if (req.method === 'GET' && req.url.includes('/models/m_e')) {
        if (opts.modelFail) return { statusCode: 500, data: { message: 'model fail' } }
        return { statusCode: 200, data: modelDef }
      }
      return { statusCode: 404, data: { message: 'nf' } }
    },
  )
  const confirm = vi.fn(async () => true)
  const toast = vi.fn()
  return {
    host: { request, confirm, toast } as unknown as PageControllerOptions['host'],
    request,
    confirm,
    toast,
    /** 模拟他人先修改了记录（下一次重新加载会拿到新值） */
    setRecord: (patch: Record<string, unknown>) => {
      record = { ...record, ...patch }
    },
  }
}

function mountDetail(
  detail: NonNullable<PageSchema['detail']>,
  opts: HostOptions = {},
): ReturnType<typeof makeHost> & { w: ReturnType<typeof mount> } {
  const p = createEmptyPage('p_d', '员工详情')
  p.type = 'detail'
  p.detail = detail
  const h = makeHost(opts)
  const w = mount(LcDetailPage, {
    props: { schema: p, options: { host: h.host } as unknown as PageControllerOptions, recordId: 'r1' },
    // jsdom 不提供 uni-app 的 <picker> 内置组件：用透传 slot 的桩替代，避免无意义告警
    global: { stubs: { picker: { template: '<div><slot /></div>' } } },
  })
  return { ...h, w }
}

function callsOf(request: ReturnType<typeof vi.fn>, method: string) {
  return request.mock.calls
    .map((c) => c[0] as { method: string; url: string; headers?: Record<string, string>; data?: unknown })
    .filter((c) => c.method === method)
}

describe('lc-detail-page 记录编辑/删除（Phase 4）', () => {
  it('存量详情页（未配置 editable/deletable）不显示写操作按钮', async () => {
    const { w } = mountDetail({ modelId: 'm_e' })
    await flushPromises()
    expect(w.find('[data-testid="detail-edit"]').exists()).toBe(false)
    expect(w.find('[data-testid="detail-delete"]').exists()).toBe(false)
  })

  it('模型定义加载失败时不进入编辑（避免把记录降级成一堆文本字段）', async () => {
    const { w } = mountDetail({ modelId: 'm_e', editable: true }, { modelFail: true })
    await flushPromises()
    await w.get('[data-testid="detail-edit"]').trigger('tap')
    await flushPromises()
    expect(w.find('[data-testid="record-editor"]').exists()).toBe(false)
    expect(w.text()).toContain('模型定义加载失败')
  })

  it('编辑保存：PUT 带 If-Match、按字段类型转换、成功后刷新记录并 emit saved', async () => {
    const { w, request } = mountDetail({ modelId: 'm_e', editable: true })
    await flushPromises()
    await w.get('[data-testid="detail-edit"]').trigger('tap')
    await flushPromises()
    expect(w.find('[data-testid="record-editor"]').exists()).toBe(true)

    await w.get('[data-testid="edit-empName"]').setValue('李四')
    await w.get('[data-testid="edit-age"]').setValue('19')
    await w.get('[data-testid="record-edit-save"]').trigger('tap')
    await flushPromises()

    const puts = callsOf(request, 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0]!.headers?.['if-match']).toBe('"record:m_e/r1:3"')
    expect(puts[0]!.data).toMatchObject({
      empName: '李四',
      dept: '技术部',
      active: true,
      level: 'A',
      meta: { a: 1 },
      age: 19,
    })

    expect(w.find('[data-testid="record-editor"]').exists()).toBe(false)
    expect(w.text()).toContain('李四')
    expect(w.emitted('saved')).toEqual([[{ id: 'r1', revision: 4 }]])
  })

  it('取消编辑：不发 PUT，恢复只读展示', async () => {
    const { w, request } = mountDetail({ modelId: 'm_e', editable: true })
    await flushPromises()
    await w.get('[data-testid="detail-edit"]').trigger('tap')
    await flushPromises()
    await w.get('[data-testid="edit-empName"]').setValue('李四')
    await w.get('[data-testid="record-edit-cancel"]').trigger('tap')
    await flushPromises()

    expect(w.find('[data-testid="record-editor"]').exists()).toBe(false)
    expect(w.text()).toContain('张三')
    expect(callsOf(request, 'PUT')).toHaveLength(0)
  })

  it('400 RECORD_INVALID：字段错误落到控件，保留编辑态且不重试', async () => {
    const { w, request } = mountDetail(
      { modelId: 'm_e', editable: true },
      {
        putResp: {
          statusCode: 400,
          data: {
            code: 'RECORD_INVALID',
            message: '记录校验未通过',
            errors: [{ path: 'empName', message: '姓名已存在' }],
          },
        },
      },
    )
    await flushPromises()
    await w.get('[data-testid="detail-edit"]').trigger('tap')
    await flushPromises()
    await w.get('[data-testid="record-edit-save"]').trigger('tap')
    await flushPromises()

    expect(w.find('[data-testid="record-editor"]').exists()).toBe(true)
    expect(w.text()).toContain('姓名已存在')
    expect(w.text()).toContain('本次保存未生效')
    expect(callsOf(request, 'PUT')).toHaveLength(1)
  })

  it('客户端先拦截非法 JSON 与必填空值，不把无效请求发给服务端', async () => {
    const { w, request } = mountDetail({ modelId: 'm_e', editable: true })
    await flushPromises()
    await w.get('[data-testid="detail-edit"]').trigger('tap')
    await flushPromises()

    await w.get('[data-testid="edit-meta"]').setValue('{bad')
    await w.get('[data-testid="record-edit-save"]').trigger('tap')
    await flushPromises()
    expect(w.text()).toContain('扩展必须是合法 JSON')

    await w.get('[data-testid="edit-meta"]').setValue('{"ok":1}')
    await w.get('[data-testid="edit-empName"]').setValue('')
    await w.get('[data-testid="record-edit-save"]').trigger('tap')
    await flushPromises()
    expect(w.text()).toContain('请填写姓名')
    expect(callsOf(request, 'PUT')).toHaveLength(0)
  })

  it('409 版本冲突：不覆盖、不自动重试；重新加载后才展示他人修改', async () => {
    const { w, request, setRecord } = mountDetail(
      { modelId: 'm_e', editable: true },
      {
        putResp: {
          statusCode: 409,
          data: { code: 'VERSION_CONFLICT', message: '版本冲突', currentRevision: 9 },
        },
      },
    )
    await flushPromises()
    await w.get('[data-testid="detail-edit"]').trigger('tap')
    await flushPromises()
    await w.get('[data-testid="edit-empName"]').setValue('我的修改')
    setRecord({ empName: '王五', revision: 9 })
    await w.get('[data-testid="record-edit-save"]').trigger('tap')
    await flushPromises()

    expect(callsOf(request, 'PUT')).toHaveLength(1)
    expect(w.find('[data-testid="record-editor"]').exists()).toBe(true)
    expect(w.text()).toContain('本次保存未生效')
    expect(w.text()).toContain('服务端当前版本 9')
    expect(w.text()).not.toContain('王五')

    await w.get('[data-testid="detail-reload-latest"]').trigger('tap')
    await flushPromises()
    expect(w.find('[data-testid="record-editor"]').exists()).toBe(false)
    expect(w.text()).toContain('王五')
    expect(callsOf(request, 'PUT')).toHaveLength(1)
  })

  it('删除：确认后用当前 revision 发 DELETE + If-Match，成功 emit deleted 并返回', async () => {
    const { w, request, confirm } = mountDetail({ modelId: 'm_e', deletable: true })
    await flushPromises()
    await w.get('[data-testid="detail-delete"]').trigger('tap')
    await flushPromises()

    expect(confirm).toHaveBeenCalledTimes(1)
    const dels = callsOf(request, 'DELETE')
    expect(dels).toHaveLength(1)
    expect(dels[0]!.headers?.['if-match']).toBe('"record:m_e/r1:3"')
    expect(w.emitted('deleted')).toEqual([[{ id: 'r1' }]])
    expect(w.emitted('back')).toHaveLength(1)
  })

  it('删除取消：不发请求；删除 409：不 emit deleted/back，提示重新加载', async () => {
    const canceled = mountDetail({ modelId: 'm_e', deletable: true })
    await flushPromises()
    canceled.confirm.mockResolvedValueOnce(false)
    await canceled.w.get('[data-testid="detail-delete"]').trigger('tap')
    await flushPromises()
    expect(callsOf(canceled.request, 'DELETE')).toHaveLength(0)

    const conflicted = mountDetail(
      { modelId: 'm_e', deletable: true },
      {
        deleteResp: {
          statusCode: 409,
          data: { code: 'VERSION_CONFLICT', message: '版本冲突', currentRevision: 5 },
        },
      },
    )
    await flushPromises()
    await conflicted.w.get('[data-testid="detail-delete"]').trigger('tap')
    await flushPromises()
    expect(conflicted.w.emitted('deleted')).toBeUndefined()
    expect(conflicted.w.emitted('back')).toBeUndefined()
    expect(conflicted.w.text()).toContain('本次删除未生效')
    expect(conflicted.w.find('[data-testid="detail-reload-latest"]').exists()).toBe(true)
  })
})
