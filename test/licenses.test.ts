/**
 * 许可协议 —— 三处必须对齐：LICENSE_IDS、LICENSES、语言包词条。
 * ---------------------------------------------------------
 * 协议只加在 frontend/lib/licenses.ts 一处；frontmatter schema、后台下拉
 * 与后台校验都从那份列表派生。这里守住的是「加了 id 忘了补文案」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LICENSE_IDS, LICENSES } from '../frontend/lib/licenses.ts'
import { ui } from '../frontend/i18n/ui.ts'

const dictionary = ui as Record<string, { zh: string; en: string }>

test('每个协议都有条目 —— 列表与条目不多不少', () => {
  assert.equal(Object.keys(LICENSES).length, LICENSE_IDS.length)
  for (const id of LICENSE_IDS) assert.ok(LICENSES[id], id + ' 没有条目')
})

test('协议名与说明都有中英文案', () => {
  for (const id of LICENSE_IDS) {
    const license = LICENSES[id]
    for (const key of [license.nameKey, license.noteKey]) {
      const entry = dictionary[key]
      assert.ok(entry, key + ' 缺词条')
      assert.ok(entry.zh.trim() && entry.en.trim(), key + ' 中英不全')
    }
  }
})

test('协议 id 是 ASCII kebab —— frontmatter 与 D1 里存的就是这个值', () => {
  for (const id of LICENSE_IDS) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
})

test('开源协议有原文链接，保留所有权利没有', () => {
  for (const id of LICENSE_IDS) {
    const url = LICENSES[id].url
    if (id === 'all-rights') assert.equal(url, undefined)
    else assert.match(url ?? '', /^https:\/\/creativecommons\.org\//)
  }
})
