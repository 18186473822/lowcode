/**
 * use-breakpoint.ts —— 响应式断点（design-system.md §6「响应式适配」）
 *
 * 4 档，min-width 递进（移动优先）：
 *   mobile   < 640      运行时页面主场景；设计器不提供完整编辑态（见 App 的窄屏提示）
 *   tablet   640–1023   设计器左右栏折叠为抽屉
 *   desktop  1024–1439  设计器主档：三栏全展开
 *   wide     ≥ 1440     左右栏加宽、画布可留更多呼吸
 *
 * 实现用 matchMedia 而非 window.innerWidth + resize：前者不触发同步 layout，
 * 且能正确响应「只改缩放」这类不派发 resize 的变化。
 */
import { onUnmounted, ref, type Ref } from 'vue'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide'

/** 从宽到窄匹配，首个命中即当前档 */
const QUERIES: ReadonlyArray<{ name: Breakpoint; query: string }> = [
  { name: 'wide', query: '(min-width: 1440px)' },
  { name: 'desktop', query: '(min-width: 1024px)' },
  { name: 'tablet', query: '(min-width: 640px)' },
]

/** 无 matchMedia（老浏览器 / 非浏览器环境）时的兜底：按主档 desktop 处理 */
function detect(): Breakpoint {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  for (const q of QUERIES) if (window.matchMedia(q.query).matches) return q.name
  return 'mobile'
}

export function useBreakpoint(): Ref<Breakpoint> {
  const current = ref<Breakpoint>(detect())
  const lists: MediaQueryList[] = []

  const sync = (): void => {
    current.value = detect()
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    for (const q of QUERIES) {
      const mql = window.matchMedia(q.query)
      mql.addEventListener('change', sync)
      lists.push(mql)
    }
  }

  onUnmounted(() => {
    for (const mql of lists) mql.removeEventListener('change', sync)
  })

  return current
}

/** 该断点下左右栏是否为「抽屉」形态（浮在画布之上，不挤压画布宽度） */
export function isDrawerLayout(bp: Breakpoint): boolean {
  return bp === 'mobile' || bp === 'tablet'
}

/**
 * 是否达到指定最小宽度（默认 1180px）。
 *
 * 单列一个 hook 而不复用 4 档断点：顶栏「更多」的阈值（§3.2 规定 1180）**不在** 4 档
 * （1024 / 1440）上 —— 硬套 `desktop` 会在 1024–1179 这段该收的时候不收。
 */
export function useMinWidth(px = 1180): Ref<boolean> {
  const query = `(min-width: ${px}px)`
  const ok = ref(true)

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mql = window.matchMedia(query)
    ok.value = mql.matches
    const onChange = (e: MediaQueryListEvent): void => {
      ok.value = e.matches
    }
    mql.addEventListener('change', onChange)
    onUnmounted(() => mql.removeEventListener('change', onChange))
  }

  return ok
}
