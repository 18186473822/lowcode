<!--
  NewPageDialog.vue —— 基于数据模型新建页面（2026-10-28）

  产品口径（用户确认）：**先建模型，再基于模型设计页面**。
  因此本弹层把顺序固定为：

    ① 选数据模型（必填，没有模型时给「去创建模型」入口）
    ② 填页面 ID（按模型自动建议，可改）
    ③ 选用途：表单 / 列表 / 详情（三选一）
    ④ 生成页面并切回画布，保存后建档

  生成逻辑在 `@lc/designer` 的 `buildModelPage` 纯函数里（可单测），
  本组件只负责收集输入、校验 ID、调用 `store.createPageFromModel`。
-->
<template>
  <div class="lc-newpage" data-testid="new-page-dialog" @click.self="emit('close')">
    <div class="lc-newpage__panel" role="dialog" aria-modal="true" aria-label="基于模型新建页面">
      <div class="lc-newpage__head">
        <div class="lc-newpage__title">
          <strong>新建页面</strong>
          <span class="lc-newpage__sub">先选数据模型，再按用途生成页面结构</span>
        </div>
        <button
          class="lc-newpage__close"
          type="button"
          aria-label="关闭"
          data-testid="new-page-close"
          @click="emit('close')"
        >×</button>
      </div>

      <div class="lc-newpage__body">
        <!-- ① 模型 -->
        <section class="lc-newpage__section">
          <div class="lc-newpage__label-row">
            <span class="lc-newpage__step" aria-hidden="true">1</span>
            <label class="lc-newpage__label" for="new-page-model">数据模型</label>
            <span class="lc-newpage__required">必填</span>
          </div>

          <p v-if="store.modelsLoading" class="lc-newpage__hint">模型加载中…</p>
          <p v-else-if="store.modelError" class="lc-newpage__hint lc-newpage__hint--error">
            {{ store.modelError }}
          </p>
          <div v-else-if="!store.models.length" class="lc-newpage__empty">
            <strong>还没有数据模型</strong>
            <span>页面必须绑定模型。先去创建一个模型，再回来建页面。</span>
            <button
              class="lc-newpage__btn lc-newpage__btn--primary"
              type="button"
              data-testid="new-page-goto-model"
              @click="goCreateModel"
            >去创建模型</button>
          </div>
          <template v-else>
            <select
              id="new-page-model"
              v-model="modelId"
              class="lc-newpage__select"
              data-testid="new-page-model"
            >
              <option value="">请选择数据模型</option>
              <option v-for="m in store.models" :key="m.id" :value="m.id">
                {{ m.name }}（{{ m.id }}）{{ m.fieldCount === undefined ? '' : ` · ${m.fieldCount} 字段` }}
              </option>
            </select>
            <p class="lc-newpage__hint">
              选中的模型决定页面字段与数据读写目标；建好后仍可在右侧属性面板调整绑定。
            </p>
          </template>
        </section>

        <!-- ② 页面 ID -->
        <section class="lc-newpage__section">
          <div class="lc-newpage__label-row">
            <span class="lc-newpage__step" aria-hidden="true">2</span>
            <label class="lc-newpage__label" for="new-page-id">页面 ID</label>
          </div>
          <input
            id="new-page-id"
            ref="idRef"
            v-model="pageId"
            class="lc-newpage__input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="如 p_leave_form"
            data-testid="new-page-id"
            @input="idTouched = true"
            @keydown.enter.prevent="submit"
          />
          <p v-if="idError" class="lc-newpage__hint lc-newpage__hint--error">{{ idError }}</p>
          <p v-else class="lc-newpage__hint">
            字母或下划线开头，仅限字母、数字、下划线和短横线，最长 64 位；保存后建档。
          </p>
        </section>

        <!-- ③ 用途 -->
        <section class="lc-newpage__section">
          <div class="lc-newpage__label-row">
            <span class="lc-newpage__step" aria-hidden="true">3</span>
            <span class="lc-newpage__label">页面用途</span>
          </div>
          <div class="lc-newpage__types" role="radiogroup" aria-label="页面用途">
            <label
              v-for="t in MODEL_PAGE_TYPES"
              :key="t"
              class="lc-newpage__type"
              :class="{ 'lc-newpage__type--on': type === t }"
            >
              <input
                v-model="type"
                type="radio"
                name="new-page-type"
                :value="t"
                :data-testid="`new-page-type-${t}`"
              />
              <span class="lc-newpage__type-name">{{ MODEL_PAGE_TYPE_LABEL[t] }}</span>
              <span class="lc-newpage__type-hint">{{ MODEL_PAGE_TYPE_HINT[t] }}</span>
            </label>
          </div>
        </section>

        <p v-if="error" class="lc-newpage__error" data-testid="new-page-error">{{ error }}</p>
      </div>

      <div class="lc-newpage__foot">
        <button class="lc-newpage__btn" type="button" @click="emit('close')">取消</button>
        <button
          class="lc-newpage__btn lc-newpage__btn--primary"
          type="button"
          data-testid="new-page-submit"
          :disabled="!canSubmit || creating"
          :title="canSubmit ? '生成页面并切回画布' : '请选择模型并填写合法的页面 ID'"
          @click="submit"
        >{{ creating ? '生成中…' : '创建并打开' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  MODEL_PAGE_TYPES,
  MODEL_PAGE_TYPE_HINT,
  MODEL_PAGE_TYPE_LABEL,
  useDesignerStore,
  type ModelPageType,
} from '@lc/designer'

const emit = defineEmits<{ (e: 'close'): void }>()

const store = useDesignerStore()

/** 与服务端 `PAGE_ID_RE` 保持一致（apps/server/src/page/page.service.ts） */
const PAGE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

const modelId = ref('')
const pageId = ref('')
const type = ref<ModelPageType>('form')
const idTouched = ref(false)
const creating = ref(false)
const error = ref('')
const idRef = ref<HTMLInputElement | null>(null)

const idError = computed(() => {
  const v = pageId.value.trim()
  if (!v) return ''
  return PAGE_ID_RE.test(v) ? '' : '页面 ID 不合法：需字母/下划线开头，仅限字母、数字、_、-'
})
const canSubmit = computed(() => !!modelId.value && PAGE_ID_RE.test(pageId.value.trim()))

/** 由模型 id / code 推导页面 ID 前缀：m_leave → leave */
function idBase(mid: string): string {
  const hit = store.models.find((m) => m.id === mid)
  const raw = (hit?.code || mid).replace(/^m_/, '')
  const cleaned = raw.replace(/[^\w-]/g, '_')
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `p_${cleaned}`
}

function suggestId(): void {
  if (idTouched.value || !modelId.value) return
  pageId.value = `p_${idBase(modelId.value)}_${type.value}`
}

// 模型或用途变化时只更新「未手改过」的建议 ID，避免覆盖用户输入
watch(modelId, suggestId)
watch(type, suggestId)

function goCreateModel(): void {
  emit('close')
  void store.switchView('model')
}

async function submit(): Promise<void> {
  if (!canSubmit.value || creating.value) return
  creating.value = true
  error.value = ''
  try {
    const ok = await store.createPageFromModel(pageId.value.trim(), modelId.value, type.value)
    if (!ok) {
      error.value = store.statusText || '创建失败'
      return
    }
    await store.switchView('page')
    emit('close')
  } finally {
    creating.value = false
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  // 每次打开都拉最新模型列表：刚在模型视图里新建的模型应立即可选
  void store.loadModels(true)
  void nextTick(() => idRef.value?.focus())
})
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<style scoped>
.lc-newpage {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--lc-space-4);
  background: var(--lc-overlay-scrim);
}
.lc-newpage__panel {
  display: flex;
  flex-direction: column;
  width: 520px;
  max-width: calc(100vw - var(--lc-space-8));
  max-height: calc(100vh - 80px);
  overflow: hidden;
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-lg);
  box-shadow: var(--lc-shadow-e4);
}
.lc-newpage__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--lc-space-3);
  padding: var(--lc-space-3) var(--lc-space-4);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-newpage__title {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
}
.lc-newpage__title strong {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-newpage__sub {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.lc-newpage__close {
  flex-shrink: 0;
  padding: var(--lc-space-0-5) var(--lc-space-2);
  font-size: var(--lc-font-body);
  line-height: var(--lc-leading-label);
  color: var(--lc-text-secondary);
  background: none;
  border: var(--lc-border-width) solid transparent;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
}
.lc-newpage__close:hover {
  color: var(--lc-text-primary);
  border-color: var(--lc-border-default);
}

.lc-newpage__body {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-4);
  padding: var(--lc-space-4);
  overflow-y: auto;
}
.lc-newpage__section {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
}
.lc-newpage__label-row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
}
.lc-newpage__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-action-primary-text);
  background: var(--lc-action-primary);
  border-radius: var(--lc-radius-pill);
}
.lc-newpage__label {
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-label);
}
.lc-newpage__required {
  padding: 0 var(--lc-space-1);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-danger);
  border: var(--lc-border-width) solid var(--lc-text-danger);
  border-radius: var(--lc-radius-xs);
}

