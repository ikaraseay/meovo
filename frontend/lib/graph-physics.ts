/**
 * 关系图谱的受力模拟 —— 节点之间的弹簧、阻尼与归位。
 *
 * 纯函数：stepPhysics 不改入参，返回新状态，方便测试。
 * 坐标是图谱自己的坐标系（SVG viewBox 单位），不是屏幕像素。
 */

export interface PhysicsBody {
  id: string
  /** 当前位置 */
  x: number
  y: number
  vx: number
  vy: number
  /** 布局算出的锚点 —— 松手后节点往这儿回 */
  bx: number
  by: number
  /** 被抓住的节点：位置由指针接管，不参与回弹 */
  pinned?: boolean
}

export interface PhysicsSpring {
  source: string
  target: string
  /** 静止长度 —— 两端自然距离 */
  rest: number
  strength: number
}

export interface PhysicsState {
  bodies: PhysicsBody[]
  springs: PhysicsSpring[]
}

export interface MagnetResult {
  x: number
  y: number
  /** 被吸附到的节点 id —— 没吸到就是空串 */
  snapped: string
}

/**
 * 找出离指针最近的节点 —— 鼠标自动“抓住”它，不用精确点到圆点。
 *
 * @param point 指针在图谱坐标系里的位置
 * @param nodes 候选节点
 * @param maxDistance 超过这个距离就当没抓住（避免远处误抓）
 */
export function nearestNode<T extends { id: string; x: number; y: number }>(
  point: { x: number; y: number },
  nodes: T[],
  maxDistance = Infinity,
): T | null {
  let best: T | null = null
  let bestDistance = Infinity
  for (const node of nodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y)
    if (distance > maxDistance) continue
    if (distance < bestDistance) {
      best = node
      bestDistance = distance
    }
  }
  return best
}

/**
 * 磁性吸附：拖动中的节点靠近别的节点时被拉过去。
 *
 * 用「按距离衰减的吸引力」而不是硬吸附 —— 硬切会有跳变，
 * 衰减式靠近手感更顺（Obsidian 拖节点就是这个味道）。
 *
 * @param position  当前拖到的位置
 * @param anchors   别的节点的位置
 * @param radius    吸附作用半径
 */
export function magnetSnap(
  position: { x: number; y: number },
  anchors: Array<{ id: string; x: number; y: number }>,
  radius = 46,
): MagnetResult {
  let nearest: { id: string; x: number; y: number; distance: number } | null = null
  for (const anchor of anchors) {
    const distance = Math.hypot(anchor.x - position.x, anchor.y - position.y)
    if (distance > radius) continue
    if (!nearest || distance < nearest.distance) {
      nearest = { id: anchor.id, x: anchor.x, y: anchor.y, distance }
    }
  }
  if (!nearest) return { ...position, snapped: '' }
  // 越近吸得越紧 —— 中心附近几乎完全吸住，边缘只是轻轻靠过去
  const pull = Math.min(1, (radius - nearest.distance) / radius) * 0.5
  return {
    x: position.x + (nearest.x - position.x) * pull,
    y: position.y + (nearest.y - position.y) * pull,
    snapped: nearest.id,
  }
}

export interface PhysicsOptions {
  /** 阻尼：每帧速度衰减，越大越快停下 */
  damping?: number
  /** 弹簧刚度 */
  stiffness?: number
  /** 归位刚度 —— 节点被拖走后慢慢回到锚点 */
  anchor?: number
  /** 单帧最大位移 */
  maxStep?: number
}

const DEFAULTS = {
  damping: 0.86,
  stiffness: 0.09,
  anchor: 0.012,
  maxStep: 24,
}

export function createPhysics(
  bodies: Array<{ id: string; x: number; y: number }>,
  springs: Array<{ source: string; target: string; rest?: number; strength?: number }>,
  options: PhysicsOptions = {},
): PhysicsState {
  const opts = { ...DEFAULTS, ...options }
  return {
    bodies: bodies.map((body) => ({
      id: body.id,
      x: body.x,
      y: body.y,
      vx: 0,
      vy: 0,
      bx: body.x,
      by: body.y,
    })),
    springs: springs.map((spring) => {
      const source = bodies.find((body) => body.id === spring.source)
      const target = bodies.find((body) => body.id === spring.target)
      const rest =
        spring.rest ??
        (source && target ? Math.hypot(target.x - source.x, target.y - source.y) : 0)
      return {
        source: spring.source,
        target: spring.target,
        rest,
        strength: spring.strength ?? opts.stiffness,
      }
    }),
  }
}

/**
 * 推进一步。
 *
 * 力的来源：连边弹簧（拉向彼此）+ 锚点弹簧（拉回布局位置）。
 * 被抓住的节点由调用方直接写入位置与速度（vx = vy = 0），
 * 弹簧自然会把邻居拽过来 —— 这就是拖拽时的“受力”效果。
 */
export function stepPhysics(state: PhysicsState, dt = 1, options: PhysicsOptions = {}): PhysicsState {
  const opts = { ...DEFAULTS, ...options }
  const byId = new Map(state.bodies.map((body) => [body.id, body]))
  const forces = new Map<string, { fx: number; fy: number }>()
  state.bodies.forEach((body) => forces.set(body.id, { fx: 0, fy: 0 }))

  for (const spring of state.springs) {
    const source = byId.get(spring.source)
    const target = byId.get(spring.target)
    if (!source || !target) continue
    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.hypot(dx, dy) || 0.0001
    // 拉伸时往回拉，压缩时往外推 —— 弹簧是双向的
    const pull = (distance - spring.rest) * spring.strength
    const ux = dx / distance
    const uy = dy / distance
    const sourceForce = forces.get(spring.source)!
    const targetForce = forces.get(spring.target)!
    sourceForce.fx += ux * pull
    sourceForce.fy += uy * pull
    targetForce.fx -= ux * pull
    targetForce.fy -= uy * pull
  }

  const bodies = state.bodies.map((body) => {
    // 被抓住的节点：位置归指针管 —— 不积分、不回弹
    if (body.pinned) return { ...body, vx: 0, vy: 0 }
    const force = forces.get(body.id)!
    // 锚点回弹：离锚点越远，拽回来的力越大
    const ax = (body.bx - body.x) * opts.anchor
    const ay = (body.by - body.y) * opts.anchor
    let vx = (body.vx + (force.fx + ax) * dt) * opts.damping
    let vy = (body.vy + (force.fy + ay) * dt) * opts.damping
    const speed = Math.hypot(vx, vy)
    if (speed > opts.maxStep) {
      vx = (vx / speed) * opts.maxStep
      vy = (vy / speed) * opts.maxStep
    }
    return {
      ...body,
      x: body.x + vx * dt,
      y: body.y + vy * dt,
      vx,
      vy,
    }
  })

  return { bodies, springs: state.springs }
}

/** 把某个节点钉在指定位置（拖拽中） */
export function pinBody(state: PhysicsState, id: string, x: number, y: number): PhysicsState {
  return {
    ...state,
    bodies: state.bodies.map((body) =>
      body.id === id ? { ...body, x, y, vx: 0, vy: 0, pinned: true } : body,
    ),
  }
}

/** 松手：交还给物理，开始回弹 */
export function releaseBody(state: PhysicsState, id: string): PhysicsState {
  return {
    ...state,
    bodies: state.bodies.map((body) =>
      body.id === id ? { ...body, pinned: false } : body,
    ),
  }
}
