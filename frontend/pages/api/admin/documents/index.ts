/** 文档列表 / 新建 */
export const prerender = false

import type { APIRoute } from 'astro'
import { normalizeDocument } from '../../../../../backend/lib/admin/documents.ts'
import { createDocument, findDocumentBySlug, listDocuments } from '../../../../../backend/lib/admin/db.ts'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'

export const GET: APIRoute = async ({ url }) => {
  // 对版：按 slug + 语言取**另一版**（同 slug 的另一种语言）
  const slug = url.searchParams.get('slug')
  const locale = url.searchParams.get('locale')
  if (slug && locale) {
    const document = await findDocumentBySlug(slug, locale, '')
    return json({ ok: true, document: document ?? null })
  }
  const documents = await listDocuments()
  return json({ ok: true, documents })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request)
  if (!body) return fail('invalid_request', 400)

  const normalized = normalizeDocument(body)
  if (!normalized.ok || !normalized.value) {
    return json({ error: 'validation_failed', errors: normalized.errors }, 422)
  }
  const values = normalized.value

  const taken = await findDocumentBySlug(values.slug, values.locale, '')
  if (taken) return fail('slug_taken', 409)

  const id = crypto.randomUUID()
  await createDocument(id, {
    slug: values.slug,
    locale: values.locale,
    title: values.title,
    description: values.description,
    body: values.body,
    pub_date: values.pubDate,
    updated_date: values.updatedDate,
    category: values.category,
    tags: values.tags,
    series_id: values.seriesId,
    series_title: values.seriesTitle,
    series_order: values.seriesOrder,
    license: values.license,
  })
  return json({ ok: true, id })
}
