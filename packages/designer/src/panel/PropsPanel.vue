<!--
  PropsPanel.vue —— 属性面板（批 3：按 SettingDesc.setter 渲染可编辑表单）
  - 支持 input/number/switch/select 4 种 setter 真渲染；其余 setter 只读占位不静默丢配置（D-A4）。
  - 写路径统一走 store.setProp（schema-ops updateProp：无前缀 → props、style.* → style）；
    schema 引用替换触发 lc-renderer 重建（B-24），画布立即刷新。
  - input 用 @input 实时提交（验收「改 label 画布立即刷新」）；store 值与 DOM 同步一致，
    Vue patch el.value 为 no-op，不打断中文输入法 composition。
  - label 隐式包裹控件（每行单控件），点击文字聚焦控件。
-->
<template>
  <div class="lc-props-panel">
    <div class="panel-head">
      <h3 class="panel-title">属性</h3>
    </div>

    <!-- 页面级：类型 + 随类型切换的配置区块（Phase 2 批 2；与选中状态无关，始终可见） -->
    <div class="lc-props-panel__pagecfg">
      <label class="setter">
        <span class="setter__label">页面类型</span>
        <span class="setter__ctl">
          <select
            class="setter__select"
            data-testid="page-type"
            :value="store.schema.type"
            @change="onPageType($event)"
          >
            <option value="form">表单</option>
            <option value="list">列表（配置驱动）</option>
            <option value="detail">详情（配置驱动）</option>
            <option value="portal">门户（卡片 + 拖拽区）</option>
            <option value="custom">自定义</option>
          </select>
        </span>
        <span class="setter__help">list/detail/portal 为标准页：运行时按下方配置渲染；list/detail 画布根容器仅占位，portal 画布展示拖拽区</span>
      </label>

      <!-- form/custom：提交目标模型（批 4 / D-A11） -->
      <label v-if="isFormLike" class="setter">
        <span class="setter__label">提交模型</span>
        <span class="setter__ctl">
          <select
            class="setter__select"
            data-testid="submit-model"
            :value="store.submitModelId ?? ''"
            @change="onSubmitModel($event)"
          >
            <option value="">（不提交到模型）</option>
            <option v-for="m in store.models" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </span>
        <span class="setter__help">
          {{ store.submitModelId
            ? `提交新增记录 → POST /models/${store.submitModelId}/records`
            : '不配置则页面无法提交（submit.dataSourceId 缺失）' }}
        </span>
      </label>

      <!-- list：列表配置（批 2） -->
      <div v-if="store.schema.type === 'list'" class="lc-props-panel__stdcfg" data-testid="list-config">
        <label class="setter">
          <span class="setter__label">数据模型</span>
          <span class="setter__ctl">
            <select
              class="setter__select"
              data-testid="list-model"
              :value="store.schema.list?.modelId ?? ''"
              @change="onStdModel('list', $event)"
            >
              <option value="">（选择模型）</option>
              <option v-for="m in store.models" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </span>
          <span class="setter__help">
            {{ store.schema.list?.modelId
              ? `运行时 GET /models/${store.schema.list.modelId}/records`
              : '必选：列表数据来源（未配置由 validate 红字拦截）' }}
          </span>
        </label>

        <div v-if="store.modelFields.length" class="lc-props-panel__cols">
          <div class="cols__head">
            展示字段（已选 {{ (store.schema.list?.columns ?? []).length }}）
          </div>
          <label v-for="f in store.modelFields" :key="f.key" class="cols__item">
            <input
              type="checkbox"
              :checked="(store.schema.list?.columns ?? []).includes(f.key)"
              @change="toggleListCol(f.key, $event)"
            />
            <span class="cols__name">{{ f.name }}</span>
            <code class="cols__key">{{ f.key }}</code>
          </label>
          <div class="cols__hint">一项不勾 = 运行时展示模型全部字段</div>
        </div>

        <label class="setter">
          <span class="setter__label">详情页 id</span>
          <span class="setter__ctl">
            <input
              class="setter__input"
              data-testid="list-detail-page"
              type="text"
              :value="store.schema.list?.detailPageId ?? ''"
              placeholder="点行跳转到的页面（可空）"
              @input="setListStr('detailPageId', $event)"
            />
          </span>
        </label>

        <label class="setter">
          <span class="setter__label">每页条数</span>
          <span class="setter__ctl">
            <input
              class="setter__input"
              data-testid="list-page-size"
              type="number"
              :value="store.schema.list?.pagination?.size ?? 10"
              @change="onPageSize($event)"
            />
          </span>
        </label>
      </div>

      <!-- detail：详情配置（批 2） -->
      <div v-if="store.schema.type === 'detail'" class="lc-props-panel__stdcfg" data-testid="detail-config">
        <label class="setter">
          <span class="setter__label">数据模型</span>
          <span class="setter__ctl">
            <select
              class="setter__select"
              data-testid="detail-model"
              :value="store.schema.detail?.modelId ?? ''"
              @change="onStdModel('detail', $event)"
            >
              <option value="">（选择模型）</option>
              <option v-for="m in store.models" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </span>
          <span class="setter__help">
            {{ store.schema.detail?.modelId
              ? '由路由参数 rid 定位单条记录：GET records?filter={"id":rid}'
              : '必选：详情数据来源（未配置由 validate 红字拦截）' }}
          </span>
        </label>

        <div v-if="store.modelFields.length" class="lc-props-panel__cols">
          <div class="cols__head">
            展示字段（已选 {{ (store.schema.detail?.fields ?? []).length }}）
          </div>
          <label v-for="f in store.modelFields" :key="f.key" class="cols__item">
            <input
              type="checkbox"
              :checked="(store.schema.detail?.fields ?? []).includes(f.key)"
              @change="toggleDetailField(f.key, $event)"
            />
            <span class="cols__name">{{ f.name }}</span>
            <code class="cols__key">{{ f.key }}</code>
          </label>
          <div class="cols__hint">一项不勾 = 运行时展示模型全部字段</div>
        </div>

        <label class="setter">
          <span class="setter__label">返回页 id</span>
          <span class="setter__ctl">
            <input
              class="setter__input"
              data-testid="detail-back-page"
              type="text"
              :value="store.schema.detail?.backPageId ?? ''"
              placeholder="返回按钮跳转页（可空 = 历史栈返回）"
              @input="setDetailStr('backPageId', $event)"
            />
          </span>
        </label>
      </div>

      <!-- portal：门户配置（批 4） -->
      <div v-if="store.schema.type === 'portal'" class="lc-props-panel__stdcfg" data-testid="portal-config">
        <label class="setter">
          <span class="setter__label">门户标题</span>
          <span class="setter__ctl">
            <input
              class="setter__input"
              data-testid="portal-title"
              type="text"
              :value="store.schema.portal?.title ?? ''"
              placeholder="缺省用页面名"
              @input="setPortalTitle($event)"
            />
          </span>
        </label>

        <label class="setter">
          <span class="setter__label">卡片列数</span>
          <span class="setter__ctl">
            <input
              class="setter__input"
              data-testid="portal-columns"
              type="number"
              min="1"
              max="6"
              :value="store.schema.portal?.columns ?? 2"
              @change="setPortalColumns($event)"
            />
          </span>
          <span class="setter__help">1~6 列（缺省 2）；运行时卡片按列均分换行</span>
        </label>

        <div class="cols__head">导航卡片（{{ portalCards.length }}）</div>
        <div
          v-for="(card, i) in portalCards"
          :key="i"
          class="lc-props-panel__card"
          :data-testid="`portal-card-${i}`"
        >
          <label class="setter">
            <span class="setter__label">标题</span>
            <span class="setter__ctl">
              <input
                class="setter__input"
                :data-testid="`portal-card-title-${i}`"
                type="text"
                :value="card.title"
                @input="setCardField(i, 'title', $event)"
              />
            </span>
          </label>
          <label class="setter">
            <span class="setter__label">跳转页 id</span>
            <span class="setter__ctl">
              <input
                class="setter__input"
                :data-testid="`portal-card-page-${i}`"
                type="text"
                :value="card.pageId ?? ''"
                placeholder="低代码页面 id"
                @input="setCardField(i, 'pageId', $event)"
              />
            </span>
          </label>
          <label class="setter">
            <span class="setter__label">图标</span>
            <span class="setter__ctl">
              <input
                class="setter__input"
                :data-testid="`portal-card-icon-${i}`"
                type="text"
                :value="card.icon ?? ''"
                placeholder="如 home / 新"
                @input="setCardField(i, 'icon', $event)"
              />
            </span>
          </label>
          <label class="setter">
            <span class="setter__label">说明</span>
            <span class="setter__ctl">
              <input
                class="setter__input"
                :data-testid="`portal-card-desc-${i}`"
                type="text"
                :value="card.desc ?? ''"
                @input="setCardField(i, 'desc', $event)"
              />
            </span>
          </label>
          <button
            class="op-btn op-btn--danger"
            type="button"
            :data-testid="`portal-card-del-${i}`"
            @click="removeCard(i)"
          >
            删除卡片
          </button>
        </div>
        <button class="op-btn" type="button" data-testid="portal-card-add" @click="addCard">+ 添加卡片</button>
      </div>

      <panel-state
        v-if="store.modelError"
        kind="error"
        testid="model-error"
        :title="store.modelError"
        text="数据源不可用时下拉只会是空列表。恢复连接后重试即可，不必重开页面。"
        action-text="重试"
        inline
        @action="onRetryModels"
      />
    </div>

    <template v-if="store.selectedNode">
      <div class="lc-props-panel__info">
        <div class="lc-props-panel__title">
          {{ store.selectedMeta?.title ?? store.selectedNode.componentName }}
        </div>
        <code class="lc-props-panel__id">{{ store.selectedId }}</code>
      </div>

      <div class="lc-props-panel__ops">
        <button
          class="op-btn"
          type="button"
          :disabled="store.isRootSelected"
          title="上移（快捷键不可用时的兜底）"
          @click="store.moveById(store.selectedId, -1)"
        >
          上移
        </button>
        <button
          class="op-btn"
          type="button"
          :disabled="store.isRootSelected"
          title="下移"
          @click="store.moveById(store.selectedId, 1)"
        >
          下移
        </button>
        <button
          class="op-btn op-btn--danger"
          type="button"
          :disabled="store.isRootSelected"
          title="删除（或按 Delete 键；root 不可删）"
          @click="store.removeById(store.selectedId)"
        >
          删除
        </button>
      </div>

      <!-- 节点级：字段绑定（批 4 / D-A11 —— hasField 物料才有提交键） -->
      <div v-if="showFieldBinding" class="lc-props-panel__fieldbind">
        <label class="setter">
          <span class="setter__label">绑定字段</span>
          <span class="setter__ctl">
            <select
              class="setter__select"
              data-testid="field-binding"
              :value="fieldName"
              :disabled="store.fieldsLoading"
              @change="onFieldBind($event)"
            >
              <option value="">（未绑定）</option>
              <option v-for="f in store.modelFields" :key="f.key" :value="f.key">
                {{ f.name }}（{{ f.key }}）
              </option>
            </select>
          </span>
          <span class="setter__help">{{ fieldBindHint }}</span>
        </label>
      </div>

      <!-- 批 5 / D-A13：最小动作绑定（事件 → 动作；仅无参动作可写，有参动作占位 Phase 2） -->
      <div v-if="nodeEvents.length && store.selectedNode" class="lc-props-panel__actions">
        <label v-for="ev in nodeEvents" :key="ev" class="setter">
          <span class="setter__label">事件 · {{ ev }}</span>
          <span class="setter__ctl">
            <select
              class="setter__select"
              :data-testid="`action-${ev}`"
              :value="boundAction(ev)"
              @change="onActionBind(ev, $event)"
            >
              <option value="">（无动作）</option>
              <option
                v-for="t in store.selectedMeta?.actionTypes ?? []"
                :key="t"
                :value="t"
                :disabled="!NO_PARAM_ACTIONS.has(t)"
              >
                {{ ACTION_LABELS[t] ?? t }}{{ NO_PARAM_ACTIONS.has(t) ? '' : ' · 参数配置 Phase 2' }}
              </option>
            </select>
          </span>
          <span class="setter__help">{{ actionHint }}</span>
        </label>
      </div>

      <div v-if="settings.length" class="lc-props-panel__settings">
        <label v-for="s in settings" :key="s.key" class="setter">
          <span class="setter__label">
            {{ s.label }}<em v-if="s.required" class="setter__req" title="必填">*</em>
          </span>
          <span class="setter__ctl">
            <input
              v-if="s.setter === 'input'"
              class="setter__input"
              type="text"
              :value="str(read(s))"
              :placeholder="s.placeholder ?? ''"
              @input="onInput(s, $event)"
            />
            <input
              v-else-if="s.setter === 'number'"
              class="setter__input"
              type="number"
              :value="str(read(s))"
              :placeholder="s.placeholder ?? ''"
              @change="onNumber(s, $event)"
            />
            <input
              v-else-if="s.setter === 'switch'"
              class="setter__switch"
              type="checkbox"
              :checked="read(s) === true"
              @change="onSwitch(s, $event)"
            />
            <select
              v-else-if="s.setter === 'select'"
              class="setter__select"
              :value="str(read(s))"
              @change="onSelect(s, $event)"
            >
              <option v-for="o in s.options ?? []" :key="String(o.value)" :value="String(o.value)">
                {{ o.label }}
              </option>
            </select>
            <textarea
              v-else-if="s.setter === 'textarea'"
              class="setter__input setter__textarea"
              rows="3"
              :value="str(read(s))"
              :placeholder="s.placeholder ?? ''"
              @input="onInput(s, $event)"
            />
            <span v-else-if="s.setter === 'optionList'" class="setter__options">
              <span v-for="(opt, oi) in optionRows(s)" :key="oi" class="setter__option-row">
                <input
                  class="setter__input setter__option-label"
                  type="text"
                  :value="opt.label"
                  placeholder="显示名"
                  @input="onOptionLabel(s, oi, $event)"
                />
                <input
                  class="setter__input setter__option-value"
                  type="text"
                  :value="opt.value"
                  placeholder="值"
                  @input="onOptionValue(s, oi, $event)"
                />
                <button
                  class="setter__option-del"
                  type="button"
                  title="删除该选项"
                  @click="onOptionDel(s, oi)"
                >×</button>
              </span>
              <button class="setter__option-add" type="button" @click="onOptionAdd(s)">＋ 添加选项</button>
            </span>
            <input
              v-else-if="s.setter === 'color'"
              class="setter__color"
              type="color"
              :value="colorValue(s)"
              @input="onColor(s, $event)"
            />
            <span
              v-else
              class="setter-unsupported"
              :title="s.help ?? `${s.key} · ${s.setter}`"
            >{{ s.setter }} · Phase 2 支持</span>
          </span>
          <span v-if="s.help" class="setter__help">{{ s.help }}</span>
        </label>
      </div>
      <panel-state
        v-else
        kind="empty"
        testid="props-empty"
        title="该节点无可配置属性"
        text="该物料没有可编辑的设置项 —— 可以在画布内拖动调整位置，或从物料面板换一个物料。"
        inline
      />

      <!-- 批 6 / D-P2-12：节点权限点（按钮级；非 root；空 = 所有角色可见）。
           放 settings 之后：不打乱既有 setter 的 DOM 顺序（既有测试按序断言） -->
      <div v-if="!store.isRootSelected" class="lc-props-panel__perm">
        <label class="setter">
          <span class="setter__label">权限点</span>
          <span class="setter__ctl">
            <input
              class="setter__input"
              type="text"
              data-testid="node-perm"
              :value="store.selectedNode.perm ?? ''"
              placeholder="留空 = 所有角色可见；如 emp_submit"
              @input="onPerm($event)"
            />
          </span>
          <span class="setter__help">
            无该权限点的角色运行时整节点不渲染；'*' 通配角色恒可见
          </span>
        </label>
      </div>
    </template>

    <panel-state
      v-else
      kind="empty"
      testid="props-no-selection"
      title="未选中任何节点"
      text="点击画布中任意节点"
      inline
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import type { PageType, SettingDesc, PortalCard, PortalPageConfig } from '@lc/schema'
import { useDesignerStore } from '../store/store'
import { readNodeValue } from '../core/schema-ops'
import { TOKEN_LITERAL } from '@lc/tokens'
import PanelState from '../components/PanelState.vue'

