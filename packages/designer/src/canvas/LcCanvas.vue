<!--
  LcCanvas.vue —— 设计器画布（designer-plan §5 批 1 + 批 2 DnD）

  职责：
   ① 375px 手机壳容器（主方案 6.2 布局；rpx 换算基准 375/750 → ×0.5，由 vite 插件处理）
   ② 包装 `<lc-renderer mode="design">`：渲染 schema + 转发 select 事件给设计器状态
   ③ design 态的动作/交互拦截、选中遮罩都在 renderer 内部（D-A2），画布不重复实现
   ④ 批 2：拖放接收 —— dragover 实时算锚点（core/anchor 纯函数）→ fixed 指示线 →
      drop 解析来源（material / node）后 emit 给宿主（宿主接 store 的 insert/move actions）
-->
<template>
  <div
    ref="rootRef"
    class="lc-canvas"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="lc-canvas__stage" :style="zoomStyle">
      <div class="lc-canvas__device" :style="deviceStyle">
        <lc-renderer
          :schema="schema"
          :options="options"
          mode="design"
          :selected-id="selectedId"
          @select="onSelect"
        />
        <!-- 参考线（§7.1）：画布内容区中线，纯视觉辅助，不拦截指针 -->
        <div v-if="guides" class="lc-canvas__guides" data-testid="canvas-guides" aria-hidden="true">
          <i class="lc-canvas__guide lc-canvas__guide--v" />
          <i class="lc-canvas__guide lc-canvas__guide--h" />
        </div>
      </div>
    </div>
    <!-- 插入指示线：before/after = 2px 横线；into = 目标虚线框（fixed 定位直接用视口坐标） -->
    <div
      v-if="hint && hintStyle"
      class="lc-canvas__hint"
      :class="{ 'lc-canvas__hint--into': hint.hit.position === 'into' }"
      :style="hintStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PageSchema } from '@lc/schema'
import { countNodes, type PageControllerOptions } from '@lc/renderer'
import LcRenderer from '@lc/renderer/uni/lc-renderer.vue'
import { META_MAP } from '@lc/materials'
import { installEnhancer } from '../shim/enhance'
import { findNode } from '../core/schema-ops'
import { computeAnchor, type AnchorRect, type AnchorHit } from '../core/anchor'
import { LC_MATERIAL_MIME, LC_NODE_MIME, type DragSource } from '../core/dnd'

const props = defineProps<{
  schema: PageSchema
  options: PageControllerOptions
  /** design 受控选中 id（宿主 store.selectedId → 画布遮罩选中样式同步） */
  selectedId?: string
  /** 设备档位（§7.1 画布工具条）：`375` 手机 / `750` 平板 / `h5` 浏览器 */
  device?: '375' | '750' | 'h5'
  /** 视图缩放百分比（100 = 原始尺寸） */
  zoom?: number
  /** 参考线（§7.1「标尺 · 参考线」共用同一开关）：内容区中心十字虚线 */
  guides?: boolean
}>()

const emit = defineEmits<{
  /** 节点被点选（供 store.selectedId 同步） */
  select: [nodeId: string]
  /** 拖放完成（宿主分发到 store.insertMaterial / store.moveByDrop） */
  drop: [payload: { source: DragSource; hit: AnchorHit }]
  /** 批 5 Profiler：每次渲染完成回传耗时与节点数（宿主顶栏徽标） */
  rendered: [payload: { ms: number; nodes: number }]
}>()

const rootRef = ref<HTMLElement | null>(null)
let disposeEnhancer: (() => void) | null = null

/* ---------------- 设备档位与缩放（§7.1 画布工具条） ---------------- */

/**
 * 设备壳宽度：375 / 750 固定；h5 = 撑满画布区（上限 720，避免超宽行）。
 * 注意：rpx→px 的换算基准固定在 375（vite 插件按 375/750 → ×0.5），
 * 因此 750 档是「宽屏占位预览」—— 内容绝对尺寸不随之放大，用来评估横向余量。
 */
const deviceStyle = computed<Record<string, string>>(() => {
  if (props.device === 'h5') return { width: '100%', maxWidth: '720px' }
  return { width: props.device === '750' ? '750px' : 'var(--lc-device-w)' }
})

/** 缩放用 transform：不改布局盒，画布滚动区仍按原尺寸算 —— 符合「预览」语义 */
const zoomStyle = computed<Record<string, string> | undefined>(() => {
  const z = props.zoom ?? 100
  return z === 100 ? undefined : { transform: `scale(${z / 100})`, transformOrigin: 'top center' }
})

