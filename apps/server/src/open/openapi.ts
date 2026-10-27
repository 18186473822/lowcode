/**
 * OpenAPI 3.1 文档构建器（Phase 4 开放集成第一批）。
 *
 * 设计目标：
 * 1. **单一事实源**：文档由本文件显式声明，`test/openapi.test.ts` 通过 Nest 路由元数据
 *    反射实际 controller，路径/方法少一条或多一条都会失败，防止文档漂移；
 * 2. **只描述真实契约**：成功/错误响应、鉴权、`If-Match`、`Idempotency-Key` 均以
 *    `docs/protocol.md` 第 10 章与 `apps/server/src` 当前实现为准；
 * 3. **零运行时依赖**：不引入 `@nestjs/swagger` / Swagger UI，只输出标准 JSON，
 *    可直接导入 Swagger UI、Apifox、Postman、OpenAPI Generator 等工具。
 *
 * 路径**不含**全局前缀 `/api/v1`，由 `servers[0].url` 提供；这样同一份文档既能被
 * 当前同源部署使用，也能在网关改写前缀后复用。
 */

/** OpenAPI 文档顶层结构（只约束必要字段，避免为纯数据文件引入重量级类型依赖）。 */
export interface OpenApiDocument {
  openapi: '3.1.0'
  info: Record<string, unknown>
  servers: Array<Record<string, unknown>>
  tags: Array<Record<string, unknown>>
  security: Array<Record<string, string[]>>
  paths: Record<string, Record<string, unknown>>
  components: Record<string, unknown>
}

type Json = Record<string, unknown>

/** 组件引用（schema / response / header 通用）。 */
const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` })
const responseRef = (name: string): Json => ({ $ref: `#/components/responses/${name}` })
const headerRef = (name: string): Json => ({ $ref: `#/components/headers/${name}` })

/** JSON 请求/响应体。 */
const jsonContent = (schema: Json): Json => ({ 'application/json': { schema } })

/** 成功响应；`schema` 缺省表示无响应体（如 204）。 */
function ok(description: string, schema?: Json, headers?: Json): Json {
  const out: Json = { description }
  if (schema) out.content = jsonContent(schema)
  if (headers) out.headers = headers
  return out
}

/** 带 ETag 响应头的成功响应。 */
function okWithEtag(description: string, schema: Json): Json {
  return ok(description, schema, { ETag: headerRef('ETag') })
}

/** 请求体。 */
function body(schema: Json, required = true): Json {
  return { required, content: jsonContent(schema) }
}

/** 路径参数。 */
function pathParam(name: string, description: string, example?: string): Json {
  const out: Json = {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'string' },
  }
  if (example !== undefined) out.example = example
  return out
}

/** 查询参数。 */
function queryParam(name: string, description: string, schema: Json, example?: unknown): Json {
  const out: Json = { name, in: 'query', required: false, description, schema }
  if (example !== undefined) out.example = example
  return out
}

/** 请求头参数。 */
function headerParam(name: string, description: string, schema: Json, example?: string): Json {
  const out: Json = { name, in: 'header', required: false, description, schema }
  if (example !== undefined) out.example = example
  return out
}

/** 构造一个 operation；`extra` 可覆盖 description / parameters / requestBody / security 等。 */
function op(
  tag: string,
  operationId: string,
  summary: string,
  responses: Json,
  extra: Json = {},
): Json {
  return { tags: [tag], operationId, summary, responses, ...extra }
}

/** 公共接口：全局 `bearerAuth` 之外显式声明 `security: []`。 */
function publicOp(
  tag: string,
  operationId: string,
  summary: string,
  responses: Json,
  extra: Json = {},
): Json {
  return { ...op(tag, operationId, summary, responses, extra), security: [] }
}

const ETAG_PAGE = '"page:p_demo:3"'
const ETAG_RECORD = '"record:m_employee/rec_1:2"'
const ETAG_FLOW = '"flow:inst_1:4"'

/* ------------------------------------------------------------------ */
/* 可复用 schema                                                       */
/* ------------------------------------------------------------------ */

const infoSchema: Json = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: { type: 'string', description: '业务错误码，见 `docs/protocol.md` §10.3' },
    message: { type: 'string', description: '面向调用方的错误说明' },
    errors: { type: 'array', items: ref('Issue'), description: '校验错误列表' },
    warnings: { type: 'array', items: ref('Issue'), description: '校验警告列表' },
    issues: { type: 'array', items: ref('Issue'), description: '流程定义校验问题列表' },
    expectedRevision: { type: 'integer', description: '客户端期望的版本' },
    currentRevision: { type: 'integer', description: '服务端当前版本' },
    modelId: { type: 'string', description: '记录冲突时回带模型 id' },
    requestId: { type: 'string', description: '请求 ID（响应头 X-Request-Id 同值）' },
  },
  additionalProperties: true,
}

const issueSchema: Json = {
  type: 'object',
  required: ['code', 'severity', 'message'],
  properties: {
    code: { type: 'string', examples: ['E_REQUIRED'] },
    severity: { type: 'string', enum: ['error', 'warning'] },
    path: { type: 'string', examples: ['fields[0].key'] },
    message: { type: 'string' },
  },
  additionalProperties: true,
}

const userSchema: Json = {
  type: 'object',
  required: ['id', 'username', 'displayName', 'roles'],
  properties: {
    id: { type: 'string' },
    username: { type: 'string' },
    displayName: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
  },
}

const authUserSchema: Json = {
  type: 'object',
  required: ['sub', 'username', 'roles'],
  properties: {
    sub: { type: 'string' },
    username: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
  },
}

const loginRequestSchema: Json = {
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: { type: 'string', minLength: 1 },
    password: { type: 'string', minLength: 1 },
  },
}

const loginResponseSchema: Json = {
  type: 'object',
  required: ['accessToken', 'tokenType', 'expiresIn', 'perms', 'user'],
  properties: {
    accessToken: { type: 'string', description: 'HS256 JWT' },
    tokenType: { const: 'Bearer' },
    expiresIn: { type: 'integer', examples: [28800], description: '有效期（秒）' },
    perms: {
      type: 'array',
      items: { type: 'string' },
      description: '角色权限点并集；包含 `*` 表示超级角色',
    },
    user: userSchema,
  },
}

const themeSchema: Json = {
  type: 'object',
  properties: {
    primary: { type: 'string', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', examples: ['#1677ff'] },
    radius: { type: 'string', pattern: '^\\d+(?:\\.\\d+)?px$', examples: ['12px'] },
    dark: { type: 'boolean' },
  },
  additionalProperties: false,
}

const appConfigSchema: Json = {
  type: 'object',
  properties: { theme: themeSchema },
  additionalProperties: false,
}

const appConfigPatchSchema: Json = {
  type: 'object',
  required: ['theme'],
  properties: {
    theme: {
      type: 'object',
      properties: {
        primary: { type: ['string', 'null'] },
        radius: { type: ['string', 'null'] },
        dark: { type: ['boolean', 'null'] },
      },
      additionalProperties: false,
      description: 'patch 语义：缺键保留旧值，显式 null 清除该键',
    },
  },
}

const menuPageSchema: Json = {
  type: 'object',
  required: ['id', 'name', 'type', 'status', 'currentVersion', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'published'] },
    currentVersion: { type: 'integer' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const menuAppSchema: Json = {
  type: 'object',
  required: ['id', 'name', 'pages'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    pages: { type: 'array', items: menuPageSchema },
  },
}

const bootstrapSchema: Json = {
  type: 'object',
  required: ['user', 'perms', 'apps'],
  properties: {
    user: authUserSchema,
    perms: { type: 'array', items: { type: 'string' } },
    apps: { type: 'array', items: menuAppSchema },
    theme: themeSchema,
  },
}

const meSchema: Json = {
  type: 'object',
  required: ['user'],
  properties: { user: authUserSchema },
}

const pageSummarySchema: Json = {
  type: 'object',
  required: [
    'id', 'appId', 'name', 'type', 'status', 'currentVersion', 'revision', 'versionCount', 'updatedAt', 'createdAt',
  ],
  properties: {
    id: { type: 'string', pattern: '^[A-Za-z_][\\w-]{0,63}$' },
    appId: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['form', 'list', 'detail', 'portal', 'custom'] },
    status: { type: 'string', enum: ['draft', 'published'] },
    currentVersion: { type: 'integer', minimum: 0, description: '已发布的最新版本；从未发布为 0' },
    revision: { type: 'integer', minimum: 0 },
    versionCount: { type: 'integer', minimum: 0 },
    updatedAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

const pageSchema: Json = {
  type: 'object',
  required: ['schemaVersion', 'id', 'name', 'type', 'root'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$', examples: ['1.0.0'] },
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['form', 'list', 'detail', 'portal', 'custom'] },
    root: { type: 'object', additionalProperties: true, description: '节点树，见 protocol.md 第 2 章' },
  },
  additionalProperties: true,
}

const pageSchemaResponseSchema: Json = {
  oneOf: [
    {
      type: 'object',
      required: ['pageId', 'status', 'currentVersion', 'revision', 'version', 'schema', 'updatedAt'],
      properties: {
        pageId: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published'] },
        currentVersion: { type: 'integer', minimum: 0 },
        revision: { type: 'integer', minimum: 0 },
        version: { const: 'draft' },
        schema: pageSchema,
        updatedAt: { type: 'string', format: 'date-time' },
        updatedBy: { type: 'string' },
      },
    },
    {
      type: 'object',
      required: ['pageId', 'status', 'currentVersion', 'revision', 'version', 'schema', 'createdAt', 'createdBy'],
      properties: {
        pageId: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published'] },
        currentVersion: { type: 'integer', minimum: 0 },
        revision: { type: 'integer', minimum: 0 },
        version: { type: 'integer', minimum: 1 },
        schema: pageSchema,
        createdAt: { type: 'string', format: 'date-time' },
        createdBy: { type: 'string' },
        note: { type: 'string' },
      },
    },
  ],
}

const validationResultSchema: Json = {
  type: 'object',
  required: ['valid', 'errors', 'warnings'],
  properties: {
    valid: { type: 'boolean' },
    errors: { type: 'array', items: issueSchema },
    warnings: { type: 'array', items: issueSchema },
  },
}

const pageSaveResponseSchema: Json = {
  type: 'object',
  required: ['pageId', 'status', 'currentVersion', 'revision', 'updatedAt', 'validation'],
  properties: {
    pageId: { type: 'string' },
    status: { const: 'draft' },
    currentVersion: { type: 'integer', minimum: 0 },
    revision: { type: 'integer', minimum: 0 },
    updatedAt: { type: 'string', format: 'date-time' },
    validation: {
      type: 'object',
      required: ['valid', 'warnings'],
      properties: {
        valid: { const: true },
        warnings: { type: 'array', items: issueSchema },
      },
    },
  },
}

const pagePublishResponseSchema: Json = {
  type: 'object',
  required: ['pageId', 'status', 'version', 'revision', 'publishedAt', 'createdBy'],
  properties: {
    pageId: { type: 'string' },
    status: { const: 'published' },
    version: { type: 'integer', minimum: 1 },
    revision: { type: 'integer', minimum: 0 },
    publishedAt: { type: 'string', format: 'date-time' },
    createdBy: { type: 'string' },
    note: { type: 'string' },
  },
}

const pageRollbackResponseSchema: Json = {
  type: 'object',
  required: ['pageId', 'status', 'currentVersion', 'revision', 'rolledBackTo', 'updatedAt'],
  properties: {
    pageId: { type: 'string' },
    status: { const: 'draft' },
    currentVersion: { type: 'integer', minimum: 0 },
    revision: { type: 'integer', minimum: 0 },
    rolledBackTo: { type: 'integer', minimum: 1 },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const pageVersionsResponseSchema: Json = {
  type: 'object',
  required: ['pageId', 'status', 'currentVersion', 'versions'],
  properties: {
    pageId: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'published'] },
    currentVersion: { type: 'integer', minimum: 0 },
    versions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['version', 'createdBy', 'createdAt'],
        properties: {
          version: { type: 'integer', minimum: 1 },
          createdBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          note: { type: 'string' },
        },
      },
    },
  },
}

