<!--
  HelpDialog.vue —— 快捷键与版本信息（2026-10-28）

  顶栏「更多 → 快捷键与帮助」打开。内容全部来自本地事实：
  - 快捷键表与 @lc/designer/core/keyboard.ts 的键位一一对应；
  - 服务端版本实时读 GET /api/v1/openapi.json 的 info.version（公共接口，无需登录）。
  手写 modal，交互与 HistoryDialog 一致（遮罩点击 / Esc 关闭）。
-->
<template>
  <div class="lc-help" data-testid="help-dialog" @click.self="emit('close')">
    <div class="lc-help__panel" role="dialog" aria-modal="true" aria-label="快捷键与帮助">
      <div class="lc-help__head">
        <div class="lc-help__title">
          <strong>快捷键与帮助</strong>
          <span class="lc-help__sub">画布编辑优先，输入框内让给浏览器原生行为</span>
        </div>
        <button
          class="lc-help__close"
          type="button"
          aria-label="关闭"
          data-testid="help-close"
          @click="emit('close')"
        >×</button>
      </div>

      <div class="lc-help__body">
        <section class="lc-help__section">
          <h3 class="lc-help__heading">画布快捷键</h3>
          <dl class="lc-help__keys">
            <div v-for="row in SHORTCUTS" :key="row.label" class="lc-help__row">
              <dt>{{ row.label }}</dt>
              <dd><kbd v-for="k in row.keys" :key="k">{{ k }}</kbd></dd>
            </div>
          </dl>
        </section>

        <section class="lc-help__section">
          <h3 class="lc-help__heading">版本与环境</h3>
          <dl class="lc-help__facts">
            <div class="lc-help__fact">
              <dt>设计器</dt>
              <dd>v{{ DESIGNER_VERSION }}</dd>
            </div>
            <div class="lc-help__fact">
              <dt>服务端 API</dt>
              <dd>{{ serverVersion }}</dd>
            </div>
            <div class="lc-help__fact">
              <dt>运行模式</dt>
              <dd>{{ isDev ? '开发（Vite dev）' : '生产构建' }}</dd>
            </div>
            <div class="lc-help__fact">
              <dt>接口基地址</dt>
              <dd class="lc-help__mono">{{ apiBase }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div class="lc-help__foot">
        <a class="lc-help__link" :href="openapiUrl" target="_blank" rel="noopener noreferrer">
          打开 OpenAPI 文档 ↗
        </a>
        <button class="lc-help__btn lc-help__btn--primary" type="button" @click="emit('close')">
          知道了
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

/** 与 apps/designer-web/package.json 的 version 保持同步（发版时一起改） */
const DESIGNER_VERSION = '0.1.0'

const emit = defineEmits<{ (e: 'close'): void }>()

const isDev = import.meta.env.DEV
const apiBase = `${window.location.origin}/api/v1`
const openapiUrl = `${apiBase}/openapi.json`
const serverVersion = ref('读取中…')

const SHORTCUTS = [
  { label: '撤销', keys: ['Ctrl', 'Z'] },
  { label: '重做', keys: ['Ctrl', 'Shift', 'Z'] },
  { label: '复制选中的节点', keys: ['Ctrl', 'C'] },
  { label: '剪切选中的节点', keys: ['Ctrl', 'X'] },
  { label: '粘贴到选中节点', keys: ['Ctrl', 'V'] },
  { label: '删除选中的节点', keys: ['Delete'] },
  { label: '关闭菜单 / 弹层', keys: ['Esc'] },
] as const

async function loadServerVersion(): Promise<void> {
  try {
    const res = await fetch(openapiUrl)
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { info?: { version?: string } }
    serverVersion.value = data.info?.version ? `v${data.info.version}` : '未知'
  } catch {
    serverVersion.value = '暂不可用'
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  void loadServerVersion()
})
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<style scoped>
.lc-help {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lc-overlay-scrim);
}
.lc-help__panel {
  width: 560px;
  max-width: calc(100vw - var(--lc-space-12));
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-lg);
  box-shadow: var(--lc-shadow-e4);
  overflow: hidden;
}
.lc-help__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--lc-space-3);
  padding: var(--lc-space-3) var(--lc-space-4);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-help__title {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
}
.lc-help__title strong {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
}
.lc-help__sub {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.lc-help__close {
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
.lc-help__close:hover {
  color: var(--lc-text-primary);
  border-color: var(--lc-border-default);
}
.lc-help__close:focus-visible,
.lc-help__link:focus-visible,
.lc-help__btn:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}

.lc-help__body {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-4);
  padding: var(--lc-space-4);
  overflow-y: auto;
}
.lc-help__heading {
  margin-bottom: var(--lc-space-2);
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-label);
}
.lc-help__keys {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
}
.lc-help__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-3);
  padding: var(--lc-space-1) var(--lc-space-2);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  background: var(--lc-bg-subtle);
  border-radius: var(--lc-radius-xs);
}
.lc-help__row dt {
  color: var(--lc-text-secondary);
}
.lc-help__row dd {
  display: flex;
  gap: var(--lc-space-1);
}
.lc-help__row kbd {
  min-width: 24px;
  padding: 1px var(--lc-space-1-5);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  text-align: center;
  color: var(--lc-text-label);
  background: var(--lc-bg-surface);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-bottom-width: 2px;
  border-radius: var(--lc-radius-xs);
}

.lc-help__facts {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
}
.lc-help__fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--lc-space-3);
  padding: var(--lc-space-1) var(--lc-space-2);
  font-size: var(--lc-font-caption);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-help__fact dt {
  color: var(--lc-text-secondary);
}
.lc-help__fact dd {
  color: var(--lc-text-primary);
}
.lc-help__mono {
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  word-break: break-all;
  text-align: right;
}

.lc-help__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-3);
  padding: var(--lc-space-3) var(--lc-space-4);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-help__link {
  font-size: var(--lc-font-caption);
  color: var(--lc-action-primary);
  text-decoration: none;
}
.lc-help__link:hover {
  text-decoration: underline;
}
.lc-help__btn {
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
.lc-help__btn--primary {
  background: var(--lc-action-primary);
  border-color: var(--lc-action-primary);
  color: var(--lc-action-primary-text);
}
.lc-help__btn--primary:hover {
  background: var(--lc-action-primary-hover);
  border-color: var(--lc-action-primary-hover);
}
</style>
