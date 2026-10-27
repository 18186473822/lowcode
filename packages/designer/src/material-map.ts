/**
 * material-map.ts —— 设计器侧的物料静态映射（主方案 4.3 material-map 的**手写形态**，L-6）
 *
 * 为什么设计器要自己维护映射：easycom 是 uni 编译期机制，纯 Vite 工程没有 ——
 * 设计器以「全局组件注册」等价实现（`lc-xxx` 标签名与 easycom 解析结果一致，
 * lc-node 模板里的 `<lc-input>` 等标签在两侧解析到同一物料）。
 *
 * Page / FormGroup 无物料组件（lc-node 容器分支内联处理），故不在此表。
 * 未来：schema-cli 按流水线④自动生成本文件（PLANS.md §1 D-A2/D-A4）。
 */
import type { App, Component } from 'vue'
import LcText from '@lc/materials/src/text/index.vue'
import LcInput from '@lc/materials/src/input/index.vue'
import LcTextarea from '@lc/materials/src/textarea/index.vue'
import LcNumberInput from '@lc/materials/src/number-input/index.vue'
import LcRadio from '@lc/materials/src/radio/index.vue'
import LcSelect from '@lc/materials/src/select/index.vue'
import LcSwitch from '@lc/materials/src/switch/index.vue'
import LcUpload from '@lc/materials/src/upload/index.vue'
import LcImage from '@lc/materials/src/image/index.vue'
import LcDivider from '@lc/materials/src/divider/index.vue'
import LcButton from '@lc/materials/src/button/index.vue'
// Phase 2 批 3：18 新物料（FieldType 全集映射 + 方案缺口清单）
import LcDatePicker from '@lc/materials/src/date-picker/index.vue'
import LcDateTimePicker from '@lc/materials/src/date-time-picker/index.vue'
import LcMoneyInput from '@lc/materials/src/money-input/index.vue'
import LcCheckbox from '@lc/materials/src/checkbox/index.vue'
import LcPicker from '@lc/materials/src/picker/index.vue'
import LcUserPicker from '@lc/materials/src/user-picker/index.vue'
import LcDeptPicker from '@lc/materials/src/dept-picker/index.vue'
import LcCascader from '@lc/materials/src/cascader/index.vue'
import LcFileUpload from '@lc/materials/src/file-upload/index.vue'
import LcRate from '@lc/materials/src/rate/index.vue'
import LcSearchBar from '@lc/materials/src/search-bar/index.vue'
import LcDetail from '@lc/materials/src/detail/index.vue'
import LcCell from '@lc/materials/src/cell/index.vue'
import LcList from '@lc/materials/src/list/index.vue'
import LcTabs from '@lc/materials/src/tabs/index.vue'
import LcTag from '@lc/materials/src/tag/index.vue'
import LcIcon from '@lc/materials/src/icon/index.vue'
import LcProgress from '@lc/materials/src/progress/index.vue'
// Phase 3 批 2：审批物料（biz 组）
import LcApprovalBar from '@lc/materials/src/approval-bar/index.vue'
import LcTimeline from '@lc/materials/src/timeline/index.vue'
// Phase 3 批 4：图表 / 指标卡（data 组）
import LcChart from '@lc/materials/src/chart/index.vue'
import LcStatistic from '@lc/materials/src/statistic/index.vue'

/** kebab 标签名 → 物料组件（与 easycom `^lc-(.*)$` 解析结果一致） */
export const MATERIAL_MAP: Record<string, Component> = {
  'lc-text': LcText,
  'lc-input': LcInput,
  'lc-textarea': LcTextarea,
  'lc-number-input': LcNumberInput,
  'lc-radio': LcRadio,
  'lc-select': LcSelect,
  'lc-switch': LcSwitch,
  'lc-upload': LcUpload,
  'lc-image': LcImage,
  'lc-divider': LcDivider,
  'lc-button': LcButton,
  'lc-date-picker': LcDatePicker,
  'lc-date-time-picker': LcDateTimePicker,
  'lc-money-input': LcMoneyInput,
  'lc-checkbox': LcCheckbox,
  'lc-picker': LcPicker,
  'lc-user-picker': LcUserPicker,
  'lc-dept-picker': LcDeptPicker,
  'lc-cascader': LcCascader,
  'lc-file-upload': LcFileUpload,
  'lc-rate': LcRate,
  'lc-search-bar': LcSearchBar,
  'lc-detail': LcDetail,
  'lc-cell': LcCell,
  'lc-list': LcList,
  'lc-tabs': LcTabs,
  'lc-tag': LcTag,
  'lc-icon': LcIcon,
  'lc-progress': LcProgress,
  'lc-approval-bar': LcApprovalBar,
  'lc-timeline': LcTimeline,
  'lc-chart': LcChart,
  'lc-statistic': LcStatistic,
}

/** 全局注册全部物料（供 lc-node 的 v-if 链标签解析） */
export function registerMaterials(app: App): void {
  for (const [name, component] of Object.entries(MATERIAL_MAP)) {
    app.component(name, component)
  }
}
