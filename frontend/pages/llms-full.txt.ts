import type { APIRoute } from 'astro'
import { getVisiblePosts, groupByTranslation, getPostSlug, getPostLocale, postPath, getAllTags, getAllCategories, getAllSeries, tagPath, categoryPath, seriesPath } from '../lib/posts'
import { locales, defaultLocale } from '../i18n'

export const prerender = true

/**
 * llms-full.txt — Complete LLM-friendly site metadata
 *
 * Contains full site structure, article details, tags, categories, and series.
 * Labels are in English; content preserves original languages.
 */

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://example.com')
  const posts = await getVisiblePosts()
  const groups = groupByTranslation(posts)

  const lines: string[] = []

  lines.push('# Meovo - Complete Site Metadata')
  lines.push('')
  lines.push('## Overview')
  lines.push('')
  lines.push('Meovo is a bilingual (Chinese/English) personal blog built with a hybrid architecture: static generation + runtime Workers.')
  lines.push('')
  lines.push('### Tech Stack')
  lines.push('')
  lines.push('- **Framework**: Astro 7 (static output + @astrojs/cloudflare adapter)')
  lines.push('- **Runtime**: Cloudflare Workers (static assets and APIs on same domain)')
  lines.push('- **Database**: Cloudflare D1 (SQLite)')
  lines.push('- **Object Storage**: Cloudflare R2')
  lines.push('- **Styling**: Native CSS + --ui-* token contract (zero utility classes)')
  lines.push('- **Search**: Pure static search (inline index in archive page, browser-side matching + highlighting)')
  lines.push('- **Deployment**: Cloudflare Workers Builds (push to deploy)')
  lines.push('')
  lines.push('### Core Features')
  lines.push('')
  lines.push('- Fully static frontend: pages rendered at build time, no database queries at runtime')
  lines.push('- Content as data: CMS writes to D1, exports markdown at build time')
  lines.push('- Bilingual symmetry: /zh/ and /en/ routes, same slug = translations')
  lines.push('- Liquid Glass theme: draggable glass card desktop, real refraction (Chromium) or fallback blur')
  lines.push('- Accessibility: enhanced focus ring, persistent link underlines, larger tap targets')
  lines.push('')
  lines.push(`- **URL**: ${base.href}`)
  lines.push(`- **Languages**: ${locales.join(', ')}`)
  lines.push(`- **Default Language**: ${defaultLocale}`)
  lines.push('')

  lines.push('## Site Structure')
  lines.push('')
  lines.push('### Fixed Pages')
  lines.push('')
  for (const locale of locales) {
    const langName = locale === 'zh' ? 'Chinese' : 'English'
    lines.push(`#### ${langName}`)
    lines.push(`- Home: ${new URL(`/${locale}/`, base).href}`)
    lines.push(`- Archive: ${new URL(`/${locale}/archive/`, base).href}`)
    lines.push(`- About: ${new URL(`/${locale}/about/`, base).href}`)
    lines.push(`- Links: ${new URL(`/${locale}/links/`, base).href}`)
    lines.push('')
  }

  const tags = getAllTags(posts)
  if (tags.length > 0) {
    lines.push('### Tags')
    lines.push('')
    for (const tag of tags) {
      for (const locale of locales) {
        lines.push(`- ${tag}: ${new URL(tagPath(locale, tag), base).href}`)
      }
    }
    lines.push('')
  }

  const categories = getAllCategories(posts)
  if (categories.length > 0) {
    lines.push('### Categories')
    lines.push('')
    for (const category of categories) {
      for (const locale of locales) {
        lines.push(`- ${category}: ${new URL(categoryPath(locale, category), base).href}`)
      }
    }
    lines.push('')
  }

  const series = getAllSeries(posts)
  if (series.length > 0) {
    lines.push('### Series')
    lines.push('')
    for (const s of series) {
      for (const locale of locales) {
        lines.push(`- ${s}: ${new URL(seriesPath(locale, s), base).href}`)
      }
    }
    lines.push('')
  }

  lines.push('## Article Details')
  lines.push('')

  for (const [, variants] of groups) {
    const post = variants[0]
    const slug = getPostSlug(post)
    const locale = getPostLocale(post)
    const title = post.data.title
    const description = post.data.description ?? ''
    const pubDate = post.data.pubDate ? new Date(post.data.pubDate).toISOString() : ''
    const updatedDate = post.data.updatedDate ? new Date(post.data.updatedDate).toISOString() : ''
    const url = new URL(postPath(locale, slug), base).href
    const body = post.body ?? ''

    lines.push(`### ${title}`)
    lines.push('')
    lines.push(`- **URL**: ${url}`)
    lines.push(`- **Slug**: ${slug}`)
    lines.push(`- **Language**: ${locale}`)
    if (pubDate) lines.push(`- **Published**: ${pubDate}`)
    if (updatedDate) lines.push(`- **Updated**: ${updatedDate}`)
    if (description) lines.push(`- **Description**: ${description}`)
    if (post.data.tags?.length) lines.push(`- **Tags**: ${post.data.tags.join(', ')}`)
    if (post.data.category) lines.push(`- **Category**: ${post.data.category}`)
    if (post.data.series) lines.push(`- **Series**: ${post.data.series}`)
    if (post.data.draft) lines.push(`- **Draft**: yes`)

    if (variants.length > 1) {
      const translations = variants.slice(1).map(v => {
        const vLocale = getPostLocale(v)
        const vSlug = getPostSlug(v)
        return `${vLocale}: ${new URL(postPath(vLocale, vSlug), base).href}`
      })
      lines.push(`- **Translations**: ${translations.join(', ')}`)
    }

    lines.push('')

    if (body) {
      const preview = body.slice(0, 500).replace(/\n/g, ' ').trim()
      if (preview) {
        lines.push('**Content Preview**:')
        lines.push('')
        lines.push(preview + (body.length > 500 ? '...' : ''))
        lines.push('')
      }
    }

    lines.push('---')
    lines.push('')
  }

  lines.push('## Related Links')
  lines.push('')
  lines.push(`- [llms.txt](${new URL('/llms.txt', base).href}) - Brief site metadata`)
  lines.push(`- [sitemap.xml](${new URL('/sitemap.xml', base).href}) - XML sitemap`)
  lines.push(`- [RSS (Chinese)](${new URL('/zh/rss.xml', base).href})`)
  lines.push(`- [RSS (English)](${new URL('/en/rss.xml', base).href})`)
  lines.push(`- [robots.txt](${new URL('/robots.txt', base).href})`)
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
