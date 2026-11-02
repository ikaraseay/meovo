#!/usr/bin/env node
/**
 * 提交前的守卫 —— 线上有更新，就别急着提交。
 * ---------------------------------------------------------
 * 后台（D1）才是内容的真身，本地只是一份快照（导出的 markdown + 清单）。
 * 万一线上变了、本地没拉，提交上去就把别人的改动盖掉了 —— 这道门挡的就是这个。
 *
 * 比对三样（快照都在 frontend/content/generated/.manifest.json 里）：
 *   文章 —— slug + updated_at
 *   文案 —— settings 表
 *   项目 —— projects 表
 *
 * 有差异 → 退出码 1（拦住提交），并告诉人跑 `pnpm sync`。
 * 连不上线上 → 放行（离线不该把人堵死）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createQuery } from './d1-query.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const WRANGLER_CONFIG = join(ROOT, 'cloudflare/wrangler.jsonc')
const MANIFEST = join(ROOT, 'frontend/content/generated/.manifest.json')

// 凭证：有 token 走 REST，没有就借 wrangler 的登录态
try {
  process.loadEnvFile(join(ROOT, 'config.env'))
} catch {
  // 没有 config.env —— 走进程里的环境变量
}

const query = createQuery({
  root: ROOT,
  wranglerConfig: WRANGLER_CONFIG,
  token: process.env.CLOUDFLARE_API_TOKEN,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.D1_DATABASE_ID,
})

/** 本地快照 —— 没有清单就说明还没拉过 */
function localManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  } catch {
    return null
  }
}

/** 文章能不能导出（跟导出脚本同一套规矩） */
function exportable(row) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) && /^(zh|en)$/.test(row.locale)
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

const manifest = localManifest()
if (!manifest) {
  console.warn('[guard] 本地还没有快照（frontend/content/generated/.manifest.json）')
  console.warn('[guard] 先跑一次 pnpm sync，再提交')
  process.exit(1)
}

let remote
try {
  remote = {
    documents: await query(
      "SELECT slug, locale, updated_at FROM documents WHERE status = 'published'",
    ),
    settings: await query('SELECT key, value FROM settings'),
    projects: await query('SELECT id, name, description, url FROM projects'),
  }
} catch (error) {
  // 连不上线上就放行 —— 离线提交不该被堵死
  console.warn('[guard] 连不上线上 D1（' + error.message + '）—— 跳过检查')
  process.exit(0)
}

/* ---- 文章 ---- */
const remotePosts = new Map()
for (const row of remote.documents) {
  if (!exportable(row)) continue
  remotePosts.set(row.locale + '/' + row.slug, row.updated_at ?? '')
}
const localPosts = new Map(
  (manifest.entries ?? []).map((item) => [item.slug, item.updated_at ?? '']),
)

const postChanges = []
for (const [slug, updatedAt] of remotePosts) {
  if (!localPosts.has(slug)) postChanges.push('新增 ' + slug)
  else if (localPosts.get(slug) !== updatedAt) postChanges.push('改动 ' + slug)
}
for (const slug of localPosts.keys()) {
  if (!remotePosts.has(slug)) postChanges.push('线上已删 ' + slug)
}

/* ---- 文案 ---- */
const remoteSettings = {}
for (const row of remote.settings) {
  try {
    const parsed = JSON.parse(row.value)
    if (parsed && typeof parsed === 'object') {
      remoteSettings[row.key] = {
        zh: typeof parsed.zh === 'string' ? parsed.zh : '',
        en: typeof parsed.en === 'string' ? parsed.en : '',
      }
    }
  } catch {
    // 存的不是 JSON —— 忽略这一条
  }
}
const settingChanges = []
for (const [key, value] of Object.entries(remoteSettings)) {
  if (!same(manifest.settings?.[key], value)) settingChanges.push(key)
}
for (const key of Object.keys(manifest.settings ?? {})) {
  if (!(key in remoteSettings)) settingChanges.push(key + '（线上已删）')
}

/* ---- 项目 ---- */
const remoteProjects = new Map(
  remote.projects.map((row) => [
    row.id,
    { name: row.name, description: row.description, url: row.url },
  ]),
)
const localProjects = new Map(
  (manifest.projects ?? []).map((row) => [
    row.id,
    { name: row.name, description: row.description, url: row.url },
  ]),
)
const projectChanges = []
for (const [id, value] of remoteProjects) {
  if (!localProjects.has(id)) projectChanges.push('新增 ' + (value.name ?? id))
  else if (!same(localProjects.get(id), value)) projectChanges.push('改动 ' + (value.name ?? id))
}
for (const [id, value] of localProjects) {
  if (!remoteProjects.has(id)) projectChanges.push('线上已删 ' + (value.name ?? id))
}

/* ---- 结论 ---- */
const total = postChanges.length + settingChanges.length + projectChanges.length
if (total === 0) {
  console.log('[guard] 线上与本地一致 ✓')
  process.exit(0)
}

console.error('[guard] 线上有 ' + total + ' 处更新，本地还是旧的：')
for (const item of postChanges) console.error('  · 文章 ' + item)
for (const item of settingChanges) console.error('  · 文案 ' + item)
for (const item of projectChanges) console.error('  · 项目 ' + item)
console.error('')
console.error('[guard] 先跑 `pnpm sync` 把线上更新拉到本地，再提交。')
console.error('[guard] 确实要跳过：git commit --no-verify')
process.exit(1)
