/** 单篇文档 —— 读 / 存 / 删 */
export const prerender = false

import type { APIRoute } from 'astro'
import {
  normalizeDocument,
  todayDate,
} from '../../../../../backend/lib/admin/documents.ts'
import {
  deleteDocument,
  getDocument,
  updateDocument,
} from '../../../../../backend/lib/admin/db.ts'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'

export const GET: APIRoute = async ({ params }) => {
  const document = await getDocument(params.id ?? '')
  if (!document) return fail('not_found', 404)
  return json({ ok: true, document })
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = params.id ?? ''
  const body = await readJson(request)
  if (!body) return fail('invalid_request', 400)

  const existing = await getDocument(id)
  if (!existing) return fail('not_found', 404)

  const normalized = normalizeDocument(body)
  if (!normalized.ok || !normalized.value) {
    return json({ error: 'validation_failed', errors: normalized.errors }, 422)
  }
  const values = normalized.value

  // slug 一经分配就不再变 —— 改了链接，旧的地址就全废了
  const slug = existing.slug
  // 内容改了就把「更新于」写成今天 —— 作者不用记得手动改这个日期
  const changed = existing.title !== values.title || existing.body !== values.body
  const updatedDate =
    values.updatedDate ?? (changed && existing.published_at ? todayDate() : existing.updated_date)

  const expected = typeof body.updatedAt === 'string' ? body.updatedAt : null
  const { result, updatedAt } = await updateDocument(
    id,
    {
      slug,
      locale: values.locale,
      title: values.title,
      description: values.description,
      body: values.body,
      pub_date: values.pubDate,
      updated_date: updatedDate,
      category: values.category,
      tags: values.tags,
      series_id: values.seriesId,
      series_title: values.seriesTitle,
      series_order: values.seriesOrder,
      license: values.license,
    },
    expected,
  )
  if (result === 'conflict') return fail('conflict', 409)
  if (result === 'missing') return fail('not_found', 404)

  return json({ ok: true, updatedAt, slug })
}

export const DELETE: APIRoute = async ({ params }) => {
  const document = await getDocument(params.id ?? '')
  if (!document) return fail('not_found', 404)
  await deleteDocument(document.id)
  return json({ ok: true })
}
