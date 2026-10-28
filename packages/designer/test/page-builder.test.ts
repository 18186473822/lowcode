/**
 * page-builder.test.ts —— 基于数据模型生成页面（2026-10-28）
 *
 * 覆盖：表单页字段/组件映射、提交绑定与初始值；列表/详情页的 modelId 与字段投影；
 * 主键与 auto 列排除；生成结果必须通过 validatePage；
 * 以及「模型即模块」：前缀规范化、三页成组生成与自动串联。
 */
import { describe, it, expect } from 'vitest'
import type { ModelSchema } from '@lc/schema'
import { validatePage } from '@lc/schema'
import {
  buildModelModule,
  buildModelPage,
  moduleBase,
  modulePageIds,
} from '../src/core/page-builder'

function model(): ModelSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'm_leave',
    name: '请假单',
    code: 'leave',
    fields: [
      { key: 'id', name: 'ID', type: 'id' },
      { key: 'title', name: '事由', type: 'string', required: true, placeholder: '请输入事由' },
      { key: 'reason', name: '说明', type: 'text' },
      { key: 'days', name: '天数', type: 'number' },
      { key: 'amount', name: '金额', type: 'money' },
      { key: 'urgent', name: '加急', type: 'boolean' },
      {
        key: 'kind',
        name: '类型',
        type: 'enum',
        options: [
          { label: '事假', value: 'personal' },
          { label: '病假', value: 'sick' },
        ],
      },
      { key: 'attachment', name: '附件', type: 'file', maxCount: 3 },
      { key: 'createdAt', name: '创建时间', type: 'datetime', auto: 'now' },
    ],
  }
}

describe('buildModelPage：表单页', () => {
  it('按模型字段生成控件，排除主键与 auto 列，并写入提交绑定', () => {
    const schema = buildModelPage({ pageId: 'p_leave_form', type: 'form', model: model() })

    expect(schema.type).toBe('form')
    expect(schema.id).toBe('p_leave_form')
    expect(schema.name).toBe('p_leave_form')

    const children = schema.root.children ?? []
    const fieldNodes = children.filter((n) => n.componentName !== 'Button')
    expect(fieldNodes.map((n) => n.props?.name)).toEqual([
      'title',
      'reason',
      'days',
      'amount',
      'urgent',
      'kind',
      'attachment',
    ])
    expect(fieldNodes.map((n) => n.componentName)).toEqual([
      'Input',
      'Textarea',
      'NumberInput',
      'MoneyInput',
      'Switch',
      'Select',
      'FileUpload',
    ])

    const title = fieldNodes.find((n) => n.props?.name === 'title')
    expect(title?.props).toMatchObject({
      label: '事由',
      required: true,
      placeholder: '请输入事由',
      value: '$expr: formData.title',
    })
    const kind = fieldNodes.find((n) => n.props?.name === 'kind')
    expect(kind?.props?.options).toEqual([
      { label: '事假', value: 'personal' },
      { label: '病假', value: 'sick' },
    ])

    // 提交按钮 + 提交绑定
    expect(children[children.length - 1]).toMatchObject({
      componentName: 'Button',
      props: { text: '提交', type: 'primary' },
      actions: [{ event: 'click', type: 'submit' }],
    })
    expect(schema.dataSources).toEqual([
      { id: 'ds_submit', name: '提交', type: 'model', method: 'POST', modelId: 'm_leave' },
    ])
    expect(schema.submit).toEqual({ dataSourceId: 'ds_submit' })

    // 初始值：布尔 false、文件 []，其余空串
    expect(schema.defaultFormData).toEqual({
      title: '',
      reason: '',
      days: '',
      amount: '',
      urgent: false,
      kind: '',
      attachment: [],
    })
  })

  it('生成结果通过协议校验', () => {
    const schema = buildModelPage({ pageId: 'p_leave_form', type: 'form', model: model() })
    const r = validatePage(schema)
    expect(r.errors).toEqual([])
    expect(r.valid).toBe(true)
  })

  it('模型没有可编辑字段时仍生成可提交的空表单', () => {
    const schema = buildModelPage({
      pageId: 'p_empty',
      type: 'form',
      model: { ...model(), fields: [{ key: 'id', name: 'ID', type: 'id' }] },
    })
    expect(schema.root.children).toHaveLength(1)
    expect(schema.root.children?.[0].componentName).toBe('Button')
    expect(schema.defaultFormData).toEqual({})
  })
})

