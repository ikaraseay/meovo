import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAcceptLanguage, pickLocale } from '../frontend/i18n/negotiate.ts'

test('按 q 值排语言顺序', () => {
  const parsed = parseAcceptLanguage('en-US;q=0.8, zh-CN;q=0.9, fr;q=0.5')
  assert.deepEqual(
    parsed.map((entry) => entry.tag),
    ['zh-cn', 'en-us', 'fr'],
  )
})

test('q=0 的一律不算', () => {
  assert.deepEqual(parseAcceptLanguage('en;q=0, zh-CN'), [{ tag: 'zh-cn', quality: 1 }])
})

test('认 en 给 en，认 zh 给 zh', () => {
  assert.equal(pickLocale('en-US,en;q=0.9'), 'en')
  assert.equal(pickLocale('zh-CN,zh;q=0.9'), 'zh')
  assert.equal(pickLocale('zh-TW'), 'zh')
})

test('不认识的语言回默认语言（中文）', () => {
  assert.equal(pickLocale('fr-FR,de;q=0.8'), 'zh')
  assert.equal(pickLocale(''), 'zh')
  assert.equal(pickLocale(null), 'zh')
})

test('同权重时按出现顺序', () => {
  assert.equal(pickLocale('en-US,zh-CN'), 'en')
})
