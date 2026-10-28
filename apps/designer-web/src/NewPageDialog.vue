<!--
  NewPageDialog.vue —— 按数据模型成组新建页面（2026-10-28）

  产品口径（用户确认）：**先建模型，再基于模型设计页面**；参考云程「一个模型 = 一套业务界面」，
  这里不再「一次只建一页」，而是：

    ① 选数据模型（必填，没有模型时给「去创建模型」入口）
    ② 填模块前缀（按模型自动建议，可改）→ 实时预览生成的页面 ID
    ③ 勾选要生成的页面：列表 / 表单 / 详情（默认全选）
    ④ 生成并落盘，自动串联（列表→详情、详情→返回列表、表单提交→回列表）
       同时回写模型的 `listPageId` / `formPageId`

  生成规则在 `@lc/designer` 的 `buildModelModule` 纯函数里（可单测），
  本组件只负责收集输入、校验前缀、调用 `store.createModelModule`。
-->
<template>
  <div class="lc-newpage" data-testid="new-page-dialog" @click.self="emit('close')">
    <div class="lc-newpage__panel" role="dialog" aria-modal="true" aria-label="按模型新建页面">
      <div class="lc-newpage__head">
        <div class="lc-newpage__title">
          <strong>按模型新建页面</strong>
          <span class="lc-newpage__sub">先选数据模型，再一次生成列表 / 表单 / 详情并自动串联</span>
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
              模型决定页面字段与数据读写目标；生成后仍可在右侧属性面板调整绑定。
            </p>
          </template>
        </section>

        <!-- ② 模块前缀 -->
        <section class="lc-newpage__section">
          <div class="lc-newpage__label-row">
            <span class="lc-newpage__step" aria-hidden="true">2</span>
            <label class="lc-newpage__label" for="new-page-id">模块前缀</label>
            <span class="lc-newpage__hint lc-newpage__hint--inline">页面 ID 由它派生</span>
          </div>
          <input
            id="new-page-id"
            ref="idRef"
            v-model="base"
            class="lc-newpage__input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="如 leave"
            data-testid="new-page-id"
            @input="baseTouched = true"
            @keydown.enter.prevent="submit"
          />
          <p v-if="baseError" class="lc-newpage__hint lc-newpage__hint--error">{{ baseError }}</p>
          <div v-else-if="normalized" class="lc-newpage__ids" data-testid="new-page-ids">
            <span
              v-for="row in idRows"
              :key="row.type"
              class="lc-newpage__id-chip"
              :class="{ 'lc-newpage__id-chip--off': !picked.includes(row.type) }"
            >{{ row.id }}</span>
          </div>
          <p v-else class="lc-newpage__hint">
            字母或下划线开头，仅限字母、数字、下划线和短横线；会剥掉 `p_` 前缀与 `_list` / `_form` / `_detail` 尾巴。
          </p>
        </section>

        <!-- ③ 生成哪些页面 -->
        <section class="lc-newpage__section">
          <div class="lc-newpage__label-row">
            <span class="lc-newpage__step" aria-hidden="true">3</span>
            <span class="lc-newpage__label">生成哪些页面</span>
            <span class="lc-newpage__hint lc-newpage__hint--inline">至少一项</span>
          </div>
          <div class="lc-newpage__types" role="group" aria-label="生成哪些页面">
            <label
              v-for="t in MODEL_PAGE_TYPES"
              :key="t"
              class="lc-newpage__type"
              :class="{ 'lc-newpage__type--on': picked.includes(t) }"
            >
              <input
                v-model="picked"
                type="checkbox"
                :value="t"
                :data-testid="`new-page-type-${t}`"
              />
              <span class="lc-newpage__type-name">{{ MODEL_PAGE_TYPE_LABEL[t] }}</span>
              <span class="lc-newpage__type-hint">{{ MODEL_PAGE_TYPE_HINT[t] }}</span>
            </label>
          </div>
          <p class="lc-newpage__hint">
            全选时三页自动串联：列表点行进详情、详情返回列表、表单提交成功回到列表；
            并回写模型的默认列表页 / 表单页。
          </p>
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
          :title="canSubmit ? '生成页面并打开首页' : '请选择模型、填写合法前缀并至少勾选一项'"
          @click="submit"
        >{{ creating ? '生成中…' : `生成 ${picked.length} 个页面` }}</button>
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
  moduleBase,
  modulePageIds,
  useDesignerStore,
  type ModelPageType,
} from '@lc/designer'

const emit = defineEmits<{ (e: 'close'): void }>()

const store = useDesignerStore()

/** 与服务端 `PAGE_ID_RE` 保持一致（apps/server/src/page/page.service.ts） */
const PAGE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/

/** 页面 id 上限 64，多出的字符留给 `_detail` 尾巴 */
const BASE_MAX = 57

const modelId = ref('')
const base = ref('')
const picked = ref<ModelPageType[]>([...MODEL_PAGE_TYPES])
const baseTouched = ref(false)
const creating = ref(false)
const error = ref('')
const idRef = ref<HTMLInputElement | null>(null)

/** 规范化后的前缀（剥 p_ / _list 等）；空串 = 还没填 */
const normalized = computed(() => moduleBase(base.value))

const baseError = computed(() => {
  if (!base.value.trim()) return ''
  const n = normalized.value
  if (!n) return '前缀不能为空，且需字母或下划线开头'
  if (!PAGE_ID_RE.test(n)) return '前缀不合法：仅限字母、数字、下划线、短横线'
  if (n.length > BASE_MAX) return `前缀过长：最长 ${BASE_MAX} 位（页面 ID 上限 64）`
  return ''
})

/** 预览用：三页 id 与勾选状态 */
const idRows = computed(() => {
  const ids = modulePageIds(normalized.value)
  return MODEL_PAGE_TYPES.map((t) => ({ type: t, id: ids[t] }))
})

const canSubmit = computed(
  () => !!modelId.value && !!normalized.value && !baseError.value && picked.value.length > 0,
)

/** 由模型 id / code 推导前缀：m_leave → leave */
function suggestBase(): void {
  if (baseTouched.value || !modelId.value) return
  const hit = store.models.find((m) => m.id === modelId.value)
  base.value = (hit?.code || modelId.value).replace(/^m_/, '')
}

watch(modelId, suggestBase)

function goCreateModel(): void {
  emit('close')
  void store.switchView('model')
}

async function submit(): Promise<void> {
  if (!canSubmit.value || creating.value) return
  // 勾选顺序按固定枚举走，避免 UI 点选顺序影响生成顺序
  const types = MODEL_PAGE_TYPES.filter((t) => picked.value.includes(t))
  creating.value = true
  error.value = ''
  try {
    const ok = await store.createModelModule(normalized.value, modelId.value, types)
    if (!ok) {
      error.value = store.statusText || '生成失败'
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
  width: 560px;
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
.lc-newpage__hint--inline {
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

/* 生成的页面 id 预览：勾选的实底、未勾选的弱化 */
.lc-newpage__ids {
  display: flex;
  flex-wrap: wrap;
  gap: var(--lc-space-1-5);
}
.lc-newpage__id-chip {
  padding: 0 var(--lc-space-2);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-label);
  color: var(--lc-text-label);
  background: var(--lc-bg-subtle);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-xs);
}
.lc-newpage__id-chip--off {
  color: var(--lc-text-tertiary);
  border-style: dashed;
  text-decoration: line-through;
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
