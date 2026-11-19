/** 文档列表 / 新建 */
export const prerender = false

import type { APIRoute } from 'astro'
import {
  deriveSlug,
  isSlug,
  normalizeDocument,
  todayDate,
  uniqueSlug,
} from '../../../../../backend/lib/admin/documents.ts'
import {
  createDocument,
  findDocumentBySlug,
  listDocumentSlugs,
  listDocuments,
} from '../../../../../backend/lib/admin/db.ts'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'

export const GET: APIRoute = async ({ url }) => {
  // 对版：按 slug + 语言取**另一版**（同 slug 的另一种语言）
  const slug = url.searchParams.get('slug')
  const locale = url.searchParams.get('locale')
  if (slug && locale) {
    const document = await findDocumentBySlug(slug, locale, '')
    return json({ ok: true, document: document ?? null })
  }
  const documents = await listDocuments()
  return json({ ok: true, documents })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request)
  if (!body) return fail('invalid_request', 400)

  const normalized = normalizeDocument(body)
  if (!normalized.ok || !normalized.value) {
    return json({ error: 'validation_failed', errors: normalized.errors }, 422)
  }
  const values = normalized.value

  // slug —— 三种来源，优先级从高到低：
  //   1. 客户端指定 —— 同一篇的另一种语言要共用一个 slug
  //   2. 客户端按标题猜的 —— 中文标题里没有 ASCII，英文标题才有
  //   3. 服务端按标题派生
  const requested = values.slug
  const hint = typeof body.slugHint === 'string' ? body.slugHint.trim().toLowerCase() : ''
  let slug = requested || (isSlug(hint) ? hint : '') || deriveSlug([values.title])
  if (requested) {
    // 明确要用的名字在这个语言下已经有人了 —— 配对配不上，报冲突
    const taken = await findDocumentBySlug(requested, values.locale, '')
    if (taken) return fail('slug_taken', 409)
  } else {
    // 系统分配的：自己避开全站用过的 —— 撞上别的篇会被当成互为翻译，比撞车更麻烦
    slug = uniqueSlug(slug, await listDocumentSlugs())
  }

  const id = crypto.randomUUID()
  const updatedAt = await createDocument(id, {
    slug,
    locale: values.locale,
    title: values.title,
    description: values.description,
    body: values.body,
    // 没填发布日期就用今天 —— 空着的话导出时只能拿创建时间顶
    pub_date: values.pubDate ?? todayDate(),
    updated_date: values.updatedDate,
    category: values.category,
    tags: values.tags,
    series_id: values.seriesId,
    series_title: values.seriesTitle,
    series_order: values.seriesOrder,
    license: values.license,
  })
  // 新令牌回传 —— 客户端不拿它，下一次保存就没有并发保护
  return json({ ok: true, id, slug, updatedAt })
}
