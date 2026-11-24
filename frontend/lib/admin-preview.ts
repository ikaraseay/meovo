/**
 * 后台预览里的点击该做什么 —— 纯函数，界面与测试共用。
 *
 * 「预览」在后台是干活用的，所以点击有三种去处：
 *   · 按住 Shift  → 放行，让预览真的跟着链接跳转（顺着站点检查每一处改动）
 *   · 普通点击可改文案 → 跳到后台里对应的词条
 *   · 普通点击其它链接 → 拦下（预览是看效果的，不是逛站点的）
 *
 * 写成纯函数是因为这几条分支只靠手点验不出来，得让测试盯着。
 */

export type PreviewClickAction =
  | { kind: 'pass' }
  | { kind: 'block' }
  | { kind: 'jump'; key: string }

export function previewClickAction(input: {
  shiftKey: boolean
  /** 点在可改文案上时，那段的 data-copy 键名 */
  copyKey: string | null
  isAnchor: boolean
}): PreviewClickAction {
  // Shift 优先于一切 —— 想顺着站点翻页时，点哪都该照常跳
  if (input.shiftKey) return { kind: 'pass' }
  if (input.copyKey) return { kind: 'jump', key: input.copyKey }
  if (input.isAnchor) return { kind: 'block' }
  return { kind: 'pass' }
}

/* ---------------- 分栏与缩放：尺寸怎么算，界面与测试共用 ---------------- */

/** 分栏的边界 —— 正文再窄也留两成，预览再宽也不吃掉整行 */
export const SPLIT_MIN = 20
export const SPLIT_MAX = 80

/** 默认分栏 —— 预览略宽一点：预览是拿来读的，正文是拿来写的 */
export const SPLIT_DEFAULT = 45

/** 分栏比例（百分比）落在边界内 */
export function clampSplit(percent: number): number {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(percent)))
}

/**
 * 拖分栏条 → 正文占多少（百分比）。
 *
 * 分界点就是分栏条的中线 —— 所以直接按整行的宽度换算，
 * 不用再扣掉分栏条自己那一条。
 */
export function splitPercent(clientX: number, left: number, width: number): number {
  if (width <= 0) return SPLIT_DEFAULT
  return clampSplit(((clientX - left) / width) * 100)
}

/** 预览缩放 —— 只缩不放（放大只会发虚） */
export function previewScale(panelWidth: number, deviceWidth: number): number {
  if (panelWidth <= 0 || deviceWidth <= 0) return 1
  return Math.min(1, panelWidth / deviceWidth)
}

/** 缩放后横向居中的偏移 —— 剩下的空当分给两边 */
export function previewOffset(panelWidth: number, deviceWidth: number, scale: number): number {
  return Math.max(0, (panelWidth - deviceWidth * scale) / 2)
}
