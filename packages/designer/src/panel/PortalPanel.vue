<!--
  PortalPanel.vue —— 移动门户清单（2026-10-28）

  对应云程「门户设计 → 移动门户」：一个门户 = 一张 `type=portal` 的页面，
  清单里管名称 / 编码 / 类型 / 排序 / 备注，操作列进在线设计器。

  设计口径：
  - **系统内置页**（应用入口 / 我的待办）由运行体内置路由提供，不占页面表，
    因此只在清单里展示、不可编辑删除（截图里可编辑是另一套内置页实现，我们没有）。
  - 排序 / 备注写在 `schema.portal.order` / `portal.remark`，不新增服务端字段；
    清单加载时逐页读 schema（门户页通常个位数）。
  - 新增 = 建 `portal` 空骨架并直接落盘；编码已存在时**拒绝**（saveSchema 是 upsert）。
  - 编辑走 If-Match（getSchema 拿 revision），409 只提示、不自动覆盖。
-->
<template>
  <div class="lc-portal-panel lc-portal-home" data-testid="portal-panel">
    <!-- 应用条：应用身份 + 入口页 + 门户页数 + 最近编辑。
         不使用灰底卡片，靠字号层级与竖线分隔；数据来自 `GET /apps/config`。 -->
    <header class="portal-appbar" data-testid="portal-appbar">
      <span class="portal-appbar__icon" aria-hidden="true">{{ appInitial }}</span>
      <div class="portal-appbar__id">
        <h1 class="portal-appbar__name">{{ appName }}</h1>
        <span class="portal-appbar__kind">门户设计</span>
      </div>
      <div class="portal-appbar__facts">
        <span class="portal-appbar__meta">入口页 {{ entryLabel }}</span>
        <span class="portal-appbar__meta">{{ store.portalPages.length }} 个门户页</span>
        <span class="portal-appbar__meta">{{ lastEditedText }}</span>
      </div>
      <span v-if="store.appConfigError" class="portal-appbar__err">{{ store.appConfigError }}</span>
    </header>

    <!-- 页签：门户页面（清单） / 门户配置（入口页 + 应用菜单） -->
    <div class="portal-tabs" role="tablist" aria-label="门户设计视图">
      <button
        class="portal-tabs__btn"
        :class="{ 'portal-tabs__btn--on': tab === 'pages' }"
        type="button"
        role="tab"
        :aria-selected="tab === 'pages'"
        data-testid="portal-tab-pages"
        @click="tab = 'pages'"
      >门户页面</button>
      <button
        class="portal-tabs__btn"
        :class="{ 'portal-tabs__btn--on': tab === 'config' }"
        type="button"
        role="tab"
        :aria-selected="tab === 'config'"
        data-testid="portal-tab-config"
        @click="tab = 'config'"
      >门户配置</button>
    </div>

    <div class="portal-home__body">
      <div class="portal-home__main">
        <template v-if="tab === 'pages'">
          <header class="portal-section-head">
            <div class="portal-section-head__text">
              <h2 class="portal-section__title">门户页面</h2>
              <p class="portal-section__note">
                每张门户页就是手机上的一个首页。打开「页面设计」，从左侧拖入内容。
              </p>
            </div>
            <div class="portal-section-head__ops">
              <button
                class="portal-quiet"
                type="button"
                data-testid="portal-refresh"
                @click="reload"
              >刷新</button>
              <button
                class="op-btn op-btn--primary"
                type="button"
                data-testid="portal-new"
                @click="openCreate"
              >＋ 新增门户</button>
            </div>
          </header>

          <!-- 查询：点「查询」才应用，重置清空草稿与条件 -->
          <div class="portal-tools" role="group" aria-label="门户查询">
            <div class="portal-tools__search">
              <label class="portal-field">
                <span class="portal-field__label">名称</span>
                <input
                  v-model="q.name"
                  class="setter__input portal-field__input"
                  type="text"
                  placeholder="模糊匹配"
                  data-testid="portal-q-name"
                  @keydown.enter="applyQuery"
                />
              </label>
              <label class="portal-field">
                <span class="portal-field__label">编码</span>
                <input
                  v-model="q.id"
                  class="setter__input portal-field__input"
                  type="text"
                  spellcheck="false"
                  placeholder="如 default_home"
                  data-testid="portal-q-id"
                  @keydown.enter="applyQuery"
                />
              </label>
              <button
                class="portal-quiet portal-quiet--boxed"
                type="button"
                data-testid="portal-search"
                @click="applyQuery"
              >查询</button>
              <button
                class="portal-quiet"
                type="button"
                data-testid="portal-reset"
                @click="resetQuery"
              >重置</button>
            </div>

            <!-- 批量删除只在有勾选时出现，避免常驻一个不可用的危险按钮 -->
            <div v-if="selectedIds.length" class="portal-tools__bulk">
              <span class="portal-tools__count">已选 {{ selectedIds.length }} 项</span>
              <button
                class="portal-quiet portal-quiet--danger"
                type="button"
                data-testid="portal-delete"
                :disabled="deleting"
                title="删除含历史版本，不可恢复"
                @click="removeSelected"
              >{{ deleteArmed ? `确认删除 ${selectedIds.length} 项` : '删除所选' }}</button>
            </div>
          </div>

          <!-- 下钻失败提示独立于下面的加载/表格分支：不能插进 v-if/v-else-if/v-else 链中间 -->
          <p v-if="designError" class="panel-err portal-design-err" data-testid="portal-design-error">{{ designError }}</p>
          <p v-if="pendingSwitchTo" class="portal-hint portal-dirty-hint" data-testid="portal-dirty-hint">
            当前页有未保存的修改：再点一次「页面设计」会丢弃这些修改。
          </p>

          <p v-if="store.portalError" class="panel-err portal-status" data-testid="portal-error">{{ store.portalError }}</p>
          <p v-else-if="store.portalLoading" class="portal-hint portal-status" data-testid="portal-loading">加载中…</p>

          <div v-else class="portal-table-wrap">
            <table class="portal-table" data-testid="portal-table">
              <thead>
                <tr>
                  <th class="portal-col-check">
                    <input
                      type="checkbox"
                      :checked="allDesignSelected"
                      :disabled="!designRows.length"
                      aria-label="全选在线设计页"
                      data-testid="portal-check-all"
                      @change="toggleAll"
                    />
                  </th>
                  <th>门户</th>
                  <th class="portal-col-type">类型</th>
                  <th class="portal-col-order">排序</th>
                  <th class="portal-col-remark">备注</th>
                  <th class="portal-col-ops">操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in pagedRows" :key="row.key">
                  <!-- 系统内置：运行体路由，不占页面表 -->
                  <tr v-if="row.kind === 'builtin'" class="portal-row portal-row--builtin">
                    <td class="portal-col-check">
                      <input type="checkbox" disabled aria-label="系统内置页不可选" />
                    </td>
                    <td>
                      <span class="portal-name">{{ row.name }}</span>
                      <code class="portal-id">{{ row.id }}</code>
                    </td>
                    <td class="portal-col-type">
                      <span class="portal-type portal-type--builtin">
                        <span class="portal-type__dot" aria-hidden="true" />系统内置
                      </span>
                    </td>
                    <td class="portal-col-order portal-muted">—</td>
                    <td class="portal-remark portal-muted">{{ row.note }}</td>
                    <td class="portal-col-ops portal-muted" title="由运行体内置路由提供，不占页面表，故不可编辑 / 删除">—</td>
                  </tr>

                  <!-- 在线设计：page 表里 type=portal 的行 -->
                  <tr v-else class="portal-row" :data-testid="`portal-row-${row.page.id}`">
                    <td class="portal-col-check">
                      <input
                        type="checkbox"
                        :checked="selected.has(row.page.id)"
                        :aria-label="`选择 ${row.page.name}`"
                        :data-testid="`portal-check-${row.page.id}`"
                        @change="toggleOne(row.page.id, ($event.target as HTMLInputElement).checked)"
                      />
                    </td>
                    <td>
                      <span class="portal-name">{{ row.page.name }}</span>
                      <code class="portal-id">{{ row.page.id }}</code>
                    </td>
                    <td class="portal-col-type">
                      <span class="portal-type portal-type--design">
                        <span class="portal-type__dot" aria-hidden="true" />在线设计
                      </span>
                    </td>
                    <td class="portal-col-order">{{ row.page.order ?? '—' }}</td>
                    <td class="portal-remark" :title="row.page.remark">{{ row.page.remark || '—' }}</td>
                    <td class="portal-col-ops">
                      <button
                        class="portal-link portal-link--main"
                        type="button"
                        :data-testid="`portal-design-${row.page.id}`"
                        @click="design(row.page.id)"
                      >页面设计</button>
                      <button
                        class="portal-link"
                        type="button"
                        :data-testid="`portal-edit-${row.page.id}`"
                        @click="openEdit(row.page)"
                      >编辑</button>
                      <button
                        class="portal-link portal-link--danger"
                        type="button"
                        :data-testid="`portal-remove-${row.page.id}`"
                        @click="removeOne(row.page.id)"
                      >删除</button>
                    </td>
                  </tr>
                </template>

                <tr v-if="!total">
                  <td class="portal-empty" colspan="6" data-testid="portal-empty">
                    {{ applied.name || applied.id
                      ? '没有匹配的门户页。换个名称或编码，或重置查询。'
                      : '还没有门户页。新建一张，开始搭手机首屏。' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 分页：共 N 条 · 每页条数 · 上一页 / 页码 / 下一页 · 跳页 -->
          <div class="portal-pager" data-testid="portal-pager">
            <span class="portal-pager__total">共 <strong>{{ total }}</strong> 条</span>
            <div class="portal-pager__nav">
              <label class="portal-pager__size-label">
                每页
                <select v-model.number="pageSize" class="portal-pager__size" aria-label="每页条数">
                  <option :value="10">10 条</option>
                  <option :value="20">20 条</option>
                  <option :value="50">50 条</option>
                </select>
              </label>
              <button class="portal-pager__btn" type="button" :disabled="page <= 1" @click="page--">上一页</button>
              <span class="portal-pager__now">{{ page }} / {{ pageCount }}</span>
              <button class="portal-pager__btn" type="button" :disabled="page >= pageCount" @click="page++">下一页</button>
              <label class="portal-pager__jump">
                前往
                <input
                  v-model.number="jumpTo"
                  class="portal-pager__input"
                  type="number"
                  min="1"
                  :max="pageCount"
                  aria-label="跳转页码"
                  @keydown.enter="goTo"
                />
                页
              </label>
            </div>
          </div>
        </template>

        <!-- 门户配置（P1）：应用信息 / 入口页 / 应用菜单，实现在独立面板里 -->
        <portal-config-panel v-else />
      </div>

      <!-- 工作区入口：一级首页上唯一能直达管理视图的地方；画布内仍可用「页面」菜单 -->
      <aside class="portal-home__rail" data-testid="portal-workspace" aria-label="工作区">
        <span class="portal-rail__label">工作区</span>
        <div class="portal-rail__list">
          <button
            v-for="w in WORKSPACES"
            :key="w.view"
            class="portal-rail__item"
            type="button"
            :data-testid="`portal-ws-${w.view}`"
            @click="store.switchView(w.view)"
          >
            <span class="portal-rail__name">{{ w.name }}</span>
            <span class="portal-rail__desc">{{ w.desc }}</span>
          </button>
        </div>
      </aside>
    </div>

    <!-- 新增 / 编辑：同一套字段，编码新增后不可改（改编码 = 换页面） -->
    <div v-if="form.open" class="portal-mask" @click.self="closeForm">
      <div
        class="portal-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="form.editing ? '编辑门户页' : '新增门户页'"
      >
        <div class="portal-dialog__head">
          <strong>{{ form.editing ? '编辑门户页' : '新增门户页' }}</strong>
          <button class="portal-dialog__close" type="button" aria-label="关闭" @click="closeForm">×</button>
        </div>
        <div class="portal-dialog__body">
          <label class="setter">
            <span class="setter__label">页面编码</span>
            <input
              v-model="form.id"
              class="setter__input portal-mono"
              type="text"
              spellcheck="false"
              :disabled="form.editing"
              placeholder="如 default_home"
              data-testid="portal-form-id"
            />
            <span class="setter__help">
              {{ form.editing ? '编码是页面主键，创建后不可改；要换编码请另建页面' : '字母或下划线开头，最长 64 位；同时作为运行时 pageId' }}
            </span>
          </label>
          <label class="setter">
            <span class="setter__label">页面名称</span>
            <input
              v-model="form.name"
              class="setter__input"
              type="text"
              placeholder="如 门户首页（留空 = 用编码）"
              data-testid="portal-form-name"
            />
          </label>
          <label class="setter">
            <span class="setter__label">排序</span>
            <input
              v-model="form.order"
              class="setter__input"
              type="number"
              step="1"
              placeholder="小的在前；留空 = 排在最后"
              data-testid="portal-form-order"
            />
          </label>
          <label class="setter">
            <span class="setter__label">备注</span>
            <input
              v-model="form.remark"
              class="setter__input"
              type="text"
              placeholder="运营说明，运行时不展示"
              data-testid="portal-form-remark"
            />
          </label>

          <p v-if="form.error" class="panel-err" data-testid="portal-form-error">{{ form.error }}</p>
        </div>
        <div class="portal-dialog__foot">
          <button class="op-btn" type="button" @click="closeForm">取消</button>
          <button
            class="op-btn op-btn--primary"
            type="button"
            data-testid="portal-form-submit"
            :disabled="form.saving"
            @click="submitForm"
          >{{ form.saving ? '保存中…' : form.editing ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useDesignerStore, type PortalListItem } from '../store/store'
import PortalConfigPanel from './PortalConfigPanel.vue'

const store = useDesignerStore()

/** 一级首页的两个页签：门户页面（清单） / 门户配置（应用信息 + 入口页 + 应用菜单） */
const tab = ref<'pages' | 'config'>('pages')

/** 工作区入口：首页右栏直达管理视图（画布内仍可用顶栏「页面」菜单） */
const WORKSPACES = [
  { view: 'model', name: '数据模型', desc: '字段与关系建模' },
  { view: 'rbac', name: '权限管理', desc: '角色与页面授权' },
  { view: 'theme', name: '主题配置', desc: '品牌色与圆角' },
  { view: 'webhook', name: '开放集成', desc: 'Webhook 订阅与投递' },
  { view: 'market', name: '物料市场', desc: '远程物料安装' },
] as const

/** 应用名（`GET /apps/config` 缺失时降级，不阻塞清单） */
const appName = computed(() => store.appConfig?.name?.trim() || '未命名应用')
const appInitial = computed(() => appName.value.slice(0, 1))

/** 入口页：只认 portal / page 两类；没配就是「未设置」 */
const entryLabel = computed(() => {
  const entry = store.appConfig?.entry
  if (!entry?.pageId) return '未设置'
  const named = store.pages.find((p) => p.id === entry.pageId)?.name
  return named || entry.pageId
})

/** 最近编辑：页面列表里最大的 updatedAt（ISO 串，只取到分钟） */
const lastEditedText = computed(() => {
  const times = store.pages
    .map((p) => p.updatedAt)
    .filter((t): t is string => !!t)
    .sort()
  const latest = times[times.length - 1]
  return latest ? `最近编辑 ${latest.slice(5, 16).replace('T', ' ')}` : '最近编辑 —'
})

/** 运行体内置页：与页面表无关，只做清单展示（不可编辑 / 删除） */
const BUILTINS = [
  { id: 'default_apps', name: '应用入口', note: '运行时首页（应用入口）' },
  { id: 'default_todo', name: '我的待办', note: '运行时待办页（/todo）' },
] as const

/** 查询草稿（点「查询」才写进 applied） */
const q = reactive({ name: '', id: '' })
const applied = reactive({ name: '', id: '' })

const page = ref(1)
const pageSize = ref(10)
const jumpTo = ref(1)
const selected = ref<Set<string>>(new Set())
const deleteArmed = ref(false)
const deleting = ref(false)
/** 下钻失败（openPage 报错）：留在清单就地提示，不带着旧内容进画布 */
const designError = ref('')
/** 脏态换页的「上膛」目标：等于某个 pageId 时，再点一次才真的丢弃并打开 */
const pendingSwitchTo = ref('')
let disarmTimer: ReturnType<typeof setTimeout> | undefined

function match(name: string, id: string): boolean {
  const n = applied.name.trim().toLowerCase()
  const i = applied.id.trim().toLowerCase()
  if (n && !name.toLowerCase().includes(n)) return false
  if (i && !id.toLowerCase().includes(i)) return false
  return true
}

interface BuiltinRow {
  kind: 'builtin'
  key: string
  id: string
  name: string
  note: string
  idx: number
}
interface DesignRow {
  kind: 'design'
  key: string
  page: PortalListItem
  idx: number
}

/** 在线设计页：store 已按 order 排好，这里只做过滤 */
const designRows = computed(() =>
  store.portalPages.filter((p) => p.type === 'portal' && match(p.name, p.id)),
)

/**
 * 系统内置行固定排最前（与云程截图一致），再拼在线设计页；
 * 分页按**合并后的行序**切，避免内置行在每页重复出现。
 */
const allRows = computed<Array<BuiltinRow | DesignRow>>(() => {
  const builtin = BUILTINS.filter((b) => match(b.name, b.id)).map<BuiltinRow>((b, i) => ({
    kind: 'builtin',
    key: `builtin:${b.id}`,
    id: b.id,
    name: b.name,
    note: b.note,
    idx: i + 1,
  }))
  const design = designRows.value.map<DesignRow>((p, i) => ({
    kind: 'design',
    key: `page:${p.id}`,
    page: p,
    idx: builtin.length + i + 1,
  }))
  return [...builtin, ...design]
})

const total = computed(() => allRows.value.length)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pagedRows = computed(() =>
  allRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
)

const allDesignSelected = computed(
  () => designRows.value.length > 0 && designRows.value.every((p) => selected.value.has(p.id)),
)
const selectedIds = computed(() => [...selected.value])

watch([total, pageSize], () => {
  if (page.value > pageCount.value) page.value = pageCount.value
  jumpTo.value = page.value
})
watch(page, (v) => {
  jumpTo.value = v
})
// 勾选集合只保留仍存在的行（删除 / 刷新后不残留）
watch(
  () => store.portalPages.map((p) => p.id).join(','),
  () => {
    const alive = new Set(store.portalPages.map((p) => p.id))
    selected.value = new Set([...selected.value].filter((id) => alive.has(id)))
  },
)

function applyQuery(): void {
  applied.name = q.name
  applied.id = q.id
  page.value = 1
}
function resetQuery(): void {
  q.name = ''
  q.id = ''
  applyQuery()
}
async function reload(): Promise<void> {
  pendingSwitchTo.value = ''
  designError.value = ''
  await store.loadPortalPages()
  page.value = 1
}

function toggleOne(id: string, on: boolean): void {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
  deleteArmed.value = false
}
function toggleAll(e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  selected.value = on ? new Set(designRows.value.map((p) => p.id)) : new Set()
  deleteArmed.value = false
}

/** 两步删除：第一次只「上膛」，5 秒不点自动复位 */
function armDelete(): void {
  deleteArmed.value = true
  clearTimeout(disarmTimer)
  disarmTimer = setTimeout(() => (deleteArmed.value = false), 5000)
}

async function removeOne(id: string): Promise<void> {
  // 单行删除也走两步：第一次点只是选中，再点才删
  if (!selected.value.has(id)) {
    selected.value = new Set([id])
    armDelete()
    return
  }
  if (!deleteArmed.value) {
    armDelete()
    return
  }
  await doDelete([id])
}

async function removeSelected(): Promise<void> {
  if (!selectedIds.value.length) return
  if (!deleteArmed.value) {
    armDelete()
    return
  }
  await doDelete(selectedIds.value)
}

async function doDelete(ids: string[]): Promise<void> {
  deleting.value = true
  deleteArmed.value = false
  clearTimeout(disarmTimer)
  try {
    for (const id of ids) {
      const ok = await store.deletePage(id)
      if (!ok) break
    }
    selected.value = new Set()
    await store.loadPortalPages()
  } finally {
    deleting.value = false
  }
}

/**
 * 页面设计（下钻到画布）：**先取 schema 成功，再切视图**。
 *
 * 旧实现是 `switchView('page')` → `openPage(id)`，有两个坑：
 * 1. 切视图那一刻画布用的还是上一次的 schema —— 慢网下先闪一帧旧页面 / 空画布；
 * 2. openPage 失败（页被别处删掉 / 网络错）时用户已经停在画布，`pageLoaded` 仍为 true，
 *    点「保存」会把旧内容写进新 pageId —— 跨页数据污染，且界面上看不出来。
 *
 * 另：换页会整体替换 schema，脏态下必须确认，否则未保存的修改被静默丢弃。
 */
async function design(id: string): Promise<void> {
  designError.value = ''
  // 回到「上次编辑的那一页」= 继续编辑：保留内存里未保存的 schema，不重新拉服务端覆盖
  if (id === store.pageId && store.pageLoaded) {
    pendingSwitchTo.value = ''
    await store.switchView('page')
    return
  }
  // 换页会整体替换 schema，脏态下先「上膛」、第二次点击才真丢。
  // 注意必须连 pageLoaded 一起判：`saveState` 的初始值就是 `dirty`（还没有页面可保存），
  // 只看它会在一进门户、还没打开过任何页时误弹确认。
  if (store.pageLoaded && store.saveState === 'dirty' && pendingSwitchTo.value !== id) {
    pendingSwitchTo.value = id
    return
  }
  pendingSwitchTo.value = ''
  const opened = await store.openPage(id)
  if (!opened) {
    // 失败留在清单：进画布只会让人对着旧内容继续编辑
    designError.value = store.statusText || `打开页面失败：${id}`
    return
  }
  await store.switchView('page')
}

/* ---------------- 新增 / 编辑弹层 ---------------- */

const form = reactive({
  open: false,
  editing: false,
  id: '',
  name: '',
  /** number 型 input 的 v-model 会自动转数字，故两种类型都收 */
  order: '' as string | number,
  remark: '',
  error: '',
  saving: false,
})

function openCreate(): void {
  Object.assign(form, {
    open: true,
    editing: false,
    id: '',
    name: '',
    order: '',
    remark: '',
    error: '',
    saving: false,
  })
}

function openEdit(p: PortalListItem): void {
  Object.assign(form, {
    open: true,
    editing: true,
    id: p.id,
    name: p.name,
    order: p.order === undefined ? '' : String(p.order),
    remark: p.remark ?? '',
    error: '',
    saving: false,
  })
}

function closeForm(): void {
  form.open = false
  form.saving = false
}

/** 空 = 不设置；非数字 = 报错（不静默变成 0）。注意 number 型 input 的 v-model 会自动转 number，两种都要收 */
function parseOrder(raw: string | number): { ok: true; value: number | undefined } | { ok: false } {
  const s = String(raw).trim()
  if (!s) return { ok: true, value: undefined }
  const n = Number(s)
  if (!Number.isFinite(n)) return { ok: false }
  return { ok: true, value: Math.trunc(n) }
}

async function submitForm(): Promise<void> {
  if (form.saving) return
  form.error = ''
  const order = parseOrder(form.order)
  if (!order.ok) {
    form.error = '排序必须是数字'
    return
  }
  form.saving = true
  try {
    const ok = form.editing
      ? await store.updatePortalMeta(form.id, {
          name: form.name,
          order: order.value === undefined ? null : order.value,
          remark: form.remark.trim() || null,
        })
      : await store.createPortalPage({
          id: form.id,
          name: form.name,
          order: order.value,
          remark: form.remark,
        })
    if (!ok) {
      form.error = store.statusText || '保存失败'
      return
    }
    form.open = false
    page.value = 1
  } finally {
    form.saving = false
  }
}

function goTo(): void {
  const n = Math.trunc(Number(jumpTo.value))
  page.value = Number.isFinite(n) ? Math.min(pageCount.value, Math.max(1, n)) : 1
}
</script>

<style scoped>
/*
 * 门户设计一级首页：单张白色工作台。
 * 组织手段只有三样 —— 字号层级、留白、1px 分隔线；不再叠灰底卡片、不再用彩色徽标块。
 */
.lc-portal-panel {
  max-width: 1240px;
}

.lc-portal-home {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-6);
  margin: 0 auto;
  padding: var(--lc-space-8) var(--lc-space-8) var(--lc-space-16);
}

/* ---------------- 应用条：身份 + 元信息 ---------------- */

.portal-appbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-3) var(--lc-space-4);
  min-height: 40px;
}
.portal-appbar__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-on-brand);
  background: var(--lc-action-primary);
  border-radius: var(--lc-radius-sm);
}
.portal-appbar__id {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  min-width: 0;
}
.portal-appbar__name {
  margin: 0;
  font-size: var(--lc-font-h1);
  font-weight: var(--lc-weight-semibold);
  line-height: var(--lc-lh-h1);
  color: var(--lc-text-primary);
}
.portal-appbar__kind {
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-compact);
  color: var(--lc-text-secondary);
}
.portal-appbar__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-2);
  margin-left: auto;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.portal-appbar__meta + .portal-appbar__meta {
  padding-left: var(--lc-space-3);
  border-left: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-appbar__err {
  flex-basis: 100%;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-danger);
}

