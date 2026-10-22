/**
 * 文件仓储的 MySQL 实现（Phase 4 文件落库）。
 *
 * `files` 表一行同时保存元数据与 `LONGBLOB` 内容：
 * - 上传只有一次写入，不会出现「字节成功、元信息失败」的半状态；
 * - `id` 含白名单扩展名，仍由服务层校验，仓储再做唯一主键约束；
 * - `upsert` 与磁盘实现「同 id 覆盖」语义一致，便于重试与测试。
 */
import { Inject, Injectable } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type { FileRepository, StoredFile } from '../../file/file.types.js'

function uploadedAt(value: string): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

@Injectable()
export class MysqlFileRepository implements FileRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async save(file: StoredFile): Promise<void> {
    const data = {
      originalName: file.meta.originalName,
      mimeType: file.meta.mimeType,
      size: file.meta.size,
      uploadedAt: uploadedAt(file.meta.uploadedAt),
      uploadedBy: file.meta.uploadedBy,
      content: Buffer.from(file.data),
    }

    await this.prisma.fileObject.upsert({
      where: { id: file.id },
      create: { id: file.id, ...data },
      update: data,
    })
  }

  async find(id: string): Promise<StoredFile | null> {
    const row = await this.prisma.fileObject.findUnique({ where: { id } })
    if (!row) return null

    return {
      id: row.id,
      meta: {
        originalName: row.originalName,
        mimeType: row.mimeType,
        size: row.size,
        uploadedAt: row.uploadedAt.toISOString(),
        uploadedBy: row.uploadedBy,
      },
      data: Buffer.from(row.content),
    }
  }
}
