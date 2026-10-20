<template>
  <view class="view">
    <!-- 加载中 → 骨架屏 -->
    <lc-state-view v-if="loading" kind="loading" testid="view-loading" />

    <!-- 异常（§5 分类）：401 / 403 / 404 / 网络 / 其他，各自带出口 -->
    <lc-state-view
      v-else-if="state"
      :kind="state.kind"
      :title="state.title"
      :text="state.text"
      :action-text="state.actionText"
      :testid="`view-${state.kind}`"
      @action="onStateAction"
    />

    <!-- Schema → 组件树（Phase 2 批 2：按页型分发，list/detail 为配置化标准页，忽略 root 树；
         Phase 3 批 4：portal 为卡片导航 + 拖拽区混合页） -->
    <lc-list-page
      v-else-if="schema && schema.type === 'list'"
      :schema="schema"
      :options="options"
      @navigate="onNavigate"
      @state-action="onChildStateAction"
    />
    <lc-detail-page
      v-else-if="schema && schema.type === 'detail'"
      :schema="schema"
      :options="options"
      :record-id="rid"
      @back="onBack"
      @navigate="onNavigate"
      @state-action="onChildStateAction"
    />
    <lc-portal-page
      v-else-if="schema && schema.type === 'portal'"
      :schema="schema"
      :options="options"
      @navigate="onNavigate"
      @open-url="onOpenUrl"
    />
    <lc-renderer v-else-if="schema" ref="rendererRef" :schema="schema" :options="options" />

    <!-- 批 5 Profiler（D-P3-14）：`?perf=1` 才显示，避免打扰真实用户；
         文本口径与设计器徽标共用 `formatPerf`（@lc/renderer） -->
    <view v-if="showPerf && perfText" class="view__perf" data-testid="view-perf">{{ perfText }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onHide, onLoad, onUnload } from '@dcloudio/uni-app'
import type { PageSchema } from '@lc/schema'
import type { ControllerStats, PageControllerOptions, StateKind } from '@lc/renderer'
import { classifyError, countNodes, formatPerf } from '@lc/renderer'
import LcStateView from '@lc/renderer/uni/lc-state-view.vue'
import { ApiError, displayName, fetchPageSchema, getPerms, getUser } from '@/api'
import { createUniHost } from '@/host'
import { createUniDraft } from '@/draft'
import { createUniOpsReporter, type OpsReporter, type OpsReporterMeta } from '@/ops'

/** 统一渲染入口：`?pageId=` → 服务端 Schema → 按 type 分发（form/custom → lc-renderer；list/detail/portal → 标准页） */
const pageId = ref('')
/** 详情页路由参数：列表点行携带的记录主键 */
const rid = ref('')
const schema = ref<PageSchema | null>(null)
const loading = ref(true)
const error = ref('')
/** §5 分类后的异常（含状态、标题、说明、出口）；null = 无异常 */
const state = computed(() => (rawError.value === null ? null : classifyError(rawError.value, { pageId: pageId.value })))
const rawError = ref<unknown>(null)
/** 批 5 Profiler 角标（`?perf=1` 才开启） */
const showPerf = ref(false)
const perfText = ref('')
/** lc-renderer 暴露的 controller（读 stats：nodeCount/buildMs/mountMs） */
const rendererRef = ref<{ controller?: { stats?: ControllerStats } } | null>(null)

/* ---------------- 批 5：埋点上报（D-P3-13） ---------------- */

/** 页面级上下文（引用对象：Schema 到手前就能上报加载失败，拿到版本后再补版本号） */
const opsMeta: OpsReporterMeta = { source: 'runtime' }
let reporter: OpsReporter | null = null

