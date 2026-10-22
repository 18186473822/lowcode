/**
 * Phase 4：记录编辑纯逻辑（ETag 与字段值转换）。
 *
 * 这两块任何一处与 server 契约不一致，都会表现为「保存永远 409」或「类型校验失败」，
 * 且只有真实网络请求才能暴露，因此在纯函数层直接锁死格式。
 */
import { describe, expect, it } from 'vitest'
import { parseRecordFieldValue, recordEtag } from '../src/core/record-edit.js'

describe('recordEtag', () => {
  it('与 server makeEtag 格式一致：record:<modelId>/<recordId>:<revision>', () => {
    expect(recordEtag('m_e', 'r1', 3)).toBe('"record:m_e/r1:3"')
  })

  it('revision 缺失/非法时按 0 处理（旧数据兼容），不生成 NaN', () => {
    expect(recordEtag('m', 'r', undefined)).toBe('"record:m/r:0"')
    expect(recordEtag('m', 'r', -1)).toBe('"record:m/r:0"')
    expect(recordEtag('m', 'r', 1.5)).toBe('"record:m/r:0"')
  })
})

describe('parseRecordFieldValue', () => {
  it('字符串原样、空字符串保留（允许主动清空）', () => {
    const f = { key: 'name', name: '姓名', type: 'string' as const }
    expect(parseRecordFieldValue(f, '张三')).toEqual({ ok: true, value: '张三' })
    expect(parseRecordFieldValue(f, '')).toEqual({ ok: true, value: '' })
  })

  it('number / money：空值转 null，合法数字转 number，非法值报中文错误', () => {
    const number = { key: 'age', name: '年龄', type: 'number' as const }
    const money = { key: 'salary', name: '薪资', type: 'money' as const }
    expect(parseRecordFieldValue(number, '18')).toEqual({ ok: true, value: 18 })
    expect(parseRecordFieldValue(number, 18)).toEqual({ ok: true, value: 18 })
    expect(parseRecordFieldValue(number, '  ')).toEqual({ ok: true, value: null })
    expect(parseRecordFieldValue(money, '1234.5')).toEqual({ ok: true, value: 1234.5 })
    expect(parseRecordFieldValue(number, 'abc')).toEqual({ ok: false, message: '年龄必须是数字' })
  })

  it('boolean 只接受布尔值（switch 的原始载荷）', () => {
    const f = { key: 'active', name: '在职', type: 'boolean' as const }
    expect(parseRecordFieldValue(f, true)).toEqual({ ok: true, value: true })
    expect(parseRecordFieldValue(f, false)).toEqual({ ok: true, value: false })
    expect(parseRecordFieldValue(f, 'true')).toEqual({ ok: false, message: '在职必须是布尔值' })
  })

  it('json / location：空值转 null，合法 JSON 解析为对象，非法 JSON 不抛异常', () => {
    const json = { key: 'meta', name: '扩展', type: 'json' as const }
    expect(parseRecordFieldValue(json, '{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseRecordFieldValue(json, '')).toEqual({ ok: true, value: null })
    expect(parseRecordFieldValue(json, '{bad')).toEqual({ ok: false, message: '扩展必须是合法 JSON' })
  })

  it('file：换行/逗号分隔转数组并去空白', () => {
    const f = { key: 'files', name: '附件', type: 'file' as const }
    expect(parseRecordFieldValue(f, 'f1\nf2, f3')).toEqual({ ok: true, value: ['f1', 'f2', 'f3'] })
    expect(parseRecordFieldValue(f, '')).toEqual({ ok: true, value: [] })
  })

  it('enum：按 String 反查原始选项值（数字枚举不写成字符串），未知值报错', () => {
    const f = {
      key: 'level',
      name: '级别',
      type: 'enum' as const,
      options: [
        { label: '一', value: 1 },
        { label: '二', value: 2 },
      ],
    }
    expect(parseRecordFieldValue(f, '2')).toEqual({ ok: true, value: 2 })
    expect(parseRecordFieldValue(f, '')).toEqual({ ok: true, value: null })
    expect(parseRecordFieldValue(f, '9')).toEqual({ ok: false, message: '级别不在可选范围内' })
  })

  it('字段缺 name / 枚举缺 options 时不崩：错误文案回退到 key', () => {
    expect(parseRecordFieldValue({ key: 'note', type: 'string' } as never, 'x')).toEqual({
      ok: true,
      value: 'x',
    })
    expect(parseRecordFieldValue({ key: 'level', type: 'enum' } as never, 'A')).toEqual({
      ok: false,
      message: 'level不在可选范围内',
    })
  })
})