/* ---------------- 选中（批 1） ---------------- */

function onSelect(nodeId: string): void {
  emit('select', nodeId)
}

/* ---------------- 拖放（批 2） ---------------- */

interface DropHint {
  hit: AnchorHit
  /** 目标节点的视口矩形（画指示线用；取不到则不画） */
  rect: { top: number; left: number; width: number; height: number } | null
}

const hint = ref<DropHint | null>(null)

/**
 * 收集画布内全部节点矩形（遮罩元素带 data-node-id）。
 * isContainer 经 schema → META_MAP 判定（Page/FormGroup）——DOM 上没有容器标记，不猜。
 */
function collectRects(): AnchorRect[] {
  const root = rootRef.value
  if (!root) return []
  const out: AnchorRect[] = []
  for (const el of root.querySelectorAll('[data-node-id]')) {
    const nodeId = el.getAttribute('data-node-id')
    if (!nodeId) continue
    const r = el.getBoundingClientRect()
    const node = findNode(props.schema, nodeId)
    out.push({
      nodeId,
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      isContainer: !!(node && META_MAP[node.componentName]?.isContainer),
    })
  }
  return out
}

function onDragOver(e: DragEvent): void {
  e.preventDefault() // 必须 preventDefault 才允许 drop
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  const rects = collectRects()
  const hit = computeAnchor({ x: e.clientX, y: e.clientY }, rects, {
    rootId: props.schema.root.id,
  })
  if (!hit.nodeId) {
    hint.value = null
    return
  }
  const target = rects.find((r) => r.nodeId === hit.nodeId)
  hint.value = { hit, rect: target?.rect ?? null }
}

function onDragLeave(e: DragEvent): void {
  // 子元素间移动也会冒泡 dragleave —— 仅在真的离开画布时清除
  const next = e.relatedTarget as Node | null
  if (!next || !rootRef.value?.contains(next)) hint.value = null
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  const hit = hint.value?.hit
  hint.value = null
  if (!hit || !hit.nodeId) return
  const material = e.dataTransfer?.getData(LC_MATERIAL_MIME)
  const nodeId = e.dataTransfer?.getData(LC_NODE_MIME)
  if (material) emit('drop', { source: { kind: 'material', name: material }, hit })
  else if (nodeId) emit('drop', { source: { kind: 'node', id: nodeId }, hit })
}

/** 拖到画布外松手等场景：dragend 兜底清指示线（dragend 在拖拽源上触发） */
function onAnyDragEnd(): void {
  hint.value = null
}

/* ---------------- 自研 mouse 拖拽：画布内节点换位（B-25） ----------------
 * SVG view 上的 HTML5 DnD 实测：dragstart 会 fire，但浏览器/CDP 不建立拖拽会话
 * （dragover/drop 全缺）→ 节点换位改为标准 mouse 手势（mousedown/move/up），
 * 事件层 100% 标准、不受 SVG DnD 支持差异影响。物料拖入仍走 HTML5 DnD（HTML 源已验证）。
 * 与 click 选中的互斥：位移 < 4px 不进入拖拽（click 正常选中）；超过阈值武装后
 * 吞掉随后的 click（防拖后误选）。
 */

interface MouseSession {
  sourceId: string
  startX: number
  startY: number
  /** 已越过位移阈值进入拖拽态 */
  armed: boolean
}

let session: MouseSession | null = null
let suppressClick = false

/** 与 HTML5 DnD 的 dragover 同款锚点计算 → 共用 hint */
function updateHintAt(x: number, y: number): void {
  const rects = collectRects()
  const hit = computeAnchor({ x, y }, rects, { rootId: props.schema.root.id })
  if (!hit.nodeId) {
    hint.value = null
    return
  }
  const target = rects.find((r) => r.nodeId === hit.nodeId)
  hint.value = { hit, rect: target?.rect ?? null }
}

function onMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return
  const el = (e.target as Element | null)?.closest?.('[data-node-id]') ?? null
  const sourceId = el?.getAttribute('data-node-id')
  if (!sourceId) return
  // 新会话开始：清上一轮残留的 click 抑制（拖后 click 未派发的场景靠这里兜底）
  suppressClick = false
  session = { sourceId, startX: e.clientX, startY: e.clientY, armed: false }
}

function onMouseMove(e: MouseEvent): void {
  if (!session) return
  if (!session.armed) {
    const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY)
    if (dist < 4) return // 阈值内视为点击，不进入拖拽
    session.armed = true
    suppressClick = true
  }
  updateHintAt(e.clientX, e.clientY)
}

