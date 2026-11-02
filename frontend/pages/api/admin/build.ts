/**
 * 手动构建 —— 后台页头的「立即构建」按钮。
 * ---------------------------------------------------------
 * 站点是构建期产物：后台改的是 D1，要重建才会上线。
 * 这里只负责敲一下 DEPLOY_HOOK_URL（Cloudflare Workers Builds 的 Deploy Hook），
 * 构建与部署由 Cloudflare 那边跑；没配钩子就返回 buildTriggered:false。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import { triggerBuild } from '../../../../backend/lib/admin/build-hook.ts'
import { json } from '../../../../backend/lib/admin/api.ts'

export const POST: APIRoute = async () => {
  const buildTriggered = await triggerBuild()
  return json({ ok: true, buildTriggered })
}
