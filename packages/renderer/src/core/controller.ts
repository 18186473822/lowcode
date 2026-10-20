/**
 * 页面控制器 —— 渲染引擎的统一入口。
 *
 * 把 context / build / linkage / resolve / validator / datasource / action / lifecycle
 * 串成一个页面运行单元。uni-app 组件层只需持有本类，不必关心内部协作。
 *
 * 典型用法：
 * ```ts
 * const pc = new PageController(page, { host: uniHost, user, urlParams })
 * await pc.onMount()
 * const nodes = pc.resolve()          // → 交给 lc-node 递归渲染
 * pc.setField('amount', 100)          // → 内部触发联动 + 单字段校验
 * await pc.submit()                   // → 校验 → onSubmit → 提交 → 成功动作
 * ```
 */
import type { PageSchema, NodeSchema, Action } from '@lc/schema'
import { collectFieldNames } from '@lc/schema'
import type { Scope } from '@lc/expression'
import type { RuntimeHost, RenderNode, ResolvedNode, FieldError, ValidateResult, DataSourceState, DraftStore } from './types.js'
import { countNodes } from './perf.js'
import { createPageContext, type PageContext, type CreateContextOptions } from './context.js'
import { buildTreeWithReport } from './build.js'
import { Linkage } from './linkage.js'
import { resolveTree } from './resolve.js'
import {
  collectRules,
  validateAll,
  validateField,
  toErrorMap,
  type FieldRuleBinding,
} from './validator.js'
import { DataSourceRunner } from './datasource.js'
import { runAction, runActions, type ActionResult, type ActionRuntime } from './action.js'
import { runHook, createLifecycleScope, type HookReporter } from './lifecycle.js'

export interface PageControllerOptions {
  /** 宿主能力（uni-app 端注入 uni.* 封装，测试注入 mock） */
  host: RuntimeHost
  /** 当前用户（表达式中 `user.xxx`） */
  user?: Record<string, unknown>
  /** 路由参数（`urlParams.xxx`） */
  urlParams?: Record<string, unknown>
  /** 应用级共享数据（`appData.xxx`） */
  appData?: CreateContextOptions['appData']
  /** 全局数据（`globalData.xxx`） */
  globalData?: CreateContextOptions['globalData']
  /** 权限判定；未提供视为全部有权限 */
  hasPerm?: (perm: string) => boolean
  /** 生命周期执行报告（埋点） */
  onHook?: HookReporter
  /** 表达式出错（埋点） */
  onExprError?: (info: { nodeId: string; expr: string; error: unknown }) => void
  /** loop 展开超限（埋点） */
  onLoopOverflow?: (info: { nodeId: string; limit: number; actual: number }) => void
  /** 数据源状态变更（Vue 层触发重渲染） */
  onDataSourceChange?: (id: string, state: DataSourceState) => void
  /** 动作执行结果（埋点 / 调试） */
  onActionResult?: (result: ActionResult) => void
  /** 环境不支持的宿主能力 */
  onUnsupported?: (type: Action['type']) => void
  /** 表单草稿（批 3 D-P3-7）：未注入 = 禁用（画布 / 标准页 / 存量宿主零影响） */
  draft?: DraftStore
}

export interface SubmitResult {
  ok: boolean
  /** 校验未通过时的错误清单 */
  errors?: FieldError[]
  /** 校验未通过时的第一个错误（供滚动定位） */
  firstError?: FieldError
  /** 提交数据源返回的数据 */
  data?: unknown
  error?: string
}

/**
 * 渲染性能与异常计数（批 5 D-P3-14）。
 *
 * 计时全部在 controller 内部完成（宿主无需插桩）：`buildMs` = 构造期建树，
 * `mountMs` = 首次 `onMount`（钩子 + 初始数据源 + 草稿恢复），`resolveMs` = 最近一次解析。
 * 计数用于 Profiler 展示与埋点（表达式错误 / loop 溢出 / 被跳过的非法节点）。
 */
export interface ControllerStats {
  buildMs: number
  mountMs: number
  resolveMs: number
  nodeCount: number
  exprErrors: number
  loopOverflows: number
  skipped: number
}

