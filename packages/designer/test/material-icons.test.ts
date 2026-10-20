/**
 * material-icons.test.ts —— 物料面板图标集的回归守卫
 *
 * 为什么值得单测：33 个图标是**手绘路径**，最容易出的三类错都不报编译错：
 *   ① 新增物料时忘了配图标 → 面板出现空白格；
 *   ② 路径语法写错（少一段闭合、非法命令）→ 浏览器静默不渲染，肉眼看不出是「没画」还是「画得小」；
 *   ③ 忍不住写死颜色 → 悬停不变色、暗色主题下不跟随。
 */
import { describe, it, expect } from 'vitest'
import { META_LIST } from '@lc/materials'
import { MATERIAL_ICONS, materialIcon } from '../src/canvas/material-icons'

describe('物料图标集', () => {
  it('每个可拖入画布的物料都有专属图标（防新增物料漏配）', () => {
    const missing = META_LIST.filter((m) => m.name !== 'Page' && !MATERIAL_ICONS[m.name]).map((m) => m.name)
    expect(missing, `以下物料缺少图标：${missing.join(', ')}`).toEqual([])
  })

  it('没有多余的僵尸图标（物料已删但图标还在）', () => {
    const names = new Set(META_LIST.map((m) => m.name))
    const orphans = Object.keys(MATERIAL_ICONS).filter((n) => !names.has(n))
    expect(orphans, `以下图标对应的物料已不存在：${orphans.join(', ')}`).toEqual([])
  })

  it('未登记物料退回兜底图形而不是空白', () => {
    const fallback = materialIcon('__not_a_material__')
    expect(fallback).toContain('<rect')
    expect(materialIcon('Page')).toBe(MATERIAL_ICONS.Page)
  })

  it('每个图标都是合法 SVG 片段（防手绘路径语法错误）', () => {
    for (const [name, markup] of Object.entries(MATERIAL_ICONS)) {
      const doc = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
        'image/svg+xml',
      )
      expect(doc.querySelector('parsererror'), `${name}：XML 解析失败`).toBeNull()
      expect(doc.documentElement.children.length, `${name}：没有任何图形元素`).toBeGreaterThan(0)
    }
  })

  it('不使用硬编码色值（必须靠 currentColor 继承主题色）', () => {
    for (const [name, markup] of Object.entries(MATERIAL_ICONS)) {
      expect(/#[0-9a-fA-F]{3,8}\b/.test(markup), `${name}：含 hex 色值`).toBe(false)
      expect(/rgba?\(|hsla?\(/i.test(markup), `${name}：含 rgb/hsl 色值`).toBe(false)
    }
  })

  it('不内嵌 <svg> / 不引外部资源（外壳与规格由宿主统一）', () => {
    for (const [name, markup] of Object.entries(MATERIAL_ICONS)) {
      expect(markup, `${name}：不应包含 svg 标签`).not.toContain('<svg')
      expect(markup, `${name}：不应引用外部资源`).not.toContain('url(')
    }
  })

  it('显式坐标不越出 16×16 网格（防图标被裁切）', () => {
    const problems: string[] = []
    for (const [name, markup] of Object.entries(MATERIAL_ICONS)) {
      for (const m of markup.matchAll(/\b(cx|cy|x|y|r|x1|y1|x2|y2)="(-?\d+(?:\.\d+)?)"/g)) {
        const v = Number(m[2])
        if (v < 0 || v > 16) problems.push(`${name}: ${m[1]}=${v}`)
      }
      for (const m of markup.matchAll(/\b(width|height)="(-?\d+(?:\.\d+)?)"/g)) {
        const v = Number(m[2])
        if (v <= 0 || v > 16) problems.push(`${name}: ${m[1]}=${v}`)
      }
    }
    expect(problems).toEqual([])
  })
})
