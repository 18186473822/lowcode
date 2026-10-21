import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/** DI token；JSON 模式下 provider 为 null，不建立连接。 */
export const PRISMA_SERVICE = 'LC:PRISMA_SERVICE'

/**
 * Prisma 连接生命周期。仅在 `LC_STORAGE=mysql` 时由 StorageModule 实例化；
 * JSON 模式下该 provider 为 null，不建立数据库连接。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
