/**
 * lc-node-materials.test.ts —— 34 展示物料分发遍历（Phase 2 批 3；Phase 3 批 2 +2；批 4 +2）
 *
 * 背景：批 3 把展示物料 12 → 30（META 31 项排除 Page），批 2 +2 → 32，批 4 +2 → 34（META 35）。
 *       分发链是 v-if 静态分支，新物料若漏挂分支会静默落到「未知组件」兜底
 *       （B-18 同类缺陷）—— 本文件把**全量物料名单**与 lc-node 分发锁死：任一物料漏挂即红。
 *
 * 边界：物料用 stub（真实物料依赖 uni 内置组件，jsdom 无法渲染，同 lc-node.test.ts）；
 *       测试对象是「componentName → kebab 标签」的分发完整性，不含物料内部行为。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { PageSchema, NodeSchema } from '@lc/schema'
import LcNode from '../../src/uni/lc-node.vue'
import { PageController } from '../../src/core/controller.js'
import type { RuntimeHost } from '../../src/core/types.js'

/* ------------------------------------------------------------------ */
/* 测试基建                                                            */
/* ------------------------------------------------------------------ */

function makeHost() {
  return {
    toast: vi.fn(async (..._args: unknown[]) => {}),
    navigate: vi.fn(async (..._args: unknown[]) => {}),
    back: vi.fn(async (..._args: unknown[]) => {}),
    confirm: vi.fn(async () => true),
    request: vi.fn(async () => ({ statusCode: 200, data: {} })),
  }
}

/** 通用物料 stub 工厂（不声明 props → 全部进 attrs；class = `stub-<kebab>` 便于矩阵断言） */
function makeStub(name: string) {
  return defineComponent({
    name,
    setup() {
      return () => h('div', { class: `stub-${name}` })
    },
  })
}

/** 38 展示物料 = 37 叶子组件 + FormGroup 容器（lc-node 内联渲染，无物料组件） */
const LEAF_MATERIALS: Array<[componentName: string, kebab: string]> = [
  // basic
  ['Text', 'lc-text'],
  ['Image', 'lc-image'],
  ['Tag', 'lc-tag'],
  ['Icon', 'lc-icon'],
  // layout
  ['Divider', 'lc-divider'],
  // form（一期 7 + 批 3 九）
  ['Input', 'lc-input'],
  ['Textarea', 'lc-textarea'],
  ['NumberInput', 'lc-number-input'],
  ['Radio', 'lc-radio'],
  ['Select', 'lc-select'],
  ['Switch', 'lc-switch'],
  ['Upload', 'lc-upload'],
  ['DatePicker', 'lc-date-picker'],
  ['DateTimePicker', 'lc-date-time-picker'],
  ['MoneyInput', 'lc-money-input'],
  ['Checkbox', 'lc-checkbox'],
  ['Picker', 'lc-picker'],
  ['UserPicker', 'lc-user-picker'],
  ['DeptPicker', 'lc-dept-picker'],
  ['Cascader', 'lc-cascader'],
  ['FileUpload', 'lc-file-upload'],
  // data
  ['Detail', 'lc-detail'],
  ['Cell', 'lc-cell'],
  ['List', 'lc-list'],
  ['Chart', 'lc-chart'],
  ['Statistic', 'lc-statistic'],
  // nav
  ['Tabs', 'lc-tabs'],
  ['SearchBar', 'lc-search-bar'],
  // feedback
  ['Button', 'lc-button'],
  ['Progress', 'lc-progress'],
  ['Rate', 'lc-rate'],
  // biz（Phase 3 批 2：审批物料）
  ['ApprovalBar', 'lc-approval-bar'],
  ['Timeline', 'lc-timeline'],
  // 门户组件库（2026-10-28 批 2）
  ['PortalBanner', 'lc-portal-banner'],
  ['PortalNotice', 'lc-portal-notice'],
  ['PortalStat', 'lc-portal-stat'],
  ['PortalTodo', 'lc-portal-todo'],
  // 2026-10-29 P2
  ['PortalGrid', 'lc-portal-grid'],
  ['PortalPageEntry', 'lc-portal-page-entry'],
]

const globalComponents: Record<string, ReturnType<typeof defineComponent>> = {
  'lc-node': LcNode, // 递归自引用（easycom 在测试环境不存在，手动全局注册）
}
for (const [, kebab] of LEAF_MATERIALS) {
  globalComponents[kebab] = makeStub(kebab)
}

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

function page(children: NodeSchema[]): PageSchema {
  return {
    schemaVersion: '1.0',
    id: 'p-batch3',
    name: '物料遍历',
    type: 'form',
    root: node({ id: 'root', componentName: 'Page', children }),
    defaultFormData: {},
  } as PageSchema
}

function controllerOf(schema: PageSchema) {
  return new PageController(schema, { host: makeHost() as unknown as RuntimeHost })
}

/* ------------------------------------------------------------------ */
/* 分发遍历                                                            */
/* ------------------------------------------------------------------ */

describe('lc-node —— 40 展示物料分发遍历（批 3 完整性锁 + 审批物料 + 图表 + 门户 P2）', () => {
  it('名单自检：39 个叶子物料 kebab 标签唯一（防漏注册/重名）', () => {
    const kebabs = LEAF_MATERIALS.map(([, k]) => k)
    expect(kebabs).toHaveLength(39)
    expect(new Set(kebabs).size).toBe(39)
  })

  it.each(LEAF_MATERIALS)('%s 命中分发分支（渲染 %s stub，不落「未知组件」）', (componentName, kebab) => {
    const pc = controllerOf(page([node({ id: 'n1', componentName, props: { text: 'x', label: 'y', title: 't' } })]))
    const w = mount(LcNode, {
      props: { model: pc.resolve()[0], controller: pc },
      global: { components: globalComponents },
    })
    expect(w.find(`.stub-${kebab}`).exists(), `${componentName} 未分发到 ${kebab}`).toBe(true)
    expect(w.text()).not.toContain('未知组件')
    w.unmount()
    pc.dispose()
  })

  it('容器 FormGroup 渲染标题与组内子节点（38 展示项余下的容器项）', () => {
    const pc = controllerOf(
      page([
        node({
          id: 'fg1',
          componentName: 'FormGroup',
          props: { title: '分组标题' },
          children: [node({ id: 't1', componentName: 'Text', props: { text: '组内' } })],
        }),
      ]),
    )
    const w = mount(LcNode, {
      props: { model: pc.resolve()[0], controller: pc },
      global: { components: globalComponents },
    })
    expect(w.text()).toContain('分组标题')
    expect(w.find('.stub-lc-text').exists()).toBe(true)
    w.unmount()
    pc.dispose()
  })
})