const store = useDesignerStore()

/** 选中节点的 settings（Page/未知组件为 []；condition 条件求值属 Phase 2，先全部展示） */
const settings = computed<SettingDesc[]>(() => store.selectedMeta?.settings ?? [])

/* ---------------- Phase 2 批 2：页面类型 + list/detail 配置 ---------------- */

/** form/custom → 提交模型区块；list/detail/portal → 标准页配置区块（门户无提交模型） */
const isFormLike = computed(() => {
  const t = store.schema.type
  return t !== 'list' && t !== 'detail' && t !== 'portal'
})

function onPageType(e: Event): void {
  store.setPageType((e.target as HTMLSelectElement).value as PageType)
}

function onStdModel(kind: 'list' | 'detail', e: Event): void {
  const modelId = (e.target as HTMLSelectElement).value
  if (kind === 'list') store.setListConfig({ modelId })
  else store.setDetailConfig({ modelId })
}

function toggleListCol(key: string, e: Event): void {
  const cur = store.schema.list?.columns ?? []
  const checked = (e.target as HTMLInputElement).checked
  store.setListConfig({ columns: checked ? [...cur, key] : cur.filter((k) => k !== key) })
}

function toggleDetailField(key: string, e: Event): void {
  const cur = store.schema.detail?.fields ?? []
  const checked = (e.target as HTMLInputElement).checked
  store.setDetailConfig({ fields: checked ? [...cur, key] : cur.filter((k) => k !== key) })
}

