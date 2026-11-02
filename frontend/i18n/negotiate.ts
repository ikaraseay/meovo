/**
 * 语言协商 —— 浏览器要哪种语言，站点就给哪种。
 * ---------------------------------------------------------
 * 纯函数（Node 测试直接 import）。用在根路径的重定向上：
 * 没有存过语言偏好的访客，按 Accept-Language 落到 /zh/ 或 /en/。
 */

import { defaultLocale, type Locale } from './ui.ts'

interface AcceptEntry {
  tag: string
  quality: number
}

/** Accept-Language 头 → 按 q 值排好序的语言列表 */
export function parseAcceptLanguage(header: string | null | undefined): AcceptEntry[] {
  if (!header) return []
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((item) => item.trim()).find((item) => item.startsWith('q='))
      const quality = q ? Number.parseFloat(q.slice(2)) : 1
      return {
        tag: tag.trim().toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 0,
      }
    })
    .filter((entry) => entry.tag !== '' && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)
}

/** 站点只有中英两种：认 en 给 en，认 zh 给 zh，其余回默认语言 */
export function pickLocale(header: string | null | undefined): Locale {
  for (const entry of parseAcceptLanguage(header)) {
    if (entry.tag.startsWith('zh')) return 'zh'
    if (entry.tag.startsWith('en')) return 'en'
  }
  return defaultLocale
}
