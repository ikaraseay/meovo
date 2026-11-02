/** 单条评论 —— 改状态（通过 / 垃圾）/ 删除 */
export const prerender = false

import type { APIRoute } from 'astro'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'
import { deleteComment, setCommentStatus } from '../../../../../backend/lib/comments/store.ts'
import type { CommentStatus } from '../../../../../backend/lib/comments/model.ts'

const STATUSES: CommentStatus[] = ['approved', 'spam', 'pending']

export const POST: APIRoute = async ({ params, request }) => {
  const body = await readJson(request)
  const status = body?.status
  if (typeof status !== 'string' || !STATUSES.includes(status as CommentStatus)) {
    return fail('invalid_request', 400)
  }
  await setCommentStatus(params.id!, status as CommentStatus)
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ params }) => {
  await deleteComment(params.id!)
  return json({ ok: true })
}
