#!/usr/bin/env node
/**
 * 构建期导出 —— 把后台已发布的文档导成 markdown。
 * ---------------------------------------------------------
 * 后台写 D1，站点是静态的：这一段是两者之间唯一的桥。
 * 导出的文件落在 frontend/content/generated/<locale>/<slug>.md，
 * 内容集合照常收 —— 于是 sitemap / RSS / 搜索索引 / SEO 校验一行都不用改。
 *
 * 凭证走环境变量：本地读仓库根的 config.env，CI 用 secret 注入
 *   CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / D1_DATABASE_ID
 * 进程里已有的环境变量优先于 config.env（loadEnvFile 不覆盖已有值）。
 *
 * 拿不到 token 时**退回 wrangler 的登录态**（`wrangler d1 execute --remote`）——
 * 本机 `wrangler login` 过就能拉，不需要额外配 token。
 *
 * 缺凭证时：默认只警告跳过（本地与检查流水线都没凭证）；
 * 但**部署构建必须导出成功** —— Workers Builds 里（`WORKERS_CI=1`）或显式
 * `D1_EXPORT_REQUIRED=1` 时，拉不到 D1 直接失败，拦住「文章集体消失」的上线。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { summarizeAll } from './ai-summary.mjs'
import { fileNameFor, renderMarkdownFile } from '../lib/admin/post-export.ts'
import { createQuery, readD1Config, sqlText } from './d1-query.mjs'

/** 仓库根 —— 脚本在 backend/scripts/ 下，根要往上两级 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const OUT_DIR = join(ROOT, 'frontend/content/generated')
const HANDWRITTEN_DIR = join(ROOT, 'frontend/content/blog')
const WRANGLER_CONFIG = join(ROOT, 'cloudflare/wrangler.jsonc')
const MANIFEST = join(OUT_DIR, '.manifest.json')
/** 后台改过的文案（语言包覆盖）—— 写进 frontend/i18n/overrides.ts */
const OVERRIDES = join(ROOT, 'frontend/i18n/overrides.ts')
/** 项目数据文件 —— 前台是纯静态的，关于页那张卡从这里读（构建期就写好，运行时不查 D1） */
const PROJECTS_FILE = join(ROOT, 'frontend/data/projects.ts')
/** AI 摘要 —— TextFold 的「两句 / 一句」模式读这份（构建期生成，运行时不调 AI） */
const SUMMARIES_FILE = join(ROOT, 'frontend/data/article-summaries.ts')

/** 环境在 config.env（从 config.env.example 复制，不入库）—— 没有就只用进程里的变量 */
try {
  process.loadEnvFile(join(ROOT, 'config.env'))
} catch {
  // 没有 config.env —— 走进程里的环境变量
}

/**
 * 本地演练：--local 走 wrangler 的本地 D1（Miniflare 状态），不需要任何凭证。
 * 没有 Cloudflare 账号也能把「后台发布 → 导出 → 站点出现」整条链跑一遍。
 */
const useLocal = process.argv.includes('--local')
/** --ensure：只保证生成物存在（缺了就写空壳），不查库 —— 给 dev / test / check 用 */
const ensureOnly = process.argv.includes('--ensure')

const token = process.env.CLOUDFLARE_API_TOKEN
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID

/**
 * 这次构建能不能「跳过导出」？
 * 本地与 GitHub Actions 的检查流水线（ci.yml）没有 D1 凭证，跳过是正常的；
 * 部署构建（Workers Builds 注入了 WORKERS_CI=1，或显式 D1_EXPORT_REQUIRED=1）
 * 跳过就等于静默上线一个空站 —— 必须失败。
 */
const exportRequired =
  process.env.D1_EXPORT_REQUIRED === '1' || process.env.WORKERS_CI === '1'

/** database_id：环境变量优先，没有就从 wrangler.jsonc 里挖（那边是唯一事实来源） */
function resolveDatabaseId() {
  if (process.env.D1_DATABASE_ID) return process.env.D1_DATABASE_ID
  return readD1Config(WRANGLER_CONFIG).id
}

const databaseId = resolveDatabaseId()

