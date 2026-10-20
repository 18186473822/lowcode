/**
 * Phase 2 批 1：模型编辑纯函数（core/model-ops）
 * 字段行增删改/排序的边界、enum 选项串解析、保存门禁（协议 validateModel 同源 + id 格式）。
 */
import { describe, it, expect } from 'vitest'
import type { ModelSchema } from '@lc/schema'
import {
  FIELD_TYPES,
  MODEL_ID_RE,
  addField,
  blankField,
  blankModel,
  formatOptions,
  moveField,
  modelErrors,
  nextFieldKey,
  parseOptions,
  removeField,
  updateField,
} from '../src/core/model-ops'

function m(fields: ModelSchema['fields']): ModelSchema {
  return { schemaVersion: '1.0.0', id: 'm_t', name: '测试', code: 'm_t', fields }
}

describe('骨架与 key 生成', () => {
  it('blankField：初始态 string 类型、空展示名', () => {
    expect(blankField('f1')).toEqual({ key: 'f1', name: '', type: 'string' })
  })

  it('blankModel：id 即 code、预置一行 f1、schemaVersion 三段式', () => {
    const b = blankModel('m_leave')
    expect(b.id).toBe('m_leave')
    expect(b.code).toBe('m_leave')
    expect(b.schemaVersion).toBe('1.0.0')
    expect(b.fields).toHaveLength(1)
    expect(b.fields[0]!.key).toBe('f1')
  })

  it('nextFieldKey：空表 f1；跳过已占用序号取最小可用', () => {
    expect(nextFieldKey([])).toBe('f1')
    expect(nextFieldKey([{ key: 'f1', name: '', type: 'string' }])).toBe('f2')
    expect(
      nextFieldKey([
        { key: 'f1', name: '', type: 'string' },
        { key: 'f3', name: '', type: 'string' },
      ]),
    ).toBe('f2')
  })

  it('FIELD_TYPES：不含 id（主键由平台自动补充），含 enum 等 14 种', () => {
    expect(FIELD_TYPES).not.toContain('id')
    expect(FIELD_TYPES).toContain('enum')
    expect(FIELD_TYPES).toHaveLength(14)
  })

  it('MODEL_ID_RE：与服务端对齐 —— 字母/下划线开头、字母数字下划线连字符、≤64', () => {
    expect(MODEL_ID_RE.test('m_leave')).toBe(true)
    expect(MODEL_ID_RE.test('M-1_x')).toBe(true)
    expect(MODEL_ID_RE.test('1abc')).toBe(false)
    expect(MODEL_ID_RE.test('m leave')).toBe(false)
    expect(MODEL_ID_RE.test('m' .repeat(65))).toBe(false)
  })
})

describe('字段行增删改排序', () => {
  const base = m([
    { key: 'a', name: '甲', type: 'string' },
    { key: 'b', name: '乙', type: 'number' },
    { key: 'c', name: '丙', type: 'boolean' },
  ])

  it('addField：末尾追加 + 返回新 key 不与现有重复（纯函数：原对象不变）', () => {
    const r = addField(base)
    expect(r.key).toBe('f1') // a/b/c 之外最小可用
    expect(r.model.fields).toHaveLength(4)
    expect(r.model.fields[3]!.key).toBe('f1')
    expect(base.fields).toHaveLength(3)
  })

  it('removeField：删中间行；key 不存在 = 原样返回', () => {
    expect(removeField(base, 'b').fields.map((f) => f.key)).toEqual(['a', 'c'])
    expect(removeField(base, 'nope')).toBe(base)
  })

  it('moveField：上移/下移交换相邻行；首行上移与末行下移 no-op 原样返回', () => {
    expect(moveField(base, 'b', -1).fields.map((f) => f.key)).toEqual(['b', 'a', 'c'])
    expect(moveField(base, 'b', 1).fields.map((f) => f.key)).toEqual(['a', 'c', 'b'])
    expect(moveField(base, 'a', -1)).toBe(base)
    expect(moveField(base, 'c', 1)).toBe(base)
    expect(moveField(base, 'nope', 1)).toBe(base)
  })

  it('updateField：patch 应用到定位行（支持改 key），他行不动', () => {
    const r = updateField(base, 'b', { name: '乙改', key: 'bb' })
    expect(r.fields[1]).toEqual({ key: 'bb', name: '乙改', type: 'number' })
    expect(r.fields[0]).toBe(base.fields[0]) // 结构共享
    expect(base.fields[1]!.name).toBe('乙') // 纯函数
  })

  it('updateField：type 切 enum 且无 options → 初始化占位选项；已有 options 不覆盖', () => {
    const withOpt = updateField(base, 'a', { type: 'enum', options: [{ label: '甲', value: 'a' }] })
    expect(withOpt.fields[0]!.options).toEqual([{ label: '甲', value: 'a' }])
    const auto = updateField(base, 'a', { type: 'enum' })
    expect(auto.fields[0]!.options).toEqual([{ label: '选项1', value: 'option1' }])
  })
})

