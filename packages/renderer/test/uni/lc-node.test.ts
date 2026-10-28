/**
 * uni 组件层冒烟测试（jsdom）—— 把 B-18 / B-19 类缺陷拦在单测层。
 *
 * 背景：此前 vitest 只覆盖 core 纯逻辑，`lc-node.vue` / `lc-renderer.vue` 零测试，
 *       B-18（缺容器分支 → 「未知组件：Page」）与 B-19（递归未绑 `@change` →
 *       嵌套节点改值视图不刷新）都是 H5 实测才发现的。本文件补上这两类回归。
 *
 * 边界：物料（lc-text/lc-input/lc-button）用 stub（真实物料在 packages/runtime，
 *       依赖 uni 内置组件，jsdom 无法渲染）；测试对象是**分发、容器、冒泡、动作链**。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { PageSchema, NodeSchema } from '@lc/schema'
import LcRenderer from '../../src/uni/lc-renderer.vue'
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

/** 物料 stub：不声明 props（全部流入 attrs），便于断言分发内容 */
const LcTextStub = defineComponent({
  name: 'lc-text',
  setup(_, { attrs }) {
    return () => h('div', { class: 'stub-text', 'data-text': String(attrs.text ?? '') })
  },
})
const LcInputStub = defineComponent({
  name: 'lc-input',
  setup(_, { attrs }) {
    return () => h('div', { class: 'stub-input' })
  },
})
const LcButtonStub = defineComponent({
  name: 'lc-button',
  setup(_, { attrs }) {
    return () => h('button', { class: 'stub-button' }, String(attrs.text ?? ''))
  },
})

/** 通用物料 stub 工厂（不声明 props → 全部进 attrs；class = `stub-<name>` 便于矩阵断言） */
function makeStub(name: string) {
  return defineComponent({
    name,
    setup() {
      return () => h('div', { class: `stub-${name}` })
    },
  })
}

/**
 * 全部叶子物料 kebab 标签（与 lc-node.vue 的 v-if 分发分支一一对应）。
 *
 * ⚠️ 必须补全：Vue 编译器会把 `resolveComponent` **提升到渲染函数顶部**无条件执行 ——
 * lc-node.vue 的 v-if 链引用了全部物料，任一未注册即每次渲染刷一条
 * `[Vue warn]: Failed to resolve component`。量级达数十万行时，经管道输出会**回压阻塞
 * main 线程**，导致 worker 的 `snapshotSaved` RPC 应答超时、**污染退出码**（B-45 同族：
 * 测试与阈值全过、仅 exit code 非 0）。故此处按物料全集注册 stub。
 */
const LEAF_KEBABS = [
  'lc-text',
  'lc-image',
  'lc-tag',
  'lc-icon',
  'lc-divider',
  'lc-input',
  'lc-textarea',
  'lc-number-input',
  'lc-radio',
  'lc-select',
  'lc-switch',
  'lc-upload',
  'lc-date-picker',
  'lc-date-time-picker',
  'lc-money-input',
  'lc-checkbox',
  'lc-picker',
  'lc-user-picker',
  'lc-dept-picker',
  'lc-cascader',
  'lc-file-upload',
  'lc-detail',
  'lc-cell',
  'lc-list',
  'lc-chart',
  'lc-statistic',
  'lc-tabs',
  'lc-search-bar',
  'lc-button',
  'lc-progress',
  'lc-rate',
  'lc-approval-bar',
  'lc-timeline',
  'lc-portal-banner',
  'lc-portal-notice',
  'lc-portal-stat',
  'lc-portal-todo',
] as const

const globalComponents: Record<string, ReturnType<typeof defineComponent>> = {
  'lc-node': LcNode, // 递归自引用（easycom 在测试环境不存在，手动全局注册）
}
for (const kebab of LEAF_KEBABS) {
  globalComponents[kebab] = makeStub(kebab)
}
// 断言用专用 stub 覆盖（文本进 data-text / 按钮文本进 textContent）
globalComponents['lc-text'] = LcTextStub
globalComponents['lc-input'] = LcInputStub
globalComponents['lc-button'] = LcButtonStub

