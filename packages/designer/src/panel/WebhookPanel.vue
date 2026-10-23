<!--
  WebhookPanel.vue — Webhook 管理视图（Phase 4 开放集成生产化）。

  功能闭环：
  - 订阅 CRUD（写操作回传 If-Match；冲突不自动覆盖，提示刷新）；
  - 自定义请求头、订阅级限流、测试投递、密钥轮换（可配置宽限期）；
  - 投递日志（状态过滤/分页）、指标与告警、手动清理归档。

  密钥只在创建/轮换响应中出现一次；列表/详情始终显示脱敏预览。
-->
<template>
  <div class="lc-webhook-panel">
    <div class="wh-head">
      <div>
        <h3 class="panel-title">Webhook 管理</h3>
        <p class="wh-sub">订阅业务事件并把签名 JSON 投递到外部系统；失败自动退避重试，多副本 worker 用租约互斥。</p>
      </div>
      <div class="wh-head-actions">
        <button class="op-btn" type="button" data-testid="webhook-refresh" @click="loadAll">刷新</button>
        <button class="op-btn op-btn--primary" type="button" data-testid="webhook-new" @click="startCreate">新建订阅</button>
      </div>
    </div>

    <div v-if="error" class="wh-error" data-testid="webhook-error">
      <span>{{ error }}</span>
      <button class="op-btn" type="button" @click="error = ''">关闭</button>
    </div>
    <div v-if="notice" class="wh-notice" data-testid="webhook-notice">{{ notice }}</div>
    <div v-if="oneTimeSecret" class="wh-secret" data-testid="webhook-secret">
      <strong>请立即保存密钥（只显示一次）</strong>
      <code>{{ oneTimeSecret }}</code>
      <button class="op-btn" type="button" @click="oneTimeSecret = ''">我已保存</button>
    </div>

    <section v-if="metrics" class="wh-metrics" data-testid="webhook-metrics">
      <div class="wh-metric" :class="{ 'wh-metric--bad': !metrics.ok }">
        <span class="wh-metric__label">健康</span>
        <strong>{{ metrics.ok ? '正常' : `${metrics.alerts.length} 条告警` }}</strong>
      </div>
      <div class="wh-metric"><span class="wh-metric__label">总数</span><strong>{{ metrics.total }}</strong></div>
      <div class="wh-metric"><span class="wh-metric__label">待投递</span><strong>{{ metrics.pending }}</strong></div>
      <div class="wh-metric"><span class="wh-metric__label">成功 / 失败</span><strong>{{ metrics.success }} / {{ metrics.failed }}</strong></div>
      <div class="wh-metric"><span class="wh-metric__label">24h 失败率</span><strong>{{ (metrics.failureRate * 100).toFixed(1) }}%</strong></div>
      <div class="wh-metric"><span class="wh-metric__label">最老待投递</span><strong>{{ formatTime(metrics.oldestPendingAt) }}</strong></div>
      <button class="op-btn" type="button" data-testid="webhook-cleanup" @click="cleanup">清理归档</button>
    </section>
    <ul v-if="metrics?.alerts.length" class="wh-alerts" data-testid="webhook-alerts">
      <li v-for="(alert, i) in metrics.alerts" :key="i">{{ alert }}</li>
    </ul>

    <div class="wh-body">
      <aside class="wh-list">
        <div v-if="loading" class="wh-empty">加载中…</div>
        <ul v-else-if="subscriptions.length" data-testid="webhook-list">
          <li v-for="sub in subscriptions" :key="sub.id">
            <button
              class="wh-list-item"
              :class="{ 'wh-list-item--active': editingId === sub.id }"
              type="button"
              :data-testid="`webhook-item-${sub.id}`"
              @click="select(sub)"
            >
              <span class="wh-list-item__name">{{ sub.name }}</span>
              <span class="wh-list-item__url">{{ sub.url }}</span>
              <span class="wh-list-item__meta">
                <span class="wh-tag" :class="{ 'wh-tag--off': !sub.active }">{{ sub.active ? '启用' : '停用' }}</span>
                <span>{{ sub.events.includes('*') ? '全部事件' : `${sub.events.length} 个事件` }}</span>
                <span v-if="sub.rateLimitPerMinute">限流 {{ sub.rateLimitPerMinute }}/min</span>
              </span>
            </button>
          </li>
        </ul>
        <div v-else class="wh-empty">
          还没有 Webhook 订阅。点击右上角「新建订阅」开始。
        </div>
      </aside>

      <section class="wh-detail">
        <div v-if="!formVisible" class="wh-empty wh-empty--detail">
          选择左侧订阅进行编辑，或新建一个订阅。
        </div>

        <form v-else class="wh-form" @submit.prevent="save">
          <h4 class="wh-form__title">{{ editingId ? `编辑订阅 · ${editingId}` : '新建订阅' }}</h4>

          <label class="setter">
            <span class="setter__label">名称</span>
            <input v-model="form.name" class="setter__input" type="text" maxlength="64" data-testid="webhook-name" />
          </label>

          <label class="setter">
            <span class="setter__label">接收 URL</span>
            <input
              v-model="form.url"
              class="setter__input"
              type="url"
              maxlength="2048"
              placeholder="https://example.com/hooks/lowcode"
              data-testid="webhook-url"
            />
            <span class="setter__help">生产环境默认禁止内网地址，发送前会再做一次 DNS 校验。</span>
          </label>

          <label class="setter">
            <span class="setter__label">描述</span>
            <input v-model="form.description" class="setter__input" type="text" maxlength="500" />
          </label>

          <div class="setter">
            <span class="setter__label">订阅事件</span>
            <div class="wh-events" data-testid="webhook-events">
              <label v-for="item in WEBHOOK_EVENT_OPTIONS" :key="item.value" class="wh-event">
                <input
                  type="checkbox"
                  :checked="form.events.includes(item.value)"
                  @change="toggleEvent(item.value)"
                />
                <span>{{ item.label }}</span>
              </label>
            </div>
            <span class="setter__help">「全部事件」与其他事件互斥；至少选择一项。</span>
          </div>

          <label class="setter">
            <span class="setter__label">自定义请求头（JSON）</span>
            <textarea
              v-model="form.headersText"
              class="setter__input wh-textarea"
              rows="3"
              spellcheck="false"
              data-testid="webhook-headers"
            />
            <span class="setter__help">例如 {"Authorization":"Bearer xxx"}；X-LC-* / Host / Content-Length 等系统头会被拒绝。</span>
          </label>

          <div class="wh-row">
            <label class="setter">
              <span class="setter__label">每分钟限流</span>
              <input v-model.number="form.rateLimitPerMinute" class="setter__input" type="number" min="0" max="6000" />
              <span class="setter__help">0 = 不限制</span>
            </label>
            <label class="setter">
              <span class="setter__label">最大尝试次数</span>
              <input v-model.number="form.maxAttempts" class="setter__input" type="number" min="1" max="10" />
            </label>
            <label class="setter">
              <span class="setter__label">超时（ms）</span>
              <input v-model.number="form.timeoutMs" class="setter__input" type="number" min="1000" max="30000" />
            </label>
          </div>

          <label class="wh-check">
            <input v-model="form.active" type="checkbox" />
            <span>启用订阅</span>
          </label>

          <div class="wh-actions">
            <button class="op-btn op-btn--primary" type="submit" :disabled="saving" data-testid="webhook-save">
              {{ saving ? '保存中…' : editingId ? '保存修改' : '创建订阅' }}
            </button>
            <button class="op-btn" type="button" @click="cancel">取消</button>
            <template v-if="editingId">
              <button class="op-btn" type="button" :disabled="testing" data-testid="webhook-test" @click="test">
                {{ testing ? '发送中…' : '测试投递' }}
              </button>
              <label class="wh-inline">
                <span>宽限期(s)</span>
                <input v-model.number="graceSeconds" class="setter__input wh-grace" type="number" min="0" max="604800" />
              </label>
              <button class="op-btn" type="button" :disabled="rotating" data-testid="webhook-rotate" @click="rotate">
                {{ rotating ? '轮换中…' : '轮换密钥' }}
              </button>
              <button
                class="op-btn"
                :class="{ 'op-btn--danger': deleteArmed }"
                type="button"
                data-testid="webhook-delete"
                @click="remove"
              >{{ deleteArmed ? '确认删除' : '删除订阅' }}</button>
            </template>
          </div>

          <p v-if="editing" class="wh-meta">
            版本 {{ editing.revision }} · 更新于 {{ formatTime(editing.updatedAt) }} · 密钥 {{ editing.secretPreview }}
            <template v-if="editing.previousSecretExpiresAt">
              · 旧密钥宽限至 {{ formatTime(editing.previousSecretExpiresAt) }}（{{ editing.previousSecretPreview }}）
            </template>
          </p>
        </form>

        <section v-if="editingId" class="wh-logs">
          <div class="wh-logs__head">
            <h4>投递日志</h4>
            <div class="wh-logs__filter">
              <select v-model="logStatus" class="setter__input" @change="loadLogs(1)">
                <option value="">全部状态</option>
                <option value="pending">待投递</option>
                <option value="success">成功</option>
                <option value="failed">失败</option>
              </select>
              <button class="op-btn" type="button" data-testid="webhook-logs-refresh" @click="loadLogs(logPage)">刷新</button>
            </div>
          </div>
          <p v-if="logsError" class="wh-error">{{ logsError }}</p>
          <div v-if="logs" class="wh-log-summary">
            共 {{ logs.total }} 条 · 第 {{ logs.page }} 页
            <button class="op-btn" type="button" :disabled="logs.page <= 1" @click="loadLogs(logs.page - 1)">上一页</button>
            <button
              class="op-btn"
              type="button"
              :disabled="logs.page * logs.size >= logs.total"
              @click="loadLogs(logs.page + 1)"
            >下一页</button>
          </div>
          <ul v-if="logs?.items.length" class="wh-log-list" data-testid="webhook-logs">
            <li v-for="delivery in logs.items" :key="delivery.id" class="wh-log">
              <div class="wh-log__top">
                <span class="wh-tag" :class="`wh-tag--${delivery.status}`">{{ delivery.status }}</span>
                <code>{{ delivery.eventType }}</code>
                <span class="wh-log__time">{{ formatTime(delivery.createdAt) }}</span>
              </div>
              <div class="wh-log__meta">
                尝试 {{ delivery.attemptCount }} 次
                <template v-if="delivery.responseStatus"> · HTTP {{ delivery.responseStatus }}</template>
                <template v-if="delivery.error"> · {{ delivery.error }}</template>
                <template v-if="delivery.leaseExpiresAt"> · 租约至 {{ formatTime(delivery.leaseExpiresAt) }}</template>
              </div>
              <ul v-if="delivery.attempts.length" class="wh-attempts">
                <li v-for="attempt in delivery.attempts" :key="attempt.attempt">
                  #{{ attempt.attempt }} {{ attempt.ok ? '成功' : '失败' }}
                  <template v-if="attempt.status"> HTTP {{ attempt.status }}</template>
                  · {{ attempt.durationMs }}ms
                  <template v-if="attempt.error"> · {{ attempt.error }}</template>
                </li>
              </ul>
            </li>
          </ul>
          <div v-else-if="!logsError" class="wh-empty">暂无投递日志。</div>
        </section>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  WEBHOOK_EVENT_OPTIONS,
  type WebhookApi,
  type WebhookDeliveryPage,
  type WebhookMetrics,
  type WebhookSubscription,
} from './webhook-types'

