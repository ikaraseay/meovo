import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  clampSplit,
  previewClickAction,
  previewOffset,
  previewScale,
  splitPercent,
  SPLIT_DEFAULT,
} from '../frontend/lib/admin-preview.ts'

const click = (input: Partial<Parameters<typeof previewClickAction>[0]>) =>
  previewClickAction({ shiftKey: false, copyKey: null, isAnchor: false, ...input })

test('预览：按住 Shift 一律放行 —— 可以顺着站点翻页', () => {
  assert.deepEqual(click({ shiftKey: true, isAnchor: true }), { kind: 'pass' })
  assert.deepEqual(click({ shiftKey: true, copyKey: 'site.author', isAnchor: true }), {
    kind: 'pass',
  })
})

test('预览：普通点可改文案 → 跳到词条', () => {
  assert.deepEqual(click({ copyKey: 'site.author' }), { kind: 'jump', key: 'site.author' })
  // 可改文案本身也是链接（邮箱）时，跳词条优先于「不跟随链接」
  assert.deepEqual(click({ copyKey: 'site.email', isAnchor: true }), {
    kind: 'jump',
    key: 'site.email',
  })
})

test('预览：普通点别的链接 → 拦下，别把预览带走', () => {
  assert.deepEqual(click({ isAnchor: true }), { kind: 'block' })
})

test('预览：既不沾链接也不沾文案 → 放行', () => {
  assert.deepEqual(click({}), { kind: 'pass' })
})

test('分栏：拖出来的比例落在两成到八成之间', () => {
  assert.equal(splitPercent(0, 0, 1000), 20)
  assert.equal(splitPercent(300, 0, 1000), 30)
  assert.equal(splitPercent(500, 0, 1000), 50)
  assert.equal(splitPercent(1000, 0, 1000), 80)
  // 量不到宽度 —— 别乱动
  assert.equal(splitPercent(0, 0, 0), SPLIT_DEFAULT)
})

test('分栏：超出边界就夹住', () => {
  assert.equal(clampSplit(10), 20)
  assert.equal(clampSplit(95), 80)
  assert.equal(clampSplit(63.4), 63)
})

test('预览缩放：只缩不放（放大只会发虚）', () => {
  assert.equal(previewScale(893, 1060), 893 / 1060)
  assert.equal(previewScale(1440, 1060), 1)
  assert.equal(previewScale(0, 1060), 1)
})

test('预览居中：缩放后剩下的空当分给两边', () => {
  assert.equal(previewOffset(1200, 1060, 1), 70)
  // 缩着放满 —— 没有空当
  assert.equal(previewOffset(893, 1060, 893 / 1060), 0)
})

test('分栏默认值：样式与脚本是一回事', () => {
  // 改了一边忘了另一边，默认分栏就会悄悄变 —— 样式与脚本必须对齐
  const css = readFileSync(new URL('../frontend/styles/admin.css', import.meta.url).pathname, 'utf8')
  assert.match(css, new RegExp('--admin-split:\\s*' + SPLIT_DEFAULT + ';'))
})