function node(p: Partial<NodeSchema> & { id: string; componentName: string }): NodeSchema {
  return p as NodeSchema
}

function page(children: NodeSchema[], defaultFormData: Record<string, unknown> = {}): PageSchema {
  return {
    schemaVersion: '1.0',
    id: 'p1',
    name: '组件冒烟',
    type: 'form',
    root: node({ id: 'root', componentName: 'Page', children }),
    defaultFormData,
  } as PageSchema
}

function controllerOf(schema: PageSchema, host = makeHost()) {
  const pc = new PageController(schema, { host: host as unknown as RuntimeHost })
  return { pc, host }
}

/* ------------------------------------------------------------------ */
/* 1. v-if 链分发                                                      */
/* ------------------------------------------------------------------ */

describe('lc-node —— 物料分发（v-if 链）', () => {
  it('Text / Input / Button 分发到对应组件，$expr props 已求值', () => {
    const { pc } = controllerOf(
      page(
        [
          node({ id: 't1', componentName: 'Text', props: { text: '$expr: "n=" + formData.n' } }),
          node({ id: 'i1', componentName: 'Input', props: { name: 'f1', label: '字段' } }),
          node({ id: 'b1', componentName: 'Button', props: { text: '点我' } }),
        ],
        { n: 7 },
      ),
    )
    const w = mount(LcNode, {
      props: { model: pc.resolve()[0], controller: pc },
      global: { components: globalComponents },
    })
    expect(w.find('.stub-text').exists()).toBe(true)
    expect(w.find('.stub-text').attributes('data-text')).toBe('n=7') // 表达式已在 resolve 求值
    expect(w.find('.stub-input').exists()).toBe(true)
    expect(w.find('.stub-button').exists()).toBe(true)
    expect(w.find('.stub-button').text()).toBe('点我')
    w.unmount()
    pc.dispose()
  })

  it('visible=false 的节点不渲染', () => {
    const { pc } = controllerOf(
      page([
        node({ id: 't1', componentName: 'Text', props: { text: '隐藏' }, condition: false }),
        node({ id: 't2', componentName: 'Text', props: { text: '可见' } }),
      ]),
    )
    const w = mount(LcNode, {
      props: { model: pc.resolve()[0], controller: pc },
      global: { components: globalComponents },
    })
    const texts = w.findAll('.stub-text')
    expect(texts).toHaveLength(1)
    expect(texts[0].attributes('data-text')).toBe('可见')
    w.unmount()
    pc.dispose()
  })
})

/* ------------------------------------------------------------------ */
/* 2. B-18 回归：容器分支 / 未知组件兜底                                */
/* ------------------------------------------------------------------ */

describe('lc-node —— 容器分支（B-18 回归）', () => {
  it('Page / View / Group 被识别为容器：自身无占位，children 正常渲染', () => {
    const { pc } = controllerOf(
      page([
        node({
          id: 'g1',
          componentName: 'View',
          children: [node({ id: 't1', componentName: 'Text', props: { text: '在 View 里' } })],
        }),
        node({
          id: 'g2',
          componentName: 'Group',
          children: [node({ id: 't2', componentName: 'Text', props: { text: '在 Group 里' } })],
        }),
      ]),
    )
    const w = mount(LcNode, {
      props: { model: pc.resolve()[0], controller: pc },
      global: { components: globalComponents },
    })
    // root(Page) 与两个容器均不得落入「未知组件」兜底
    expect(w.find('.lc-node__unknown').exists()).toBe(false)
    const texts = w.findAll('.stub-text')
    expect(texts).toHaveLength(2)
    expect(texts[0].attributes('data-text')).toBe('在 View 里')
    expect(texts[1].attributes('data-text')).toBe('在 Group 里')
    w.unmount()
    pc.dispose()
  })

  it('未注册物料 → 占位提示，不吞掉兄弟节点', () => {
    const { pc } = controllerOf(
      page([
        node({ id: 'x1', componentName: 'Weird', props: {} }),
        node({ id: 't1', componentName: 'Text', props: { text: '还在' } }),
      ]),
    )
    const w = mount(LcNode, {
      props: { model: pc.resolve()[0], controller: pc },
      global: { components: globalComponents },
    })
    expect(w.find('.lc-node__unknown').text()).toContain('未知组件：Weird')
    expect(w.findAll('.stub-text')).toHaveLength(1)
    w.unmount()
    pc.dispose()
  })
})

