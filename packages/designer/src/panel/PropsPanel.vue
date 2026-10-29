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
      <span class="panel-head__meta">{{ store.selectedNode ? '节点' : '页面' }}</span>
    </div>

    <!-- 页面级：类型 + 随类型切换的配置区块。
         2026-10-29：收进底部可折叠区 —— 选中节点时默认折叠，不把页面配置顶在节点属性上方；
         未选中节点时默认展开，首次进入就能改页面类型。 -->
    <section class="lc-props-panel__pageset" data-testid="page-settings">
      <button
        class="pageset__head"
        type="button"
        data-testid="page-settings-toggle"
        aria-controls="page-settings-body"
        :aria-expanded="pageOpen"
        @click="pageOpen = !pageOpen"
      >
        <svg
          class="pageset__chevron"
          :class="{ 'pageset__chevron--closed': !pageOpen }"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
        <span class="pageset__title">页面设置</span>
        <span class="pageset__summary" data-testid="page-settings-summary">{{ pageSummary }}</span>
      </button>
      <div id="page-settings-body" v-show="pageOpen" class="lc-props-panel__pagecfg">
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

        <label class="setter">
          <span class="setter__label">行内编辑</span>
          <span class="setter__ctl">
            <input
              type="checkbox"
              data-testid="list-editable"
              :checked="store.schema.list?.editable === true"
              @change="setListBool('editable', $event)"
            />
          </span>
          <span class="setter__help">
            每行显示「编辑」：展开行内编辑器（只编辑展示列），保存走 PUT + If-Match
          </span>
        </label>

        <label class="setter">
          <span class="setter__label">批量删除</span>
          <span class="setter__ctl">
            <input
              type="checkbox"
              data-testid="list-deletable"
              :checked="store.schema.list?.deletable === true"
              @change="setListBool('deletable', $event)"
            />
          </span>
          <span class="setter__help">
            显示勾选框与批量删除：逐条 DELETE + 每行 revision 的 If-Match，409 保留该行
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

        <label class="setter">
          <span class="setter__label">允许编辑</span>
          <span class="setter__ctl">
            <input
              type="checkbox"
              data-testid="detail-editable"
              :checked="store.schema.detail?.editable === true"
              @change="setDetailBool('editable', $event)"
            />
          </span>
          <span class="setter__help">
            详情页显示「编辑」：保存走 PUT + If-Match，409 冲突不覆盖他人修改
          </span>
        </label>

        <label class="setter">
          <span class="setter__label">允许删除</span>
          <span class="setter__ctl">
            <input
              type="checkbox"
              data-testid="detail-deletable"
              :checked="store.schema.detail?.deletable === true"
              @change="setDetailBool('deletable', $event)"
            />
          </span>
          <span class="setter__help">详情页显示「删除」：二次确认后走 DELETE + If-Match（服务端软删）</span>
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

        <div class="lc-props-panel__cards">
          <div class="cols__head">
            <span>导航卡片</span>
            <span class="cols__count">{{ portalCards.length }} 张</span>
          </div>

          <div
            v-for="(card, i) in portalCards"
            :key="i"
            class="lc-props-panel__card"
            :class="{ 'lc-props-panel__card--open': isCardOpen(i) }"
            :data-testid="`portal-card-${i}`"
          >
            <div class="card-row__head">
              <button
                class="card-row__toggle"
                type="button"
                :aria-expanded="isCardOpen(i)"
                :data-testid="`portal-card-toggle-${i}`"
                @click="toggleCard(i)"
              >
                <span class="card-row__glyph" aria-hidden="true">{{ cardGlyph(card) }}</span>
                <span class="card-row__title">{{ card.title || '未命名卡片' }}</span>
                <span
                  v-if="cardTargetGlyph(card)"
                  class="card-row__target"
                  :title="cardTarget(card)"
                  :aria-label="cardTarget(card)"
                >{{ cardTargetGlyph(card) }}</span>
                <span v-if="card.badge" class="card-row__badge">{{ card.badge }}</span>
                <svg
                  class="card-row__chevron"
                  :class="{ 'card-row__chevron--closed': !isCardOpen(i) }"
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
                </svg>
              </button>
              <span class="card-row__ops">
                <button
                  class="card-row__op"
                  type="button"
                  title="上移"
                  :disabled="i === 0"
                  :data-testid="`portal-card-up-${i}`"
                  @click="moveCard(i, -1)"
                >↑</button>
                <button
                  class="card-row__op"
                  type="button"
                  title="下移"
                  :disabled="i === portalCards.length - 1"
                  :data-testid="`portal-card-down-${i}`"
                  @click="moveCard(i, 1)"
                >↓</button>
                <button
                  class="card-row__op"
                  type="button"
                  title="复制卡片"
                  :data-testid="`portal-card-copy-${i}`"
                  @click="duplicateCard(i)"
                >⧉</button>
                <button
                  class="card-row__op card-row__op--del"
                  type="button"
                  title="删除卡片"
                  :data-testid="`portal-card-del-${i}`"
                  @click="removeCard(i)"
                >×</button>
              </span>
            </div>

            <div v-show="isCardOpen(i)" class="card-row__body">
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
                <span class="setter__label">说明</span>
                <span class="setter__ctl">
                  <input
                    class="setter__input"
                    :data-testid="`portal-card-desc-${i}`"
                    type="text"
                    :value="card.desc ?? ''"
                    placeholder="副标题（可空）"
                    @input="setCardField(i, 'desc', $event)"
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
                    placeholder="内置名或单个字符"
                    list="portal-card-icons"
                    @input="setCardField(i, 'icon', $event)"
                  />
                </span>
              </label>
              <label class="setter">
                <span class="setter__label">目标页面</span>
                <span class="setter__ctl">
                  <input
                    class="setter__input"
                    :data-testid="`portal-card-page-${i}`"
                    type="text"
                    :value="card.pageId ?? ''"
                    placeholder="低代码页面 id"
                    list="portal-card-pages"
                    @input="setCardField(i, 'pageId', $event)"
                  />
                </span>
              </label>
              <label class="setter">
                <span class="setter__label">外部链接</span>
                <span class="setter__ctl">
                  <input
                    class="setter__input"
                    :data-testid="`portal-card-url-${i}`"
                    type="text"
                    :value="card.url ?? ''"
                    placeholder="https://…（填了优先于页面）"
                    @input="setCardField(i, 'url', $event)"
                  />
                </span>
              </label>
              <label class="setter">
                <span class="setter__label">角标</span>
                <span class="setter__ctl">
                  <input
                    class="setter__input"
                    :data-testid="`portal-card-badge-${i}`"
                    type="text"
                    maxlength="6"
                    :value="card.badge ?? ''"
                    placeholder="如 3 / 新（可空）"
                    @input="setCardField(i, 'badge', $event)"
                  />
                </span>
              </label>
            </div>
          </div>

          <button class="op-btn" type="button" data-testid="portal-card-add" @click="addCard">
            ＋ 添加卡片
          </button>
        </div>

        <datalist id="portal-card-icons">
          <option v-for="ic in CARD_ICONS" :key="ic.value" :value="ic.value">{{ ic.label }}</option>
        </datalist>
        <datalist id="portal-card-pages">
          <option v-for="p in store.pages" :key="p.id" :value="p.id">{{ p.name }}</option>
        </datalist>
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
    </section>

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
          class="op-btn"
          type="button"
          :disabled="store.isRootSelected"
          title="复制到当前节点之后"
          @click="duplicateSelected"
        >
          复制
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

      <!-- 批 5 / D-A13：动作绑定（事件 → 动作）。
           2026-10-29：navigate / toast 开放参数编辑；http 等复杂动作仍只读。 -->
      <div v-if="nodeEvents.length && store.selectedNode" class="lc-props-panel__actions">
        <label v-for="ev in nodeEvents" :key="ev" class="setter setter--stack">
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
                :disabled="!CONFIGURABLE_ACTIONS.has(t)"
              >
                {{ ACTION_LABELS[t] ?? t }}{{ CONFIGURABLE_ACTIONS.has(t) ? '' : ' · 参数待补' }}
              </option>
            </select>
          </span>

          <!-- navigate：选目标页面（其余 params 暂保留原值，交给高级 JSON） -->
          <span v-if="boundAction(ev) === 'navigate'" class="setter__params">
            <select
              class="setter__select"
              :data-testid="`action-${ev}-page`"
              :value="navigatePageId(ev)"
              @change="onNavigateTarget(ev, $event)"
            >
              <option value="">（选择目标页面）</option>
              <option v-for="p in store.pages" :key="p.id" :value="p.id">
                {{ p.name }}（{{ p.id }}）
              </option>
            </select>
          </span>

          <!-- toast：文案 -->
          <span v-else-if="boundAction(ev) === 'toast'" class="setter__params">
            <input
              class="setter__input"
              type="text"
              :data-testid="`action-${ev}-text`"
              :value="toastText(ev)"
              placeholder="提示文案（可含 $expr: 表达式）"
              @input="onToastText(ev, $event)"
            />
          </span>

          <span class="setter__help">{{ actionHintFor(ev) }}</span>
        </label>
      </div>

      <div v-if="settings.length" class="lc-props-panel__settings">
        <label
          v-for="s in settings"
          :key="s.key"
          class="setter"
          :class="{ 'setter--stack': s.setter === 'json' && !!itemsKind }"
        >
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
            <select
              v-else-if="s.setter === 'pagePicker'"
              class="setter__select"
              :value="str(read(s))"
              data-testid="setter-page-picker"
              @change="onSelect(s, $event)"
            >
              <option value="">未选择页面</option>
              <option v-for="p in store.pages" :key="p.id" :value="p.id">
                {{ p.name }}（{{ p.id }}）
              </option>
            </select>
            <!-- expression：`$expr:` 前缀走受限表达式语法校验；普通文本视为静态值 -->
            <span v-else-if="s.setter === 'expression'" class="setter__expr">
              <input
                class="setter__input"
                type="text"
                :data-testid="`setter-expr-${s.key}`"
                :value="str(read(s))"
                :placeholder="s.placeholder ?? '$expr: formData.xxx'"
                :aria-invalid="exprError[s.key] ? 'true' : undefined"
                @input="onExpressionInput(s, $event)"
              />
              <span v-if="exprError[s.key]" class="setter__expr-err" role="alert">
                {{ exprError[s.key] }}
              </span>
              <span v-else class="setter__expr-hint">静态值，或 $expr: 表达式</span>
            </span>
            <textarea
              v-else-if="s.setter === 'textarea'"
              class="setter__input setter__textarea"
              rows="3"
              :value="str(read(s))"
              :placeholder="s.placeholder ?? ''"
              @input="onInput(s, $event)"
            />
            <!-- json：有对应门户物料时先给可视化条目编辑器，高级 JSON 折在下面；
                 边打边解析，语法错时保留上一次合法值并红字提示（不静默清空配置） -->
            <span v-else-if="s.setter === 'json' && itemsKind" class="setter__items-wrap">
              <items-editor
                :model-value="read(s)"
                :kind="itemsKind"
                :pages="store.pages"
                @update:model-value="onItemsUpdate(s, $event)"
              />
              <details class="items-advanced">
                <summary class="items-advanced__summary">高级 · 直接编辑 JSON</summary>
                <textarea
                  class="setter__input setter__textarea"
                  rows="4"
                  :value="jsonDraft[s.key] ?? jsonText(s)"
                  :placeholder="s.placeholder ?? ''"
                  :aria-label="`${s.label} JSON`"
                  @input="onJsonInput(s, $event)"
                  @blur="onJsonBlur(s)"
                />
              </details>
            </span>
            <textarea
              v-else-if="s.setter === 'json'"
              class="setter__input setter__textarea"
              rows="4"
              :value="jsonDraft[s.key] ?? jsonText(s)"
              :placeholder="s.placeholder ?? ''"
              @input="onJsonInput(s, $event)"
              @blur="onJsonBlur(s)"
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
            <span v-else-if="s.setter === 'pageItemList'" class="setter__items" data-testid="setter-page-items">
              <span
                v-for="(it, ii) in pageItemRows(s)"
                :key="ii"
                class="setter__item-row"
                :data-testid="`page-item-${ii}`"
              >
                <input
                  class="setter__input setter__item-icon"
                  type="text"
                  maxlength="2"
                  :value="it.icon"
                  placeholder="字"
                  :aria-label="`第 ${ii + 1} 项图标`"
                  :data-testid="`page-item-icon-${ii}`"
                  @input="onPageItemField(s, ii, 'icon', $event)"
                />
                <input
                  class="setter__input setter__item-title"
                  type="text"
                  :value="it.title"
                  placeholder="名称"
                  :aria-label="`第 ${ii + 1} 项名称`"
                  :data-testid="`page-item-title-${ii}`"
                  @input="onPageItemField(s, ii, 'title', $event)"
                />
                <select
                  class="setter__input setter__item-page"
                  :value="it.pageId"
                  :aria-label="`第 ${ii + 1} 项目标页面`"
                  :data-testid="`page-item-page-${ii}`"
                  @change="onPageItemField(s, ii, 'pageId', $event)"
                >
                  <option value="">不跳转</option>
                  <option v-for="p in store.pages" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
                <span class="setter__item-ops">
                  <button
                    class="setter__option-del"
                    type="button"
                    title="上移"
                    :disabled="ii === 0"
                    :data-testid="`page-item-up-${ii}`"
                    @click="movePageItem(s, ii, -1)"
                  >↑</button>
                  <button
                    class="setter__option-del"
                    type="button"
                    title="下移"
                    :disabled="ii === pageItemRows(s).length - 1"
                    :data-testid="`page-item-down-${ii}`"
                    @click="movePageItem(s, ii, 1)"
                  >↓</button>
                  <button
                    class="setter__option-del"
                    type="button"
                    title="删除该入口"
                    :data-testid="`page-item-del-${ii}`"
                    @click="delPageItem(s, ii)"
                  >×</button>
                </span>
              </span>
              <button
                class="setter__option-add"
                type="button"
                data-testid="page-item-add"
                @click="addPageItem(s)"
              >＋ 添加入口</button>
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
          <span
            v-if="s.setter === 'json' && jsonError[s.key]"
            class="setter__json-err"
            role="alert"
          >{{ jsonError[s.key] }}</span>
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { PageType, SettingDesc, PortalCard, PortalPageConfig } from '@lc/schema'
import { checkExpr } from '@lc/expression'
import { useDesignerStore } from '../store/store'
import { readNodeValue } from '../core/schema-ops'
import { TOKEN_LITERAL } from '@lc/tokens'
import PanelState from '../components/PanelState.vue'
import ItemsEditor, { type ItemKind } from './ItemsEditor.vue'

