import assert from 'node:assert/strict'
import { test } from 'node:test'
import { avoidBar, clampFab, clampPoint, defaultMenuX } from '../frontend/lib/floating-bar-layout.ts'

const vp = { width: 1000, height: 800 }

test('clampPoint 把坐标夹进视口', () => {
  assert.deepEqual(clampPoint({ x: -50, y: -50 }, { width: 200, height: 100 }, vp, 10), { x: 10, y: 10 })
  assert.deepEqual(clampPoint({ x: 5000, y: 5000 }, { width: 200, height: 100 }, vp, 10), { x: 790, y: 690 })
  // 视口比元素还小：夹到 margin，不出现负值
  assert.deepEqual(clampPoint({ x: 0, y: 0 }, { width: 1200, height: 900 }, vp, 10), { x: 10, y: 10 })
})

test('defaultMenuX 居中且不越界', () => {
  assert.equal(defaultMenuX(400, vp, 10), 300)
  assert.equal(defaultMenuX(2000, vp, 10), 10)
})

test('clampFab 底部给抽屉让位', () => {
  assert.deepEqual(
    clampFab({ right: 5, bottom: 5 }, { width: 60, height: 40 }, vp, { margin: 10, minBottom: 120 }),
    { right: 10, bottom: 120 },
  )
  assert.deepEqual(
    clampFab({ right: 5000, bottom: 5000 }, { width: 60, height: 40 }, vp, { margin: 10, minBottom: 20 }),
    { right: 930, bottom: 740 },
  )
})

test('avoidBar 重叠时挪到栏体下方', () => {
  const bar = { x: 300, y: 10, width: 400, height: 60 }
  const moved = avoidBar({ x: 350, y: 20 }, { width: 280, height: 240 }, bar, vp, { margin: 10, gap: 8 })
  assert.equal(moved.x, 350)
  assert.equal(moved.y, 78) // 10 + 60 + 8
})

test('avoidBar 下方放不下时挪到栏体上方', () => {
  const bar = { x: 300, y: 10, width: 400, height: 60 }
  const moved = avoidBar({ x: 350, y: 20 }, { width: 280, height: 750 }, bar, vp, { margin: 10, gap: 8 })
  assert.equal(moved.y, 10)
})

test('avoidBar 不重叠时原样返回', () => {
  const bar = { x: 300, y: 10, width: 400, height: 60 }
  const popup = { x: 50, y: 500 }
  assert.deepEqual(avoidBar(popup, { width: 280, height: 240 }, bar, vp, { margin: 10, gap: 8 }), popup)
})