if (!useLocal && (!token || !accountId || !databaseId)) {
  // 没有 token 就走 wrangler 的登录态（见 d1-query.mjs）——
  // 本机登录过 wrangler 就能拉，Cloudflare Workers Builds 里 wrangler 也有构建 token。
  // ⚠️ 这里不要因为缺 token 就提前 exit —— 登录态那条路还在，真假凭证
  //    交给下面真正的查询去判断（失败且必须导出时才拦）。
  console.warn(
    '[export] 没走 REST 凭证（CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / D1_DATABASE_ID 不全）' +
      ' —— 改走 wrangler 的登录态',
  )
}

/** 查库 —— 远端走 token 或 wrangler 登录态，本地走 wrangler --local */
const query = createQuery({
  root: ROOT,
  wranglerConfig: WRANGLER_CONFIG,
  useLocal,
  token,
  accountId,
  databaseId,
})

const COLUMNS =
  'slug, locale, title, description, body, pub_date, updated_date, category, tags, ' +
  'series_id, series_title, series_order, license, created_at, updated_at'

if (ensureOnly) {
  // 只补空壳：新克隆的仓库没有这几个文件，check / test 会找不到模块
  if (!existsSync(OVERRIDES)) writeOverrides({})
  if (!existsSync(PROJECTS_FILE)) writeProjects([])
  if (!existsSync(SUMMARIES_FILE)) writeSummariesFile({})
  process.exit(0)
}

let rows = []
try {
  rows = await query(
    "SELECT " + COLUMNS + " FROM documents WHERE status = 'published' ORDER BY pub_date DESC",
  )
} catch (error) {
  // 既没 token、wrangler 也没登录（检查流水线就是这样）—— 别崩，按「没有后台文章」处理
  const message = '拉不到 D1：' + error.message
  if (exportRequired) {
    console.error('[export] ' + message + ' —— 部署构建必须有内容，拦住这次上线')
    process.exit(1)
  }
  console.warn('[export] ' + message + ' —— 跳过导出，站点里没有后台发布的文章')
  writeOverrides({})
  writeProjects([])
  process.exit(0)
}

/**
 * 完整性闸门 —— 上次导出有文章、这次一篇都没有，多半是库 id 填错了。
 *
 * 但「作者把最后一篇撤回了」也是一篇都没有：这时库里还有稿子（只是没发布），
 * 属于正常下线，不该拦住构建。库里一篇都没有才可疑。
 *
 * 真要清空就设 D1_EXPORT_ALLOW_EMPTY=1。
 */
let previousCount = 0
try {
  previousCount = JSON.parse(readFileSync(MANIFEST, 'utf8')).count ?? 0
} catch {
  previousCount = 0
}
if (rows.length === 0 && previousCount > 0 && process.env.D1_EXPORT_ALLOW_EMPTY !== '1') {
  const total = await query('SELECT COUNT(*) AS n FROM documents')
  const drafts = Number(total[0]?.n ?? 0)
  if (drafts === 0) {
    console.error(
      '[export] 上次导出 ' +
        previousCount +
        ' 篇，这次一篇都没有 —— 多数是 database_id 填错了。确认要清空就设 D1_EXPORT_ALLOW_EMPTY=1',
    )
    process.exit(1)
  }
  console.warn('[export] 库里还有 ' + drafts + ' 篇稿子，但一篇都没发布 —— 按「已撤回」处理')
}

/** 清掉上次的导出物 —— 撤回 / 删除的文档自然下线（.gitkeep 与清单留着） */
function cleanOutput() {
  if (!existsSync(OUT_DIR)) return
  for (const entry of readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      rmSync(join(OUT_DIR, entry.name), { recursive: true, force: true })
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      rmSync(join(OUT_DIR, entry.name), { force: true })
    }
  }
}

