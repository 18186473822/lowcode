/**
 * 包入口（barrel）导出完整性 smoke —— 防 re-export 断链 / 导出名 typo。
 * 背景：各单测均从子路径（`../src/core/*`）import，`src/index.ts` 这层公开出口
 *       从未被运行时执行过（覆盖率 0%）；类型层有 tsc 兜底，但**运行时**断链只有
 *       本用例能拦（B-15 教训：类型通过 ≠ 运行时可用）。
 */
import { describe, expect, it } from 'vitest'
import * as api from '../src/index.js'

describe('包入口导出完整性', () => {
  it('全部运行时导出均非 undefined', () => {
    const entries = Object.entries(api)
    // 数字为运行时实测（`Object.keys(await import(...)).length`）；新增公开导出时同步更新本数字。
    // 2026-10-16：29 → 36（新增 ./core/state-kind.js 的 7 个导出）
    // 2026-10-19：36 → 40（批 3：新增 ./core/theme-vars.js 的 4 个纯函数）
    // 2026-10-20：40 → 44（批 5：新增 ./core/ops.js 的 createOpsQueue + ./core/perf.js 的 3 个纯函数）
    // 2026-10-22：44 → 47（Phase 4：新增 ./core/record-edit.js 的 RECORD_SYSTEM_FIELDS + recordEtag + parseRecordFieldValue）
    expect(entries.length).toBe(47)
    for (const [name, value] of entries) {
      expect(value, `导出 "${name}" 为 undefined（re-export 断链）`).not.toBeUndefined()
    }
  })

  it('核心 API 可从入口直接取得', () => {
    expect(typeof api.PageController).toBe('function')
    expect(typeof api.buildTree).toBe('function')
    expect(typeof api.resolveTree).toBe('function')
    expect(typeof api.Linkage).toBe('function')
    expect(typeof api.createLifecycleScope).toBe('function')
    // 批 3：主题派生纯函数（runtime / designer-web 换肤预览共用）
    expect(typeof api.parseHex).toBe('function')
    expect(typeof api.deriveBrandPalette).toBe('function')
    // 批 5：埋点队列 + Profiler（runtime / designer 共用）
    expect(typeof api.createOpsQueue).toBe('function')
    expect(typeof api.formatPerf).toBe('function')
    expect(typeof api.countNodes).toBe('function')
  })
})
