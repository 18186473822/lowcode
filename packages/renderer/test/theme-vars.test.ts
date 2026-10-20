/**
 * 批 3 D-P3-8 —— 主题变量派生纯函数：hex 解析 / HSL 换算 / brand 十档调色板。
 */
import { describe, it, expect } from 'vitest'
import { parseHex, rgbToHsl, hslToHex, deriveBrandPalette } from '../src/core/theme-vars.js'

describe('parseHex', () => {
  it('#RRGGBBB', () => {
    expect(parseHex('#2b6de8')).toEqual({ r: 43, g: 109, b: 232 })
  })

  it('#RGB 展开 + 大小写 + 首尾空白', () => {
    expect(parseHex('#Fa0')).toEqual({ r: 255, g: 170, b: 0 })
    expect(parseHex('  #2B6DE8  ')).toEqual({ r: 43, g: 109, b: 232 })
  })

  it('非法输入返回 null', () => {
    expect(parseHex('2b6de8')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('#gggggg')).toBeNull()
    expect(parseHex('')).toBeNull()
  })
})

describe('HSL 换算', () => {
  it('基本色值往返', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000')
    expect(hslToHex(120, 100, 50)).toBe('#00ff00')
    expect(hslToHex(240, 100, 50)).toBe('#0000ff')
  })

  it('rgb → hsl → rgb 往返稳定（品牌主色）', () => {
    const [h, s, l] = rgbToHsl(parseHex('#2b6de8')!)
    const back = parseHex(hslToHex(h, s, l))!
    expect(Math.abs(back.r - 43)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.g - 109)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.b - 232)).toBeLessThanOrEqual(2)
  })
})

describe('deriveBrandPalette', () => {
  it('十档齐全，500 = primary 本体（小写规范化）', () => {
    const palette = deriveBrandPalette('#2B6DE8')!
    const keys = Object.keys(palette)
    expect(keys).toHaveLength(10)
    expect(keys.sort()).toEqual(
      [
        '--lc-brand-50',
        '--lc-brand-100',
        '--lc-brand-200',
        '--lc-brand-300',
        '--lc-brand-400',
        '--lc-brand-500',
        '--lc-brand-600',
        '--lc-brand-700',
        '--lc-brand-800',
        '--lc-brand-900',
      ].sort(),
    )
    expect(palette['--lc-brand-500']).toBe('#2b6de8')
  })

  it('亮度单调：50 最浅 → 900 最深', () => {
    const palette = deriveBrandPalette('#2b6de8')!
    const l = (name: string) => rgbToHsl(parseHex(palette[name])!)[2]
    const order = ['--lc-brand-50', '--lc-brand-100', '--lc-brand-200', '--lc-brand-300', '--lc-brand-400', '--lc-brand-500', '--lc-brand-600', '--lc-brand-700', '--lc-brand-800', '--lc-brand-900']
    for (let i = 1; i < order.length; i++) {
      expect(l(order[i])).toBeLessThan(l(order[i - 1]))
    }
  })

  it('非法 primary 返回 null', () => {
    expect(deriveBrandPalette('red')).toBeNull()
  })
})