/* ---------------- 页签 ---------------- */

.portal-tabs {
  display: flex;
  gap: var(--lc-space-6);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-tabs__btn {
  margin-bottom: -1px;
  padding: var(--lc-space-2-5) 0 var(--lc-space-3);
  font-family: inherit;
  font-size: var(--lc-font-body);
  line-height: var(--lc-leading-ui);
  color: var(--lc-text-secondary);
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color var(--lc-duration-fast) var(--lc-ease-standard);
}
.portal-tabs__btn:hover {
  color: var(--lc-text-primary);
}
.portal-tabs__btn--on {
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
  border-bottom-color: var(--lc-action-primary);
  cursor: default;
}
.portal-tabs__btn:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 2px;
}

/* ---------------- 主体：主工作区 + 工作区侧栏 ---------------- */

.portal-home__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 224px;
  column-gap: var(--lc-space-10);
  align-items: stretch;
}
.portal-home__main {
  min-width: 0;
}

/* 侧栏用一条竖线与主区分离，条目之间用横线，不再是一叠等高卡片 */
.portal-home__rail {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-3);
  padding-left: var(--lc-space-6);
  border-left: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-rail__label {
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-secondary);
}
.portal-rail__list {
  display: flex;
  flex-direction: column;
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-rail__item {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  margin: 0 calc(var(--lc-space-2) * -1);
  padding: var(--lc-space-2-5) var(--lc-space-2);
  font-family: inherit;
  text-align: left;
  background: none;
  border: 0;
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
  transition: background-color var(--lc-duration-fast) var(--lc-ease-standard);
}
.portal-rail__item:hover {
  background: var(--lc-bg-subtle);
}
.portal-rail__item:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
.portal-rail__name {
  font-size: var(--lc-font-body-sm);
  font-weight: var(--lc-weight-medium);
  color: var(--lc-text-primary);
}
.portal-rail__desc {
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-compact);
  color: var(--lc-text-secondary);
}

