#!/usr/bin/env node
/**
 * 把 config.env 里的真值铺回配置文件。
 * ---------------------------------------------------------
 * 仓库里 `cloudflare/wrangler.jsonc` 与 `astro.config.mjs` 放的是**占位符**
 * （模版不该带某个人的部署信息）。真值在 config.env（不入库）——
 * 这个脚本在构建前把它们填回去，于是：
 *   · 部署用的是你自己的库 / 域名
 *   · 仓库里始终只有模版
 *
 * 幂等：值没变就不动文件。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_ENV = join(ROOT, 'config.env')
const WRANGLER = join(ROOT, 'cloudflare/wrangler.jsonc')
const ASTRO = join(ROOT, 'astro.config.mjs')

/** 读 config.env（没有就用环境变量兜底） */
function loadEnv() {
  const values = {}
  try {
    for (const line of readFileSync(CONFIG_ENV, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      values[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
    }
  } catch {
    // 没有 config.env —— 用进程里的环境变量
  }
  for (const key of ['SITE_URL', 'D1_DATABASE_ID', 'D1_DATABASE_NAME', 'R2_BUCKET_NAME', 'WORKER_NAME']) {
    if (!values[key] && process.env[key]) values[key] = process.env[key]
  }
  return values
}

/**
 * Workers Builds 的干净检出里没有 config.env。
 * 用构建注入的 WORKERS_CI_BUILD_UUID 反查：构建 → Worker 脚本 → 绑定 / 域名。
 * 全程只用构建 Token，不需要在 Dashboard 手工配置任何变量。
 */
async function resolveFromBuild() {
  if (process.env.WORKERS_CI !== '1') return {}
  const token = process.env.CLOUDFLARE_API_TOKEN
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const build = process.env.WORKERS_CI_BUILD_UUID
  if (!token || !account || !build) return {}

  const api = async (path) => {
    const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
      headers: { authorization: 'Bearer ' + token },
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) {
      throw new Error(path + ' → HTTP ' + response.status)
    }
    return payload.result
  }

  const buildInfo = await api('/accounts/' + account + '/builds/builds/' + build)
  const scriptTag = buildInfo?.trigger?.external_script_id
  if (!scriptTag) return {}

  const scripts = await api('/accounts/' + account + '/workers/scripts')
  const script = (scripts ?? []).find((item) => item.tag === scriptTag)
  if (!script?.id) return {}

  const settings = await api('/accounts/' + account + '/workers/scripts/' + script.id + '/settings')
  const bindings = settings?.bindings ?? []
  const d1 = bindings.find((item) => item.type === 'd1' && item.name === 'DB')
  const r2 = bindings.find((item) => item.type === 'r2_bucket' && item.name === 'MEDIA')

  let databaseName = ''
  if (d1?.database_id) {
    try {
      databaseName = (await api('/accounts/' + account + '/d1/database/' + d1.database_id))?.name ?? ''
    } catch {
      // 名字只用于配置回写，拿不到就沿用占位符
    }
  }

  let site = ''
  try {
    const domains = await api('/accounts/' + account + '/workers/domains')
    const domain = (domains ?? []).find(
      (item) => item.service === script.id && item.environment === 'production',
    )
    if (domain?.hostname) site = 'https://' + domain.hostname
  } catch {
    // 域名拿不到时保持占位符，构建会因 canonical 不对而显眼地坏掉
  }

  return {
    WORKER_NAME: script.id,
    D1_DATABASE_ID: d1?.database_id ?? '',
    D1_DATABASE_NAME: databaseName,
    R2_BUCKET_NAME: r2?.bucket_name ?? '',
    SITE_URL: site,
  }
}

const env = loadEnv()
const REQUIRED_KEYS = ['SITE_URL', 'WORKER_NAME', 'D1_DATABASE_ID', 'D1_DATABASE_NAME', 'R2_BUCKET_NAME']
if (REQUIRED_KEYS.some((key) => !env[key])) {
  try {
    const resolved = await resolveFromBuild()
    for (const key of REQUIRED_KEYS) {
      if (!env[key] && resolved[key]) env[key] = resolved[key]
    }
    if (resolved.SITE_URL) console.log('[apply] 已从 Cloudflare 构建上下文解析部署标识')
  } catch (error) {
    console.warn('[apply] 构建上下文解析失败：' + error.message)
  }
}
const host = (env.SITE_URL ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')

/**
 * 替换若干处 —— [匹配, 真值]。
 * 真值为空就**跳过**（别把已有的值抹成空）。
 */
function patch(file, edits) {
  let source = readFileSync(file, 'utf8')
  let changed = false
  for (const [pattern, value] of edits) {
    if (!value) continue
    const next = source.replace(pattern, value)
    if (next !== source) {
      source = next
      changed = true
    }
  }
  if (changed) writeFileSync(file, source, 'utf8')
  return changed
}

let touched = false

/**
 * ⚠️ 只有「真有值」才生成替换项。
 * 之前是把模板串先拼好再交给 patch —— 没 config.env 时拼出来是字面量
 * `"database_id": "undefined"` / `site: 'undefined'`，CI 干净检出会直接把配置写坏
 * （astro build 报 Invalid URL）。空值必须跳过，保持仓库里已提交的值。
 */
const wranglerEdits = []
if (env.WORKER_NAME) {
  wranglerEdits.push([/"name":\s*"[^"]*"/, `"name": "${env.WORKER_NAME}"`])
}
if (env.D1_DATABASE_ID) {
  wranglerEdits.push([/"database_id":\s*"[^"]*"/, `"database_id": "${env.D1_DATABASE_ID}"`])
}
if (env.D1_DATABASE_NAME) {
  wranglerEdits.push([/"database_name":\s*"[^"]*"/, `"database_name": "${env.D1_DATABASE_NAME}"`])
}
if (env.R2_BUCKET_NAME) {
  wranglerEdits.push([/"bucket_name":\s*"[^"]*"/, `"bucket_name": "${env.R2_BUCKET_NAME}"`])
}
if (host) wranglerEdits.push([/"pattern":\s*"[^"]*"/, `"pattern": "${host}"`])
touched = patch(WRANGLER, wranglerEdits)

const astroEdits = []
if (env.SITE_URL) astroEdits.push([/(site:\s*')[^']*(')/, `$1${env.SITE_URL}$2`])
touched = patch(ASTRO, astroEdits) || touched

console.log(
  touched
    ? '[apply] 已把部署标识填回 wrangler.jsonc / astro.config.mjs'
    : '[apply] 没有可填的部署标识 —— 沿用配置文件里已有的值',
)
