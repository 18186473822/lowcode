<!--
  App.vue —— 设计器三栏布局（PLANS.md §1）
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
        <span class="designer__logo" :title="`移动端低代码平台 · ${stageLabel}`">
          移动端低代码平台<span class="designer__logo-sub"> · {{ stageLabel }}</span>
        </span>
        <!-- 门户设计是一级首页：顶栏给出栏目上下文，避免只剩一条空顶栏 -->
        <span v-if="isPortalView" class="designer__view">门户设计</span>
        <!-- 批 5 Profiler（D-P3-14）：Schema 加载 + 画布渲染耗时；悬浮看完整采样 JSON -->
        <span
          v-if="store.perfText"
          class="designer__perf"
          data-testid="designer-perf"
          :title="'性能采样：' + JSON.stringify(store.perf)"
        >{{ store.perfText }}</span>
      </div>
      <div class="designer__actions">
        <!-- 抽屉形态才有（< 1024）：左右栏折叠后需要常驻的呼出入口。
             只有画布视图有左右栏，门户 / 模型 / 权限等视图下不渲染，避免按钮点了没反应。 -->
        <template v-if="drawerMode && isCanvasView">
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
        <!-- 2026-10-28：换页下拉 + pageId 输入 + 打开 / 新建 / 删除 合并为「页面」菜单。
             原先五个控件平铺，1076px 窗口下被 flex 压缩、下拉与删除按钮互相重叠。
             2026-10-29：门户设计是**一级首页**，工作区入口只保留首页右栏卡片，
             所以这里整体不渲染（不再降级成「工作区」导航，避免两处入口并存）。 -->
        <template v-if="!isPortalView">
          <top-page-menu />
          <span class="top-sep" aria-hidden="true" />
        </template>
        <!-- 页面级动作只在画布视图出现：门户清单 / 模型 / 权限等视图下没有「当前可见页」，
             留着保存/发布会把用户看不见的页写盘（2026-10-28 结构调整）。 -->
        <template v-if="isCanvasView">
          <button class="top-btn top-btn--primary" type="button" @click="onSave">保存</button>
          <button class="top-btn" type="button" data-testid="publish" @click="openPublish">发布</button>
          <!-- Phase 2 批 4：撤销/重做（窄屏收进「更多」，宽屏常驻） -->
          <span class="top-sep designer__sep--history" aria-hidden="true" />
          <div class="designer__history">
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
          </div>
        </template>
        <!-- 工作区（画布 / 模型 / 权限 / 主题 / Webhook / 物料市场）已并入「页面」菜单，
             顶栏不再单开「工作台」一级菜单。 -->

        <!-- 更多：编辑动作 + 帮助 / 资源。窄屏隐藏的撤销、重做、主题也在这里保底可达。 -->
        <top-more-menu label="更多" testid="top-more">
          <div v-if="isCanvasView" class="top-menu__group">
            <span class="top-menu__label">编辑</span>
            <button
              class="top-btn"
              type="button"
              data-testid="more-undo"
              :disabled="!store.canUndo"
              @click="store.undo()"
            >撤销</button>
            <button
              class="top-btn"
              type="button"
              data-testid="more-redo"
              :disabled="!store.canRedo"
              @click="store.redo()"
            >重做</button>
            <button
              class="top-btn"
              type="button"
              data-testid="open-history"
              @click="store.openHistory()"
            >历史版本</button>
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
          </div>
          <div v-if="isCanvasView" class="top-menu__divider" aria-hidden="true" />
          <div class="top-menu__group">
            <span class="top-menu__label">界面</span>
            <button
              class="top-btn"
              type="button"
              data-testid="toggle-theme-menu"
              @click="onToggleTheme"
            >切换为{{ theme === 'dark' ? '亮色' : '暗色' }}主题</button>
            <!-- 帮助不随画布动作隐藏：任何视图都要能查快捷键 -->
            <button
              class="top-btn"
              type="button"
              data-testid="open-help"
              @click="helpOpen = true"
            >快捷键与帮助</button>
          </div>
          <div class="top-menu__divider" aria-hidden="true" />
          <div class="top-menu__group">
            <span class="top-menu__label">资源</span>
            <a
              class="top-btn"
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
            >API 文档 ↗</a>
          </div>
        </top-more-menu>
        <!-- 主题切换：只改令牌取值，不改组件用法（design-system.md §2.2 / §10.4） -->
        <span class="top-sep designer__sep--theme" aria-hidden="true" />
        <button
          class="top-btn designer__theme-top"
          type="button"
          data-testid="toggle-theme"
          title="切换主题（亮色 / 暗色）"
          @click="onToggleTheme"
        >{{ theme === 'dark' ? '亮色' : '暗色' }}</button>
        <span v-if="isCanvasView" class="save-badge" :class="`save-badge--${store.saveState}`" :title="badgeText">{{ badgeText }}</span>
      </div>
    </header>

    <!-- Phase 2 批 1 / D-P2-1：数据模型管理视图（视图切换，与画布互斥） -->
    <div v-if="store.view === 'portal'" class="designer__models designer__models--flush">
      <portal-panel />
    </div>
    <div v-else-if="store.view === 'model'" class="designer__models">
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
    <!-- 开放集成：Webhook 订阅 / 投递日志 / 指标 / 密钥轮换 / 清理归档 -->
    <div v-else-if="store.view === 'webhook'" class="designer__models">
      <webhook-panel :api="webhookApi" />
    </div>
    <!-- 远程物料市场：只加载已验签元数据；受控组件插入时复用宿主内置物料 -->
    <div v-else-if="store.view === 'market'" class="designer__models">
      <material-market-panel
        :manifest-url="marketManifestUrl"
        :public-key-pem="marketPublicKey"
        :allowlist="marketAllowlist"
        @insert="onInsertRemoteMaterial"
      />
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
        <!-- 页头：层级（← 门户设计 / 页名）+ 页型 + 当前规模。
             2026-10-29 重设计：不再用蓝色提示条解释画布，事实读数放页头与底部读数栏。 -->
        <div class="canvas-head" data-testid="canvas-head">
          <div class="canvas-head__path">
            <button class="canvas-head__back" type="button" data-testid="canvas-crumbs" @click="backToPortal">
              <span class="canvas-head__arrow" aria-hidden="true">←</span>
              门户设计
            </button>
            <span class="canvas-head__slash" aria-hidden="true">/</span>
            <span class="canvas-head__name" :title="store.pageId">{{ crumbName }}</span>
            <span class="canvas-head__type">{{ pageTypeLabel }}</span>
          </div>
          <span class="canvas-head__facts" data-testid="canvas-facts">{{ canvasFacts }}</span>
        </div>

        <!-- 工具条：左设备档位（内凹轨道 + 白色滑块）/ 右预览、缩放、标尺 -->
        <div class="canvas-bar">
          <div class="canvas-seg" role="group" aria-label="设备档位">
            <button
              v-for="d in DEVICES"
              :key="d.value"
              class="canvas-seg__btn"
              :class="{ 'canvas-seg__btn--on': device === d.value }"
              type="button"
              :aria-pressed="device === d.value"
              :data-testid="`device-${d.value}`"
              @click="device = d.value"
            >{{ d.label }}</button>
          </div>
          <div class="canvas-bar__actions">
            <button
              class="canvas-preview"
              type="button"
              data-testid="canvas-preview"
              :disabled="previewing"
              title="保存后在新标签打开运行体手机页"
              @click="openPreview"
            >
              <svg
                class="canvas-preview__icon"
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
                <path d="M7 12.5h2" />
              </svg>
              {{ previewing ? '准备中…' : '手机预览' }}
            </button>
            <span class="canvas-bar__divider" aria-hidden="true" />
            <div class="canvas-zoom" role="group" aria-label="画布缩放">
              <button
                class="canvas-zoom__btn"
                type="button"
                data-testid="zoom-out"
                title="缩小"
                :disabled="zoom === ZOOM_STEPS[0]"
                @click="zoomOut"
              >−</button>
              <span class="canvas-zoom__value" data-testid="zoom-value">{{ zoom }}%</span>
              <button
                class="canvas-zoom__btn"
                type="button"
                data-testid="zoom-in"
                title="放大"
                :disabled="zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]"
                @click="zoomIn"
              >＋</button>
            </div>
            <button
              class="canvas-chip canvas-chip--ruler"
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

        <!-- 读数栏：页面类型 + 尺寸 / 组件 / 缩放。提示条信息改为可核对的事实。 -->
        <div class="canvas-foot" data-testid="canvas-foot">
          <span class="canvas-foot__kind">{{ canvasKind }}</span>
          <span class="canvas-foot__readout">
            <span>{{ deviceFact }}</span>
            <span data-testid="canvas-count">{{ componentFact }}</span>
            <span class="canvas-foot__zoom">{{ zoom }}%</span>
          </span>
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
      <!-- 校验摘要只属于画布：门户清单 / 模型视图下显示「✓ 校验通过」会指向看不见的页 -->
      <template v-if="isCanvasView">
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
      </template>
      <span v-else class="bottom__ok" />
      <!-- 门户视图下 statusText 还是上一次画布操作留下的（「已打开 xxx」），显示出来语义错位 -->
      <span v-if="isCanvasView" class="bottom__status">{{ store.statusText }}</span>
      <span v-else class="bottom__status">{{ workspaceHint }}</span>
    </footer>

    <!-- Phase 2 批 5：版本历史弹层（fixed 定位，不受布局约束） -->
    <HistoryDialog />

    <!-- 快捷键与帮助（「更多 → 快捷键与帮助」） -->
    <HelpDialog v-if="helpOpen" @close="helpOpen = false" />

    <!-- 发布版本：填版本说明（2026-10-29 P3） -->
    <PublishDialog
      v-if="publishOpen"
      :current-version="store.currentVersion"
      :saving="publishSaving"
      :error="publishError"
      @close="publishOpen = false"
      @confirm="onPublish"
    />

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
import { countNodes, type PageControllerOptions } from '@lc/renderer'
import {
  LcCanvas,
  HistoryDialog,
  MaterialMarketPanel,
  MaterialPanel,
  ModelPanel,
  OutlineTree,
  PortalPanel,
  PublishDialog,
  PropsPanel,
  RbacPanel,
  ThemePanel,
  WebhookPanel,
  resolveKeyIntent,
  useDesignerStore,
} from '@lc/designer'
import type { DragSource, AnchorHit } from '@lc/designer'
import type { AppTheme } from '@lc/schema'
import type { RemoteMaterialEntry } from '@lc/materials'
import { mockHost } from './host'
import { designerApi, themeApi, webhookApi } from './api'
import { resolveTheme, setTheme, applyBrandVars, type ThemeMode } from './theme'
import { useBreakpoint, isDrawerLayout } from './use-breakpoint'
import TopMoreMenu from './TopMoreMenu.vue'
import TopPageMenu from './TopPageMenu.vue'
import HelpDialog from './HelpDialog.vue'

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
const drawerMode = computed(() => isDrawerLayout(bp.value))
const drawer = ref<'none' | 'left' | 'right'>('none')
const gateDismissed = ref(false)
/** 快捷键与帮助弹层（「更多 → 快捷键与帮助」） */
const helpOpen = ref(false)

