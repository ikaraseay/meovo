/**
 * 评论的纯逻辑 —— 校验、哈希、限流判定。
 * ---------------------------------------------------------
 * 纯 module（不碰 cloudflare:workers），Node 测试直接 import。
 */

/** 评论状态：待审 / 已发布 / 垃圾 */
export type CommentStatus = 'pending' | 'approved' | 'spam'

/** 昵称最长多少字 */
export const COMMENT_NAME_MAX = 50
/** 邮箱最长多少字 */
export const COMMENT_EMAIL_MAX = 120
/** 评论最长多少字 */
export const COMMENT_MAX_LENGTH = 2000
/** 同一 IP 一个窗口内允许的提交次数 */
export const COMMENT_MAX_PER_WINDOW = 5
/** 限流窗口（毫秒） */
export const COMMENT_WINDOW_MS = 10 * 60 * 1000

/** 文章 slug —— 与后台的 slug 同形（允许带 / 的嵌套目录） */
export const COMMENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9\-/]*$/i

export interface CommentValues {
  name: string
  email: string
  website: string
  content: string
}

/** 字段名 → 错误代码（界面按代码查文案） */
export type CommentField = 'name' | 'email' | 'website' | 'content'

export type CommentErrors = Partial<Record<CommentField, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 校验一条评论。
 * 失败时给出**字段 → 错误代码**，界面按代码翻成文案。
 */
export function validateComment(input: {
  name?: unknown
  email?: unknown
  website?: unknown
  content?: unknown
}): { ok: true; value: CommentValues } | { ok: false; errors: CommentErrors } {
  const errors: CommentErrors = {}

  const name = text(input.name)
  if (!name) errors.name = 'name_required'
  else if (name.length > COMMENT_NAME_MAX) errors.name = 'name_too_long'

  const email = text(input.email).toLowerCase()
  if (!email) errors.email = 'email_required'
  else if (email.length > COMMENT_EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    errors.email = 'email_invalid'
  }

  const rawWebsite = text(input.website)
  let website = ''
  if (rawWebsite) {
    const normalized = normalizeWebsite(rawWebsite)
    if (normalized === null) errors.website = 'website_invalid'
    else website = normalized
  }

  const content = text(input.content)
  if (!content) errors.content = 'content_required'
  else if (content.length > COMMENT_MAX_LENGTH) errors.content = 'content_too_long'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { name, email, website, content },
  }
}

/**
 * 网站地址归一化 —— 没写协议就补 https://，只收 http / https。
 * 返 null 表示不合法（javascript: 之类一律拒掉）。
 */
export function normalizeWebsite(raw: string): string | null {
  const value = raw.trim()
  if (!value) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url.toString()
}

/** 文本 → SHA-256 十六进制（邮箱取 Gravatar 头像、IP 取限流用的哈希） */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Gravatar 头像地址 —— 用邮箱的 SHA-256（Gravatar 支持 SHA-256 哈希）。
 * d=404：这个邮箱没注册过头像时返回 404，前端换成姓名首字母。
 */
export async function gravatarUrl(email: string): Promise<string> {
  const hash = await sha256Hex(email.trim().toLowerCase())
  return `https://gravatar.com/avatar/${hash}?s=96&d=404`
}

/** 窗口内提交太多次就不收 */
export function isRateLimited(count: number): boolean {
  return count >= COMMENT_MAX_PER_WINDOW
}

/** 限流窗口的起点（窗口内已经提交过的条数就是 count） */
export function windowStart(now: number = Date.now()): string {
  return new Date(now - COMMENT_WINDOW_MS).toISOString()
}
