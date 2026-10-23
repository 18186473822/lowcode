/**
 * OpenAPI 文档契约测试（Phase 4 开放集成第一批）。
 *
 * 两类断言：
 * 1. **文档自身质量**：OpenAPI 3.1 版本、operationId 唯一、路径参数声明完整、
 *    `$ref` 可解析、公共接口鉴权覆盖、JSON 可无损序列化；
 * 2. **文档与代码不漂移**：通过 Nest 的 `PATH_METADATA` / `METHOD_METADATA`
 *    反射全部 controller 的实际路由，与 `paths` 逐条比对（39 条）。
 *
 * 最后一个 describe 真实启动 Nest 应用，确认 `GET /api/v1/openapi.json` 无需令牌即可读取。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RequestMethod, type INestApplication, type Type } from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module.js'
import { HealthController } from '../src/common/health.controller.js'
import { AuthController } from '../src/identity/auth.controller.js'
import { AppController } from '../src/page/app.controller.js'
import { PageController } from '../src/page/page.controller.js'
import { ModelController } from '../src/model/model.controller.js'
import { RecordController } from '../src/model/record.controller.js'
import { FileController } from '../src/file/file.controller.js'
import { FlowController } from '../src/flow/flow.controller.js'
import { RbacController } from '../src/rbac/rbac.controller.js'
import { OpsController } from '../src/ops/ops.controller.js'
import { OpenController } from '../src/open/open.controller.js'
import { WebhookController } from '../src/webhook/webhook.controller.js'
import { buildOpenApi } from '../src/open/openapi.js'

/* ------------------------------------------------------------------ */
/* Nest 路由反射                                                       */
/* ------------------------------------------------------------------ */

const CONTROLLERS: Type<unknown>[] = [
  HealthController,
  AuthController,
  AppController,
  PageController,
  ModelController,
  RecordController,
  FileController,
  FlowController,
  RbacController,
  OpsController,
  OpenController,
  WebhookController,
]

/** 把 `:id` 统一成 OpenAPI 的 `{id}`，并归一化多余斜杠。 */
function normalizeRoute(...segments: string[]): string {
  const joined = segments.filter((s) => s !== '').join('/')
  const withSlash = `/${joined}`.replace(/\/+/g, '/')
  const noTrailing = withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash
  return noTrailing.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

/** 反射实际路由集合，形如 `get /pages/{id}/schema`。 */
function collectActualRoutes(): Set<string> {
  const out = new Set<string>()

  for (const controller of CONTROLLERS) {
    const rawBase = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined
    const bases = rawBase === undefined ? [''] : Array.isArray(rawBase) ? rawBase : [rawBase]
    const proto = controller.prototype as Record<string, unknown>

    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue
      const handler = proto[name]
      if (typeof handler !== 'function') continue

      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
      if (method === undefined) continue

      const rawPath = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined
      const subPaths = rawPath === undefined ? [''] : Array.isArray(rawPath) ? rawPath : [rawPath]
      const methodName = String(RequestMethod[method]).toLowerCase()

      for (const base of bases) {
        for (const sub of subPaths) {
          out.add(`${methodName} ${normalizeRoute(base, sub)}`)
        }
      }
    }
  }

  return out
}

/** 从文档 `paths` 提取 `method path` 集合。 */
function collectDocumentedRoutes(spec: ReturnType<typeof buildOpenApi>): Set<string> {
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']
  const out = new Set<string>()
  for (const [apiPath, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      if (Object.prototype.hasOwnProperty.call(item, method)) out.add(`${method} ${apiPath}`)
    }
  }
  return out
}

/** 解析 `#/components/...` 本地引用；找不到返回 undefined。 */
function resolveRef(spec: unknown, pointer: string): unknown {
  if (!pointer.startsWith('#/')) return undefined
  let node: unknown = spec
  for (const raw of pointer.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/** 递归收集所有 `$ref` 字符串。 */
function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === '$ref' && typeof item === 'string') refs.push(item)
      else collectRefs(item, refs)
    }
  }
  return refs
}

/* ------------------------------------------------------------------ */
/* 文档自身质量                                                        */
/* ------------------------------------------------------------------ */

const spec = buildOpenApi()
const documentedRoutes = collectDocumentedRoutes(spec)

