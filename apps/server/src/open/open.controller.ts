/**
 * OpenAPI 文档接口（Phase 4 开放集成第一批）。
 *
 * `GET /api/v1/openapi.json` 公开可读：文档本身不含业务数据，便于 Swagger UI、
 * Apifox、Postman、OpenAPI Generator 等工具直接拉取；接口仍受全局普通限流约束。
 *
 * 文档在模块加载时构建一次（纯静态数据、无 I/O），避免每次请求重复构造对象。
 */
import { Controller, Get, Header } from '@nestjs/common'
import { buildOpenApi } from './openapi.js'

const DOCUMENT = buildOpenApi()

@Controller()
export class OpenController {
  @Get('openapi.json')
  @Header('Cache-Control', 'public, max-age=300')
  getDocument(): typeof DOCUMENT {
    return DOCUMENT
  }
}
