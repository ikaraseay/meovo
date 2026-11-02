/** 项目 —— 后台列表 / 新建 */
export const prerender = false

import type { APIRoute } from 'astro'
import { json, readJson } from '../../../../../backend/lib/admin/api.ts'
import { triggerBuild } from '../../../../../backend/lib/admin/build-hook.ts'
import { createProject, listProjects } from '../../../../../backend/lib/admin/db.ts'
import { normalizeProject } from '../../../../../backend/lib/admin/projects.ts'

export const GET: APIRoute = async () => {
  const projects = await listProjects()
  return json({ ok: true, projects })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson(request)
  const normalized = normalizeProject(body ?? {})
  if (!normalized.ok || !normalized.value) {
    return json({ error: 'validation_failed', errors: normalized.errors }, 422)
  }
  const values = normalized.value
  const id = crypto.randomUUID()
  await createProject({
    id,
    name: values.name,
    description: values.description,
    url: values.url,
    sort_order: values.sortOrder,
    created_at: new Date().toISOString(),
  })
  const buildTriggered = await triggerBuild()
  return json({ ok: true, id, buildTriggered })
}
