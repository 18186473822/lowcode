/**
 * 存储模块（@Global）：数据根目录 + 仓储实现 + 就绪检查。
 *
 * Phase 4 数据库起，按 `LC_STORAGE` 二选一：
 * - `json`（默认）：FilePage/FileModel/FileRecord/FileRbac/FileFlow/FileOps + 内存 UserStore；
 * - `mysql`：Prisma + MySQL 实现（User/Page/Model/Record/Rbac/Flow/Ops/AppConfig）。
 *   flows / flow-instances / ops / apps.json 在第二批迁入。
 *
 * 上层服务只注入仓储 token，不感知具体实现。把仓储集中在此处而不是各 feature module，
 * 是为了保证「同一进程内只有一个实现实例」，并避免 Model ⇄ Flow 的模块环。
 */
import { Global, Module } from '@nestjs/common'
import path from 'node:path'
import { DATA_DIR } from './tokens.js'
import { UserStore } from '../identity/user.store.js'
import { USER_REPOSITORY } from '../identity/user.types.js'
import { FilePageRepository } from '../page/file-page.repository.js'
import { PAGE_REPOSITORY } from '../page/page.types.js'
import { FileModelRepository } from '../model/file-model.repository.js'
import { FileRecordRepository } from '../model/file-record.repository.js'
import {
  MODEL_REPOSITORY,
  RECORD_REPOSITORY,
} from '../model/model.types.js'
import { FileRbacRepository } from '../rbac/file-rbac.repository.js'
import { RBAC_REPOSITORY } from '../rbac/rbac.types.js'
import { FileFlowRepository } from '../flow/file-flow.repository.js'
import { FLOW_REPOSITORY } from '../flow/flow.types.js'
import { FileOpsRepository } from '../ops/file-ops.repository.js'
import { OPS_REPOSITORY } from '../ops/ops.types.js'
import { FileAppConfigRepository } from '../page/file-app-config.repository.js'
import { APP_CONFIG_REPOSITORY } from '../page/app-config.types.js'
import {
  JsonStorageHealth,
  MysqlStorageHealth,
  STORAGE_HEALTH,
} from '../persistence/storage-health.js'
import { PRISMA_SERVICE, PrismaService } from '../persistence/prisma.service.js'
import { assertStorageConfig } from '../persistence/storage.config.js'
import { MysqlUserRepository } from '../persistence/mysql/user.repository.js'
import { MysqlPageRepository } from '../persistence/mysql/page.repository.js'
import { MysqlModelRepository } from '../persistence/mysql/model.repository.js'
import { MysqlRecordRepository } from '../persistence/mysql/record.repository.js'
import { MysqlRbacRepository } from '../persistence/mysql/rbac.repository.js'
import { MysqlFlowRepository } from '../persistence/mysql/flow.repository.js'
import { MysqlOpsRepository } from '../persistence/mysql/ops.repository.js'
import { MysqlAppConfigRepository } from '../persistence/mysql/app-config.repository.js'

/**
 * 返回 PrismaService 或 null。null 让 JSON 模式完全不触碰数据库驱动/连接；
 * mysql 模式缺 DATABASE_URL 时在这里 fail-closed（与 main.ts 的启动自检双保险）。
 */
function createPrisma(): PrismaService | null {
  if (assertStorageConfig() !== 'mysql') return null
  return new PrismaService()
}

@Global()
@Module({
  providers: [
    {
      provide: DATA_DIR,
      useFactory: () => process.env.LC_DATA_DIR ?? path.join(process.cwd(), 'data'),
    },
    { provide: PRISMA_SERVICE, useFactory: createPrisma },
    {
      provide: USER_REPOSITORY,
      useFactory: (prisma: PrismaService | null) =>
        prisma ? new MysqlUserRepository(prisma) : new UserStore(),
      inject: [PRISMA_SERVICE],
    },
    {
      provide: PAGE_REPOSITORY,
      useFactory: (prisma: PrismaService | null, dataDir: string) =>
        prisma ? new MysqlPageRepository(prisma) : new FilePageRepository(dataDir),
      inject: [PRISMA_SERVICE, DATA_DIR],
    },
    {
      provide: MODEL_REPOSITORY,
      useFactory: (prisma: PrismaService | null, dataDir: string) =>
        prisma ? new MysqlModelRepository(prisma) : new FileModelRepository(dataDir),
      inject: [PRISMA_SERVICE, DATA_DIR],
    },
    {
      provide: RECORD_REPOSITORY,
      useFactory: (prisma: PrismaService | null, dataDir: string) =>
        prisma ? new MysqlRecordRepository(prisma) : new FileRecordRepository(dataDir),
      inject: [PRISMA_SERVICE, DATA_DIR],
    },
    {
      provide: RBAC_REPOSITORY,
      useFactory: (prisma: PrismaService | null, dataDir: string) =>
        prisma ? new MysqlRbacRepository(prisma) : new FileRbacRepository(dataDir),
      inject: [PRISMA_SERVICE, DATA_DIR],
    },
    {
      provide: FLOW_REPOSITORY,
      useFactory: (prisma: PrismaService | null, dataDir: string) =>
        prisma ? new MysqlFlowRepository(prisma) : new FileFlowRepository(dataDir),
      inject: [PRISMA_SERVICE, DATA_DIR],
    },
    {
      provide: OPS_REPOSITORY,
      useFactory: (prisma: PrismaService | null, dataDir: string) =>
        prisma ? new MysqlOpsRepository(prisma) : new FileOpsRepository(dataDir),
      inject: [PRISMA_SERVICE, DATA_DIR],
    },
    {
      provide: APP_CONFIG_REPOSITORY,
      useFactory: (prisma: PrismaService | null, dataDir: string) =>
        prisma ? new MysqlAppConfigRepository(prisma) : new FileAppConfigRepository(dataDir),
      inject: [PRISMA_SERVICE, DATA_DIR],
    },
    {
      provide: STORAGE_HEALTH,
      useFactory: (prisma: PrismaService | null, dataDir: string) =>
        prisma ? new MysqlStorageHealth(prisma, dataDir) : new JsonStorageHealth(dataDir),
      inject: [PRISMA_SERVICE, DATA_DIR],
    },
  ],
  exports: [
    DATA_DIR,
    PRISMA_SERVICE,
    USER_REPOSITORY,
    PAGE_REPOSITORY,
    MODEL_REPOSITORY,
    RECORD_REPOSITORY,
    RBAC_REPOSITORY,
    FLOW_REPOSITORY,
    OPS_REPOSITORY,
    APP_CONFIG_REPOSITORY,
    STORAGE_HEALTH,
  ],
})
export class StorageModule {}
