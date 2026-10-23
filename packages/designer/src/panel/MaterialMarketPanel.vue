<!--
  MaterialMarketPanel.vue — 远程物料市场（受信元数据版）。

  安全边界：
  - 清单必须命中 allowlist origin、HTTPS（localhost 例外），并用部署方提供的 ES256 公钥验签；
  - 只缓存元数据，不下载/执行远程 JS；
  - “组件”条目只能引用宿主内置 componentName，插入时复用内置物料，仅应用受信 defaultProps。
-->
<template>
  <div class="lc-market-panel">
    <div class="market-head">
      <div>
        <h3 class="panel-title">物料市场</h3>
        <p class="market-sub">远程清单只提供受信元数据；组件必须落到宿主内置白名单，不执行远程代码。</p>
      </div>
      <button class="op-btn" type="button" :disabled="loading || !configured" data-testid="market-refresh" @click="refresh">
        {{ loading ? '拉取中…' : '刷新清单' }}
      </button>
    </div>

    <div v-if="!configured" class="market-empty" data-testid="market-unconfigured">
      <strong>远程市场未配置</strong>
      <p>部署时设置以下环境变量后重启设计器：</p>
      <ul>
        <li><code>VITE_LC_MATERIAL_MARKET_URL</code>：已签名的 manifest 地址</li>
        <li><code>VITE_LC_MATERIAL_MARKET_ALLOWLIST</code>：允许的 origin，逗号分隔</li>
        <li><code>VITE_LC_MATERIAL_MARKET_PUBLIC_KEY</code>：ECDSA P-256 SPKI 公钥 PEM（可用 <code>\n</code> 表示换行）</li>
      </ul>
      <p class="market-muted">未配置时不会发起任何网络请求，也不会回退到不安全的市场地址。</p>
    </div>

    <template v-else>
      <div v-if="error" class="market-error" data-testid="market-error">
        <span>{{ error }}</span>
        <button class="op-btn" type="button" @click="error = ''">关闭</button>
      </div>
      <div v-if="notice" class="market-notice" data-testid="market-notice">{{ notice }}</div>
      <p v-if="cached" class="market-meta">
        来源 <code>{{ cached.source }}</code> · 拉取于 {{ formatTime(cached.fetchedAt) }} · 清单 {{ cached.manifest.name }}
      </p>
      <p v-else class="market-muted">尚无已验签缓存，点击「刷新清单」拉取。</p>

      <ul v-if="items.length" class="market-list" data-testid="market-list">
        <li v-for="item in items" :key="item.id" class="market-card">
          <div class="market-card__head">
            <strong>{{ item.name }}</strong>
            <span class="market-tag">{{ item.kind === 'component' ? '受控组件' : '元数据' }}</span>
            <span class="market-version">v{{ item.version }}</span>
          </div>
          <p class="market-desc">{{ item.description || item.meta.title }}</p>
          <p class="market-muted">
            {{ item.id }} · {{ item.kind === 'component' ? item.component : item.meta.name }}
          </p>
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
      <div v-else-if="cached" class="market-empty">市场清单为空。</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RemoteMaterialRegistry, type RemoteMaterialEntry } from '@lc/materials'

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
.lc-market-panel {
  padding: var(--lc-space-5) var(--lc-space-6) var(--lc-space-8);
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  color: var(--lc-text-primary);
}
.market-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--lc-space-4);
}
.market-sub,
.market-muted {
  margin: var(--lc-space-1) 0 0;
  color: var(--lc-text-secondary);
  font-size: var(--lc-font-caption);
}
.market-empty,
.market-error,
.market-notice {
  margin: var(--lc-space-3) 0;
  padding: var(--lc-space-2-5) var(--lc-space-3);
  border-radius: var(--lc-radius-md);
  font-size: var(--lc-font-body-sm);
}
.market-empty {
  border: var(--lc-border-width) dashed var(--lc-border-default);
  color: var(--lc-text-secondary);
}
.market-empty ul {
  margin: var(--lc-space-2) 0;
  padding-left: var(--lc-space-5);
}
.market-empty li {
  margin: var(--lc-space-1) 0;
}
.market-error {
  background: var(--lc-status-danger-bg);
  color: var(--lc-status-danger);
  display: flex;
  gap: var(--lc-space-2-5);
  align-items: center;
  flex-wrap: wrap;
}
.market-notice {
  background: var(--lc-status-success-bg);
  color: var(--lc-status-success);
}
.market-meta {
  margin: var(--lc-space-3) 0 var(--lc-space-1);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.market-list {
  list-style: none;
  padding: 0;
  margin: var(--lc-space-3) 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--lc-space-3);
}
.market-card {
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
  padding: var(--lc-space-3);
  background: var(--lc-bg-surface);
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
}
.market-card__head {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  flex-wrap: wrap;
}
.market-tag {
  padding: 1px var(--lc-space-1-5);
  border-radius: var(--lc-radius-pill);
  background: var(--lc-status-info-bg);
  color: var(--lc-text-link);
  font-size: var(--lc-font-micro);
}
.market-version {
  margin-left: auto;
  color: var(--lc-text-secondary);
  font-size: var(--lc-font-micro);
}
.market-desc {
  margin: 0;
  font-size: var(--lc-font-body-sm);
}
.market-actions {
  display: flex;
  gap: var(--lc-space-1-5);
  flex-wrap: wrap;
  align-items: center;
  margin-top: var(--lc-space-1-5);
}
</style>
