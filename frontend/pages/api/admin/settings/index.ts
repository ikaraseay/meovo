/**
 * 设置 —— 全站默认文字的查看与修改。
 *
 * 「默认文字」= 语言包里的全部词条（站点信息 / 导航 / 文章 / 标签 / 后台……）。
 * GET 给出**最终文案**（默认值叠上后台改过的），PUT 保存改动。
 *
 * 只存改过的 —— 跟默认值一样的会删掉那一行（等于重置）。
 */
export const prerender = false

import type { APIRoute } from 'astro'
import { allText } from '../../../../../frontend/i18n/ui.ts'
import { deleteSetting, listSettings, upsertSetting } from '../../../../../backend/lib/admin/db.ts'
import {
  mergeSettingEntries,
  normalizeSetting,
  parseStoredValue,
  serializeSettingValue,
  type DefaultEntry,
} from '../../../../../backend/lib/admin/settings.ts'
import { fail, json, readJson } from '../../../../../backend/lib/admin/api.ts'
import { triggerBuild } from '../../../../../backend/lib/admin/build-hook.ts'

/** 语言包 → 默认条目表 */
function defaultEntries(): Map<string, DefaultEntry> {
  const map = new Map<string, DefaultEntry>()
  for (const [key, value] of Object.entries(allText)) {
    map.set(key, { key, zh: value.zh ?? '', en: value.en ?? '' })
  }
  return map
}

export const GET: APIRoute = async () => {
  const defaults = defaultEntries()
  const rows = await listSettings()
  const overrides = new Map<string, { zh: string; en: string }>()
  for (const row of rows) {
    const value = parseStoredValue(row.value)
    if (value) overrides.set(row.key, value)
  }
  const entries = mergeSettingEntries([...defaults.values()], overrides)
  return json({ ok: true, entries })
}

export const PUT: APIRoute = async ({ request }) => {
  const body = await readJson(request)
  const input = body?.entries
  if (!Array.isArray(input)) return fail('invalid_request', 400)

  const defaults = defaultEntries()
  const errors: string[] = []
  let saved = 0
  /** 恢复默认的行数 —— 删掉的行也是一次改动，站点同样要重建 */
  let removed = 0

  for (const item of input) {
    const normalized = normalizeSetting(
      item as { key?: unknown; zh?: unknown; en?: unknown },
      defaults,
    )
    if (!normalized.ok || !normalized.value) {
      errors.push(...normalized.errors)
      continue
    }
    const { key, zh, en, unchanged } = normalized.value
    if (unchanged) {
      await deleteSetting(key)
      removed += 1
      continue
    }
    await upsertSetting(key, serializeSettingValue({ zh, en }))
    saved += 1
  }

  if (errors.length > 0) return json({ error: 'validation_failed', errors }, 422)

  // 文案改了 → 站点要重建才生效（恢复默认也算改动）
  const changed = saved + removed
  const buildTriggered = changed > 0 ? await triggerBuild() : false
  return json({ ok: true, saved: changed, buildTriggered })
}