describe('buildModelPage：列表 / 详情页', () => {
  it('列表页写入 list.modelId 与展示字段（保留主键、排除 auto）', () => {
    const schema = buildModelPage({ pageId: 'p_leave_list', type: 'list', model: model() })
    expect(schema.type).toBe('list')
    expect(schema.list).toEqual({
      modelId: 'm_leave',
      columns: ['id', 'title', 'reason', 'days', 'amount', 'urgent', 'kind', 'attachment'],
    })
    expect(schema.root.children).toEqual([])
    expect(validatePage(schema).errors).toEqual([])
  })

  it('详情页写入 detail.modelId 与展示字段', () => {
    const schema = buildModelPage({ pageId: 'p_leave_detail', type: 'detail', model: model() })
    expect(schema.type).toBe('detail')
    expect(schema.detail?.modelId).toBe('m_leave')
    expect(schema.detail?.fields).toEqual([
      'id',
      'title',
      'reason',
      'days',
      'amount',
      'urgent',
      'kind',
      'attachment',
    ])
    expect(validatePage(schema).errors).toEqual([])
  })

  it('列表 / 详情不修改 model 入参（纯函数）', () => {
    const m = model()
    const before = JSON.stringify(m)
    buildModelPage({ pageId: 'p_x', type: 'list', model: m })
    buildModelPage({ pageId: 'p_y', type: 'detail', model: m })
    expect(JSON.stringify(m)).toBe(before)
  })
})

describe('moduleBase / modulePageIds：前缀规范化', () => {
  it('剥掉 p_ 前缀与 _list / _form / _detail 尾巴', () => {
    expect(moduleBase('leave')).toBe('leave')
    expect(moduleBase('p_leave')).toBe('leave')
    expect(moduleBase('p_leave_list')).toBe('leave')
    expect(moduleBase('m_leave_form')).toBe('m_leave')
    expect(moduleBase('  请假  ')).toBe('__')
  })

  it('非法开头补 p_ 前缀，空串返回空', () => {
    expect(moduleBase('1leave')).toBe('p_1leave')
    expect(moduleBase('   ')).toBe('')
  })

  it('页面 id 固定为 p_<base>_<type>', () => {
    expect(modulePageIds('leave')).toEqual({
      list: 'p_leave_list',
      form: 'p_leave_form',
      detail: 'p_leave_detail',
    })
  })
})

describe('buildModelModule：一个模型 = 一套页面', () => {
  it('默认生成三页，并按「列表 → 表单 → 详情」排序', () => {
    const mod = buildModelModule({ model: model(), base: 'leave' })
    expect(mod.base).toBe('leave')
    expect(mod.pages.map((p) => p.type)).toEqual(['list', 'form', 'detail'])
    expect(mod.pages.map((p) => p.id)).toEqual([
      'p_leave_list',
      'p_leave_form',
      'p_leave_detail',
    ])
    // 每页都必须过协议校验 —— 生成器是「可直接保存」的
    for (const page of mod.pages) expect(validatePage(page).errors).toEqual([])
  })

  it('三页自动串联：列表进详情、详情回列表、表单提交回列表', () => {
    const [list, form, detail] = buildModelModule({ model: model(), base: 'p_leave_list' }).pages

    expect(list.type).toBe('list')
    expect(list.list?.detailPageId).toBe('p_leave_detail')

    expect(form.type).toBe('form')
    expect(form.submit?.successAction).toEqual({
      event: 'success',
      type: 'navigate',
      value: { pageId: 'p_leave_list', mode: 'redirect' },
    })

    expect(detail.type).toBe('detail')
    expect(detail.detail?.backPageId).toBe('p_leave_list')
  })

  it('页面名用模型名（列表=模型名 / 表单=新建… / 详情=…详情）', () => {
    const [list, form, detail] = buildModelModule({ model: model(), base: 'leave' }).pages
    expect(list.name).toBe('请假单')
    expect(form.name).toBe('新建请假单')
    expect(detail.name).toBe('请假单详情')
  })

  it('只勾部分页面时，不写出悬空跳转', () => {
    const onlyList = buildModelModule({ model: model(), base: 'leave', types: ['list'] })
    expect(onlyList.pages.map((p) => p.type)).toEqual(['list'])
    expect(onlyList.pages[0].list?.detailPageId).toBeUndefined()

    const onlyForm = buildModelModule({ model: model(), base: 'leave', types: ['form'] })
    expect(onlyForm.pages).toHaveLength(1)
    expect(onlyForm.pages[0].submit?.successAction).toBeUndefined()

    const onlyDetail = buildModelModule({ model: model(), base: 'leave', types: ['detail'] })
    expect(onlyDetail.pages[0].detail?.backPageId).toBeUndefined()
  })

  it('支持覆盖页面 id，并按覆盖值串联', () => {
    const mod = buildModelModule({
      model: model(),
      base: 'leave',
      types: ['list', 'detail'],
      ids: { list: 'p_custom_list', detail: 'p_custom_detail' },
    })
    expect(mod.pages[0].id).toBe('p_custom_list')
    expect(mod.pages[0].list?.detailPageId).toBe('p_custom_detail')
    expect(mod.pages[1].detail?.backPageId).toBe('p_custom_list')
  })

  it('不修改 model 入参（纯函数）', () => {
    const m = model()
    const before = JSON.stringify(m)
    buildModelModule({ model: m, base: 'leave' })
    expect(JSON.stringify(m)).toBe(before)
  })
})