/** 错误对象 → 可读文本（表达式引擎抛的是 Error 实例，也可能是字符串） */
function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const options: PageControllerOptions = {
  host: createUniHost(),
  user: userOptions(),
  // 批 6：按钮级权限 —— 每次判定实时读会话 perms（fail-closed：无 perms 缓存时 perm 节点全隐；
  // '*' 通配恒真，与服务端 RbacService.permsOf 同源语义）。renderer 既有语义：无权限整节点不渲染。
  hasPerm: (perm: string) => {
    const perms = getPerms()
    return perms.includes('*') || perms.includes(perm)
  },
  onExprError: (info) => {
    console.error('[lc-runtime] expr error:', JSON.stringify(info))
    // 方案 791：求值失败只降级该表达式（renderer 已用 fallback 兜底，不白屏），现场上报
    reporter?.error('expr', errorText(info.error), { nodeId: info.nodeId, expr: info.expr })
  },
  onLoopOverflow: (info) => {
    console.warn('[lc-runtime] loop overflow:', JSON.stringify(info))
    reporter?.error('loop-overflow', `loop 展开超限 ${info.actual}/${info.limit}`, {
      nodeId: info.nodeId,
      limit: info.limit,
      actual: info.actual,
    })
  },
  // submit 失败必须可见（错误不静默）；成功时页面未配 successToast 则壳层兜底提示
  onActionResult: (r) => {
    console.log('[lc-runtime] action result:', JSON.stringify(r))
    if (!r.ok) {
      reporter?.error('action', r.error ?? '动作执行失败', { actionType: r.type })
    }
    if (r.type === 'submit') {
      if (r.ok) {
        const configured = !!schema.value?.submit?.successToast
        if (!configured) uni.showToast({ title: '提交成功', icon: 'success' })
      } else {
        uni.showToast({ title: r.error ?? '提交失败', icon: 'none' })
      }
    }
  },
  onUnsupported: (type) => {
    console.warn('[lc-runtime] unsupported action:', type)
    reporter?.event('unsupported-action', { actionType: type })
  },
}

onLoad((opt) => {
  // 批 2：路由参数入表达式根变量（`$expr: urlParams.rid` 等）——必须先于 controller 构造赋值
  // （onLoad 早于渲染，lc-renderer 挂载时 PageController 一次性读取 options）
  options.urlParams = { ...(opt ?? {}) }
  showPerf.value = opt?.perf === '1'
  const id = typeof opt?.pageId === 'string' ? opt.pageId : ''
  if (!id) {
    error.value = '缺少 pageId 参数'
    loading.value = false
    return
  }
  pageId.value = id
  rid.value = typeof opt?.rid === 'string' ? opt.rid : ''
  // 批 3 D-P3-7：表单草稿（key 含 pageId + 当前用户；list/detail 不经 lc-renderer，
  // 常驻注入无害 —— controller 只在 lc-renderer 分支被构造时才会触碰 draft）
  options.draft = createUniDraft(id)
  // 批 5：上报器先于请求创建 —— Schema 加载失败本身也要留现场
  reporter?.dispose()
  opsMeta.pageId = id
  opsMeta.pageVersion = undefined
  reporter = createUniOpsReporter(opsMeta)
  void load(id)
})

// 批 5：离开页面时把队列里剩余事件发出去（H5 刷新/切后台容易丢，尽力而为）
onHide(() => {
  void reporter?.flush()
})
onUnload(() => {
  const r = reporter
  reporter = null
  if (r) {
    void r.flush()
    r.dispose()
  }
})

/** 标准页（list/detail）事件：跳转低代码页（rid 等 params 透传为路由参数） */
function onNavigate(target: { pageId: string; params: Record<string, unknown> }): void {
  const usp = new URLSearchParams()
  usp.set('pageId', target.pageId)
  for (const [k, v] of Object.entries(target.params)) {
    if (v !== undefined && v !== null) usp.set(k, String(v))
  }
  uni.navigateTo({ url: `/pages/view/index?${usp.toString()}` })
}

/**
 * §5 状态出口：本页与子标准页（list/detail）共用。
 *   no-auth    → 跳登录（带回跳，登录后回到本页）
 *   forbidden  → 回菜单（越权操作已由上层隐藏，这里只给出口）
 *   其他        → 重试本页加载
 */
function onStateAction(kind?: StateKind): void {
  if (kind === 'forbidden') {
    goMenu()
    return
  }
  if (kind === 'no-auth') {
    goLogin()
    return
  }
  void load(pageId.value)
}

/** 子标准页上抛的状态出口（list/detail 内部只做本地重试，401/403 才上抛到这里） */
function onChildStateAction(kind: StateKind): void {
  onStateAction(kind)
}

