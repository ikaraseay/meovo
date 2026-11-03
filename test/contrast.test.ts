import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * 主题对比度自检 —— WCAG 2.1
 * ---------------------------------------------------------
 * 手改主题色时对比度最容易悄悄改坏（上次浅色主题 muted / faint / 链接
 * 三处都低于 4.5:1）。这条测试直接把主题文件里的 token 抠出来算，
 * 以后再改色它会先红。
 *
 * 测的是**底色上的正文**——极光光斑只会让浅色底更亮、深色底略亮，
 * 对深字而言都是提高对比度，所以拿纯底色算是保守的。
 */

const css = readFileSync(
  new URL('../frontend/styles/themes/liquid-glass.css', import.meta.url),
  'utf8',
)

type Rgb = [number, number, number]

/** 取某个选择器块里的 token */
function blockTokens(selector: string): Record<string, string> {
  const idx = css.indexOf(selector + ' {')
  if (idx < 0) return {}
  const start = css.indexOf('{', idx)
  const end = css.indexOf('}', start)
  const tokens: Record<string, string> = {}
  for (const m of css.slice(start + 1, end).matchAll(/--ui-([\w-]+):\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim()
  }
  return tokens
}

/** 解析 #rgb / #rrggbb / rgba(r, g, b, a) */
function parseColor(value: string): { rgb: Rgb; alpha: number } | null {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1]
    return {
      rgb: [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ],
      alpha: 1,
    }
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/i)
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => p.trim())
    return {
      rgb: [Number(parts[0]), Number(parts[1]), Number(parts[2])],
      alpha: parts[3] === undefined ? 1 : Number(parts[3]),
    }
  }
  return null
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 对比度 —— fg 半透明时先叠到底色上 */
function contrastRatio(fgValue: string, bg: Rgb): number | null {
  const fg = parseColor(fgValue)
  if (!fg) return null
  const solid: Rgb = [
    fg.rgb[0] * fg.alpha + bg[0] * (1 - fg.alpha),
    fg.rgb[1] * fg.alpha + bg[1] * (1 - fg.alpha),
    fg.rgb[2] * fg.alpha + bg[2] * (1 - fg.alpha),
  ]
  const a = luminance(solid)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** 要保证可读的文字色 —— 正文级标准是 4.5:1 */
const TEXT_TOKENS = ['text', 'text-secondary', 'text-muted', 'text-faint', 'text-accent']
const MIN_RATIO = 4.5

const light = blockTokens("html[data-theme='liquid-glass']")
const dark = blockTokens("html[data-theme='liquid-glass'].dark")
const lightHigh = { ...light, ...blockTokens("html[data-theme='liquid-glass']:not(.dark).contrast-high") }
const darkHigh = { ...dark, ...blockTokens("html[data-theme='liquid-glass'].dark.contrast-high") }

for (const [name, tokens] of [
  ['浅色', light],
  ['深色', dark],
  ['浅色 · 高对比', lightHigh],
  ['深色 · 高对比', darkHigh],
] as const) {
  test(`${name}主题：文字色对底色的对比度 ≥ ${MIN_RATIO}:1`, () => {
    const bg = parseColor(tokens['bg'] ?? '')
    assert.ok(bg, `${name}主题没有 --ui-bg`)
    for (const token of TEXT_TOKENS) {
      const value = tokens[token]
      assert.ok(value, `${name}主题缺 --ui-${token}`)
      const ratio = contrastRatio(value, bg.rgb)
      assert.ok(ratio !== null, `--ui-${token} 的值认不出来：${value}`)
      assert.ok(
        ratio >= MIN_RATIO,
        `${name}主题的 --ui-${token}（${value}）对比度只有 ${ratio?.toFixed(2)}:1，低于 ${MIN_RATIO}:1`,
      )
    }
  })
}
