import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previewClickAction } from '../frontend/lib/admin-preview.ts'

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
