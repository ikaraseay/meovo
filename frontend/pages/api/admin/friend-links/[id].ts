/** 单条友链 —— 改 / 删 */
export const prerender = false

import type { APIRoute } from 'astro'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'
import { deleteFriendLink, listFriendLinks, updateFriendLink } from '../../../../../backend/lib/admin/db.ts'
import { normalizeFriendLink } from '../../../../../backend/lib/admin/friend-links.ts'

export const PUT: APIRoute = async ({ params, request }) => {
  const id = params.id ?? ''
  const body = await readJson(request)
  const normalized = normalizeFriendLink(body ?? {})
  if (!normalized.ok || !normalized.value) {
    return json({ error: 'validation_failed', errors: normalized.errors }, 422)
  }
  const current = (await listFriendLinks()).find((item) => item.id === id)
  if (!current) return fail('not_found', 404)
  const values = normalized.value
  await updateFriendLink({
    id,
    name: values.name,
    url: values.url,
    avatar: values.avatar,
    description: values.description,
    sort_order: values.sortOrder,
    created_at: current.created_at,
  })
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ params }) => {
  await deleteFriendLink(params.id ?? '')
  return json({ ok: true })
}
