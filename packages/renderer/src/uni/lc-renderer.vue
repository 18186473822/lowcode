<!--
  lc-renderer.vue —— 页面渲染器

  职责：持有 PageController，负责
   ① 挂载时跑 onMount 生命周期
   ② 数据变更后重新 resolve 并驱动视图更新
   ③ 页面卸载时 dispose
   ④ **设计态（D-A2）**：mode='design' 时 provide 设计状态（选中 id）并向上转发 select 事件

  与 @lc/renderer core 层的边界：本文件不含任何业务规则，只做生命周期与响应式接线。
  mode 缺省 'runtime' —— 现有 uni 工程与测试零行为变化。
-->
<template>
  <view class="lc-renderer">
    <lc-node
      v-for="(node, i) in nodes"
      :key="node.node.id + '-' + i"
      :model="node"
      :controller="controller"
      @change="onTreeChange"
      @select="emit('select', $event)"
    />
    <view v-if="nodes.length === 0" class="lc-renderer__empty">页面加载中…</view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, provide, reactive, shallowRef, watch } from 'vue'
import type { PageSchema } from '@lc/schema'
import { PageController, type PageControllerOptions, type ResolvedNode } from '@lc/renderer'
import { LC_FLOW_HOST_KEY, type LcFlowHost } from '@lc/materials'
import LcNode from './lc-node.vue'
import { LC_DESIGN_KEY, type DesignState } from './design'

const props = defineProps<{
  schema: PageSchema
  options: PageControllerOptions
  /** 'runtime'（缺省，生产渲染）| 'design'（画布：选中遮罩 + select 事件 + 动作拦截） */
  mode?: 'runtime' | 'design'
  /** design 态受控选中 id（宿主把 store.selectedId 同步回来；缺省 ''）。runtime 忽略 */
  selectedId?: string
}>()

const emit = defineEmits<{
  /** design 态：节点被点选（id 为节点 id，根为 root） */
  select: [nodeId: string]
}>()

/** design 态共享状态；runtime 为 null（lc-node 以 v-if="design" 判定） */
const designState: DesignState | null =
  props.mode === 'design' ? reactive<DesignState>({ selectedId: props.selectedId ?? '' }) : null
provide(LC_DESIGN_KEY, designState)

/**
 * 审批类物料数据通道（批 2 D-P3-4）：RuntimeHost.request 与 LcFlowHost 结构兼容，断言即给 ——
 * design/runtime 双态都提供（画布 recordId 恒空 → 物料占位不请求，安全）。
 */
provide(LC_FLOW_HOST_KEY, props.options.host as LcFlowHost)

/** controller 随 schema 重建（B-24：PageController 构造期 buildTree 为 readonly，schema 整树替换必须重建） */
const controller = shallowRef(new PageController(props.schema, props.options))
const nodes = ref<ResolvedNode[]>([])

function refresh(): void {
  nodes.value = controller.value.resolve()
}

function onTreeChange(): void {
  refresh()
}

/**
 * schema 整树替换（设计器经 schema-ops 纯函数产出新树）→ dispose 旧 controller、按新树重建并重跑生命周期。
 * 批 1 起 schema 从未变过，此链路缺失被掩盖（B-24）；组件测试加回归用例锁死。
 */
watch(() => props.schema, async (next) => {
  controller.value.dispose()
  controller.value = new PageController(next, props.options)
  refresh()
  await controller.value.onMount()
  refresh()
})

/** design 受控选中：宿主 selectedId → 遮罩选中样式（与 select 上抛构成受控环，同值赋值不成环） */
watch(
  () => props.selectedId,
  (v) => {
    if (designState) designState.selectedId = v ?? ''
  },
)

onMounted(async () => {
  refresh()
  await controller.value.onMount()
  refresh()
  await nextTick()
})

onUnmounted(() => {
  controller.value.dispose()
})

defineExpose({ controller, refresh, designState })
</script>
