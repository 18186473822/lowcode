/**
 * META 注册表 —— 全部 33 份物料元信息（PLANS.md §1 D-A4；Phase 2 批 3 由 13 → 31；
 * Phase 3 批 2 +2 → 33：biz 组 ApprovalBar / Timeline）。
 *
 * - `META_LIST`：33 项（Page + FormGroup + 31 物料组件），按 category/order 排序；
 *   **面板展示需排除 Page**（root 不可拖，由设计器面板过滤）→ 展示 32 项。
 * - `META_MAP`：name → meta，供属性面板按 `componentName` 取 settings。
 * - 事实源：`packages/schema` 协议 4 章 + 各物料 index.vue 实际 props（见分组文件头注释）。
 */
import type { MaterialSchema } from '@lc/schema'
import { BASIC_META } from './basic'
import { LAYOUT_META } from './layout'
import { FORM_META } from './form'
import { FEEDBACK_META } from './feedback'
import { DATA_META } from './data'
import { NAV_META } from './nav'
import { BIZ_META } from './biz'

export { BASIC_META, LAYOUT_META, FORM_META, FEEDBACK_META, DATA_META, NAV_META, BIZ_META }

const byCategoryOrder = (a: MaterialSchema, b: MaterialSchema): number =>
  a.category.localeCompare(b.category) || (a.order ?? 0) - (b.order ?? 0)

export const META_LIST: MaterialSchema[] = [
  ...LAYOUT_META,
  ...BASIC_META,
  ...FORM_META,
  ...FEEDBACK_META,
  ...DATA_META,
  ...NAV_META,
  ...BIZ_META,
]
  .slice()
  .sort(byCategoryOrder)

export const META_MAP: Record<string, MaterialSchema> = Object.fromEntries(
  META_LIST.map((m) => [m.name, m]),
)
