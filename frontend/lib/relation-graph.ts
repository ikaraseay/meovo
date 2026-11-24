import type { Heading } from './content-queries'

export interface RelationNode {
  id: string
  label: string
  kind: 'root' | 'h2' | 'category' | 'tag' | 'series' | 'post'
  x: number
  y: number
  slug?: string
  href?: string
}

export interface RelationEdge {
  source: string
  target: string
  curve: number
}

export interface RelationGraph {
  width: number
  height: number
  nodes: RelationNode[]
  edges: RelationEdge[]
}

export interface RelationLink {
  label: string
  href: string
  kind: 'category' | 'tag' | 'series' | 'post'
  slug?: string
}

function hash(value: string): number {
  let out = 2166136261
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i)
    out = Math.imul(out, 16777619)
  }
  return out >>> 0
}

export interface DriftState {
  phase: number
  speed: number
  amp: number
}

/** 节点飘动参数 —— 由 id 哈希决定，同一篇文章每次刷新都一样 */
export function driftState(id: string): DriftState {
  const seed = hash(id) % 1000
  return {
    phase: (seed / 1000) * Math.PI * 2,
    speed: 0.4 + (seed % 7) * 0.06,
    amp: 1.6 + (seed % 5) * 0.5,
  }
}

/** 某一时刻节点的飘动偏移 —— 呼吸式小幅摆动，不是漂移 */
export function driftOffset(state: DriftState, time: number): { x: number; y: number } {
  return {
    x: Math.sin(time * state.speed + state.phase) * state.amp,
    y: Math.cos(time * state.speed * 0.83 + state.phase) * state.amp * 0.8,
  }
}

/** 构建期确定性关系图谱；slug 哈希只负责稳定、有机的分布。 */
export function buildRelationGraph(
  title: string,
  headings: Heading[],
  links: RelationLink[] = [],
): RelationGraph {
  const width = 360
  const height = 300
  const cx = width / 2
  const cy = height / 2
  const nodes: RelationNode[] = [{ id: 'root', label: title, kind: 'root', x: cx, y: cy }]
  const edges: RelationEdge[] = []
  const h2 = headings.filter((heading) => heading.depth === 2)

  h2.forEach((heading, index) => {
    const angle = h2.length === 1
      ? -Math.PI / 2
      : -Math.PI / 2 + (Math.PI * 2 * index) / h2.length
    const jitter = ((hash(heading.slug) % 13) - 6) * 1.8
    const radius = h2.length <= 3 ? 102 : 118
    const x = Math.max(24, Math.min(width - 24, cx + Math.cos(angle) * radius + jitter))
    const y = Math.max(24, Math.min(height - 24, cy + Math.sin(angle) * radius))
    const h2Id = `h2:${heading.slug}`
    nodes.push({ id: h2Id, label: heading.text, kind: 'h2', x, y, slug: heading.slug })
    edges.push({ source: 'root', target: h2Id, curve: jitter / 8 })

  })

  links.forEach((link, index) => {
    const angle = links.length === 1
      ? -Math.PI / 2
      : -Math.PI / 2 + (Math.PI * 2 * index) / links.length
    const radius = 148
    const x = Math.max(24, Math.min(width - 24, cx + Math.cos(angle) * radius))
    const y = Math.max(24, Math.min(height - 24, cy + Math.sin(angle) * radius))
    const id = `${link.kind}:${link.slug ?? link.label}`
    // 外部节点只带 href —— slug 是章节锚点，别把 prev / next 变成 `#prev`
    nodes.push({ id, label: link.label, kind: link.kind, x, y, href: link.href })
    edges.push({ source: 'root', target: id, curve: 10 * (index % 2 ? 1 : -1) })
  })

  return { width, height, nodes, edges }
}
