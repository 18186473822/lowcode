/**
 * 资源版本 ETag 约定（乐观锁）：
 *
 * ```
 * "page:<pageId>:<revision>"
 * "record:<modelId>/<recordId>:<revision>"
 * "flow:<instanceId>:<revision>"
 * ```
 *
 * - 读接口返回 `ETag` 响应头，同时 body 内回带 `revision`，便于非 HTTP 客户端使用；
 * - 写接口接受 `If-Match`。缺省表示旧客户端，仍按无条件写处理；一旦携带，版本不匹配即 409。
 * - `W/` 弱前缀与引号都接受，比较的是 revision 数字，不比较强弱语义。
 */
import { BadRequestException } from '@nestjs/common'

export type EtagKind = 'page' | 'record' | 'flow' | 'webhook' | 'webhook-delivery' | 'material' | 'material-install'

export function makeEtag(kind: EtagKind, id: string, revision: number): string {
  return `"${kind}:${id}:${revision}"`
}

/**
 * 解析 If-Match 并校验资源 id。返回 `undefined` 表示未携带。
 * 非法格式直接 400，避免把损坏的客户端版本号误当成 0。
 */
export function parseIfMatch(
  header: string | undefined,
  kind: EtagKind,
  id: string,
): number | undefined {
  if (header === undefined || header.trim() === '') return undefined

  let value = header.trim()
  if (value.startsWith('W/')) value = value.slice(2)
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)

  const prefix = `${kind}:${id}:`
  if (!value.startsWith(prefix)) {
    throw new BadRequestException({
      code: 'INVALID_IF_MATCH',
      message: `If-Match 与当前资源不匹配：期望 ${kind}:${id}:<revision>`,
    })
  }

  const raw = value.slice(prefix.length)
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestException({
      code: 'INVALID_IF_MATCH',
      message: 'If-Match 的 revision 必须是非负整数',
    })
  }
  return Number(raw)
}
