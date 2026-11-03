/** 单个项目 —— 改 / 删 */
export const prerender = false

import type { APIRoute } from 'astro'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'
import { deleteProject, listProjects, updateProject } from '../../../../../backend/lib/admin/db.ts'
import { normalizeProject } from '../../../../../backend/lib/admin/projects.ts'

export const PUT: APIRoute = async ({ params, request }) => {
  const id = params.id ?? ''
  const body = await readJson(request)
  const normalized = normalizeProject(body ?? {})
  if (!normalized.ok || !normalized.value) {
    return json({ error: 'validation_failed', errors: normalized.errors }, 422)
  }
  const current = (await listProjects()).find((item) => item.id === id)
  if (!current) return fail('not_found', 404)
  const values = normalized.value
  await updateProject({
    id,
    name: values.name,
    description: values.description,
    url: values.url,
    sort_order: values.sortOrder,
    created_at: current.created_at,
  })
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ params }) => {
  await deleteProject(params.id ?? '')
  return json({ ok: true })
}
