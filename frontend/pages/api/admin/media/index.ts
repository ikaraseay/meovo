/** 图库 —— 列表 / 上传 */
export const prerender = false

import type { APIRoute } from 'astro'
import {
  MAX_IMAGE_BYTES,
  isAllowedImage,
  mediaKey,
  sniffImageType,
} from '../../../../../backend/lib/admin/media.ts'
import { createMedia, listMedia, mediaBucket } from '../../../../../backend/lib/admin/db.ts'
import { fail, json } from '../../../../../backend/lib/admin/api.ts'

export const GET: APIRoute = async () => {
  const media = await listMedia()
  return json({ ok: true, media })
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return fail('file_required', 400)
  if (!isAllowedImage(file.type)) return fail('type_not_allowed', 415)
  if (file.size > MAX_IMAGE_BYTES) return fail('too_large', 413)

  const bytes = new Uint8Array(await file.arrayBuffer())
  // 声明的类型得跟文件头对得上 —— 不然一个 HTML 文件能挂着 image/png 的头存进来
  if (sniffImageType(bytes) !== file.type) return fail('type_mismatch', 415)

  const id = crypto.randomUUID()
  const key = mediaKey(file.type, id, new Date())
  await mediaBucket().put(key, bytes, { httpMetadata: { contentType: file.type } })
  await createMedia({
    id,
    key,
    filename: file.name || key,
    mime: file.type,
    size: file.size,
    alt: '',
    created_at: new Date().toISOString(),
  })
  return json({ ok: true, id, key, url: '/media/' + key })
}
