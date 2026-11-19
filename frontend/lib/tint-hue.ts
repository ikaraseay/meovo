/**
 * 部件 tint 的色相表 —— 全站一份。
 * ---------------------------------------------------------
 * 玻璃部件（GlassWidget）与友链头像（LinkAvatar）都按 id / 名字哈希出一个色相，
 * 同一 key 永远同一个色相。色相表以前两个组件各抄一份，
 * 加一个色相就会两边分叉 —— 放这里，一处改，两处跟着改。
 *
 * 只给色相，配方（饱和度 / 亮度 / 透明度）归样式层：
 * 浅色要看得见色差，深色要统一 —— 见 tokens.css 的 .ui-widget。
 */

/** 悦目的色相集合 —— 避开病态的黄绿，只取看着舒服的暖/冷色 */
export const TINT_HUES = [12, 24, 206, 262, 338, 158, 186, 322, 42, 288]

/** 字符串哈希 → 色相，同一 key 永远同一个色相 */
export function hashHue(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return TINT_HUES[h % TINT_HUES.length]
}
