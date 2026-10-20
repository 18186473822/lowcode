declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare module '*.css' {
  const css: string
  export default css
}

/** PC polyfill 注入的 uni API（installUniApi）；uni-app 工程内由运行时提供 */
interface Window {
  uni?: {
    chooseImage(opts: {
      count?: number
      success?: (res: { tempFilePaths: string[] }) => void
      fail?: () => void
    }): void
    previewImage(opts: { urls: string[]; current?: number | string }): void
    [key: string]: unknown
  }
}