function onMouseUp(): void {
  if (!session) return
  const s = session
  session = null
  if (!s.armed) return // 未武装：这是普通点击，交给遮罩 click → 选中
  const hit = hint.value?.hit
  hint.value = null
  // suppressClick 由 click capture 消费；click 未派发（源/目标不同元素）的残留由下一次 mousedown 重置
  if (hit && hit.nodeId && hit.nodeId !== s.sourceId) {
    emit('drop', { source: { kind: 'node', id: s.sourceId }, hit })
  }
}

/** 拖拽武装期间吞掉 click（capture 阶段先于遮罩的 select 处理） */
function onClickCapture(e: MouseEvent): void {
  if (!suppressClick) return
  suppressClick = false
  e.stopPropagation()
  e.stopImmediatePropagation()
}

const hintStyle = computed(() => {
  const h = hint.value
  if (!h?.rect) return undefined
  const { rect, hit } = h
  if (hit.position === 'into') {
    return { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` }
  }
  const top = (hit.position === 'before' ? rect.top : rect.top + rect.height) - 1
  return { top: `${top}px`, left: `${rect.left}px`, width: `${rect.width}px` }
})

/* ---------------- 生命周期 ---------------- */

/**
 * 批 5 D-P3-14：渲染耗时采样。
 * watch（pre flush）+ nextTick → 覆盖「schema 变化 → 组件重建 → DOM 更新」这一段；
 * onMounted 首帧也采一次（设计器首开页面）。采样本身不阻塞渲染（fire-and-forget）。
 */
async function reportRendered(): Promise<void> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  await nextTick()
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  emit('rendered', { ms: t1 - t0, nodes: countNodes(props.schema.root) })
}

watch(
  () => props.schema,
  () => {
    void reportRendered()
  },
)

onMounted(() => {
  void reportRendered()
  // 直出型标签（image/switch）的运行时增强（B-22）；observer 自动覆盖异步渲染的内容
  if (rootRef.value) disposeEnhancer = installEnhancer(rootRef.value)
  document.addEventListener('dragend', onAnyDragEnd)
  // 自研 mouse 拖拽（B-25）：mousedown 在画布根（冒泡自遮罩），move/up 挂 window 跟踪出界
  rootRef.value?.addEventListener('mousedown', onMouseDown)
  rootRef.value?.addEventListener('click', onClickCapture, true)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  disposeEnhancer?.()
  disposeEnhancer = null
  document.removeEventListener('dragend', onAnyDragEnd)
  rootRef.value?.removeEventListener('mousedown', onMouseDown)
  rootRef.value?.removeEventListener('click', onClickCapture, true)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>

<style scoped>
/* 令牌来源：@lc/designer/tokens.css（宿主 apps/designer-web 引入）；本文件不出现硬编码色值 */
.lc-canvas {
  flex: 1;
  overflow: auto;
  background: var(--lc-bg-canvas);
  padding: var(--lc-space-6);
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.lc-canvas__stage {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
}
.lc-canvas__device {
  position: relative;
  min-height: var(--lc-device-min-h);
  background: var(--lc-canvas-shell);
  border-radius: var(--lc-device-radius);
  box-shadow: var(--lc-shadow-e3);
  overflow: hidden;
}
/* 参考线：虚线（比实线更不抢注意力），brand-400 在亮暗下都可见 */
.lc-canvas__guides {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}
.lc-canvas__guide {
  position: absolute;
  opacity: 0.7;
}
.lc-canvas__guide--v {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background-image: repeating-linear-gradient(
    to bottom,
    var(--lc-brand-400) 0 4px,
    transparent 4px 8px
  );
}
.lc-canvas__guide--h {
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background-image: repeating-linear-gradient(
    to right,
    var(--lc-brand-400) 0 4px,
    transparent 4px 8px
  );
}

/* 指示线：fixed（视口坐标 = getBoundingClientRect 坐标系），不随画布滚动错位的前提是
   拖拽期间画布不滚动（MVP 未做拖拽自动滚动，Phase 2） */
.lc-canvas__hint {
  position: fixed;
  pointer-events: none;
  z-index: 60;
}
.lc-canvas__hint--into {
  border: 2px dashed var(--lc-drag-hint);
  background: var(--lc-drag-hint-bg);
  box-sizing: border-box;
}
/* :not(--into) 单独一类：横线只在非 into 时出现（into 由上面的框样式接管） */
.lc-canvas__hint:not(.lc-canvas__hint--into) {
  height: 2px;
  background: var(--lc-drag-hint);
  border-radius: 1px;
}
</style>
