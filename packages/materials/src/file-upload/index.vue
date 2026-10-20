<!--
  FileUpload 物料 —— 文件上传（Phase 2 批 3，对齐 FieldType `file`；方案缺口清单「文件」项）。
  接口对齐 lc-node：`<lc-file-upload v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: string[]（文件名/临时路径列表，受控）
   - 选择走 uni.chooseFile API（与 Upload 同款范式：`typeof uni` 安全降级，PC shim 注入 file input polyfill）
   - **仅文件名回显，无真实上传协议**（服务端文件接口未有，见台账未做项）
-->
<template>
  <view class="lc-file-upload">
    <view v-if="label" class="lc-file-upload__label-row">
      <text class="lc-file-upload__label">{{ label }}</text>
      <text v-if="required" class="lc-file-upload__required">*</text>
    </view>
    <view class="lc-file-upload__list">
      <view v-for="(f, i) in fileList" :key="i" class="lc-file-upload__item">
        <text class="lc-file-upload__doc">📄</text>
        <text class="lc-file-upload__name">{{ f }}</text>
        <text v-if="!disabled" class="lc-file-upload__del" @click.stop="remove(i)">×</text>
      </view>
      <view
        v-if="canAdd"
        class="lc-file-upload__item lc-file-upload__add"
        @click="choose"
      >
        <text class="lc-file-upload__plus">＋</text>
        <text class="lc-file-upload__add-text">选择文件</text>
      </view>
    </view>
    <view class="lc-file-upload__foot">
      <view v-if="error" class="lc-file-upload__error">
        <text>{{ error }}</text>
      </view>
      <text class="lc-file-upload__count">{{ fileList.length }}/{{ maxCount || 5 }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name?: string
  label?: string
  value?: unknown
  /** 最多文件数 */
  maxCount?: number
  /** 选择器 accept（逗号分隔扩展名，如 '.pdf,.docx'；空 = 全部） */
  accept?: string
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const maxCount = computed(() => props.maxCount || 5)
const fileList = computed(() => (Array.isArray(props.value) ? (props.value as string[]) : []))
const canAdd = computed(() => !props.disabled && fileList.value.length < maxCount.value)

function patch(next: string[]): void {
  emit('update', { name: props.name, value: next })
}

function choose(): void {
  const u = typeof uni !== 'undefined' ? uni : undefined
  if (!u || typeof (u as { chooseFile?: unknown }).chooseFile !== 'function') return // 非 uni 环境安全降级
  ;(u as unknown as {
    chooseFile: (o: {
      count?: number
      extension?: string[]
      success?: (res: { tempFiles?: Array<{ name?: string; path?: string }> }) => void
      fail?: () => void
    }) => void
  }).chooseFile({
    count: maxCount.value - fileList.value.length,
    extension: props.accept ? props.accept.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    success: (res) => {
      const names = (res.tempFiles ?? []).map((f) => f.name ?? f.path ?? '').filter(Boolean)
      patch([...fileList.value, ...names])
    },
    fail: () => void 0, // 用户取消不报错
  })
}

function remove(index: number): void {
  if (props.disabled) return
  patch(fileList.value.filter((_, i) => i !== index))
}
</script>

<style scoped>
.lc-file-upload {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-file-upload__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-file-upload__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-file-upload__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-file-upload__item {
  display: flex;
  align-items: center;
  background: var(--lc-bg-surface);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  padding: var(--lc-space-2) 20rpx;
  margin-bottom: 12rpx;
}
.lc-file-upload__doc {
  font-size: var(--lc-font-body-lg);
  margin-right: 12rpx;
}
.lc-file-upload__name {
  flex: 1;
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-file-upload__del {
  font-size: 34rpx;
  color: var(--lc-text-tertiary);
  padding: 0 var(--lc-space-1);
}
.lc-file-upload__add {
  border-style: dashed;
  background: var(--lc-bg-subtle);
  justify-content: center;
}
.lc-file-upload__plus {
  font-size: 34rpx;
  color: var(--lc-text-tertiary);
  line-height: 1;
  margin-right: var(--lc-space-1);
}
.lc-file-upload__add-text {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-tertiary);
}
.lc-file-upload__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6rpx;
}
.lc-file-upload__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
.lc-file-upload__count {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  margin-left: auto;
}
</style>
