/**
 * 后台鉴权 —— 一处拦截，别每个路由各写一遍。
 * ---------------------------------------------------------
 * 覆盖 /<lang>/admin/*（页面）与 /api/admin/*（接口）：
 * 没登录的接口回 401，页面跳登录页。登录页与登录接口本身放行。
 *
 * ⚠️ middleware 在预渲染构建期也会被导入 —— 所以 cloudflare:workers
 *    只能在处理函数里动态 import，模块顶层别碰 Worker 绑定。
 */

import { defineMiddleware } from 'astro:middleware'
import { SESSION_COOKIE, verifySession } from './lib/admin/session.ts'
import { bodyTooLarge, MAX_BODY_BYTES, MAX_UPLOAD_BYTES } from './lib/admin/api.ts'

const ADMIN_PAGE = /^\/(zh|en)\/admin(\/|$)/
const ADMIN_API = /^\/api\/admin(\/|$)/
/** 图库上传 —— 要装 5MB 的文件，其余接口都是小 JSON */
const MEDIA_API = /^\/api\/admin\/media(\/|$)/

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname

  // 请求体上限 —— 在解析之前卡住（读进来再判断等于没判断，内存已经花掉了）
  const tooLarge = bodyTooLarge(
    context.request,
    MEDIA_API.test(path) ? MAX_UPLOAD_BYTES : MAX_BODY_BYTES,
  )
  if (tooLarge) return tooLarge

  const isApi = ADMIN_API.test(path)
  const isPage = ADMIN_PAGE.test(path)
  if (!isApi && !isPage) return next()

  // 登录页与登录接口放行 —— 否则永远登不进去
  if (path.endsWith('/admin/login') || path === '/api/admin/login') return next()

  const { env } = await import('cloudflare:workers')
  const token = context.cookies.get(SESSION_COOKIE)?.value
  const secret = (env as unknown as Record<string, unknown>).SESSION_SECRET
  if (typeof secret === 'string' && (await verifySession(token, secret))) return next()

  if (isApi) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const locale = path.split('/')[1] === 'en' ? 'en' : 'zh'
  return context.redirect('/' + locale + '/admin/login')
})
