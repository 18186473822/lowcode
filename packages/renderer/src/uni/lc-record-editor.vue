<!--
  lc-record-editor.vue —— 标准详情页内联记录编辑器（Phase 4）

  - 只编辑 `detail.fields`（缺省模型全部字段）中非 readonly / 非 auto 的字段；
    PUT 是部分合并，未展示的字段保持服务端原值。
  - 控件选择刻意保持轻量（renderer 不依赖 materials）：
      boolean → switch；enum → picker；text/json/file → textarea；其余 → input。
  - 类型转换/JSON 解析在 core/record-edit.ts 纯函数里，服务端仍会二次校验。
  - 保存/删除请求由 lc-detail-page 发出（负责 If-Match 与 409），本组件只 emit payload。
-->
<template>
  <view class="lc-record-editor" data-testid="record-editor">
    <view v-for="f in editableFields" :key="f.key" class="lc-edit-field">
      <view class="lc-edit-field__label-row">
        <text class="lc-edit-field__label">{{ f.name || f.key }}</text>
        <text v-if="f.required" class="lc-edit-field__required">*</text>
      </view>

      <switch
        v-if="f.type === 'boolean'"
        class="lc-edit-field__switch"
        :data-testid="`edit-${f.key}`"
        :checked="boolDraft[f.key] ?? false"
        :disabled="saving"
        color="var(--lc-action-primary)"
        @change="onBoolChange(f.key, $event)"
      />

      <picker
        v-else-if="f.type === 'enum'"
        mode="selector"
        :data-testid="`edit-${f.key}`"
        :range="enumLabels(f)"
        :value="enumIndex(f)"
        :disabled="saving"
        @change="onEnumChange(f, $event)"
      >
        <view :class="['lc-edit-field__cell', { 'lc-edit-field__cell--error': !!errorOf(f.key) }]">
          <text :class="enumIndex(f) < 0 ? 'lc-edit-field__placeholder' : 'lc-edit-field__value'">
            {{ enumIndex(f) >= 0 ? enumLabels(f)[enumIndex(f)] : '请选择' }}
          </text>
          <text class="lc-edit-field__arrow">›</text>
        </view>
      </picker>

      <textarea
        v-else-if="isMultiline(f)"
        v-model="textDraft[f.key]"
        class="lc-edit-field__textarea"
        :class="{ 'lc-edit-field__textarea--error': !!errorOf(f.key) }"
        :data-testid="`edit-${f.key}`"
        :disabled="saving"
        :placeholder="placeholderOf(f)"
      />

      <input
        v-else
        v-model="textDraft[f.key]"
        class="lc-edit-field__input"
        :class="{ 'lc-edit-field__input--error': !!errorOf(f.key) }"
        :type="inputType(f)"
        :data-testid="`edit-${f.key}`"
        :disabled="saving"
        :placeholder="placeholderOf(f)"
      />

      <text v-if="errorOf(f.key)" class="lc-edit-field__error">{{ errorOf(f.key) }}</text>
    </view>

    <view class="lc-record-editor__actions">
      <button
        class="lc-record-editor__cancel"
        size="mini"
        :disabled="saving"
        data-testid="record-edit-cancel"
        @tap="$emit('cancel')"
      >
        取消
      </button>
      <button
        class="lc-record-editor__save"
        size="mini"
        :loading="saving"
        :disabled="saving"
        data-testid="record-edit-save"
        @tap="onSave"
      >
        保存
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FieldSchema, ModelSchema } from '@lc/schema'
import {
  RECORD_SYSTEM_FIELDS,
  parseRecordFieldValue,
} from '../core/record-edit'

const props = defineProps<{
  /** 模型定义；加载失败时为 null，编辑器退化为按记录键生成文本字段 */
  model: ModelSchema | null
  /** 当前记录（含系统字段 id/revision 等） */
  record: Record<string, unknown>
  /** detail.fields；空/缺省 = 模型全部字段 */
  fields?: string[]
  saving?: boolean
  /** 服务端 RECORD_INVALID 的逐字段错误（path → message） */
  errors?: Record<string, string>
}>()

const emit = defineEmits<{
  save: [payload: Record<string, unknown>]
  cancel: []
}>()

/** 编辑器可回写字段：展示字段 ∩ 非 readonly / 非 auto；模型缺失时按记录键降级 */
const editableFields = computed<FieldSchema[]>(() => {
  const all = props.model?.fields ?? []
  let base: FieldSchema[]
  if (all.length === 0) {
    const system = new Set<string>(RECORD_SYSTEM_FIELDS)
    base = Object.keys(props.record)
      .filter((k) => !system.has(k))
      .map((k) => ({ key: k, name: k, type: 'string' }))
  } else if (props.fields && props.fields.length > 0) {
    base = props.fields
      .map((k) => all.find((f) => f.key === k))
      .filter((f): f is FieldSchema => !!f)
  } else {
    base = all
  }
  return base.filter((f) => !f.readonly && !f.auto)
})

const textDraft = ref<Record<string, string>>({})
const boolDraft = ref<Record<string, boolean>>({})
const localErrors = ref<Record<string, string>>({})

