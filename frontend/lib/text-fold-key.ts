/**
 * 折叠阅读的段落键 —— 构建期与运行时的唯一约定。
 * ---------------------------------------------------------
 * AI 摘要按「段落」存，运行时按「段落」取。两边拿到的段落文本不是同一份字符串：
 * markdown 里的直角引号渲染后变成弯引号，软换行变成空格 —— 直接比文本永远对不上。
 *
 * 所以键 = 段落的指纹：先抹掉标点、压掉空白（渲染器只改引号的形状，不改字母），
 * 再取这段纯文字的 64 位哈希。
 *
 * 用哈希而不是原文当键：数据文件里不用塞整段正文（键只有 16 个字符），
 * 撞上的概率约 2^-64 —— 真撞上就是那段没有摘要（回退规则折叠），不会张冠李戴。
 *
 * ⚠️ 改了这个算法，要同步把 backend/scripts/ai-summary.mjs 的 CACHE_VERSION +1：
 * 旧缓存里的旧键跟新键对不上，摘要会静默消失。
 */

/** 32 位 FNV-1a —— 两个不同种子凑成 64 位 */
function fnv1a(text: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * 段落文本 → 段落的键。
 * @param text 段落纯文本（构建期是剥完 markdown 的，运行时是 DOM 里的文本）
 * @returns 段落的键（16 个十六进制字符）
 */
export function foldKey(text: string): string {
  const plain = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const hex = (n: number): string => n.toString(16).padStart(8, '0')
  return hex(fnv1a(plain, 0x811c9dc5)) + hex(fnv1a(plain, 0x1b873593))
}
