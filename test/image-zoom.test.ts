import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampPan } from '../frontend/lib/image-zoom.ts'

test('图比视口小 —— 不许挪', () => {
  const pan = clampPan(50, -30, { w: 100, h: 80 }, { w: 800, h: 600 })
  assert.deepEqual(pan, { x: 0, y: 0 })
})

test('图比视口大 —— 拖到边缘就停', () => {
  const pan = clampPan(9999, -9999, { w: 1000, h: 1000 }, { w: 800, h: 600 })
  assert.deepEqual(pan, { x: 100, y: -200 })
})

test('图刚好跟视口一样大 —— 也挪不动', () => {
  const pan = clampPan(10, 10, { w: 800, h: 600 }, { w: 800, h: 600 })
  assert.deepEqual(pan, { x: 0, y: 0 })
})
