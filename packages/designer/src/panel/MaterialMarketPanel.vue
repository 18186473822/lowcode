<!--
  MaterialMarketPanel.vue — 远程物料市场（受信元数据版）。

  安全边界：
  - 清单必须命中 allowlist origin、HTTPS（localhost 例外），并用部署方提供的 ES256 公钥验签；
  - 只缓存元数据，不下载/执行远程 JS；
  - “组件”条目只能引用宿主内置 componentName，插入时复用内置物料，仅应用受信 defaultProps。
-->
<template>
  <div class="lc-market-panel ws-page">
    <header class="ws-head">
      <div class="ws-head__text">
        <h3 class="ws-title">物料市场</h3>
        <p class="ws-note">远程清单只提供受信元数据；组件必须落到宿主内置白名单，不执行远程代码。</p>
      </div>
      <div class="ws-actions">
        <button class="op-btn" type="button" :disabled="loading || !configured" data-testid="market-refresh" @click="refresh">
          {{ loading ? '拉取中…' : '刷新清单' }}
        </button>
      </div>
    </header>

    <section v-if="!configured" class="market-config" data-testid="market-unconfigured">
      <h4 class="market-config__title">远程市场未配置</h4>
      <p class="market-config__note">部署时设置以下环境变量后重启设计器：</p>
      <dl class="market-config__list">
        <div class="market-config__item">
          <dt><code>VITE_LC_MATERIAL_MARKET_URL</code></dt>
          <dd>已签名的 manifest 地址</dd>
        </div>
        <div class="market-config__item">
          <dt><code>VITE_LC_MATERIAL_MARKET_ALLOWLIST</code></dt>
          <dd>允许的 origin，逗号分隔</dd>
        </div>
        <div class="market-config__item">
          <dt><code>VITE_LC_MATERIAL_MARKET_PUBLIC_KEY</code></dt>
          <dd>ECDSA P-256 SPKI 公钥 PEM（可用 <code>\n</code> 表示换行）</dd>
        </div>
      </dl>
      <p class="market-muted">未配置时不会发起任何网络请求，也不会回退到不安全的市场地址。</p>
    </section>

    <template v-else>
      <div v-if="error" class="market-error" data-testid="market-error">
        <span>{{ error }}</span>
        <button class="op-btn" type="button" @click="error = ''">关闭</button>
      </div>
      <div v-if="notice" class="market-notice" data-testid="market-notice">{{ notice }}</div>
      <p v-if="cached" class="market-meta">
        来源 <code>{{ cached.source }}</code> · 拉取于 {{ formatTime(cached.fetchedAt) }} · 清单 {{ cached.manifest.name }}
      </p>
      <p v-else class="market-muted market-meta">尚无已验签缓存，点击「刷新清单」拉取。</p>

      <ul v-if="items.length" class="market-list" data-testid="market-list">
        <li v-for="item in items" :key="item.id" class="market-row">
          <div class="market-row__main">
            <div class="market-row__head">
              <strong class="market-name">{{ item.name }}</strong>
              <span class="market-tag">{{ item.kind === 'component' ? '受控组件' : '元数据' }}</span>
              <span class="market-version">v{{ item.version }}</span>
            </div>
            <p class="market-desc">{{ item.description || item.meta.title }}</p>
            <p class="market-id">
              {{ item.id }} · {{ item.kind === 'component' ? item.component : item.meta.name }}
            </p>
          </div>
          <div class="market-actions">
            <button
              v-if="!isInstalled(item.id)"
              class="op-btn"
              type="button"
              :data-testid="`market-install-${item.id}`"
              @click="install(item)"
            >安装</button>
            <button
              v-else
              class="op-btn"
              type="button"
              :data-testid="`market-uninstall-${item.id}`"
              @click="uninstall(item.id)"
            >卸载</button>
            <button
              v-if="item.kind === 'component' && isInstalled(item.id)"
              class="op-btn op-btn--primary"
              type="button"
              :data-testid="`market-insert-${item.id}`"
              @click="emit('insert', item)"
            >插入画布</button>
            <span v-if="item.kind === 'meta'" class="market-muted">仅元数据，不注入运行时组件</span>
          </div>
        </li>
      </ul>
      <panel-state
        v-else-if="cached"
        kind="empty"
        testid="market-empty"
        title="市场清单为空"
        text="清单已验签通过，但发布方还没有登记任何物料。稍后再刷新看看。"
        action-text="刷新清单"
        inline
        @action="refresh"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RemoteMaterialRegistry, type RemoteMaterialEntry } from '@lc/materials'
import PanelState from '../components/PanelState.vue'

const props = defineProps<{
  manifestUrl?: string
  publicKeyPem?: string
  allowlist?: string[]
}>()
const emit = defineEmits<{ insert: [entry: RemoteMaterialEntry] }>()

