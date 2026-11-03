/**
 * 桌面布局数学 —— 纯函数，不碰 DOM。
 * ---------------------------------------------------------
 * 输入「每张卡片的尺寸 + 桌面/视口尺寸」，输出「每个 id 摆在哪」。
 * 之前这套逻辑埋在 draggable.ts 的闭包里（量 offsetWidth、写 style.left），
 * 引擎一行都测不了；现在把「量」和「算」分开：draggable 只负责量 + 贴样式。
 *
 * 三种布局：
 *   · 散开：宽松瀑布流，data-widget-full 独占一行，顶部留 topOffset。
 *   · 内容锚定：正文居中，卡片按 zone（top / side / tail）排在正文四周。
 *   · 百分比：存档坐标是百分比，这里只提供 fromPct / toPct 两个换算。
 */

import { clamp, type Point, type Size, type Viewport } from './geometry.ts'

export const DESK_PAD = 12
export const DESK_GAP_X = 32
export const DESK_GAP_Y = 44
/** 卡片与屏幕边缘留的余量 */
const DESK_EDGE = 16
/** 正文列最窄多少 —— 再窄就没法读了 */
export const MIN_CONTENT_WIDTH = 480

/** 每列至少多宽才多开一列 */
const COL_MIN_WIDTH = 380
/** 列与列之间错开一点，别排成死板网格 */
const COL_STAGGER = 24
/** 散开布局的参考高度至少留出一屏（减去顶部） */
const MIN_VIEWPORT_HEIGHT = 120

export interface DeskCard {
  id: string
  width: number
  height: number
  /** data-widget-full：散开模式下独占一行 */
  full?: boolean
  /** data-zone：内容锚定模式的落位 */
  zone?: 'top' | 'side' | 'tail'
  /** 固定卡片：内容锚定模式不参与布局；散开模式保留槽位 —— 默认落位是基线 */
  pinned?: boolean
}

export interface Position {
  x: number
  y: number
  width: number
  /** 散开模式给的一点倾斜；内容锚定不给 */
  tilt?: number
}

export interface ScatterResult {
  positions: Map<string, Position>
  /** min-height / 百分比 yPct 的基准 */
  refHeight: number
}

/**
 * 散开：宽松瀑布流。
 *
 * 位置是**默认落位** —— 固定一张卡、拖走一张卡都不挪动别人：
 * 它们的落位照样按全量卡片排，散乱效果始终是散乱效果。
 */
export function scatterLayout(
  cards: DeskCard[],
  opts: { deskWidth: number; viewportHeight: number; topOffset: number },
): ScatterResult {
  const { deskWidth, viewportHeight, topOffset } = opts
  const list = cards
  const cols = clamp(Math.round((deskWidth + DESK_GAP_X) / COL_MIN_WIDTH), 1, 3)
  const colW = (deskWidth - DESK_GAP_X * (cols - 1)) / cols
  const colH = new Array<number>(cols).fill(topOffset)
  for (let i = 1; i < cols; i++) colH[i] = topOffset + COL_STAGGER

  const positions = new Map<string, Position>()
  let scatterH = topOffset

  list.forEach((card, index) => {
    if (card.full) {
      const y = Math.max(...colH)
      const width = Math.min(card.width, deskWidth - DESK_PAD * 2)
      positions.set(card.id, { x: DESK_PAD, y, width })
      colH.fill(y + card.height + DESK_GAP_Y)
      scatterH = Math.max(scatterH, y + card.height)
      return
    }
    let c = 0
    for (let i = 1; i < cols; i++) if (colH[i] < colH[c]) c = i
    const x = Math.max(DESK_PAD, c * (colW + DESK_GAP_X) + (colW - card.width) / 2)
    const y = colH[c]
    positions.set(card.id, {
      x,
      y,
      width: card.width,
      tilt: (index % 2 === 0 ? 1 : -1) * (0.6 + (index % 3) * 0.35),
    })
    colH[c] = y + card.height + DESK_GAP_Y
    scatterH = Math.max(scatterH, y + card.height)
  })

  return {
    positions,
    refHeight: Math.max(scatterH, viewportHeight - MIN_VIEWPORT_HEIGHT),
  }
}

export interface ContentAnchoredResult {
  positions: Map<string, Position>
  /** 正文顶部要留的 margin-top（给顶部卡片让位） */
  contentMarginTop: number
  /** 桌面 min-height */
  minHeight: number
}