/* ------------------------------------------------------------------ */
/* 3. B-19 回归：change 冒泡 + setField                                */
/* ------------------------------------------------------------------ */

describe('lc-node —— 嵌套节点变更冒泡（B-19 回归）', () => {
  it('嵌套 Input 的 update → setField 写入 + change 向上冒泡', () => {
    const { pc } = controllerOf(page([node({ id: 'i1', componentName: 'Input', props: { name: 'f1' } })]))
    const onChange = vi.fn()
    const w = mount(LcNode, {
      props: { model: pc.resolve()[0], controller: pc, onChange },
      global: { components: globalComponents },
    })
    w.findComponent({ name: 'lc-input' }).vm.$emit('update', { name: 'f1', value: '你好' })
    expect(pc.getField('f1')).toBe('你好') // setField 已写入
    expect(onChange).toHaveBeenCalledTimes(1) // change 冒泡给上层（B-19 断点即此处）
    w.unmount()
    pc.dispose()
  })
})

/* ------------------------------------------------------------------ */
/* 4. lc-renderer 全链集成                                             */
/* ------------------------------------------------------------------ */

describe('lc-renderer —— 全链集成（挂载 / 联动刷新 / 动作）', () => {
  it('挂载即 resolve 渲染；输入后联动文案随 refresh 更新（B-19 全链回归）', async () => {
    const schema = page(
      [
        node({ id: 'i1', componentName: 'Input', props: { name: 'f1', label: '字段' } }),
        node({ id: 't1', componentName: 'Text', props: { text: '$expr: "值：" + formData.f1' } }),
      ],
      { f1: '初值' },
    )
    const host = makeHost()
    const w = mount(LcRenderer, {
      props: { schema, options: { host: host as unknown as RuntimeHost } },
      global: { components: globalComponents },
    })
    await flushPromises()
    expect(w.find('.stub-text').attributes('data-text')).toBe('值：初值')

    // 模拟物料上报输入 → 期望：setField → change 冒泡 → onTreeChange → refresh → 文案重算
    w.findComponent({ name: 'lc-input' }).vm.$emit('update', { name: 'f1', value: '改后' })
    await flushPromises()
    expect(w.find('.stub-text').attributes('data-text')).toBe('值：改后')
    w.unmount()
  })

  it('Button 点击 → handleEvent 执行 toast 动作 → RuntimeHost.toast', async () => {
    const schema = page([
      node({
        id: 'b1',
        componentName: 'Button',
        props: { text: '提交' },
        actions: [{ event: 'click', type: 'toast', value: { text: '动作已执行' } }],
      }),
    ])
    const host = makeHost()
    const w = mount(LcRenderer, {
      props: { schema, options: { host: host as unknown as RuntimeHost } },
      global: { components: globalComponents },
    })
    await flushPromises()
    w.findComponent({ name: 'lc-button' }).vm.$emit('click')
    await flushPromises()
    expect(host.toast).toHaveBeenCalled()
    expect(JSON.stringify(host.toast.mock.calls)).toContain('动作已执行')
    w.unmount()
  })
})

/* ------------------------------------------------------------------ */
/* 5. Phase 1 物料 12 个分发矩阵                                       */
/* ------------------------------------------------------------------ */

