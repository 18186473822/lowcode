/**
 * 标准详情页的记录编辑纯逻辑（Phase 4，记录前端编辑入口）。
 *
 * 只放「可单测、无 uni 依赖」的部分：
 *  - 记录 ETag 构造（与 apps/server/src/common/etag.ts 的格式严格一致）；
 *  - 编辑控件原始值 → 服务端 payload 的类型转换（数字 / 布尔 / JSON / 文件 / 枚举）。
 *
 * 更新与删除的网络请求仍走 `RuntimeHost.request`，由 `lc-detail-page.vue` 负责
 * 携带 If-Match 与处理 409，因此本模块不需要知道 token / origin。
 */
import type { FieldSchema } from '@lc/schema'

/** 记录系统字段：编辑器不回写这些键（服务端也会 sanitize 掉） */
export const RECORD_SYSTEM_FIELDS = [
  'id',
  'revision',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
] as const

/**
 * 记录 ETag：`"record:<modelId>/<recordId>:<revision>"`。
 *
 * 必须与 `makeEtag('record', \`${modelId}/${recordId}\`, revision)` 完全一致；
 * 记录列表/详情响应体里已带 `revision`，前端据此构造 If-Match，不依赖响应头
 * （uni.request 在宿主层只投影 statusCode/data，未暴露 headers）。
 */
export function recordEtag(modelId: string, recordId: string, revision: unknown): string {
  const rev = typeof revision === 'number' && Number.isInteger(revision) && revision >= 0 ? revision : 0
  return `"record:${modelId}/${recordId}:${rev}"`
}

/** 单字段转换结果：失败时给出可直接展示的中文原因 */
export type RecordFieldParseResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string }

/**
 * 编辑控件原始值 → 服务端 payload 值。
 *
 * - `boolean` 控件直接给 boolean；
 * - 其余控件给字符串（`<input>` / `<textarea>` / picker 下标反查后的值）；
 * - 空字符串：数字/JSON 转 `null`（清空），文件转 `[]`，字符串保持 `''`；
 * - 枚举按 `String(value)` 反查原始选项值，避免把数字枚举写成字符串。
 *
 * 必填空值由调用方先判定（需要字段 label 与 error 展示），这里只负责类型转换。
 */
export function parseRecordFieldValue(
  field: Pick<FieldSchema, 'key' | 'name' | 'type' | 'options'>,
  raw: string | number | boolean,
): RecordFieldParseResult {
  const label = field.name || field.key

  if (field.type === 'boolean') {
    return typeof raw === 'boolean'
      ? { ok: true, value: raw }
      : { ok: false, message: `${label}必须是布尔值` }
  }

  // Vue 对 `<input type="number">` 的 v-model 会自动转 number；统一按字符串解析，
  // 避免同一字段在 H5 / 小程序下因控件实现差异出现「值格式不正确」。
  const text = (typeof raw === 'string' ? raw : String(raw)).trim()

  if (field.type === 'number' || field.type === 'money') {
    if (text === '') return { ok: true, value: null }
    const n = Number(text)
    return Number.isFinite(n)
      ? { ok: true, value: n }
      : { ok: false, message: `${label}必须是数字` }
  }

  if (field.type === 'json' || field.type === 'location') {
    if (text === '') return { ok: true, value: null }
    try {
      return { ok: true, value: JSON.parse(text) as unknown }
    } catch {
      return { ok: false, message: `${label}必须是合法 JSON` }
    }
  }

  if (field.type === 'file') {
    if (text === '') return { ok: true, value: [] }
    return {
      ok: true,
      value: text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    }
  }

  if (field.type === 'enum') {
    if (text === '') return { ok: true, value: null }
    const hit = (field.options ?? []).find((o) => String(o.value) === text)
    return hit
      ? { ok: true, value: hit.value }
      : { ok: false, message: `${label}不在可选范围内` }
  }

  return { ok: true, value: raw }
}
