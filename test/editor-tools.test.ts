/**
 * 后台编辑器工具栏的测试。
 *
 * 两件事：
 *   · 按钮表里的词典 key 要真的存在 —— i18n 检查只认 t() 调用，抓不到这里的字符串
 *   · 选区改写的算术 —— 光标落错位置肉眼看不出来
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EDITOR_TOOLS,
  wrapSelection,
  prefixLines,
  insertLink,
  insertTable,
} from '../frontend/lib/editor-tools.ts'
import { allText } from '../frontend/i18n/ui.ts'

test('每个按钮的词典 key 都在语言包里', () => {
  for (const tool of EDITOR_TOOLS) {
    assert.ok(allText[tool.title], `词典里没有 ${tool.title}`)
  }
})

test('每个按钮都配齐了动作参数', () => {
  for (const tool of EDITOR_TOOLS) {
    const wrapped = tool.before !== undefined || tool.after !== undefined
    assert.ok(
      wrapped || tool.prefix !== undefined || tool.kind !== undefined,
      `按钮 ${tool.title} 没说要干什么`,
    )
    if (wrapped) {
      assert.ok(tool.before !== undefined && tool.after !== undefined)
    }
  }
})

test('wrapSelection：包住选中的字', () => {
  const result = wrapSelection('液态玻璃', 0, 2, '**', '**')
  assert.equal(result.value, '**液态**玻璃')
  assert.equal(result.start, 2)
  assert.equal(result.end, 4)
})

test('wrapSelection：没选中就插空标记，光标落在中间', () => {
  const result = wrapSelection('液态玻璃', 2, 2, '**', '**')
  assert.equal(result.value, '液态****玻璃')
  assert.equal(result.start, 4)
  assert.equal(result.end, 4)
})

test('prefixLines：给当前行加前缀', () => {
  const result = prefixLines('第一行\n第二行', 4, 6, '## ')
  assert.equal(result.value, '第一行\n## 第二行')
  assert.equal(result.start, 4)
})

test('prefixLines：跨行选区 —— 每一行都加前缀', () => {
  const result = prefixLines('一\n二\n三', 0, 3, '- ')
  assert.equal(result.value, '- 一\n- 二\n三')
})

test('insertLink：选中文字当链接文字', () => {
  const result = insertLink('看这里', 0, 3, 'https://example.com', false)
  assert.equal(result.value, '[看这里](https://example.com)')
  assert.equal(result.start, 1)
  assert.equal(result.end, 4)
})

test('insertLink：图片用感叹号', () => {
  const result = insertLink('', 0, 0, 'https://example.com/a.png', true)
  assert.equal(result.value, '![](https://example.com/a.png)')
  assert.equal(result.start, 1)
})

test('insertTable：塞一个空模板，光标落在第一格', () => {
  const result = insertTable('前后', 2)
  assert.equal(
    result.value,
    '前后|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n',
  )
  assert.equal(result.start, 4)
})
