import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts/ops.sh')
const TMP = join(ROOT, '.scratch/tmp/ops-test')

/** 跑 ops.sh —— 返回退出码与两路输出，别让它抛 */
function run(args: string[], configFile: string) {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, CONFIG_FILE: configFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, stdout, stderr: '' }
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status, stdout: e.stdout, stderr: e.stderr }
  }
}

/** 一份配齐了配置的临时 env 文件 */
function writeConfig(body: string): string {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  const file = join(TMP, 'config.env')
  writeFileSync(
    file,
    [
      'SITE_URL="https://example.com"',
      'WORKER_NAME="meovo"',
      'D1_DATABASE_NAME="meovo-content"',
      'D1_DATABASE_ID="11111111-2222-3333-4444-555555555555"',
      'R2_BUCKET_NAME="meovo-media"',
      'CLOUDFLARE_ACCOUNT_ID="' + 'a'.repeat(32) + '"',
      body,
    ].join('\n') + '\n',
  )
  return file
}

test('ops.sh 语法正确', () => {
  execFileSync('bash', ['-n', SCRIPT], { stdio: 'pipe' })
})

test('config check：配齐了就没问题', () => {
  const result = run(['config', 'check'], writeConfig(''))
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /配置看起来没问题/)
})

test('config check：占位的 D1 id 会被标出来', () => {
  // 造一份占位配置，验证占位 id 会被标出来
  const file = join(TMP, 'placeholder.env')
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  writeFileSync(
    file,
    [
      'SITE_URL="https://example.com"',
      'WORKER_NAME="blog"',
      'D1_DATABASE_NAME="meovo-content"',
      'D1_DATABASE_ID="00000000-0000-0000-0000-000000000000"',
      'R2_BUCKET_NAME="meovo-media"',
      'CLOUDFLARE_ACCOUNT_ID="' + 'a'.repeat(32) + '"',
    ].join('\n') + '\n',
  )
  const result = run(['config', 'check'], file)
  assert.equal(result.code, 1)
  assert.match(result.stderr, /D1_DATABASE_ID/)
})

test('config show 不回显 secret 的值', () => {
  const file = writeConfig('ADMIN_PASSWORD_HASH="deadbeef"')
  const result = run(['config', 'show'], file)
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /ADMIN_PASSWORD_HASH=\*\*\*/)
  assert.doesNotMatch(result.stdout, /deadbeef/)
})

test('config set / get / unset 走一个来回', () => {
  const file = writeConfig('')
  assert.equal(run(['config', 'set', 'TEST_KEY', 'a value'], file).code, 0)
  const got = run(['config', 'get', 'TEST_KEY'], file)
  assert.equal(got.code, 0, got.stderr)
  assert.equal(got.stdout.trim(), 'TEST_KEY=a value')
  assert.equal(run(['config', 'unset', 'TEST_KEY'], file).code, 0)
  const gone = run(['config', 'get', 'TEST_KEY'], file)
  assert.equal(gone.stdout.trim(), 'TEST_KEY=')
})