function toggleDrawer(side: 'left' | 'right'): void {
  drawer.value = drawer.value === side ? 'none' : side
}

// 回到宽屏时收起抽屉，避免下次变窄时残留打开态
watch(bp, (next) => {
  if (!isDrawerLayout(next)) drawer.value = 'none'
})

/** 保存成功后刷新列表（新建页首次保存才会出现在「页面」菜单里） */
async function onSave(): Promise<void> {
  if (await store.save()) void store.loadPages(true)
}

/** 发布：先让用户填版本说明（历史里要能认出这一版），再走 store.publish */
const publishOpen = ref(false)
const publishSaving = ref(false)
const publishError = ref('')

function openPublish(): void {
  publishError.value = ''
  publishOpen.value = true
}

async function onPublish(note: string): Promise<void> {
  publishSaving.value = true
  const ok = await store.publish(note)
  publishSaving.value = false
  if (!ok) {
    // 失败（校验不过 / 网络错）保持弹窗，把原因留在原地——别让用户猜
    publishError.value = store.statusText
    return
  }
  publishOpen.value = false
  // 发布可能内部先保存，成功后同样刷新（版本号 / updatedAt 会变）
  void store.loadPages(true)
}

/* ---------------- 画布工具条（design-system.md §7.1） ----------------
 * 高 44 · 白底 · 左设备轨道（375 / 750 / H5）· 右预览 / 缩放 / 标尺。 */
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

