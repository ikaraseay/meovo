/**
 * 发布 / 撤回。
 * ⚠️ 这里只改 D1 里的 status —— 站点要等下一次构建（prebuild 导出）才变。
 *
 * 上线由「立即构建」那一步决定 —— 这里只改 D1，改完自己敲一次构建钩子。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import { getDocument, setDocumentStatus } from '../../../../../../backend/lib/admin/db.ts'
import { fail, json, readJson } from '../../../../../../backend/lib/admin/api.ts'

export const POST: APIRoute = async ({ params, request }) => {
  const document = await getDocument(params.id ?? '')
  if (!document) return fail('not_found', 404)

  const body = await readJson(request)
  const published = body?.published !== false
  const updatedAt = await setDocumentStatus(document.id, published ? 'published' : 'draft')

  // 发布/撤回也换了令牌 —— 回传出去，客户端手里那份才不是过期的
  return json({ ok: true, status: published ? 'published' : 'draft', updatedAt })
}
