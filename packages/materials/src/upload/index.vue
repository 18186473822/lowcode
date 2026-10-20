<!--
  Upload 物料 —— 图片上传（多选 + 预览 + 删除）。归位于 `packages/materials`（Phase 1 第 1 批）。
  接口对齐 lc-node：`<lc-upload v-bind="model.props" :error="model.error" @update="onChange" />`
   - value: string[]（本地临时路径；真实上传到服务端待 Phase 1 第 2 批文件上传接口，届时转 URL）
   - 选择走 uni.chooseImage API（条件编译 H5/小程序/App 通用）；非 uni 环境（jsdom 单测）安全降级
-->
<template>
  <view class="lc-upload">
    <view v-if="label" class="lc-upload__label-row">
      <text class="lc-upload__label">{{ label }}</text>
      <text v-if="required" class="lc-upload__required">*</text>
    </view>
    <view class="lc-upload__grid">
      <view v-for="(src, i) in fileList" :key="i" class="lc-upload__item">
        <image class="lc-upload__thumb" :src="src" mode="aspectFill" @click="preview(i)" />
        <view class="lc-upload__del" @click.stop="remove(i)">
          <text>×</text>
        </view>
      </view>
      <view v-if="canAdd" class="lc-upload__item lc-upload__add" @click="choose">
        <text class="lc-upload__plus">＋</text>
        <text class="lc-upload__add-text">添加</text>
      </view>
    </view>
    <view class="lc-upload__foot">
      <view v-if="error" class="lc-upload__error">
        <text>{{ error }}</text>
      </view>
      <text class="lc-upload__count">{{ fileList.length }}/{{ maxCount || 9 }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name?: string
  label?: string
  value?: unknown
  maxCount?: number
  required?: boolean
  disabled?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update', payload: { name?: string; value: unknown }): void
}>()

const maxCount = computed(() => props.maxCount || 9)

const fileList = computed(() => (Array.isArray(props.value) ? (props.value as string[]) : []))

const canAdd = computed(() => !props.disabled && fileList.value.length < maxCount.value)

function patch(next: string[]): void {
  emit('update', { name: props.name, value: next })
}

function choose(): void {
  const u = typeof uni !== 'undefined' ? uni : undefined
  if (!u || typeof u.chooseImage !== 'function') return // 非 uni 环境（如 jsdom 单测）安全降级
  u.chooseImage({
    count: maxCount.value - fileList.value.length,
    success: (res) => patch([...fileList.value, ...(res.tempFilePaths ?? [])]),
    fail: () => void 0, // 用户取消不报错
  })
}

function preview(index: number): void {
  const u = typeof uni !== 'undefined' ? uni : undefined
  if (!u || typeof u.previewImage !== 'function') return
  u.previewImage({ urls: fileList.value, current: index })
}

function remove(index: number): void {
  if (props.disabled) return
  patch(fileList.value.filter((_, i) => i !== index))
}
</script>

<style scoped>
.lc-upload {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-upload__label-row {
  margin-bottom: var(--lc-space-1);
}
.lc-upload__label {
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.lc-upload__required {
  color: var(--lc-status-danger);
  margin-left: 4rpx;
}
.lc-upload__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--lc-space-2);
}
.lc-upload__item {
  position: relative;
  width: 144rpx;
  height: 144rpx;
  border-radius: var(--lc-radius-sm);
  overflow: hidden;
}
.lc-upload__thumb {
  width: 100%;
  height: 100%;
}
.lc-upload__del {
  position: absolute;
  top: 0;
  right: 0;
  width: 40rpx;
  height: 40rpx;
  background: var(--lc-overlay-scrim);
  color: var(--lc-text-on-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--lc-font-body);
  border-bottom-left-radius: var(--lc-radius-sm);
}
.lc-upload__add {
  border: 1rpx dashed var(--lc-border-strong);
  background: var(--lc-bg-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.lc-upload__plus {
  font-size: var(--lc-font-h1);
  color: var(--lc-text-tertiary);
  line-height: 1;
}
.lc-upload__add-text {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  margin-top: 4rpx;
}
.lc-upload__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6rpx;
}
.lc-upload__error text {
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}
.lc-upload__count {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  margin-left: auto;
}
</style>
