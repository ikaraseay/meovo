import rss from '@astrojs/rss'
import type { APIRoute } from 'astro'
import { t, locales, type Locale } from '../../i18n'
import { getVisiblePosts, resolveItems, getTagLabel } from '../../lib/posts'

/** 每个语言一份 feed：/zh/rss.xml 与 /en/rss.xml */
export function getStaticPaths() {
  return locales.map((locale) => ({ params: { lang: locale } }))
}

export const GET: APIRoute = async ({ params, site, url }) => {
  const locale = (params.lang ?? 'zh') as Locale
  /** site 没配时退回请求来源，域名只在 astro.config.mjs 里写一处 */
  const base = site ?? url
  const posts = await getVisiblePosts()
  /** 一个翻译组算一篇 —— 没翻译的条目列原文，链接仍在本语言下 */
  const items = resolveItems(posts, locale)

  /** 本语言的首页 —— channel 的 link 指向它 */
  const channelUrl = new URL(`/${locale}/`, base)
  const feedUrl = new URL(`/${locale}/rss.xml`, base)

  return rss({
    title: t(locale, 'site.name'),
    description: t(locale, 'site.tagline'),
    // site 决定 channel 的 link；条目里传的是以 / 开头的绝对路径，
    // 解析时会按 origin 走，不会拼到 /zh/ 后面
    site: channelUrl,
    trailingSlash: true,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<atom:link href="${feedUrl.href}" rel="self" type="application/rss+xml" />`,
    items: items.map((item) => ({
      title: item.post.data.title,
      description: item.post.data.description,
      pubDate: item.post.data.pubDate,
      link: item.href,
      categories: item.post.data.tags.map((tag) => getTagLabel(locale, tag)),
    })),
  })
}