/** 进入编辑时做一次快照；取消/保存成功后组件由父级卸载，不会残留草稿 */
for (const f of editableFields.value) {
  const value = props.record[f.key]
  if (f.type === 'boolean') {
    boolDraft.value[f.key] = value === true
    continue
  }
  textDraft.value[f.key] = valueToText(f, value)
}

function valueToText(field: FieldSchema, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (field.type === 'json' || field.type === 'location') {
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  if (field.type === 'file') return Array.isArray(value) ? value.join('\n') : String(value)
  return String(value)
}

function isMultiline(field: FieldSchema): boolean {
  return field.type === 'text' || field.type === 'json' || field.type === 'location' || field.type === 'file'
}

function inputType(field: FieldSchema): string {
  if (field.type === 'number') return 'number'
  if (field.type === 'money') return 'digit'
  return 'text'
}

function placeholderOf(field: FieldSchema): string {
  if (field.placeholder) return field.placeholder
  if (field.type === 'date') return 'YYYY-MM-DD'
  if (field.type === 'datetime') return 'YYYY-MM-DD HH:mm:ss'
  if (field.type === 'file') return '多个文件 id 用换行或逗号分隔'
  return `请输入${field.name || field.key}`
}

function enumLabels(field: FieldSchema): string[] {
  return (field.options ?? []).map((o) => o.label)
}

function enumIndex(field: FieldSchema): number {
  const current = textDraft.value[field.key]
  return (field.options ?? []).findIndex((o) => String(o.value) === current)
}

function onEnumChange(field: FieldSchema, e: Event): void {
  const idx = (e as unknown as { detail?: { value?: number } }).detail?.value ?? -1
  const hit = (field.options ?? [])[idx]
  if (hit) textDraft.value[field.key] = String(hit.value)
}

function onBoolChange(key: string, e: Event): void {
  const detail = (e as unknown as { detail?: { value?: boolean } }).detail
  const target = (e as unknown as { target?: { checked?: boolean } }).target
  boolDraft.value[key] = detail?.value ?? target?.checked ?? false
}

function errorOf(key: string): string {
  return props.errors?.[key] || localErrors.value[key] || ''
}

function onSave(): void {
  if (props.saving) return
  const nextErrors: Record<string, string> = {}
  const payload: Record<string, unknown> = {}

  for (const f of editableFields.value) {
    if (f.type === 'boolean') {
      payload[f.key] = boolDraft.value[f.key] ?? false
      continue
    }
    const raw = textDraft.value[f.key] ?? ''
    if (f.required && raw.trim() === '') {
      nextErrors[f.key] = `请填写${f.name || f.key}`
      continue
    }
    const parsed = parseRecordFieldValue(f, raw)
    if (!parsed.ok) {
      nextErrors[f.key] = parsed.message
      continue
    }
    payload[f.key] = parsed.value
  }

  if (Object.keys(nextErrors).length > 0) {
    localErrors.value = nextErrors
    return
  }
  localErrors.value = {}
  emit('save', payload)
}
</script>

<style scoped>
.lc-record-editor {
  padding: var(--lc-space-1) var(--lc-space-3) var(--lc-space-4);
}

.lc-edit-field {
  margin-top: var(--lc-space-2);
}

.lc-edit-field__label-row {
  display: flex;
  align-items: center;
  margin-bottom: var(--lc-space-1);
}

.lc-edit-field__label {
  color: var(--lc-text-secondary);
  font-size: var(--lc-font-body-sm);
}

.lc-edit-field__required {
  margin-left: 4rpx;
  color: var(--lc-status-danger);
  font-size: var(--lc-font-body-sm);
}

.lc-edit-field__input,
.lc-edit-field__textarea,
.lc-edit-field__cell {
  box-sizing: border-box;
  width: 100%;
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
  color: var(--lc-text-primary);
  font-size: var(--lc-font-body);
}

.lc-edit-field__input {
  min-height: 72rpx;
  padding: 0 var(--lc-space-2);
}

.lc-edit-field__textarea {
  min-height: 160rpx;
  padding: var(--lc-space-2);
}

.lc-edit-field__cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72rpx;
  padding: 0 var(--lc-space-2);
}

.lc-edit-field__input--error,
.lc-edit-field__textarea--error,
.lc-edit-field__cell--error {
  border-color: var(--lc-status-danger);
}

.lc-edit-field__placeholder {
  color: var(--lc-input-placeholder);
}

.lc-edit-field__arrow {
  color: var(--lc-icon-muted);
  font-size: var(--lc-font-h3);
  transform: rotate(90deg);
}

.lc-edit-field__switch {
  transform: scale(0.9);
  transform-origin: left center;
}

.lc-edit-field__error {
  display: block;
  margin-top: 4rpx;
  color: var(--lc-status-danger);
  font-size: var(--lc-font-micro);
}

.lc-record-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--lc-space-2);
  margin-top: var(--lc-space-4);
}

.lc-record-editor__cancel {
  background: var(--lc-bg-surface);
  color: var(--lc-text-secondary);
  border: 1rpx solid var(--lc-border-default);
  border-radius: var(--lc-radius-pill);
}

.lc-record-editor__save {
  background: var(--lc-action-primary);
  color: var(--lc-text-inverse);
  border-radius: var(--lc-radius-pill);
}
</style>
