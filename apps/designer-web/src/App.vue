<!--
  App.vue —— 设计器三栏布局（designer-plan §6.2）
  批 1：左物料面板 + 中画布（LcCanvas，375 手机壳）+ 右属性面板（占位）。
  批 2：画布 @drop 分发到 store（insertMaterial / moveByDrop）、全局 Delete/Backspace 删除。
  批 3：顶栏 pageId 打开/新建/保存/发布 + 保存状态徽标；底栏 validatePage 错误列表 + 操作状态；
        挂载时注入 DesignerApi 并自动打开默认页。
  store 与面板组件都在 @lc/designer（可单测），本应用只做布局与事件接线。
-->
<template>
  <div class="designer">
    <header class="designer__top">
      <div class="designer__brand">
        <span class="designer__logo">移动端低代码平台 · 设计器</span>
        <!-- 页面标识：design-system.md §7.1「左栏品牌 + 页面标识」。
             原先这里挂的是构建期文案「批 6 · …」，换成当前页面与发布状态才有信息量。 -->
        <span class="designer__page" :title="`当前页面：${store.pageId || '未打开'}`">
          <span class="designer__page-id">{{ store.pageId || '未打开页面' }}</span>
          <span class="designer__page-state">{{ pageStateText }}</span>
        </span>
        <!-- 批 5 Profiler（D-P3-14）：Schema 加载 + 画布渲染耗时；悬浮看完整采样 JSON -->
        <span
          v-if="store.perfText"
          class="designer__perf"
          data-testid="designer-perf"
          :title="'性能采样：' + JSON.stringify(store.perf)"
        >{{ store.perfText }}</span>
      </div>
      <div class="designer__actions">
        <!-- 抽屉形态才有（< 1024）：左右栏折叠后需要常驻的呼出入口 -->
        <template v-if="drawerMode">
          <button
            class="top-btn"
            type="button"
            data-testid="toggle-left-panel"
            :aria-pressed="drawer === 'left'"
            title="物料 / 大纲面板"
            @click="toggleDrawer('left')"
          >物料</button>
          <button
            class="top-btn"
            type="button"
            data-testid="toggle-right-panel"
            :aria-pressed="drawer === 'right'"
            title="属性面板"
            @click="toggleDrawer('right')"
          >属性</button>
          <span class="top-sep" aria-hidden="true" />
        </template>
        <!-- 2026-10-20：页面列表下拉（GET /pages）+ 当前页删除（两步确认） -->
        <select
          class="page-select"
          data-testid="page-select"
          aria-label="选择已有页面"
          :value="store.pageId"
          :disabled="store.pagesLoading"
          :title="store.pagesError || '选择已有页面（选中即打开）'"
          @change="onPickPage"
        >
          <option v-if="!hasCurrentPage" :value="store.pageId">
            {{ store.pageId || '选择页面' }}
          </option>
          <option v-for="p in store.pages" :key="p.id" :value="p.id">
            {{ p.name }}（{{ p.id }}）
          </option>
        </select>
        <button
          class="top-btn"
          :class="{ 'top-btn--danger': deleteArmed }"
          type="button"
          data-testid="delete-page"
          :disabled="!canDeletePage"
          :title="canDeletePage ? `删除 ${store.pageId}（含全部历史版本）` : '当前页尚未保存到服务端'"
          @click="onDeletePage"
        >{{ deleteArmed ? '确认删除' : '删除' }}</button>
        <input
          v-model="store.pageId"
          class="pid-input"
          type="text"
          placeholder="pageId"
          aria-label="页面 ID"
          list="designer-page-options"
          @keydown.enter="store.openPage()"
        />
        <!-- 输入框同时保留手输 / 新建 ID 的能力；datalist 给出与下拉一致的候选 -->
        <datalist id="designer-page-options">
          <option v-for="p in store.pages" :key="p.id" :value="p.id">{{ p.name }}</option>
        </datalist>
        <button class="top-btn" type="button" @click="store.openPage()">打开</button>
        <button class="top-btn" type="button" @click="onNew">新建</button>
        <span class="top-sep" aria-hidden="true" />
        <button class="top-btn top-btn--primary" type="button" @click="onSave">保存</button>
        <button class="top-btn" type="button" @click="onPublish">发布</button>
        <!-- Phase 2 批 4：撤销/重做 + 复制/剪切/粘贴（phase2-plan §8） -->
        <span class="top-sep" aria-hidden="true" />
        <button
          class="top-btn"
          type="button"
          data-testid="undo"
          :disabled="!store.canUndo"
          title="撤销（Ctrl+Z）"
          @click="store.undo()"
        >撤销</button>
        <button
          class="top-btn"
          type="button"
          data-testid="redo"
          :disabled="!store.canRedo"
          title="重做（Ctrl+Shift+Z）"
          @click="store.redo()"
        >重做</button>
        <!-- §3.2：<1180px 把次级操作收进「更多」；宽屏原地平铺（同一份内容，不抄两遍） -->
        <span class="top-sep" aria-hidden="true" />
        <top-more-menu :inline="wideEnough">
          <button
            class="top-btn"
            type="button"
            data-testid="open-history"
            @click="store.openHistory()"
          >历史</button>
          <span class="top-sep" aria-hidden="true" />
          <button
            class="top-btn"
            type="button"
            data-testid="copy"
            :disabled="!store.selectedId || store.isRootSelected"
            title="复制（Ctrl+C）"
            @click="store.copyById(store.selectedId)"
          >复制</button>
          <button
            class="top-btn"
            type="button"
            data-testid="cut"
            :disabled="!store.selectedId || store.isRootSelected"
            title="剪切（Ctrl+X）"
            @click="store.cutById(store.selectedId)"
          >剪切</button>
          <button
            class="top-btn"
            type="button"
            data-testid="paste"
            :disabled="!store.clipboard"
            title="粘贴（Ctrl+V；粘贴位置按选中规则）"
            @click="store.paste()"
          >粘贴</button>
          <span class="top-sep" aria-hidden="true" />
          <button
            class="top-btn"
            :class="{ 'top-btn--primary': store.view === 'model' }"
            type="button"
            data-testid="toggle-models"
            @click="onToggleModels"
          >数据模型</button>
          <button
            class="top-btn"
            :class="{ 'top-btn--primary': store.view === 'rbac' }"
            type="button"
            data-testid="toggle-rbac"
            @click="onToggleRbac"
          >权限管理</button>
          <button
            class="top-btn"
            :class="{ 'top-btn--primary': store.view === 'theme' }"
            type="button"
            data-testid="toggle-theme-panel"
            @click="onToggleThemePanel"
          >主题配置</button>
        </top-more-menu>
        <!-- 主题切换：只改令牌取值，不改组件用法（design-system.md §2.2 / §10.4） -->
        <span class="top-sep" aria-hidden="true" />
        <button
          class="top-btn"
          type="button"
          data-testid="toggle-theme"
          title="切换主题（亮色 / 暗色）"
          @click="onToggleTheme"
        >{{ theme === 'dark' ? '亮色' : '暗色' }}</button>
        <span class="save-badge" :class="`save-badge--${store.saveState}`">{{ badgeText }}</span>
      </div>
    </header>

    <!-- Phase 2 批 1 / D-P2-1：数据模型管理视图（视图切换，与画布互斥） -->
    <div v-if="store.view === 'model'" class="designer__models">
      <model-panel />
    </div>
    <!-- Phase 2 批 6 / D-P2-12：权限管理视图（角色 + 页面授权矩阵，与画布互斥） -->
    <div v-else-if="store.view === 'rbac'" class="designer__models">
      <rbac-panel />
    </div>
    <!-- Phase 3 批 3 / D-P3-8：应用主题配置视图（保存成功即设计器自身换肤预览） -->
    <div v-else-if="store.view === 'theme'" class="designer__models">
      <theme-panel :api="themeApi" @saved="onThemeSaved" />
    </div>
    <div v-else class="designer__body">
      <aside
        class="designer__aside designer__aside--left"
        :class="{ 'designer__aside--drawer': drawerMode, 'designer__aside--open': drawer === 'left' }"
      >
        <!-- Phase 2 批 4：左栏 Tab「物料 / 大纲」互斥 -->
        <div class="left-tabs" role="tablist">
          <button
            class="left-tabs__btn"
            :class="{ 'left-tabs__btn--on': leftTab === 'material' }"
            type="button"
            role="tab"
            data-testid="tab-material"
            @click="leftTab = 'material'"
          >物料</button>
          <button
            class="left-tabs__btn"
            :class="{ 'left-tabs__btn--on': leftTab === 'outline' }"
            type="button"
            role="tab"
            data-testid="tab-outline"
            @click="leftTab = 'outline'"
          >大纲</button>
        </div>
        <material-panel v-if="leftTab === 'material'" />
        <outline-tree v-else />
      </aside>
      <main class="designer__main">
        <!-- Phase 2 批 2：标准页（list/detail）提示 —— 配置驱动，画布根容器仅占位 -->
        <div v-if="isStdPage" class="std-hint" data-testid="std-hint">
          <strong>{{ store.schema.type === 'list' ? '列表页' : '详情页' }}</strong>
          由右侧配置驱动（运行时按配置查询渲染）；下方画布为根容器占位，其节点在标准页运行时忽略。
        </div>
        <!-- Phase 3 批 4：门户页提示 —— 卡片由右侧配置、下方画布为拖拽区（图表/指标卡） -->
        <div v-if="isPortalPage" class="std-hint" data-testid="portal-hint">
          <strong>门户页</strong>
          导航卡片由右侧配置（运行时渲染卡片区）；下方画布为拖拽区，可拖入图表 / 指标卡等物料，运行时渲染在卡片区下方。
        </div>
        <!-- 画布工具条（§7.1）：高 40 · 白底 · 左设备切换 / 右缩放与标尺 -->
        <div class="canvas-bar">
          <div class="canvas-bar__group" role="group" aria-label="设备档位">
            <button
              v-for="d in DEVICES"
              :key="d.value"
              class="canvas-chip"
              :class="{ 'canvas-chip--on': device === d.value }"
              type="button"
              :aria-pressed="device === d.value"
              :data-testid="`device-${d.value}`"
              @click="device = d.value"
            >{{ d.label }}</button>
          </div>
          <div class="canvas-bar__group">
            <button
              class="canvas-chip"
              type="button"
              data-testid="zoom-out"
              title="缩小"
              :disabled="zoom === ZOOM_STEPS[0]"
              @click="zoomOut"
            >−</button>
            <span class="canvas-bar__zoom" data-testid="zoom-value">{{ zoom }}%</span>
            <button
              class="canvas-chip"
              type="button"
              data-testid="zoom-in"
              title="放大"
              :disabled="zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]"
              @click="zoomIn"
            >＋</button>
            <span class="top-sep" aria-hidden="true" />
            <button
              class="canvas-chip"
              :class="{ 'canvas-chip--on': ruler }"
              type="button"
              data-testid="toggle-ruler"
              :aria-pressed="ruler"
              title="标尺 · 参考线（8px 刻度 + 内容区中心虚线）"
              @click="ruler = !ruler"
            >标尺</button>
          </div>
        </div>

        <!-- 标尺 · 参考线（§7.1）：横轴 + 竖轴 + 画布中心参考线，同一个开关 -->
        <div class="canvas-stage" :class="{ 'canvas-stage--ruler': ruler }">
          <template v-if="ruler">
            <div class="canvas-ruler canvas-ruler--corner" aria-hidden="true" />
            <div class="canvas-ruler canvas-ruler--x" data-testid="canvas-ruler-x" aria-hidden="true" />
            <div class="canvas-ruler canvas-ruler--y" data-testid="canvas-ruler-y" aria-hidden="true" />
          </template>
          <div class="canvas-stage__main">
            <lc-canvas
              :schema="store.schema"
              :options="canvasOptions"
              :selected-id="store.selectedId"
              :device="device"
              :zoom="zoom"
              :guides="ruler"
              @select="store.select"
              @drop="onDrop"
              @rendered="store.markRender"
            />
          </div>
        </div>
      </main>
      <aside
        class="designer__aside designer__aside--right"
        :class="{ 'designer__aside--drawer': drawerMode, 'designer__aside--open': drawer === 'right' }"
      >
        <props-panel />
      </aside>

      <!-- 抽屉打开时的遮罩：点任意处收起（不挤压画布，故用浮层而非推挤布局） -->
      <div
        v-if="drawerMode && drawer !== 'none'"
        class="designer__scrim"
        data-testid="drawer-scrim"
        @click="drawer = 'none'"
      />
    </div>

    <footer class="designer__bottom">
      <span v-if="store.validation.errors.length" class="bottom__errors">
        ⚠ {{ store.validation.errors.length }} 项校验错误：
        <span
          v-for="(err, i) in store.validation.errors.slice(0, 3)"
          :key="i"
          class="bottom__err"
          :title="err.path"
        >{{ err.message }}</span>
        <span v-if="store.validation.errors.length > 3" class="bottom__err">…</span>
      </span>
      <span v-else class="bottom__ok">✓ 校验通过</span>
      <span class="bottom__status">{{ store.statusText }}</span>
    </footer>

    <!-- Phase 2 批 5：版本历史弹层（fixed 定位，不受布局约束） -->
    <HistoryDialog />

    <!-- < 640：设计器不提供完整编辑态（design-system.md §6.1 / §10.3） -->
    <div
      v-if="bp === 'mobile' && !gateDismissed"
      class="designer__gate"
      data-testid="narrow-screen-gate"
    >
      <div class="designer__gate-card">
        <h2>设计器需要更宽的屏幕</h2>
        <p>
          拖拽排序与三栏面板在 640px 以下无法可靠操作。建议在 1024px 以上的设备上编辑；
          手机端请使用运行时页面录入数据。
        </p>
        <button class="op-btn op-btn--primary" type="button" @click="gateDismissed = true">
          仍然打开（仅浏览）
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PageControllerOptions } from '@lc/renderer'
import {
  LcCanvas,
  HistoryDialog,
  MaterialPanel,
  ModelPanel,
  OutlineTree,
  PropsPanel,
  RbacPanel,
  ThemePanel,
  resolveKeyIntent,
  useDesignerStore,
} from '@lc/designer'
import type { DragSource, AnchorHit } from '@lc/designer'
import type { AppTheme } from '@lc/schema'
import { mockHost } from './host'
import { designerApi, themeApi } from './api'
import { resolveTheme, setTheme, applyBrandVars, type ThemeMode } from './theme'
import { useBreakpoint, isDrawerLayout, useMinWidth } from './use-breakpoint'
import TopMoreMenu from './TopMoreMenu.vue'

