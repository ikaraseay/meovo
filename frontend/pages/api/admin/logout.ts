/** 登出 —— 清掉会话 Cookie */
export const prerender = false

import type { APIRoute } from 'astro'
import { SESSION_COOKIE } from '../../../../backend/lib/admin/session.ts'
import { json } from '../../../../backend/lib/admin/api.ts'

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' })
  return json({ ok: true })
}
