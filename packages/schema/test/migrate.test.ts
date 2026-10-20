import { describe, it, expect } from 'vitest'
import {
  migrate,
  MigrationRegistry,
  MigrationError,
  createEmptyPage,
  SCHEMA_VERSION,
  KNOWN_VERSIONS,
} from '../src/index.js'

describe('版本比较', () => {
  it('当前版本存在于历史记录中', () => {
    expect(KNOWN_VERSIONS).toContain(SCHEMA_VERSION)
  })
})

describe('migrate —— 边界与错误', () => {
  it('已是最新的版本直接返回，不应用任何迁移', () => {
    const page = createEmptyPage('p', 'x')
    const { schema, applied } = migrate(page)
    expect(applied).toEqual([])
    expect(schema).toBe(page)
  })

  it('输入非对象抛 E_MIGRATION_INPUT', () => {
    expect(() => migrate(null as any)).toThrowError(MigrationError)
    try {
      migrate(null as any)
    } catch (e) {
      expect((e as MigrationError).code).toBe('E_MIGRATION_INPUT')
    }
  })

  it('缺少 schemaVersion 抛 E_MIGRATION_NO_VERSION', () => {
    try {
      migrate({} as any)
      throw new Error('should not reach')
    } catch (e) {
      expect((e as MigrationError).code).toBe('E_MIGRATION_NO_VERSION')
    }
  })

  it('schemaVersion 格式非法抛 E_MIGRATION_BAD_VERSION', () => {
    try {
      migrate({ schemaVersion: 'abc' })
      throw new Error('should not reach')
    } catch (e) {
      expect((e as MigrationError).code).toBe('E_MIGRATION_BAD_VERSION')
    }
  })

  it('平台不认识的版本抛 E_MIGRATION_UNKNOWN_VERSION', () => {
    try {
      migrate({ schemaVersion: '9.9.9' })
      throw new Error('should not reach')
    } catch (e) {
      expect((e as MigrationError).code).toBe('E_MIGRATION_UNKNOWN_VERSION')
    }
  })

  it('有旧版本但无迁移函数抛 E_MIGRATION_MISSING', () => {
    const reg = new MigrationRegistry()
    try {
      reg.migrate({ schemaVersion: '0.9.0' })
      throw new Error('should not reach')
    } catch (e) {
      expect((e as MigrationError).code).toBe('E_MIGRATION_MISSING')
      expect((e as MigrationError).from).toBe('0.9.0')
    }
  })
})

describe('MigrationRegistry —— 注册约束', () => {
  it('目标版本不得早于源版本', () => {
    const reg = new MigrationRegistry()
    expect(() => reg.register({ from: '1.1.0', to: '1.0.0', run: (s) => s })).toThrowError(MigrationError)
    expect(() => reg.register({ from: '1.0.0', to: '1.0.0', run: (s) => s })).toThrowError(MigrationError)
  })

  it('同一源版本不允许重复注册', () => {
    const reg = new MigrationRegistry()
    reg.register({ from: '0.9.0', to: '1.0.0', run: (s) => s })
    expect(() => reg.register({ from: '0.9.0', to: '1.0.0', run: (s) => s })).toThrowError(MigrationError)
  })
})

describe('migrate —— 多级迁移链', () => {
  it('按顺序应用全部迁移并回写版本号', () => {
    const reg = new MigrationRegistry()
    // 模拟历史：0.8.0 → 0.9.0 → 1.0.0
    reg.register({
      from: '0.8.0',
      to: '0.9.0',
      note: '新增 style 字段',
      run: (s) => {
        const walk = (n: any) => {
          n.style = n.style ?? {}
          ;(n.children ?? []).forEach(walk)
        }
        walk(s.root)
        return s
      },
    })
    reg.register({
      from: '0.9.0',
      to: '1.0.0',
      note: 'actions.value 对象化',
      run: (s) => {
        for (const n of collect(s.root)) {
          n.actions = (n.actions ?? []).map((a: any) =>
            typeof a.value === 'string' ? { ...a, value: { expr: a.value } } : a,
          )
        }
        return s
      },
    })

    const legacy = {
      schemaVersion: '0.8.0',
      id: 'pg',
      name: '旧页面',
      type: 'custom',
      root: {
        id: 'r',
        componentName: 'Page',
        children: [
          { id: 'a', componentName: 'Button', actions: [{ event: 'onClick', type: 'expression', value: 'app.back()' }] },
        ],
      },
    }

    const { schema, applied } = reg.migrate(legacy)
    expect(applied).toHaveLength(2)
    expect(applied[0]).toContain('0.8.0 → 0.9.0')
    expect(applied[1]).toContain('0.9.0 → 1.0.0')
    expect(schema.schemaVersion).toBe(SCHEMA_VERSION)
    expect((schema.root as any).style).toEqual({})
    expect((schema.root.children[0] as any).actions[0].value).toEqual({ expr: 'app.back()' })
    // 入参不得被原地修改
    expect(legacy.schemaVersion).toBe('0.8.0')
    expect((legacy.root.children[0] as any).actions[0].value).toBe('app.back()')
  })

  it('迁移返回非法值时报错', () => {
    const reg = new MigrationRegistry()
    reg.register({ from: '0.9.0', to: '1.0.0', run: () => null as any })
    try {
      reg.migrate({ schemaVersion: '0.9.0' })
      throw new Error('should not reach')
    } catch (e) {
      expect((e as MigrationError).code).toBe('E_MIGRATION_RESULT')
    }
  })
})

/** 收集全部节点（测试内联实现，避免额外依赖） */
function collect(root: any): any[] {
  const out: any[] = []
  const walk = (n: any) => {
    out.push(n)
    ;(n.children ?? []).forEach(walk)
  }
  walk(root)
  return out
}
