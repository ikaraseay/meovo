/**
 * 评论 —— 公开接口。
 * ---------------------------------------------------------
 * GET  ?slug=xxx   取这篇文章已通过审核的评论
 * POST             提交评论（昵称 / 邮箱 / 个人网站 / 内容）→ 进待审队列
 *
 * 反垃圾：蜜罐字段 + 按 IP 限流 + 后台人工审核。
 * 邮箱只留在 D1 里，公开接口只给哈希后的头像地址。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import { fail, json, readJson } from '../../../backend/lib/admin/api.ts'
import { clientIp } from '../../../backend/lib/admin/db.ts'
import {
  COMMENT_SLUG_PATTERN,
  gravatarUrl,
  isRateLimited,
  sha256Hex,
  validateComment,
  windowStart,
} from '../../../backend/lib/comments/model.ts'
import {
  countCommentsSince,
  insertComment,
  listApprovedComments,
} from '../../../backend/lib/comments/store.ts'

export const GET: APIRoute = async ({ url }) => {
  const slug = (url.searchParams.get('slug') ?? '').trim()
  if (!COMMENT_SLUG_PATTERN.test(slug)) return fail('invalid_slug', 400)

  const rows = await listApprovedComments(slug)
  const comments = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      website: row.website,
      content: row.content,
      created_at: row.created_at,
      avatar: await gravatarUrl(row.email),
    })),
  )
  return json({ ok: true, comments })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request)
  if (!body) return fail('invalid_request', 400)

  // 蜜罐：机器人填了这个字段 —— 照样回成功，但不落库
  if (typeof body.url === 'string' && body.url.trim()) return json({ ok: true, pending: true })

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  if (!COMMENT_SLUG_PATTERN.test(slug)) return fail('invalid_slug', 400)

  const result = validateComment(body)
  if (!result.ok) return json({ error: 'validation_failed', fields: result.errors }, 422)

  const ipHash = await sha256Hex(clientIp(request))
  const count = await countCommentsSince(ipHash, windowStart())
  if (isRateLimited(count)) return fail('rate_limited', 429)

  await insertComment({
    id: crypto.randomUUID(),
    slug,
    ...result.value,
    status: 'pending',
    created_at: new Date().toISOString(),
    ip_hash: ipHash,
  })
  return json({ ok: true, pending: true })
}