const store = useDesignerStore()
const canvasOptions: PageControllerOptions = { host: mockHost }

/** Phase 2 批 4：左栏页签（物料面板 ↔ 大纲树） */
const leftTab = ref<'material' | 'outline'>('material')

/** 亮暗主题：切换只改令牌取值（tokens.css 的 Semantic/Component Dark 覆盖），组件与页面不感知 */
const theme = ref<ThemeMode>(resolveTheme())

function onToggleTheme(): void {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  setTheme(theme.value)
}

/* ---------------- 响应式（design-system.md §6） ----------------
 * < 1024：左右栏折叠为**抽屉**（浮在画布之上，不挤压画布宽度），顶栏常驻呼出入口；
 * < 640 ：设计器不提供完整编辑态，给窄屏提示（可手动「仍然打开」仅浏览）。
 * ≥1440 ：左右栏加宽 —— 在 style.css 里就地覆盖组件层令牌，不新建断点分支逻辑。 */
const bp = useBreakpoint()
/**
 * §3.2 的「更多」溢出菜单阈值。
 *
 * ⚠️ 规范原写 1180，实测不够：顶栏内容（品牌 + 页面控件 + 15 个按钮）自然宽度约
 * **1550px**，1180–1550 这段仍会溢出。故按实测取 1600 留余量。
 * 顶栏增删按钮后需要重测这个值。
 */