/** Phase 3 批 4：门户页 —— 画布为拖拽区（卡片由配置驱动） */
const isPortalPage = computed(() => store.schema.type === 'portal')

/* ---------------- 画布读数（2026-10-29 重设计） ----------------
 * 提示条改为可核对的事实：页型 / 尺寸 / 卡片数 / 组件数 / 缩放。
 * 组件数排除 root（root 是页面容器，不是用户拖入的组件）。 */
const PAGE_TYPE_LABELS = {
  form: '表单',
  list: '列表',
  detail: '详情',
  portal: '门户',
  custom: '自定义',
} as const
const pageTypeLabel = computed(() => PAGE_TYPE_LABELS[store.schema.type])

const nodeCount = computed(() => Math.max(0, countNodes(store.schema.root) - 1))
const cardCount = computed(() => store.schema.portal?.cards?.length ?? 0)
const componentFact = computed(() =>
  isPortalPage.value
    ? `${cardCount.value} 张卡 / ${nodeCount.value} 个组件`
    : `${nodeCount.value} 个组件`,
)
const canvasFacts = computed(() =>
  isPortalPage.value
    ? `${cardCount.value} 张卡片 · ${nodeCount.value} 个组件`
    : `${nodeCount.value} 个组件`,
)
const canvasKind = computed(() => {
  switch (store.schema.type) {
    case 'portal':
      return '门户页 · 卡片 + 自由拖拽'
    case 'list':
      return '列表页 · 配置驱动'
    case 'detail':
      return '详情页 · 配置驱动'
    case 'custom':
      return '自定义页 · 自由拖拽'
    default:
      return '表单页 · 拖拽搭建'
  }
})
const deviceFact = computed(() => {
  if (device.value === '750') return '750 宽 · 2× 预览'
  if (device.value === 'h5') return 'H5 · 自适应宽'
  return '375 宽 · 高度自适应'
})