describe('lc-node —— 物料 12 个分发矩阵（Phase 1 第 1 批）', () => {
  it('全部物料分发到位、FormGroup 渲染分组头、容器 children 递归、无未知占位', () => {
    const { pc } = controllerOf(
      page([
        node({ id: 'n-text', componentName: 'Text', props: { text: '顶层文本' } }),
        node({ id: 'n-input', componentName: 'Input', props: { name: 'f1' } }),
        node({ id: 'n-btn', componentName: 'Button', props: { text: '按钮' } }),
        node({ id: 'n-ta', componentName: 'Textarea', props: { name: 'f2' } }),
        node({ id: 'n-num', componentName: 'NumberInput', props: { name: 'f3' } }),
        node({ id: 'n-radio', componentName: 'Radio', props: { name: 'f4', options: [] } }),
        node({ id: 'n-sel', componentName: 'Select', props: { name: 'f5', options: [] } }),
        node({ id: 'n-sw', componentName: 'Switch', props: { name: 'f6' } }),
        node({ id: 'n-up', componentName: 'Upload', props: { name: 'f7' } }),
        node({ id: 'n-img', componentName: 'Image', props: { src: '/logo.png' } }),
        node({ id: 'n-div', componentName: 'Divider', props: { text: '——' } }),
        node({
          id: 'n-fg',
          componentName: 'FormGroup',
          props: { title: '基本信息' },
          children: [node({ id: 'n-in-fg', componentName: 'Text', props: { text: '组内文本' } })],
        }),
        node({
          id: 'n-view',
          componentName: 'View',
          children: [node({ id: 'n-in-view', componentName: 'Text', props: { text: '容器内文本' } })],
        }),
      ]),
    )
    const w = mount(LcNode, {
      props: { model: pc.resolve()[0], controller: pc },
      global: { components: globalComponents },
    })

    // 11 个带独立组件的物料（Page/View 容器无组件，root 即 Page）
    for (const cls of [
      'stub-text',
      'stub-input',
      'stub-button',
      'stub-lc-textarea',
      'stub-lc-number-input',
      'stub-lc-radio',
      'stub-lc-select',
      'stub-lc-switch',
      'stub-lc-upload',
      'stub-lc-image',
      'stub-lc-divider',
    ]) {
      expect(w.find(`.${cls}`).exists(), `物料 ${cls} 未分发`).toBe(true)
    }

    // FormGroup：分组头 + 组内 children 递归
    expect(w.find('.lc-node__group-title').text()).toBe('基本信息')
    // 3 个 Text：顶层 + FormGroup 内 + View 容器内（children 递归全通）
    expect(w.findAll('.stub-text')).toHaveLength(3)
    // 无未知占位
    expect(w.find('.lc-node__unknown').exists()).toBe(false)

    w.unmount()
    pc.dispose()
  })
})

/* ------------------------------------------------------------------ */
/* 6. designMode（D-A2 · 设计器批 1）                                   */
/* ------------------------------------------------------------------ */

describe('lc-renderer —— designMode 选中链路', () => {
  const schemaOf = () =>
    page(
      [
        node({
          id: 'g1',
          componentName: 'View',
          children: [node({ id: 't_in', componentName: 'Text', props: { text: '深层' } })],
        }),
        node({ id: 'b1', componentName: 'Button', props: { text: '点我' } }),
      ],
      {},
    )

  it('design 态：每个节点渲染遮罩，点深层节点 → 选中态更新 + select 逐层冒泡到 renderer（B-19 同款回归）', async () => {
    const host = makeHost()
    const w = mount(LcRenderer, {
      props: { schema: schemaOf(), options: { host: host as unknown as RuntimeHost }, mode: 'design' },
      global: { components: globalComponents },
    })
    await flushPromises()

    // 遮罩数量 = root + g1 + t_in + b1（4 个节点）
    const masks = w.findAll('.lc-node__mask')
    expect(masks).toHaveLength(4)
    expect(masks.every((m) => !!m.attributes('data-node-id'))).toBe(true)

    // 点最深层 Text 的遮罩（嵌套两层：root → g1 → t_in）
    await w.find('[data-node-id="t_in"]').trigger('click')
    // ① select 冒泡穿透两层递归到达 LcRenderer
    expect(w.emitted('select')?.[0]).toEqual(['t_in'])
    // ② 共享选中态更新 + 选中样式挂到目标遮罩
    expect(w.vm.designState?.selectedId).toBe('t_in')
    expect(w.find('[data-node-id="t_in"]').classes()).toContain('lc-node__mask--selected')
    expect(w.find('[data-node-id="b1"]').classes()).not.toContain('lc-node__mask--selected')

    // 再点兄弟节点：选中迁移
    await w.find('[data-node-id="b1"]').trigger('click')
    expect(w.emitted('select')?.[1]).toEqual(['b1'])
    expect(w.vm.designState?.selectedId).toBe('b1')

    w.unmount()
  })

  it('design 态：动作被拦截（点按钮不触发 toast）；runtime 态：无遮罩（零回归）', async () => {
    const host = makeHost()
    // design 态：点按钮物料 → onTap guard 直接返回
    const wd = mount(LcRenderer, {
      props: { schema: schemaOf(), options: { host: host as unknown as RuntimeHost }, mode: 'design' },
      global: { components: globalComponents },
    })
    await flushPromises()
    expect(wd.find('.lc-node__mask').exists()).toBe(true)
    await wd.find('.stub-button').trigger('click')
    expect(host.toast).not.toHaveBeenCalled()
    wd.unmount()

    // runtime 态（缺省）：无遮罩
    const wr = mount(LcRenderer, {
      props: { schema: schemaOf(), options: { host: host as unknown as RuntimeHost } },
      global: { components: globalComponents },
    })
    await flushPromises()
    expect(wr.find('.lc-node__mask').exists()).toBe(false)
    expect(wr.vm.designState).toBeNull()
    wr.unmount()
  })
})

