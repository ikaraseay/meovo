import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const theme = readFileSync(
  new URL('../frontend/styles/themes/liquid-glass.css', import.meta.url),
  'utf8'
)

/** 取某个阴影 token 的全部定义（浅色 + 深色各一份） */
function shadowTokens(name: string): string[] {
  return [...theme.matchAll(new RegExp(`--ui-${name}:\\s*([^;]+);`, 'g'))].map((m) => m[1])
}

/** 按逗号拆阴影层 —— rgba() 里的逗号不算 */
function layers(value: string): string[] {
  const out: string[] = []
  let current = ''
  let depth = 0
  for (const char of value) {
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/**
 * 玻璃卡不能有外阴影：
 * Safari 的 clip-path 裁不掉 box-shadow（影子是方角，卡片是 squircle，对不上），
 * 换成 drop-shadow 又会被半透明玻璃折成一条脏边 —— 所以只留 inset 内高光。
 */
test('玻璃卡与悬浮栏只有 inset 内高光，没有外阴影', () => {
  for (const name of ['card-shadow', 'card-shadow-hover', 'nav-shadow', 'nav-shadow-top']) {
    const defs = shadowTokens(name)
    assert.ok(defs.length > 0, `主题里没有 --ui-${name}`)
    for (const def of defs) {
      const list = layers(def)
      assert.ok(list.length > 0, `--ui-${name} 是空的`)
      for (const layer of list) {
        assert.ok(layer.startsWith('inset'), `--ui-${name} 有外阴影：${layer}`)
      }
    }
  }
})

/** 阴影颜色跟主角走：深海军蓝紫，别退回暖棕 */
test('主题里的阴影不用暖棕', () => {
  for (const brown of ['140, 80, 40', '120, 60, 30']) {
    assert.ok(!theme.includes(brown), `阴影还在用暖棕 rgba(${brown})`)
  }
  // 主角主色 #2f2351
  assert.ok(theme.includes('47, 35, 81'), '阴影没有用主角的靛蓝')
})
