import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { ATTR, CLASS, Z } from '../frontend/lib/dom-contract.ts'

/** 收集目录下的源码文件 */
function sources(dir: URL, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
    if (entry.isDirectory()) sources(url, out)
    else if (/\.(css|astro|ts)$/.test(entry.name)) out.push(fileURLToPath(url))
  }
  return out
}

/** 读源码 —— 注释里的 z-index 不是声明，先剥掉 */
const read = (file: string) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const styleFiles = [
  ...sources(new URL('../frontend/styles/', import.meta.url)),
  ...sources(new URL('../frontend/components/', import.meta.url)),
]
const markupFiles = [
  ...sources(new URL('../frontend/components/', import.meta.url)),
  ...sources(new URL('../frontend/layouts/', import.meta.url)),
  ...sources(new URL('../frontend/pages/', import.meta.url)),
]

test('层级刻度：tokens.css 与契约一致', () => {
  const tokens = read(new URL('../frontend/styles/tokens.css', import.meta.url).pathname)
  for (const [name, value] of Object.entries(Z)) {
    const match = tokens.match(new RegExp(`--ui-z-${name}:\\s*(-?\\d+);`))
    // 只在 JS 里用的（卡片层序）不进 CSS
    if (!match) continue
    assert.equal(Number(match[1]), value, `--ui-z-${name} 与契约不一致`)
  }
  // 反过来：CSS 里每一条刻度都要在契约里有名字
  for (const match of tokens.matchAll(/--ui-z-([\w-]+):\s*(-?\d+);/g)) {
    const [, name, value] = match
    assert.ok(name in Z, `--ui-z-${name} 不在契约里`)
    assert.equal(Number(value), Z[name as keyof typeof Z], `--ui-z-${name} 与契约不一致`)
  }
})

test('层序由语义决定：卡片 < 悬浮栏 < 遮罩', () => {
  assert.ok(Z.widget < Z.nav, '卡片不能盖住悬浮栏')
  assert.ok(Z.nav < Z.panel && Z.panel < Z.fab && Z.fab < Z.popup, '悬浮栏四个面的顺序反了')
  assert.ok(Z.popup < Z.loader, '加载遮罩要盖住一切')
  assert.ok(Z.bg < Z.skip, '背景在内容下面')
})

test('组件里不写裸 z-index —— 层序走 tokens.css 的刻度', () => {
  for (const file of styleFiles) {
    if (file.endsWith('tokens.css')) continue
    const bare = read(file).match(/z-index:\s*(-?\d+)/g)
    assert.equal(bare, null, `${file} 里有裸 z-index：${bare?.join(' ')}`)
  }
})

test('契约里的 class 名都有样式在用', () => {
  const css = styleFiles.map(read).join('\n')
  for (const value of Object.values(CLASS)) {
    assert.ok(css.includes(`.${value}`), `class ${value} 没有任何样式用它`)
  }
})

test('契约里的 data 属性都有人在用', () => {
  const markup = markupFiles.map(read).join('\n')
  for (const [key, value] of Object.entries(ATTR)) {
    // 标记里要么写死属性名，要么用契约展开（{[ATTR.x]: ''}）
    const used =
      new RegExp(`${value}(?![-\w])`).test(markup) || markup.includes(`ATTR.${key}`)
    assert.ok(used, `data 属性 ${value} 没有出现在标记里`)
  }
})

test('部件 tint：色相变量在组件与样式层同名', () => {
  // 组件只内联色相，配方在 tokens.css —— 两边变量名对不上，tint 会静默消失（没有报错，只有颜色没了）
  const tokens = read(new URL('../frontend/styles/tokens.css', import.meta.url).pathname)
  const widget = read(new URL('../frontend/components/GlassWidget.astro', import.meta.url).pathname)
  assert.ok(tokens.includes('var(--ui-widget-hue)'), 'tokens.css 没读部件色相')
  assert.ok(widget.includes('--ui-widget-hue'), 'GlassWidget 没内联部件色相')
})

test('首屏脚本里的 class 名跟契约一致', () => {
  // 内联脚本不能 import 模块 —— 里面是字面量，靠这条测试盯着
  const layout = read(new URL('../frontend/layouts/BaseLayout.astro', import.meta.url).pathname)
  for (const value of [CLASS.js, CLASS.pageReady, CLASS.refract, CLASS.fallback]) {
    assert.ok(layout.includes(`'${value}'`), `BaseLayout 的首屏脚本要挂 ${value}`)
  }
})
