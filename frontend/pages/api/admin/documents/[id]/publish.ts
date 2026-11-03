/**
 * 发布 / 撤回。
 * ⚠️ 这里只改 D1 里的 status —— 站点要等下一次构建（prebuild 导出）才变。
 *
 * 配了 DEPLOY_HOOK_URL（Worker secret，Cloudflare Workers Builds 的 Deploy Hook）
 * 的话，发布和撤回都会顺手敲一下构建钩子：发布让它上线，撤回让它下线
 * （导出脚本先清后写，下一次构建就没了）。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import { getDocument, setDocumentStatus } from '../../../../../../backend/lib/admin/db.ts'
import { triggerBuild } from '../../../../../../backend/lib/admin/build-hook.ts'
import { fail, json, readJson } from '../../../../../../backend/lib/admin/api.ts'

export const POST: APIRoute = async ({ params, request }) => {
  const document = await getDocument(params.id ?? '')
  if (!document) return fail('not_found', 404)

  const body = await readJson(request)
  const published = body?.published !== false
  const updatedAt = await setDocumentStatus(document.id, published ? 'published' : 'draft')

  // 发布与撤回都要重建 —— 发布是上线，撤回是下线，两者都只改了 status
  // 等一下钩子的回应（最多 3 秒）：构建是由 Cloudflare 那边跑的，这里只负责敲门
  let buildTriggered = false
  try {
    buildTriggered = await triggerBuild()
  } catch {
    buildTriggered = false
  }

  // 发布/撤回也换了令牌 —— 回传出去，客户端手里那份才不是过期的
  return json({ ok: true, status: published ? 'published' : 'draft', buildTriggered, updatedAt })
}