const store = useDesignerStore()

/** 页面设置折叠态：未选中节点时展开；一旦选中节点就收起，把上方空间让给节点属性 */
const pageOpen = ref(!store.selectedNode)
watch(
  () => store.selectedId,
  (id) => {
    pageOpen.value = !id
  },
)

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

/** 列表写操作开关：未勾选写 undefined（保持「缺省 = 只读」的协议语义） */
function setListBool(key: 'editable' | 'deletable', e: Event): void {
  const checked = (e.target as HTMLInputElement).checked
  store.setListConfig({ [key]: checked || undefined })
}

function setDetailStr(key: 'backPageId', e: Event): void {
  const v = (e.target as HTMLInputElement).value
  store.setDetailConfig({ [key]: v || undefined })
}

/** 详情页写操作开关：未勾选写 undefined（保持「缺省 = 只读」的协议语义） */
function setDetailBool(key: 'editable' | 'deletable', e: Event): void {
  const checked = (e.target as HTMLInputElement).checked
  store.setDetailConfig({ [key]: checked || undefined })
}

/* ---------------- Phase 3 批 4：门户配置 ---------------- */

/** 门户卡片（缺省空数组） */
const portalCards = computed<PortalCard[]>(() => store.schema.portal?.cards ?? [])

/** 页面设置摘要：折叠时也看得出当前页型与规模 */
const pageSummary = computed(() => {
  const t = store.schema.type
  if (t === 'portal') return `门户 · ${portalCards.value.length} 张卡片`
  if (t === 'list') {
    return store.schema.list?.modelId ? `列表 · ${store.schema.list.modelId}` : '列表 · 未选模型'
  }
  if (t === 'detail') {
    return store.schema.detail?.modelId ? `详情 · ${store.schema.detail.modelId}` : '详情 · 未选模型'
  }
  return store.submitModelId ? `表单 · 提交到 ${store.submitModelId}` : '表单 · 未配提交模型'
})

