/**
 * 文件服务：上传落盘 + 读取（方案 8.2 `file/` 模块裁剪、8.3 `POST /files/upload`）。
 *
 * 存储（Phase 1 本地盘，Phase 2 换 OSS/COS/MinIO 只换本服务）：
 * ```
 * <DATA_DIR>/files/<fileId>            原始字节
 * <DATA_DIR>/files-meta/<fileId>.json  元信息（原名 / mime / 大小 / 上传者）
 * ```
 * `fileId = uuid + 白名单扩展名`；读取侧 `FILE_ID_RE` 拦截路径穿越（`/` `\` 不可能进入）。
 */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR } from '../common/tokens.js'
import type { AuthUser } from '../common/jwt.service.js'

/** 单文件大小上限：10MB（multer limits.fileSize，超限 → 413） */
export const MAX_FILE_SIZE = 10 * 1024 * 1024

/** fileId 白名单：字母数字开头，仅限 [A-Za-z0-9._-]，≤ 128（无路径分隔符） */
const FILE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** 扩展名白名单：`.png` 这类短点串（来自原名，仅保留安全字符并转小写） */
const EXT_RE = /^\.[A-Za-z0-9]{1,10}$/

/** multipart 上传的文件形状（不依赖 @types/multer，字段取 FileInterceptor 产物的子集） */
export interface UploadedFileLike {
  originalname?: string
  mimetype?: string
  size?: number
  buffer?: Buffer
}

export interface FileMeta {
  originalName: string
  mimeType: string
  size: number
  uploadedAt: string
  uploadedBy: string
}

export interface UploadResponse {
  fileId: string
  /** 相对全局前缀的访问地址（客户端自行拼 host；与渲染端硬编码 /api/v1 一致） */
  url: string
  name: string
  size: number
  mimeType: string
}

@Injectable()
export class FileService {
  private readonly filesDir: string
  private readonly metaDir: string

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.filesDir = path.join(dataDir, 'files')
    this.metaDir = path.join(dataDir, 'files-meta')
  }

  /** 保存上传文件（控制器保证 file 非空；空 buffer → 400） */
  async save(file: UploadedFileLike | undefined, user: AuthUser): Promise<UploadResponse> {
    const buffer = file?.buffer
    if (!file || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: '缺少上传文件（multipart 字段名 file，且不能为空）',
      })
    }

    // 原名可能携带路径（客户端可伪造）：只取 basename 并剥控制字符
    const name = path.basename(String(file.originalname ?? '')).replace(/[\r\n"]/g, '')
    const ext = path.extname(name)
    const fileId = `${randomUUID()}${EXT_RE.test(ext) ? ext.toLowerCase() : ''}`
    const mimeType = file.mimetype || 'application/octet-stream'
    const meta: FileMeta = {
      originalName: name,
      mimeType,
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.username,
    }

    await mkdir(this.filesDir, { recursive: true })
    await mkdir(this.metaDir, { recursive: true })
    await writeFile(path.join(this.filesDir, fileId), buffer)
    await writeFile(path.join(this.metaDir, `${fileId}.json`), JSON.stringify(meta, null, 2), 'utf8')

    return { fileId, url: `/api/v1/files/${fileId}`, name, size: buffer.length, mimeType }
  }

  /** 读取文件字节与元信息；id 不合法或不存在 → 404（元信息缺失时 mime 降级 octet-stream） */
  async read(fileId: string): Promise<{ meta: FileMeta; data: Buffer }> {
    if (!FILE_ID_RE.test(fileId)) {
      throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: `文件 ${fileId} 不存在` })
    }

    let data: Buffer
    try {
      data = await readFile(path.join(this.filesDir, fileId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: `文件 ${fileId} 不存在` })
      }
      throw error
    }

    let meta: FileMeta
    try {
      meta = JSON.parse(await readFile(path.join(this.metaDir, `${fileId}.json`), 'utf8')) as FileMeta
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // 字节在、元信息缺（写入间隙中断）：降级可读，不静默丢数据
      meta = {
        originalName: fileId,
        mimeType: 'application/octet-stream',
        size: data.length,
        uploadedAt: '',
        uploadedBy: '',
      }
    }
    return { meta, data }
  }
}