/** 文本配置实时提交（input 每键 touch —— 与属性面板 input 约定一致；空串 → undefined 清除） */
function setListStr(key: 'detailPageId', e: Event): void {
  const v = (e.target as HTMLInputElement).value
  store.setListConfig({ [key]: v || undefined })
}

function setDetailStr(key: 'backPageId', e: Event): void {
  const v = (e.target as HTMLInputElement).value
  store.setDetailConfig({ [key]: v || undefined })
}

/* ---------------- Phase 3 批 4：门户配置 ---------------- */

/** 门户卡片（缺省空数组） */
const portalCards = computed<PortalCard[]>(() => store.schema.portal?.cards ?? [])

function setPortalTitle(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  store.setPortalConfig({ title: v || undefined })
}

/** 卡片列数（失焦提交；1~6，非法回退 2） */
function setPortalColumns(e: Event): void {
  const n = Number.parseInt((e.target as HTMLInputElement).value, 10)
  const columns = Number.isFinite(n) && n > 0 ? Math.min(6, n) : 2
  store.setPortalConfig({ columns })
}

/** 编辑第 i 张卡片的某字段（cards 整体替换回传，逐个保留其余卡片） */
function setCardField(i: number, key: keyof PortalCard, e: Event): void {
  const v = (e.target as HTMLInputElement).value
  const cards = portalCards.value.map((c, idx) => (idx === i ? { ...c, [key]: v } : c))
  store.setPortalConfig({ cards } as Partial<PortalPageConfig>)
}

