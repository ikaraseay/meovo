/**
 * 让位几何 —— 纯函数，不碰 DOM。
 * ---------------------------------------------------------
 * 卡片压到正文上时，文字得绕开它。pretext 逐行排版，每一行自己
 * 决定能占多宽、往哪边挪（龙形 / 伞形 demo 那套）：
 *
 *   · 走廊（corridor）—— 一行文字能用的横向带。卡片压住哪边，
 *     那边的走廊就断了；断剩的几截（卡片在中间时左右各一截）
 *     都能放字 —— 文字从左截流到右截，像绕过一块石头。
 *   · 一截都放不下（卡片盖满整列）—— 这一行就不放字（跳过）：
 *     宁可空一行，也不把字挤成一条缝。
 *
 * 输入矩形，输出走廊 —— 排版与 DOM 落地在 prose-flow.ts。
 */

/** 矩形（文档坐标系，px） */
export interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

/** 压在正文上的卡片 */
export interface Obstacle {
  id: string
  rect: Rect
}

/** 一截走廊 —— 文字能占的一小段 */
export interface Segment {
  /** 可用宽度（px） */
  width: number
  /** 相对正文列左缘的偏移（px） */
  offset: number
}

/** 某一行文字的走廊 */
export interface Corridor {
  /** 这一行能用的走廊，从左到右 —— 卡片在中间时有两截 */
  segments: Segment[]
  /** 一截都放不下 —— 这一行不放字 */
  skip: boolean
}

/** 一截走廊的绝对下限 —— 再窄就没法读了 */
export const MIN_YIELD_MEASURE = 96
/** 也不能窄到只剩列宽的一成二 —— 太窄就不绕了 */
const MIN_YIELD_RATIO = 0.12
/** 卡片与文字之间留的缝 */
export const YIELD_MARGIN = 12

/** 走廊下限：窄列上更严（列宽的一成二） */
export function minMeasure(column: Rect): number {
  const width = column.right - column.left
  return Math.max(MIN_YIELD_MEASURE, width * MIN_YIELD_RATIO)
}

/**
 * 一行的走廊。
 *
 * 卡片压住的地方从列里挖掉，剩下的每一截都能放字 ——
 * 卡片在中间时左右各一截，文字从左截流到右截（包住卡片）。
 * 窄到读不了的那截丢掉；一截都不剩，这一行跳过。
 *
 * band 是这一行**字形**占的纵向区间（不是行盒）：
 * 卡片只压到行底缘时字形仍会探进卡片几像素，
 * 按行盒算就会让字压在卡片边上。
 */
export function corridorAt(
  column: Rect,
  cards: Rect[],
  band: { top: number; bottom: number },
  min: number,
): Corridor {
  // 这一行被卡片压住的横向区间（含留缝）
  const blocks: Array<[number, number]> = []
  for (const card of cards) {
    if (card.top >= band.bottom || band.top >= card.bottom) continue
    blocks.push([card.left - YIELD_MARGIN, card.right + YIELD_MARGIN])
  }
  if (blocks.length === 0) {
    return { segments: [{ width: column.right - column.left, offset: 0 }], skip: false }
  }

  blocks.sort((a, b) => a[0] - b[0])
  const segments: Segment[] = []
  let lo = column.left
  for (const [blockLeft, blockRight] of blocks) {
    if (blockRight <= lo) continue // 整块在左边 —— 不压这列
    if (blockLeft >= column.right) break // 整块在右边 —— 后面的也不用管
    if (blockLeft > lo) {
      segments.push({ width: blockLeft - lo, offset: lo - column.left })
    }
    lo = Math.max(lo, blockRight)
  }
  if (lo < column.right) {
    segments.push({ width: column.right - lo, offset: lo - column.left })
  }

  // 太窄的截丢掉 —— 放几个字进去反而更难看
  const usable = segments.filter((seg) => seg.width >= min)
  return { segments: usable, skip: usable.length === 0 }
}
