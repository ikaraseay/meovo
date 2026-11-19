import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashHue, TINT_HUES } from '../frontend/lib/tint-hue.ts'

test('同一 key 永远同一个色相 —— 刷新不换色', () => {
  assert.equal(hashHue('article-head'), hashHue('article-head'))
})

test('色相只从色相表里取', () => {
  for (const key of ['a', 'article-head', 'sidebar-toc', '', 'zzz']) {
    assert.ok(TINT_HUES.includes(hashHue(key)), key + ' 的色相不在表里')
  }
})

test('不同 key 不会全撞成同一个色 —— 哈希有碰撞，不锁死具体分配', () => {
  const hues = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(hashHue))
  assert.ok(hues.size > 1)
})
