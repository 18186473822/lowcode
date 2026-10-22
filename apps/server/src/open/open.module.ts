/**
 * 开放集成模块（Phase 4）：当前只提供 OpenAPI 文档端点。
 *
 * 后续 Webhook 订阅/投递、远程物料等能力在同一模块下扩展；本批不引入新的
 * 持久化依赖，也不改变现有鉴权链。
 */
import { Module } from '@nestjs/common'
import { OpenController } from './open.controller.js'

@Module({
  controllers: [OpenController],
})
export class OpenModule {}
