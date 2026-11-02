/**
 * D1 访问 —— Worker 专用薄封装。
 * ---------------------------------------------------------
 * ⚠️ 这个 module import 了 cloudflare:workers，Node 测试里跑不了；
 *    需要测的逻辑都拆在同目录的纯 module 里（session / password / documents / media）。
 *
 * 取绑定用 import { env } from 'cloudflare:workers' ——
 * 适配器 v14 已移除 Astro.locals.runtime，别再用旧写法。
 */

import { env } from 'cloudflare:workers'

export interface DocumentRecord {
  id: string
  slug: string
  locale: string
  title: string
  description: string
  body: string
  pub_date: string | null
  updated_date: string | null
  status: string
  category: string | null
  tags: string
  series_id: string | null
  series_title: string | null
  series_order: number | null
  license: string
  created_at: string
  updated_at: string
  published_at: string | null
}

export interface MediaRecord {
  id: string
  key: string
  filename: string
  mime: string
  size: number
  alt: string
  created_at: string
}

export interface LoginAttempt {
  count: number
  window_at: string
}

/** Worker secret —— wrangler types 不含 secret，取的时候把类型放宽 */
export function secret(name: string): string {
  const value = (env as unknown as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : ''
}

/** R2 桶 */
export function mediaBucket(): R2Bucket {
  return env.MEDIA
}

/** 客户端 IP —— Cloudflare 会带 CF-Connecting-IP */
export function clientIp(request: Request): string {
  const direct = request.headers.get('CF-Connecting-IP')
  if (direct) return direct
  const forwarded = request.headers.get('X-Forwarded-For')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

/* ---------------- 文档 ---------------- */

const DOCUMENT_COLUMNS =
  'id, slug, locale, title, description, body, pub_date, updated_date, status, ' +
  'category, tags, series_id, series_title, series_order, license, created_at, updated_at, published_at'

export async function listDocuments(): Promise<DocumentRecord[]> {
  const result = await env.DB.prepare(
    'SELECT ' + DOCUMENT_COLUMNS + ' FROM documents ORDER BY updated_at DESC',
  ).all<DocumentRecord>()
  return result.results ?? []
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  return env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<DocumentRecord>()
}

export async function findDocumentBySlug(
  slug: string,
  locale: string,
  exceptId: string,
): Promise<DocumentRecord | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM documents WHERE slug = ? AND locale = ? AND id != ?',
  )
    .bind(slug, locale, exceptId)
    .first<DocumentRecord>()
  return row ?? null
}

export interface DocumentValues {
  slug: string
  locale: string
  title: string
  description: string
  body: string
  pub_date: string | null
  updated_date: string | null
  category: string | null
  tags: string[]
  series_id: string | null
  series_title: string | null
  series_order: number | null
  license: string
}

export async function createDocument(id: string, values: DocumentValues): Promise<void> {
  const now = new Date().toISOString()
  const sql =
    'INSERT INTO documents (' +
    DOCUMENT_COLUMNS +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, NULL)"
  await env.DB.prepare(sql)
    .bind(
      id,
      values.slug,
      values.locale,
      values.title,
      values.description,
      values.body,
      values.pub_date,
      values.updated_date,
      values.category,
      JSON.stringify(values.tags),
      values.series_id,
      values.series_title,
      values.series_order,
      values.license,
      now,
      now,
    )
    .run()
}

export async function updateDocument(
  id: string,
  values: DocumentValues,
  expectedUpdatedAt: string | null,
): Promise<'ok' | 'conflict' | 'missing'> {
  const current = await getDocument(id)
  if (!current) return 'missing'
  // 别人改过了就别覆盖 —— 后写覆盖先写会丢内容
  if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) return 'conflict'

  const sql =
    'UPDATE documents SET slug = ?, locale = ?, title = ?, description = ?, body = ?, ' +
    'pub_date = ?, updated_date = ?, category = ?, tags = ?, series_id = ?, series_title = ?, ' +
    'series_order = ?, license = ?, updated_at = ? WHERE id = ?'
  await env.DB.prepare(sql)
    .bind(
      values.slug,
      values.locale,
      values.title,
      values.description,
      values.body,
      values.pub_date,
      values.updated_date,
      values.category,
      JSON.stringify(values.tags),
      values.series_id,
      values.series_title,
      values.series_order,
      values.license,
      new Date().toISOString(),
      id,
    )
    .run()
  return 'ok'
}

