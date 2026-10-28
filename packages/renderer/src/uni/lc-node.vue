<!--
  lc-node.vue —— 递归节点渲染器。

  职责：把 ResolvedNode 分发给对应物料组件。
  关键点：微信小程序不支持 <component :is>，因此必须用 **v-if 链静态分发**。

  本组件只做「数据搬运」，不含业务逻辑 —— 逻辑全部在 @lc/renderer 的 core 层（已单测覆盖）。
  物料事件契约（已 H5 实测 + test/uni 固化）：
    - 表单字段：物料 emit('update', { name, value }) → setField → 联动/校验 → emit('change') 冒泡
    - 按钮类：物料 emit('click') → handleEvent('click', node.actions)
-->
<template>
  <view v-if="model.visible" class="lc-node" :class="{ 'lc-node--design': !!design }">
    <!-- 设计态选中遮罩（D-A2）：盖住本节点内容；子节点遮罩 DOM 在后叠于其上，点击天然命中最深层 -->
    <view
      v-if="design"
      class="lc-node__mask"
      :data-node-id="model.node.id"
      :class="{ 'lc-node__mask--selected': design.selectedId === model.node.id }"
      role="button"
      :aria-label="`选择节点 ${model.node.id}`"
      @click.stop="onSelect"
    />
    <!-- 展示类 -->
    <template v-if="material === 'Text'">
      <lc-text v-bind="bindProps" />
    </template>
    <template v-else-if="material === 'Image'">
      <lc-image v-bind="bindProps" />
    </template>
    <template v-else-if="material === 'Divider'">
      <lc-divider v-bind="bindProps" />
    </template>
    <!-- 表单类（统一 error 透传 + update 契约） -->
    <template v-else-if="material === 'Input'">
      <lc-input v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Textarea'">
      <lc-textarea v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'NumberInput'">
      <lc-number-input v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Radio'">
      <lc-radio v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Select'">
      <lc-select v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Switch'">
      <lc-switch v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Upload'">
      <lc-upload v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <!-- 反馈类 -->
    <template v-else-if="material === 'Button'">
      <lc-button v-bind="bindProps" @click="onTap" />
    </template>
    <!-- 表单类二期（Phase 2 批 3：FieldType 全集映射，契约同表单类一期） -->
    <template v-else-if="material === 'DatePicker'">
      <lc-date-picker v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'DateTimePicker'">
      <lc-date-time-picker v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'MoneyInput'">
      <lc-money-input v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Checkbox'">
      <lc-checkbox v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Picker'">
      <lc-picker v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'UserPicker'">
      <lc-user-picker v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'DeptPicker'">
      <lc-dept-picker v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Cascader'">
      <lc-cascader v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'FileUpload'">
      <lc-file-upload v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <template v-else-if="material === 'Rate'">
      <lc-rate v-bind="bindProps" :error="model.error" @update="onChange" />
    </template>
    <!-- 数据 / 导航 / 展示类（Phase 2 批 3） -->
    <template v-else-if="material === 'SearchBar'">
      <lc-search-bar v-bind="bindProps" @update="onChange" />
    </template>
    <template v-else-if="material === 'Detail'">
      <lc-detail v-bind="bindProps" />
    </template>
    <template v-else-if="material === 'Cell'">
      <lc-cell v-bind="bindProps" @click="onTap" />
    </template>
    <template v-else-if="material === 'List'">
      <lc-list v-bind="bindProps" @item-click="onItemEvent('itemClick', $event)" />
    </template>
    <template v-else-if="material === 'Tabs'">
      <lc-tabs v-bind="bindProps" @switch="onItemEvent('switch', $event)" />
    </template>
    <template v-else-if="material === 'Tag'">
      <lc-tag v-bind="bindProps" />
    </template>
    <template v-else-if="material === 'Icon'">
      <lc-icon v-bind="bindProps" />
    </template>
    <template v-else-if="material === 'Progress'">
      <lc-progress v-bind="bindProps" />
    </template>
    <!-- 业务审批类（Phase 3 批 2：ApprovalBar / Timeline） -->
    <template v-else-if="material === 'ApprovalBar'">
      <lc-approval-bar v-bind="bindProps" @decided="onItemEvent('decided', $event)" />
    </template>
    <template v-else-if="material === 'Timeline'">
      <lc-timeline v-bind="bindProps" />
    </template>
    <!-- 图表 / 指标卡（Phase 3 批 4：纯 SVG 图表 + 指标卡，data 组） -->
    <template v-else-if="material === 'Chart'">
      <lc-chart v-bind="bindProps" />
    </template>
    <template v-else-if="material === 'Statistic'">
      <lc-statistic v-bind="bindProps" />
    </template>
    <!-- 门户组件库（2026-10-28 批 2）：轮播 / 公告条 / 数据卡 / 待办列表 -->
    <template v-else-if="material === 'PortalBanner'">
      <lc-portal-banner v-bind="bindProps" @item-click="onItemEvent('itemClick', $event)" />
    </template>
    <template v-else-if="material === 'PortalNotice'">
      <lc-portal-notice v-bind="bindProps" @item-click="onItemEvent('itemClick', $event)" />
    </template>
    <template v-else-if="material === 'PortalStat'">
      <lc-portal-stat v-bind="bindProps" />
    </template>
    <template v-else-if="material === 'PortalTodo'">
      <lc-portal-todo v-bind="bindProps" @item-click="onItemEvent('itemClick', $event)" />
    </template>
    <!-- 带标题容器：自身渲染分组头，children 走下方统一递归 -->
    <template v-else-if="material === 'FormGroup'">
      <view class="lc-node__group">
        <view v-if="groupTitle" class="lc-node__group-head">
          <text class="lc-node__group-title">{{ groupTitle }}</text>
          <text v-if="model.props.required" class="lc-node__group-required">*</text>
        </view>
      </view>
    </template>
    <template v-else-if="isContainer">
      <!-- 纯容器（Page/View/Group）：自身不产出 UI，仅承载 children 递归 -->
    </template>
    <template v-else>
      <!-- 未注册物料：占位并提示，避免整页白屏 -->
      <view class="lc-node__unknown">未知组件：{{ material }}</view>
    </template>

    <!-- 子节点递归渲染；@change 必须逐层冒泡到 lc-renderer（否则嵌套节点改值后视图不刷新，B-19）；
         @select 同理（否则点子节点选不中 —— 组件测试回归用例锁死） -->
    <lc-node
      v-for="(child, i) in model.children"
      :key="child.node.id + '-' + i"
      :model="child"
      :controller="controller"
      @change="emit('change')"
      @select="emit('select', $event)"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ResolvedNode, PageController } from '@lc/renderer'