function addCard(): void {
  store.setPortalConfig({ cards: [...portalCards.value, { title: '新卡片' }] })
}

function removeCard(i: number): void {
  store.setPortalConfig({ cards: portalCards.value.filter((_, idx) => idx !== i) })
}

/** 每页条数（失焦提交；1~100 与服务端 size 上限一致，非法回退 10） */
function onPageSize(e: Event): void {
  const n = Number.parseInt((e.target as HTMLInputElement).value, 10)
  const size = Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 10
  store.setListConfig({ pagination: { mode: 'page', size } })
}

/* ---------------- 批 4：字段绑定（D-A11） ---------------- */

/** 只有 hasField 物料才有「提交键」—— 与协议 2.2 字段绑定名同源 */
const showFieldBinding = computed(() => store.selectedMeta?.hasField === true)

/** 当前节点已绑定的字段（与 settings 中 `字段名` 输入框同源，同一值两处展示） */
const fieldName = computed(() =>
  store.selectedNode ? str(readNodeValue(store.selectedNode, 'name') ?? '') : '',
)

/** 字段下拉的引导文案（未配提交模型 → 引导先配；加载中 → 明示；已配 → 等加载/空态） */
const fieldBindHint = computed(() => {
  if (!store.submitModelId) return '先在上方选择「提交模型」，此处列出该模型字段'
  if (store.fieldsLoading) return '正在加载字段…'
  if (store.modelFields.length) return '提交时以该字段为键写入记录（与下方「字段名」同源）'
  return store.modelError || '该模型暂无字段'
})

