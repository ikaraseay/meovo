/**
 * 站内 URL 构造 —— 一处拼路径，别在页面里手写 `/posts/${slug}/`。
 */

import type { Locale } from '../i18n/index.ts'

/** 文章页 URL */
export function postPath(locale: Locale, slug: string): string {
  return `/${locale}/posts/${slug}/`
}

/** 文章路径（不含语言前缀）—— getAbsoluteLocaleUrl 要的是「语言之后的路径」 */
export function postRoute(slug: string): string {
  return `posts/${slug}`
}

/** OG 图 —— 全站共用一张静态品牌图 */
export function ogImageUrl(base: URL): string {
  return new URL('/og-default.png', base).href
}

/** 归档页 URL */
export function archivePath(locale: Locale): string {
  return `/${locale}/archive/`
}

/** 单个标签页 URL —— tag 是 ASCII slug，直接拼 */
export function tagPath(locale: Locale, tag: string): string {
  return `/${locale}/tags/${tag}/`
}

/** 单个分类页 URL —— category 是 ASCII slug，直接拼 */
export function categoryPath(locale: Locale, category: string): string {
  return `/${locale}/categories/${category}/`
}

/** 单个系列页 URL —— series id 是 ASCII slug，直接拼 */
export function seriesPath(locale: Locale, id: string): string {
  return `/${locale}/series/${id}/`
}

/** 关于页 URL */
export function aboutPath(locale: Locale): string {
  return `/${locale}/about/`
}