/* ---------------- 手机预览（运行体 H5） ----------------
 * 运行体固定 5173（designer 占 5174）；生产可用 VITE_LC_RUNTIME_URL 覆盖。
 * 有未保存改动先保存，避免预览到旧 schema。 */
const previewing = ref(false)
const runtimeOrigin = (
  (import.meta.env.VITE_LC_RUNTIME_URL as string | undefined) ?? ''
).replace(/\/+$/, '')
const runtimeBase = runtimeOrigin || (import.meta.env.DEV ? 'http://127.0.0.1:5173' : '')

async function openPreview(): Promise<void> {
  if (!store.pageId || previewing.value) return
  previewing.value = true
  try {
    if (store.saveState === 'dirty' && !(await store.save())) return
    // uni-app H5 是 hash 路由：路由与参数必须落在 `#/` 后面，否则只会打开首页。
    const url = `${runtimeBase}/#/pages/view/index?pageId=${encodeURIComponent(store.pageId)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  } finally {
    previewing.value = false
  }
}

/** 当前是否「画布」视图：页面级动作 / 校验摘要 / 保存徽标只在画布有意义 */
const isCanvasView = computed(() => store.view === 'page')

/** 门户设计是一级首页：此视图下没有「当前页」，页面菜单与页面级动作整体收敛 */
const isPortalView = computed(() => store.view === 'portal')

/**
 * 顶栏副标题 —— 表达**当前层级**。
 * 门户设计（一级）→ 页面设计 / 数据模型 / …（二级），避免任何视图都自称「设计器」。
 */
const STAGE_LABELS = {
  portal: '门户设计',
  page: '页面设计',
  model: '数据模型',
  rbac: '权限管理',
  theme: '主题配置',
  webhook: 'Webhook 集成',
  market: '物料市场',
} as const
const stageLabel = computed(() => STAGE_LABELS[store.view])

/** 底栏提示 —— 非画布视图下给出当前工作区的一句操作指引（原先把门户文案带到了所有视图） */
const WORKSPACE_HINTS = {
  portal: '门户设计 · 选择一行点「页面设计」进入画布',
  model: '数据模型 · 选择模型进入字段编辑',
  rbac: '权限管理 · 角色与页面可见性',
  theme: '主题配置 · 保存后设计器与 H5 同步换肤',
  webhook: 'Webhook 集成 · 订阅、投递日志与清理',
  market: '物料市场 · 只加载已验签元数据',
} as const
const workspaceHint = computed(() => WORKSPACE_HINTS[store.view as keyof typeof WORKSPACE_HINTS] ?? '')

/** 门户页的面包屑标题（schema.portal.title 缺失时退回页面名 / 编码） */
const portalTitle = computed(() => {
  const named = store.pages.find((p) => p.id === store.pageId)?.name
  return store.schema.portal?.title || named || store.pageId
})

/** 面包屑末级：门户页门户优先（它就是那个门户），其它页用页面名 */
const crumbName = computed(() =>
  isPortalPage.value ? portalTitle.value : (store.pages.find((p) => p.id === store.pageId)?.name || store.pageId),
)

/** 回门户：只切视图，不动 schema —— 未保存的改动仍留在 store，重新进入还在 */
function backToPortal(): void {
  void store.switchView('portal')
}

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

/** 远程物料市场配置：未配置时面板只展示指引，不发任何网络请求。 */
const marketManifestUrl = import.meta.env.VITE_LC_MATERIAL_MARKET_URL as string | undefined
const marketPublicKey = (import.meta.env.VITE_LC_MATERIAL_MARKET_PUBLIC_KEY as string | undefined)?.replace(
  /\\n/g,
  '\n',
)
const marketAllowlist = (import.meta.env.VITE_LC_MATERIAL_MARKET_ALLOWLIST as string | undefined)
  ?.split(',')
  .map((item) => item.trim())
  .filter(Boolean)

/** 只允许把远程“受控组件”映射到宿主内置 componentName；defaultProps 作为受信预设应用。 */
function onInsertRemoteMaterial(entry: RemoteMaterialEntry): void {
  if (entry.kind !== 'component' || !entry.component) return
  if (!store.insertMaterial(entry.component)) return
  const nodeId = store.selectedId
  for (const [key, value] of Object.entries(entry.meta.defaultProps ?? {})) {
    store.setProp(nodeId, key, value)
  }
  void store.switchView('page')
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
  // 守卫：非画布视图没有可见的选中节点。门户清单里按 Delete 会静默删掉画布残留的节点
  // （选中态随上次编辑保留），删完界面无任何反馈 —— 这是纯损失，故按视图直接忽略。
  if (!isCanvasView.value) return
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
  // 2026-10-28：首屏是「移动门户」清单（view 初始 = portal）。
  // 这里只预载清单（内部会顺手刷新页面列表，供「页面」菜单用），**不再自动 openPage**：
  // 旧实现一进来就打开硬编码的 demo 页，用户既没选择过它，保存按钮还会把不可见的内容写盘。
  void store.loadPortalPages()
  // 应用条（应用名 / 入口页）：可选能力，宿主没实现时不阻塞清单
  void store.loadAppConfig()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})
</script>