/* ------------------------------------------------------------------ */
/* 7. B-24：schema 整树替换响应 + selectedId 受控同步（设计器批 2 暴露）  */
/* ------------------------------------------------------------------ */

describe('lc-renderer —— schema prop 整树替换（B-24 回归）', () => {
  it('schema 换新 → controller 重建 + 节点重渲染（旧树内容消失）', async () => {
    const host = makeHost()
    const w = mount(LcRenderer, {
      props: {
        schema: page([node({ id: 'a1', componentName: 'Text', props: { text: '旧树内容' } })], {}),
        options: { host: host as unknown as RuntimeHost },
      },
      global: { components: globalComponents },
    })
    await flushPromises()
    // stub 模式：lc-text 渲染 .stub-text 且文本进 data-text 属性（B-17：按现有用例的断言模式）
    expect(w.find('.stub-text').attributes('data-text')).toBe('旧树内容')

    await w.setProps({
      schema: page(
        [
          node({ id: 'b1', componentName: 'Text', props: { text: '新树内容' } }),
          node({ id: 'b2', componentName: 'Button', props: { text: '新按钮' } }),
        ],
        {},
      ),
    })
    await flushPromises()
    expect(w.find('.stub-text').attributes('data-text')).toBe('新树内容')
    expect(w.text()).toContain('新按钮') // stub-button 的文本在 textContent
    expect(w.html()).not.toContain('旧树内容')
    w.unmount()
  })

  it('design 态：selectedId prop 受控同步遮罩选中类；select 冒泡不受影响', async () => {
    const host = makeHost()
    const w = mount(LcRenderer, {
      props: {
        schema: page(
          [node({ id: 't1', componentName: 'Text', props: { text: 'x' } })],
          {},
        ),
        options: { host: host as unknown as RuntimeHost },
        mode: 'design',
        selectedId: '',
      },
      global: { components: globalComponents },
    })
    await flushPromises()

    expect(w.find('[data-node-id="t1"]').classes()).not.toContain('lc-node__mask--selected')
    await w.setProps({ selectedId: 't1' })
    expect(w.find('[data-node-id="t1"]').classes()).toContain('lc-node__mask--selected')
    expect(w.find('[data-node-id="root"]').classes()).not.toContain('lc-node__mask--selected')

    // 点击遮罩仍上抛 select（受控环不破坏冒泡）
    await w.find('[data-node-id="root"]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['root'])
    w.unmount()
  })

  it('runtime 态（缺省）：schema 替换同样重渲染；selectedId prop 被忽略（零回归）', async () => {
    const host = makeHost()
    const w = mount(LcRenderer, {
      props: {
        schema: page([node({ id: 'a1', componentName: 'Text', props: { text: 'r1' } })], {}),
        options: { host: host as unknown as RuntimeHost },
        selectedId: 'a1',
      },
      global: { components: globalComponents },
    })
    await flushPromises()
    expect(w.find('.stub-text').attributes('data-text')).toBe('r1')
    expect(w.find('.lc-node__mask').exists()).toBe(false) // runtime 无遮罩

    await w.setProps({ schema: page([node({ id: 'a2', componentName: 'Text', props: { text: 'r2' } })], {}) })
    await flushPromises()
    expect(w.find('.stub-text').attributes('data-text')).toBe('r2')
    expect(w.html()).not.toContain('r1')
    w.unmount()
  })
})

/* ------------------------------------------------------------------ */
/* D-P2-13：受控物料回显兜底                                            */
/* ------------------------------------------------------------------ */

describe('lc-node —— 受控回显兜底（D-P2-13）', () => {
  /** 捕获 attrs.value 的受控物料 stub（严格受控物料的最小替身） */
  const ValueCaptureStub = defineComponent({
    name: 'lc-picker',
    setup(_, { attrs }) {
      return () =>
        h('div', {
          class: 'stub-picker',
          'data-value': attrs.value === undefined ? '' : String(attrs.value),
        })
    },
  })
  const g = { ...globalComponents, 'lc-picker': ValueCaptureStub }

  it('绑定字段且 value 未配置 → 自动以 formData[name] 作受控值', () => {
    const { pc } = controllerOf(
      page(
        [node({ id: 'pk1', componentName: 'Picker', props: { name: 'leaveType', options: [] } })],
        { leaveType: 'a' },
      ),
    )
    const w = mount(LcNode, { props: { model: pc.resolve()[0], controller: pc }, global: { components: g } })
    expect(w.find('.stub-picker').attributes('data-value')).toBe('a')
    w.unmount()
    pc.dispose()
  })

  it('value 显式配置（含表达式求值结果）→ 原样透传，兜底不覆盖', () => {
    const { pc } = controllerOf(
      page(
        [node({ id: 'pk2', componentName: 'Picker', props: { name: 'leaveType', value: 'y', options: [] } })],
        { leaveType: 'a' },
      ),
    )
    const w = mount(LcNode, { props: { model: pc.resolve()[0], controller: pc }, global: { components: g } })
    expect(w.find('.stub-picker').attributes('data-value')).toBe('y')
    w.unmount()
    pc.dispose()
  })

  it('formData 无该字段 / 未绑定字段 → 不注入 value（原样透传）', () => {
    const { pc } = controllerOf(
      page([
        node({ id: 'pk3', componentName: 'Picker', props: { name: 'notSet', options: [] } }),
        node({ id: 'pk4', componentName: 'Picker', props: { options: [] } }),
      ]),
    )
    const w = mount(LcNode, { props: { model: pc.resolve()[0], controller: pc }, global: { components: g } })
    const stubs = w.findAll('.stub-picker')
    expect(stubs).toHaveLength(2)
    expect(stubs[0].attributes('data-value')).toBe('')
    expect(stubs[1].attributes('data-value')).toBe('')
    w.unmount()
    pc.dispose()
  })

  it('交互写入 formData 后重新 resolve → 兜底受控值跟随更新（回显闭环）', async () => {
    const { pc } = controllerOf(
      page(
        [node({ id: 'pk5', componentName: 'Picker', props: { name: 'leaveType', options: [] } })],
        { leaveType: 'a' },
      ),
    )
    const w = mount(LcNode, { props: { model: pc.resolve()[0], controller: pc }, global: { components: g } })
    expect(w.find('.stub-picker').attributes('data-value')).toBe('a')
    pc.setField('leaveType', 'b') // 模拟物料 emit update → controller 写入
    await flushPromises()
    await w.setProps({ model: pc.resolve()[0] }) // 上层 lc-renderer 的 change 重 resolve
    expect(w.find('.stub-picker').attributes('data-value')).toBe('b')
    w.unmount()
    pc.dispose()
  })
})