/* ---------------- 区块头 ---------------- */

.portal-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--lc-space-4);
}
.portal-section-head__text {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1);
  min-width: 0;
}
.portal-section__title {
  margin: 0;
  font-size: var(--lc-font-h2);
  font-weight: var(--lc-weight-semibold);
  line-height: var(--lc-lh-h2);
  color: var(--lc-text-primary);
}
.portal-section__note {
  margin: 0;
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-readable);
  color: var(--lc-text-secondary);
}
.portal-section-head__ops {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--lc-space-2);
}

/* ---------------- 查询与批量操作 ---------------- */

.portal-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-3);
  margin-top: var(--lc-space-5);
  padding-bottom: var(--lc-space-3);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-tools__search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-2);
}
.portal-field {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
}
.portal-field__label {
  flex-shrink: 0;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.portal-field__input {
  width: 168px;
}
.portal-tools__bulk {
  display: flex;
  align-items: center;
  gap: var(--lc-space-2);
  margin-left: auto;
}
.portal-tools__count {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}

/* 安静的文字按钮：查询 / 刷新 / 重置 / 批量删除共用 */
.portal-quiet {
  padding: var(--lc-space-1) var(--lc-space-1-5);
  font-family: inherit;
  font-size: var(--lc-font-body-sm);
  line-height: var(--lc-leading-ui);
  color: var(--lc-text-secondary);
  background: none;
  border: 0;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
  transition:
    color var(--lc-duration-fast) var(--lc-ease-standard),
    background-color var(--lc-duration-fast) var(--lc-ease-standard);
}
.portal-quiet:hover:not(:disabled) {
  color: var(--lc-text-primary);
  background: var(--lc-bg-subtle);
}
.portal-quiet:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.portal-quiet:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
.portal-quiet--boxed {
  padding: var(--lc-btn-pad-y) var(--lc-btn-pad-x);
  color: var(--lc-text-label);
  background: var(--lc-bg-surface);
  border: var(--lc-border-width) solid var(--lc-btn-default-border);
  border-radius: var(--lc-btn-radius);
}
.portal-quiet--boxed:hover:not(:disabled) {
  color: var(--lc-action-primary);
  background: var(--lc-bg-surface);
  border-color: var(--lc-action-primary);
}
.portal-quiet--danger {
  color: var(--lc-text-danger);
}
.portal-quiet--danger:hover:not(:disabled) {
  color: var(--lc-text-danger);
  background: var(--lc-status-danger-bg);
}

/* ---------------- 状态提示 ---------------- */

.portal-hint {
  margin: var(--lc-space-3) 0 0;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.portal-status {
  margin: var(--lc-space-4) 0 0;
}
.portal-design-err {
  margin: var(--lc-space-3) 0 0;
}
.portal-dirty-hint {
  margin: var(--lc-space-2) 0 0;
  color: var(--lc-text-danger);
}

/* ---------------- 门户表格 ---------------- */

.portal-table-wrap {
  margin-top: var(--lc-space-2);
  overflow-x: auto;
}
.portal-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: var(--lc-font-body-sm);
}
.portal-table th,
.portal-table td {
  padding: var(--lc-space-3) var(--lc-space-2);
  text-align: left;
  vertical-align: middle;
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-table th {
  padding-top: var(--lc-space-2);
  padding-bottom: var(--lc-space-2);
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-medium);
  color: var(--lc-text-secondary);
}
.portal-table th:first-child,
.portal-table td:first-child {
  padding-left: 0;
}
.portal-table th:last-child,
.portal-table td:last-child {
  padding-right: 0;
}
.portal-table tbody tr:last-child td {
  border-bottom: 0;
}
.portal-table input[type='checkbox'] {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--lc-action-primary);
  cursor: pointer;
}
.portal-table input[type='checkbox']:disabled {
  cursor: not-allowed;
}
.portal-row {
  transition: background-color var(--lc-duration-fast) var(--lc-ease-standard);
}
.portal-row:hover {
  background: var(--lc-bg-subtle);
}
.portal-col-check {
  width: 36px;
}
.portal-col-type {
  width: 92px;
}
.portal-col-order {
  width: 60px;
}
.portal-col-remark {
  width: 24%;
}
.portal-col-ops {
  width: 148px;
  text-align: right;
}
.portal-table td.portal-col-order {
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.portal-name {
  display: block;
  overflow: hidden;
  font-size: var(--lc-font-body);
  font-weight: var(--lc-weight-medium);
  line-height: var(--lc-leading-ui);
  color: var(--lc-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.portal-id {
  display: block;
  margin-top: var(--lc-space-0-5);
  overflow: hidden;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-compact);
  color: var(--lc-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.portal-remark {
  overflow: hidden;
  color: var(--lc-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.portal-muted {
  color: var(--lc-text-secondary);
}

/* 类型：圆点 + 文字，只让圆点承担颜色 */
.portal-type {
  display: inline-flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-label);
  white-space: nowrap;
}
.portal-type__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  background: var(--lc-action-primary);
  border-radius: var(--lc-radius-pill);
}
.portal-type--builtin .portal-type__dot {
  background: var(--lc-status-warning);
}

.portal-link {
  padding: 0;
  font-family: inherit;
  font-size: var(--lc-font-body-sm);
  line-height: var(--lc-leading-ui);
  color: var(--lc-text-secondary);
  background: none;
  border: 0;
  cursor: pointer;
  transition: color var(--lc-duration-fast) var(--lc-ease-standard);
}
.portal-link + .portal-link {
  margin-left: var(--lc-space-3);
}
.portal-link:hover {
  color: var(--lc-action-primary);
}
.portal-link--main {
  font-weight: var(--lc-weight-medium);
  color: var(--lc-action-primary);
}
.portal-link--danger:hover {
  color: var(--lc-text-danger);
}
.portal-link:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}

.portal-table td.portal-empty {
  padding: var(--lc-space-16) var(--lc-space-3);
  font-size: var(--lc-font-body-sm);
  color: var(--lc-text-secondary);
  text-align: center;
}

/* ---------------- 分页 ---------------- */

.portal-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-3);
  margin-top: var(--lc-space-2);
  padding-top: var(--lc-space-3);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.portal-pager__total strong {
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.portal-pager__nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lc-space-3);
  margin-left: auto;
}
.portal-pager__size-label,
.portal-pager__jump {
  display: inline-flex;
  align-items: center;
  gap: var(--lc-space-1-5);
}
.portal-pager__size,
.portal-pager__input {
  height: 26px;
  padding: 0 var(--lc-space-1);
  font-family: inherit;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-primary);
  background: var(--lc-bg-surface);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-xs);
}
.portal-pager__input {
  width: 44px;
}
.portal-pager__btn {
  padding: var(--lc-space-1) var(--lc-space-1-5);
  font-family: inherit;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
  background: none;
  border: 0;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
  transition: background-color var(--lc-duration-fast) var(--lc-ease-standard);
}
.portal-pager__btn:hover:not(:disabled) {
  color: var(--lc-text-primary);
  background: var(--lc-bg-subtle);
}
.portal-pager__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.portal-pager__btn:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
.portal-pager__now {
  font-family: var(--lc-font-mono);
  color: var(--lc-text-primary);
}