const wideEnough = useMinWidth(1600)
const drawerMode = computed(() => isDrawerLayout(bp.value))
const drawer = ref<'none' | 'left' | 'right'>('none')
const gateDismissed = ref(false)

function toggleDrawer(side: 'left' | 'right'): void {
  drawer.value = drawer.value === side ? 'none' : side
}

// 回到宽屏时收起抽屉，避免下次变窄时残留打开态
watch(bp, (next) => {
  if (!isDrawerLayout(next)) drawer.value = 'none'
})

/** 顶栏页面标识的状态文案（替代原构建期「批 N」文案） */
const pageStateText = computed(() =>
  store.currentVersion > 0 ? `已发布 v${store.currentVersion}` : '草稿',
)

/* ---------------- 2026-10-20：页面列表 / 换页 / 删除 ---------------- */

/** 当前 pageId 是否存在于服务端列表（本地 demo / 未保存的新页不可删） */
const hasCurrentPage = computed(() => store.pages.some((p) => p.id === store.pageId))
const canDeletePage = computed(() => hasCurrentPage.value && !store.pagesLoading)
/** 两步确认的第一态（10 秒未确认自动复位，防误触长期悬挂） */
const deleteArmed = ref(false)
let deleteTimer: number | undefined

function clearDeleteArm(): void {
  deleteArmed.value = false
  if (deleteTimer !== undefined) {
    window.clearTimeout(deleteTimer)
    deleteTimer = undefined
  }
}