describe('OpenAPI 文档结构', () => {
  it('声明 OpenAPI 3.1.0、服务地址与全局 Bearer 鉴权', () => {
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.servers).toEqual([{ url: '/api/v1', description: '同源部署（服务端全局前缀）' }])
    expect(spec.security).toEqual([{ bearerAuth: [] }])
    expect((spec.components as any).securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
  })

  it('路径/方法与 Nest controller 实际路由逐条一致（50 条，防止文档漂移）', () => {
    const actualRoutes = collectActualRoutes()
    expect([...actualRoutes].sort()).toEqual([...documentedRoutes].sort())
    expect(documentedRoutes.size).toBe(50)
  })

  it('operationId 全局唯一、summary/tags/responses 齐全', () => {
    const ids = new Set<string>()
    const tags = new Set<string>((spec.tags as Array<{ name: string }>).map((t) => t.name))

    for (const [apiPath, item] of Object.entries(spec.paths)) {
      for (const [method, raw] of Object.entries(item)) {
        const operation = raw as Record<string, any>
        const where = `${method.toUpperCase()} ${apiPath}`

        expect(typeof operation.operationId, `${where} operationId`).toBe('string')
        expect(operation.operationId.length, `${where} operationId`).toBeGreaterThan(0)
        expect(ids.has(operation.operationId), `重复 operationId: ${operation.operationId}`).toBe(false)
        ids.add(operation.operationId)

        expect(Array.isArray(operation.tags), `${where} tags`).toBe(true)
        expect(operation.tags.length, `${where} tags`).toBeGreaterThan(0)
        for (const tag of operation.tags) expect(tags.has(tag), `${where} 未知 tag: ${tag}`).toBe(true)

        expect(typeof operation.summary, `${where} summary`).toBe('string')
        expect(operation.summary.length, `${where} summary`).toBeGreaterThan(0)

        expect(operation.responses, `${where} responses`).toBeTruthy()
        expect(Object.keys(operation.responses).length, `${where} responses`).toBeGreaterThan(0)
        for (const [status, response] of Object.entries(operation.responses as Record<string, any>)) {
          expect(response, `${where} ${status} response`).toBeTruthy()
          expect(
            typeof response.description === 'string' || typeof response.$ref === 'string',
            `${where} ${status} 缺少 description/$ref`,
          ).toBe(true)
        }
      }
    }

    expect(ids.size).toBe(documentedRoutes.size)
  })

  it('路径模板参数全部声明且 required: true，无多余 path 参数', () => {
    for (const [apiPath, item] of Object.entries(spec.paths)) {
      const expected = [...apiPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort()
      for (const [method, raw] of Object.entries(item)) {
        const operation = raw as Record<string, any>
        const params = (operation.parameters ?? []) as Array<Record<string, any>>
        const actual = params.filter((p) => p.in === 'path').map((p) => p.name).sort()
        expect(actual, `${method.toUpperCase()} ${apiPath} 路径参数`).toEqual(expected)
        for (const param of params.filter((p) => p.in === 'path')) {
          expect(param.required, `${method.toUpperCase()} ${apiPath} ${param.name} 必须 required`).toBe(true)
        }
      }
    }
  })

  it('所有本地 $ref 均可解析，文档可 JSON 无损往返', () => {
    for (const pointer of collectRefs(spec)) {
      expect(resolveRef(spec, pointer), `无法解析 $ref: ${pointer}`).toBeTruthy()
    }
    const roundTrip = JSON.parse(JSON.stringify(spec))
    expect(roundTrip).toEqual(spec)
  })

  it('只有 5 个公共接口显式 security: []，其余继承全局 Bearer', () => {
    const expectedPublic = new Set([
      'get /health',
      'get /ready',
      'get /openapi.json',
      'post /auth/login',
      'get /files/{fileId}',
    ])
    const actualPublic = new Set<string>()

    for (const [apiPath, item] of Object.entries(spec.paths)) {
      for (const [method, raw] of Object.entries(item)) {
        const operation = raw as Record<string, any>
        const key = `${method} ${apiPath}`
        if (Array.isArray(operation.security) && operation.security.length === 0) {
          actualPublic.add(key)
        } else {
          expect(operation.security, `${key} 不应覆盖全局鉴权`).toBeUndefined()
        }
      }
    }

    expect([...actualPublic].sort()).toEqual([...expectedPublic].sort())
  })

  it('核心契约字段被文档覆盖（ETag / If-Match / Idempotency-Key / 409）', () => {
    const pagePut = (spec.paths['/pages/{id}/schema'] as any).put
    expect(pagePut.parameters.some((p: any) => p.name === 'If-Match' && p.in === 'header')).toBe(true)
    expect(pagePut.responses['409']).toBeTruthy()

    const recordPut = (spec.paths['/models/{modelId}/records/{rid}'] as any).put
    expect(recordPut.parameters.some((p: any) => p.name === 'If-Match' && p.in === 'header')).toBe(true)
    expect(recordPut.responses['409']).toBeTruthy()

    const decide = (spec.paths['/flows/instances/{instanceId}/tasks/{taskId}'] as any).post
    expect(decide.parameters.some((p: any) => p.name === 'Idempotency-Key' && p.in === 'header')).toBe(true)
    expect(decide.responses['409']).toBeTruthy()

    const webhookPut = (spec.paths['/webhooks/{id}'] as any).put
    expect(webhookPut.parameters.some((p: any) => p.name === 'If-Match' && p.in === 'header')).toBe(true)
    expect(webhookPut.responses['409']).toBeTruthy()

    const upload = (spec.paths['/files/upload'] as any).post
    expect(upload.requestBody.content['multipart/form-data']).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ */
/* 真实 HTTP 端点                                                     */
/* ------------------------------------------------------------------ */

describe('GET /api/v1/openapi.json', () => {
  let app: INestApplication
  let base: string
  let dataDir: string

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'lc-openapi-test-'))
    process.env.LC_DATA_DIR = dataDir
    process.env.LC_JWT_SECRET = 'test-secret-0123456789-abcdefghij'

    app = await NestFactory.create(AppModule, { logger: false })
    app.setGlobalPrefix('api/v1')
    await app.listen(0, '127.0.0.1')
    base = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
    await rm(dataDir, { recursive: true, force: true })
  })

  it('无需令牌即可读取，返回 OpenAPI 3.1 文档与缓存头', async () => {
    const res = await fetch(`${base}/api/v1/openapi.json`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toContain('max-age=300')
    expect(res.headers.get('x-request-id')).toBeTruthy()

    const body = (await res.json()) as Record<string, any>
    expect(body.openapi).toBe('3.1.0')
    expect(body.servers).toEqual([{ url: '/api/v1', description: '同源部署（服务端全局前缀）' }])
    expect(Object.keys(body.paths)).toHaveLength(Object.keys(spec.paths).length)
    expect(body.paths['/openapi.json'].get.operationId).toBe('getOpenApiDocument')
    expect(body.paths['/pages/{id}/schema'].put.parameters.some((p: any) => p.name === 'If-Match')).toBe(true)
  })
})
