/**
 * 文件仓储契约（Phase 4 文件落库）。
 *
 * - `FileMeta`：对外的文件元信息（原名 / MIME / 大小 / 上传时间 / 上传者）；
 * - `StoredFile`：元信息 + 原始字节，作为仓储的一次读写单元；
 * - JSON 模式由磁盘实现落成 `files/` + `files-meta/` 两个文件；
 * - MySQL 模式由 `files` 表承载，元数据与 `LONGBLOB` 内容同一行，写入天然原子。
 *
 * 服务层只依赖本契约，不感知具体存储介质；上传/下载接口与错误码保持不变。
 */

/** 文件元信息（与现有 `files-meta/<fileId>.json` 字段一致） */
export interface FileMeta {
  originalName: string
  mimeType: string
  size: number
  uploadedAt: string
  uploadedBy: string
}

/** 一条完整文件记录：id + 元信息 + 原始字节 */
export interface StoredFile {
  id: string
  meta: FileMeta
  data: Buffer
}

/** 仓储契约：保存覆盖同名 id，读取不存在返回 null */
export interface FileRepository {
  save(file: StoredFile): Promise<void>
  find(id: string): Promise<StoredFile | null>
}

/** DI token：文件仓储 */
export const FILE_REPOSITORY = 'LC:FILE_REPOSITORY'
