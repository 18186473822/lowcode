<!--
  ItemsEditor.vue —— 门户物料的 items 可视化编辑器（2026-10-29）

  哪些物料有 items：
    PortalBanner（标题/说明/图片）· PortalNotice（公告文本/目标页）·
    PortalStat（标签/数值/单位）· PortalTodo（标题/标签/时间）· PortalFlowList（流程名/说明/起始页）

  约定：
    - 行字段是**增量合并**：只改当前键，原对象里的其它键（如 flowId、image 之外的业务字段）原样保留，
      避免可视化编辑把高级 JSON 里配好的键悄悄抹掉。
    - PortalNotice 兼容 `string[]`：原项是字符串时只改字符串；一旦填了目标页面才升级成对象。
    - PortalStat.value 纯数字串写回 number，保证运行时千分位格式化与 `$expr:` 字符串都能用。
-->
<template>
  <div class="items-editor" :data-testid="`items-${kind}`">
    <div class="items-editor__bar">
      <span class="items-editor__count">{{ rows.length }} 项</span>
      <button
        class="items-editor__add"
        type="button"
        :data-testid="`items-${kind}-add`"
        @click="add"
      >＋ 添加一项</button>
    </div>

    <p v-if="!rows.length" class="items-editor__empty">{{ emptyText }}</p>

    <div
      v-for="(row, i) in rows"
      :key="i"
      class="items-row"
      :data-testid="`items-${kind}-row-${i}`"
    >
      <div class="items-row__fields">
        <span
          v-for="f in fields"
          :key="f.key"
          class="items-row__field"
          :class="{ 'items-row__field--wide': f.wide }"
        >
          <span class="items-row__label">{{ f.label }}</span>
          <input
            class="setter__input items-row__input"
            type="text"
            :value="rowValue(row, f.key)"
            :placeholder="f.placeholder ?? ''"
            :aria-label="`第 ${i + 1} 项${f.label}`"
            :data-testid="`items-${kind}-${f.key}-${i}`"
            :list="f.kind === 'page' ? PAGE_LIST_ID : undefined"
            @input="onField(i, f, $event)"
          />
        </span>
      </div>
      <span class="items-row__ops">
        <button
          class="items-row__op"
          type="button"
          title="上移"
          :disabled="i === 0"
          :data-testid="`items-${kind}-up-${i}`"
          @click="move(i, -1)"
        >↑</button>
        <button
          class="items-row__op"
          type="button"
          title="下移"
          :disabled="i === rows.length - 1"
          :data-testid="`items-${kind}-down-${i}`"
          @click="move(i, 1)"
        >↓</button>
        <button
          class="items-row__op items-row__op--del"
          type="button"
          title="删除该项"
          :data-testid="`items-${kind}-del-${i}`"
          @click="remove(i)"
        >×</button>
      </span>
    </div>

    <datalist :id="PAGE_LIST_ID">
      <option v-for="p in pages" :key="p.id" :value="p.id">{{ p.name }}</option>
    </datalist>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type ItemKind = 'banner' | 'notice' | 'stat' | 'todo' | 'flow'

interface FieldDef {
  key: string
  label: string
  placeholder?: string
  /** page：输入框挂页面 datalist（仍可手填 id） */
  kind?: 'page'
  wide?: boolean
}

