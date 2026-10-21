/**
 * 就绪检查抽象：JSON 模式看数据目录，MySQL 模式同时看数据目录（上传文件仍落盘）
 * 与数据库连接。`/ready` 不直接依赖 Prisma，便于单测替换。
 */
import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import type { PrismaClient } from '@prisma/client'

export interface StorageHealthResult {
  ok: boolean
  checks: Record<string, 'ok' | 'unavailable'>
}

export interface StorageHealth {
  check(): Promise<StorageHealthResult>
}

export const STORAGE_HEALTH = 'LC:STORAGE_HEALTH'

/** 可供单测直接复用的目录可写检查。 */
export async function checkDataDirWritable(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true })
    await access(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

export class JsonStorageHealth implements StorageHealth {
  constructor(private readonly dataDir: string) {}

  async check(): Promise<StorageHealthResult> {
    const ok = await checkDataDirWritable(this.dataDir)
    return { ok, checks: { dataDir: ok ? 'ok' : 'unavailable' } }
  }
}

export class MysqlStorageHealth implements StorageHealth {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly dataDir: string,
  ) {}

  async check(): Promise<StorageHealthResult> {
    const dataDirOk = await checkDataDirWritable(this.dataDir)
    let dbOk = true
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      dbOk = false
    }
    return {
      ok: dataDirOk && dbOk,
      checks: {
        dataDir: dataDirOk ? 'ok' : 'unavailable',
        database: dbOk ? 'ok' : 'unavailable',
      },
    }
  }
}