/** 错误态出口：强制重拉模型列表（绕过「已加载即跳过」的缓存） */
function onRetryModels(): void {
  void store.loadModels(true)
}

/** 面板挂载即拉模型列表（API 已由 designer-web 在 App setup 中注入） */
onMounted(() => {
  void store.loadModels()
})

/**
 * 「字段多选/绑定」归属模型的**单一来源**（批 2 合并原 submitModelId watch）：
 * 按页面类型取 list/detail 配置的模型，其余类型取提交模型 ——
 * 单一 computed 保证同一时刻只有一个 watch 源，避免双 watch 互相覆盖字段缓存。
 */
const boundModelId = computed(() => {
  const t = store.schema.type
  if (t === 'list') return store.schema.list?.modelId ?? ''
  if (t === 'detail') return store.schema.detail?.modelId ?? ''
  return store.submitModelId ?? ''
})

watch(
  boundModelId,
  (id) => {
    void store.loadModelFields(id)
  },
  { immediate: true },
)

function onSubmitModel(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  store.setSubmitModel(v || null)
}

function onFieldBind(e: Event): void {
  store.setFieldBinding(store.selectedId, (e.target as HTMLSelectElement).value)
}

/* ---------------- 批 6 / D-P2-12：节点权限点 ---------------- */

