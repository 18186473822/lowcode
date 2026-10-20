<!--
  ThemePanel.vue —— 应用主题配置视图（Phase 3 批 3 / D-P3-8）

  - 三项配置：primary（brand 主色）/ radius（主圆角 px）/ dark（跟随系统 | 强制浅 | 强制深）；
  - 经 props.api 读写服务端 `/apps/config`（patch：null = 清除该键回落令牌默认）；
  - 保存成功 emit('saved') —— 宿主据此做设计器自身换肤预览；错误一律红字可见（不静默）；
  - 面板自持状态（不进 store）：主题非画布协作域，避免 store 膨胀。
-->
<template>
  <div class="lc-theme-panel">
    <h3 class="panel-title">主题配置</h3>

    <panel-state v-if="loading" kind="skeleton" testid="theme-loading" :rows="3" />
    <panel-state
      v-else-if="error"
      kind="error"
      testid="theme-error"
      :title="error"
      text="主题没拉到 / 保存失败，此时的表单不代表线上生效值。"
      action-text="重试"
      inline
      @action="onRetry"
    />

    <template v-else>
      <label class="setter">
        <span class="setter__label">品牌主色</span>
        <span class="theme-color-row">
          <input
            class="theme-color"
            type="color"
            data-testid="theme-primary-color"
            :value="colorValue"
            @input="onColorInput"
          />
          <input
            class="setter__input"
            type="text"
            data-testid="theme-primary"
            :value="primary"
            placeholder="#RRGGBB（留空 = 令牌默认）"
            @input="onPrimaryInput"
          />
        </span>
        <span class="setter__help">十六进制色值；运行时派生 brand 十档，全站按钮 / 链接 / 焦点跟随</span>
      </label>

      <label class="setter">
        <span class="setter__label">主圆角（px）</span>
        <input
          class="setter__input"
          type="text"
          data-testid="theme-radius"
          :value="radius"
          placeholder="如 12（留空 = 令牌默认）"
          @input="onRadiusInput"
        />
        <span class="setter__help">作用于按钮 / 输入框 / 面板三档圆角；仅 H5 端动态生效</span>
      </label>

      <label class="setter">
        <span class="setter__label">深色模式</span>
        <select class="setter__input" data-testid="theme-dark" :value="dark" @change="onDarkChange">
          <option value="">跟随系统</option>
          <option value="light">强制浅色</option>
          <option value="dark">强制深色</option>
        </select>
        <span class="setter__help">「跟随系统」= 不落配置，运行时按设备偏好</span>
      </label>

      <div class="theme-actions">
        <button
          class="op-btn op-btn--primary"
          :class="{ 'op-btn--loading': saving }"
          type="button"
          data-testid="theme-save"
          :disabled="saving || !dirty"
          @click="onSave"
        >{{ saving ? '保存中…' : '保存' }}</button>
        <span v-if="savedAt" class="theme-saved" data-testid="theme-saved">已保存 {{ savedAt }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AppTheme } from '@lc/schema'
import PanelState from '../components/PanelState.vue'
import type { ThemeApi, ThemePatch } from './theme-types'

const props = defineProps<{ api: ThemeApi }>()
const emit = defineEmits<{ saved: [theme: AppTheme] }>()

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const savedAt = ref('')

/** 表单态：dark 用 '' | 'light' | 'dark' 表达三态（'' = 跟随系统 = 不落配置） */
const primary = ref('')
const radius = ref('')
const dark = ref<'' | 'light' | 'dark'>('')
/** 服务端基线（保存按钮脏态判定） */
const baseline = ref('')

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/** color input 只认 #rrggbb：非法 / 空值回落令牌默认色，保证取色器始终可点 */
// 取色器的数据默认值：input[type=color] 只接受具体色值，不能是 var()；样式侧仍走令牌，
// 这里的字面量只用于「用户没填时的兜底」。
// design-token-exempt
const colorValue = computed(() => (HEX_RE.test(primary.value) && primary.value.length === 7 ? primary.value : '#2b6de8'))

function snapshot(): string {
  return JSON.stringify({ primary: primary.value, radius: radius.value, dark: dark.value })
}
const dirty = computed(() => snapshot() !== baseline.value)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const cfg = await props.api.get()
    primary.value = cfg?.primary ?? ''
    radius.value = cfg?.radius ? cfg.radius.replace(/px$/, '') : ''
    dark.value = typeof cfg?.dark === 'boolean' ? (cfg.dark ? 'dark' : 'light') : ''
    baseline.value = snapshot()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '主题加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())

function onColorInput(e: Event): void {
  primary.value = (e.target as HTMLInputElement).value
}
function onPrimaryInput(e: Event): void {
  primary.value = (e.target as HTMLInputElement).value.trim()
}
function onRadiusInput(e: Event): void {
  radius.value = (e.target as HTMLInputElement).value.trim()
}
function onDarkChange(e: Event): void {
  dark.value = (e.target as HTMLSelectElement).value as '' | 'light' | 'dark'
}

async function onSave(): Promise<void> {
  // 客户端门禁（服务端仍会校验：400 APP_CONFIG_INVALID 不静默）
  if (primary.value && !HEX_RE.test(primary.value)) {
    error.value = 'primary 必须是 #RGB / #RRGGBBB 十六进制色值'
    return
  }
  if (radius.value && !/^\d+(?:\.\d+)?$/.test(radius.value)) {
    error.value = 'radius 必须是纯数字（单位 px）'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const patch: ThemePatch = {
      primary: primary.value || null,
      radius: radius.value ? `${radius.value}px` : null,
      dark: dark.value === '' ? null : dark.value === 'dark',
    }
    const theme = await props.api.put(patch)
    baseline.value = snapshot()
    savedAt.value = new Date().toLocaleTimeString()
    emit('saved', theme)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '主题保存失败'
  } finally {
    saving.value = false
  }
}

function onRetry(): void {
  void load()
}
</script>

<style scoped>
.theme-color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-color {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--lc-border-default);
  border-radius: var(--lc-radius-xs);
  background: none;
  cursor: pointer;
  flex: none;
}

.theme-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.theme-saved {
  font-size: 12px;
  color: var(--lc-status-success);
}
</style>