/* ---------------- 门户卡片行：展开态 / 行内操作 ---------------- */

/** 展开态按索引存；增删或换序后清空，避免展开错行 */
const cardOpen = reactive<Record<number, boolean>>({})

function isCardOpen(i: number): boolean {
  return cardOpen[i] === true
}

function toggleCard(i: number): void {
  cardOpen[i] = !cardOpen[i]
}

/** 关闭全部，再展开指定行（-1 = 全部关闭） */
function resetCardOpen(open: number): void {
  for (const k of Object.keys(cardOpen)) delete cardOpen[Number(k)]
  if (open >= 0) cardOpen[open] = true
}

/** 图标输入框的候选（卡片渲染器同款字符集；也允许任意单字） */
const CARD_ICONS = [
  { value: 'home', label: '首页' },
  { value: 'user', label: '用户' },
  { value: 'set', label: '设置' },
  { value: 'date', label: '日期' },
  { value: 'search', label: '搜索' },
  { value: 'more', label: '更多' },
  { value: 'success', label: '通过' },
  { value: 'warn', label: '提醒' },
  { value: 'info', label: '说明' },
]
const CARD_GLYPHS: Record<string, string> = {
  success: '✓',
  warn: '⚠',
  error: '✕',
  info: 'ℹ',
  home: '⌂',
  user: '👤',
  set: '⚙',
  date: '📅',
  search: '🔍',
  more: '⋯',
  back: '‹',
}

