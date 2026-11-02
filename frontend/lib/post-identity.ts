/**
 * 文章身份 —— 它是哪个语言、哪个 slug、跟谁互为翻译、该给当前语言看哪个版本。
 * 这是内容层最底的一层 module，别的 module 都从这里拿 Post 类型与语言解析。
 */

import type { CollectionEntry } from 'astro:content'
import { defaultLocale, type Locale } from '../i18n/index.ts'

/**
 * 一篇文章 —— 手写的（blog）与后台导出的（blogGenerated）两个集合。
 * 两个集合的 frontmatter 一样，所以对上层是同一种东西。
 */
export type Post = CollectionEntry<'blog'> | CollectionEntry<'blogGenerated'>

/**
 * entry.id 形如 `zh/hello-world` —— 第一段是语言，其余是 slug。
 * 目录即语言，语言不写在 frontmatter 里，避免两处打架。
 */
export function getPostLocale(post: Post): Locale {
  return post.id.split('/')[0] as Locale
}

export function getPostSlug(post: Post): string {
  return post.id.split('/').slice(1).join('/')
}

/**
 * 翻译键：同一篇文章在不同语言下的 slug 相同即互为翻译。
 * （约定见 frontend/content.config.ts 的注释）
 */
export function getTranslationKey(post: Post): string {
  return getPostSlug(post)
}

/** 文章是否已经发布（不是草稿，且已到发布时间） */
export function isPublished(post: Post, now: Date = new Date()): boolean {
  if (post.data.draft) return false
  return post.data.pubDate <= now
}

/**
 * 某篇文章所属语言的版本。
 * 没有就用默认语言的版本顶上；连默认语言都没有（比如只有英文版）
 * 就用现有版本里任意一个顶上，页面上会标注「暂无该语言版本」。
 */
export function resolveForLocale(variants: Post[], locale: Locale): Post | undefined {
  return (
    variants.find((post) => getPostLocale(post) === locale) ??
    variants.find((post) => getPostLocale(post) === defaultLocale) ??
    variants[0]
  )
}