/** 下拉选中即打开；保留输入框给手输 / 新建 ID 的场景 */
function onPickPage(e: Event): void {
  const id = (e.target as HTMLSelectElement).value
  if (!id || id === store.pageId) return
  store.pageId = id
  void store.openPage(id)
}

/** 保存成功后刷新列表（新建页首次保存才会出现在下拉里） */
async function onSave(): Promise<void> {
  if (await store.save()) void store.loadPages(true)
}

/** 发布可能内部先保存，成功后同样刷新（版本号 / updatedAt 会变） */
async function onPublish(): Promise<void> {
  if (await store.publish()) void store.loadPages(true)
}

/**
 * 删除当前页：两步确认（不弹原生 confirm，沿 HistoryDialog 口径）。
 * store 内已处理「删的正是当前页 → 切到剩余第一页 / 无剩余则落新草稿」。
 */
function onDeletePage(): void {
  if (!canDeletePage.value) {
    store.statusText = '当前页尚未保存到服务端，无法删除'
    return
  }
  if (!deleteArmed.value) {
    deleteArmed.value = true
    store.statusText = `再次点击「确认删除」将删除 ${store.pageId}（含全部历史版本，不可恢复）`
    deleteTimer = window.setTimeout(() => {
      deleteArmed.value = false
      deleteTimer = undefined
    }, 10_000)
    return
  }
  clearDeleteArm()
  void store.deletePage(store.pageId).then((ok) => {
    if (ok) void store.loadPages(true)
  })
}