function cardGlyph(card: PortalCard): string {
  const n = (card.icon ?? '').trim()
  if (!n) return '▦'
  return CARD_GLYPHS[n] ?? n.slice(0, 1)
}

function cardTarget(card: PortalCard): string {
  if (card.url) return '外部链接'
  if (card.pageId) return '跳转低代码页面'
  return ''
}

/** 行尾目标标记：箭头替代「页面 / 外部链接」文字，把宽度留给标题 */
function cardTargetGlyph(card: PortalCard): string {
  if (card.url) return '↗'
  if (card.pageId) return '›'
  return ''
}

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
  const cards = [...portalCards.value, { title: '新卡片' }]
  store.setPortalConfig({ cards })
  resetCardOpen(cards.length - 1) // 新卡直接展开，省一次点击
}

function removeCard(i: number): void {
  store.setPortalConfig({ cards: portalCards.value.filter((_, idx) => idx !== i) })
  resetCardOpen(-1)
}

function moveCard(i: number, dir: -1 | 1): void {
  const cards = [...portalCards.value]
  const to = i + dir
  if (to < 0 || to >= cards.length) return
  const [card] = cards.splice(i, 1)
  if (card) cards.splice(to, 0, card)
  store.setPortalConfig({ cards })
  resetCardOpen(-1)
}