const pageDeleteResponseSchema: Json = {
  type: 'object',
  required: ['pageId', 'deleted', 'removedVersions'],
  properties: {
    pageId: { type: 'string' },
    deleted: { const: true },
    removedVersions: { type: 'integer', minimum: 0 },
  },
}

const fieldTypeSchema: Json = {
  type: 'string',
  enum: [
    'id', 'string', 'text', 'number', 'money', 'boolean', 'date', 'datetime', 'enum',
    'relation', 'file', 'user', 'dept', 'location', 'json',
  ],
}

const fieldSchema: Json = {
  type: 'object',
  required: ['key', 'name', 'type'],
  properties: {
    key: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
    name: { type: 'string' },
    type: fieldTypeSchema,
    length: { type: 'integer', minimum: 1 },
    precision: { type: 'integer' },
    required: { type: 'boolean' },
    unique: { type: 'boolean' },
    defaultValue: {},
    options: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label', 'value'],
        properties: { label: { type: 'string' }, value: { type: ['string', 'number'] } },
      },
    },
    refModel: { type: 'string' },
    refField: { type: 'string' },
    maxCount: { type: 'integer', minimum: 1 },
    accept: { type: 'string' },
    auto: { enum: ['now', 'autoIncrement', true] },
    readonly: { type: 'boolean' },
    placeholder: { type: 'string' },
    help: { type: 'string' },
    rules: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  additionalProperties: true,
}

const modelSchema: Json = {
  type: 'object',
  required: ['schemaVersion', 'id', 'name', 'code', 'fields'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    id: { type: 'string', pattern: '^[A-Za-z_][\\w-]{0,63}$' },
    name: { type: 'string' },
    code: { type: 'string' },
    type: { type: 'string', enum: ['table', 'view'] },
    fields: { type: 'array', minItems: 1, items: fieldSchema },
    indexes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fields'],
        properties: {
          fields: { type: 'array', items: { type: 'string' } },
          type: { type: 'string', enum: ['unique', 'normal'] },
        },
      },
    },
    permissions: {
      type: 'object',
      properties: {
        create: { type: 'array', items: { type: 'string' } },
        read: { type: 'array', items: { type: 'string' } },
        update: { type: 'array', items: { type: 'string' } },
        delete: { type: 'array', items: { type: 'string' } },
      },
    },
    dataScope: { type: 'string', enum: ['all', 'dept', 'deptAndChild', 'self'] },
    formPageId: { type: 'string' },
    listPageId: { type: 'string' },
  },
  additionalProperties: true,
}

const modelSummarySchema: Json = {
  type: 'object',
  required: ['id', 'name', 'code', 'fieldCount', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    code: { type: 'string' },
    type: { type: 'string', enum: ['table', 'view'] },
    fieldCount: { type: 'integer', minimum: 0 },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const modelResponseSchema: Json = {
  allOf: [
    modelSchema,
    {
      type: 'object',
      required: ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'],
      properties: {
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        createdBy: { type: 'string' },
        updatedBy: { type: 'string' },
      },
    },
  ],
}

const modelSaveResponseSchema: Json = {
  allOf: [
    modelResponseSchema,
    {
      type: 'object',
      required: ['validation'],
      properties: {
        validation: {
          type: 'object',
          required: ['valid', 'warnings'],
          properties: { valid: { const: true }, warnings: { type: 'array', items: issueSchema } },
        },
      },
    },
  ],
}

const recordSchema: Json = {
  type: 'object',
  required: ['id', 'revision', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'],
  properties: {
    id: { type: 'string', pattern: '^[A-Za-z0-9][\\w-]{0,63}$' },
    revision: { type: 'integer', minimum: 0 },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    createdBy: { type: 'string' },
    updatedBy: { type: 'string' },
  },
  additionalProperties: true,
  description: '业务字段随模型定义动态变化，因此允许任意附加属性',
}

const recordListSchema: Json = {
  type: 'object',
  required: ['items', 'total', 'page', 'size'],
  properties: {
    items: { type: 'array', items: recordSchema },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    size: { type: 'integer', minimum: 1, maximum: 100 },
  },
}

const recordDeleteResponseSchema: Json = {
  type: 'object',
  required: ['id', 'deleted', 'deletedAt', 'revision'],
  properties: {
    id: { type: 'string' },
    deleted: { const: true },
    deletedAt: { type: 'string', format: 'date-time' },
    revision: { type: 'integer', minimum: 0 },
  },
}

const fileUploadResponseSchema: Json = {
  type: 'object',
  required: ['fileId', 'url', 'name', 'size', 'mimeType'],
  properties: {
    fileId: { type: 'string' },
    url: { type: 'string', examples: ['/api/v1/files/9f0d.png'] },
    name: { type: 'string' },
    size: { type: 'integer', minimum: 1 },
    mimeType: { type: 'string' },
  },
}

const flowSchema: Json = {
  type: 'object',
  required: ['flowId', 'name', 'modelId', 'mode', 'nodes'],
  properties: {
    flowId: { type: 'string' },
    name: { type: 'string' },
    modelId: { type: 'string' },
    mode: { type: 'string', enum: ['linear', 'condition'] },
    nodes: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  additionalProperties: true,
}

const flowTaskSchema: Json = {
  type: 'object',
  required: ['id', 'nodeId', 'nodeName', 'assignee', 'status', 'createdAt'],
  properties: {
    id: { type: 'string' },
    nodeId: { type: 'string' },
    nodeName: { type: 'string' },
    assignee: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['role', 'dept', 'starter'] },
        value: { type: 'string' },
      },
    },
    status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
    comment: { type: 'string' },
    decidedBy: { type: 'string' },
    decidedAt: { type: 'string', format: 'date-time' },
    idempotencyKey: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

const flowHistorySchema: Json = {
  type: 'object',
  required: ['nodeId', 'nodeName', 'action', 'actor', 'at'],
  properties: {
    nodeId: { type: 'string' },
    nodeName: { type: 'string' },
    action: {
      type: 'string',
      enum: ['start', 'approve', 'reject', 'skip', 'end', 'reenter'],
    },
    actor: { type: 'string' },
    comment: { type: 'string' },
    at: { type: 'string', format: 'date-time' },
  },
}

const flowInstanceSchema: Json = {
  type: 'object',
  required: [
    'id', 'flowId', 'modelId', 'recordId', 'status', 'currentNodeId', 'createdBy', 'createdAt', 'updatedAt', 'tasks', 'history',
  ],
  properties: {
    id: { type: 'string' },
    flowId: { type: 'string' },
    modelId: { type: 'string' },
    recordId: { type: 'string' },
    status: { type: 'string', enum: ['running', 'approved', 'rejected'] },
    currentNodeId: { type: ['string', 'null'] },
    createdBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    revision: { type: 'integer', minimum: 0 },
    pendingPatch: { type: 'object', additionalProperties: true },
    tasks: { type: 'array', items: flowTaskSchema },
    history: { type: 'array', items: flowHistorySchema },
  },
}

const todoTaskSchema: Json = {
  type: 'object',
  required: ['taskId', 'instanceId', 'flowId', 'flowName', 'modelId', 'recordId', 'nodeName', 'createdBy', 'createdAt'],
  properties: {
    taskId: { type: 'string' },
    instanceId: { type: 'string' },
    flowId: { type: 'string' },
    flowName: { type: 'string' },
    modelId: { type: 'string' },
    recordId: { type: 'string' },
    nodeName: { type: 'string' },
    createdBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

const flowListSchema: Json = {
  type: 'object',
  required: ['flows'],
  properties: { flows: { type: 'array', items: flowSchema } },
}

const flowInstancesSchema: Json = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: flowInstanceSchema } },
}

const todoListSchema: Json = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: todoTaskSchema } },
}

const rbacRoleSchema: Json = {
  type: 'object',
  required: ['key', 'name', 'perms'],
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
    perms: { type: 'array', items: { type: 'string' } },
  },
}

const rbacConfigSchema: Json = {
  type: 'object',
  required: ['roles', 'pages'],
  properties: {
    roles: { type: 'array', items: rbacRoleSchema },
    pages: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
      description: 'pageId → 可见角色；缺省键 = 全员可见',
    },
  },
}

const rbacRoleUpsertResponseSchema: Json = {
  type: 'object',
  required: ['key', 'saved'],
  properties: { key: { type: 'string' }, saved: { const: true } },
}

const rbacPageAuthResponseSchema: Json = {
  type: 'object',
  required: ['pageId', 'roles', 'saved'],
  properties: {
    pageId: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
    saved: { const: true },
  },
}