/* 换页 / 删除后自动复位确认态 */
watch(() => store.pageId, clearDeleteArm)

/* ---------------- 画布工具条（design-system.md §7.1） ----------------
 * 高 40 · 白底 · 左设备切换（375 / 750 / H5）· 右缩放与标尺开关。 */
const DEVICES = [
  { value: '375', label: '375 手机' },
  { value: '750', label: '750 平板' },
  { value: 'h5', label: 'H5 浏览器' },
] as const

const device = ref<'375' | '750' | 'h5'>('375')
const ZOOM_STEPS = [50, 75, 100, 125, 150] as const
const zoom = ref(100)
const ruler = ref(false)

function zoomOut(): void {
  const i = ZOOM_STEPS.indexOf(zoom.value as (typeof ZOOM_STEPS)[number])
  if (i > 0) zoom.value = ZOOM_STEPS[i - 1] ?? 100
}
function zoomIn(): void {
  const i = ZOOM_STEPS.indexOf(zoom.value as (typeof ZOOM_STEPS)[number])
  if (i < ZOOM_STEPS.length - 1) zoom.value = ZOOM_STEPS[i + 1] ?? 100
}

/** Phase 2 批 2：标准页（list/detail）—— 画布仅占位，顶部提示条 */
const isStdPage = computed(() => store.schema.type === 'list' || store.schema.type === 'detail')