/* ---------------- 新增 / 编辑弹层 ---------------- */

.portal-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--lc-space-4);
  background: var(--lc-overlay-scrim);
}
.portal-dialog {
  display: flex;
  flex-direction: column;
  width: 440px;
  max-width: calc(100vw - var(--lc-space-8));
  background: var(--lc-bg-surface);
  border-radius: var(--lc-radius-lg);
  box-shadow: var(--lc-shadow-e4);
}
.portal-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--lc-space-4) var(--lc-space-6);
  border-bottom: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-dialog__head strong {
  font-size: var(--lc-font-body-lg);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.portal-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-family: inherit;
  font-size: var(--lc-font-h2);
  line-height: var(--lc-leading-label);
  color: var(--lc-text-secondary);
  background: none;
  border: 0;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
}
.portal-dialog__close:hover {
  color: var(--lc-text-primary);
  background: var(--lc-bg-subtle);
}
.portal-dialog__close:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
.portal-dialog__body {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-3);
  padding: var(--lc-space-6);
}
.portal-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--lc-space-2);
  padding: var(--lc-space-4) var(--lc-space-6);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.portal-mono {
  font-family: var(--lc-font-mono);
}

/* ---------------- 响应式：侧栏落到下方，查询行折行 ---------------- */

@media (max-width: 1023px) {
  .portal-home__body {
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--lc-space-6);
  }
  .portal-home__rail {
    padding-top: var(--lc-space-4);
    padding-left: 0;
    border-top: var(--lc-border-width) solid var(--lc-border-default);
    border-left: 0;
  }
  .portal-rail__list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--lc-space-4);
  }
}

@media (max-width: 767px) {
  .lc-portal-home {
    padding: var(--lc-space-5) var(--lc-space-4) var(--lc-space-10);
  }
  .portal-appbar__facts {
    width: 100%;
    margin-left: 0;
  }
  .portal-section-head {
    flex-direction: column;
  }
  .portal-section-head__ops {
    align-self: stretch;
    justify-content: flex-end;
  }
  .portal-field__input {
    width: 132px;
  }
  .portal-table {
    min-width: 620px;
  }
}
</style>
