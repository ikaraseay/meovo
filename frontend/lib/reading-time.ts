/**
 * 阅读时间 —— 纯函数，按内容语言走：中文按字数、英文按词数。
 */

import type { Locale } from '../i18n/index.ts'

/** CJK 汉字 */
const CJK_CHARS = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
/** 拉丁词 */
const LATIN_WORDS = /[A-Za-z][A-Za-z'-]*/g

/**
 * 正文粗略纯文本化 —— 只为算阅读时间，不需要精确。
 * 去掉围栏代码块、行内代码、图片、HTML/JSX 标签与 markdown 标记。
 */
function toPlainText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|=-]/g, ' ')
}

/**
 * 阅读时间（分钟）。
 *
 * 中文按字数（约 400 字/分钟），英文按词数（约 200 词/分钟）。
 * 中文正文里混排的英文单词也按词数算，不按字数算。
 */
export function readingTime(body: string, locale: Locale): number {
  const text = toPlainText(body)
  const cjk = (text.match(CJK_CHARS) ?? []).length
  const words = (text.replace(CJK_CHARS, ' ').match(LATIN_WORDS) ?? []).length
  const minutes = locale === 'zh' ? cjk / 400 + words / 200 : words / 200
  return Math.max(1, Math.round(minutes))
}
