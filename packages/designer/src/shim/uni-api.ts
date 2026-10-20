/**
 * uni-api.ts —— `uni.*` API 的 PC polyfill（D-A1）
 *
 * 物料 upload 里已写 `typeof uni !== 'undefined'` 安全降级（无 uni 时静默不动作）；
 * 设计器侧注入 PC 实现后，「添加图片 / 预览」在画布可用。
 * MVP 范围：chooseImage（file input + objectURL）、previewImage（全屏遮罩）。
 */

interface ChooseImageOptions {
  count?: number
  success?: (res: { tempFilePaths: string[] }) => void
  fail?: () => void
}

interface PreviewImageOptions {
  urls: string[]
  current?: number | string
}

function chooseImage(opts: ChooseImageOptions): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  if ((opts.count ?? 9) > 1) input.multiple = true
  input.onchange = () => {
    const files = Array.from(input.files ?? []).slice(0, opts.count ?? 9)
    if (files.length > 0) {
      opts.success?.({ tempFilePaths: files.map((f) => URL.createObjectURL(f)) })
    } else {
      opts.fail?.()
    }
    input.remove()
  }
  // 挂到 DOM 再触发（与主流实现一致；部分浏览器对游离 input 的 click 行为不稳）
  input.style.display = 'none'
  document.body.appendChild(input)
  input.click()
}

function previewImage(opts: PreviewImageOptions): void {
  const idx =
    typeof opts.current === 'number'
      ? opts.current
      : typeof opts.current === 'string'
        ? Math.max(0, opts.urls.indexOf(opts.current))
        : 0
  const url = opts.urls[idx]
  if (!url) return
  const mask = document.createElement('div')
  Object.assign(mask.style, {
    position: 'fixed',
    inset: '0',
    // 模拟 uni.previewImage 的原生图片预览遮罩（真机上就是近黑底），
    // 属平台 chrome 而非本项目设计表面，不应随亮暗主题变化。
    // design-token-exempt
    background: 'rgba(0,0,0,0.85)',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  })
  const img = document.createElement('img')
  img.src = url
  Object.assign(img.style, { maxWidth: '90vw', maxHeight: '90vh' })
  mask.appendChild(img)
  mask.onclick = () => mask.remove()
  document.body.appendChild(mask)
}

interface ChooseFileOptions {
  count?: number
  /** 逗号分隔扩展名（如 '.pdf,.docx'）；file input 的 accept */
  extension?: string[]
  success?: (res: { tempFiles: Array<{ name: string; path: string }> }) => void
  fail?: () => void
}

/** 非图片文件选择（FileUpload 物料，Phase 2 批 3）：file input polyfill，与 chooseImage 同款范式 */
function chooseFile(opts: ChooseFileOptions): void {
  const input = document.createElement('input')
  input.type = 'file'
  if ((opts.count ?? 1) > 1) input.multiple = true
  if (opts.extension && opts.extension.length > 0) input.accept = opts.extension.join(',')
  input.onchange = () => {
    const files = Array.from(input.files ?? []).slice(0, opts.count ?? 1)
    if (files.length > 0) {
      opts.success?.({ tempFiles: files.map((f) => ({ name: f.name, path: URL.createObjectURL(f) })) })
    } else {
      opts.fail?.()
    }
    input.remove()
  }
  input.style.display = 'none'
  document.body.appendChild(input)
  input.click()
}

/** 注入 `window.uni`（幂等；已有 uni 运行时不覆盖 —— uni-app 工程里不会调本函数） */
export function installUniApi(): void {
  if (typeof window === 'undefined') return
  const g = window as unknown as { uni?: Record<string, unknown> }
  if (g.uni) return
  g.uni = { chooseImage, previewImage, chooseFile }
}