/** 手写目录里已有的文章 id —— 同名以手写为准，不覆盖作者写的东西 */
function handwrittenIds() {
  const ids = new Set()
  if (!existsSync(HANDWRITTEN_DIR)) return ids
  for (const locale of readdirSync(HANDWRITTEN_DIR, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue
    for (const file of readdirSync(join(HANDWRITTEN_DIR, locale.name), { withFileTypes: true })) {
      if (!file.isFile()) continue
      if (!file.name.endsWith('.md') && !file.name.endsWith('.mdx')) continue
      ids.add(locale.name + '/' + file.name.replace(/\.mdx?$/, ''))
    }
  }
  return ids
}

cleanOutput()
const handwritten = handwrittenIds()
const written = []
const skipped = []
/** 清单用的条目快照（slug + updated_at） */
const entries = []

for (const row of rows) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) {
    skipped.push(row.slug + '（slug 不合法）')
    continue
  }
  if (!/^(zh|en)$/.test(row.locale)) {
    skipped.push(row.slug + '（语言不认识）')
    continue
  }
  const dir = join(OUT_DIR, row.locale)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, fileNameFor(row)), renderMarkdownFile(row), 'utf8')
  written.push(row.locale + '/' + row.slug)
  entries.push({ slug: row.slug, locale: row.locale, updated_at: row.updated_at })
}

// 同名冲突：手写的优先（生成目录与手写目录本来就分开，这里只是提醒）
for (const item of written) {
  if (handwritten.has(item)) skipped.push(item + '（仓库里已有同名文章，以手写为准）')
}

/* ---- 生成物 ---- */

/**
 * 后台改过的默认文字 —— 覆盖值（与默认值一样的条目不落库）。
 * 任何路径都会写（哪怕这次没导到数据）：新克隆的仓库没有这两个文件，
 * check / test 会找不到模块。
 */
function writeOverrides(entries) {
  writeFileSync(
    OVERRIDES,
    `/**
 * 后台改过的文案 —— **生成的，别手改**。
 *
 * 由 backend/scripts/export-d1-posts.mjs 在构建前写入（内容 = D1 的 settings 表）。
 * 空表 = 全站用语言包里的默认值。
 */
export const overrides: Record<string, { zh?: string; en?: string }> = ${JSON.stringify(entries, null, 2)}
`,
    'utf8',
  )
}

/** 项目数据 —— 前台纯静态，关于页那张卡在构建期就渲染好 */
function writeProjects(rows) {
  writeFileSync(
    PROJECTS_FILE,
    `/**
 * 项目数据 —— **生成的，别手改**。
 *
 * 由 backend/scripts/export-d1-posts.mjs 在构建前写入（内容 = D1 的 projects 表）。
 *
 * 为什么要生成而不是运行时查：前台是纯静态的 —— 页面在构建期就渲染好了，
 * 运行时不碰 D1（后台改完项目，要等下一次构建才出现在页面上）。
 */
export interface Project {
  id: string
  name: string
  description: string
  url: string
}

export const projects: Project[] = ${JSON.stringify(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        url: row.url,
      })),
      null,
      2,
    )}
`,
    'utf8',
  )
}

/* ---- 后台改过的默认文字 ---- */

/**
 * 语言包的覆盖值 —— 与默认值相同的条目不落库，
 * 所以这里写出来的就是「真正被改过的那几条」。
 */
let settingRows = []
try {
  settingRows = await query('SELECT key, value FROM settings')
} catch {
  // settings 表还没有（迁移没跑）—— 不该因此拦住整次导出
  console.warn('[export] settings 表不存在，跳过文案覆盖（跑一次 d1 migrations apply）')
}
const overrides = {}
for (const row of settingRows) {
  let parsed
  try {
    parsed = JSON.parse(row.value)
  } catch {
    continue
  }
  if (!parsed || typeof parsed !== 'object') continue
  overrides[row.key] = {
    zh: typeof parsed.zh === 'string' ? parsed.zh : '',
    en: typeof parsed.en === 'string' ? parsed.en : '',
  }
}
writeOverrides(overrides)

/* ---- 项目：同步进本地 D1 ---- */

/** 远端项目行（清单快照用） */
let projectRows = []


/**
 * 把远端的项目同步进**本地 D1**。
 *
 * 为什么单独同步：项目不是构建期导出的静态文件 —— 关于页是运行时去 /api/projects 拿的，
 * 而本地开发时那个接口读的是**本地库**（cloudflare/.wrangler/state）。
 * 不同步的话，后台改了项目，本地关于页还是旧的。
 */
