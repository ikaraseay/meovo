import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildRelationGraph,
  driftOffset,
  driftState,
} from '../frontend/lib/relation-graph.ts'

test('关系图谱只为一级章节和外部关系生成节点与连线', () => {
  const graph = buildRelationGraph('文章标题', [
    { depth: 2, slug: 'alpha', text: '第一章' },
    { depth: 3, slug: 'alpha-one', text: '小节一' },
    { depth: 2, slug: 'beta', text: '第二章' },
    { depth: 4, slug: 'detail', text: '细节' },
  ], [{ kind: 'tag', label: '设计', href: '/zh/tags/design/' }])
  assert.equal(graph.nodes.length, 4)
  assert.equal(graph.edges.length, 3)
  assert.equal(graph.nodes.filter((node) => node.kind === 'root').length, 1)
  assert.equal(graph.nodes.filter((node) => node.kind === 'h2').length, 2)
  assert.deepEqual(graph.edges.map(({ source, target }) => [source, target]), [
    ['root', 'h2:alpha'], ['root', 'h2:beta'], ['root', 'tag:设计'],
  ])
})

test('关系图谱布局确定且节点留在视口内', () => {
  const headings = [
    { depth: 2, slug: 'a', text: 'A' },
    { depth: 3, slug: 'a1', text: 'A1' },
    { depth: 2, slug: 'b', text: 'B' },
  ]
  const first = buildRelationGraph('Title', headings)
  const second = buildRelationGraph('Title', headings)
  assert.deepEqual(first, second)
  for (const node of first.nodes) {
    assert.ok(node.x >= 0 && node.x <= first.width)
    assert.ok(node.y >= 0 && node.y <= first.height)
  }
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
