/**
 * `@lc/materials` 包入口 —— **只导出 meta 数据**（designer 消费）。
 *
 * 物料组件不在此导出：uni 运行时走 easycom（`^lc-(.*)$` → `src/$1/index.vue`，
 * 编译期解析，L-6），designer 走手写 `material-map` 静态 import —— 双端各自解析，
 * 本 barrel 仅是 META 的单一来源，避免把 .vue 卷进非 uni 宿主。
 */
export {
  META_LIST,
  META_MAP,
  BASIC_META,
  LAYOUT_META,
  FORM_META,
  FEEDBACK_META,
  DATA_META,
  NAV_META,
  BIZ_META,
} from './meta/index'
/** 审批类物料宿主注入（批 2 D-P3-4）：lc-renderer provide / 物料 inject */
export { LC_FLOW_HOST_KEY, type LcFlowHost } from './keys'

/**
 * 远程物料市场：清单验签 / allowlist / 缓存 / 安装状态。
 * 只导出元数据与校验工具，不导出任何远程代码加载能力。
 */
export {
  REMOTE_MATERIAL_CACHE_KEY,
  REMOTE_MATERIAL_INSTALLED_KEY,
  TRUSTED_COMPONENT_IDS,
  RemoteMaterialRegistry,
  canonicalJson,
  validateManifest,
  validateRemoteMaterial,
  verifyManifestSignature,
} from './remote-market'
export type {
  RemoteMaterialCache,
  RemoteMaterialEntry,
  RemoteMaterialInstall,
  RemoteMaterialManifest,
  RemoteMaterialRegistryOptions,
  SignedManifestEnvelope,
  StorageLike,
} from './remote-market'