/** 详情页返回：历史栈回列表；栈底兜底回菜单（不静默卡死） */
function onBack(): void {
  uni.navigateBack({
    delta: 1,
    fail: () => void uni.redirectTo({ url: '/pages/index/index' }),
  })
}

/** 门户卡片外链（配 url 时）：H5 开新窗；其他端提示不支持（端能力不静默失败） */
function onOpenUrl(url: string): void {
  const w = globalThis as unknown as { open?: (u: string, target?: string) => void }
  if (typeof w.open === 'function') {
    w.open(url, '_blank')
    return
  }
  uni.showToast({ title: '当前端暂不支持打开外部链接', icon: 'none' })
}

async function load(pageId: string): Promise<void> {
  loading.value = true
  error.value = ''
  rawError.value = null
  perfText.value = ''
  const started = Date.now()
  try {
    const data = await fetchPageSchema(pageId)
    const schemaMs = Date.now() - started
    // 版本号回填到共享上下文（之后所有事件都带版本，便于区分草稿/已发布现场）
    opsMeta.pageVersion = data.version
    schema.value = data.schema as unknown as PageSchema
    const name = typeof data.schema.name === 'string' ? data.schema.name : pageId
    uni.setNavigationBarTitle({ title: name })
    // 先关骨架屏再等下一帧：首帧渲染本身也是耗时的一部分
    loading.value = false
    await nextTick()

    const renderMs = Date.now() - started - schemaMs
    const schemaRoot = (data.schema as { root?: unknown }).root
    const stats = rendererRef.value?.controller?.stats
    const nodes = stats?.nodeCount ?? countNodes(schemaRoot)

    // 批 5 DoD：加载 / 渲染耗时上报，可经 `GET /ops/summary` 回读
    reporter?.perf('schema-load', schemaMs, { version: data.version, nodes })
    reporter?.perf('render', renderMs, {
      nodes,
      buildMs: stats?.buildMs,
      mountMs: stats?.mountMs,
    })

    if (showPerf.value) {
      perfText.value = formatPerf({
        schemaMs,
        buildMs: stats?.buildMs,
        renderMs,
        // 采样发生在首帧 nextTick，异步 onMount 可能尚未结束 → 0 视为「未采到」不展示
        mountMs: stats?.mountMs || undefined,
        nodes,
      })
      console.info('[lc-perf]', perfText.value)
    }
  } catch (e) {
    // §5：分类决定「状态 + 标题 + 说明 + 出口」，不再手工拼字符串
    rawError.value = e
    error.value = e instanceof Error ? e.message : '页面加载失败'
    if (e instanceof ApiError && e.status === 401) {
      // 兼容旧调用方：needLogin 语义由 classifyError 的 'no-auth' 承担
      error.value = '登录已过期，请重新登录'
    }
    reporter?.error('schema-load', error.value, {
      pageId,
      status: e instanceof ApiError ? e.status : undefined,
      code: e instanceof ApiError ? e.code : undefined,
    })
  } finally {
    loading.value = false
  }
}

function userOptions(): Record<string, unknown> {
  const u = getUser()
  return u ? { name: displayName(u), username: u.username, roles: u.roles } : {}
}

function goMenu(): void {
  uni.redirectTo({ url: '/pages/index/index' })
}

function goLogin(): void {
  const back = encodeURIComponent(`/pages/view/index?pageId=${pageId.value}`)
  uni.redirectTo({ url: `/pages/login/index?redirect=${back}` })
}
</script>

<style scoped>
.view {
  min-height: 100vh;
}
/* 状态视图统一走共享组件 lc-state-view（§5），本页只留壳层特有的样式 */

/* 批 5 Profiler 角标（`?perf=1`）：右下角只读浮层，pointer-events 关闭不挡交互 */
.view__perf {
  position: fixed;
  right: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom));
  z-index: 999;
  max-width: 80vw;
  padding: 4px 8px;
  border-radius: 6px;
  /* 反色叠层：浅色下 = neutral-800 深底白字，暗色下翻转为浅底深字（与 tooltip 反色语义一致） */
  background: var(--lc-bg-inverse);
  color: var(--lc-text-inverse);
  font-size: 11px;
  line-height: 16px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  pointer-events: none;
}
</style>