/** 内容锚定：正文居中，卡片按 zone 排在四周 */
export function contentAnchoredLayout(
  cards: DeskCard[],
  opts: {
    deskWidth: number
    topOffset: number
    /** 正文宽度（居中用） */
    contentWidth: number
    /** 正文内容高度（不含 margin） */
    contentHeight: number
  },
): ContentAnchoredResult {
  const { deskWidth, topOffset, contentWidth, contentHeight } = opts
  const unpinned = cards.filter((c) => !c.pinned)
  const top = unpinned.filter((c) => (c.zone ?? 'top') === 'top')
  const sideAll = unpinned.filter((c) => c.zone === 'side')
  const tailAll = unpinned.filter((c) => c.zone === 'tail')

  // 顶部卡片从上往下堆，堆完的高度就是正文要留的顶部空间
  let topH = topOffset
  for (const c of top) topH += c.height + DESK_GAP_Y
  const contentMarginTop = topH + DESK_GAP_Y

  const contentLeft = Math.max(0, (deskWidth - contentWidth) / 2)
  const contentRight = contentLeft + contentWidth
  const contentTop = contentMarginTop
  const contentBottom = contentTop + contentHeight

  const positions = new Map<string, Position>()

  // 侧栏卡片放不下（窄桌面）就掉到正文下面 —— 压在正文上比排到下面更糟
  const fitsSide = (c: DeskCard) =>
    contentRight + DESK_GAP_X + c.width <= deskWidth - DESK_EDGE
  const side = sideAll.filter(fitsSide)
  const tail = [...tailAll, ...sideAll.filter((c) => !fitsSide(c))]

  let topY = topOffset
  for (const c of top) {
    // 正文列里的卡片宽度 = 正文列宽度 —— 右缘才跟正文对齐
    positions.set(c.id, { x: contentLeft, y: topY, width: contentWidth })
    topY += c.height + DESK_GAP_Y
  }

  let sideY = contentTop
  for (const c of side) {
    positions.set(c.id, { x: contentRight + DESK_GAP_X, y: sideY, width: c.width })
    sideY += c.height + DESK_GAP_Y
  }

  let tailY = contentBottom + DESK_GAP_Y
  for (const c of tail) {
    positions.set(c.id, { x: contentLeft, y: tailY, width: contentWidth })
    tailY += c.height + DESK_GAP_Y
  }

  return {
    positions,
    contentMarginTop,
    minHeight: Math.max(topY, sideY, tailY, contentBottom + DESK_GAP_Y) + DESK_PAD,
  }
}

/**
 * 正文列该多宽 —— 给右边的侧栏让位。
 *
 * 列是居中的，所以左右各要一份侧栏的位；实在不够就保底宽度，
 * 侧栏改排到正文下面（压在正文上更糟）。
 *
 * @param railWidth 侧栏卡片里最宽的那张（不含间距）
 * @param maxWidth  CSS 给的宽度上限（正文列本来就多宽）
 */
export function fittedContentWidth(
  deskWidth: number,
  railWidth: number,
  maxWidth: number,
): number {
  if (railWidth <= 0) return maxWidth
  const room = deskWidth - 2 * (railWidth + DESK_GAP_X + DESK_EDGE)
  return Math.max(MIN_CONTENT_WIDTH, Math.min(maxWidth, room))
}

/**
 * 卡片在桌面里的可见范围 —— 未固定卡片不许滑出桌面上下左右。
 * 以前这四个公式散在 draggable.ts 里各写各的，现在只有这一处。
 */
export function clampToDesk(pos: Point, size: Size, bounds: Viewport): Point {
  return {
    x: clamp(pos.x, 0, Math.max(0, bounds.width - size.width)),
    y: clamp(pos.y, 0, Math.max(0, bounds.height - size.height)),
  }
}

/**
 * 视口范围 —— 卡片边缘与屏幕边缘至少留 1vw / 1vh，
 * 拖拽中、固定卡片都不许滑出屏幕。
 * 卡片比视口还大时限不成立（区间反转），落在下界，右 / 下溢出不可避免。
 */
export function clampToViewport(pos: Point, size: Size, vp: Viewport): Point {
  const mx = vp.width * 0.01
  const my = vp.height * 0.01
  return {
    x: clamp(pos.x, mx, vp.width - mx - size.width),
    y: clamp(pos.y, my, vp.height - my - size.height),
  }
}

/** 百分比 → 像素（存档坐标还原） */
export function fromPct(pct: number, ref: number): number {
  return (pct / 100) * ref
}

/** 存档坐标（百分比）→ 像素，并夹回可见范围 —— 用户拖过的位置就是这么还原的 */
export function restoreFromPct(
  pct: { xPct: number; yPct: number },
  size: Size,
  ref: Viewport,
): Point {
  return clampToDesk(
    { x: fromPct(pct.xPct, ref.width), y: fromPct(pct.yPct, ref.height) },
    size,
    ref,
  )
}

/** 像素 → 百分比（存档坐标落库） */
export function toPct(px: number, ref: number): number {
  return ref === 0 ? 0 : (px / ref) * 100
}