.lc-newpage__select,
.lc-newpage__input {
  width: 100%;
  min-height: var(--lc-btn-h-md);
  padding: var(--lc-space-1-5) var(--lc-space-2);
  font-family: inherit;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  background: var(--lc-bg-surface);
  border: var(--lc-border-width) solid var(--lc-border-strong);
  border-radius: var(--lc-radius-sm);
}
.lc-newpage__input {
  font-family: var(--lc-font-mono);
}
.lc-newpage__select:focus-visible,
.lc-newpage__input:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}

.lc-newpage__hint {
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-tertiary);
}
.lc-newpage__hint--error {
  color: var(--lc-text-danger);
}
.lc-newpage__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--lc-space-2);
  padding: var(--lc-space-3);
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-secondary);
  background: var(--lc-status-warning-bg);
  border-radius: var(--lc-radius-sm);
}
.lc-newpage__empty strong {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
}

.lc-newpage__types {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--lc-space-2);
}
.lc-newpage__type {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
  padding: var(--lc-space-2);
  cursor: pointer;
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
}
.lc-newpage__type:hover {
  border-color: var(--lc-border-strong);
}
.lc-newpage__type--on {
  border-color: var(--lc-action-primary);
  background: var(--lc-bg-subtle);
}
.lc-newpage__type input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.lc-newpage__type-name {
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-newpage__type-hint {
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-tertiary);
}
.lc-newpage__error {
  padding: var(--lc-space-2);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-danger);
  background: var(--lc-status-danger-bg);
  border-radius: var(--lc-radius-sm);
}

.lc-newpage__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--lc-space-2);
  padding: var(--lc-space-3) var(--lc-space-4);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-newpage__btn {
  padding: var(--lc-btn-pad-y) var(--lc-btn-pad-x);
  min-height: var(--lc-btn-h-md);
  font-family: inherit;
  font-size: var(--lc-font-caption);
  border: var(--lc-border-width) solid var(--lc-border-strong);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
  color: var(--lc-text-label);
  cursor: pointer;
}
.lc-newpage__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.lc-newpage__btn--primary {
  background: var(--lc-action-primary);
  border-color: var(--lc-action-primary);
  color: var(--lc-action-primary-text);
}
.lc-newpage__btn--primary:hover:not(:disabled) {
  background: var(--lc-action-primary-hover);
  border-color: var(--lc-action-primary-hover);
}
.lc-newpage__btn:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}

/* 窄屏：用途卡改单列，避免三栏挤成竖排字 */
@media (max-width: 599px) {
  .lc-newpage__types {
    grid-template-columns: 1fr;
  }
}
</style>
