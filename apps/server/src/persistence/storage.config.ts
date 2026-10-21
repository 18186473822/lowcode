/**
 * 存储模式选择（Phase 4 数据库第一批）。
 *
 * - `json`（默认）：现有 JSON 文件仓储，零外部依赖，单测/本地无 MySQL 均可跑；
 * - `mysql`：Prisma + MySQL 8，业务主数据落库；需设置 `DATABASE_URL`。
 *
 * 选择在启动期校验：非法模式或 mysql 模式缺少连接串时 fail-closed，不监听端口。
 */
export type StorageMode = 'json' | 'mysql'

export function resolveStorageMode(env: NodeJS.ProcessEnv = process.env): StorageMode {
  const raw = (env.LC_STORAGE ?? 'json').trim().toLowerCase()
  if (raw === 'json' || raw === 'mysql') return raw
  throw new Error(`LC_STORAGE 只接受 json / mysql（当前：${raw}）`)
}

export function assertStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageMode {
  const mode = resolveStorageMode(env)
  if (mode === 'mysql') {
    const url = env.DATABASE_URL?.trim()
    if (!url) {
      throw new Error('LC_STORAGE=mysql 时必须设置 DATABASE_URL（mysql://user:pass@host:3306/db）')
    }
    if (!/^mysql:\/\//i.test(url)) {
      throw new Error('DATABASE_URL 必须以 mysql:// 开头')
    }
  }
  return mode
}