const opsEventInputSchema: Json = {
  type: 'object',
  required: ['type', 'name'],
  properties: {
    type: { type: 'string', enum: ['error', 'perf', 'event'] },
    name: { type: 'string', minLength: 1, maxLength: 64 },
    pageId: { type: 'string', pattern: '^[A-Za-z_][\\w-]{0,63}$' },
    pageVersion: { oneOf: [{ type: 'integer', minimum: 0 }, { const: 'draft' }] },
    source: { type: 'string', enum: ['runtime', 'designer', 'server'] },
    message: { type: 'string', description: 'type=error 时必填；服务端超长会截断' },
    durationMs: { type: 'number', minimum: 0, maximum: 600000, description: 'type=perf 时必填' },
    detail: { type: 'object', additionalProperties: true },
  },
  description: '上报形状；服务端会忽略未声明字段，因此读取回包可在此基础上追加审计字段',
}

const opsEventSchema: Json = {
  allOf: [
    opsEventInputSchema,
    {
      type: 'object',
      required: ['id', 'source', 'userId', 'at'],
      properties: {
        id: { type: 'string', examples: ['evt_...'] },
        source: { type: 'string', enum: ['runtime', 'designer', 'server'] },
        userId: { type: 'string' },
        at: { type: 'string', format: 'date-time' },
      },
    },
  ],
}

const opsIngestResponseSchema: Json = {
  type: 'object',
  required: ['accepted', 'total', 'dropped'],
  properties: {
    accepted: { type: 'integer', minimum: 1, maximum: 50 },
    total: { type: 'integer', minimum: 0 },
    dropped: { type: 'integer', minimum: 0 },
  },
}

const opsListResponseSchema: Json = {
  type: 'object',
  required: ['items', 'total'],
  properties: {
    items: { type: 'array', items: opsEventSchema },
    total: { type: 'integer', minimum: 0 },
  },
}

const opsSummarySchema: Json = {
  type: 'object',
  required: ['total', 'byType', 'errors', 'perf', 'lastAt'],
  properties: {
    total: { type: 'integer', minimum: 0 },
    byType: {
      type: 'object',
      required: ['error', 'perf', 'event'],
      properties: {
        error: { type: 'integer', minimum: 0 },
        perf: { type: 'integer', minimum: 0 },
        event: { type: 'integer', minimum: 0 },
      },
    },
    errors: {
      type: 'object',
      required: ['total', 'lastAt'],
      properties: {
        total: { type: 'integer', minimum: 0 },
        lastAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    perf: {
      type: 'object',
      required: ['count', 'avgMs', 'p95Ms', 'maxMs'],
      properties: {
        count: { type: 'integer', minimum: 0 },
        avgMs: { type: 'number', minimum: 0 },
        p95Ms: { type: 'number', minimum: 0 },
        maxMs: { type: 'number', minimum: 0 },
      },
    },
    lastAt: { type: ['string', 'null'], format: 'date-time' },
  },
}

/* ------------------------------------------------------------------ */
/* Webhook 订阅 / 投递                                                 */
/* ------------------------------------------------------------------ */

const webhookEventTypeSchema: Json = {
  type: 'string',
  enum: [
    'record.created',
    'record.updated',
    'record.deleted',
    'flow.started',
    'flow.task.approved',
    'flow.task.rejected',
    'flow.completed',
    'flow.rejected',
  ],
}

const webhookSubscriptionSchema: Json = {
  type: 'object',
  required: [
    'id', 'name', 'url', 'events', 'headers', 'rateLimitPerMinute', 'active', 'maxAttempts',
    'timeoutMs', 'revision', 'secretPreview', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string', maxLength: 64 },
    description: { type: 'string', maxLength: 500 },
    url: { type: 'string', maxLength: 2048 },
    events: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', enum: ['*', ...webhookEventTypeSchema.enum as string[]] },
    },
    headers: {
      type: 'object',
      additionalProperties: { type: 'string', maxLength: 1024 },
      description: '自定义请求头；X-LC-* / Host / Content-Length 等系统头禁止覆盖',
    },
    rateLimitPerMinute: { type: 'integer', minimum: 0, maximum: 6000, description: '0 = 不限制' },
    previousSecretExpiresAt: { type: 'string', format: 'date-time' },
    previousSecretPreview: { type: 'string', examples: ['abcd…wxyz'] },
    active: { type: 'boolean' },
    maxAttempts: { type: 'integer', minimum: 1, maximum: 10 },
    timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000 },
    revision: { type: 'integer', minimum: 0 },
    secretPreview: { type: 'string', examples: ['abcd…wxyz'] },
    createdBy: { type: 'string' },
    updatedBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const webhookSubscriptionSecretSchema: Json = {
  allOf: [
    webhookSubscriptionSchema,
    {
      type: 'object',
      required: ['secret'],
      properties: {
        secret: { type: 'string', description: '完整 HMAC secret；只在创建/轮换响应中返回一次' },
      },
    },
  ],
}

const webhookCreateRequestSchema: Json = {
  type: 'object',
  required: ['name', 'url', 'events'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 64 },
    description: { type: 'string', maxLength: 500 },
    url: { type: 'string', maxLength: 2048, examples: ['https://example.com/hooks/lowcode'] },
    events: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: { type: 'string', enum: ['*', ...webhookEventTypeSchema.enum as string[]] },
      description: '`"*"` 只能单独使用',
    },
    secret: { type: 'string', minLength: 16, maxLength: 128, description: '不传则服务端生成 64 位 hex' },
    headers: {
      type: 'object',
      maxProperties: 20,
      additionalProperties: { type: 'string', maxLength: 1024 },
      description: '自定义请求头；禁止 X-LC-* / Host / Content-Length 等系统头',
    },
    rateLimitPerMinute: { type: 'integer', minimum: 0, maximum: 6000, default: 0 },
    active: { type: 'boolean', default: true },
    maxAttempts: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
    timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000, default: 10000 },
  },
  additionalProperties: false,
}

const webhookPatchRequestSchema: Json = {
  type: 'object',
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 64 },
    description: { type: ['string', 'null'], maxLength: 500 },
    url: { type: 'string', maxLength: 2048 },
    events: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: { type: 'string', enum: ['*', ...webhookEventTypeSchema.enum as string[]] },
    },
    headers: {
      type: 'object',
      maxProperties: 20,
      additionalProperties: { type: 'string', maxLength: 1024 },
      description: '传空对象表示清空自定义头',
    },
    rateLimitPerMinute: { type: 'integer', minimum: 0, maximum: 6000 },
    active: { type: 'boolean' },
    maxAttempts: { type: 'integer', minimum: 1, maximum: 10 },
    timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000 },
  },
  additionalProperties: false,
}

const webhookRotateSecretRequestSchema: Json = {
  type: 'object',
  properties: {
    graceSeconds: {
      type: 'integer',
      minimum: 0,
      maximum: 604800,
      default: 86400,
      description: '旧密钥继续签名的宽限期；0 = 立即失效',
    },
  },
  additionalProperties: false,
}

const webhookSubscriptionListSchema: Json = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: ref('WebhookSubscription') } },
}

const webhookDeleteResponseSchema: Json = {
  type: 'object',
  required: ['id', 'deleted'],
  properties: { id: { type: 'string' }, deleted: { const: true } },
}

const webhookDeliveryAttemptSchema: Json = {
  type: 'object',
  required: ['attempt', 'at', 'ok', 'durationMs'],
  properties: {
    attempt: { type: 'integer', minimum: 1 },
    at: { type: 'string', format: 'date-time' },
    ok: { type: 'boolean' },
    status: { type: 'integer', minimum: 100, maximum: 599 },
    durationMs: { type: 'integer', minimum: 0 },
    responseBody: { type: 'string', description: '响应体摘要，最多约 2KB' },
    error: { type: 'string' },
  },
}

const webhookEventEnvelopeSchema: Json = {
  type: 'object',
  required: ['id', 'type', 'occurredAt', 'actor', 'data'],
  properties: {
    id: { type: 'string', description: '事件 id；接收方用于幂等' },
    type: { type: 'string' },
    occurredAt: { type: 'string', format: 'date-time' },
    actor: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
  },
}

