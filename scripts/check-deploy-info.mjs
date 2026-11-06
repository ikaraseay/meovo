#!/usr/bin/env node
/**
 * 提交守卫 —— 真实的部署信息与凭据不许进版本库。
 * ---------------------------------------------------------
 * 仓库是公开模版：`cloudflare/wrangler.jsonc` / `astro.config.mjs` 里只该有占位符，
 * 真值只在 `config.env`、Cloudflare 构建变量与 Worker secret 里。
 *
 * 但 `pnpm build` 会把 `config.env` 的真值填回那两个文件（本地工作区要能部署），
 * 一旦 `git add -A` 就会连真值一起提交。这个守卫在提交前拿 `config.env` 里的真值
 * 比对**已暂存**的内容，命中就拦下来。
 *
 * 没有 `config.env`（CI / 干净检出）时直接放行 —— 那边本来就没有真值。
 * 只查够长、够独特的值：worker 名 / 库名这种常见词会误伤。
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_ENV = join(ROOT, 'config.env')

/** 读 config.env —— 读不到（CI / 干净检出）就没什么可查的 */
function loadConfig() {
  const values = {}
  let source = ''
  try {
    source = readFileSync(CONFIG_ENV, 'utf8')
  } catch {
    return values
  }
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    values[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
  }
  return values
}

const values = loadConfig()

/** 要查的值：[名字, 值]，只保留长度 >= 12 的（短值太通用，会误伤） */
const secrets = []
for (const name of ['D1_DATABASE_ID', 'CLOUDFLARE_ACCOUNT_ID', 'SESSION_SECRET', 'ADMIN_PASSWORD_HASH']) {
  const value = values[name]
  if (value && value.length >= 12) secrets.push([name, value])
}
// 域名 —— 会写进 wrangler.jsonc 的 route 与 astro.config.mjs 的 site
const host = (values.SITE_URL ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
if (host.length >= 12) secrets.push(['SITE_URL 域名', host])

if (secrets.length === 0) process.exit(0)

/** 已暂存的文件 —— 只查将要进提交的那部分 */
let files = []
try {
  files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
} catch {
  process.exit(0)
}

const hits = []
for (const file of files) {
  // 凭据文件本身也不许提交
  if (/(^|\/)(config\.env|\.dev\.vars|\.env(\..*)?)$/.test(file)) {
    hits.push(file + '（凭据文件本身）')
    continue
  }
  // 文档文件允许包含站点域名（README、llms.txt 等是公开文档，不是配置）
  if (/(^|\/)(README|llms|llms-full)\.(md|txt)$/.test(file) || /(^|\/)llms.*\.ts$/.test(file)) {
    continue
  }
  let content = ''
  try {
    content = execFileSync('git', ['show', ':' + file], { cwd: ROOT, encoding: 'utf8' })
  } catch {
    continue
  }
  for (const [name, value] of secrets) {
    if (content.includes(value)) hits.push(file + '（含 ' + name + '）')
  }
}

if (hits.length > 0) {
  console.error('[leak] 提交里有真实的部署信息 / 凭据，已拦住：')
  for (const hit of hits) console.error('  - ' + hit)
  console.error('')
  console.error('  真值只放 config.env / Cloudflare 构建变量 / Worker secret。')
  console.error('  要提交的是占位符版本；本机真值靠 skip-worktree 留在工作区：')
  console.error('    node scripts/apply-config.mjs')
  console.error('    git update-index --skip-worktree cloudflare/wrangler.jsonc astro.config.mjs')
  process.exit(1)
}
