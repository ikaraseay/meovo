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

const env = loadEnv()
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
    ? '[apply] 已把 config.env / 环境变量的真值填回 wrangler.jsonc / astro.config.mjs'
    : '[apply] 没有可填的真值 —— 沿用配置文件里已有的值（CI 干净检出就是这种）',
)
