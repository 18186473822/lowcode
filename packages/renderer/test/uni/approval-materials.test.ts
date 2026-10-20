/**
 * approval-materials.test.ts —— 审批物料行为锁（Phase 3 批 2）
 *
 * 覆盖 ApprovalBar / Timeline 的四类关键行为（B-18/B-19 同类缺陷的回归防线）：
 *  ① 画布安全：recordId 空 → 占位文案 + **零请求**（designer 画布 urlParams 恒空，误请求即脏）；
 *  ② 可审交互：running + 待办命中 → 同意/驳回按钮；decide 200 → emit('decided') + 重拉；
 *  ③ 权限边界：running 但待办未命中 → 无按钮只提示（服务端 decide 仍是权威）；
 *  ④ 终态展示：approved 横幅；Timeline 按 history 渲染中文动作与操作人。
 *
 * 边界：jsdom 无 `uni` 全局 → 意见输入走 host.confirm 降级链（与 designer 画布同路径）；
 *       物料直接 mount（不走 lc-node），数据通道经 provide 注入 mock host（D-P3-4）。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { LC_FLOW_HOST_KEY, type LcFlowHost } from '@lc/materials'
import LcApprovalBar from '@lc/materials/src/approval-bar/index.vue'
import LcTimeline from '@lc/materials/src/timeline/index.vue'

const NOW = '2026-10-15T10:00:00.000Z'

function runningInst() {
  return {
    id: 'i1',
    flowId: 'fl_demo',
    modelId: 'm_demo',
    recordId: 'r1',
    status: 'running',
    currentNodeId: 'n2',
    createdBy: 'admin',
    createdAt: NOW,
    updatedAt: NOW,
    tasks: [
      {
        id: 't1',
        nodeId: 'n2',
        nodeName: '部门审批',
        assignee: { type: 'role', value: 'dept_manager' },
        status: 'pending',
        createdAt: NOW,
      },
    ],
    history: [
      { nodeId: 'n1', nodeName: '提交', action: 'start', actor: 'admin', at: NOW },
    ],
  }
}

function approvedInst() {
  return {
    ...runningInst(),
    status: 'approved',
    currentNodeId: null,
    tasks: [
      { ...runningInst().tasks[0]!, status: 'approved', decidedBy: 'manager1', decidedAt: NOW },
    ],
    history: [
      { nodeId: 'n1', nodeName: '提交', action: 'start', actor: 'admin', at: NOW },
      { nodeId: 'n4', nodeName: '结束', action: 'end', actor: 'system', at: NOW },
    ],
  }
}

/** 按路径分发的 mock host（request 断言零调用 / 路由命中都可查；POST 后实例状态推进，模拟服务端真实语义） */
function mockHost(opts: {
  instances: unknown[]
  todo?: Array<{ taskId: string }>
  after?: unknown
}) {
  let items = opts.instances
  const request = vi.fn(
    async (req: { method: string; url: string; data?: unknown }): Promise<{ statusCode: number; data: unknown }> => {
      if (req.method === 'POST' && req.url.includes('/flows/instances/')) {
        // 审批动作推进状态 → 后续 GET 返回新状态（decide 后重拉即此链路）
        items = [opts.after ?? approvedInst()]
        return { statusCode: 200, data: items[0] }
      }
      if (req.url.includes('/flows/instances?')) {
        return { statusCode: 200, data: { items } }
      }
      if (req.url.includes('/flows/tasks/todo')) {
        return { statusCode: 200, data: { items: opts.todo ?? [] } }
      }
      return { statusCode: 404, data: { code: 'NOT_FOUND' } }
    },
  )
  const confirm = vi.fn(async () => true)
  return { host: { request, confirm } as unknown as LcFlowHost, request, confirm }
}

function mountBar(props: Record<string, unknown>, host: LcFlowHost | undefined) {
  return mount(LcApprovalBar, {
    props,
    global: host ? { provide: { [LC_FLOW_HOST_KEY as symbol]: host } } : {},
  })
}

function mountTl(props: Record<string, unknown>, host: LcFlowHost | undefined) {
  return mount(LcTimeline, {
    props,
    global: host ? { provide: { [LC_FLOW_HOST_KEY as symbol]: host } } : {},
  })
}

