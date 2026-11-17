import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  corridorAt,
  minMeasure,
  YIELD_MARGIN,
  type Rect,
} from '../frontend/lib/yield-layout.ts'

/** 正文列：宽 760，左边距 100 */
const COLUMN: Rect = { top: 200, bottom: 2000, left: 100, right: 860 }

/** 列宽 760 → 一截走廊的下限 max(96, 760×0.12) = 96 */
const MIN = minMeasure(COLUMN)

const card = (rect: Rect): Rect => rect

/** 一行字形占的纵向区间 */
const band = (y: number) => ({ top: y, bottom: y + 30 })

test('走廊下限：绝对下限 96px，窄列上不生效', () => {
  assert.equal(MIN, 96)
  // 宽列：下限跟着列宽走
  assert.equal(minMeasure({ ...COLUMN, right: 1000 }), 108)
  // 窄列：绝对下限兜底
  assert.equal(minMeasure({ ...COLUMN, right: 500 }), 96)
})

test('没有卡片 → 走廊就是整列', () => {
  const corridor = corridorAt(COLUMN, [], band(400), MIN)
  assert.equal(corridor.skip, false)
  assert.deepEqual(corridor.segments, [{ width: 760, offset: 0 }])
})

test('卡片压住右侧 → 文字走左边，右缘贴着卡片留出缝', () => {
  const corridor = corridorAt(COLUMN, [card({ top: 320, bottom: 520, left: 600, right: 900 })], band(400), MIN)
  assert.equal(corridor.skip, false)
  assert.deepEqual(corridor.segments, [{ width: 600 - YIELD_MARGIN - COLUMN.left, offset: 0 }])
})

test('卡片压住左侧 → 文字走右边，左缘贴着卡片留出缝', () => {
  const corridor = corridorAt(COLUMN, [card({ top: 520, bottom: 700, left: 0, right: 260 })], band(600), MIN)
  assert.equal(corridor.skip, false)
  assert.deepEqual(corridor.segments, [
    { width: COLUMN.right - (260 + YIELD_MARGIN), offset: 260 + YIELD_MARGIN - COLUMN.left },
  ])
})

test('卡片在中间 → 左右各一截，文字把卡片包在中间', () => {
  const corridor = corridorAt(COLUMN, [card({ top: 320, bottom: 520, left: 330, right: 630 })], band(400), MIN)
  assert.equal(corridor.skip, false)
  assert.equal(corridor.segments.length, 2)
  // 左截：列左缘到卡片左缘留缝
  assert.deepEqual(corridor.segments[0], { width: 330 - YIELD_MARGIN - COLUMN.left, offset: 0 })
  // 右截：卡片右缘留缝到列右缘
  assert.deepEqual(corridor.segments[1], {
    width: COLUMN.right - (630 + YIELD_MARGIN),
    offset: 630 + YIELD_MARGIN - COLUMN.left,
  })
})

test('卡片盖满整列 → 一截都放不下，这一行跳过', () => {
  const corridor = corridorAt(COLUMN, [card({ top: 320, bottom: 520, left: 0, right: 900 })], band(400), MIN)
  assert.equal(corridor.skip, true)
  assert.deepEqual(corridor.segments, [])
})

test('走廊逐行算 —— 卡片上下缘的行不受影响', () => {
  const c = card({ top: 320, bottom: 520, left: 600, right: 900 })
  // 卡片上缘之上：整列
  assert.equal(corridorAt(COLUMN, [c], band(280), MIN).segments[0].width, 760)
  // 卡片之内：让开
  assert.equal(corridorAt(COLUMN, [c], band(400), MIN).segments[0].width, 600 - YIELD_MARGIN - COLUMN.left)
  // 卡片下缘之下：又回到整列
  assert.equal(corridorAt(COLUMN, [c], band(600), MIN).segments[0].width, 760)
})

test('卡片边缘切进字形就算压到 —— 别让字压在卡片边上', () => {
  const c = card({ top: 300, bottom: 520, left: 0, right: 900 })
  // 字形区间 400~430 在卡片的纵向范围内 → 压到，整行让开
  assert.equal(corridorAt(COLUMN, [c], { top: 400, bottom: 430 }, MIN).skip, true)
  // 字形区间整个在卡片上方 → 没压到
  assert.equal(corridorAt(COLUMN, [c], { top: 100, bottom: 130 }, MIN).segments[0].width, 760)
  // 擦边：卡片的底缘正好是字形区间的上缘 → 不算压到
  const edge = card({ top: 300, bottom: 400, left: 0, right: 900 })
  assert.equal(corridorAt(COLUMN, [edge], { top: 400, bottom: 430 }, MIN).segments[0].width, 760)
})

test('两张卡夹住中间 → 只剩中间那条走廊', () => {
  const corridor = corridorAt(
    COLUMN,
    [
      card({ top: 320, bottom: 520, left: 0, right: 300 }),
      card({ top: 320, bottom: 520, left: 500, right: 900 }),
    ],
    band(400),
    MIN,
  )
  // 两张卡各压住一侧 → 中间那条：500-12 - (300+12) = 176px
  assert.equal(corridor.skip, false)
  assert.deepEqual(corridor.segments, [
    { width: 500 - YIELD_MARGIN - (300 + YIELD_MARGIN), offset: 300 + YIELD_MARGIN - COLUMN.left },
  ])
})

test('窄到读不了的那截丢掉 —— 别把几个字塞进一条缝', () => {
  const corridor = corridorAt(COLUMN, [card({ top: 320, bottom: 520, left: 700, right: 760 })], band(400), MIN)
  // 左截 700-12-100 = 588（能用），右截 860-772 = 88（太窄，丢掉）
  assert.equal(corridor.segments.length, 1)
  assert.equal(corridor.segments[0].width, 588)
})
