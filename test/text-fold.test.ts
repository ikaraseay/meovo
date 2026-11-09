import assert from 'node:assert/strict'
import { test } from 'node:test'
import { segmentSentences, sentenceEnds, snapBoundary } from '../frontend/lib/text-fold.ts'

test('中文按 。！？ 切句', () => {
  assert.deepEqual(segmentSentences('这是第一句。这是第二句！第三句呢？最后一句。'), [
    '这是第一句。',
    '这是第二句！',
    '第三句呢？',
    '最后一句。',
  ])
})

test('英文按 .!? 切句，句末空白留在前一句', () => {
  assert.deepEqual(segmentSentences('Hello world. This is a test. Another sentence here.'), [
    'Hello world. ',
    'This is a test. ',
    'Another sentence here.',
  ])
})

test('头衔缩写不当句末 —— Dr. / Fig. 跟下一段合并', () => {
  assert.deepEqual(segmentSentences('Dr. Smith arrived. He was late.'), [
    'Dr. Smith arrived. ',
    'He was late.',
  ])
  assert.deepEqual(segmentSentences('Fig. 2 shows the result. It is clear.'), [
    'Fig. 2 shows the result. ',
    'It is clear.',
  ])
})

test('姓名首字母合并 —— J. K. Rowling 是一句的开头', () => {
  assert.deepEqual(segmentSentences('J. K. Rowling wrote it. She is famous.'), [
    'J. K. Rowling wrote it. ',
    'She is famous.',
  ])
})

test('技术词里的句点不切 —— Node.js / example.com / 小数', () => {
  assert.deepEqual(segmentSentences('Use Node.js today. It works.'), ['Use Node.js today. ', 'It works.'])
  assert.deepEqual(segmentSentences('Visit example.com now. Then leave.'), [
    'Visit example.com now. ',
    'Then leave.',
  ])
  assert.deepEqual(segmentSentences('The value is 1.2 exactly. Round it.'), [
    'The value is 1.2 exactly. ',
    'Round it.',
  ])
})

test('etc. 后面大写开头是真句末 —— 不合并', () => {
  assert.deepEqual(segmentSentences('Bring cups, plates, etc. Then leave.'), [
    'Bring cups, plates, etc. ',
    'Then leave.',
  ])
})

test('引号里的句点跟着引号走', () => {
  assert.deepEqual(segmentSentences('He said “hello there”. Then left.'), [
    'He said “hello there”. ',
    'Then left.',
  ])
})

test('单句 / 空文本', () => {
  assert.deepEqual(segmentSentences('单句没有标点'), ['单句没有标点'])
  assert.deepEqual(segmentSentences(''), [])
})

test('句末偏移是累计长度，纯空白不算一句', () => {
  assert.deepEqual(sentenceEnds('这是第一句。这是第二句！第三句呢？最后一句。'), [6, 12, 17, 22])
  assert.deepEqual(sentenceEnds('Hello world. This is a test. Another sentence here.'), [13, 29, 51])
  assert.deepEqual(sentenceEnds(''), [])
})

test('snapBoundary：落在排除区内部挪到区末，边界上不动', () => {
  const ranges = [[3, 10]] as const
  assert.equal(snapBoundary(5, ranges), 10) // 内部 → 区末
  assert.equal(snapBoundary(3, ranges), 3) // 正好在区首
  assert.equal(snapBoundary(10, ranges), 10) // 正好在区末
  assert.equal(snapBoundary(12, ranges), 12) // 区外
  assert.equal(snapBoundary(1, ranges), 1) // 区前
})

test('snapBoundary：多个排除区取命中的那个', () => {
  const ranges = [
    [2, 5],
    [12, 20],
  ] as const
  assert.equal(snapBoundary(3, ranges), 5)
  assert.equal(snapBoundary(15, ranges), 20)
  assert.equal(snapBoundary(8, ranges), 8)
})