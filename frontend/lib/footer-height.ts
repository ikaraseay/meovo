/**
 * 页脚卡片最小高度 —— 后台可调的那一个数值。
 * ---------------------------------------------------------
 * 它是**数值**，但走文案管线存（D1 settings 表里 zh/en 两份同值），
 * 这样改完敲构建钩子、下次构建生效，跟其他设置一条路。
 *
 * 0 = 不限（页脚多高卡片就多高，跟没设一样）。
 */

/** 设置键 —— 与 config/site.json 里的默认条目同名 */
export const FOOTER_HEIGHT_KEY = 'footer.minHeight'

/** 上限：比这更高的页脚没意义（视口也就这么高） */
export const MAX_FOOTER_HEIGHT = 2000

/** 把设置里的字符串读成像素数 —— 坏了的值一律当「不限」 */
export function parseFooterMinHeight(raw: string | undefined): number {
  const px = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(px) || px <= 0) return 0
  return Math.min(px, MAX_FOOTER_HEIGHT)
}
