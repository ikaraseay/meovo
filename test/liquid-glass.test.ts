import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { canRefract, glassAberration, glassMetrics } from '../frontend/lib/liquid-glass.ts'
import { CLASS } from '../frontend/lib/dom-contract.ts'

test('滤镜区域换回像素 = 元素尺寸 + 两侧余量', () => {
  const near = (actual: number, expected: number) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)

  for (const [w, h] of [
    [416, 48],
    [144, 33],
    [200, 200],
  ]) {
    const m = glassMetrics(w, h)
    near((m.x / 100) * w, -m.pad)
    near((m.y / 100) * h, -m.pad)
    near((m.width / 100) * w, w + m.pad * 2)
    near((m.height / 100) * h, h + m.pad * 2)
  }
})

test('镜片实测尺寸算出的区域，跟浏览器里挂上的一致', () => {
  const m = glassMetrics(144, 33)
  assert.equal(m.scale, -7)
  assert.equal(m.pad, 6)
  assert.equal(m.x, -4.166666666666666)
  assert.equal(m.y, -18.181818181818183)
  assert.equal(m.width, 108.33333333333333)
  assert.equal(m.height, 136.36363636363635)
})

test('scale 被钳在 25 以内 —— Safari 高 scale 会出 artifact', () => {
  assert.equal(glassMetrics(1000, 1000).scale, -25)
})

test('窄条按高度取值，方块按宽度取值', () => {
  assert.equal(glassMetrics(416, 48).scale, -11) // min(37.4, 10.6)
  assert.equal(glassMetrics(200, 200).scale, -18) // min(18, 44)
})

test('色散三通道各不相同，且不会翻符号', () => {
  // 镜片的 base 只有 7px —— 用固定 10px 档位会直接翻符号，彩虹就没了
  const [r, g, b] = glassAberration(-7)
  assert.ok(r !== g && g !== b, `${r} / ${g} / ${b}`)
  assert.ok(r < 0 && g < 0 && b < 0, `${r} / ${g} / ${b}`)
  assert.equal(b - r, 4)

  // 大元素沿用上游那档比例（探针 5 实测过 -26 / -23 / -20）
  assert.deepEqual(glassAberration(-26), [-26, -23, -20])
})

test('canRefract 读的是 <html> 上的 class', () => {
  const stub = (has: boolean) => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        documentElement: {
          classList: { contains: (c: string) => c === CLASS.refract && has },
        },
      },
    })
  }
  stub(true)
  assert.equal(canRefract(), true)
  stub(false)
  assert.equal(canRefract(), false)
  Reflect.deleteProperty(globalThis, 'document')
  // 没有 document（SSR / Node）时不能挂折射
  assert.equal(canRefract(), false)
})

test('镜片尺寸只有一个主人 —— CSS 不许写宽高，也不许过渡', () => {
  // 位移图 / 滤镜区域 / 元素盒子要 1:1 对齐。尺寸逐帧变化的话，
  // 每帧都要重建一张位移图 —— 过渡期间生成的全是元素从未有过的尺寸。
  const bar = readFileSync(new URL('../frontend/components/FloatingBar.astro', import.meta.url), 'utf8')
  const start = bar.indexOf('.glass-lens {')
  const css = bar.slice(start, bar.indexOf('.glass-lens.is-visible'))

  assert.ok(!/\bwidth\s*:/.test(css), '镜片宽度不许写在 CSS 里 —— 主人是 JS')
  assert.ok(!/\bheight\s*:/.test(css), '镜片高度不许写在 CSS 里 —— 主人是 JS')
  assert.ok(!/transition:[^;]*\bwidth\b/.test(css), '镜片宽度不能做过渡')
  assert.ok(!/transition:[^;]*\bheight\b/.test(css), '镜片高度不能做过渡')
})

test('折射能力的 class 名三处一致', () => {
  // 引擎判据在 BaseLayout 的首屏内联脚本里（内联脚本不能 import 模块），
  // class 名却要在脚本 / CSS / 这里三处对上 —— 对不上就静默失效。
  const layout = readFileSync(new URL('../frontend/layouts/BaseLayout.astro', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../frontend/styles/tokens.css', import.meta.url), 'utf8')
  assert.ok(layout.includes(CLASS.refract), `BaseLayout 的内联脚本要挂 ${CLASS.refract}`)
  assert.ok(layout.includes(CLASS.fallback), `BaseLayout 的内联脚本要挂 ${CLASS.fallback}`)
  assert.ok(css.includes(`html.${CLASS.refract} .ui-nav-surface`), 'CSS 要按折射 class 分流')
  assert.ok(css.includes(`html.${CLASS.fallback} .ui-glass-lens`), 'CSS 要按降级 class 分流')
})
