/**
 * material-controlled-value.test.ts —— 受控值类型回显回归（2026-10-30 A+B 批）
 *
 * 背景：schema 里的字段值经 JSON / 表单 / 接口往返后类型可能漂移（`1` ↔ `"1"`）。
 *       Picker / UserPicker / DeptPicker / Cascader / Checkbox 此前用严格 `===` /
 *       `includes` 反查，类型不一致时会出现「有值但显示请选择」「已选项不显示勾」
 *       「点已选项变新增」等假空态。本文件锁住宽松比较行为。
 *
 * 边界：直接 mount 真实物料（jsdom 下 `picker` 为未知标签，子节点仍正常渲染）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LcPicker from '@lc/materials/src/picker/index.vue'
import LcUserPicker from '@lc/materials/src/user-picker/index.vue'
import LcDeptPicker from '@lc/materials/src/dept-picker/index.vue'
import LcCascader from '@lc/materials/src/cascader/index.vue'
import LcCheckbox from '@lc/materials/src/checkbox/index.vue'

describe('Picker 族 —— number/string 受控值回显', () => {
  it('Picker：value="2" 能命中数字 value 的选项', () => {
    const w = mount(LcPicker, {
      props: {
        options: [
          { label: '年假', value: 1 },
          { label: '事假', value: 2 },
        ],
        value: '2',
      },
    })
    expect(w.find('.lc-picker__value').text()).toBe('事假')
    w.unmount()
  })

  it('Picker：value 为 null/undefined → 占位文案，不误选第一项', () => {
    const options = [
      { label: '年假', value: 1 },
      { label: '事假', value: 2 },
    ]
    const nil = mount(LcPicker, { props: { options, value: null } })
    expect(nil.find('.lc-picker__placeholder').text()).toBe('请选择')
    nil.unmount()

    const undef = mount(LcPicker, { props: { options } })
    expect(undef.find('.lc-picker__placeholder').text()).toBe('请选择')
    undef.unmount()
  })

  it('UserPicker：value=7 能命中字符串 value 的候选人', () => {
    const w = mount(LcUserPicker, {
      props: {
        candidates: [
          { label: '张三', value: '7' },
          { label: '李四', value: '8' },
        ],
        value: 7,
      },
    })
    expect(w.find('.lc-user-picker__value').text()).toBe('张三')
    w.unmount()

    const nil = mount(LcUserPicker, {
      props: { candidates: [{ label: '张三', value: '7' }], value: null },
    })
    expect(nil.find('.lc-user-picker__placeholder').text()).toBe('请选择人员')
    nil.unmount()
  })

  it('DeptPicker：value="3" 能命中数字 value 的部门', () => {
    const w = mount(LcDeptPicker, {
      props: {
        candidates: [
          { label: '研发部', value: 3 },
          { label: '财务部', value: 4 },
        ],
        value: '3',
      },
    })
    expect(w.find('.lc-dept-picker__value').text()).toBe('研发部')
    w.unmount()

    const nil = mount(LcDeptPicker, {
      props: { candidates: [{ label: '研发部', value: 3 }], value: undefined },
    })
    expect(nil.find('.lc-dept-picker__placeholder').text()).toBe('请选择部门')
    nil.unmount()
  })
})

describe('Cascader —— number/string 路径反查', () => {
  const options = [
    {
      label: '广东省',
      value: 1,
      children: [{ label: '深圳市', value: 2 }],
    },
    { label: '浙江省', value: 3, children: [] },
  ]

  it('value=["1","2"]（字符串）能命中数字 value 的两级路径', () => {
    const w = mount(LcCascader, { props: { options, value: ['1', '2'] } })
    expect(w.findAll('.lc-cascader__value').map((n) => n.text())).toEqual(['广东省', '深圳市'])
    w.unmount()
  })

  it('路径断在未匹配层级 → 只回显已匹配部分，其余是占位', () => {
    const w = mount(LcCascader, { props: { options, value: ['1', '999'] } })
    expect(w.findAll('.lc-cascader__value').map((n) => n.text())).toEqual(['广东省'])
    expect(w.find('.lc-cascader__placeholder').text()).toBe('请选择')
    w.unmount()
  })
})

describe('Checkbox —— number/string 勾选与删除', () => {
  const options = [
    { label: 'A', value: '1' },
    { label: 'B', value: '2' },
  ]

  it('value=[1]（数字）能勾中字符串选项；再点按字符串删除', async () => {
    const w = mount(LcCheckbox, { props: { options, value: [1] } })
    const boxes = w.findAll('.lc-checkbox__box')
    expect(boxes[0]!.classes()).toContain('lc-checkbox__box--checked')
    expect(boxes[1]!.classes()).not.toContain('lc-checkbox__box--checked')

    await w.findAll('.lc-checkbox__option')[0]!.trigger('click')
    expect(w.emitted('update')?.[0]?.[0]).toMatchObject({ value: [] })
    w.unmount()
  })

  it('value=["2"] 能勾中数字选项；点未选项按选项自身类型追加', async () => {
    const numericOptions = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
    ]
    const w = mount(LcCheckbox, { props: { options: numericOptions, value: ['2'] } })
    const boxes = w.findAll('.lc-checkbox__box')
    expect(boxes[1]!.classes()).toContain('lc-checkbox__box--checked')

    await w.findAll('.lc-checkbox__option')[0]!.trigger('click')
    expect(w.emitted('update')?.[0]?.[0]).toMatchObject({ value: ['2', 1] })
    w.unmount()
  })
})
