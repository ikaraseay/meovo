/**
 * 悬浮栏四个面的几何 —— 纯函数，不碰 DOM。
 * ---------------------------------------------------------
 * 调用方量好元素的尺寸/位置，这里只算「夹回视口后应该在哪」。
 * 之前这套夹取散在 FloatingBar.astro 的 placeMenu / placeFab / placePopup + avoidNavBar
 * 里，各写各的公式；现在一处算、一处测。
 */

import { clamp, type Point, type Rect, type Size, type Viewport } from './geometry.ts'

/** 把一个左上角坐标夹进视口（四周留 margin） */
export function clampPoint(point: Point, size: Size, vp: Viewport, margin: number): Point {
  return {
    x: clamp(point.x, margin, Math.max(margin, vp.width - size.width - margin)),
    y: clamp(point.y, margin, Math.max(margin, vp.height - size.height - margin)),
  }
}

/** 菜单默认停在视口顶部正中 —— 用实测宽度算，菜单长短变了也不会跑偏 */
export function defaultMenuX(menuWidth: number, vp: Viewport, margin: number): number {
  return Math.max(margin, (vp.width - menuWidth) / 2)
}

/**
 * FAB 是「距右 / 距下」坐标，夹取时两边边距不对称：
 * 底部至少要给抽屉留出 minBottom，顶部/左右只留 margin。
 */
export function clampFab(
  pos: { right: number; bottom: number },
  size: Size,
  vp: Viewport,
  opts: { margin: number; minBottom: number },
): { right: number; bottom: number } {
  const { margin, minBottom } = opts
  return {
    right: clamp(pos.right, margin, Math.max(margin, vp.width - size.width - margin)),
    bottom: clamp(pos.bottom, minBottom, Math.max(minBottom, vp.height - size.height - minBottom)),
  }
}

/**
 * 自动落点时避开栏体 —— 两块玻璃叠在一起会糊成一片。
 * 重叠就挪到栏体下方；下面放不下就顶到栏体上方。
 */
export function avoidBar(
  popup: Point,
  popupSize: Size,
  bar: Rect,
  vp: Viewport,
  opts: { margin: number; gap: number },
): Point {
  const { margin, gap } = opts
  const overlap =
    popup.x < bar.x + bar.width &&
    popup.x + popupSize.width > bar.x &&
    popup.y < bar.y + bar.height &&
    popup.y + popupSize.height > bar.y
  if (!overlap) return popup

  const below = bar.y + bar.height + gap
  const y =
    below + popupSize.height <= vp.height - margin
      ? below
      : Math.max(margin, bar.y - popupSize.height - gap)
  return { x: popup.x, y }
}