function duplicateCard(i: number): void {
  const card = portalCards.value[i]
  if (!card) return
  const cards = [...portalCards.value]
  cards.splice(i + 1, 0, { ...card, title: `${card.title} 副本` })
  store.setPortalConfig({ cards })
  resetCardOpen(i + 1)
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

/** 可在右栏直接完成配置的动作；其余复杂动作（http 等）仍只读 */
const CONFIGURABLE_ACTIONS = new Set<string>([
  'submit',
  'back',
  'scan',
  'location',
  'navigate',
  'toast',
])

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

/** 当前事件的完整动作（回填参数用；undefined = 未绑定） */
function boundActionObj(event: string): { type?: unknown; value?: unknown } | undefined {
  if (!store.selectedNode) return undefined
  const actions = readNodeValue(store.selectedNode, 'event')
  if (!Array.isArray(actions)) return undefined
  return actions.find((a) => (a as { event?: unknown }).event === event) as
    | { type?: unknown; value?: unknown }
    | undefined
}

/** 回填：当前节点在该事件上绑定的动作类型（未绑定 → ''） */
function boundAction(event: string): string {
  const type = boundActionObj(event)?.type
  return typeof type === 'string' ? type : ''
}

/** 当前动作的 value 对象（只读副本；非对象按空对象处理） */
function boundActionValue(event: string): Record<string, unknown> {
  const v = boundActionObj(event)?.value
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
}

function actionHintFor(event: string): string {
  switch (boundAction(event)) {
    case 'navigate':
      return '运行时跳转到所选低代码页面；这里只改 pageId，params 保留原值'
    case 'toast':
      return '运行时弹出轻提示；文案支持 $expr: 表达式'
    case 'submit':
      return '触发页面提交链路：校验通过后写模型'
    case 'back':
      return '返回上一页（历史栈）'
    default:
      return 'http 等复杂动作暂只读；其余动作选中即生效'
  }
}

function onActionBind(event: string, e: Event): void {
  const type = (e.target as HTMLSelectElement).value || null
  // 切到带参动作时给最小合法骨架；无参动作不带 value
  const value =
    type === 'navigate' ? { pageId: '' } : type === 'toast' ? { text: '' } : undefined
  store.setNodeAction(store.selectedId, event, type, value)
}

function navigatePageId(event: string): string {
  return String(boundActionValue(event).pageId ?? '')
}

function toastText(event: string): string {
  return String(boundActionValue(event).text ?? '')
}

function onNavigateTarget(event: string, e: Event): void {
  store.setNodeAction(store.selectedId, event, 'navigate', {
    ...boundActionValue(event),
    pageId: (e.target as HTMLSelectElement).value,
  })
}

function onToastText(event: string, e: Event): void {
  store.setNodeAction(store.selectedId, event, 'toast', {
    ...boundActionValue(event),
    text: (e.target as HTMLInputElement).value,
  })
}

/** 复制当前节点：copy + paste（粘贴定位在选中节点之后），新节点自动选中 */
function duplicateSelected(): void {
  if (store.isRootSelected) return
  if (store.copyById(store.selectedId)) store.paste()
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

/* ---------------- 2026-10-29 P2：pageItemList setter（魔方 / 入口列表） ---------------- */

interface PageItemRow {
  icon: string
  title: string
  pageId: string
}

/** 读入口行（缺字段按空串，保证编辑时不出现 undefined） */
function pageItemRows(s: SettingDesc): PageItemRow[] {
  const v = read(s)
  if (!Array.isArray(v)) return []
  return v.map((o) => ({
    icon: String((o as { icon?: unknown }).icon ?? ''),
    title: String((o as { title?: unknown }).title ?? ''),
    pageId: String((o as { pageId?: unknown }).pageId ?? ''),
  }))
}

/** 写回：三个键都保留（空串也写），避免「删了图标顺手丢了 pageId」这类合并错误 */
function writePageItems(s: SettingDesc, rows: PageItemRow[]): void {
  store.setProp(
    store.selectedId,
    s.key,
    rows.map((r) => ({ icon: r.icon, title: r.title, pageId: r.pageId })),
  )
}

function onPageItemField(
  s: SettingDesc,
  i: number,
  field: keyof PageItemRow,
  e: Event,
): void {
  const rows = pageItemRows(s)
  const row = rows[i]
  if (!row) return
  rows[i] = { ...row, [field]: (e.target as HTMLInputElement | HTMLSelectElement).value }
  writePageItems(s, rows)
}

function addPageItem(s: SettingDesc): void {
  writePageItems(s, [...pageItemRows(s), { icon: '', title: '', pageId: '' }])
}

function delPageItem(s: SettingDesc, i: number): void {
  writePageItems(
    s,
    pageItemRows(s).filter((_, ri) => ri !== i),
  )
}

function movePageItem(s: SettingDesc, i: number, dir: -1 | 1): void {
  const rows = pageItemRows(s)
  const to = i + dir
  if (to < 0 || to >= rows.length) return
  const [item] = rows.splice(i, 1)
  if (item) rows.splice(to, 0, item)
  writePageItems(s, rows)
}

/** color 值兜底（非法/缺失给主品牌色，避免 input[type=color] 报错；
 *  该属性值必须是字面量，故取 tokens.ts 的具名常量而非 CSS 变量） */function colorValue(s: SettingDesc): string {
  const v = read(s)
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : TOKEN_LITERAL.brand500
}

function onColor(s: SettingDesc, e: Event): void {
  store.setProp(store.selectedId, s.key, (e.target as HTMLInputElement).value)
}

/* ---------------- 2026-10-29：门户物料 items 可视化编辑器 ---------------- */

/** 有 items 的门户物料 → 编辑器形态；其它物料继续走纯 JSON */
const ITEM_KINDS: Record<string, ItemKind> = {
  PortalBanner: 'banner',
  PortalNotice: 'notice',
  PortalStat: 'stat',
  PortalTodo: 'todo',
  PortalFlowList: 'flow',
}

const itemsKind = computed<ItemKind | undefined>(() => {
  const name = store.selectedMeta?.name
  return name ? ITEM_KINDS[name] : undefined
})

/** 可视化编辑写回：清掉同 key 的 JSON 草稿，避免旧草稿覆盖新值 */
function onItemsUpdate(s: SettingDesc, value: unknown): void {
  delete jsonDraft[s.key]
  delete jsonError[s.key]
  store.setProp(store.selectedId, s.key, value)
}

/* ---------------- 2026-10-29：expression setter ---------------- */

const EXPR_PREFIX = '$expr:'
/** 表达式语法错误提示（按 setter key；空 = 无错） */
const exprError = reactive<Record<string, string>>({})

/**
 * 写值 + 校验：
 *   - 空串 → 清除；
 *   - 不以 `$expr:` 开头 → 视为静态值，合法；
 *   - `$expr:` 前缀 → 用受限表达式引擎 checkExpr 校验剩余部分（不做求值）。
 */
function onExpressionInput(s: SettingDesc, e: Event): void {
  const raw = (e.target as HTMLInputElement).value
  store.setProp(store.selectedId, s.key, raw)
  const t = raw.trim()
  if (!t || !t.startsWith(EXPR_PREFIX)) {
    delete exprError[s.key]
    return
  }
  const body = t.slice(EXPR_PREFIX.length).trim()
  if (!body) {
    exprError[s.key] = '表达式为空：$expr: 后面要写表达式'
    return
  }
  const r = checkExpr(body)
  if (r.ok) {
    delete exprError[s.key]
    return
  }
  exprError[s.key] = `表达式语法错误${r.pos !== undefined ? `（位置 ${r.pos}）` : ''}：${r.message ?? '无法解析'}`
}

/* ---------------- 门户组件库（批 2）：json setter ---------------- */

/** 编辑中的 JSON 文本按 setter key 存草稿：边打边解析，但不回写格式化文本（否则光标跳位） */
const jsonDraft = reactive<Record<string, string>>({})
/** 解析失败提示（按 key；空 = 无错） */
const jsonError = reactive<Record<string, string>>({})

/** store 值 → 展示文本（对象/数组格式化 2 空格；历史字符串原样给出） */
function jsonText(s: SettingDesc): string {
  const v = read(s)
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return ''
  }
}

/**
 * 实时解析：合法则写回**解析后的值**（数组/对象），非法只提示不改写 ——
 * 打字到一半（如 `[{"tit`）时不能把已知配置清空。
 */
function onJsonInput(s: SettingDesc, e: Event): void {
  const raw = (e.target as HTMLTextAreaElement).value
  jsonDraft[s.key] = raw
  if (raw.trim() === '') {
    jsonError[s.key] = ''
    store.setProp(store.selectedId, s.key, undefined)
    return
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    jsonError[s.key] = ''
    store.setProp(store.selectedId, s.key, parsed)
  } catch {
    jsonError[s.key] = 'JSON 语法错误：画布仍保留上一次合法内容'
  }
}

/** 失焦后丢掉草稿，回到 store 的格式化展示（有语法错时保留草稿，避免用户丢输入） */
function onJsonBlur(s: SettingDesc): void {
  if (!jsonError[s.key]) delete jsonDraft[s.key]
}

// 换选中节点时清空草稿：否则会看到上一个节点的编辑中间态
watch(
  () => store.selectedId,
  () => {
    for (const k of Object.keys(jsonDraft)) delete jsonDraft[k]
    for (const k of Object.keys(jsonError)) delete jsonError[k]
    for (const k of Object.keys(exprError)) delete exprError[k]
    resetCardOpen(-1)
  },
)
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
  margin-bottom: var(--lc-space-2-5);
}
.lc-props-panel__title {
  font-weight: var(--lc-weight-semibold);
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-props-panel__id {
  flex-shrink: 0;
  background: var(--lc-bg-subtle);
  padding: var(--lc-space-0-5) var(--lc-space-1-5);
  border-radius: var(--lc-radius-xs);
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  color: var(--lc-text-link);
}
.lc-props-panel__ops {
  display: flex;
  gap: var(--lc-space-1-5);
  margin-bottom: 14px;
}
/* 局部改写：上移/下移/删除 三键等宽平铺（共用 .op-btn 不设 flex，避免影响其他面板） */
.lc-props-panel__ops .op-btn {
  flex: 1;
  padding: var(--lc-btn-pad-y) 0;
}

/* 面板根：flex column 让「页面设置」能靠 order 落到节点属性之后（2026-10-29） */
.lc-props-panel {
  display: flex;
  flex-direction: column;
}

/* 页面级 / 节点级区块：与 settings 隔离，避免与通用 setter 混排 */
.lc-props-panel__pagecfg,
.lc-props-panel__fieldbind {
  padding-bottom: var(--lc-space-3);
  margin-bottom: var(--lc-space-3);
  border-bottom: var(--lc-border-width) var(--lc-border-dashed) var(--lc-border-default);
}

/* 页面设置：底部可折叠区。未选中节点时展开，选中节点时收起为一行摘要。 */
.lc-props-panel__pageset {
  order: 2;
  margin-top: var(--lc-space-3);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.lc-props-panel__pageset .lc-props-panel__pagecfg {
  padding-bottom: var(--lc-space-1);
  margin-bottom: 0;
  border-bottom: none;
}
.pageset__head {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  width: 100%;
  min-height: 34px;
  padding: var(--lc-space-1) 0;
  font-family: inherit;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}
.pageset__head:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: -1px;
}
.pageset__chevron {
  flex: 0 0 12px;
  color: var(--lc-text-tertiary);
  transition: transform var(--lc-duration-fast) var(--lc-ease-standard);
}
.pageset__chevron--closed {
  transform: rotate(-90deg);
}
.pageset__title {
  flex: 1;
  min-width: 0;
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.pageset__summary {
  flex-shrink: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.pageset__head:hover .pageset__summary {
  color: var(--lc-text-secondary);
}
.lc-props-panel__fieldbind {
  margin-top: var(--lc-space-0-5);
}

.lc-props-panel__settings {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
}

/* list/detail 标准页配置区块 */
.lc-props-panel__stdcfg {
  margin-top: var(--lc-space-2);
  padding: var(--lc-space-2-5);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-md);
  background: var(--lc-bg-subtle);
}
.cols__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--lc-space-2);
  margin: var(--lc-space-1) 0 var(--lc-space-1-5);
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-label);
}
.cols__count {
  flex-shrink: 0;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  font-weight: var(--lc-weight-regular);
  color: var(--lc-text-tertiary);
}

