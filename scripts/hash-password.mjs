#!/usr/bin/env node
/**
 * 口令哈希 —— 后台口令在 Worker secret 里存的是它的 SHA-256。
 * ---------------------------------------------------------
 * 用法：
 *   node scripts/hash-password.mjs "我的口令"                 打印哈希
 *   node scripts/hash-password.mjs "我的口令" --check <hash>  比对某个哈希
 *   node scripts/hash-password.mjs "我的口令" --set            设为线上口令
 *
 * --set 会做三件事：
 *   1. 算哈希，写进 Worker secret（ADMIN_PASSWORD_HASH）
 *   2. 把 config.env 里那份同步成一样的（本地开发的唯一事实来源）
 *   3. 刷新 cloudflare/.dev.vars（wrangler 只认配置同目录的那个）
 *
 * ⚠️ 口令本身不要进仓库 —— 只有哈希进（config.env 不入库 / Worker secret）。
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const [password, flag, expected] = process.argv.slice(2)

if (!password) {
  console.error('用法：node scripts/hash-password.mjs "口令" [--check <hash>] [--set]')
  process.exit(1)
}

const hash = createHash('sha256').update(password, 'utf8').digest('hex')

if (flag === '--check') {
  const ok = hash === String(expected ?? '').trim().toLowerCase()
  console.log(ok ? '一致 ✓' : `不一致：实际是 ${hash}`)
  process.exit(ok ? 0 : 1)
}

if (flag !== '--set') {
  console.log(hash)
  process.exit(0)
}

/* ---------- --set：线上 secret + 本地两份 ---------- */

execFileSync('pnpm', ['wrangler', 'secret', 'put', 'ADMIN_PASSWORD_HASH', '--config', 'cloudflare/wrangler.jsonc'], {
  cwd: ROOT,
  input: hash,
  stdio: ['pipe', 'inherit', 'inherit'],
})

const configEnv = join(ROOT, 'config.env')
if (existsSync(configEnv)) {
  const source = readFileSync(configEnv, 'utf8')
  const line = source.match(/^ADMIN_PASSWORD_HASH=.*$/m)
  const next = line
    ? source.replace(line[0], `ADMIN_PASSWORD_HASH="${hash}"`)
    : source.trimEnd() + `\nADMIN_PASSWORD_HASH="${hash}"\n`
  writeFileSync(configEnv, next)
  console.log('config.env 已同步')
}

const devVars = join(ROOT, 'cloudflare/.dev.vars')
if (existsSync(devVars)) {
  const source = readFileSync(devVars, 'utf8')
  const line = source.match(/^ADMIN_PASSWORD_HASH=.*$/m)
  const next = line
    ? source.replace(line[0], `ADMIN_PASSWORD_HASH=${hash}`)
    : source.trimEnd() + `\nADMIN_PASSWORD_HASH=${hash}\n`
  writeFileSync(devVars, next)
  console.log('cloudflare/.dev.vars 已同步')
}

console.log('线上口令已设为：', password)
console.log('哈希：', hash)
