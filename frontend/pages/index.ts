/**
 * 根路径 —— 按浏览器的语言偏好跳到对应语言。
 * ---------------------------------------------------------
 * on-demand 路由（`prerender = false`）：静态站里只有这一个动态入口。
 * 访客没手动切过语言时，跟随系统（Accept-Language）——
 * 跟明暗模式一个口径：默认跟系统，用户选过才听用户的。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import { pickLocale } from '../i18n/negotiate.ts'

export const GET: APIRoute = async ({ request, redirect }) => {
  const locale = pickLocale(request.headers.get('accept-language'))
  // 302：协商出来的结果不缓存（用户改浏览器语言后要能变）
  return redirect(`/${locale}/`, 302)
}