const props = defineProps<{ api?: WebhookApi }>()

const subscriptions = ref<WebhookSubscription[]>([])
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const rotating = ref(false)
const error = ref('')
const notice = ref('')
const oneTimeSecret = ref('')
const editingId = ref('')
const editingEtag = ref<string | undefined>(undefined)
const editing = ref<WebhookSubscription | null>(null)
const formVisible = ref(false)
const deleteArmed = ref(false)
const graceSeconds = ref(86400)
const metrics = ref<WebhookMetrics | null>(null)
const logs = ref<WebhookDeliveryPage | null>(null)
const logsError = ref('')
const logStatus = ref('')
const logPage = ref(1)

const form = reactive({
  name: '',
  url: '',
  description: '',
  events: ['*'] as string[],
  headersText: '{}',
  rateLimitPerMinute: 0,
  active: true,
  maxAttempts: 5,
  timeoutMs: 10000,
})

function errMsg(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function formatTime(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function resetForm(): void {
  form.name = ''
  form.url = ''
  form.description = ''
  form.events = ['*']
  form.headersText = '{}'
  form.rateLimitPerMinute = 0
  form.active = true
  form.maxAttempts = 5
  form.timeoutMs = 10000
  editing.value = null
  editingId.value = ''
  editingEtag.value = undefined
  deleteArmed.value = false
  oneTimeSecret.value = ''
  logs.value = null
  logsError.value = ''
  logStatus.value = ''
}

function startCreate(): void {
  resetForm()
  formVisible.value = true
}

function cancel(): void {
  formVisible.value = false
  resetForm()
  logs.value = null
}

function toggleEvent(event: string): void {
  if (event === '*') {
    form.events = form.events.includes('*') ? [] : ['*']
    return
  }
  const rest = form.events.filter((item) => item !== '*')
  form.events = rest.includes(event) ? rest.filter((item) => item !== event) : [...rest, event]
}

function select(sub: WebhookSubscription): void {
  editing.value = sub
  editingId.value = sub.id
  editingEtag.value = `"webhook:${sub.id}:${sub.revision}"`
  form.name = sub.name
  form.url = sub.url
  form.description = sub.description ?? ''
  form.events = [...sub.events]
  form.headersText = JSON.stringify(sub.headers ?? {}, null, 2)
  form.rateLimitPerMinute = sub.rateLimitPerMinute
  form.active = sub.active
  form.maxAttempts = sub.maxAttempts
  form.timeoutMs = sub.timeoutMs
  formVisible.value = true
  deleteArmed.value = false
  oneTimeSecret.value = ''
  void loadLogs(1)
}

function buildPayload(): Record<string, unknown> | null {
  let headers: unknown
  try {
    headers = JSON.parse(form.headersText || '{}')
  } catch {
    error.value = '自定义请求头必须是合法 JSON 对象'
    return null
  }
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
    error.value = '自定义请求头必须是 JSON 对象'
    return null
  }
  if (form.events.length === 0) {
    error.value = '至少选择一个订阅事件'
    return null
  }
  return {
    name: form.name.trim(),
    url: form.url.trim(),
    description: form.description.trim() || undefined,
    events: form.events,
    headers,
    rateLimitPerMinute: form.rateLimitPerMinute,
    active: form.active,
    maxAttempts: form.maxAttempts,
    timeoutMs: form.timeoutMs,
  }
}

async function loadAll(): Promise<void> {
  if (!props.api) {
    error.value = '未配置 Webhook API'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const [list, stats] = await Promise.all([props.api.list(), props.api.metrics()])
    subscriptions.value = list.items
    metrics.value = stats
  } catch (caught) {
    error.value = `加载 Webhook 失败：${errMsg(caught)}`
  } finally {
    loading.value = false
  }
}

async function loadLogs(page = 1): Promise<void> {
  if (!props.api || !editingId.value) return
  logsError.value = ''
  logPage.value = page
  try {
    logs.value = await props.api.deliveries(editingId.value, {
      ...(logStatus.value ? { status: logStatus.value } : {}),
      page,
      size: 10,
    })
  } catch (caught) {
    logsError.value = `加载投递日志失败：${errMsg(caught)}`
  }
}

async function refreshMetrics(): Promise<void> {
  if (!props.api) return
  try {
    metrics.value = await props.api.metrics()
  } catch {
    /* 指标失败不覆盖主要错误提示 */
  }
}

async function save(): Promise<void> {
  if (!props.api) return
  const payload = buildPayload()
  if (!payload) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    if (editingId.value) {
      const result = await props.api.update(editingId.value, payload, editingEtag.value)
      editing.value = result.data
      notice.value = '订阅已保存'
      await loadAll()
      const fresh = subscriptions.value.find((item) => item.id === editingId.value)
      if (fresh) select(fresh)
      else editingEtag.value = result.etag
    } else {
      const result = await props.api.create(payload)
      notice.value = '订阅已创建，请保存上方密钥'
      await loadAll()
      const created = result.data
      const fresh = subscriptions.value.find((item) => item.id === created.id)
      if (fresh) select(fresh)
      // select() 会清空一次性密钥，必须在选中新订阅之后再赋值。
      oneTimeSecret.value = result.secret
    }
  } catch (caught) {
    error.value = `保存失败：${errMsg(caught)}`
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  if (!props.api || !editingId.value) return
  if (!deleteArmed.value) {
    deleteArmed.value = true
    return
  }
  error.value = ''
  try {
    await props.api.remove(editingId.value, editingEtag.value)
    notice.value = '订阅已删除；历史投递日志仍保留，可继续审计'
    const deletedId = editingId.value
    formVisible.value = false
    resetForm()
    await loadAll()
    if (subscriptions.value.every((item) => item.id !== deletedId)) {
      editingId.value = ''
    }
  } catch (caught) {
    deleteArmed.value = false
    error.value = `删除失败：${errMsg(caught)}`
  }
}

async function test(): Promise<void> {
  if (!props.api || !editingId.value) return
  testing.value = true
  error.value = ''
  try {
    const result = await props.api.test(editingId.value)
    const delivery = result.data
    notice.value = delivery.status === 'success'
      ? `测试投递成功（HTTP ${delivery.responseStatus ?? '2xx'}，${delivery.attempts[0]?.durationMs ?? 0}ms）`
      : `测试投递 ${delivery.status}：${delivery.error ?? `HTTP ${delivery.responseStatus ?? '未知'}`}`
    await loadLogs(1)
    await refreshMetrics()
  } catch (caught) {
    error.value = `测试投递失败：${errMsg(caught)}`
  } finally {
    testing.value = false
  }
}

async function rotate(): Promise<void> {
  if (!props.api || !editingId.value) return
  rotating.value = true
  error.value = ''
  try {
    const result = await props.api.rotate(editingId.value, graceSeconds.value, editingEtag.value)
    notice.value = `密钥已轮换，旧密钥宽限 ${graceSeconds.value} 秒`
    await loadAll()
    const fresh = subscriptions.value.find((item) => item.id === editingId.value)
    if (fresh) select(fresh)
    // select() 会清空一次性密钥，必须在选中订阅之后再赋值。
    oneTimeSecret.value = result.secret
  } catch (caught) {
    error.value = `轮换失败：${errMsg(caught)}`
  } finally {
    rotating.value = false
  }
}

async function cleanup(): Promise<void> {
  if (!props.api) return
  try {
    const result = await props.api.cleanup()
    notice.value = `已归档并清理 ${result.archived} 条过期投递日志`
    await refreshMetrics()
  } catch (caught) {
    error.value = `清理失败：${errMsg(caught)}`
  }
}

onMounted(loadAll)
</script>

<style scoped>
.lc-webhook-panel { padding: var(--lc-space-5) var(--lc-space-6) var(--lc-space-8); color: var(--lc-text-primary); overflow: auto; height: 100%; box-sizing: border-box; }
.wh-head { display: flex; justify-content: space-between; gap: var(--lc-space-4); align-items: flex-start; }
.wh-sub { margin: var(--lc-space-1) 0 0; color: var(--lc-text-secondary); font-size: 12px; }
.wh-head-actions { display: flex; gap: var(--lc-space-2); }
.wh-error, .wh-notice, .wh-secret { margin: var(--lc-space-3) 0; padding: var(--lc-space-2-5) var(--lc-space-3); border-radius: 8px; font-size: 13px; display: flex; gap: var(--lc-space-2-5); align-items: center; flex-wrap: wrap; }
.wh-error { background: var(--lc-status-danger-bg); color: var(--lc-status-danger); border: 1px solid var(--lc-status-danger); }
.wh-notice { background: var(--lc-status-success-bg); color: var(--lc-status-success); border: 1px solid var(--lc-status-success); }
.wh-secret { background: var(--lc-status-warning-bg); color: var(--lc-status-warning); border: 1px solid var(--lc-status-warning); }
.wh-secret code { font-family: var(--lc-font-mono); word-break: break-all; }
.wh-metrics { display: flex; gap: var(--lc-space-2-5); flex-wrap: wrap; margin: 14px 0 var(--lc-space-2); align-items: stretch; }
.wh-metric { min-width: 120px; padding: var(--lc-space-2-5) var(--lc-space-3); border: 1px solid var(--lc-border-default); border-radius: 10px; background: var(--lc-bg-surface); display: flex; flex-direction: column; gap: var(--lc-space-1); }
.wh-metric--bad { border-color: var(--lc-status-danger); background: var(--lc-status-danger-bg); }
.wh-metric__label { font-size: 11px; color: var(--lc-text-secondary); }
.wh-alerts { margin: var(--lc-space-1) 0 var(--lc-space-3); padding: var(--lc-space-2) var(--lc-space-3) var(--lc-space-2) 28px; color: var(--lc-status-danger); background: var(--lc-status-danger-bg); border-radius: 8px; font-size: 12px; }
.wh-body { display: grid; grid-template-columns: minmax(220px, 320px) minmax(0, 1fr); gap: var(--lc-space-4); margin-top: 14px; }
.wh-list { border: 1px solid var(--lc-border-default); border-radius: 10px; overflow: auto; max-height: calc(100vh - 260px); background: var(--lc-bg-surface); }
.wh-list ul { list-style: none; margin: 0; padding: var(--lc-space-1-5); }
.wh-list-item { width: 100%; border: 0; background: transparent; text-align: left; padding: var(--lc-space-2-5); border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; gap: var(--lc-space-1); color: inherit; }
.wh-list-item:hover, .wh-list-item--active { background: var(--lc-bg-subtle); }
.wh-list-item__name { font-weight: 600; font-size: 13px; }
.wh-list-item__url { font-size: 11px; color: var(--lc-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wh-list-item__meta { display: flex; gap: var(--lc-space-1-5); flex-wrap: wrap; font-size: 11px; color: var(--lc-text-secondary); align-items: center; }
.wh-tag { display: inline-block; padding: 1px var(--lc-space-1-5); border-radius: 999px; background: var(--lc-status-success-bg); color: var(--lc-status-success); font-size: 10px; }
.wh-tag--off, .wh-tag--failed { background: var(--lc-status-danger-bg); color: var(--lc-status-danger); }
.wh-tag--pending { background: var(--lc-status-warning-bg); color: var(--lc-status-warning); }
.wh-detail { min-width: 0; }
.wh-empty { padding: var(--lc-space-6); color: var(--lc-text-secondary); font-size: 13px; }
.wh-empty--detail { border: 1px dashed var(--lc-border-default); border-radius: 10px; }
.wh-form { border: 1px solid var(--lc-border-default); border-radius: 10px; padding: var(--lc-space-4); background: var(--lc-bg-surface); }
.wh-form__title { margin: 0 0 var(--lc-space-3); font-size: 14px; }
.wh-events { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: var(--lc-space-1-5); margin: var(--lc-space-1) 0; }
.wh-event { display: flex; align-items: center; gap: var(--lc-space-1-5); font-size: 12px; }
.wh-textarea { font-family: var(--lc-font-mono); resize: vertical; }
.wh-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--lc-space-2-5); }
.wh-check { display: flex; align-items: center; gap: var(--lc-space-1-5); font-size: 13px; margin: var(--lc-space-2) 0; }
.wh-actions { display: flex; gap: var(--lc-space-2); flex-wrap: wrap; align-items: center; margin-top: var(--lc-space-3); }
.wh-inline { display: flex; align-items: center; gap: var(--lc-space-1-5); font-size: 11px; color: var(--lc-text-secondary); }
.wh-grace { width: 96px; }
.wh-meta { margin: var(--lc-space-3) 0 0; font-size: 11px; color: var(--lc-text-secondary); }
.wh-logs { margin-top: var(--lc-space-4); border: 1px solid var(--lc-border-default); border-radius: 10px; padding: 14px; background: var(--lc-bg-surface); }
.wh-logs__head { display: flex; justify-content: space-between; gap: var(--lc-space-2-5); align-items: center; }
.wh-logs__head h4 { margin: 0; font-size: 14px; }
.wh-logs__filter { display: flex; gap: var(--lc-space-1-5); align-items: center; }
.wh-log-summary { display: flex; gap: var(--lc-space-2); align-items: center; font-size: 12px; color: var(--lc-text-secondary); margin: var(--lc-space-2) 0; flex-wrap: wrap; }
.wh-log-list, .wh-attempts { list-style: none; padding: 0; margin: 0; }
.wh-log { border-top: 1px solid var(--lc-border-default); padding: var(--lc-space-2-5) 0; }
.wh-log__top { display: flex; gap: var(--lc-space-2); align-items: center; font-size: 12px; flex-wrap: wrap; }
.wh-log__time { margin-left: auto; color: var(--lc-text-secondary); }
.wh-log__meta { font-size: 11px; color: var(--lc-text-secondary); margin-top: var(--lc-space-1); }
.wh-attempts { margin-top: var(--lc-space-1-5); padding-left: var(--lc-space-3); font-size: 11px; color: var(--lc-text-secondary); }
.wh-attempts li { padding: var(--lc-space-0-5) 0; }
@media (max-width: 900px) {
  .wh-body { grid-template-columns: 1fr; }
  .wh-list { max-height: 240px; }
  .wh-row { grid-template-columns: 1fr; }
}
</style>
