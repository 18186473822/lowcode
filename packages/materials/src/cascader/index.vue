<!--
  Cascader 物料 —— 级联选择（Phase 2 批 3，对齐 FieldType `relation` 与方案缺口清单「级联」项）。
  接口对齐 lc-node：`<lc-cascader v-bind="model.props" :error="model.error" @change="onChange" />`
   - value: Array<string|number>（受控，各级选中 value 的路径，如 ['gd','sz']）
   - options: 树 `{label, value, children?}[]`（省市区/多级组织等自定义数据；内置数据集不做，见台账未做项）
   - 实现为**逐级 picker 链**（每级一个 uni `<picker>`，动态层级）——picker-view 无设计器 shim，
     逐级 picker 双端（H5 运行时 + PC PickerShim）行为一致
-->
<template>
  <view class="lc-cascader">
    <view v-if="label" class="lc-cascader__label-row">
      <text class="lc-cascader__label">{{ label }}</text>
      <text v-if="required" class="lc-cascader__required">*</text>
    </view>
    <view
      class="lc-cascader__row"
      :class="{ 'lc-cascader__row--error': !!error, 'lc-cascader__row--disabled': disabled }"
    >
      <template v-for="(nodes, level) in levels" :key="level">
        <text v-if="level > 0" class="lc-cascader__sep">›</text>
        <picker :range="labelsOf(nodes)" :value="path[level] ?? 0" :disabled="disabled" @change="onChange(level, $event)">
          <view class="lc-cascader__level">
            <text :class="path[level] !== undefined ? 'lc-cascader__value' : 'lc-cascader__placeholder'">
              {{ path[level] !== undefined ? labelsOf(nodes)[path[level]] : '请选择' }}
            </text>
          </view>
        </picker>
      </template>
    </view>
    <view v-if="error" class="lc-cascader__error">
      <text>{{ error }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface CascaderNode {
  label: string
  value: string | number
  children?: CascaderNode[]
}

const props = defineProps<{
  name?: string
  label?: string
  value?: unknown
  options?: CascaderNode[]
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const optionList = computed<CascaderNode[]>(() => (Array.isArray(props.options) ? props.options : []))

/** 各级选中的下标路径（内部态；受控 value 反查初始化） */
const path = ref<number[]>([])

function syncFromValue(): void {
  if (!Array.isArray(props.value) || props.value.length === 0) {
    path.value = []
    return
  }
  const idxs: number[] = []
  let nodes = optionList.value
  for (const v of props.value as Array<string | number>) {
    const i = nodes.findIndex((n) => n.value === v)
    if (i < 0) break
    idxs.push(i)
    nodes = nodes[i]?.children ?? []
  }
  path.value = idxs
}

watch(() => props.value, syncFromValue, { immediate: true })

/** 渲染层级 = 已选深度 + 1（末级为当前可选层） */
const levels = computed<CascaderNode[][]>(() => {
  const arr: CascaderNode[][] = []
  let nodes = optionList.value
  for (let i = 0; i <= path.value.length; i++) {
    arr.push(nodes)
    nodes = nodes[path.value[i]]?.children ?? []
  }
  return arr
})

function labelsOf(nodes: CascaderNode[]): string[] {
  return (nodes ?? []).map((n) => String(n.label))
}

/** 沿路径取第 level 级的节点 */
function nodeAt(level: number): CascaderNode | undefined {
  let nodes = optionList.value
  let node: CascaderNode | undefined
  for (let i = 0; i <= level; i++) {
    node = nodes[path.value[i]]
    if (!node) return undefined
    nodes = node.children ?? []
  }
  return node
}

function onChange(level: number, e: unknown): void {
  const d = (e as { detail?: { value?: number } }).detail
  const idx = d?.value ?? 0
  path.value = [...path.value.slice(0, level), idx]
  const values = path.value.map((_, i) => nodeAt(i)?.value).filter((v): v is string | number => v !== undefined)
  emit('update', { name: props.name, value: values })
}
</script>

<style scoped>
.lc-cascader {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-cascader__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-cascader__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-cascader__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-cascader__row {
  display: flex;
  align-items: center;
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
  padding: var(--lc-space-2) 20rpx;
  min-height: 44rpx;
}
.lc-cascader__row--error {
  border-color: var(--lc-status-danger);
}
.lc-cascader__row--disabled {
  background: var(--lc-bg-canvas);
}
.lc-cascader__level {
  padding: 0 var(--lc-space-1);
}
.lc-cascader__value {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-cascader__placeholder {
  font-size: var(--lc-font-body);
  color: var(--lc-input-placeholder);
}
.lc-cascader__sep {
  font-size: var(--lc-font-body-lg);
  color: var(--lc-text-tertiary);
  margin: 0 4rpx;
}
.lc-cascader__error {
  margin-top: 6rpx;
}
.lc-cascader__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
</style>
