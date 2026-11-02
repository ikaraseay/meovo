/** 评论 —— 后台列表（待审的排前面） */
export const prerender = false

import type { APIRoute } from 'astro'
import { json } from '../../../../../backend/lib/admin/api.ts'
import { listComments } from '../../../../../backend/lib/comments/store.ts'

export const GET: APIRoute = async () => {
  const comments = await listComments()
  return json({ ok: true, comments })
}