async function syncProjects() {
  let rows = []
  try {
    rows = await query('SELECT id, name, description, url, sort_order, created_at FROM projects')
    projectRows = rows
  } catch {
    console.warn('[export] projects 表不存在，跳过项目同步（跑一次 d1 migrations apply）')
    return
  }

  const now = new Date().toISOString()
  const values = rows.map((row) =>
    '(' +
    [row.id, row.name, row.description, row.url, row.sort_order, row.created_at ?? now]
      .map(sqlText)
      .join(', ') +
    ')',
  )

  const commands = []
  if (rows.length > 0) {
    // 本地多余的（远端已删的）先清掉
    commands.push('DELETE FROM projects WHERE id NOT IN (' + rows.map((row) => sqlText(row.id)).join(', ') + ')')
    commands.push('INSERT OR REPLACE INTO projects (id, name, description, url, sort_order, created_at) VALUES ' + values.join(', '))
  } else {
    commands.push('DELETE FROM projects')
  }

  try {
    execFileSync(
      join(ROOT, 'node_modules/.bin/wrangler'),
      [
        'd1',
        'execute',
        readD1Config(WRANGLER_CONFIG).name || 'meovo-content',
        '--local',
        '--config',
        WRANGLER_CONFIG,
        '--command',
        commands.join('; '),
      ],
      { encoding: 'utf8', cwd: ROOT },
    )
    console.log('[export] 项目已同步进本地 D1：' + rows.length + ' 条')
  } catch (error) {
    // 本地库还没建表之类 —— 不该因此拦住整次导出
    console.warn('[export] 项目同步失败（不影响文章导出）：' + error.message)
  }
}

// 远端导出时顺手把项目同步进本地库 —— 本地开发才能看到后台的改动
// （先同步再写清单：清单里的项目快照才拿得到远端那几行）
if (!useLocal) await syncProjects()

/**
 * 清单 —— 除了统计，还记三份**本地快照**：
 * 文章（slug + updated_at）、文案（settings）、项目。
 * 提交前的守卫（backend/scripts/check-remote-updates.mjs）拿它跟线上比对，
 * 看「本地这份是不是落后了」。
 */
const manifest = {
  count: written.length,
  slugs: written,
  skipped,
  entries: entries.map((row) => ({
    slug: row.locale + '/' + row.slug,
    updated_at: row.updated_at ?? '',
  })),
  settings: overrides,
  projects: projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    url: row.url,
  })),
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8')

/**
 * 项目数据 —— 写成源码（跟 overrides.ts 一个道理）：
 * 静态页在构建期 import 它，运行时**完全不碰 D1**。
 */
writeProjects(projectRows)

/* ---- AI 摘要：TextFold 用 ---- */

/**
 * 生成 AI 摘要（只在新文章或文章更新时）
 */
async function generateSummaries() {
  if (rows.length === 0) {
    writeSummariesFile({})
    return
  }

  const summaries = await summarizeAll(
    rows.map((row) => ({
      slug: row.slug,
      locale: row.locale,
      body: row.body,
      updated_at: row.updated_at,
    })),
    { token, accountId, query },
  )

  // 写成 TS 模块供前端 import
  const obj = Object.fromEntries(summaries)
  writeSummariesFile(obj)
  console.log(`[export] AI 摘要：生成 ${summaries.size} 篇`)
}

function writeSummariesFile(data) {
  writeFileSync(
    SUMMARIES_FILE,
    `/**
 * 文章段落摘要 —— **生成的，别手改**。
 *
 * 由 backend/scripts/export-d1-posts.mjs 在构建前调用 Cloudflare Workers AI
 * （Llama 3.3 70B 模型）生成。TextFold 的「两句 / 一句」模式读这份数据。
 *
 * 结构：{ "locale/slug": { 段落键: "摘要", ... } }
 * 段落键由 frontend/lib/text-fold-key.ts 的 foldKey 算出来 ——
 * 键对不上就是那段没有摘要（回退规则折叠），不会张冠李戴。
 */
export const articleSummaries: Record<string, Record<string, string>> = ${JSON.stringify(data, null, 2)}
`,
    'utf8',
  )
}

await generateSummaries()

console.log(
  '[export] 导出 ' + written.length + ' 篇' + (skipped.length > 0 ? '，跳过 ' + skipped.length + ' 篇' : ''),
)
for (const item of skipped) console.warn('[export] 跳过：' + item)
