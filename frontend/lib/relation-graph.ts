export interface RelationNode {
  id: string
  label: string
  kind: 'root' | 'tag' | 'series'
  x: number
  y: number
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
  kind: 'tag' | 'series'
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
  links: RelationLink[],
): RelationGraph {
  const width = 360
  const height = 300
  const cx = width / 2
  const cy = height / 2
  const nodes: RelationNode[] = [{ id: 'root', label: '', kind: 'root', x: cx, y: cy }]
  const edges: RelationEdge[] = []
  links.forEach((link, index) => {
    const angle = links.length === 1
      ? -Math.PI / 2
      : -Math.PI / 2 + (Math.PI * 2 * index) / links.length
    const radius = 148
    const x = Math.max(24, Math.min(width - 24, cx + Math.cos(angle) * radius))
    const y = Math.max(24, Math.min(height - 24, cy + Math.sin(angle) * radius))
    const id = `${link.kind}:${link.href}`
    nodes.push({ id, label: link.label, kind: link.kind, x, y, href: link.href })
    edges.push({ source: 'root', target: id, curve: 10 * (index % 2 ? 1 : -1) })
  })

  return { width, height, nodes, edges }
}
