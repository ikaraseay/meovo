/**
 * 内容查询 —— 把「文章集合」变成页面要的形态：按语言解析、按年/系列/标签分组、
 * 相邻文章、显示名。全部是围绕内容集合的查询，不碰 URL 构造（在 urls.ts）。
 */

import { hasTranslation, t, type Locale } from '../i18n/index.ts'
import {
  getPostLocale,
  getPostSlug,
  getTranslationKey,
  isPublished,
  resolveForLocale,
  type Post,
} from './post-identity.ts'
import { postPath } from './urls.ts'

/**
 * 后台导出的文章 —— 构建期由 backend/scripts/export-d1-posts.mjs 导进 frontend/content/generated/。
 *
 * 空集合时 Astro 每查一次就发一条 "collection is empty" 警告 —— 一页一条，
 * 几十页就是几十条。生成目录在一轮构建里不会变，查一次就够。
 */
let generatedPosts: Promise<Post[]> | null = null

/**
 * 当前可见的文章，按发布日期倒序。
 *
 * 生产构建：只保留已发布且已到发布时间的文章。
 * 开发环境：草稿与定时未到的文章也可见，方便预览。
 */
export async function getVisiblePosts(): Promise<Post[]> {
  // 动态 import：这个 module 里的纯函数要被 Node 测试直接 import，
  // 不能因为顶层的 `astro:content` 在 Node 里解析不了而连坐。
  const { getCollection } = await import('astro:content')
  const handwritten = await getCollection('blog')
  const generated = await (generatedPosts ??= getCollection('blogGenerated'))

  // 同 (locale, slug) 以手写版本为准 —— 后台导出的跳过，不覆盖作者手写的东西
  const handwrittenKeys = new Set(
    handwritten.map((post) => getPostLocale(post) + ':' + getPostSlug(post)),
  )
  const posts: Post[] = [
    ...handwritten,
    ...generated.filter(
      (post) => !handwrittenKeys.has(getPostLocale(post) + ':' + getPostSlug(post)),
    ),
  ]

  const visible = import.meta.env.DEV ? posts : posts.filter((post) => isPublished(post))
  return sortByDateDesc(visible)
}

export function sortByDateDesc(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
}

/** 按翻译键分组：key -> 各语言版本 */
export function groupByTranslation(posts: Post[]): Map<string, Post[]> {
  const groups = new Map<string, Post[]>()
  for (const post of posts) {
    const key = getTranslationKey(post)
    const list = groups.get(key)
    if (list) list.push(post)
    else groups.set(key, [post])
  }
  return groups
}

/** 全部标签，去重排序 */
export function getAllTags(posts: Post[]): string[] {
  return [...new Set(posts.flatMap((post) => post.data.tags))].sort((a, b) => a.localeCompare(b, 'zh'))
}

/** 全部分类，去重排序 */
export function getAllCategories(posts: Post[]): string[] {
  const categories = posts
    .map((post) => post.data.category)
    .filter((category): category is string => Boolean(category))
  return [...new Set(categories)].sort((a, b) => a.localeCompare(b, 'zh'))
}

/** 全部分系列的 id，去重排序 */
export function getAllSeries(posts: Post[]): string[] {
  return [
    ...new Set(posts.map((post) => post.data.series?.id).filter((id): id is string => Boolean(id))),
  ].sort((a, b) => a.localeCompare(b, 'zh'))
}

/**
 * 标签 / 分类的显示名。
 *
 * 标签与分类在 frontmatter 里是 **ASCII slug**（`design`、`css`）——
 * URL 里用的就是它，所以链接永远是干净的 ASCII。
 * 显示名走词典 `tag.<slug>` / `category.<slug>`；词典里没有就退回 slug 本身。
 */
export function getTagLabel(locale: Locale, tag: string): string {
  const key = `tag.${tag}`
  return hasTranslation(key) ? t(locale, key) : tag
}

export function getCategoryLabel(locale: Locale, category: string): string {
  const key = `category.${category}`
  return hasTranslation(key) ? t(locale, key) : category
}

/** markdown 目录里的一项 */
export interface Heading {
  depth: number
  slug: string
  text: string
}

/**
 * 目录 / 结构图只收 h2 / h3 —— 再深的层级在这两处都没有意义。
 * 页面与 OutlineMap 各写一份的话，改规则要改两处。
 */
export function tocHeadings(headings: Heading[]): Heading[] {
  return headings.filter((h) => h.depth === 2 || h.depth === 3)
}

export interface PostItem {
  post: Post
  /** 展示的是原文（当前语言还没有这个版本） */
  isFallback: boolean
  href: string
}

/**
 * 当前语言下的文章列表。
 *
 * 一个翻译组算一条：当前语言有版本就用它，没有就显示原文并标记 isFallback。
 * 这样「有中文没英文」的文章不会在英文站上凭空消失。
 */
export function resolveItems(posts: Post[], locale: Locale): PostItem[] {
  return [...groupByTranslation(posts).values()].map((variants) => {
    const post = resolveForLocale(variants, locale)!
    return {
      post,
      isFallback: getPostLocale(post) !== locale,
      href: postPath(locale, getPostSlug(post)),
    }
  })
}

/**
 * 同语言内的上一篇 / 下一篇。
 *
 * items 来自 resolveItems —— 一个翻译组算一篇，按发布日期倒序。
 * 「上一篇」是更早发的那篇，「下一篇」是更晚发的那篇。
 */
export function getAdjacentPosts(
  items: PostItem[],
  slug: string,
): { prev?: { title: string; href: string }; next?: { title: string; href: string } } {
  const index = items.findIndex((item) => getPostSlug(item.post) === slug)
  if (index < 0) return {}
  const pick = (item?: PostItem) =>
    item ? { title: item.post.data.title, href: item.href } : undefined
  return { prev: pick(items[index + 1]), next: pick(items[index - 1]) }
}

export interface SeriesEntry {
  /** 系列 id */
  id: string
  /** 系列标题 */
  title: string
  /** 系列里有几篇 */
  count: number
}

/**
 * 系列清单 —— 归档页的「系列」区块与系列页都用它。
 *
 * 标题写在 frontmatter 里，所以每个语言各写各的；
 * 当前语言没有该系列的任何一篇时，就用别的语言的标题顶上。
 */
export function getSeriesEntries(items: PostItem[], locale: Locale): SeriesEntry[] {
  const map = new Map<string, SeriesEntry>()
  for (const item of items) {
    const series = item.post.data.series
    if (!series) continue
    const entry = map.get(series.id)
    if (!entry) {
      map.set(series.id, { id: series.id, title: series.title, count: 1 })
      continue
    }
    entry.count += 1
    if (getPostLocale(item.post) === locale) entry.title = series.title
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'zh'))
}

/**
 * 系列内的排序：先按 `series.order`，没写 order 的排在后面；
 * order 相同（或都没写）时按发布时间倒序。
 */
export function sortSeriesItems(items: PostItem[]): PostItem[] {
  return [...items].sort((a, b) => {
    const oa = a.post.data.series?.order
    const ob = b.post.data.series?.order
    if (oa !== ob) {
      if (oa === undefined) return 1
      if (ob === undefined) return -1
      return oa - ob
    }
    return b.post.data.pubDate.getTime() - a.post.data.pubDate.getTime()
  })
}
