/**
 * 登录 —— 口令换会话 Cookie。
 * 失败次数按 IP 记在 D1：同一 IP 十分钟内错 5 次就锁。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import {
  LOGIN_WINDOW_MS,
  isRateLimited,
  verifyPassword,
} from '../../../../backend/lib/admin/password.ts'
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
} from '../../../../backend/lib/admin/session.ts'
import {
  clearLoginAttempts,
  clientIp,
  getLoginAttempt,
  recordLoginFailure,
  secret,
} from '../../../../backend/lib/admin/db.ts'
import { fail, json, readJson } from '../../../../backend/lib/admin/api.ts'

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await readJson(request)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!password) return fail('invalid_request', 400)

  const ip = clientIp(request)

  // 口令对了就放行 —— 限流是给「猜口令」用的，
  // 不该把已经知道口令的人挡在门外（先错几次就再也进不去，最让人抓狂）
  if (await verifyPassword(password, secret('ADMIN_PASSWORD_HASH'))) {
    await clearLoginAttempts(ip)
    const token = await signSession(
      { exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
      secret('SESSION_SECRET'),
    )
    cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    })
    return json({ ok: true })
  }

  // 口令不对 —— 这才要限流
  const attempt = await getLoginAttempt(ip)
  if (isRateLimited(attempt.count, new Date(attempt.window_at).getTime())) {
    return fail('rate_limited', 429)
  }
  await recordLoginFailure(ip, LOGIN_WINDOW_MS)
  return fail('invalid_password', 401)
}
