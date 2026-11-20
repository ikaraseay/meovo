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
