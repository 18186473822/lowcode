/**
 * @lc/designer —— 设计器核心包入口
 *
 * 批 1 范围（PLANS.md §1）：uni-shim + 物料映射 + 画布。
 * 批 2+ 追加：schema-ops 树操作纯函数、anchor 拖拽锚点、面板组件。
 */
export * from './shim/index'
export * from './material-map'
export { default as LcCanvas } from './canvas/LcCanvas.vue'
export { default as PanelState } from './components/PanelState.vue'
export { default as MaterialPanel } from './panel/MaterialPanel.vue'
export { default as PropsPanel } from './panel/PropsPanel.vue'
export { default as ModelPanel } from './panel/ModelPanel.vue'
export { default as PortalPanel } from './panel/PortalPanel.vue'
export { default as PortalConfigPanel } from './panel/PortalConfigPanel.vue'
export { default as OutlineTree } from './panel/OutlineTree.vue'
export { default as HistoryDialog } from './panel/HistoryDialog.vue'
export { default as RbacPanel } from './panel/RbacPanel.vue'
export { default as ThemePanel } from './panel/ThemePanel.vue'
export { default as WebhookPanel } from './panel/WebhookPanel.vue'
export { default as MaterialMarketPanel } from './panel/MaterialMarketPanel.vue'
export type { ThemeApi, ThemePatch } from './panel/theme-types'
export type {
  WebhookApi,
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookDeliveryPage,
  WebhookEventType,
  WebhookListItem,
  WebhookMetrics,
  WebhookSubscription,
  WebhookWriteResult,
} from './panel/webhook-types'
export { WEBHOOK_EVENT_OPTIONS } from './panel/webhook-types'
export { useDesignerStore } from './store/store'
export type {
  DesignerApi,
  SaveState,
  PageListItem,
  PortalListItem,
  AppSettings,
  AppConfigPatch,
  ModelSummary,
  VersionSummary,
  VersionList,
  RoleRecord,
  RbacConfig,
} from './store/store'
export type { DragSource } from './core/dnd'
export { LC_MATERIAL_MIME, LC_NODE_MIME } from './core/dnd'
export * from './core/schema-ops'
export * from './core/model-ops'
export * from './core/page-builder'
export * from './core/anchor'
export { resolveKeyIntent } from './core/keyboard'
export type { DesignerKeyIntent } from './core/keyboard'
export { diffSchema } from './core/schema-diff'
export type { DiffEntry } from './core/schema-diff'
export { demoPage } from './fixtures/demo-page'
