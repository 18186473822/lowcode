/**
 * enhance.ts —— 直出型 uni 标签（image / switch）的运行时增强器（D-A1 修正）
 *
 * 原则：**只加 attribute / 派发事件，不替换、不增删子节点** —— DOM 结构与 Vue 的
 * vnode 树保持同构，后续 patch 不会错位。
 *
 *  - `image`：把 `src` 同步为背景图（未知元素浏览器不渲染图片内容）；
 *    MutationObserver 盯 `src` 属性（$expr 动态换图也能跟着变）。
 *  - `switch`：事件委托 —— 点击切换 `checked` attribute（视觉由 CSS 属性选择器驱动，
 *    且 Vue 对 boolean attribute 自己会同步 checked，两者天然一致），
 *    并派发 `CustomEvent('change', { detail: { value } })`（uni 契约，
 *    物料 lc-switch 的 `@change` 即 addEventListener('change') 能收到）。
 *
 * 时机：画布 mounted 挂载、unmounted 释放（LcCanvas 负责调用）。
 */
import { IMAGE_FIT } from './basic'

function syncImage(el: Element): void {
  const src = el.getAttribute('src')
  const mode = el.getAttribute('mode') ?? 'scaleToFill'
  const html = el as HTMLElement
  if (src) {
    html.style.backgroundImage = `url("${src}")`
    html.style.backgroundSize = IMAGE_FIT[mode] ?? 'cover'
    html.style.backgroundPosition = 'center'
    html.style.backgroundRepeat = 'no-repeat'
  } else {
    html.style.backgroundImage = ''
  }
  html.setAttribute('data-upgraded', '1')
}

function syncAllImages(root: ParentNode): void {
  root.querySelectorAll('image[src]:not([data-upgraded="1"])').forEach(syncImage)
}

/** switch 是否可交互。
 * 与 isOn 同因（B-22 续）：Vue 对未知元素写 `disabled="false"`（attribute 仍存在），
 * 必须排除 `"false"`，否则所有 switch 都被误判为禁用。 */
function isDisabled(el: Element): boolean {
  const v = el.getAttribute('disabled')
  return v !== null && v !== 'false'
}

/** 当前开态：以 checked attribute 为准。
 * 注意（实测 B-22 续）：`checked` 不在 Vue 的 boolean-attr 名单 → 对未知元素
 * `:checked="false"` 会落成 `setAttribute('checked', 'false')`（attribute 仍存在），
 * 必须排除 `"false"` 值，否则初始关态被误判为开态。 */
function isOn(el: Element): boolean {
  const v = el.getAttribute('checked')
  return v !== null && v !== 'false'
}

/**
 * 挂载增强器；返回 dispose。
 * @param root 画布容器（事件委托 + 子树观察都锚定在此）
 */
export function installEnhancer(root: HTMLElement): () => void {
  syncAllImages(root)

  // image：新增节点 / src 变化 → 同步背景
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && r.target instanceof Element && r.target.tagName === 'IMAGE') {
        if (r.attributeName === 'src' || r.attributeName === 'mode') {
          r.target.removeAttribute('data-upgraded')
          syncImage(r.target)
        }
      } else if (r.type === 'childList') {
        r.addedNodes.forEach((n) => {
          if (n instanceof Element) {
            if (n.tagName === 'IMAGE' && n.hasAttribute('src') && !n.hasAttribute('data-upgraded')) {
              syncImage(n)
            }
            n.querySelectorAll?.('image[src]:not([data-upgraded="1"])').forEach(syncImage)
          }
        })
      }
    }
  })
  observer.observe(root, { attributes: true, attributeFilter: ['src', 'mode'], childList: true, subtree: true })

  // switch：事件委托（点击 → 切 checked attribute + 派发 uni 契约 change）
  const onClick = (e: Event): void => {
    const target = e.target as Element | null
    const el = target?.closest?.('switch') ?? null
    if (!el) return
    e.stopPropagation() // 阻止冒泡到画布/遮罩（设计态点开关是「操作」不是「选中」之后的穿透）
    if (isDisabled(el)) return
    const next = !isOn(el)
    if (next) el.setAttribute('checked', '')
    else el.removeAttribute('checked')
    el.dispatchEvent(new CustomEvent('change', { detail: { value: next }, bubbles: true }))
  }
  root.addEventListener('click', onClick)

  return () => {
    observer.disconnect()
    root.removeEventListener('click', onClick)
  }
}
