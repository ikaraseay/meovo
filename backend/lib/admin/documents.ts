/**
 * 文档字段 —— 规范化与校验（纯函数）。
 * ---------------------------------------------------------
 * 站点的老约定：slug / 分类 / 标签都是 **ASCII slug**，URL 里用的就是它，
 * 显示名走词典。后台沿用同一套，别让后台写出一堆中文 URL。
 *
 * 错误用**代码**返回（title_required 这种），不直接返回文案 ——
 * 文案要过 i18n 词典，界面那边按代码查表。
 */

import { LICENSE_IDS } from '../../../frontend/lib/licenses.ts'
import { SLUG_PATTERN } from '../../../frontend/lib/slug.ts'
import { locales, type Locale } from '../../../frontend/i18n/index.ts'

export type DocumentErrorCode =
  | 'title_required'
  | 'slug_invalid'
  | 'locale_invalid'
  | 'license_invalid'
  | 'category_invalid'
  | 'tag_invalid'
  | 'date_invalid'
  | 'series_invalid'
  | 'series_order_invalid'

export interface DocumentInput {
  slug?: unknown
  locale?: unknown
  title?: unknown
  description?: unknown
  body?: unknown
  pubDate?: unknown
  updatedDate?: unknown
  category?: unknown
  tags?: unknown
  seriesId?: unknown
  seriesTitle?: unknown
  seriesOrder?: unknown
  license?: unknown
}

export interface NormalizedDocument {
  slug: string
  locale: Locale
  title: string
  description: string
  body: string
  pubDate: string | null
  updatedDate: string | null
  category: string | null
  tags: string[]
  seriesId: string | null
  seriesTitle: string | null
  seriesOrder: number | null
  license: string
}

/** 标题 → slug（只留 ASCII；中文标题得作者自己起英文 slug） */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** 标签：数组或逗号分隔的字符串 → 去空、去重、小写 */
export function parseTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[,，]/)
  const tags: string[] = []
  for (const item of raw) {
    const tag = item.trim().toLowerCase()
    if (!tag || tags.includes(tag)) continue
    tags.push(tag)
  }
  return tags
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asDate(value: unknown): string | null {
  if (value == null || value === '') return null
  const date = new Date(asText(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * 校验并规范化一份文档。
 * 有错就返回错误代码 —— 界面按代码查词典翻译。
 */
export function normalizeDocument(input: DocumentInput): {
  ok: boolean
  errors: DocumentErrorCode[]
  value?: NormalizedDocument
} {
  const errors: DocumentErrorCode[] = []

  const title = asText(input.title).trim()
  if (!title) errors.push('title_required')

  const slug = asText(input.slug).trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug)) errors.push('slug_invalid')

  const locale = asText(input.locale).trim()
  if (!locales.includes(locale as Locale)) errors.push('locale_invalid')

  const license = asText(input.license).trim() || LICENSE_IDS[0]
  if (!LICENSE_IDS.includes(license as (typeof LICENSE_IDS)[number])) {
    errors.push('license_invalid')
  }

  const category = asText(input.category).trim().toLowerCase()
  if (category && !SLUG_PATTERN.test(category)) errors.push('category_invalid')

  const tags = parseTags(input.tags)
  if (tags.some((tag) => !SLUG_PATTERN.test(tag))) errors.push('tag_invalid')

  const pubDate = asDate(input.pubDate)
  if (input.pubDate && !pubDate) errors.push('date_invalid')
  const updatedDate = asDate(input.updatedDate)
  if (input.updatedDate && !updatedDate) errors.push('date_invalid')

  const seriesId = asText(input.seriesId).trim().toLowerCase()
  const seriesTitle = asText(input.seriesTitle).trim()
  if ((seriesId && !seriesTitle) || (!seriesId && seriesTitle)) {
    errors.push('series_invalid')
  }
  if (seriesId && !SLUG_PATTERN.test(seriesId)) errors.push('series_invalid')

  let seriesOrder: number | null = null
  if (input.seriesOrder != null && input.seriesOrder !== '') {
    const order = Number(input.seriesOrder)
    if (!Number.isInteger(order) || order < 1) errors.push('series_order_invalid')
    else seriesOrder = order
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    errors,
    value: {
      slug,
      locale: locale as Locale,
      title,
      description: asText(input.description).trim(),
      body: asText(input.body),
      pubDate,
      updatedDate,
      category: category || null,
      tags,
      seriesId: seriesId || null,
      seriesTitle: seriesTitle || null,
      seriesOrder,
      license,
    },
  }
}