describe('enum 选项串解析/序列化', () => {
  it('parseOptions：标签|值 多段；无 | 时 label = value；空段跳过；trim', () => {
    expect(parseOptions('事假|a,病假|b')).toEqual([
      { label: '事假', value: 'a' },
      { label: '病假', value: 'b' },
    ])
    expect(parseOptions(' 年假 , ,x|')).toEqual([
      { label: '年假', value: '年假' },
      { label: 'x', value: 'x' },
    ])
    expect(parseOptions('甲|1，乙|2')).toEqual([{ label: '甲', value: '1，乙|2' }]) // 全角逗号不切分（整串为一段的 value）
    expect(parseOptions('')).toEqual([])
  })

  it('formatOptions：label = value 时简化输出；空 options → 空串；与 parse 往返一致', () => {
    expect(formatOptions([{ label: '甲', value: '甲' }, { label: '乙', value: 'b' }])).toBe('甲,乙|b')
    expect(formatOptions(undefined)).toBe('')
    const src = [{ label: '事假', value: 'a' }]
    expect(parseOptions(formatOptions(src))).toEqual(src)
  })
})

describe('保存门禁 modelErrors（与服务端 validateModel 同源）', () => {
  const good: ModelSchema = {
    schemaVersion: '1.0.0',
    id: 'm_leave',
    name: '请假',
    code: 'm_leave',
    fields: [{ key: 'days', name: '天数', type: 'number', required: true }],
  }

  it('合法模型 → 无错误', () => {
    expect(modelErrors(good)).toEqual([])
  })

  it('id 格式非法 → 拦（validateModel 不查 id 格式，本函数补位对齐服务端 MODEL_ID_RE）', () => {
    expect(modelErrors({ ...good, id: '1bad' })).toEqual(['非法的模型 id：1bad'])
  })

  it('缺 name / 缺 fields → 协议错误文案可见', () => {
    expect(modelErrors({ ...good, name: '' })).toEqual(['模型缺少 name'])
    expect(modelErrors({ ...good, fields: [] })).toEqual(['模型至少需要一个字段'])
  })

  it('code 格式错 / 字段 key 重复 / enum 无 options → 拦', () => {
    expect(modelErrors({ ...good, code: 'Bad Code' })).toHaveLength(1)
    expect(
      modelErrors({
        ...good,
        fields: [
          { key: 'x', name: '', type: 'string' },
          { key: 'x', name: '', type: 'number' },
        ],
      }),
    ).toEqual([expect.stringContaining('字段 key 重复：x')])
    expect(modelErrors({ ...good, fields: [{ key: 't', name: '', type: 'enum' }] })).toEqual([
      expect.stringContaining('必须提供 options'),
    ])
  })

  it('warnings 不拦（缺展示名 / 缺主键字段）', () => {
    expect(modelErrors({ ...good, fields: [{ key: 'x', name: '', type: 'string' }] })).toEqual([])
  })
})