import { LC_DESIGN_KEY } from './design'

const props = defineProps<{
  model: ResolvedNode
  controller: PageController
}>()

/** design 态共享状态（lc-renderer provide）；null = runtime（无遮罩、动作正常执行） */
const design = inject(LC_DESIGN_KEY, null)

/** componentName（协议 4 章：首字母大写） */
const material = computed(() => props.model.node.componentName)

/** 纯容器类组件：只承载 children 递归，不产出自身 UI（root 的 Page 由此分支消化） */
const CONTAINERS = ['Page', 'View', 'Group']
const isContainer = computed(() => CONTAINERS.includes(material.value))

/** FormGroup 分组头文案（title 优先，兼容 label） */
const groupTitle = computed(() => {
  const p = props.model.props as Record<string, unknown>
  const t = p['title'] ?? p['label']
  return t == null ? '' : String(t)
})

/**
 * 物料实绑 props（D-P2-13 受控回显兜底）：
 * 绑定字段（props.name）的物料若未显式配置 `props.value`，自动以 `formData[name]` 作受控值 ——
 * 严格受控物料（Picker/Select/DatePicker 等按 value 反查显示）由此拿到回显值；
 * value 显式配置（含 `$expr:` 表达式）时原样透传，不受兜底影响。
 * design 态 formData 恒为空 → 恒原样透传，画布行为不变。
 */
const bindProps = computed(() => {
  const p = props.model.props as Record<string, unknown>
  if (p['value'] !== undefined) return p
  const name = p['name'] as string | undefined
  if (!name) return p
  const v = props.controller.getField?.(name)
  return v === undefined ? p : { ...p, value: v }
})

