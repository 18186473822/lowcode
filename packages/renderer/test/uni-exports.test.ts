/**
 * uni 子路径导出完整性 —— 防「easycom 指向的子路径未在 package.json exports 声明」。
 *
 * 背景（B-15 类：类型通过 / 构建通过 ≠ 运行时可用）：
 *   消费方（packages/runtime/src/pages.json 的 easycom、runtime 页内的显式 import）通过
 *   **子路径** `@lc/renderer/uni/lc-xxx.vue` 引用组件。该子路径必须同时满足：
 *     ① 文件存在；② 在 `package.json` 的 `exports` 中显式声明（否则 Vite 报
 *     `Missing "./uni/lc-xxx.vue" specifier in "@lc/renderer" package`，页面异步分块
 *     加载失败 → H5 只显示 uni 的 `uni.async.error`「连接服务器超时，点击屏幕重试」）。
 *
 *   批 4 实测教训：`lc-portal-page.vue` 已新建、`pages.json` 已接线、renderer/runtime 单测
 *   全绿、`pnpm -r build`/`typecheck` 全过 —— 但只在 H5 实测暴露（runtime 工程不参与
 *   `pnpm -r build`，tsc 也不校验 exports 子路径）。故补本用例，把这类缺陷拦在单测层。
 *
 * 边界：只校验 `src/uni/*.vue`（easycom 组件的实际消费形态）；`.ts` / `./uni` 别名等另行。
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const uniDir = join(pkgRoot, 'src', 'uni')

const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>
}
const vueFiles = readdirSync(uniDir).filter((f) => f.endsWith('.vue'))

describe('package.json exports 覆盖 src/uni 组件（easycom 子路径）', () => {
  it('src/uni 下每个 .vue 都被 exports 声明（漏声明 → H5 分块加载失败）', () => {
    const missing = vueFiles.filter((f) => !(`./uni/${f}` in pkg.exports))
    expect(missing).toEqual([])
  })

  it('exports 中每个 ./uni/*.vue 都指向真实文件（无悬空导出）', () => {
    const declared = Object.keys(pkg.exports).filter(
      (k) => k.startsWith('./uni/') && k.endsWith('.vue'),
    )
    const dangling = declared.filter((k) => !vueFiles.includes(k.slice('./uni/'.length)))
    expect(dangling).toEqual([])
  })
})
