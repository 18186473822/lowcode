/**
 * 流程定义校验（validateFlow，Phase 3 批 1）：结构硬约束 / 审批人 / 条件表达式 / 引用完整性。
 * 夹具取主方案 8.6 原文 JSON（fl_expense）。
 */
import { describe, it, expect } from 'vitest'
import { validateFlow, type FlowSchema } from '../src/index.js'

/** 主方案 8.6 原文流程（合法夹具；含 start 带 assignee、dept 审批人两处 warning 素材） */
function flow86(): FlowSchema {
  return {
    flowId: 'fl_expense',
    name: '费用报销审批',
    modelId: 'md_expense',
    mode: 'condition',
    nodes: [
      { id: 'n1', name: '提交', type: 'start', assignee: { type: 'starter' } },
      {
        id: 'n2',
        name: '部门审批',
        type: 'approve',
        assignee: { type: 'role', value: 'dept_manager' },
        condition: 'formData.amount > 1000',
        onReject: 'n1',
      },
      { id: 'n3', name: '财务审批', type: 'approve', assignee: { type: 'dept', value: 'finance' } },
      { id: 'n4', name: '结束', type: 'end', onApprove: { setField: { status: 'approved' } } },
    ],
  }
}

const has = (rs: { code: string }[], code: string, path?: string): boolean =>
  rs.some((e) => e.code === code && (path === undefined || (e as { path?: string }).path === path))

describe('validateFlow —— 合法定义', () => {
  it('8.6 原文流程校验通过（errors 0；dept/start 两处降级 warning）', () => {
    const r = validateFlow(flow86())
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
    expect(has(r.warnings, 'W_FLOW_DEPT_ASSIGNEE', 'nodes[2].assignee')).toBe(true)
    expect(has(r.warnings, 'W_FLOW_START_ASSIGNEE', 'nodes[0].assignee')).toBe(true)
  })

  it('极简线性流程（无 condition/不带 start assignee）零 warning 通过', () => {
    const r = validateFlow({
      flowId: 'fl_simple',
      name: '简单审批',
      modelId: 'md_x',
      mode: 'linear',
      nodes: [
        { id: 's', name: '提交', type: 'start' },
        { id: 'a', name: '审批', type: 'approve', assignee: { type: 'role', value: 'admin' } },
        { id: 'e', name: '结束', type: 'end', onApprove: { setField: { status: 'ok' } } },
      ],
    })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })
})

describe('validateFlow —— 顶层字段', () => {
  it('非对象 → E_FLOW_INVALID', () => {
    expect(has(validateFlow(null).errors, 'E_FLOW_INVALID')).toBe(true)
    expect(has(validateFlow('x').errors, 'E_FLOW_INVALID')).toBe(true)
  })

  it('flowId 缺失/不合标识、name 缺失、modelId 缺失、mode 非法 → 各自报错', () => {
    const bad: any = { ...flow86(), flowId: '9bad id', name: '  ', modelId: '', mode: 'xxx' }
    const r = validateFlow(bad)
    expect(has(r.errors, 'E_FLOW_ID', 'flowId')).toBe(true)
    expect(has(r.errors, 'E_FLOW_NAME', 'name')).toBe(true)
    expect(has(r.errors, 'E_FLOW_MODEL', 'modelId')).toBe(true)
    expect(has(r.errors, 'E_FLOW_MODE', 'mode')).toBe(true)
  })

  it('nodes 非数组或空 → E_FLOW_NODES_EMPTY', () => {
    expect(has(validateFlow({ ...flow86(), nodes: [] }).errors, 'E_FLOW_NODES_EMPTY')).toBe(true)
    expect(has(validateFlow({ ...flow86(), nodes: 'x' }).errors, 'E_FLOW_NODES_EMPTY')).toBe(true)
  })

  it('startPageId：缺省合法；合法页面编码通过；非法/非串 → E_FLOW_START_PAGE', () => {
    // 缺省 = 不能从门户发起，仍是合法流程
    expect(validateFlow(flow86()).valid).toBe(true)
    expect(validateFlow({ ...flow86(), startPageId: 'p_leave' }).valid).toBe(true)

    const badId = validateFlow({ ...flow86(), startPageId: '9-bad' })
    expect(has(badId.errors, 'E_FLOW_START_PAGE', 'startPageId')).toBe(true)

    const badType = validateFlow({ ...flow86(), startPageId: 123 })
    expect(has(badType.errors, 'E_FLOW_START_PAGE', 'startPageId')).toBe(true)
  })
})