/** 表单字段变更：写入 context，触发联动 + 校验，上层重新 resolve */
function onChange(payload: { name?: string; value?: unknown }): void {
  const name = payload.name ?? (props.model.props['name'] as string | undefined)
  if (!name) return
  props.controller.setField(name, payload.value)
  emit('change')
}

/** 按钮类交互：转发节点上绑定的动作（design 态由遮罩拦截，此 guard 为兜底） */
async function onTap(): Promise<void> {
  if (design) return
  await props.controller.handleEvent('click', props.model.node.actions, {
    scope: props.controller.scope,
  })
  emit('change')
}

/** 带载荷的物料事件（List itemClick / Tabs switch）：载荷以 `eventData` 注入表达式作用域 */
async function onItemEvent(event: string, payload: unknown): Promise<void> {
  if (design) return
  await props.controller.handleEvent(event, props.model.node.actions, {
    scope: { ...props.controller.scope, eventData: payload },
  })
  emit('change')
}

/** design 态点选：写共享选中态 + 向上冒泡（外部设计器同步 selectedId） */
function onSelect(): void {
  if (!design) return
  design.selectedId = props.model.node.id
  emit('select', props.model.node.id)
}

const emit = defineEmits<{ change: []; select: [nodeId: string] }>()
</script>

<style scoped>
.lc-node--design {
  /* design 态提供遮罩定位上下文（runtime 不加 position，零回归） */
  position: relative;
}
.lc-node__mask {
  position: absolute;
  inset: 0;
  z-index: 1;
  /* 1px 而非 1rpx(0.5px)：描边是这里唯一的信息载体，太虚会看不清 */
  border: var(--lc-border-width) solid transparent;
  box-sizing: border-box;
  pointer-events: auto;
  transition: border-color var(--lc-duration-fast) var(--lc-ease-standard);
}

/* ⚠️ 悬停 / 选中都**只描边、绝不填色**。
   遮罩是 inset:0 盖在组件内容之上的（z-index 1），一旦给 background，
   整块组件就被底色糊住 —— 曾用 action-primary-subtle（近白），
   表现就是「指针移到物料上那块变白」。 */
.lc-node__mask:hover {
  border-color: var(--lc-brand-400);
}

/* 选中：主色 2px 描边，比悬停重一档。
   特异度与 :hover 相同（都是两个类），故必须排在后面，并显式覆盖 --selected:hover，
   否则悬停已选中的节点会被降级成浅色细边。 */
.lc-node__mask.lc-node__mask--selected,
.lc-node__mask.lc-node__mask--selected:hover {
  border: 2px solid var(--lc-action-primary);
}
/* 拖拽幽灵态：由画布在拖起时用 classList 加到源节点上，位移走 CSS 变量
   （--lc-drag-dx/dy），故本组件不需要知道拖拽状态，也不必新增 prop。
   pointer-events:none 是必须的 —— 幽灵跟着指针跑，能命中就会挡住下层、也会干扰落点判定。 */
.lc-node--dragging {
  position: relative;
  z-index: 50;
  /* 0.9 而非半透明：太透会与下层内容叠在一起发糊；"浮起"靠阴影与 z-index，不靠透明度 */
  opacity: 0.9;
  transform: translate(var(--lc-drag-dx, 0px), var(--lc-drag-dy, 0px));
  border-radius: var(--lc-radius-sm);
  outline: 1px dashed var(--lc-action-primary);
  box-shadow: var(--lc-shadow-e3);
  pointer-events: none;
}
.lc-node__group {
  padding: var(--lc-space-1) 0 0;
}
.lc-node__group-head {
  display: flex;
  align-items: center;
  padding: var(--lc-space-2) var(--lc-space-3) var(--lc-space-1);
}
.lc-node__group-title {
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-node__group-required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-node__unknown {
  margin: var(--lc-space-2) var(--lc-space-3);
  padding: var(--lc-space-3);
  border: 1rpx dashed var(--lc-status-danger);
  border-radius: var(--lc-radius-sm);
  color: var(--lc-status-danger);
  font-size: var(--lc-font-body-sm);
  text-align: center;
}
</style>