/** `performance.now()` 优先（浏览器/Node 18+），无则 Date.now 兜底 */
const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

export class PageController {
  readonly page: PageSchema
  readonly ctx: PageContext
  readonly linkage: Linkage
  readonly ds: DataSourceRunner
  /** 字段 → 校验规则绑定 */
  readonly rules: Map<string, FieldRuleBinding>
  /** nodeId → 当前错误消息（供 resolveTree 挂载） */
  readonly errors = new Map<string, string>()
  /** build 时跳过的非法节点 */
  readonly skipped: Array<{ path: string; reason: string }>

  private readonly tree: RenderNode
  private readonly opts: PageControllerOptions
  private readonly actionRt: ActionRuntime
  /** 性能与异常计数（批 5；对外只读快照） */
  private readonly statsState: ControllerStats
  /** 生命周期求值作用域：页面作用域 + 受信任的 `app`（**仅生命周期可用**） */
  private readonly lifecycleScope: Scope
  private unsubField: (() => void) | null = null
  private mounted = false
  private lastValidate: ValidateResult | null = null
  /** Schema 声明的字段清单（草稿快照与提交 payload 同源，构造期收集一次） */
  private readonly fieldNames: string[]

  constructor(page: PageSchema, opts: PageControllerOptions) {
    this.page = page
    const t0 = now()
    this.statsState = {
      buildMs: 0,
      mountMs: 0,
      resolveMs: 0,
      nodeCount: 0,
      exprErrors: 0,
      loopOverflows: 0,
      skipped: 0,
    }
    // 计数包一层：对外回调语义不变（宿主照旧拿到同一份 info），额外累计到 stats
    this.opts = {
      ...opts,
      onExprError: (info) => {
        this.statsState.exprErrors += 1
        opts.onExprError?.(info)
      },
      onLoopOverflow: (info) => {
        this.statsState.loopOverflows += 1
        opts.onLoopOverflow?.(info)
      },
    }

    const built = buildTreeWithReport(page.root)
    this.tree = built.root
    this.skipped = built.skipped
    this.statsState.buildMs = now() - t0
    this.statsState.nodeCount = countNodes(this.tree)
    this.statsState.skipped = built.skipped.length

    this.ctx = createPageContext({
      defaultFormData: page.defaultFormData,
      appData: opts.appData,
      globalData: opts.globalData,
      user: opts.user,
      urlParams: opts.urlParams,
    })

    this.linkage = new Linkage()
    this.linkage.collect(page)

    this.ds = new DataSourceRunner(
      {
        ctx: this.ctx,
        host: opts.host,
        onStateChange: opts.onDataSourceChange,
        onError: ({ id, error }) => this.opts.onExprError?.({ nodeId: `ds:${id}`, expr: '', error }),
      },
      page.dataSources ?? [],
    )

    this.rules = collectRules(page)
    this.fieldNames = collectFieldNames(page.root)

    this.actionRt = {
      ctx: this.ctx,
      host: opts.host,
      ds: this.ds,
      onSubmit: () => this.submit().then((r) => ({ ok: r.ok, error: r.error })),
      onUnsupported: opts.onUnsupported,
    }

    // 生命周期作用域：注入受信任的 app.*（渲染期表达式不使用它，保持纯净）
    this.lifecycleScope = createLifecycleScope(this.ctx.scope, {
      ctx: this.ctx,
      host: opts.host,
      ds: this.ds,
    })

    // 字段变更 → 单字段即时校验（blur 级反馈由组件自行触发，这里保证值变即更新）+ 草稿落盘
    this.unsubField = this.ctx.onFieldChange(({ name }) => {
      this.revalidateField(name)
      void this.saveDraft()
    })

    // onInit：构造完成后立即执行
    void runHook('onInit', page.lifecycle?.onInit, this.lifecycleScope, opts.onHook)
  }

  /** 性能与异常计数快照（副本，调用方改不动内部状态） */
  get stats(): ControllerStats {
    return { ...this.statsState }
  }

  /* ------------------------------ 渲染 ------------------------------ */

  get scope(): Scope {
    return this.ctx.scope
  }