const registry = shallowRef<RemoteMaterialRegistry | null>(null)
const items = ref<RemoteMaterialEntry[]>([])
const installedIds = ref<Set<string>>(new Set())
const cached = ref<ReturnType<RemoteMaterialRegistry['cache']>>(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')

const configured = computed(
  () => Boolean(props.manifestUrl && props.publicKeyPem && (props.allowlist?.length ?? 0) > 0),
)

function errMsg(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function isInstalled(id: string): boolean {
  return installedIds.value.has(id)
}

function syncState(): void {
  if (!registry.value) return
  cached.value = registry.value.cache()
  items.value = registry.value.list()
  installedIds.value = new Set(registry.value.installed().map((item) => item.id))
}

onMounted(() => {
  if (!configured.value) return
  registry.value = new RemoteMaterialRegistry({ allowlist: props.allowlist ?? [] })
  syncState()
})

async function refresh(): Promise<void> {
  if (!registry.value || !props.manifestUrl || !props.publicKeyPem) return
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const manifest = await registry.value.refresh(props.manifestUrl, props.publicKeyPem)
    syncState()
    notice.value = `清单验签通过：${manifest.materials.length} 项`
  } catch (caught) {
    error.value = `拉取/验签失败：${errMsg(caught)}`
  } finally {
    loading.value = false
  }
}

function install(item: RemoteMaterialEntry): void {
  if (!registry.value) return
  try {
    registry.value.install(item.id)
    syncState()
    notice.value = `已安装 ${item.name} v${item.version}`
  } catch (caught) {
    error.value = `安装失败：${errMsg(caught)}`
  }
}

function uninstall(id: string): void {
  if (!registry.value) return
  registry.value.uninstall(id)
  syncState()
  notice.value = '已卸载；画布中已插入的节点不受影响'
}
</script>

<style scoped>
/* 工作区骨架（.ws-page / .ws-head / .ws-actions）在 ../styles/panel.css；
   本块只保留市场配置说明与清单行布局。 */
.lc-market-panel {
  color: var(--lc-text-primary);
}
.market-muted {
  margin: 0;
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-secondary);
}

/* ---------------- 未配置说明 ---------------- */

.market-config {
  max-width: 720px;
  margin-top: var(--lc-space-8);
  padding-top: var(--lc-space-6);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.market-config__title {
  margin: 0 0 var(--lc-space-2);
  font-size: var(--lc-font-h3);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.market-config__note {
  margin: 0 0 var(--lc-space-4);
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
}
.market-config__list {
  margin: 0 0 var(--lc-space-4);
  padding: 0;
}
.market-config__item {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: var(--lc-space-4);
  padding: var(--lc-space-2-5) 0;
  font-size: var(--lc-font-caption);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.market-config__item:last-child {
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.market-config__item dt {
  min-width: 0;
}
.market-config__item code {
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  word-break: break-all;
}
.market-config__item dd {
  margin: 0;
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-secondary);
}

/* ---------------- 提示条 ---------------- */

.market-error,
.market-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-2-5);
  margin-top: var(--lc-space-6);
  padding: var(--lc-space-2-5) var(--lc-space-3);
  font-size: var(--lc-font-body-sm);
  border-left: 2px solid currentColor;
  border-radius: var(--lc-radius-xs);
}
.market-error {
  color: var(--lc-status-danger);
  background: var(--lc-status-danger-bg);
}
.market-notice {
  color: var(--lc-status-success);
  background: var(--lc-status-success-bg);
}

/* ---------------- 缓存元信息 + 清单 ---------------- */

.market-meta {
  margin: var(--lc-space-5) 0 0;
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-secondary);
}
.market-meta code {
  font-family: var(--lc-font-mono);
}

.market-list {
  margin: var(--lc-space-6) 0 0;
  padding: 0;
  list-style: none;
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.market-row {
  display: flex;
  align-items: center;
  gap: var(--lc-space-6);
  padding: var(--lc-space-4) 0;
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.market-row__main {
  flex: 1;
  min-width: 0;
}
.market-row__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--lc-space-2);
}
.market-name {
  font-size: var(--lc-font-body);
  font-weight: var(--lc-weight-medium);
  color: var(--lc-text-primary);
}
.market-tag {
  padding: 0 var(--lc-space-1);
  font-size: var(--lc-font-micro);
  border-radius: var(--lc-radius-xs);
  background: var(--lc-status-info-bg);
  color: var(--lc-text-link);
}
.market-version {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-secondary);
}
.market-desc {
  margin: var(--lc-space-1) 0 0;
  font-size: var(--lc-font-body-sm);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-primary);
}
.market-id {
  margin: var(--lc-space-1) 0 0;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.market-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-2);
}

@media (max-width: 767px) {
  .market-config__item {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--lc-space-1);
  }
  .market-row {
    flex-direction: column;
    align-items: stretch;
    gap: var(--lc-space-3);
  }
}
</style>
