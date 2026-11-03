/** 单条设置 —— 删掉就是恢复默认 */
export const prerender = false

import type { APIRoute } from 'astro'
import { deleteSetting } from '../../../../../backend/lib/admin/db.ts'
import { fail, json } from '../../../../../backend/lib/admin/api.ts'
import { triggerBuild } from '../../../../../backend/lib/admin/build-hook.ts'

export const DELETE: APIRoute = async ({ params }) => {
  const key = params.key ?? ''
  if (!key) return fail('invalid_request', 400)
  await deleteSetting(key)
  // 删掉一行同样是改动 —— 站点要重建才看得到
  const buildTriggered = await triggerBuild()
  return json({ ok: true, buildTriggered })
}