  /** 全量解析渲染树（loop 展开 + condition + props 表达式 + 权限 + 错误挂载） */
  resolve(): ResolvedNode[] {
    const t0 = now()
    const nodes = resolveTree(this.tree, {
      scope: this.ctx.scope,
      errors: this.errors,
      hasPerm: this.opts.hasPerm,
      onExprError: this.opts.onExprError,
      onLoopOverflow: this.opts.onLoopOverflow,
    })
    this.statsState.resolveMs = now() - t0
    return nodes
  }

  /* ------------------------------ 数据 ------------------------------ */

  /** 读表单字段 */
  getField(name: string): unknown {
    return this.ctx.get(name)
  }

  /**
   * 写表单字段。
   * 内部完成：写入 → 联动脏标记 → 单字段校验。
   * 调用方在字段变更后重新 `resolve()` 即可。
   */
  setField(name: string, value: unknown): void {
    this.ctx.set(name, value)
  }

  /** 批量写入（合并为一次联动与校验） */
  patchFields(values: Record<string, unknown>): void {
    this.ctx.patch(values)
  }

  /** 重置表单并清除全部校验错误（草稿同步清 —— 重置即用户放弃当前内容） */
  reset(values?: Record<string, unknown>): void {
    this.ctx.reset(values)
    this.errors.clear()
    this.lastValidate = null
    void this.clearDraftSafe()
  }

  /* ------------------------------ 联动 ------------------------------ */

  /** 受某根变量变更影响的节点 id（供上层决定是否需要重渲染） */
  affectedBy(root: string): Set<string> {
    return this.linkage.dirtyNodes(root)
  }

  /* ------------------------------ 校验 ------------------------------ */

  /** 单字段校验（组件 blur 时调用），返回错误消息或 null */
  validateOne(name: string): string | null {
    const msg = validateField(name, this.ctx.get(name), this.ctx.scope, this.rules)
    const binding = this.rules.get(name)
    if (binding) {
      if (msg) this.errors.set(binding.nodeId, msg)
      else this.errors.delete(binding.nodeId)
    }
    return msg
  }

  private revalidateField(name: string): void {
    const binding = this.rules.get(name)
    if (!binding) return
    const msg = validateField(name, this.ctx.get(name), this.ctx.scope, this.rules)
    if (msg) this.errors.set(binding.nodeId, msg)
    else this.errors.delete(binding.nodeId)
  }

  /** 全量校验 */
  async validate(): Promise<ValidateResult> {
    const result = await validateAll({
      bindings: this.rules,
      scope: this.ctx.scope,
      getValue: (n) => this.ctx.get(n),
    })
    this.lastValidate = result
    this.errors.clear()
    for (const [k, v] of toErrorMap(result.errors)) this.errors.set(k, v)
    return result
  }

  /** 最近一次全量校验结果 */
  get lastValidation(): ValidateResult | null {
    return this.lastValidate
  }

  /* ------------------------------ 生命周期 ------------------------------ */

  /** 首次渲染前调用：onMount 钩子 + init 数据源 + watch 订阅 + 草稿恢复 */
  async onMount(): Promise<void> {
    if (this.mounted) return
    this.mounted = true
    const t0 = now()
    try {
      await runHook('onMount', this.page.lifecycle?.onMount, this.lifecycleScope, this.opts.onHook)
      this.ds.startWatch()
      await this.ds.loadInit()
      // 草稿恢复放在数据源 init 之后：用户填过的内容比取数默认值更权威（D-P3-7）
      await this.restoreDraft()
    } finally {
      // 即便数据源/草稿异常也要留下耗时（失败路径同样需要 profiling）
      this.statsState.mountMs = now() - t0
    }
  }

  /* ------------------------------ 提交 ------------------------------ */

