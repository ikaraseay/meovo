import type { APIRoute } from 'astro'
import { getVisiblePosts, groupByTranslation, getPostSlug, getPostLocale, postPath } from '../lib/posts'
import { locales, defaultLocale } from '../i18n'

export const prerender = true

/**
 * llms.txt — LLM-friendly site metadata
 *
 * Follows https://llmstxt.org/ spec. Provides site structure and article
 * summaries for LLM consumption. Labels are in English; content preserves
 * original languages.
 */

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://example.com')
  const posts = await getVisiblePosts()
  const groups = groupByTranslation(posts)

  const lines: string[] = []

  lines.push('# Meovo')
  lines.push('')
  lines.push('> Personal blog built with Astro 7 + Cloudflare Workers. Bilingual (Chinese/English), self-hosted CMS.')
  lines.push('')
  lines.push('## Site Info')
  lines.push('')
  lines.push(`- **URL**: ${base.href}`)
  lines.push(`- **Languages**: ${locales.join(', ')}`)
  lines.push(`- **Default Language**: ${defaultLocale}`)
  lines.push(`- **Tech Stack**: Astro 7, Cloudflare Workers, D1, R2, TypeScript`)
  lines.push(`- **Theme**: Liquid Glass (draggable glass card desktop)`)
  lines.push('')
  lines.push('## Main Pages')
  lines.push('')
  lines.push(`- [Home (Chinese)](${new URL('/zh/', base).href})`)
  lines.push(`- [Home (English)](${new URL('/en/', base).href})`)
  lines.push(`- [Archive (Chinese)](${new URL('/zh/archive/', base).href})`)
  lines.push(`- [Archive (English)](${new URL('/en/archive/', base).href})`)
  lines.push(`- [About (Chinese)](${new URL('/zh/about/', base).href})`)
  lines.push(`- [About (English)](${new URL('/en/about/', base).href})`)
  lines.push('')
  lines.push('## Articles')
  lines.push('')

  for (const variants of groups) {
    const post = variants[1][0]
    const slug = getPostSlug(post)
    const locale = getPostLocale(post)
    const title = post.data.title
    const description = post.data.description ?? ''
    const pubDate = post.data.pubDate ? new Date(post.data.pubDate).toISOString().split('T')[0] : ''
    const url = new URL(postPath(locale, slug), base).href

    lines.push(`- [${title}](${url})`)
    if (pubDate) lines.push(`  - Published: ${pubDate}`)
    if (description) lines.push(`  - Description: ${description}`)
    if (post.data.tags?.length) lines.push(`  - Tags: ${post.data.tags.join(', ')}`)
    if (post.data.category) lines.push(`  - Category: ${post.data.category}`)
  }

  lines.push('')
  lines.push('## More Info')
  lines.push('')
  lines.push(`- [llms-full.txt](${new URL('/llms-full.txt', base).href}) - Full site metadata`)
  lines.push(`- [sitemap.xml](${new URL('/sitemap.xml', base).href}) - XML sitemap`)
  lines.push(`- [RSS (Chinese)](${new URL('/zh/rss.xml', base).href})`)
  lines.push(`- [RSS (English)](${new URL('/en/rss.xml', base).href})`)
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
