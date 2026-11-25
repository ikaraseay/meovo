import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildRelationGraph,
  driftOffset,
  driftState,
} from '../frontend/lib/relation-graph.ts'

test('图谱只标注标签和系列，重复显示名仍可指向不同链接', () => {
  const graph = buildRelationGraph([
    { kind: 'tag', label: '设计', href: '/zh/tags/design/' },
    { kind: 'series', label: '设计', href: '/zh/series/design/' },
  ])
  assert.deepEqual(graph.nodes.map(node => node.label), ['', '设计', '设计'])
  assert.deepEqual(graph.edges.map(edge => edge.target), graph.nodes.slice(1).map(node => node.id))
  assert.equal(new Set(graph.nodes.map(node => node.id)).size, 3)
})

test('飘动参数确定且偏移有界', () => {
  const state = driftState('h2:intro')
  assert.deepEqual(state, driftState('h2:intro'))
  let max = 0
  for (let i = 0; i < 200; i++) {
    const offset = driftOffset(state, i * 0.05)
    max = Math.max(max, Math.hypot(offset.x, offset.y))
  }
  // 呼吸式摆动 —— 幅度小，不会飘出画布
  assert.ok(max <= 6, `飘动幅度过大：${max}`)
  assert.ok(max > 0, '节点应该真的在动')
})