describe('validateFlow —— 结构硬约束', () => {
  it('首节点非 start → E_FLOW_START_POS', () => {
    const f: any = flow86()
    f.nodes[0] = { id: 'x', name: 'X', type: 'approve', assignee: { type: 'starter' } }
    expect(has(validateFlow(f).errors, 'E_FLOW_START_POS', 'nodes[0]')).toBe(true)
  })

  it('末节点非 end → E_FLOW_END_POS', () => {
    const f: any = flow86()
    f.nodes[f.nodes.length - 1] = { id: 'x', name: 'X', type: 'start' }
    expect(has(validateFlow(f).errors, 'E_FLOW_END_POS')).toBe(true)
  })

  it('无 approve 节点 → E_FLOW_APPROVE_MISSING', () => {
    const r = validateFlow({
      flowId: 'f', name: 'n', modelId: 'm', mode: 'linear',
      nodes: [{ id: 's', name: '提交', type: 'start' }, { id: 'e', name: '结束', type: 'end' }],
    })
    expect(has(r.errors, 'E_FLOW_APPROVE_MISSING')).toBe(true)
  })

  it('节点 id 重复 → E_FLOW_NODE_ID', () => {
    const f: any = flow86()
    f.nodes[1] = { ...f.nodes[1], id: 'n1' }
    const r = validateFlow(f)
    expect(has(r.errors, 'E_FLOW_NODE_ID', 'nodes[1].id')).toBe(true)
  })

  it('onReject 指向不存在的节点 → E_FLOW_ONREJECT_REF', () => {
    const f: any = flow86()
    f.nodes[1].onReject = 'ghost'
    expect(has(validateFlow(f).errors, 'E_FLOW_ONREJECT_REF', 'nodes[1].onReject')).toBe(true)
  })
})

describe('validateFlow —— 审批人与表达式', () => {
  it('approve 缺 assignee / role 无 value / type 非法 → E_FLOW_ASSIGNEE', () => {
    const noA: any = flow86(); delete noA.nodes[1].assignee
    expect(has(validateFlow(noA).errors, 'E_FLOW_ASSIGNEE', 'nodes[1].assignee')).toBe(true)

    const noV: any = flow86(); noV.nodes[1].assignee = { type: 'role' }
    expect(has(validateFlow(noV).errors, 'E_FLOW_ASSIGNEE', 'nodes[1].assignee.value')).toBe(true)

    const badT: any = flow86(); badT.nodes[1].assignee = { type: 'robot' }
    expect(has(validateFlow(badT).errors, 'E_FLOW_ASSIGNEE', 'nodes[1].assignee.type')).toBe(true)
  })

  it('checkExpr 判失败的 condition → E_EXPR_SYNTAX；注入通过则不报', () => {
    const failing = {
      checkExpr: (e: string) => (e.includes('>') ? { ok: false, message: '故意失败' } : { ok: true }),
    }
    const r1 = validateFlow(flow86(), failing)
    expect(has(r1.errors, 'E_EXPR_SYNTAX', 'nodes[1].condition')).toBe(true)

    const passing = { checkExpr: () => ({ ok: true }) }
    expect(validateFlow(flow86(), passing).valid).toBe(true)
  })

  it('condition 非字符串 → E_FLOW_CONDITION', () => {
    const f: any = flow86(); f.nodes[1].condition = 123
    expect(has(validateFlow(f).errors, 'E_FLOW_CONDITION', 'nodes[1].condition')).toBe(true)
  })

  it('mode=linear 带 condition → W_FLOW_CONDITION_IGNORED（valid 仍 true）', () => {
    const f: any = flow86(); f.mode = 'linear'
    const r = validateFlow(f)
    expect(r.valid).toBe(true)
    expect(has(r.warnings, 'W_FLOW_CONDITION_IGNORED', 'nodes[1].condition')).toBe(true)
  })

  it('onApprove 形状不符 → E_FLOW_ONAPPROVE；end 缺 setField → W_FLOW_END_NO_SETFIELD', () => {
    const f: any = flow86()
    f.nodes[1].onApprove = { foo: 1 }
    f.nodes[3].onApprove = undefined
    const r = validateFlow(f)
    expect(has(r.errors, 'E_FLOW_ONAPPROVE', 'nodes[1].onApprove')).toBe(true)
    expect(has(r.warnings, 'W_FLOW_END_NO_SETFIELD', 'nodes[3].onApprove')).toBe(true)
  })
})