/* 门户卡片：折叠行 + 展开编辑（2026-10-29）。不再是叠起来的虚线大卡片。 */
.lc-props-panel__card {
  margin: 0 0 var(--lc-space-1-5);
  border: var(--lc-border-width) solid var(--lc-border-default);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-bg-surface);
  overflow: hidden;
}
.lc-props-panel__card--open {
  border-color: var(--lc-border-strong);
}
.card-row__head {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1);
}
.card-row__toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
  height: 34px;
  padding: 0 var(--lc-space-1) 0 var(--lc-space-2);
  font-family: inherit;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
}
.card-row__toggle:hover {
  background: var(--lc-bg-subtle);
}
.card-row__toggle:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: -1px;
}
.card-row__glyph {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
  background: var(--lc-bg-subtle);
  border-radius: var(--lc-radius-xs);
}
.card-row__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-medium);
  color: var(--lc-text-primary);
}
.card-row__target {
  flex-shrink: 0;
  min-width: 10px;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-label);
  text-align: center;
  color: var(--lc-text-tertiary);
}
.card-row__badge {
  flex-shrink: 0;
  padding: 0 var(--lc-space-1);
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-label);
  color: var(--lc-text-danger);
  background: var(--lc-status-danger-bg);
  border-radius: var(--lc-radius-xs);
}
.card-row__chevron {
  flex: 0 0 12px;
  color: var(--lc-text-tertiary);
  transition: transform var(--lc-duration-fast) var(--lc-ease-standard);
}
.card-row__chevron--closed {
  transform: rotate(-90deg);
}
.card-row__ops {
  display: flex;
  align-items: center;
  gap: var(--lc-space-0-5);
  padding-right: var(--lc-space-1);
  flex-shrink: 0;
}
.card-row__op {
  width: 22px;
  height: 22px;
  padding: 0;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-caption);
  line-height: var(--lc-leading-label);
  color: var(--lc-text-secondary);
  background: none;
  border: var(--lc-border-width) solid transparent;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
}
.card-row__op:hover:not(:disabled) {
  color: var(--lc-text-primary);
  background: var(--lc-bg-subtle);
  border-color: var(--lc-border-default);
}
.card-row__op:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.card-row__op--del:hover:not(:disabled) {
  color: var(--lc-text-danger);
  border-color: var(--lc-text-danger);
}
.card-row__op:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
.card-row__body {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
  padding: var(--lc-space-2);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.cols__item {
  display: flex;
  align-items: center;
  gap: var(--lc-space-1-5);
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
  margin-top: var(--lc-space-1-5);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
/* json setter：解析失败提示（跨 grid 两列，紧贴控件下方） */
.setter__json-err {
  grid-column: 1 / -1;
  margin-top: var(--lc-space-1);
  font-size: var(--lc-font-micro);
  color: var(--lc-status-danger);
}

/* expression setter：输入 + 语法提示 */
.setter__expr {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.setter__expr-err {
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-ui);
  color: var(--lc-text-danger);
}
.setter__expr-hint {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}

/* 有可视化编辑器的 items：编辑器 + 折叠的高级 JSON */
.setter__items-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-2);
  min-width: 0;
}
.items-advanced__summary {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  cursor: pointer;
}
.items-advanced__summary:hover {
  color: var(--lc-text-secondary);
}
.items-advanced .setter__textarea {
  margin-top: var(--lc-space-1);
}

/* 动作参数（navigate 页面 / toast 文案）：占满整行 */
.setter__params {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
</style>
