/**
 * 服务端入口。
 *
 * 环境变量：
 * - `PORT`                     监听端口（默认 3000）
 * - `LC_DATA_DIR`              数据根目录（默认 <cwd>/data）
 * - `LC_JWT_SECRET`            JWT 密钥（≥32 字符；production 必填）
 * - `LC_CORS_ORIGINS`          CORS 白名单（逗号分隔；production 未设置=不放行跨域）
 * - `LC_RATE_LIMIT_WINDOW_MS`  限流窗口（默认 60000）
 * - `LC_RATE_LIMIT_MAX`        普通接口每 IP 每窗口上限（默认 600）
 * - `LC_LOGIN_RATE_LIMIT_MAX`  登录接口每 IP 每窗口上限（默认 20）
 * - `LC_TRUST_PROXY`           是否信任反向代理的 X-Forwarded-For（true/false）
 * - `LC_ACCESS_LOG`            结构化访问日志（production 默认开；1/0 覆盖）
 * - `LC_APP_VERSION`           健康检查返回的版本号（默认 0.1.0）
 * - `LC_STORAGE`               存储模式：json（默认）/ mysql（Phase 4）
 * - `DATABASE_URL`             MySQL 连接串（LC_STORAGE=mysql 时必填）
 *
 * 启动：`pnpm -F @lc/server build && pnpm -F @lc/server start`
 * MySQL：`pnpm -F @lc/server build && pnpm -F @lc/server start:mysql`
 */
import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { shouldLogAccess } from './common/observability.js'
import { assertStorageConfig } from './persistence/storage.config.js'
import {
  assertSecurityConfig,
  buildCorsOptions,
  resolveCorsOrigins,
} from './common/security.config.js'

async function bootstrap(): Promise<void> {
  // 先做安全/存储/可观测性自检：非法配置在监听端口前失败（fail-closed）。
  const rateLimit = assertSecurityConfig()
  const storage = assertStorageConfig()
  shouldLogAccess()
  new Logger('Bootstrap').log(`存储模式：${storage}`)

  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api/v1')
  app.enableCors(buildCorsOptions())

  if (rateLimit.trustProxy) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1)
  }

  if (process.env.NODE_ENV === 'production' && resolveCorsOrigins().length === 0) {
    new Logger('Bootstrap').warn(
      'LC_CORS_ORIGINS 未设置：生产环境不发送 CORS 允许头（同源部署不受影响）',
    )
  }

  app.enableShutdownHooks()

  const port = Number(process.env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 必须是 1..65535 的整数（当前：${process.env.PORT}）`)
  }

  await app.listen(port)
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  new Logger('Bootstrap').error(`启动失败：${message}`)
  process.exitCode = 1
})
