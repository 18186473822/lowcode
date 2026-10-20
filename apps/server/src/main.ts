/**
 * 服务端入口。
 *
 * 环境变量：
 * - `PORT`           监听端口（默认 3000）
 * - `LC_DATA_DIR`    数据根目录（默认 <cwd>/data）
 * - `LC_JWT_SECRET`  JWT 密钥（生产必须注入，否则使用开发默认值）
 *
 * 启动：`pnpm -F @lc/server build && pnpm -F @lc/server start`
 */
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api/v1')
  app.enableCors()
  app.enableShutdownHooks()

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
}

void bootstrap()
