/**
 * 页脚卡片最小高度 —— 后台那个控件的数值处理。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FOOTER_HEIGHT_KEY,
  MAX_FOOTER_HEIGHT,
  parseFooterMinHeight,
} from '../frontend/lib/footer-height.ts'
import { allText } from '../frontend/i18n/ui.ts'

test('页脚高度：设置键在词典里（缺了 t() 会返回键名本身）', () => {
  assert.ok(FOOTER_HEIGHT_KEY in allText, `${FOOTER_HEIGHT_KEY} 不在词典里`)
})

test('页脚高度：默认不限', () => {
  assert.equal(parseFooterMinHeight(allText[FOOTER_HEIGHT_KEY].zh), 0)
})

test('页脚高度：读数字', () => {
  assert.equal(parseFooterMinHeight('180'), 180)
  assert.equal(parseFooterMinHeight(' 180 '), 180)
  assert.equal(parseFooterMinHeight('180px'), 180)
})

test('页脚高度：坏了的值退回不限', () => {
  assert.equal(parseFooterMinHeight(undefined), 0)
  assert.equal(parseFooterMinHeight(''), 0)
  assert.equal(parseFooterMinHeight('abc'), 0)
  assert.equal(parseFooterMinHeight('-50'), 0)
})

test('页脚高度：封顶', () => {
  assert.equal(parseFooterMinHeight('99999'), MAX_FOOTER_HEIGHT)
})
