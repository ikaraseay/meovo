/**
 * markdown 预览 —— 后端渲染，编辑器只看结果。
 * 后台只有一位作者，内容不进消毒流程（与站点里 md 允许裸 HTML 一致）。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import { marked } from 'marked'
import { json, readJson } from '../../../../backend/lib/admin/api.ts'

marked.setOptions({ gfm: true, breaks: false })

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request)
  const markdown = typeof body?.markdown === 'string' ? body.markdown : ''
  const html = marked.parse(markdown, { async: false })
  return json({ ok: true, html })
}