  /**
   * 提交（《落地方案》7.2 流程）：
   * ① 全量校验（失败即中断并返回 firstError）→ ② onSubmit 钩子
   * → ③ 组装 payload → ④ 提交数据源 → ⑤ 成功提示与跳转
   */
  async submit(): Promise<SubmitResult> {
    // ① 校验
    const validated = await this.validate()
    if (!validated.valid) {
      return { ok: false, errors: validated.errors, firstError: validated.firstError }
    }

    // ② onSubmit 钩子（可补默认值、计算字段）
    await runHook('onSubmit', this.page.lifecycle?.onSubmit, this.lifecycleScope, this.opts.onHook)

    // ③ 组装 payload：仅提交 Schema 声明过的字段
    const payload: Record<string, unknown> = {}
    for (const f of this.fieldNames) payload[f] = this.ctx.get(f)

    // ④ 提交
    const submitDs = this.page.submit?.dataSourceId
    if (!submitDs) {
      return { ok: false, error: '页面未配置提交数据源（submit.dataSourceId）' }
    }
    const data = await this.ds.load(submitDs, payload)
    if (data === null) {
      const err = this.ds.get(submitDs).error
      return { ok: false, error: err ?? '提交失败' }
    }

    // ⑤ 成功：草稿使命完成即清（D-P3-7「提交成功即清」）
    await this.clearDraftSafe()
    if (this.page.submit?.successToast) {
      await this.opts.host.toast({ text: this.page.submit?.successToast, icon: 'success' })
    }
    if (this.page.submit?.successAction) {
      await runAction(this.page.submit.successAction, this.actionRt)
    }

    return { ok: true, data }
  }

  /* ------------------------------ 事件 ------------------------------ */

  /** 执行某节点上绑定的动作（组件把事件转发到这里） */
  async handleEvent(
    event: string,
    actions: Action[] | undefined,
    opts: { scope?: Scope; continueOnError?: boolean } = {},
  ): Promise<ActionResult[]> {
    const results = await runActions(event, actions, this.actionRt, opts)
    for (const r of results) this.opts.onActionResult?.(r)
    return results
  }

  /** 执行单个动作（如 submit.successAction 复用） */
  async runSingleAction(action: Action, opts: { scope?: Scope } = {}): Promise<ActionResult> {
    const r = await runAction(action, this.actionRt, opts)
    this.opts.onActionResult?.(r)
    return r
  }

  /* ------------------------------ 草稿（D-P3-7） ------------------------------ */

  /** 当前表单值快照（仅 Schema 声明字段，与提交 payload 同源） */
  private formSnapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const f of this.fieldNames) out[f] = this.ctx.get(f)
    return out
  }

  /** 字段变更 → 落草稿；全空则清（删光内容不应留下「空草稿」下次再提示） */
  private async saveDraft(): Promise<void> {
    const draft = this.opts.draft
    if (!draft) return
    try {
      const snap = this.formSnapshot()
      const empty = Object.values(snap).every(
        (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0),
      )
      if (empty) await draft.clear()
      else await draft.save(snap)
    } catch (e) {
      // 草稿是体验增强：存储失败（配额 / 隐私模式）不阻断表单，只上报
      this.opts.onExprError?.({ nodeId: 'draft', expr: '', error: e })
    }
  }

  /** onMount 恢复草稿：有 → 确认回填；拒绝 → 丢弃（clear，避免反复提示） */
  private async restoreDraft(): Promise<void> {
    const draft = this.opts.draft
    if (!draft) return
    try {
      const saved = await draft.load()
      if (!saved || Object.keys(saved).length === 0) return
      const ok = await this.opts.host.confirm({
        text: '检测到上次未提交的草稿，是否恢复？',
        confirmText: '恢复',
        cancelText: '不恢复',
      })
      if (ok) this.patchFields(saved)
      else await draft.clear()
    } catch (e) {
      this.opts.onExprError?.({ nodeId: 'draft', expr: '', error: e })
    }
  }

  /** 清草稿（提交成功 / reset 用）；无草稿或存储异常均静默 —— 不影响主流程语义 */
  private async clearDraftSafe(): Promise<void> {
    if (!this.opts.draft) return
    try {
      await this.opts.draft.clear()
    } catch {
      // 忽略：草稿清失败不回滚提交语义
    }
  }

  /* ------------------------------ 释放 ------------------------------ */

  /** 释放订阅（页面卸载时调用） */
  dispose(): void {
    this.unsubField?.()
    this.unsubField = null
    this.ds.dispose()
  }
}
