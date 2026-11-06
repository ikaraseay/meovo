import type { APIRoute } from 'astro'
import { locales, defaultLocale, type Locale } from '../i18n'
import {
  getVisiblePosts,
  groupByTranslation,
  getPostLocale,
  getPostSlug,
  getAllTags,
  getAllCategories,
  getAllSeries,
  archivePath,
  tagPath,
  categoryPath,
  seriesPath,
  aboutPath,
  postPath,
} from '../lib/posts'

/**
 * sitemap.xml
 *
 * 自己生成而不是用 @astrojs/sitemap 的原因：
 *   1. **回退页不能进 sitemap** —— 「某语言没有这篇文章」时生成的页面是 noindex 的，
 *      而集成给的 `filter` 跑在 astro.config 里，拿不到内容集合，算不出哪些是回退页。
 *      这里用同一份 `getVisiblePosts()`，和页面本身同源，不会漏。
 *   2. 每条 URL 都要带各语言的 `xhtml:link` 互指。
 *
 * 路由清单与页面同源（都走 frontend/lib/posts.ts 的路径 helper），
 * 万一漏了某个路由，`pnpm check:seo` 会比对构建产物把它揪出来。
 */

/** XML 属性 / 文本转义 */
const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

interface Alt {
  hreflang: string
  href: string
}

interface Page {
  /** 这一条自己的地址 */
  loc: string
  /** 各语言的互指 */
  alternates: Alt[]
  /** 只有文章有 —— 静态页面不写 lastmod，免得每次构建都变 */
  lastmod?: string
}

export const GET: APIRoute = async ({ site, url }) => {
  /** site 没配时退回请求来源，域名只在 astro.config.mjs 里写一处 */
  const base = site ?? url
  const posts = await getVisiblePosts()
  const groups = groupByTranslation(posts)

  const pages: Page[] = []

  /**
   * 加一组互为翻译的页面。
   * paths 里没出现的语言**不生成页面** —— 这就是回退页不进 sitemap 的地方。
   */
  function addPage(paths: Partial<Record<Locale, string>>, lastmod?: string) {
    const alts: Alt[] = locales
      .filter((code) => paths[code])
      .map((code) => ({ hreflang: code, href: new URL(paths[code]!, base).href }))

    for (const alt of alts) {
      pages.push({
        loc: alt.href,
        alternates: alts,
        // x-default 指向默认语言；默认语言没有版本时退回任意一个（与 head 里的规则一致）
        lastmod,
      })
    }
  }

  /**
   * 每个语言都有的固定路由。
   * 标签与分类的**列表**在归档页上（/archive/#tags），没有独立的列表页 ——
   * 别把不存在的路径塞进 sitemap。
   */
  const fixedRoutes = [
    (locale: Locale) => `/${locale}/`,
    (locale: Locale) => archivePath(locale),
    (locale: Locale) => aboutPath(locale),
  ]

  for (const route of fixedRoutes) {
    addPage(Object.fromEntries(locales.map((code) => [code, route(code)])))
  }

  for (const tag of getAllTags(posts)) {
    addPage(Object.fromEntries(locales.map((code) => [code, tagPath(code, tag)])))
  }

  for (const category of getAllCategories(posts)) {
    addPage(Object.fromEntries(locales.map((code) => [code, categoryPath(code, category)])))
  }

  /** 系列页 —— 系列 id 跨语言共用，两种语言都有这一页 */
  for (const series of getAllSeries(posts)) {
    addPage(Object.fromEntries(locales.map((code) => [code, seriesPath(code, series)])))
  }

  for (const variants of groups.values()) {
    /** 只收真实存在的语言版本 —— 缺的那个语言是 noindex 的回退页 */
    const paths: Partial<Record<Locale, string>> = {}
    let lastmod: string | undefined
    for (const variant of variants) {
      const locale = getPostLocale(variant)
      paths[locale] = postPath(locale, getPostSlug(variant))
      const updated = (variant.data.updatedDate ?? variant.data.pubDate).toISOString()
      // 组内取**最新**的那个 —— 遍历顺序是集合顺序，跟新旧无关
      if (!lastmod || updated > lastmod) lastmod = updated
    }
    addPage(paths, lastmod)
  }

  const body = pages
    .map((page) => {
      const links = page.alternates
        .map(
          (alt) =>
            `<xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${escape(alt.href)}" />`,
        )
        .join('')
      const xDefault =
        page.alternates.find((alt) => alt.hreflang === defaultLocale) ?? page.alternates[0]
      const xDefaultLink = xDefault
        ? `<xhtml:link rel="alternate" hreflang="x-default" href="${escape(xDefault.href)}" />`
        : ''
      const lastmod = page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ''
      return `<url><loc>${escape(page.loc)}</loc>${lastmod}${links}${xDefaultLink}</url>`
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