const webhookDeliverySchema: Json = {
  type: 'object',
  required: [
    'id', 'subscriptionId', 'eventId', 'eventType', 'payload', 'source', 'status',
    'attempts', 'attemptCount', 'nextAttemptAt', 'revision', 'createdAt', 'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    subscriptionId: { type: 'string' },
    eventId: { type: 'string' },
    eventType: { type: 'string' },
    payload: ref('WebhookEventEnvelope'),
    source: { type: 'string', enum: ['event', 'test'] },
    status: { type: 'string', enum: ['pending', 'success', 'failed'] },
    attempts: { type: 'array', items: ref('WebhookDeliveryAttempt') },
    attemptCount: { type: 'integer', minimum: 0 },
    nextAttemptAt: { type: 'string', format: 'date-time' },
    lastAttemptAt: { type: 'string', format: 'date-time' },
    responseStatus: { type: 'integer', minimum: 100, maximum: 599 },
    responseBody: { type: 'string' },
    error: { type: 'string' },
    leaseOwner: { type: 'string', description: '当前租约持有副本；为空表示未被领取' },
    leaseExpiresAt: { type: 'string', format: 'date-time' },
    revision: { type: 'integer', minimum: 0 },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const webhookMetricsSchema: Json = {
  type: 'object',
  required: [
    'total', 'pending', 'success', 'failed', 'last24hTotal', 'last24hSuccess', 'last24hFailed',
    'generatedAt', 'failureRate', 'thresholds', 'alerts', 'ok',
  ],
  properties: {
    total: { type: 'integer', minimum: 0 },
    pending: { type: 'integer', minimum: 0 },
    success: { type: 'integer', minimum: 0 },
    failed: { type: 'integer', minimum: 0 },
    oldestPendingAt: { type: 'string', format: 'date-time' },
    last24hTotal: { type: 'integer', minimum: 0 },
    last24hSuccess: { type: 'integer', minimum: 0 },
    last24hFailed: { type: 'integer', minimum: 0 },
    generatedAt: { type: 'string', format: 'date-time' },
    failureRate: { type: 'number', minimum: 0, maximum: 1 },
    thresholds: {
      type: 'object',
      required: ['failureRate', 'queueDepth', 'pendingAgeMs'],
      properties: {
        failureRate: { type: 'number' },
        queueDepth: { type: 'integer' },
        pendingAgeMs: { type: 'integer' },
      },
    },
    alerts: { type: 'array', items: { type: 'string' } },
    ok: { type: 'boolean' },
  },
}

const webhookCleanupResponseSchema: Json = {
  type: 'object',
  required: ['archived'],
  properties: { archived: { type: 'integer', minimum: 0 } },
}

const webhookDeliveryListSchema: Json = {
  type: 'object',
  required: ['items', 'total', 'page', 'size'],
  properties: {
    items: { type: 'array', items: ref('WebhookDelivery') },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    size: { type: 'integer', minimum: 1, maximum: 100 },
  },
}

/* ------------------------------ 物料市场 ------------------------------ */

const marketMaterialEntrySchema: Json = {
  type: 'object',
  required: ['id', 'name', 'version', 'category', 'kind', 'meta'],
  properties: {
    id: { type: 'string', examples: ['brand-button-2026'] },
    name: { type: 'string', maxLength: 64 },
    version: { type: 'string', description: 'semver，如 `1.0.0`', examples: ['1.0.0'] },
    description: { type: 'string', maxLength: 500 },
    category: { type: 'string', enum: ['basic', 'layout', 'form', 'data', 'nav', 'feedback', 'biz'] },
    kind: { type: 'string', enum: ['meta', 'component'] },
    component: {
      type: 'string',
      description: '`kind=component` 必填，且必须是宿主内置组件（`@lc/schema` 的 `BUILTIN_COMPONENT_IDS`）',
      examples: ['Button'],
    },
    meta: { type: 'object', additionalProperties: true, description: '`MaterialSchema` 原始结构' },
  },
}

const marketMaterialSchema: Json = {
  allOf: [
    ref('MarketMaterialEntry'),
    {
      type: 'object',
      required: ['status', 'revision', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt'],
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'pending', 'approved', 'rejected', 'published', 'unpublished'],
        },
        revision: { type: 'integer', minimum: 1 },
        createdBy: { type: 'string' },
        updatedBy: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        submittedAt: { type: 'string', format: 'date-time' },
        reviewedAt: { type: 'string', format: 'date-time' },
        reviewedBy: { type: 'string' },
        reviewDecision: { type: 'string', enum: ['approved', 'rejected'] },
        reviewNote: { type: 'string', maxLength: 500 },
        publishedAt: { type: 'string', format: 'date-time' },
        publishedBy: { type: 'string' },
        publishedVersion: { type: 'string' },
      },
    },
  ],
}

const marketMaterialListSchema: Json = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: ref('MarketMaterial') } },
}

const marketPublicMaterialListSchema: Json = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: ref('MarketMaterialEntry') } },
}

const marketManifestSchema: Json = {
  type: 'object',
  required: ['schemaVersion', 'name', 'generatedAt', 'materials'],
  properties: {
    schemaVersion: { const: 1 },
    name: { type: 'string' },
    generatedAt: {
      type: 'string',
      format: 'date-time',
      description: '已发布物料的最大 `updatedAt`；空市场为 `1970-01-01T00:00:00.000Z`，保证缓存稳定',
    },
    materials: { type: 'array', items: ref('MarketMaterialEntry') },
  },
}

const marketManifestEnvelopeSchema: Json = {
  type: 'object',
  required: ['alg', 'signature', 'manifest'],
  properties: {
    alg: { const: 'ES256' },
    signature: { type: 'string', description: 'base64 编码的 raw r||s 签名（IEEE P1363）' },
    manifest: ref('MarketManifest'),
  },
}

const marketManifestKeySchema: Json = {
  type: 'object',
  required: ['alg', 'publicKey', 'fingerprint', 'kid'],
  properties: {
    alg: { const: 'ES256' },
    publicKey: { type: 'string', description: 'SPKI PEM 公钥（非秘密），用于客户端验签' },
    fingerprint: { type: 'string', description: '`sha256:` + SPKI DER 的 SHA-256 十六进制' },
    kid: { type: 'string', description: '密钥标识；未配置 `LC_MATERIAL_MARKET_KID` 时等于指纹' },
  },
}

const marketVersionSchema: Json = {
  type: 'object',
  required: ['materialId', 'version', 'entry', 'publishedBy', 'publishedAt'],
  properties: {
    materialId: { type: 'string' },
    version: { type: 'string' },
    entry: ref('MarketMaterialEntry'),
    note: { type: 'string', maxLength: 500 },
    publishedBy: { type: 'string' },
    publishedAt: { type: 'string', format: 'date-time' },
  },
}

const marketVersionListSchema: Json = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: ref('MarketVersion') } },
}

const marketInstallSchema: Json = {
  type: 'object',
  required: [
    'tenantId', 'materialId', 'version', 'installedBy', 'installedAt', 'updatedAt', 'revision',
  ],
  properties: {
    tenantId: { type: 'string', description: '来自 `X-LC-Tenant`，缺省 `default`' },
    materialId: { type: 'string' },
    version: { type: 'string' },
    installedBy: { type: 'string' },
    installedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    revision: { type: 'integer', minimum: 1 },
  },
}

const marketInstallListSchema: Json = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: ref('MarketInstall') } },
}

const marketMaterialInputSchema: Json = {
  type: 'object',
  required: ['id', 'name', 'version', 'kind', 'meta'],
  properties: {
    id: {
      type: 'string',
      description: '小写字母开头，3~64 位，仅 `a-z0-9-`；更新时若携带必须与路径一致',
      examples: ['brand-button-2026'],
    },
    name: { type: 'string', maxLength: 64 },
    description: { type: 'string', maxLength: 500 },
    version: { type: 'string', description: 'semver' },
    category: { type: 'string', enum: ['basic', 'layout', 'form', 'data', 'nav', 'feedback', 'biz'] },
    kind: { type: 'string', enum: ['meta', 'component'] },
    component: { type: 'string' },
    meta: { type: 'object', additionalProperties: true },
  },
}

const marketReviewRequestSchema: Json = {
  type: 'object',
  required: ['decision'],
  properties: {
    decision: { type: 'string', enum: ['approve', 'reject'] },
    note: { type: 'string', maxLength: 500, description: '`reject` 时必填' },
  },
}

const marketInstallRequestSchema: Json = {
  type: 'object',
  required: ['version'],
  properties: {
    version: { type: 'string', description: '必须等于物料当前已发布版本，否则 409 `MARKET_VERSION_MISMATCH`' },
  },
}

const marketUninstallResponseSchema: Json = {
  type: 'object',
  required: ['tenantId', 'materialId', 'removed'],
  properties: {
    tenantId: { type: 'string' },
    materialId: { type: 'string' },
    removed: { const: true },
  },
}

const healthSchema: Json = {
  type: 'object',
  required: ['status', 'storage', 'version', 'uptimeSeconds', 'timestamp'],
  properties: {
    status: { const: 'ok' },
    storage: { type: 'string', enum: ['json', 'mysql'] },
    version: { type: 'string', examples: ['0.1.0'] },
    uptimeSeconds: { type: 'integer', minimum: 0 },
    timestamp: { type: 'string', format: 'date-time' },
  },
}

const readySchema: Json = {
  type: 'object',
  required: ['status', 'storage', 'checks', 'timestamp'],
  properties: {
    status: { const: 'ok' },
    storage: { type: 'string', enum: ['json', 'mysql'] },
    checks: {
      type: 'object',
      additionalProperties: { type: 'string' },
      examples: [{ dataDir: 'ok', database: 'ok' }],
    },
    timestamp: { type: 'string', format: 'date-time' },
  },
}

const openApiDocumentSchema: Json = {
  type: 'object',
  required: ['openapi', 'info', 'paths'],
  properties: {
    openapi: { type: 'string', examples: ['3.1.0'] },
    info: { type: 'object', additionalProperties: true },
    servers: { type: 'array', items: { type: 'object', additionalProperties: true } },
    tags: { type: 'array', items: { type: 'object', additionalProperties: true } },
    security: { type: 'array', items: { type: 'object', additionalProperties: true } },
    paths: { type: 'object', additionalProperties: true },
    components: { type: 'object', additionalProperties: true },
  },
}

/* ------------------------------------------------------------------ */
/* 可复用响应                                                          */
/* ------------------------------------------------------------------ */

const componentsResponses: Json = {
  BadRequest: {
    description: '请求参数/请求体/查询串不合法',
    content: jsonContent(ref('Error')),
  },
  Unauthorized: {
    description: '未登录、令牌无效/过期，或登录凭证错误',
    content: jsonContent(ref('Error')),
  },
  Forbidden: {
    description: '已登录但无权限（RBAC 页面/模型/行级/管理员限制）',
    content: jsonContent(ref('Error')),
  },
  NotFound: {
    description: '资源不存在（页面/模型/记录/流程/文件等）',
    content: jsonContent(ref('Error')),
  },
  Conflict: {
    description: '乐观锁冲突、状态冲突或幂等键复用',
    content: jsonContent(ref('Error')),
  },
  TooLarge: {
    description: '上传文件超过 10MB（multer LIMIT_FILE_SIZE，无业务 code）',
  },
  ServiceUnavailable: {
    description: '存储/数据库未就绪',
    content: jsonContent(ref('Error')),
  },
  RateLimited: {
    description: '请求过于频繁；响应头含 X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset，超限含 Retry-After',
    content: jsonContent(ref('Error')),
    headers: {
      'Retry-After': { schema: { type: 'integer', minimum: 0 }, description: '建议重试等待秒数' },
      'X-RateLimit-Limit': { schema: { type: 'integer' }, description: '当前窗口上限' },
      'X-RateLimit-Remaining': { schema: { type: 'integer' }, description: '当前窗口剩余次数' },
      'X-RateLimit-Reset': { schema: { type: 'integer' }, description: '窗口重置的 Unix 秒' },
    },
  },
}

