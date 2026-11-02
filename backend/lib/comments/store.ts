/**
 * 评论的数据层 —— D1。
 * ---------------------------------------------------------
 * Worker 专用：import 了 cloudflare:workers，Node 测试跑不了；
 * 需要测的逻辑都在同目录的 model.ts（纯 module）。
 */

import { env } from 'cloudflare:workers'
import type { CommentStatus } from './model.ts'

export interface CommentRecord {
  id: string
  slug: string
  name: string
  email: string
  website: string
  content: string
  status: CommentStatus
  created_at: string
}

const COLUMNS = 'id, slug, name, email, website, content, status, created_at'

/** 已通过审核的评论（公开接口只看得到这些） */
export async function listApprovedComments(slug: string): Promise<CommentRecord[]> {
  const result = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM comments WHERE slug = ? AND status = 'approved' ORDER BY created_at ASC`,
  )
    .bind(slug)
    .all<CommentRecord>()
  return result.results ?? []
}

/** 全部评论（后台用）—— 待审的排前面 */
export async function listComments(): Promise<CommentRecord[]> {
  const result = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM comments ` +
      "ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC",
  ).all<CommentRecord>()
  return result.results ?? []
}

export async function insertComment(record: CommentRecord & { ip_hash: string }): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO comments (id, slug, name, email, website, content, status, ip_hash, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      record.id,
      record.slug,
      record.name,
      record.email,
      record.website,
      record.content,
      record.status,
      record.ip_hash,
      record.created_at,
    )
    .run()
}

export async function setCommentStatus(id: string, status: CommentStatus): Promise<void> {
  await env.DB.prepare('UPDATE comments SET status = ? WHERE id = ?').bind(status, id).run()
}

export async function deleteComment(id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run()
}

/** 窗口内这个 IP 已经提交了多少条（限流用） */
export async function countCommentsSince(ipHash: string, since: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM comments WHERE ip_hash = ? AND created_at >= ?',
  )
    .bind(ipHash, since)
    .first<{ count: number }>()
  return row?.count ?? 0
}
