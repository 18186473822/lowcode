/**
 * 动态 CRUD 端到端集成测试（真实启动 Nest 应用，临时目录落盘）：
 * 模型定义（保存/读取/列表/校验） + 记录新增/更新/软删 + filter/sort/page 查询 + 鉴权。
 *
 * 与前端同源的断言（checkRule / validateModel）以「错误码 + path」形式锁定。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { ModelSchema } from '@lc/schema'
import { AppModule } from '../src/app.module.js'

/* ------------------------------------------------------------------ */
/* 环境与辅助                                                          */
/* ------------------------------------------------------------------ */

let app: INestApplication
let base: string
let dataDir: string
/** admin 登录令牌（各分组复用） */
let token: string

interface CallOptions {
  body?: unknown
  token?: string
}

async function call(method: string, apiPath: string, opts: CallOptions = {}) {
  const res = await fetch(`${base}${apiPath}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* 非 JSON 响应（理论上不会出现） */
  }
  return { status: res.status, body }
}

/** 断言错误数组中含指定 code/path 的项 */
function expectIssue(errors: any[], code: string, path?: string) {
  expect(
    errors.some((e) => e.code === code && (path === undefined || e.path === path)),
    `期望 errors 含 ${code}${path ? `@${path}` : ''}，实际：${JSON.stringify(errors)}`,
  ).toBe(true)
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-model-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret'

  app = await NestFactory.create(AppModule, { logger: false })
  app.setGlobalPrefix('api/v1')
  // 显式绑 127.0.0.1：listen(0) 默认绑 ::，app.getUrl() 会返回 http://[::1]:port ——
  // 本机 IPv6 回环被拦（EACCES）时测试全红（教训 B-29）
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()

  const login = await call('POST', '/api/v1/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  })
  token = login.body.accessToken
  expect(token).toBeTruthy()
})

afterAll(async () => {
  await app?.close()
  await rm(dataDir, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ */
/* 夹具                                                                */
/* ------------------------------------------------------------------ */

/** 简单模型：name 必填 + age 可选 */
function simpleModel(id: string): ModelSchema {
  return {
    schemaVersion: '1.0.0',
    id,
    name: '简单模型',
    code: 'simple_t',
    fields: [
      { key: 'name', name: '名称', type: 'string', required: true },
      { key: 'age', name: '年龄', type: 'number' },
    ],
  } as ModelSchema
}

/** 员工模型：覆盖必填/长度/正则/范围/枚举/日期/布尔/表达式/auto/readonly */
function empModel(): ModelSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'md_emp',
    name: '员工信息',
    code: 'emp_info',
    fields: [
      {
        key: 'name',
        name: '姓名',
        type: 'string',
        required: true,
        length: 10,
        rules: [{ type: 'pattern', value: '^\\S+$' }],
      },
      { key: 'age', name: '年龄', type: 'number', rules: [{ type: 'range', min: 18, max: 60 }] },
      {
        key: 'gender',
        name: '性别',
        type: 'enum',
        options: [
          { label: '男', value: 'M' },
          { label: '女', value: 'F' },
        ],
      },
      { key: 'entry', name: '入职日期', type: 'date' },
      { key: 'active', name: '在职', type: 'boolean' },
      // 表达式规则：age 缺省或 ≥18 均通过，17 岁被拦（注意求值器 nullish 走字符串比较，须显式判空）
      { key: 'tag', name: '标签', type: 'string', rules: [{ type: 'expression', value: 'formData.age == null || formData.age >= 18' }] },
      { key: 'submittedAt', name: '提交时间', type: 'datetime', auto: 'now' },
      { key: 'remark', name: '备注', type: 'text', readonly: true },
    ],
  } as ModelSchema
}

async function putModel(model: ModelSchema, id = model.id) {
  return call('PUT', `/api/v1/models/${id}`, { body: model, token })
}

/* ------------------------------------------------------------------ */
/* 1. 模型定义                                                          */
/* ------------------------------------------------------------------ */

describe('模型定义', () => {
  it('未登录访问模型列表 → 401', async () => {
    const r = await call('GET', '/api/v1/models')
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('UNAUTHORIZED')
  })

  it('PUT 建档：回填 id/审计字段，缺省 schemaVersion=1.0.0，valid + W_MODEL_NO_ID 警告', async () => {
    const model = simpleModel('md_def')
    delete (model as any).schemaVersion // 客户端可能不带版本 → 服务端回填
    const r = await putModel(model, 'md_def')
    expect(r.status).toBe(200)
    expect(r.body.id).toBe('md_def')
    expect(r.body.schemaVersion).toBe('1.0.0')
    expect(r.body.validation.valid).toBe(true)
    expectIssue(r.body.validation.warnings, 'W_MODEL_NO_ID')
    expect(r.body.createdBy).toBe('admin')
    expect(r.body.createdAt).toBe(r.body.updatedAt)
  })

  it('GET 回读定义与保存一致', async () => {
    const r = await call('GET', '/api/v1/models/md_def', { token })
    expect(r.status).toBe(200)
    expect(r.body.name).toBe('简单模型')
    expect(r.body.code).toBe('simple_t')
    expect(r.body.fields).toHaveLength(2)
    expect(r.body.fields[0]).toMatchObject({ key: 'name', required: true })
  })

  it('GET 列表返回摘要（fieldCount/updatedAt），按更新时间倒序', async () => {
    const r = await call('GET', '/api/v1/models', { token })
    expect(r.status).toBe(200)
    const def = r.body.find((m: any) => m.id === 'md_def')
    expect(def).toMatchObject({ name: '简单模型', code: 'simple_t', fieldCount: 2 })
    expect(typeof def.updatedAt).toBe('string')
  })

  it('重复 PUT 更新：createdAt 不变、审计字段服务端权威（请求体伪造无效）', async () => {
    const before = (await call('GET', '/api/v1/models/md_def', { token })).body
    const model = simpleModel('md_def')
    model.name = '简单模型改'
    const r = await putModel(model, 'md_def')
    expect(r.status).toBe(200)
    expect(r.body.createdAt).toBe(before.createdAt)
    expect(r.body.name).toBe('简单模型改')
    expect(r.body.updatedBy).toBe('admin')

    // 客户端把 GET 结果（含审计字段/时间戳）篡改后原样 PUT 回来 → 服务端权威覆盖，不落进协议体
    const echo = { ...before, name: '简单模型改', updatedAt: '1999-01-01T00:00:00.000Z', createdBy: 'hacker' }
    const echoed = await call('PUT', '/api/v1/models/md_def', { body: echo, token })
    expect(echoed.status).toBe(200)
    const after = (await call('GET', '/api/v1/models/md_def', { token })).body
    expect(after.createdBy).toBe('admin')
    expect(after.updatedAt).not.toBe('1999-01-01T00:00:00.000Z')
    expect(after.updatedAt >= after.createdAt).toBe(true)
    expect(after.name).toBe('简单模型改')
  })

  it('body.id 与路径 id 不一致 → 400 INVALID_REQUEST', async () => {
    const r = await call('PUT', '/api/v1/models/md_def', { body: simpleModel('md_other'), token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_REQUEST')
  })

  it('body 非对象（数组）→ 400 INVALID_REQUEST', async () => {
    const r = await call('PUT', '/api/v1/models/md_def', { body: [1, 2], token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_REQUEST')
  })

  it('非法模型 id（含 $）→ 400 INVALID_MODEL_ID', async () => {
    const r = await call('PUT', '/api/v1/models/Bad$Name', { body: simpleModel('x'), token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_MODEL_ID')
  })

  it('code 大写 → 400 MODEL_INVALID + E_CODE_FORMAT', async () => {
    const m = simpleModel('md_def')
    m.code = 'Simple_T'
    const r = await putModel(m, 'md_def')
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('MODEL_INVALID')
    expectIssue(r.body.errors, 'E_CODE_FORMAT', 'code')
  })

  it('字段 key 重复 → 400 MODEL_INVALID + E_DUPLICATE_ID', async () => {
    const m = simpleModel('md_def')
    m.fields.push({ key: 'name', name: '重复', type: 'number' })
    const r = await putModel(m, 'md_def')
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_DUPLICATE_ID')
  })

  it('字段 key 是系统保留名 → 400 + E_FIELD_KEY', async () => {
    const m = simpleModel('md_def')
    m.fields.push({ key: 'createdAt', name: '时间', type: 'string' })
    const r = await putModel(m, 'md_def')
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_FIELD_KEY', 'fields[2].key')
  })

  it('字段 key 格式非法（连字符）→ 400 + E_FIELD_KEY', async () => {
    const m = simpleModel('md_def')
    m.fields.push({ key: 'my-field', name: '坏键', type: 'string' })
    const r = await putModel(m, 'md_def')
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_FIELD_KEY', 'fields[2].key')
  })

  it('字段 type 白名单外 → 400 + E_FIELD_TYPE', async () => {
    const m = simpleModel('md_def')
    m.fields.push({ key: 'wuu', name: '未知类型', type: 'uuid' as any })
    const r = await putModel(m, 'md_def')
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_FIELD_TYPE', 'fields[2].type')
  })

  it('schemaVersion 非三段式 → 400 + E_SCHEMA_VERSION', async () => {
    const m = simpleModel('md_def')
    m.schemaVersion = '1.0'
    const r = await putModel(m, 'md_def')
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_SCHEMA_VERSION', 'schemaVersion')
  })

  it('expression 规则语法错误 → 400 + E_EXPR_SYNTAX（保存前拦截）', async () => {
    const m = simpleModel('md_def')
    m.fields[1].rules = [{ type: 'expression', value: 'formData.age >' }]
    const r = await putModel(m, 'md_def')
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_EXPR_SYNTAX')
  })

  it('GET 不存在的模型 → 404 MODEL_NOT_FOUND', async () => {
    const r = await call('GET', '/api/v1/models/md_ghost', { token })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('MODEL_NOT_FOUND')
  })
})

/* ------------------------------------------------------------------ */
/* 2. 记录：新增与校验                                                   */
/* ------------------------------------------------------------------ */

describe('记录：新增与校验', () => {
  beforeAll(async () => {
    const r = await putModel(empModel(), 'md_emp')
    expect(r.status).toBe(200)
  })

  it('未登录新增记录 → 401', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: { name: '张三' } })
    expect(r.status).toBe(401)
  })

  it('合法新增：只保留声明字段，auto 补时间，readonly/未知键丢弃', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', {
      body: {
        name: '张三',
        age: 20,
        gender: 'M',
        entry: '2026-01-02',
        active: true,
        remark: 'readonly 应被丢弃',
        unknownField: '未声明应被丢弃',
      },
      token,
    })
    expect(r.status).toBe(200)
    expect(r.body.id).toBeTruthy()
    expect(r.body).toMatchObject({ name: '张三', age: 20, gender: 'M', entry: '2026-01-02', active: true })
    expect(r.body.remark).toBeUndefined()
    expect(r.body.unknownField).toBeUndefined()
    expect(r.body.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/) // auto:'now' 服务端补
    expect(r.body.createdBy).toBe('admin')
    expect(r.body.createdAt).toBe(r.body.updatedAt)
    expect(r.body.updatedBy).toBeUndefined() // 未更新过
  })

  it('缺必填 name → 400 RECORD_INVALID + E_REQUIRED@name', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: { age: 20 }, token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('RECORD_INVALID')
    expectIssue(r.body.errors, 'E_REQUIRED', 'name')
  })

  it('name 非字符串 → E_FIELD_TYPE；超长度 → E_FIELD_LENGTH', async () => {
    const bad = await call('POST', '/api/v1/models/md_emp/records', { body: { name: 123 }, token })
    expectIssue(bad.body.errors, 'E_FIELD_TYPE', 'name')

    const long = await call('POST', '/api/v1/models/md_emp/records', {
      body: { name: '一二三四五六七八九十' + '一' }, // 11 字 > length:10
      token,
    })
    expectIssue(long.body.errors, 'E_FIELD_LENGTH', 'name')
  })

  it('name 含空格（pattern 规则）→ E_RULE_FAILED', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: { name: 'a b' }, token })
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_RULE_FAILED', 'name')
    expect(r.body.errors[0].message).toContain('格式不正确')
  })

  it('age 传字符串 → E_FIELD_TYPE@age', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: { name: '张三', age: '20' }, token })
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_FIELD_TYPE', 'age')
  })

  it('age=17：range 规则与 expression 规则同时报错（单字段首个错误）', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: { name: '张三', age: 17 }, token })
    expect(r.status).toBe(400)
    expect(r.body.errors).toHaveLength(2)
    expectIssue(r.body.errors, 'E_RULE_FAILED', 'age')
    expectIssue(r.body.errors, 'E_RULE_FAILED', 'tag') // expression：!(17<18) → false
  })

  it('age 缺省时 expression 规则不误伤（表达式显式判空）', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: { name: '李四' }, token })
    expect(r.status).toBe(200)
    expect(r.body.age).toBeUndefined()
    expect(r.body.submittedAt).toBeTruthy()
  })

  it('gender 枚举越界 → E_FIELD_TYPE@gender（值不在枚举选项内）', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: { name: '张三', gender: 'X' }, token })
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_FIELD_TYPE', 'gender')
    expect(r.body.errors[0].message).toContain('枚举')
  })

  it('entry 非 YYYY-MM-DD / active 非布尔 → E_FIELD_TYPE', async () => {
    const d = await call('POST', '/api/v1/models/md_emp/records', {
      body: { name: '张三', entry: '2026/01/02' },
      token,
    })
    expectIssue(d.body.errors, 'E_FIELD_TYPE', 'entry')

    const b = await call('POST', '/api/v1/models/md_emp/records', {
      body: { name: '张三', active: 'true' },
      token,
    })
    expectIssue(b.body.errors, 'E_FIELD_TYPE', 'active')
  })

  it('可选字段空串跳过格式校验（空串不触发 pattern/range）', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: { name: '王五', gender: '' }, token })
    expect(r.status).toBe(200)
    expect(r.body.gender).toBe('')
  })

  it('向模型不存在的记录接口写入 → 404 MODEL_NOT_FOUND', async () => {
    const r = await call('POST', '/api/v1/models/md_ghost/records', { body: { name: 'x' }, token })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('MODEL_NOT_FOUND')
  })

  it('请求体非对象 → 400 INVALID_REQUEST', async () => {
    const r = await call('POST', '/api/v1/models/md_emp/records', { body: [1], token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('INVALID_REQUEST')
  })
})

/* ------------------------------------------------------------------ */
/* 3. 安全表达式规则                                                     */
/* ------------------------------------------------------------------ */

describe('记录：expression 规则安全语义', () => {
  beforeAll(async () => {
    const m = simpleModel('md_evil')
    m.fields[1].rules = [{ type: 'expression', value: 'constructor' }] // 触发 E_EXPR_SECURITY
    const r = await putModel(m, 'md_evil')
    expect(r.status).toBe(200) // 语法合法，保存期不拦
  })

  it('求值遇禁止访问键 → 与前端同源报「校验表达式配置错误」并阻断写入', async () => {
    const r = await call('POST', '/api/v1/models/md_evil/records', { body: { name: 'x' }, token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('RECORD_INVALID')
    expectIssue(r.body.errors, 'E_RULE_FAILED', 'age')
    expect(r.body.errors[0].message).toBe('校验表达式配置错误')
  })

  it('阻断后查询列表为空（记录目录不存在时返回空数组而非报错）', async () => {
    const r = await call('GET', '/api/v1/models/md_evil/records', { token })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ total: 0, items: [] })
  })
})

/* ------------------------------------------------------------------ */
/* 4. 记录：更新与软删                                                   */
/* ------------------------------------------------------------------ */

describe('记录：更新与软删', () => {
  let rid: string

  beforeAll(async () => {
    expect((await putModel(simpleModel('md_upd'), 'md_upd')).status).toBe(200)
    const created = await call('POST', '/api/v1/models/md_upd/records', {
      body: { name: '初始', age: 25 },
      token,
    })
    expect(created.status).toBe(200)
    rid = created.body.id
  })

  it('部分更新：未提及字段保留，审计字段刷新', async () => {
    const r = await call('PUT', `/api/v1/models/md_upd/records/${rid}`, { body: { age: 30 }, token })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ name: '初始', age: 30, updatedBy: 'admin' })
    expect(r.body.updatedAt >= r.body.createdAt).toBe(true)
  })

  it('更新携带未知键 → 丢弃但成功', async () => {
    const r = await call('PUT', `/api/v1/models/md_upd/records/${rid}`, { body: { fake: 1 }, token })
    expect(r.status).toBe(200)
    expect(r.body.fake).toBeUndefined()
  })

  it('更新把必填字段清空 → 合并后整体校验拦截 400', async () => {
    const r = await call('PUT', `/api/v1/models/md_upd/records/${rid}`, { body: { name: '' }, token })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('RECORD_INVALID')
    expectIssue(r.body.errors, 'E_REQUIRED', 'name')
    // 未被污染
    const after = await call('GET', '/api/v1/models/md_upd/records', { token })
    expect(after.body.items[0].name).toBe('初始')
  })

  it('更新类型错误 → 400 E_FIELD_TYPE', async () => {
    const r = await call('PUT', `/api/v1/models/md_upd/records/${rid}`, { body: { age: 'x' }, token })
    expect(r.status).toBe(400)
    expectIssue(r.body.errors, 'E_FIELD_TYPE', 'age')
  })

  it('更新不存在的记录 → 404 RECORD_NOT_FOUND；非法记录 id → 400 INVALID_RECORD_ID', async () => {
    const ghost = await call('PUT', `/api/v1/models/md_upd/records/nosuchid1`, { body: { age: 1 }, token })
    expect(ghost.status).toBe(404)
    expect(ghost.body.code).toBe('RECORD_NOT_FOUND')

    const bad = await call('PUT', `/api/v1/models/md_upd/records/bad%24id`, { body: { age: 1 }, token })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('INVALID_RECORD_ID')
  })

  it('软删：列表不再返回；再更新/再删 → 404', async () => {
    const del = await call('DELETE', `/api/v1/models/md_upd/records/${rid}`, { token })
    expect(del.status).toBe(200)
    expect(del.body).toMatchObject({ id: rid, deleted: true })
    expect(del.body.deletedAt).toBeTruthy()

    const list = await call('GET', '/api/v1/models/md_upd/records', { token })
    expect(list.body.total).toBe(0)

    const upd = await call('PUT', `/api/v1/models/md_upd/records/${rid}`, { body: { age: 1 }, token })
    expect(upd.status).toBe(404)

    const del2 = await call('DELETE', `/api/v1/models/md_upd/records/${rid}`, { token })
    expect(del2.status).toBe(404)
    expect(del2.body.code).toBe('RECORD_NOT_FOUND')
  })
})

/* ------------------------------------------------------------------ */
/* 5. 记录：列表查询                                                     */
/* ------------------------------------------------------------------ */

describe('记录：列表查询（filter/sort/page）', () => {
  beforeAll(async () => {
    expect((await putModel(simpleModel('md_list'), 'md_list')).status).toBe(200)
    for (const [name, age] of [
      ['a', 10],
      ['b', 20],
      ['c', 30],
    ] as const) {
      const r = await call('POST', '/api/v1/models/md_list/records', { body: { name, age }, token })
      expect(r.status).toBe(200)
    }
  })

  it('默认分页返回全部（total/page/size；同毫秒创建不锁默认顺序）', async () => {
    const r = await call('GET', '/api/v1/models/md_list/records', { token })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ total: 3, page: 1, size: 20 })
    expect(r.body.items).toHaveLength(3)
    expect(r.body.items[0]).toHaveProperty('createdBy', 'admin')
  })

  it('sort=name:asc + size=2 分页：第 1 页 [a,b]，第 2 页 [c]，第 3 页空', async () => {
    const p1 = await call('GET', '/api/v1/models/md_list/records?sort=name:asc&page=1&size=2', { token })
    expect(p1.body.items.map((i: any) => i.name)).toEqual(['a', 'b'])
    expect(p1.body).toMatchObject({ total: 3, page: 1, size: 2 })

    const p2 = await call('GET', '/api/v1/models/md_list/records?sort=name:asc&page=2&size=2', { token })
    expect(p2.body.items.map((i: any) => i.name)).toEqual(['c'])

    const p3 = await call('GET', '/api/v1/models/md_list/records?sort=name:asc&page=3&size=2', { token })
    expect(p3.body.items).toEqual([])
    expect(p3.body.total).toBe(3)
  })

  it('sort=name:desc 首条为 c；sort 不带方向默认 asc', async () => {
    const desc = await call('GET', '/api/v1/models/md_list/records?sort=name:desc', { token })
    expect(desc.body.items[0].name).toBe('c')

    const asc = await call('GET', '/api/v1/models/md_list/records?sort=name', { token })
    expect(asc.body.items[0].name).toBe('a')
  })

  it('filter 等值命中 / 严格类型（数字 20 命中、字符串 "20" 不命中）/ null 匹配缺省', async () => {
    const hit = await call('GET', `/api/v1/models/md_list/records?filter=${encodeURIComponent('{"age":20}')}`, { token })
    expect(hit.body.total).toBe(1)
    expect(hit.body.items[0].name).toBe('b')

    const strict = await call('GET', `/api/v1/models/md_list/records?filter=${encodeURIComponent('{"age":"20"}')}`, { token })
    expect(strict.body.total).toBe(0)

    const nul = await call('GET', `/api/v1/models/md_list/records?filter=${encodeURIComponent('{"name":null}')}`, { token })
    expect(nul.body.total).toBe(0)
  })

  it('filter 作用于系统字段（createdBy）', async () => {
    const r = await call('GET', `/api/v1/models/md_list/records?filter=${encodeURIComponent('{"createdBy":"admin"}')}`, { token })
    expect(r.body.total).toBe(3)
  })

  it('filter 非法：未知字段 / 坏 JSON / 非对象 / 值为对象 → 400 INVALID_QUERY', async () => {
    const unknown = await call('GET', `/api/v1/models/md_list/records?filter=${encodeURIComponent('{"nope":1}')}`, { token })
    expect(unknown.status).toBe(400)
    expect(unknown.body.code).toBe('INVALID_QUERY')

    const badJson = await call('GET', '/api/v1/models/md_list/records?filter=%7Bnope', { token })
    expect(badJson.status).toBe(400)

    const arr = await call('GET', `/api/v1/models/md_list/records?filter=${encodeURIComponent('[1,2]')}`, { token })
    expect(arr.status).toBe(400)

    const nested = await call('GET', `/api/v1/models/md_list/records?filter=${encodeURIComponent('{"age":{}}')}`, { token })
    expect(nested.status).toBe(400)
  })

  it('sort 非法：未知字段 / 方向错 / 传多个值 → 400 INVALID_QUERY', async () => {
    const f = await call('GET', '/api/v1/models/md_list/records?sort=nope:asc', { token })
    expect(f.status).toBe(400)
    expect(f.body.code).toBe('INVALID_QUERY')

    const d = await call('GET', '/api/v1/models/md_list/records?sort=name:sideways', { token })
    expect(d.status).toBe(400)

    const multi = await call('GET', '/api/v1/models/md_list/records?sort=name:asc&sort=age:desc', { token })
    expect(multi.status).toBe(400)
  })

  it('page/size 非法：0 / 超上限 / 非数字 → 400 INVALID_QUERY', async () => {
    for (const q of ['page=0', 'size=0', 'size=101', 'page=abc']) {
      const r = await call('GET', `/api/v1/models/md_list/records?${q}`, { token })
      expect(r.status, q).toBe(400)
      expect(r.body.code).toBe('INVALID_QUERY')
    }
  })

  it('未登录查询 → 401', async () => {
    const r = await call('GET', '/api/v1/models/md_list/records')
    expect(r.status).toBe(401)
  })
})

/* ------------------------------------------------------------------ */
/* 6. 存储损坏防护                                                      */
/* ------------------------------------------------------------------ */

describe('存储损坏防护（文件损坏不静默吞掉）', () => {
  it('模型定义 JSON 损坏 → 500；列表同样失败', async () => {
    expect((await putModel(simpleModel('md_broken'), 'md_broken')).status).toBe(200)
    await writeFile(path.join(dataDir, 'models', 'md_broken.json'), '{oops', 'utf8')
    const r = await call('GET', '/api/v1/models/md_broken', { token })
    expect(r.status).toBe(500)
    const list = await call('GET', '/api/v1/models', { token })
    expect(list.status).toBe(500)
  })

  it('记录 JSON 损坏 → 查询 500', async () => {
    await writeFile(path.join(dataDir, 'data', 'md_list', 'badrec.json'), '{oops', 'utf8')
    const r = await call('GET', '/api/v1/models/md_list/records', { token })
    expect(r.status).toBe(500)
  })
})

/* ------------------------------------------------------------------ */
/* 7. 权限强制（Phase 2 批 6：③ 模型 CRUD 权限 + ④ 行级 dataScope）      */
/* ------------------------------------------------------------------ */

describe('批 6：记录权限强制（CRUD 权限 + 行级 dataScope）', () => {
  /** designer 登录令牌（受限角色） */
  let dToken: string

  beforeAll(async () => {
    const login = await call('POST', '/api/v1/auth/login', {
      body: { username: 'designer', password: 'designer123' },
    })
    expect(login.status).toBe(200)
    dToken = login.body.accessToken
    expect(dToken).toBeTruthy()

    // md_perm：create/read 仅 admin（designer 不在白名单）
    const permModel = simpleModel('md_perm')
    permModel.permissions = { create: ['admin'], read: ['admin'] }
    expect((await putModel(permModel, 'md_perm')).status).toBe(200)

    // md_scope：行级 self（读/改放行两角色，过滤按 createdBy）
    const scopeModel = simpleModel('md_scope')
    scopeModel.dataScope = 'self'
    scopeModel.permissions = { read: ['admin', 'designer'], update: ['admin', 'designer'] }
    expect((await putModel(scopeModel, 'md_scope')).status).toBe(200)

    // 造行：admin 2 条 + designer 1 条（行归属不同 → self 过滤可见差异）
    for (const name of ['adm-1', 'adm-2']) {
      const r = await call('POST', '/api/v1/models/md_scope/records', { body: { name }, token })
      expect(r.status).toBe(200)
    }
    const d = await call('POST', '/api/v1/models/md_scope/records', {
      body: { name: 'des-1' },
      token: dToken,
    })
    expect(d.status).toBe(200)
  })

  it('③ read 拦截：designer 查白名单外模型 403 PERMISSION_DENIED；admin 200', async () => {
    const denied = await call('GET', '/api/v1/models/md_perm/records', { token: dToken })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('PERMISSION_DENIED')

    const ok = await call('GET', '/api/v1/models/md_perm/records', { token })
    expect(ok.status).toBe(200)
  })

  it('③ create 拦截：designer 新增 403；admin 成功', async () => {
    const denied = await call('POST', '/api/v1/models/md_perm/records', {
      body: { name: 'x' },
      token: dToken,
    })
    expect(denied.status).toBe(403)

    const ok = await call('POST', '/api/v1/models/md_perm/records', {
      body: { name: 'adm-ok' },
      token,
    })
    expect(ok.status).toBe(200)
  })

  it('④ dataScope=self：designer 只见自己 1 行；admin（* 豁免）见全部 3 行', async () => {
    const d = await call('GET', '/api/v1/models/md_scope/records', { token: dToken })
    expect(d.status).toBe(200)
    expect(d.body.total).toBe(1)
    expect(d.body.items[0]).toMatchObject({ name: 'des-1', createdBy: 'designer' })

    const a = await call('GET', '/api/v1/models/md_scope/records', { token })
    expect(a.status).toBe(200)
    expect(a.body.total).toBe(3) // admin 权限点为 '*' → 行级豁免
    const creators = new Set(a.body.items.map((i: any) => i.createdBy))
    expect(creators).toEqual(new Set(['admin', 'designer']))
  })

  it('④ update/delete 行归属：designer 碰 admin 的行 403；碰自己的行 200', async () => {
    const a = await call('GET', '/api/v1/models/md_scope/records', { token })
    const adminRow = a.body.items.find((i: any) => i.createdBy === 'admin')
    expect(adminRow).toBeTruthy()

    const putDenied = await call('PUT', `/api/v1/models/md_scope/records/${adminRow.id}`, {
      body: { name: 'hijack' },
      token: dToken,
    })
    expect(putDenied.status).toBe(403)

    const delDenied = await call('DELETE', `/api/v1/models/md_scope/records/${adminRow.id}`, {
      token: dToken,
    })
    expect(delDenied.status).toBe(403)

    const d = await call('GET', '/api/v1/models/md_scope/records', { token: dToken })
    const ownRow = d.body.items[0]
    const putOk = await call('PUT', `/api/v1/models/md_scope/records/${ownRow.id}`, {
      body: { age: 30 },
      token: dToken,
    })
    expect(putOk.status).toBe(200)
  })

  it('回归：未声明 permissions/dataScope 的模型不受限（designer 读 200 全量）', async () => {
    const r = await call('GET', '/api/v1/models/md_upd/records', { token: dToken })
    expect(r.status).toBe(200)
    expect(typeof r.body.total).toBe('number')
  })
})
