import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createPhysics,
  magnetSnap,
  nearestNode,
  pinBody,
  releaseBody,
  stepPhysics,
} from '../frontend/lib/graph-physics.ts'

test('拖动一个节点：连着的邻居被弹簧拽过去', () => {
  let state = createPhysics(
    [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
    ],
    [{ source: 'a', target: 'b' }],
  )
  // 抓住 a 往远处拉 —— 弹簧被拉长，b 被拽向 a
  state = pinBody(state, 'a', 250, 0)
  const before = state.bodies.find((body) => body.id === 'b')!.x
  for (let i = 0; i < 30; i++) state = stepPhysics(state, 1)
  const after = state.bodies.find((body) => body.id === 'b')!.x
  assert.ok(after > before, `邻居应该被拽向 a：${before} → ${after}`)
})

test('松手后节点回到锚点附近', () => {
  let state = createPhysics(
    [{ id: 'a', x: 10, y: 10 }],
    [],
  )
  state = pinBody(state, 'a', 120, 120)
  state = releaseBody(state, 'a')
  for (let i = 0; i < 200; i++) state = stepPhysics(state, 1)
  const body = state.bodies[0]
  assert.ok(Math.abs(body.x - 10) < 1, `x 应该回到锚点：${body.x}`)
  assert.ok(Math.abs(body.y - 10) < 1, `y 应该回到锚点：${body.y}`)
})

test('模拟是稳定的：不会发散', () => {
  let state = createPhysics(
    [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 60, y: 40 },
      { id: 'c', x: -50, y: 20 },
    ],
    [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ],
  )
  state = pinBody(state, 'b', 200, -150)
  for (let i = 0; i < 400; i++) state = stepPhysics(state, 1)
  for (const body of state.bodies) {
    assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y))
    assert.ok(Math.hypot(body.x, body.y) < 2000, `${body.id} 飞出去了：${body.x}, ${body.y}`)
  }
})

test('磁性吸附：靠近节点时被拉过去', () => {
  const anchors = [{ id: 'b', x: 100, y: 0 }]
  const result = magnetSnap({ x: 80, y: 0 }, anchors)
  assert.equal(result.snapped, 'b')
  assert.ok(result.x > 80, '应该被拉向锚点')
  assert.ok(result.x < 100, '不该越过锚点')
})

test('磁性吸附：离得远就不吸', () => {
  const anchors = [{ id: 'b', x: 100, y: 0 }]
  const result = magnetSnap({ x: 0, y: 0 }, anchors)
  assert.equal(result.snapped, '')
  assert.equal(result.x, 0)
})

test('鼠标自动抓住最近的节点', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 100, y: 0 },
  ]
  assert.equal(nearestNode({ x: 12, y: 4 }, nodes)?.id, 'a')
  assert.equal(nearestNode({ x: 90, y: 3 }, nodes)?.id, 'b')
  assert.equal(nearestNode({ x: 50, y: 0 }, nodes, 10), null)
})

test('按住不放不回弹：松手后才回到锚点', () => {
  let state = createPhysics(
    [{ id: 'a', x: 0, y: 0 }],
    [],
  )
  state = pinBody(state, 'a', 150, 90)
  // 按住期间反复步进 —— 位置必须纹丝不动
  for (let i = 0; i < 50; i++) state = stepPhysics(state, 1)
  let body = state.bodies[0]
  assert.equal(body.x, 150)
  assert.equal(body.y, 90)

  state = releaseBody(state, 'a')
  for (let i = 0; i < 300; i++) state = stepPhysics(state, 1)
  body = state.bodies[0]
  assert.ok(Math.abs(body.x) < 1, `松手后应该回弹：${body.x}`)
})
