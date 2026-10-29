<!--
  PublishDialog.vue —— 发布版本（2026-10-29 P3）

  为什么要有这一步：服务端 `publish` 一直支持 `note`，但前端写死了「设计器发布」，
  结果历史里所有版本备注都一样 —— 互比时根本认不出哪版是哪版。

  纯展示组件：只收集备注，**不自己发请求**（发布是宿主的事，成功后才关窗）。
  交互与 HistoryDialog / HelpDialog 一致：遮罩点击关闭、Esc 关闭、回车确认。
-->
<template>
  <div class="lc-pub" data-testid="publish-dialog" @click.self="emit('close')">
    <div class="lc-pub__panel" role="dialog" aria-modal="true" aria-label="发布版本">
      <div class="lc-pub__head">
        <strong>发布版本</strong>
        <button
          class="lc-pub__close"
          type="button"
          aria-label="关闭"
          data-testid="pub-close"
          @click="emit('close')"
        >×</button>
      </div>

      <div class="lc-pub__body">
        <p class="lc-pub__hint" data-testid="pub-hint">
          {{ currentVersion > 0 ? `当前发布 v${currentVersion}，本次将发布 v${currentVersion + 1}` : '尚未发布过，本次将固化为 v1' }}
        </p>

        <label class="lc-pub__field">
          <span class="lc-pub__label">版本说明</span>
          <input
            ref="inputRef"
            v-model="note"
            class="setter__input"
            type="text"
            maxlength="60"
            placeholder="如：调整门户卡片顺序"
            data-testid="pub-note"
            @keydown.enter.prevent="confirm"
            @keydown.esc.prevent="emit('close')"
          />
          <span class="lc-pub__help">显示在「历史版本」里，方便日后看出这版改了什么（留空记为「设计器发布」）</span>
        </label>

        <p v-if="error" class="panel-err" data-testid="pub-error">{{ error }}</p>
      </div>

      <div class="lc-pub__foot">
        <button class="op-btn" type="button" data-testid="pub-cancel" @click="emit('close')">取消</button>
        <button
          class="op-btn op-btn--primary"
          type="button"
          data-testid="pub-confirm"
          :disabled="saving"
          @click="confirm"
        >{{ saving ? '发布中…' : '发布' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 当前已发布版本（0 = 从未发布） */
    currentVersion?: number
    /** 宿主正在发布（按钮置灰防重复提交） */
    saving?: boolean
    /** 宿主发布失败的原因（红字，不关窗） */
    error?: string
  }>(),
  { currentVersion: 0, saving: false, error: '' },
)

const emit = defineEmits<{ close: []; confirm: [note: string] }>()

const note = ref('设计器发布')
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  // 聚焦并全选：想改的直接打字覆盖，不想改的回车即可
  inputRef.value?.focus()
  inputRef.value?.select()
})

function confirm(): void {
  if (props.saving) return
  emit('confirm', note.value.trim())
}
</script>

<style scoped>
.lc-pub {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--lc-space-4);
  background: var(--lc-overlay-scrim);
}
.lc-pub__panel {
  display: flex;
  flex-direction: column;
  width: 420px;
  max-width: calc(100vw - var(--lc-space-8));
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-lg);
  box-shadow: var(--lc-shadow-e4);
}
.lc-pub__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--lc-space-3) var(--lc-space-4);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-pub__close {
  padding: 0 var(--lc-space-2);
  font-family: inherit;
  font-size: var(--lc-font-body);
  color: var(--lc-text-secondary);
  background: none;
  border: 0;
  cursor: pointer;
}
.lc-pub__body {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-3);
  padding: var(--lc-space-4);
}
.lc-pub__hint {
  margin: 0;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.lc-pub__field {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
}
.lc-pub__label {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
}
.lc-pub__help {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  line-height: var(--lc-leading-readable);
}
.lc-pub__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--lc-space-2);
  padding: var(--lc-space-3) var(--lc-space-4);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
</style>