/** 写权限点（空 = 清除；格式错由保存门禁 E_PERM_FORMAT 红字拦，不在 setter 即时报错） */
function onPerm(e: Event): void {
  store.setNodePerm(store.selectedId, (e.target as HTMLInputElement).value)
}

/* ---------------- 批 5 / D-A13：最小动作绑定 ---------------- */

/** 无参动作（协议 Action 中 `value?` 可选）—— 有参动作的参数编辑器属 Phase 2 */
const NO_PARAM_ACTIONS = new Set<string>(['submit', 'back', 'scan', 'location'])

/** 动作类型 → 中文标签（缺省回退 type 原文） */
const ACTION_LABELS: Record<string, string> = {
  submit: '提交表单',
  back: '返回上一页',
  scan: '扫码',
  location: '获取定位',
  navigate: '页面跳转',
  toast: '轻提示',
  http: '接口请求',
}

/** 物料声明的事件列表（无事件物料不出本区块） */
const nodeEvents = computed(() => store.selectedMeta?.events ?? [])

const actionHint = computed(() => '选「提交表单」即触发页面提交链路（校验 → 写模型）；带参数的动作 Phase 2 支持')

/** 回填：当前节点在该事件上绑定的动作类型（未绑定 → ''） */
function boundAction(event: string): string {
  if (!store.selectedNode) return ''
  const actions = readNodeValue(store.selectedNode, 'event')
  if (!Array.isArray(actions)) return ''
  const hit = actions.find((a) => (a as { event?: unknown }).event === event) as { type?: unknown } | undefined
  return typeof hit?.type === 'string' ? hit.type : ''
}

function onActionBind(event: string, e: Event): void {
  store.setNodeAction(store.selectedId, event, (e.target as HTMLSelectElement).value || null)
}

function read(s: SettingDesc): unknown {
  return store.selectedNode ? readNodeValue(store.selectedNode, s.key) : undefined
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v)
}

/* ---------------- setter 写路径（统一 → store.setProp） ---------------- */

function onInput(s: SettingDesc, e: Event): void {
  store.setProp(store.selectedId, s.key, (e.target as HTMLInputElement).value)
}

function onNumber(s: SettingDesc, e: Event): void {
  const raw = (e.target as HTMLInputElement).value
  if (raw === '') {
    store.setProp(store.selectedId, s.key, undefined) // 清空 → 删键（JSON 序列化丢弃 undefined）
    return
  }
  const n = Number(raw)
  store.setProp(store.selectedId, s.key, Number.isNaN(n) ? undefined : n)
}

function onSwitch(s: SettingDesc, e: Event): void {
  store.setProp(store.selectedId, s.key, (e.target as HTMLInputElement).checked)
}

function onSelect(s: SettingDesc, e: Event): void {
  const raw = (e.target as HTMLSelectElement).value
  // 按 options 反查原值，保住非字符串类型（boolean/number option）
  const opt = (s.options ?? []).find((o) => String(o.value) === raw)
  store.setProp(store.selectedId, s.key, opt ? opt.value : raw)
}

/* ---------------- Phase 2 批 3：optionList / color setter ---------------- */

interface OptionRow {
  label: string
  value: string
}

