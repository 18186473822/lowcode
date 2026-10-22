/**
 * 文件仓储的磁盘实现（JSON 模式，保持原 `FileService` 的落盘布局）。
 *
 * ```
 * <DATA_DIR>/files/<fileId>            原始字节
 * <DATA_DIR>/files-meta/<fileId>.json  元信息
 * ```
 *
 * 语义与改造前一致：字节缺失 → null；字节在、元信息缺失 → MIME 降级
 * `application/octet-stream`；元信息损坏 → 原样抛错（由全局异常层转 500，不静默丢数据）。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import type { FileMeta, FileRepository, StoredFile } from './file.types.js'

@Injectable()
export class DiskFileRepository implements FileRepository {
  private readonly filesDir: string
  private readonly metaDir: string

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.filesDir = path.join(dataDir, 'files')
    this.metaDir = path.join(dataDir, 'files-meta')
  }

  async save(file: StoredFile): Promise<void> {
    await mkdir(this.filesDir, { recursive: true })
    await mkdir(this.metaDir, { recursive: true })
    await writeFile(path.join(this.filesDir, file.id), file.data)
    await writeFile(
      path.join(this.metaDir, `${file.id}.json`),
      JSON.stringify(file.meta, null, 2),
      'utf8',
    )
  }

  async find(id: string): Promise<StoredFile | null> {
    let data: Buffer
    try {
      data = await readFile(path.join(this.filesDir, id))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }

    let meta: FileMeta
    try {
      meta = JSON.parse(await readFile(path.join(this.metaDir, `${id}.json`), 'utf8')) as FileMeta
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // 字节在、元信息缺（写入间隙中断）：降级可读，不静默丢数据
      meta = {
        originalName: id,
        mimeType: 'application/octet-stream',
        size: data.length,
        uploadedAt: '',
        uploadedBy: '',
      }
    }

    return { id, meta, data }
  }
}
