/**
 * 公开图片 —— R2 → HTTP。
 * key 走白名单（<yyyy-mm>/<uuid>.<ext>），顺带挡掉 .. 穿越。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { isSafeMediaKey } from '../../../backend/lib/admin/media.ts'

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.path ?? ''
  if (!isSafeMediaKey(key)) return new Response('Not found', { status: 404 })

  const object = await env.MEDIA.get(key)
  if (!object) return new Response('Not found', { status: 404 })

  const etag = object.httpEtag
  if (etag && request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } })
  }

  const headers = new Headers()
  headers.set('content-type', object.httpMetadata?.contentType ?? 'application/octet-stream')
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  if (etag) headers.set('etag', etag)
  return new Response(object.body, { headers })
}