export async function setDocumentStatus(id: string, status: string): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    'UPDATE documents SET status = ?, published_at = ?, updated_at = ? WHERE id = ?',
  )
    .bind(status, status === 'published' ? now : null, now, id)
    .run()
}

export async function deleteDocument(id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run()
}

/* ---------------- 图库 ---------------- */

export async function listMedia(): Promise<MediaRecord[]> {
  const result = await env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all<MediaRecord>()
  return result.results ?? []
}

export async function getMedia(id: string): Promise<MediaRecord | null> {
  return env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first<MediaRecord>()
}

export async function createMedia(record: MediaRecord): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO media (id, key, filename, mime, size, alt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      record.id,
      record.key,
      record.filename,
      record.mime,
      record.size,
      record.alt,
      record.created_at,
    )
    .run()
}

export async function updateMediaAlt(id: string, alt: string): Promise<void> {
  await env.DB.prepare('UPDATE media SET alt = ? WHERE id = ?').bind(alt, id).run()
}

export async function deleteMedia(id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run()
}

/* ---------------- 设置（后台改过的默认文字） ---------------- */

export interface SettingRecord {
  key: string
  value: string
  updated_at: string
}

export async function listSettings(): Promise<SettingRecord[]> {
  const result = await env.DB.prepare('SELECT key, value, updated_at FROM settings').all<SettingRecord>()
  return result.results ?? []
}

/** 覆盖值：只存改过的，跟默认值一样的不落库（重置 = 删行） */
export async function upsertSetting(key: string, value: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  )
    .bind(key, value, new Date().toISOString())
    .run()
}

export async function deleteSetting(key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run()
}

/* ---------------- 项目 ---------------- */

export interface ProjectRecord {
  id: string
  name: string
  description: string
  url: string
  sort_order: number
  created_at: string
}

/** 全部项目（公开与后台都用这一份） */
export async function listProjects(): Promise<ProjectRecord[]> {
  const result = await env.DB.prepare(
    'SELECT id, name, description, url, sort_order, created_at FROM projects ' +
      'ORDER BY sort_order ASC, created_at ASC',
  ).all<ProjectRecord>()
  return result.results ?? []
}

export async function createProject(record: ProjectRecord): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO projects (id, name, description, url, sort_order, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(
      record.id,
      record.name,
      record.description,
      record.url,
      record.sort_order,
      record.created_at,
    )
    .run()
}

export async function updateProject(record: ProjectRecord): Promise<void> {
  await env.DB.prepare(
    'UPDATE projects SET name = ?, description = ?, url = ?, sort_order = ? WHERE id = ?',
  )
    .bind(record.name, record.description, record.url, record.sort_order, record.id)
    .run()
}

export async function deleteProject(id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
}

/* ---------------- 登录限流 ---------------- */

export async function getLoginAttempt(ip: string): Promise<LoginAttempt> {
  const row = await env.DB.prepare('SELECT count, window_at FROM login_attempts WHERE ip = ?')
    .bind(ip)
    .first<LoginAttempt>()
  return row ?? { count: 0, window_at: new Date(0).toISOString() }
}

export async function recordLoginFailure(ip: string, windowMs: number): Promise<void> {
  const now = Date.now()
  const current = await getLoginAttempt(ip)
  const expired = now - new Date(current.window_at).getTime() >= windowMs
  const count = expired ? 1 : current.count + 1
  const windowAt = expired ? new Date(now).toISOString() : current.window_at
  await env.DB.prepare(
    'INSERT INTO login_attempts (ip, count, window_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(ip) DO UPDATE SET count = excluded.count, window_at = excluded.window_at',
  )
    .bind(ip, count, windowAt)
    .run()
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run()
}
