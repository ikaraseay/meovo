/**
 * 文档字段 —— 规范化与校验（纯函数）。
 * ---------------------------------------------------------
 * 链接 slug、分类与系列 id 使用 ASCII slug；标签可用任意语言的字母与数字。
 *
 * 错误用**代码**返回（title_required 这种），不直接返回文案 ——
 * 文案要过 i18n 词典，界面那边按代码查表。
 */

import { LICENSE_IDS } from '../../../frontend/lib/licenses.ts'
import { SLUG_PATTERN } from '../../../frontend/lib/slug.ts'
import { TAG_PATTERN } from '../../../frontend/lib/tag.ts'
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
  /** 客户端按标题猜的 slug —— 服务端只在没给 slug 时用它 */
  slugHint?: unknown
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

/**
 * 从一组标题派生 slug —— 第一个能变成 ASCII slug 的标题说了算。
 *
 * 传多个标题是有原因的：中文标题里没有 ASCII，英文标题才有。
 * 一个都没有 → 兜底成 post-<日期>-<短码>，省得作者自己想一个。
 */
export function deriveSlug(titles: string[], seed?: string): string {
  for (const title of titles) {
    const slug = slugify(title)
    if (SLUG_PATTERN.test(slug)) return slug
  }
  return 'post-' + todayDate().replace(/-/g, '') + '-' + (seed ?? randomSeed())
}

/** 随机短码 —— 同一秒建两篇也不会撞 */
function randomSeed(): string {
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 找一个没人用的 slug —— 撞了就加数字后缀。
 * taken 是**全站**用过的 slug：不同语言撞上同一个 slug 会被当成互为翻译，
 * 那比撞车更麻烦。
 */
export function uniqueSlug(base: string, taken: string[]): string {
  const used = new Set(taken)
  let candidate = base
  for (let n = 2; used.has(candidate); n++) candidate = base + '-' + n
  return candidate
}

/**
 * 系列标题 → 系列 id —— 作者只填标题，不填 id。
 *
 * 中文标题没有 ASCII 可取，用标题的稳定短码兜底：
 * 同一个标题永远同一个 id，系列页的地址就不会因为作者重填而漂。
 */
export function deriveSeriesId(title: string): string {
  const slug = slugify(title)
  // 只有**纯 ASCII** 的标题才用 slug：中文标题 slugify 后会剩零碎英文，
  // 「Docker 入门」与「Docker 进阶」都会变成 docker —— 两个系列撞成一个。
  if (slug && SLUG_PATTERN.test(slug) && !/[^\x20-\x7e]/.test(title)) return slug
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  return 'series-' + hash.toString(36)
}

/** 今天 —— 本地日期（作者看到的就是这个） */
export function todayDate(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/** 编辑器这一版的字段 —— 判断「有没有漏填必填项」用 */
export interface EditorFields {
  title: string
  description: string
  body: string
}

/**
 * 这一版能不能存 —— 有内容却没标题就是漏填。
 * 整版都空不算漏填：另一种语言还没写，很正常。
 */
export function checkRequired(fields: EditorFields): DocumentErrorCode | null {
  if (fields.title.trim()) return null
  return fields.description.trim() || fields.body.trim() ? 'title_required' : null
}

/** 像样的 slug —— ASCII、小写字母、数字与连字符 */
export function isSlug(text: string): boolean {
  return SLUG_PATTERN.test(text.trim().toLowerCase())
}

/** 标签：数组或逗号分隔的字符串 → 去空、去重、小写 */
export function parseTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[,，]/)
  const tags: string[] = []
  for (const item of raw) {
    // 空格折成连字符，便于生成稳定的标签路径。
    const tag = item.trim().toLowerCase().replace(/\s+/g, '-')
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

  // slug 可以不给 —— 服务端按标题派生（见 deriveSlug）；给了就得是像样的
  const slug = asText(input.slug).trim().toLowerCase()
  if (slug && !SLUG_PATTERN.test(slug)) errors.push('slug_invalid')

  const locale = asText(input.locale).trim()
  if (!locales.includes(locale as Locale)) errors.push('locale_invalid')

  const license = asText(input.license).trim() || LICENSE_IDS[0]
  if (!LICENSE_IDS.includes(license as (typeof LICENSE_IDS)[number])) {
    errors.push('license_invalid')
  }

  const category = asText(input.category).trim().toLowerCase()
  if (category && !SLUG_PATTERN.test(category)) errors.push('category_invalid')

  const tags = parseTags(input.tags)
  if (tags.some((tag) => !TAG_PATTERN.test(tag))) errors.push('tag_invalid')

  const pubDate = asDate(input.pubDate)
  if (input.pubDate && !pubDate) errors.push('date_invalid')
  const updatedDate = asDate(input.updatedDate)
  if (input.updatedDate && !updatedDate) errors.push('date_invalid')

  // 系列 id 不手填 —— 给了标题就派生（同 slug 的道理：作者不该去想 ASCII 名字）
  const seriesTitle = asText(input.seriesTitle).trim()
  const seriesId =
    asText(input.seriesId).trim().toLowerCase() ||
    (seriesTitle ? deriveSeriesId(seriesTitle) : '')
  // 只有 id 没有标题 = 一半的输入，报错
  if (seriesId && !seriesTitle) errors.push('series_invalid')
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