/** Phase 3 批 4：门户页 —— 画布为拖拽区（卡片由配置驱动），顶部提示条 */
const isPortalPage = computed(() => store.schema.type === 'portal')

/** 保存状态徽标文案（store.saveState → 人话） */
const badgeText = computed(() => {
  switch (store.saveState) {
    case 'dirty':
      return '未保存'
    case 'saving':
      return '保存中…'
    case 'loading':
      return '加载中…'
    case 'error':
      return '有错误'
    default:
      return '已保存'
  }
})

/** 新建：以输入框 pageId 为键重置为 demo 初始结构（建档由随后的保存完成） */
function onNew(): void {
  if (!store.pageId.trim()) {
    store.statusText = '请先输入 pageId 再新建'
    return
  }
  store.newPage(store.pageId)
}

/** 视图切换（Phase 2 批 1）：画布 ↔ 数据模型管理 */
function onToggleModels(): void {
  void store.switchView(store.view === 'model' ? 'page' : 'model')
}

/** 视图切换（Phase 2 批 6）：画布 ↔ 权限管理 */
function onToggleRbac(): void {
  void store.switchView(store.view === 'rbac' ? 'page' : 'rbac')
}

/** 视图切换（Phase 3 批 3）：画布 ↔ 主题配置 */
function onToggleThemePanel(): void {
  void store.switchView(store.view === 'theme' ? 'page' : 'theme')
}

/** 主题保存成功 → 设计器自身换肤预览（所见即所得；dark 联动见 theme.ts 说明） */
function onThemeSaved(theme: AppTheme): void {
  applyBrandVars(theme)
}

/** 画布 drop → store 动作（物料插入 / 节点换位；锚点换算在 store.resolve） */
function onDrop(payload: { source: DragSource; hit: AnchorHit }): void {
  if (payload.source.kind === 'material') store.insertMaterial(payload.source.name, payload.hit)
  else store.moveByDrop(payload.source.id, payload.hit)
}

/** 全局快捷键：意图分发在 `@lc/designer` resolveKeyIntent（纯函数可单测），这里只接线执行 */
function onKey(e: KeyboardEvent): void {
  const intent = resolveKeyIntent(e)
  if (!intent) return
  e.preventDefault()
  switch (intent) {
    case 'delete':
      if (store.selectedId && !store.isRootSelected) store.removeById(store.selectedId)
      break
    case 'undo':
      store.undo()
      break
    case 'redo':
      store.redo()
      break
    case 'copy':
      store.copyById(store.selectedId)
      break
    case 'cut':
      store.cutById(store.selectedId)
      break
    case 'paste':
      store.paste()
      break
  }
}

// API 是模块级常量 → 在 **setup 顶层**注入：Vue 的父组件 onMounted 晚于子组件 onMounted，
// 若放这里，PropsPanel 的 onMounted（loadModels）会先跑，拿到 null api 就报「未配置服务端 API」（B-30）
store.setApi(designerApi)

onMounted(() => {
  void store.loadPages() // 顶栏换页下拉（失败只写 pagesError，不阻塞打开默认页）
  void store.openPage() // 首屏自动打开默认页（不存在 → 提示后可直接保存建档）
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearDeleteArm()
})
</script>
