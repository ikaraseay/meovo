/** 单张图 —— 改 alt / 删 */
export const prerender = false

import type { APIRoute } from 'astro'
import {
  deleteMedia,
  getMedia,
  mediaBucket,
  updateMediaAlt,
} from '../../../../../backend/lib/admin/db.ts'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'

export const PATCH: APIRoute = async ({ params, request }) => {
  const media = await getMedia(params.id ?? '')
  if (!media) return fail('not_found', 404)
  const body = await readJson(request)
  const alt = typeof body?.alt === 'string' ? body.alt : ''
  await updateMediaAlt(media.id, alt)
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ params }) => {
  const media = await getMedia(params.id ?? '')
  if (!media) return fail('not_found', 404)
  await mediaBucket().delete(media.key)
  await deleteMedia(media.id)
  return json({ ok: true })
}