const componentsHeaders: Json = {
  ETag: {
    description: '资源版本（页面 `"page:<id>:<rev>"`、记录 `"record:<modelId>/<rid>:<rev>"`、流程 `"flow:<id>:<rev>"`、Webhook 订阅 `"webhook:<id>:<rev>"`、投递 `"webhook-delivery:<id>:<rev>"`、物料 `"material:<id>:<rev>"`、安装 `"material-install:<tenantId>/<materialId>:<rev>"`）',
    schema: { type: 'string' },
  },
  XRequestId: {
    description: '请求 ID；合法客户端值原样复用，否则生成 UUID',
    schema: { type: 'string' },
  },
}

/* ------------------------------------------------------------------ */
/* 文档                                                                */
/* ------------------------------------------------------------------ */

export function buildOpenApi(): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {
    /* ------------------------------ 系统 ------------------------------ */
    '/health': {
      get: publicOp('System', 'getHealth', '健康检查（存活探针）', {
        200: ok('进程存活', ref('Health'), { 'X-Request-Id': headerRef('XRequestId') }),
      }, {
        description: '无需登录、不计入限流；用于容器/K8s liveness probe。',
      }),
    },
    '/ready': {
      get: publicOp('System', 'getReady', '就绪检查', {
        200: ok('存储/数据库就绪', ref('Ready'), { 'X-Request-Id': headerRef('XRequestId') }),
        503: responseRef('ServiceUnavailable'),
      }, {
        description: '无需登录、不计入限流；JSON 模式检查数据目录，MySQL 模式同时执行 `SELECT 1`。',
      }),
    },
    '/openapi.json': {
      get: publicOp('System', 'getOpenApiDocument', '获取 OpenAPI 3.1 文档', {
        200: ok('OpenAPI 文档', ref('OpenApiDocument'), {
          'Cache-Control': { schema: { type: 'string' }, description: 'public, max-age=300' },
        }),
      }, {
        description: '无需登录。可直接导入 Swagger UI / Apifox / Postman / OpenAPI Generator。',
      }),
    },

    /* ------------------------------ 认证 ------------------------------ */
    '/auth/login': {
      post: publicOp('Auth', 'login', '登录并获取 JWT', {
        200: ok('登录成功', ref('LoginResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        429: responseRef('RateLimited'),
      }, {
        description: '用户名或口令错误统一返回 `INVALID_CREDENTIALS`，不区分用户是否存在（防枚举）。登录限流默认 20 次/分钟/IP。',
        requestBody: body(ref('LoginRequest')),
      }),
    },
    '/auth/me': {
      get: op('Auth', 'getCurrentUser', '读取当前登录态', {
        200: ok('当前用户', ref('Me')),
        401: responseRef('Unauthorized'),
      }),
    },

    /* ------------------------------ 应用 ------------------------------ */
    '/apps/bootstrap': {
      get: op('Apps', 'getBootstrap', '启动聚合（用户 + 权限 + 菜单 + 主题）', {
        200: ok('启动数据', ref('Bootstrap')),
        401: responseRef('Unauthorized'),
      }, {
        description: '一次请求返回当前用户、权限点、按 `appId` 分组的可见页面菜单与主题；菜单只含页面元数据。',
      }),
    },
    '/apps/config': {
      get: op('Apps', 'getAppConfig', '读取应用配置', {
        200: ok('应用配置；无配置时无 theme 键', ref('AppConfig')),
        401: responseRef('Unauthorized'),
      }),
      put: op('Apps', 'updateAppConfig', '更新应用配置（patch 语义，仅管理员）', {
        200: ok('合并后的 theme', ref('AppConfig')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }, {
        description: '仅 `*` 通配角色可写；缺键保留旧值，显式 `null` 清除该键；未知键/非法颜色/非法 px/非布尔 → `APP_CONFIG_INVALID`。',
        requestBody: body(ref('AppConfigPatch')),
      }),
    },

    /* ------------------------------ 页面 ------------------------------ */
    '/pages': {
      get: op('Pages', 'listPages', '页面列表（轻量摘要，按可见性过滤）', {
        200: ok('页面摘要数组，`updatedAt` 倒序', { type: 'array', items: ref('PageSummary') }),
        401: responseRef('Unauthorized'),
      }, {
        description: '不含 `draft` / `versions` 全文；可见性口径与 `GET /apps/bootstrap` 一致。',
      }),
    },
    '/pages/validate': {
      post: op('Pages', 'validatePageSchema', 'Schema 静态校验', {
        200: ok('校验结果（恒 200，问题在 body）', ref('ValidationResult')),
        401: responseRef('Unauthorized'),
      }, {
        description: '设计器保存前调用；表达式语法与结构规则与保存链路同源。',
        requestBody: body({ type: 'object', properties: { schema: ref('PageSchema') } }, false),
      }),
    },
    '/pages/{id}/schema': {
      get: op('Pages', 'getPageSchema', '读取页面 Schema', {
        200: ok('Schema 与版本信息；响应带 ETag', ref('PageSchemaResponse'), {
          ETag: headerRef('ETag'),
          'Cache-Control': { schema: { type: 'string' }, description: 'no-cache' },
        }),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '`version=draft`（默认）/ `published` / `vN`。无页面可见性权限返回 403 `PAGE_FORBIDDEN`；`published` 但从未发布返回 409 `NOT_PUBLISHED`。',
        parameters: [
          pathParam('id', '页面 id', 'p_demo'),
          queryParam('version', '版本选择器', {
            type: 'string',
            default: 'draft',
            examples: ['draft', 'published', 'v3'],
          }, 'draft'),
        ],
      }),
      put: op('Pages', 'savePageDraft', '保存页面草稿', {
        200: okWithEtag('保存成功；validation 给出警告', ref('PageSaveResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '服务端再次校验 Schema；携带 `If-Match` 时版本不一致返回 409 `VERSION_CONFLICT`，不自动覆盖。',
        parameters: [
          pathParam('id', '页面 id', 'p_demo'),
          headerParam('If-Match', '页面 ETag，如 `"page:p_demo:3"`', { type: 'string' }, ETAG_PAGE),
        ],
        requestBody: body({ type: 'object', required: ['schema'], properties: {
          schema: ref('PageSchema'),
          appId: { type: 'string' },
        } }),
      }),
    },
    '/pages/{id}/publish': {
      post: op('Pages', 'publishPage', '发布页面（固化版本）', {
        200: okWithEtag('发布成功', ref('PagePublishResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '把当前草稿固化为新版本；没有草稿返回 409 `NO_DRAFT`。',
        parameters: [
          pathParam('id', '页面 id', 'p_demo'),
          headerParam('If-Match', '页面 ETag', { type: 'string' }, ETAG_PAGE),
        ],
        requestBody: body({ type: 'object', properties: {
          note: { type: 'string', maxLength: 500 },
        } }, false),
      }),
    },
    '/pages/{id}/rollback': {
      post: op('Pages', 'rollbackPage', '回滚页面到历史版本（写入新草稿）', {
        200: okWithEtag('回滚成功；仍需再次发布才对外生效', ref('PageRollbackResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '只改草稿，`currentVersion` 不回退；版本不存在返回 404 `VERSION_NOT_FOUND`。',
        parameters: [
          pathParam('id', '页面 id', 'p_demo'),
          headerParam('If-Match', '页面 ETag', { type: 'string' }, ETAG_PAGE),
        ],
        requestBody: body({ type: 'object', required: ['version'], properties: {
          version: { type: 'integer', minimum: 1 },
        } }),
      }),
    },
    '/pages/{id}/versions': {
      get: op('Pages', 'listPageVersions', '页面版本历史（轻量元数据，倒序）', {
        200: ok('版本列表；不含 Schema 全文', ref('PageVersionsResponse')),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
      }, {
        description: '查某个版本全文请调用 `GET /pages/{id}/schema?version=vN`。',
        parameters: [pathParam('id', '页面 id', 'p_demo')],
      }),
    },
    '/pages/{id}': {
      delete: op('Pages', 'deletePage', '删除页面及全部历史版本（仅管理员）', {
        200: ok('删除成功', ref('PageDeleteResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
      }, {
        description: '不可恢复；仅 `*` 通配角色可调用。',
        parameters: [pathParam('id', '页面 id', 'p_demo')],
      }),
    },

    /* ------------------------------ 模型 ------------------------------ */
    '/models': {
      get: op('Models', 'listModels', '模型摘要列表', {
        200: ok('模型摘要数组，`updatedAt` 倒序', { type: 'array', items: ref('ModelSummary') }),
        401: responseRef('Unauthorized'),
      }),
    },
    '/models/{id}': {
      get: op('Models', 'getModel', '读取完整模型定义', {
        200: ok('模型定义 + 审计字段', ref('ModelResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
      }, {
        parameters: [pathParam('id', '模型 id', 'm_employee')],
      }),
      put: op('Models', 'saveModel', '保存模型定义（upsert）', {
        200: ok('保存成功；validation 给出警告', ref('ModelSaveResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
      }, {
        description: '不存在即建档；服务端校验 `schemaVersion`、字段 key/类型/保留名、表达式规则语法，失败返回 400 `MODEL_INVALID`。',
        parameters: [pathParam('id', '模型 id', 'm_employee')],
        requestBody: body(ref('ModelSchema')),
      }),
    },

    /* ------------------------------ 记录 ------------------------------ */
    '/models/{modelId}/records': {
      post: op('Records', 'createRecord', '新增业务记录', {
        200: okWithEtag('创建成功', ref('Record')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
      }, {
        description: '只接受模型声明且非只读字段；自动补审计字段；成功后按 `modelId` 匹配流程定义自动启动实例（弱保证，不影响记录提交）。',
        parameters: [pathParam('modelId', '模型 id', 'm_employee')],
        requestBody: body({ type: 'object', additionalProperties: true }),
      }),
      get: op('Records', 'listRecords', '查询业务记录', {
        200: ok('分页结果；每项含 revision', ref('RecordList')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
      }, {
        description: '等值过滤 + 单字段排序 + 分页；软删记录不返回；受模型 CRUD 权限与 dataScope 行级过滤约束。',
        parameters: [
          pathParam('modelId', '模型 id', 'm_employee'),
          queryParam('filter', 'URL 编码的 JSON 等值过滤对象', { type: 'string' }, '{"status":"pending"}'),
          queryParam('sort', '`field:asc` 或 `field:desc`；缺省 `createdAt:desc`', { type: 'string' }, 'createdAt:desc'),
          queryParam('page', '页码，从 1 开始', { type: 'integer', minimum: 1, default: 1 }, 1),
          queryParam('size', '每页条数，1~100', { type: 'integer', minimum: 1, maximum: 100, default: 20 }, 20),
        ],
      }),
    },
    '/models/{modelId}/records/{rid}': {
      put: op('Records', 'updateRecord', '更新业务记录（部分合并）', {
        200: okWithEtag('更新成功；返回合并后的完整记录', ref('Record')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '只合并请求中出现的字段，再对合并结果整体校验；携带 `If-Match` 时版本不一致返回 409 `VERSION_CONFLICT`。',
        parameters: [
          pathParam('modelId', '模型 id', 'm_employee'),
          pathParam('rid', '记录 id', 'rec_1'),
          headerParam('If-Match', '记录 ETag，如 `"record:m_employee/rec_1:2"`', { type: 'string' }, ETAG_RECORD),
        ],
        requestBody: body({ type: 'object', additionalProperties: true }),
      }),
      delete: op('Records', 'deleteRecord', '软删除业务记录', {
        200: okWithEtag('软删成功', ref('RecordDeleteResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '只置 `deletedAt`，列表不再返回；携带 `If-Match` 时版本不一致返回 409 `VERSION_CONFLICT`。',
        parameters: [
          pathParam('modelId', '模型 id', 'm_employee'),
          pathParam('rid', '记录 id', 'rec_1'),
          headerParam('If-Match', '记录 ETag', { type: 'string' }, ETAG_RECORD),
        ],
      }),
    },

    /* ------------------------------ 文件 ------------------------------ */
    '/files/upload': {
      post: op('Files', 'uploadFile', '上传文件（multipart，最大 10MB）', {
        200: ok('上传成功', ref('FileUploadResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        413: responseRef('TooLarge'),
      }, {
        description: 'multipart 字段名必须为 `file`；返回的 `url` 为 `/api/v1/files/<fileId>`。',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
      }),
    },
    '/files/{fileId}': {
      get: publicOp('Files', 'downloadFile', '读取文件字节（公开）', {
        200: {
          description: '文件字节；Content-Type 取上传时的 mimeType',
          content: {
            'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
          },
        },
        404: responseRef('NotFound'),
      }, {
        description: '公开只读，不校验令牌（`<image src>` 无法携带 Authorization）；文件 id 白名单校验失败或不存在返回 404。',
        parameters: [pathParam('fileId', '文件 id', '9f0d.png')],
      }),
    },

    /* ------------------------------ 流程 ------------------------------ */
    '/flows': {
      get: op('Flows', 'listFlows', '流程定义列表', {
        200: ok('流程定义数组', ref('FlowList')),
        401: responseRef('Unauthorized'),
      }),
    },
    '/flows/tasks/todo': {
      get: op('Flows', 'listTodoTasks', '当前用户待办任务', {
        200: ok('待办任务数组，`createdAt` 倒序', ref('TodoList')),
        401: responseRef('Unauthorized'),
      }, {
        description: 'running 实例当前节点 pending 任务且 assignee 命中（starter / role / `*` 超级豁免；dept 首期不可命中）。',
      }),
    },
    '/flows/instances': {
      get: op('Flows', 'listFlowInstances', '流程实例查询（Timeline 数据源）', {
        200: ok('实例数组，新实例在前；读取时补偿 pendingPatch', ref('FlowInstances')),
        401: responseRef('Unauthorized'),
      }, {
        parameters: [
          queryParam('recordId', '按业务记录过滤', { type: 'string' }, 'rec_1'),
          queryParam('modelId', '按模型过滤', { type: 'string' }, 'm_employee'),
        ],
      }),
    },
    '/flows/instances/{instanceId}': {
      get: op('Flows', 'getFlowInstance', '读取单个流程实例', {
        200: ok('实例全量（tasks + history）；响应带 ETag', ref('FlowInstance'), {
          ETag: headerRef('ETag'),
        }),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
      }, {
        description: '读取时补偿未完成的 `pendingPatch`。',
        parameters: [pathParam('instanceId', '流程实例 id', 'inst_1')],
      }),
    },
    '/flows/{flowId}': {
      get: op('Flows', 'getFlow', '读取流程定义', {
        200: ok('流程定义', ref('FlowSchema')),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
      }, {
        parameters: [pathParam('flowId', '流程 id', 'f_leave')],
      }),
      put: op('Flows', 'saveFlow', '保存流程定义（upsert）', {
        200: ok('保存成功', ref('FlowSchema')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
      }, {
        description: '路径 `flowId` 必须与 `body.flowId` 一致；`validateFlow` + `checkExpr` 未通过返回 400 `INVALID_FLOW`（附 issues/warnings）。',
        parameters: [pathParam('flowId', '流程 id', 'f_leave')],
        requestBody: body(ref('FlowSchema')),
      }),
      delete: op('Flows', 'deleteFlow', '删除流程定义', {
        204: { description: '删除成功；只删定义，实例保留审计' },
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
      }, {
        parameters: [pathParam('flowId', '流程 id', 'f_leave')],
      }),
    },
    '/flows/instances/{instanceId}/tasks/{taskId}': {
      post: op('Flows', 'decideFlowTask', '审批动作（同意/驳回）', {
        200: okWithEtag('推进后的流程实例', ref('FlowInstance')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '若携带 `Idempotency-Key`，同实例同任务同内容重放返回 200 当前实例；同键改任务/动作/意见/审批人返回 409 `IDEMPOTENCY_KEY_REUSED`。并发推进返回 409 `FLOW_CONFLICT`。',
        parameters: [
          pathParam('instanceId', '流程实例 id', 'inst_1'),
          pathParam('taskId', '待办任务 id', 'task_1'),
          headerParam('Idempotency-Key', '审批幂等键（1~128 字符）', {
            type: 'string', minLength: 1, maxLength: 128,
          }, 'approve-inst_1-task_1'),
        ],
        requestBody: body({
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['approve', 'reject'] },
            comment: { type: 'string' },
          },
          additionalProperties: false,
        }),
      }),
    },

    /* ------------------------------ RBAC ------------------------------ */
    '/rbac/roles': {
      get: op('RBAC', 'listRbacConfig', '读取 RBAC 全量配置', {
        200: ok('角色列表 + 页面授权映射', ref('RbacConfig')),
        401: responseRef('Unauthorized'),
      }, {
        description: '当前三个 RBAC 接口只要求登录，管理面细分鉴权属后续批次。',
      }),
    },
    '/rbac/roles/{key}': {
      put: op('RBAC', 'upsertRbacRole', '新增/更新角色', {
        200: ok('保存成功', ref('RbacRoleUpsertResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
      }, {
        description: '`perms` 每项须匹配权限点格式，或为通配 `*`；非法返回 400 `INVALID_REQUEST`。',
        parameters: [pathParam('key', '角色 key', 'designer')],
        requestBody: body({
          type: 'object',
          required: ['name', 'perms'],
          properties: {
            name: { type: 'string', minLength: 1 },
            perms: { type: 'array', items: { type: 'string' } },
          },
        }),
      }),
    },
    '/rbac/pages/{pageId}': {
      put: op('RBAC', 'upsertRbacPageAuth', '设置页面可见角色', {
        200: ok('保存成功', ref('RbacPageAuthResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
      }, {
        description: '`roles` 为空数组 = 删除该页授权条目，恢复全员可见。',
        parameters: [pathParam('pageId', '页面 id', 'p_demo')],
        requestBody: body({
          type: 'object',
          required: ['roles'],
          properties: { roles: { type: 'array', items: { type: 'string' } } },
        }),
      }),
    },

    /* ------------------------------ Webhook ------------------------------ */
    '/webhooks': {
      get: op('Webhooks', 'listWebhooks', 'Webhook 订阅列表（仅管理员）', {
        200: ok('订阅列表，`updatedAt` 倒序；密钥脱敏', ref('WebhookSubscriptionList')),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }),
      post: op('Webhooks', 'createWebhook', '创建 Webhook 订阅（仅管理员）', {
        200: okWithEtag('创建成功；响应含完整 secret（仅此一次）', ref('WebhookSubscriptionSecret')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }, {
        description: '`secret` 不传则服务端生成；`events` 支持 `"*"`（必须单独使用）。生产默认拒绝本机/内网 URL，内部集成可设 `LC_WEBHOOK_ALLOW_PRIVATE=1`。',
        requestBody: body(ref('WebhookCreateRequest')),
      }),
    },
    '/webhooks/metrics': {
      get: op('Webhooks', 'getWebhookMetrics', 'Webhook 投递指标与告警（仅管理员）', {
        200: ok('队列/成功率/积压指标与告警判定', ref('WebhookMetrics')),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }, {
        description: '阈值可用 `LC_WEBHOOK_ALERT_FAILURE_RATE`、`LC_WEBHOOK_ALERT_QUEUE_DEPTH`、`LC_WEBHOOK_ALERT_PENDING_AGE_MS` 覆盖。',
      }),
    },
    '/webhooks/maintenance/cleanup': {
      post: op('Webhooks', 'cleanupWebhookDeliveries', '归档并清理过期投递日志（仅管理员）', {
        200: ok('清理完成', ref('WebhookCleanupResponse')),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }, {
        description: '保留天数由 `LC_WEBHOOK_RETENTION_DAYS` 控制（默认 30）；只清理 success/failed 终态日志，先写归档再删除。',
      }),
    },
    '/webhooks/{id}': {
      get: op('Webhooks', 'getWebhook', '读取 Webhook 订阅（仅管理员）', {
        200: ok('订阅详情；响应带 ETag；secret 脱敏', ref('WebhookSubscription'), { ETag: headerRef('ETag') }),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
      }, {
        parameters: [pathParam('id', 'Webhook 订阅 id', 'wh_1')],
      }),
      put: op('Webhooks', 'updateWebhook', '更新 Webhook 订阅（仅管理员）', {
        200: okWithEtag('更新成功；返回脱敏订阅', ref('WebhookSubscription')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: 'patch 语义；`secret` 不在本接口更新。携带 `If-Match` 且版本不一致返回 409 `VERSION_CONFLICT`，不自动覆盖。',
        parameters: [
          pathParam('id', 'Webhook 订阅 id', 'wh_1'),
          headerParam('If-Match', '订阅 ETag，如 `"webhook:wh_1:2"`', { type: 'string' }, '"webhook:wh_1:2"'),
        ],
        requestBody: body(ref('WebhookPatchRequest')),
      }),
      delete: op('Webhooks', 'deleteWebhook', '删除 Webhook 订阅（仅管理员）', {
        200: ok('删除成功；投递日志保留审计', ref('WebhookDeleteResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '携带 `If-Match` 且版本不一致返回 409 `VERSION_CONFLICT`。',
        parameters: [
          pathParam('id', 'Webhook 订阅 id', 'wh_1'),
          headerParam('If-Match', '订阅 ETag', { type: 'string' }, '"webhook:wh_1:2"'),
        ],
      }),
    },
    '/webhooks/{id}/rotate-secret': {
      post: op('Webhooks', 'rotateWebhookSecret', '轮换 Webhook 签名密钥（仅管理员）', {
        200: okWithEtag('轮换成功；响应含新 secret（仅此一次）', ref('WebhookSubscriptionSecret')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '默认保留旧 secret 24 小时宽限期：投递同时带 `X-LC-Signature-Previous`，期间接收方可先验新密钥再回退旧密钥；`graceSeconds=0` 表示立即失效。',
        parameters: [
          pathParam('id', 'Webhook 订阅 id', 'wh_1'),
          headerParam('If-Match', '订阅 ETag', { type: 'string' }, '"webhook:wh_1:2"'),
        ],
        requestBody: body(ref('WebhookRotateSecretRequest')),
      }),
    },
    '/webhooks/{id}/test': {
      post: op('Webhooks', 'testWebhook', '发送测试投递（仅管理员）', {
        200: okWithEtag('同步发送一次后的投递记录（成功/失败/待重试）', ref('WebhookDelivery')),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
      }, {
        description: '事件类型固定为 `webhook.test`，会真实发起 HTTP 请求；最长等待订阅的 `timeoutMs`。',
        parameters: [pathParam('id', 'Webhook 订阅 id', 'wh_1')],
      }),
    },
    '/webhooks/{id}/deliveries': {
      get: op('Webhooks', 'listWebhookDeliveries', '查询 Webhook 投递日志（仅管理员）', {
        200: ok('投递日志，`createdAt` 倒序', ref('WebhookDeliveryList')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }, {
        description: '包含每次尝试的 HTTP 状态、耗时、响应摘要与错误。订阅删除后日志仍保留，本接口按 subscriptionId 继续可查。',
        parameters: [
          pathParam('id', 'Webhook 订阅 id（可已删除）', 'wh_1'),
          queryParam('status', '投递状态过滤', { type: 'string', enum: ['pending', 'success', 'failed'] }, 'failed'),
          queryParam('eventType', '事件类型过滤', { type: 'string' }, 'record.created'),
          queryParam('page', '页码，从 1 开始', { type: 'integer', minimum: 1, default: 1 }, 1),
          queryParam('size', '每页条数，1~100', { type: 'integer', minimum: 1, maximum: 100, default: 20 }, 20),
        ],
      }),
    },
    '/webhooks/deliveries/{deliveryId}/retry': {
      post: op('Webhooks', 'retryWebhookDelivery', '手动重投 Webhook 投递（仅管理员）', {
        200: okWithEtag('重投后的投递记录', ref('WebhookDelivery')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '重置尝试计数后同步发送一次，保留历史 `attempts`。若仍在自动重试等待期返回 409 `DELIVERY_PENDING`；`If-Match` 不匹配返回 409 `VERSION_CONFLICT`。',
        parameters: [
          pathParam('deliveryId', '投递 id', 'del_1'),
          headerParam('If-Match', '投递 ETag，如 `"webhook-delivery:del_1:1"`', { type: 'string' }, '"webhook-delivery:del_1:1"'),
        ],
      }),
    },

    /* ------------------------------ 物料市场 ------------------------------ */
    '/materials/manifest': {
      get: publicOp('Market', 'getMaterialManifest', '获取物料市场签名清单（公开）', {
        200: ok('ES256 签名清单信封', ref('MarketManifestEnvelope'), {
          ETag: headerRef('ETag'),
          'Cache-Control': { schema: { type: 'string' }, description: 'public, max-age=60' },
        }),
        304: { description: '`If-None-Match` 命中当前 ETag，清单未变化' },
        503: responseRef('ServiceUnavailable'),
      }, {
        description: '只包含 `published` 物料，按 id 排序；`generatedAt` 取已发布物料最大 `updatedAt`，清单不变时 ETag 与签名稳定。生产未配置签名私钥返回 503 `MARKET_SIGNING_UNCONFIGURED`。',
        parameters: [
          headerParam('If-None-Match', '上次响应 ETag', { type: 'string' }, '"market-manifest:0123456789abcdef"'),
        ],
      }),
    },
    '/materials/manifest/key': {
      get: publicOp('Market', 'getMaterialManifestKey', '获取清单验签公钥（公开）', {
        200: ok('公钥、指纹与 kid；公钥不是秘密', ref('MarketManifestKey'), {
          'Cache-Control': { schema: { type: 'string' }, description: 'public, max-age=300' },
        }),
        503: responseRef('ServiceUnavailable'),
      }),
    },
    '/materials': {
      get: op('Market', 'listMaterials', '物料目录', {
        200: ok('物料列表；普通用户只返回已发布条目', ref('MarketMaterialList')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }, {
        description: '管理员可按 `status` 筛选并看到审核字段；非管理员显式传 `status` 返回 403 `ADMIN_REQUIRED`，响应只含 `MarketMaterialEntry` 字段。',
        parameters: [
          queryParam('status', '状态筛选（仅管理员）', {
            type: 'string',
            enum: ['draft', 'pending', 'approved', 'rejected', 'published', 'unpublished'],
          }, 'published'),
          queryParam('category', '分类筛选', {
            type: 'string',
            enum: ['basic', 'layout', 'form', 'data', 'nav', 'feedback', 'biz'],
          }, 'basic'),
          queryParam('kind', '类型筛选', { type: 'string', enum: ['meta', 'component'] }, 'component'),
          queryParam('q', '按 id / name / description 关键字过滤（≤64 字符）', { type: 'string', maxLength: 64 }, 'button'),
        ],
      }),
      post: op('Market', 'createMaterial', '创建物料草稿（仅管理员）', {
        200: okWithEtag('草稿创建成功', ref('MarketMaterial')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        409: responseRef('Conflict'),
      }, {
        description: '`kind=component` 的 `component` 必须命中宿主内置组件白名单；重复 id 返回 409 `MARKET_MATERIAL_EXISTS`。',
        requestBody: body(ref('MarketMaterialInput')),
      }),
    },
    '/materials/{id}': {
      get: op('Market', 'getMaterial', '读取物料详情', {
        200: ok('物料详情；管理员带 ETag 与审核字段', ref('MarketMaterial'), { ETag: headerRef('ETag') }),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
      }, {
        parameters: [pathParam('id', '物料 id', 'brand-button-2026')],
      }),
      put: op('Market', 'updateMaterial', '编辑物料草稿（仅管理员）', {
        200: okWithEtag('更新成功，状态回到 draft', ref('MarketMaterial')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '仅 `draft / rejected / unpublished` 可编辑；`pending / approved / published` 返回 409 `MARKET_STATE_CONFLICT`。携带 `If-Match` 且版本不一致返回 409 `VERSION_CONFLICT`，不自动覆盖。',
        parameters: [
          pathParam('id', '物料 id', 'brand-button-2026'),
          headerParam('If-Match', '物料 ETag，如 `"material:brand-button-2026:2"`', { type: 'string' }, '"material:brand-button-2026:2"'),
        ],
        requestBody: body(ref('MarketMaterialInput')),
      }),
    },
    '/materials/{id}/submit': {
      post: op('Market', 'submitMaterial', '提交物料审核（仅管理员）', {
        200: okWithEtag('进入 pending', ref('MarketMaterial')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        parameters: [
          pathParam('id', '物料 id', 'brand-button-2026'),
          headerParam('If-Match', '物料 ETag', { type: 'string' }, '"material:brand-button-2026:1"'),
        ],
      }),
    },
    '/materials/{id}/review': {
      post: op('Market', 'reviewMaterial', '审核物料（仅管理员）', {
        200: okWithEtag('approved 或 rejected', ref('MarketMaterial')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '仅 `pending` 可审核；`reject` 必须填写 `note`。当前权限模型下提交人与审核人可以是同一管理员。',
        parameters: [
          pathParam('id', '物料 id', 'brand-button-2026'),
          headerParam('If-Match', '物料 ETag', { type: 'string' }, '"material:brand-button-2026:2"'),
        ],
        requestBody: body(ref('MarketReviewRequest')),
      }),
    },
    '/materials/{id}/publish': {
      post: op('Market', 'publishMaterial', '发布物料（仅管理员）', {
        200: okWithEtag('published；同时固化不可变版本快照', ref('MarketMaterial')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '需 `approved`；同一 `id + version` 只能发布一次，重复发布返回 409 `MARKET_VERSION_EXISTS`，需提升版本后重新审核。',
        parameters: [
          pathParam('id', '物料 id', 'brand-button-2026'),
          headerParam('If-Match', '物料 ETag', { type: 'string' }, '"material:brand-button-2026:3"'),
        ],
      }),
    },
    '/materials/{id}/unpublish': {
      post: op('Market', 'unpublishMaterial', '下架物料（仅管理员）', {
        200: okWithEtag('unpublished，清单立即移除', ref('MarketMaterial')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        parameters: [
          pathParam('id', '物料 id', 'brand-button-2026'),
          headerParam('If-Match', '物料 ETag', { type: 'string' }, '"material:brand-button-2026:5"'),
        ],
      }),
    },
    '/materials/{id}/versions': {
      get: op('Market', 'listMaterialVersions', '查询物料发布历史（仅管理员）', {
        200: ok('版本快照，`publishedAt` 倒序', ref('MarketVersionList')),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
      }, {
        parameters: [pathParam('id', '物料 id', 'brand-button-2026')],
      }),
    },
    '/materials/installs': {
      get: op('Market', 'listMaterialInstalls', '查询租户安装状态', {
        200: ok('当前租户的安装记录，按 materialId 排序', ref('MarketInstallList')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
      }, {
        description: '租户标识来自 `X-LC-Tenant`（缺省 `default`）；服务端只校验格式，成员关系由网关/身份提供方保证。',
        parameters: [
          headerParam('X-LC-Tenant', '租户标识，1~64 位小写字母/数字/连字符', { type: 'string' }, 'tenant-a'),
        ],
      }),
    },
    '/materials/installs/{materialId}': {
      put: op('Market', 'installMaterial', '安装/升级物料到当前发布版本', {
        200: okWithEtag('安装状态（重复安装幂等）', ref('MarketInstall')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        description: '只允许安装当前已发布版本，版本不一致返回 409 `MARKET_VERSION_MISMATCH`（不允许静默升降级）；未发布返回 409 `MARKET_NOT_PUBLISHED`。',
        parameters: [
          pathParam('materialId', '物料 id', 'brand-button-2026'),
          headerParam('X-LC-Tenant', '租户标识', { type: 'string' }, 'tenant-a'),
          headerParam('If-Match', '安装记录 ETag，如 `"material-install:tenant-a/brand-button-2026:1"`', { type: 'string' }, '"material-install:tenant-a/brand-button-2026:1"'),
        ],
        requestBody: body(ref('MarketInstallRequest')),
      }),
      delete: op('Market', 'uninstallMaterial', '卸载物料', {
        200: ok('卸载结果', ref('MarketUninstallResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        404: responseRef('NotFound'),
        409: responseRef('Conflict'),
      }, {
        parameters: [
          pathParam('materialId', '物料 id', 'brand-button-2026'),
          headerParam('X-LC-Tenant', '租户标识', { type: 'string' }, 'tenant-a'),
          headerParam('If-Match', '安装记录 ETag', { type: 'string' }, '"material-install:tenant-a/brand-button-2026:1"'),
        ],
      }),
    },

    /* ------------------------------ 运维事件 ------------------------------ */
    '/ops/events': {
      post: op('Ops', 'ingestOpsEvents', '上报运维事件（登录即可）', {
        200: ok('入库结果', ref('OpsIngestResponse')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
      }, {
        description: '单次 1~50 条；`userId` 取令牌、`at` 取服务端时间，客户端伪造无效；超长 message/detail 只截断不报错。',
        requestBody: body({
          type: 'object',
          required: ['events'],
          properties: {
            events: { type: 'array', minItems: 1, maxItems: 50, items: ref('OpsEventInput') },
          },
        }),
      }),
      get: op('Ops', 'listOpsEvents', '查询运维事件（仅管理员）', {
        200: ok('事件列表（新 → 旧）', ref('OpsList')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }, {
        description: '仅 `*` 通配角色可查；`limit` 默认 50、上限 200。',
        parameters: [
          queryParam('type', '事件类型', { type: 'string', enum: ['error', 'perf', 'event'] }, 'error'),
          queryParam('pageId', '页面 id', { type: 'string' }, 'p_demo'),
          queryParam('since', 'ISO 时间下界（含）', { type: 'string', format: 'date-time' }),
          queryParam('limit', '返回条数，1~200', { type: 'integer', minimum: 1, maximum: 200, default: 50 }, 50),
        ],
      }),
    },
    '/ops/summary': {
      get: op('Ops', 'getOpsSummary', '运维事件汇总（仅管理员）', {
        200: ok('错误数 + perf avg/p95/max', ref('OpsSummary')),
        400: responseRef('BadRequest'),
        401: responseRef('Unauthorized'),
        403: responseRef('Forbidden'),
      }, {
        description: '仅 `*` 通配角色可查；无 perf 样本时各项为 0。',
        parameters: [
          queryParam('pageId', '页面 id', { type: 'string' }, 'p_demo'),
          queryParam('since', 'ISO 时间下界（含）', { type: 'string', format: 'date-time' }),
        ],
      }),
    },
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'LowCode Platform API',
      version: '1.0.0',
      summary: '移动端低代码平台服务端 REST API',
      description: [
        '低代码平台服务端对外契约（OpenAPI 3.1.0）。事实源为 `apps/server/src` 与 `docs/protocol.md` 第 10 章。',
        '',
        '**鉴权**：除显式标记 `security: []` 的公共接口外，全部需要 `Authorization: Bearer <JWT>`（HS256，8 小时）。',
        '**乐观锁**：页面/记录写接口支持 `If-Match`；冲突返回 `409 VERSION_CONFLICT`，服务端不自动覆盖。',
        '**审批幂等**：`POST /flows/instances/{instanceId}/tasks/{taskId}` 支持 `Idempotency-Key`。',
        '**错误体**：`{ code, message, errors?, warnings?, expectedRevision?, currentRevision? }`，错误码见 `docs/protocol.md` §10.3。',
        '**限流**：普通接口默认 600 次/分钟/IP，登录 20 次/分钟/IP；超限 `429 RATE_LIMITED` 并带 `Retry-After`。',
        '',
        'Webhook 管理接口位于 `/webhooks`，仅 `*` 管理员可用；投递签名与重试规则见 `docs/protocol.md` §10.8。',
        '',
        '物料市场公开接口位于 `/materials/manifest`，受保护接口使用 `Authorization` 与 `X-LC-Tenant`（缺省 `default`）；',
        '清单只含受信元数据，客户端不会下载、`eval` 或动态 `import` 远程 JS。',
      ].join('\n'),
      license: { name: 'UNLICENSED' },
    },
    servers: [
      { url: '/api/v1', description: '同源部署（服务端全局前缀）' },
    ],
    tags: [
      { name: 'System', description: '健康检查与接口文档' },
      { name: 'Auth', description: '登录与登录态' },
      { name: 'Apps', description: '启动聚合与应用配置' },
      { name: 'Pages', description: '页面 Schema 与版本' },
      { name: 'Models', description: '数据模型定义' },
      { name: 'Records', description: '业务记录动态 CRUD' },
      { name: 'Files', description: '文件上传与公开读取' },
      { name: 'Flows', description: '流程定义、待办与审批' },
      { name: 'RBAC', description: '角色与页面授权' },
      { name: 'Ops', description: '埋点/错误/性能事件' },
      { name: 'Webhooks', description: 'Webhook 订阅、投递日志与重投' },
      { name: 'Market', description: '物料市场：签名清单、发布审核与租户级安装' },
    ],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '登录 `POST /auth/login` 获取 `accessToken`，请求头 `Authorization: Bearer <token>`。',
        },
      },
      schemas: {
        Error: infoSchema,
        Issue: issueSchema,
        User: userSchema,
        AuthUser: authUserSchema,
        LoginRequest: loginRequestSchema,
        LoginResponse: loginResponseSchema,
        Me: meSchema,
        Theme: themeSchema,
        AppConfig: appConfigSchema,
        AppConfigPatch: appConfigPatchSchema,
        MenuPage: menuPageSchema,
        MenuApp: menuAppSchema,
        Bootstrap: bootstrapSchema,
        PageSummary: pageSummarySchema,
        PageSchema: pageSchema,
        PageSchemaResponse: pageSchemaResponseSchema,
        ValidationResult: validationResultSchema,
        PageSaveResponse: pageSaveResponseSchema,
        PagePublishResponse: pagePublishResponseSchema,
        PageRollbackResponse: pageRollbackResponseSchema,
        PageVersionsResponse: pageVersionsResponseSchema,
        PageDeleteResponse: pageDeleteResponseSchema,
        FieldSchema: fieldSchema,
        ModelSchema: modelSchema,
        ModelSummary: modelSummarySchema,
        ModelResponse: modelResponseSchema,
        ModelSaveResponse: modelSaveResponseSchema,
        Record: recordSchema,
        RecordList: recordListSchema,
        RecordDeleteResponse: recordDeleteResponseSchema,
        FileUploadResponse: fileUploadResponseSchema,
        FlowSchema: flowSchema,
        FlowTask: flowTaskSchema,
        FlowHistory: flowHistorySchema,
        FlowInstance: flowInstanceSchema,
        TodoTask: todoTaskSchema,
        FlowList: flowListSchema,
        FlowInstances: flowInstancesSchema,
        TodoList: todoListSchema,
        RbacRole: rbacRoleSchema,
        RbacConfig: rbacConfigSchema,
        RbacRoleUpsertResponse: rbacRoleUpsertResponseSchema,
        RbacPageAuthResponse: rbacPageAuthResponseSchema,
        OpsEventInput: opsEventInputSchema,
        OpsEvent: opsEventSchema,
        OpsIngestResponse: opsIngestResponseSchema,
        OpsList: opsListResponseSchema,
        OpsSummary: opsSummarySchema,
        WebhookSubscription: webhookSubscriptionSchema,
        WebhookSubscriptionSecret: webhookSubscriptionSecretSchema,
        WebhookSubscriptionList: webhookSubscriptionListSchema,
        WebhookCreateRequest: webhookCreateRequestSchema,
        WebhookPatchRequest: webhookPatchRequestSchema,
        WebhookRotateSecretRequest: webhookRotateSecretRequestSchema,
        WebhookDeleteResponse: webhookDeleteResponseSchema,
        WebhookEventEnvelope: webhookEventEnvelopeSchema,
        WebhookDeliveryAttempt: webhookDeliveryAttemptSchema,
        WebhookDelivery: webhookDeliverySchema,
        WebhookDeliveryList: webhookDeliveryListSchema,
        WebhookMetrics: webhookMetricsSchema,
        WebhookCleanupResponse: webhookCleanupResponseSchema,
        MarketMaterialEntry: marketMaterialEntrySchema,
        MarketMaterial: marketMaterialSchema,
        MarketMaterialList: marketMaterialListSchema,
        MarketPublicMaterialList: marketPublicMaterialListSchema,
        MarketManifest: marketManifestSchema,
        MarketManifestEnvelope: marketManifestEnvelopeSchema,
        MarketManifestKey: marketManifestKeySchema,
        MarketVersion: marketVersionSchema,
        MarketVersionList: marketVersionListSchema,
        MarketInstall: marketInstallSchema,
        MarketInstallList: marketInstallListSchema,
        MarketMaterialInput: marketMaterialInputSchema,
        MarketReviewRequest: marketReviewRequestSchema,
        MarketInstallRequest: marketInstallRequestSchema,
        MarketUninstallResponse: marketUninstallResponseSchema,
        Health: healthSchema,
        Ready: readySchema,
        OpenApiDocument: openApiDocumentSchema,
      },
      responses: componentsResponses,
      headers: componentsHeaders,
    },
  }
}