const props = defineProps<{
  modelValue: unknown
  kind: ItemKind
  pages: Array<{ id: string; name: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const PAGE_LIST_ID = 'lc-items-page-list'

/** 每种物料的字段表；顺序即界面顺序 */
const FIELDS: Record<ItemKind, FieldDef[]> = {
  banner: [
    { key: 'title', label: '标题', wide: true },
    { key: 'desc', label: '说明' },
    { key: 'image', label: '图片地址', placeholder: '/static/a.png' },
  ],
  notice: [
    { key: 'text', label: '公告文本', wide: true },
    { key: 'pageId', label: '目标页面', kind: 'page', wide: true },
  ],
  stat: [
    { key: 'label', label: '标签' },
    { key: 'value', label: '数值', placeholder: '12 或 $expr: x' },
    { key: 'unit', label: '单位', placeholder: '条' },
  ],
  todo: [
    { key: 'title', label: '标题', wide: true },
    { key: 'tag', label: '标签', placeholder: '待审批' },
    { key: 'time', label: '时间', placeholder: '10-28 09:30' },
  ],
  flow: [
    { key: 'name', label: '流程名', wide: true },
    { key: 'meta', label: '说明' },
    { key: 'startPageId', label: '起始页', kind: 'page' },
  ],
}

const fields = computed(() => FIELDS[props.kind])

const EMPTY_TEXT: Record<ItemKind, string> = {
  banner: '还没有横幅。添加后可在上方填标题、说明与图片；image 留空显示令牌色占位块。',
  notice: '还没有公告。添加一条后运行时会在公告条里轮播。',
  stat: '还没有数字格。添加后填标签与数值，运行时按列均分。',
  todo: '还没有静态待办。留空且「拉取待办」开启时，运行时会请求真实待办。',
  flow: '还没有静态流程。留空且「拉取流程」开启时，运行时会按 /flows 返回渲染。',
}
const emptyText = computed(() => EMPTY_TEXT[props.kind])

type Row = Record<string, unknown> & { __string?: boolean }

/** 读取行：字符串项（Notice 兼容写法）转成 { text, __string }，对象项浅拷贝 */
const rows = computed<Row[]>(() => {
  const v = props.modelValue
  if (!Array.isArray(v)) return []
  return v.map((item) => {
    if (typeof item === 'string') return { text: item, __string: true }
    if (item && typeof item === 'object' && !Array.isArray(item)) return { ...(item as Row) }
    return {}
  })
})

function rowValue(row: Row, key: string): string {
  const v = row[key]
  return v === undefined || v === null ? '' : String(v)
}

/** 写回：剔除内部标记；Notice 的纯字符串项保持字符串（填了目标页才升级为对象） */
function serialize(row: Row): unknown {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (k !== '__string') out[k] = v
  }
  if (props.kind === 'notice' && row.__string === true && !String(out.pageId ?? '').trim()) {
    return String(out.text ?? '')
  }
  return out
}

function emitRows(next: Row[]): void {
  emit('update:modelValue', next.map(serialize))
}

function onField(i: number, field: FieldDef, e: Event): void {
  const next = rows.value.map((r) => ({ ...r }))
  const row = next[i]
  if (!row) return
  const raw = (e.target as HTMLInputElement).value
  // 数值列保型：纯数字写 number，其余（含 $expr: 表达式）保留字符串
  row[field.key] =
    field.key === 'value' && props.kind === 'stat' && raw.trim() !== '' && !Number.isNaN(Number(raw))
      ? Number(raw)
      : raw
  emitRows(next)
}

function add(): void {
  const row: Row = {}
  if (props.kind === 'banner') row.title = '新横幅'
  else if (props.kind === 'notice') {
    row.text = ''
    row.__string = true
  } else if (props.kind === 'stat') {
    row.label = '指标'
    row.value = 0
  } else if (props.kind === 'todo') row.title = '新待办'
  else row.name = '新流程'
  emitRows([...rows.value, row])
}

function remove(i: number): void {
  emitRows(rows.value.filter((_, ri) => ri !== i))
}

function move(i: number, dir: -1 | 1): void {
  const next = rows.value.map((r) => ({ ...r }))
  const to = i + dir
  if (to < 0 || to >= next.length) return
  const [item] = next.splice(i, 1)
  if (item) next.splice(to, 0, item)
  emitRows(next)
}
</script>

<style scoped>
/* 令牌来源：../styles/tokens.css（宿主 apps/designer-web 引入） */

.items-editor {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-1-5);
  width: 100%;
}
.items-editor__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lc-space-2);
}
.items-editor__count {
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
}
.items-editor__add {
  padding: var(--lc-space-0-5) var(--lc-space-1);
  font-family: inherit;
  font-size: var(--lc-font-micro);
  color: var(--lc-action-primary);
  background: none;
  border: var(--lc-border-width) solid transparent;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
}
.items-editor__add:hover {
  background: var(--lc-action-primary-subtle);
  border-color: var(--lc-brand-200);
}
.items-editor__add:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
.items-editor__empty {
  margin: 0;
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-ui);
  color: var(--lc-text-tertiary);
}

/* 一行 = 字段网格 + 竖向操作列 */
.items-row {
  display: flex;
  gap: var(--lc-space-1-5);
  padding-top: var(--lc-space-1-5);
  border-top: var(--lc-border-width) solid var(--lc-border-default);
}
.items-row__fields {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px var(--lc-space-1-5);
}
.items-row__field {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  min-width: 0;
}
.items-row__field--wide {
  grid-column: 1 / -1;
}
.items-row__label {
  font-size: var(--lc-font-micro);
  color: var(--lc-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.items-row__input {
  height: 28px;
  min-height: 28px;
  padding: var(--lc-space-0-5) var(--lc-space-1-5);
  font-size: var(--lc-font-caption);
}
.items-row__ops {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-0-5);
  flex-shrink: 0;
}
.items-row__op {
  width: 22px;
  height: 18px;
  padding: 0;
  font-family: var(--lc-font-mono);
  font-size: var(--lc-font-micro);
  line-height: var(--lc-leading-label);
  color: var(--lc-text-secondary);
  background: none;
  border: var(--lc-border-width) solid transparent;
  border-radius: var(--lc-radius-xs);
  cursor: pointer;
}
.items-row__op:hover:not(:disabled) {
  color: var(--lc-text-primary);
  background: var(--lc-bg-subtle);
  border-color: var(--lc-border-default);
}
.items-row__op:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.items-row__op--del:hover:not(:disabled) {
  color: var(--lc-text-danger);
  border-color: var(--lc-text-danger);
}
.items-row__op:focus-visible {
  outline: var(--lc-focus-ring);
  outline-offset: 1px;
}
</style>
