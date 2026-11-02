/**
 * 设置（后台改过的默认文字）—— 纯函数部分。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeSettingEntries,
  normalizeSetting,
  parseStoredValue,
  serializeSettingValue,
  type DefaultEntry,
} from '../backend/lib/admin/settings.ts'

const defaults = new Map<string, DefaultEntry>([
  ['site.name', { key: 'site.name', zh: 'My Blog', en: 'My Blog' }],
  ['nav.home', { key: 'nav.home', zh: '首页', en: 'Home' }],
])

test('设置：改动合法就通过', () => {
  const result = normalizeSetting({ key: 'nav.home', zh: '开始', en: 'Start' }, defaults)
  assert.equal(result.ok, true)
  assert.equal(result.value?.zh, '开始')
  assert.equal(result.value?.unchanged, false)
})

test('设置：跟默认值一样就算没改', () => {
  const result = normalizeSetting({ key: 'nav.home', zh: '首页', en: 'Home' }, defaults)
  assert.equal(result.ok, true)
  assert.equal(result.value?.unchanged, true)
})

test('设置：语言包里没有的键 —— 拒绝', () => {
  const result = normalizeSetting({ key: 'nope.nope', zh: 'x', en: 'x' }, defaults)
  assert.equal(result.ok, false)
  assert.ok(result.errors?.includes('unknown_key'))
})

test('设置：文案不是文字 —— 拒绝', () => {
  const result = normalizeSetting({ key: 'nav.home', zh: 42, en: 'x' }, defaults)
  assert.equal(result.ok, false)
  assert.ok(result.errors?.includes('invalid_value'))
})

test('设置：库里的值坏了就当没有', () => {
  assert.equal(parseStoredValue('not json'), null)
  assert.equal(parseStoredValue('{"zh":"a","en":"b"}')?.zh, 'a')
  assert.deepEqual(parseStoredValue('{"zh":"a"}'), { zh: 'a', en: '' })
})

test('设置：存进去再读出来一样', () => {
  const value = { zh: '中文', en: 'English' }
  assert.deepEqual(parseStoredValue(serializeSettingValue(value)), value)
})

test('设置：默认值叠上覆盖值 —— 界面看到的就是最终文案', () => {
  const merged = mergeSettingEntries([...defaults.values()], new Map([['nav.home', { zh: '开始', en: 'Home' }]]))
  const home = merged.find((entry) => entry.key === 'nav.home')
  assert.equal(home?.zh, '开始')
  assert.equal(home?.en, 'Home')
  assert.equal(home?.overridden, true)
  const name = merged.find((entry) => entry.key === 'site.name')
  assert.equal(name?.zh, 'My Blog')
  assert.equal(name?.overridden, false)
})