/** 读选项行（统一转串展示；写回时 coerce 保型，见 writeOptionRows） */
function optionRows(s: SettingDesc): OptionRow[] {
  const v = read(s)
  if (!Array.isArray(v)) return []
  return v.map((o) => ({
    label: String((o as { label?: unknown }).label ?? ''),
    value: String((o as { value?: unknown }).value ?? ''),
  }))
}

/** 纯数字串归一为 number（保住 options[].value 与 formData 值的严格相等匹配） */
function coerce(raw: string): string | number {
  const t = raw.trim()
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t)
  return raw
}

function writeOptionRows(s: SettingDesc, rows: OptionRow[]): void {
  store.setProp(
    store.selectedId,
    s.key,
    rows.map((r) => ({ label: r.label, value: coerce(r.value) })),
  )
}

function onOptionLabel(s: SettingDesc, i: number, e: Event): void {
  const rows = optionRows(s)
  rows[i] = { ...rows[i], label: (e.target as HTMLInputElement).value }
  writeOptionRows(s, rows)
}

function onOptionValue(s: SettingDesc, i: number, e: Event): void {
  const rows = optionRows(s)
  rows[i] = { ...rows[i], value: (e.target as HTMLInputElement).value }
  writeOptionRows(s, rows)
}

function onOptionDel(s: SettingDesc, i: number): void {
  writeOptionRows(
    s,
    optionRows(s).filter((_, ri) => ri !== i),
  )
}

function onOptionAdd(s: SettingDesc): void {
  writeOptionRows(s, [...optionRows(s), { label: '', value: '' }])
}

/** color 值兜底（非法/缺失给主品牌色，避免 input[type=color] 报错；
 *  该属性值必须是字面量，故取 tokens.ts 的具名常量而非 CSS 变量） */
function colorValue(s: SettingDesc): string {
  const v = read(s)
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : TOKEN_LITERAL.brand500
}

function onColor(s: SettingDesc, e: Event): void {
  store.setProp(store.selectedId, s.key, (e.target as HTMLInputElement).value)
}
</script>

<style scoped>
/* 令牌：../styles/tokens.css
   共用件（.setter* / .op-btn* / .panel-err / .lc-state* / .panel-title）在 ../styles/panel.css，
   本块只保留 PropsPanel 特有的布局类，以及需要对共用件做的**局部改写**。 */
.lc-props-panel__info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-2);
  margin-bottom: 10px;
}
.lc-props-panel__title {
  font-weight: 600;
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-props-panel__id {
  flex-shrink: 0;
  background: var(--lc-bg-subtle);
  padding: 2px 6px;
  border-radius: var(--lc-radius-xs);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-link);
}
.lc-props-panel__ops {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
/* 局部改写：上移/下移/删除 三键等宽平铺（共用 .op-btn 不设 flex，避免影响其他面板） */
.lc-props-panel__ops .op-btn {
  flex: 1;
  padding: 5px 0;
}

/* 页面级 / 节点级区块：与 settings 隔离，避免与通用 setter 混排 */
.lc-props-panel__pagecfg,
.lc-props-panel__fieldbind {
  padding-bottom: var(--lc-space-3);
  margin-bottom: var(--lc-space-3);
  border-bottom: var(--lc-border-width) var(--lc-border-dashed) var(--lc-border-default);
}
.lc-props-panel__fieldbind {
  margin-top: 2px;
}

.lc-props-panel__settings {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
}

/* list/detail 标准页配置区块 */
.lc-props-panel__stdcfg {
  margin-top: var(--lc-space-2);
  padding: 10px;
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
  background: var(--lc-bg-subtle);
}
.cols__head {
  margin: var(--lc-space-1) 0 6px;
  font-size: var(--lc-font-caption);
  font-weight: 600;
  color: var(--lc-text-label);
}
/* 门户卡片编辑块（批 4） */
.lc-props-panel__card {
  margin: 6px 0;
  padding: 8px;
  border: var(--lc-border-width) dashed var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
}
.cols__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-label);
  cursor: pointer;
}
.cols__name {
  flex: 1;
  min-width: 0;
}
.cols__key {
  padding: 1px 5px;
  border-radius: var(--lc-radius-xs);
  background: var(--lc-bg-surface);
  color: var(--lc-text-link);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
}
.cols__hint {
  margin-top: 6px;
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
</style>
