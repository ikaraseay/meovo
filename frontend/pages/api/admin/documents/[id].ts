/** 单篇文档 —— 读 / 存 / 删 */
export const prerender = false

import type { APIRoute } from 'astro'
import { normalizeDocument } from '../../../../../backend/lib/admin/documents.ts'
import {
  deleteDocument,
  findDocumentBySlug,
  getDocument,
  updateDocument,
} from '../../../../../backend/lib/admin/db.ts'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'
import { triggerBuild } from '../../../../../backend/lib/admin/build-hook.ts'

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

  const taken = await findDocumentBySlug(values.slug, values.locale, id)
  if (taken) return fail('slug_taken', 409)

  const expected = typeof body.updatedAt === 'string' ? body.updatedAt : null
  const { result, updatedAt } = await updateDocument(
    id,
    {
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
    },
    expected,
  )
  if (result === 'conflict') return fail('conflict', 409)
  if (result === 'missing') return fail('not_found', 404)

  // 已发布的文档改完正文要重建才看得见；草稿站上还没有它，不用构建
  const buildTriggered = existing.status === 'published' ? await triggerBuild() : false
  // 新令牌回传 —— 客户端不换掉手里那份，下一次保存必然 409
  return json({ ok: true, buildTriggered, updatedAt })
}

export const DELETE: APIRoute = async ({ params }) => {
  const document = await getDocument(params.id ?? '')
  if (!document) return fail('not_found', 404)
  await deleteDocument(document.id)

  // 删的是已发布的文档 → 站点上也要把它删掉（导出脚本先清后写）
  const buildTriggered = document.status === 'published' ? await triggerBuild() : false
  return json({ ok: true, buildTriggered })
}
