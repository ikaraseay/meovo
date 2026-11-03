/**
 * i18n 的两条边界 —— 「缺词条」与「有意留空」不是一回事。
 *
 * 缺词条要显示成 key 本身（看得见的缺失）；
 * 有意留空就显示成空（作者说「这段不显示」）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickTranslation } from '../frontend/i18n/index.ts'

test('没有这条词条 —— null（界面显示成 key 本身）', () => {
  assert.equal(pickTranslation(undefined, 'zh'), null)
})

test('条目在但两种语言都空 —— 空串（有意留空 = 不显示）', () => {
  assert.equal(pickTranslation({ zh: '', en: '' }, 'zh'), '')
  assert.equal(pickTranslation({ zh: '', en: '' }, 'en'), '')
})

test('当前语言缺文案 —— 回落到默认语言', () => {
  assert.equal(pickTranslation({ zh: '中文', en: '' }, 'en'), '中文')
  assert.equal(pickTranslation({ zh: '中文', en: 'English' }, 'en'), 'English')
})
