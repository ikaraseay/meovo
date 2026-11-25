/** 友链 —— 后台列表 / 新建 */
export const prerender = false

import type { APIRoute } from 'astro'
import { json, readJson } from '../../../../../backend/lib/admin/api.ts'
import { createFriendLink, listFriendLinks } from '../../../../../backend/lib/admin/db.ts'
import { normalizeFriendLink } from '../../../../../backend/lib/admin/friend-links.ts'

export const GET: APIRoute = async () => {
  const links = await listFriendLinks()
  return json({ ok: true, links })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request)
  const normalized = normalizeFriendLink(body ?? {})
  if (!normalized.ok || !normalized.value) {
    return json({ error: 'validation_failed', errors: normalized.errors }, 422)
  }
  const values = normalized.value
  const id = crypto.randomUUID()
  await createFriendLink({
    id,
    name: values.name,
    url: values.url,
    avatar: values.avatar,
    description: values.description,
    sort_order: values.sortOrder,
    created_at: new Date().toISOString(),
  })
  return json({ ok: true, id })
}
