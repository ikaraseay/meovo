/**
 * 文章目录 —— 让位高度与当前章节的判定。
 * ---------------------------------------------------------
 * 纯函数：DOM 的事留给 Article.astro，这里只算两个数 ——
 *   · 顶部的悬浮栏占了多少（章节跳转要落在它下面，别把标题压在栏底下）
 *   · 哪一节是「当前」的（目录高亮跟着正文走）
 */

/** 悬浮栏在视口里的位置 —— 量不到就传 null */
export interface BarBox {
  top: number
  bottom: number
}

/** 章节上方至少留多少 —— 悬浮栏不在顶部时，这点就够 */
export const MIN_INSET = 24

/**
 * 章节跳转的让位高度。
 *
 * 悬浮栏贴在顶部时，让到它下沿下面；它被拖到别处就不挡 —— 只留一点边距。
 * 这个值同时写进 --ui-content-offset（正文的 scroll-margin-top 用它），
 * 所以跳转落点与目录高亮永远是一条线。
 */
export function contentInset(bar: BarBox | null, viewportHeight: number): number {
  if (!bar) return MIN_INSET
  // 悬浮栏不在上半屏 —— 挡不到标题
  if (bar.top > viewportHeight / 2) return MIN_INSET
  return Math.max(MIN_INSET, Math.ceil(bar.bottom) + 16)
}

/** 一个标题：id + 它离视口顶部的距离 */
export interface HeadingBox {
  id: string
  top: number
}

/**
 * 让位线的容差（px）。
 *
 * 浏览器滚动落点是亚像素的 —— 跳转后标题落在 75.31 而不是 75，
 * 差这一点就「不算越过让位线」，目录高亮会停在上一节。
 */
export const LINE_TOLERANCE = 2

/**
 * 当前章节 —— 正文里最后一个「已经越过让位线」的标题。
 * 标题按文档顺序排 —— 越过就往下走，越不过就停。
 */
export function activeHeadingId(heads: HeadingBox[], threshold: number): string | undefined {
  let active: string | undefined
  for (const head of heads) {
    if (head.top > threshold + LINE_TOLERANCE) break
    active = head.id
  }
  return active
}