describe('ApprovalBar —— 审批操作条', () => {
  it('① recordId 空：占位提示 + 零请求（画布安全）', async () => {
    const { host, request } = mockHost({ instances: [runningInst()] })
    const w = mountBar({ recordId: '' }, host)
    await flushPromises()
    expect(w.text()).toContain('审批条（需绑定记录 id')
    expect(request).not.toHaveBeenCalled()
    w.unmount()
  })

  it('② running + 待办命中：按钮可见；点同意 → POST decide → emit decided → 状态重拉为 approved', async () => {
    const { host, request } = mockHost({
      instances: [runningInst()],
      todo: [{ taskId: 't1' }],
    })
    const w = mountBar({ recordId: 'r1' }, host)
    await flushPromises()

    expect(w.text()).toContain('同意')
    expect(w.text()).toContain('驳回')
    expect(w.text()).toContain('部门审批')

    // 点「同意」：jsdom 无 uni → host.confirm 降级（mock true）→ POST decide
    const btns = w.findAll('button')
    await btns[0]!.trigger('click')
    await flushPromises()

    const post = request.mock.calls.find(([r]) => r.method === 'POST')
    expect(post, '未发出 POST decide').toBeTruthy()
    expect(post![0].url).toContain('/flows/instances/i1/tasks/t1')
    expect((post![0].data as { action: string }).action).toBe('approve')

    const ev = w.emitted('decided')
    expect(ev, '未 emit decided').toBeTruthy()
    expect(ev![0]![0]).toMatchObject({ action: 'approve', instanceId: 'i1' })
    // decided 后重拉 → 终态横幅（after = approved 实例）
    await flushPromises()
    expect(w.text()).toContain('审批已通过')
    w.unmount()
  })

  it('③ running + 待办未命中：无按钮，只提示等待（服务端为权威）', async () => {
    const { host } = mockHost({ instances: [runningInst()], todo: [] })
    const w = mountBar({ recordId: 'r1' }, host)
    await flushPromises()
    expect(w.findAll('button')).toHaveLength(0)
    expect(w.text()).toContain('等待「部门审批」处理')
    w.unmount()
  })

  it('④ approved 终态：横幅 + 无操作按钮', async () => {
    const { host } = mockHost({ instances: [approvedInst()], todo: [] })
    const w = mountBar({ recordId: 'r1' }, host)
    await flushPromises()
    expect(w.text()).toContain('审批已通过')
    expect(w.findAll('button')).toHaveLength(0)
    w.unmount()
  })

  it('⑤ 无实例：「暂无审批流」空态（不抛错）', async () => {
    const { host } = mockHost({ instances: [] })
    const w = mountBar({ recordId: 'r1' }, host)
    await flushPromises()
    expect(w.text()).toContain('暂无审批流')
    w.unmount()
  })
})

describe('Timeline —— 流转时间轴', () => {
  it('① recordId 空：占位 + 零请求（画布安全）', async () => {
    const { host, request } = mockHost({ instances: [runningInst()] })
    const w = mountTl({ recordId: '' }, host)
    await flushPromises()
    expect(w.text()).toContain('时间轴（需绑定记录 id')
    expect(request).not.toHaveBeenCalled()
    w.unmount()
  })

  it('② history 渲染：中文动作 + 操作人 + 节点名', async () => {
    const { host } = mockHost({
      instances: [
        {
          ...approvedInst(),
          history: [
            { nodeId: 'n1', nodeName: '提交', action: 'start', actor: 'admin', at: NOW },
            { nodeId: 'n2', nodeName: '部门审批', action: 'approve', actor: 'manager1', comment: '同意-意见' },
            { nodeId: 'n4', nodeName: '结束', action: 'end', actor: 'system', at: NOW },
          ],
        },
      ],
    })
    const w = mountTl({ recordId: 'r1' }, host)
    await flushPromises()
    const text = w.text()
    expect(text).toContain('提交')
    expect(text).toContain('同意')
    expect(text).toContain('完成')
    expect(text).toContain('manager1')
    expect(text).toContain('同意-意见')
    w.unmount()
  })

  it('③ 无实例：「暂无流转记录」空态', async () => {
    const { host } = mockHost({ instances: [] })
    const w = mountTl({ recordId: 'r1' }, host)
    await flushPromises()
    expect(w.text()).toContain('暂无流转记录')
    w.unmount()
  })
})
