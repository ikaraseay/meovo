import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 生成的数据目录不在 git 里（projects.ts / links.ts / article-summaries.ts 都 gitignored）——
 * 干净克隆、CI、构建机上压根没有 frontend/data/。
 * 导出脚本不自己建目录的话就是 ENOENT 崩掉：本地 pretest 挂、部署构建直接失败。
 */
test('导出脚本：干净克隆里也能把生成物写出来（目录自己建）', () => {
  const repo = mkdtempSync(join(tmpdir(), 'meovo-export-'))
  // 只搬导出脚本要用的那几个文件（脚本的 ROOT = 它自己所在仓库的根）
  cpSync(join(ROOT, 'backend'), join(repo, 'backend'), { recursive: true })
  cpSync(join(ROOT, 'frontend/lib'), join(repo, 'frontend/lib'), { recursive: true })
  mkdirSync(join(repo, 'frontend/i18n'), { recursive: true })
  assert.equal(existsSync(join(repo, 'frontend/data')), false, '前提：干净克隆里没有 frontend/data')

  execFileSync('node', [join(repo, 'backend/scripts/export-d1-posts.mjs'), '--ensure'], {
    cwd: repo,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  for (const file of ['projects.ts', 'links.ts', 'article-summaries.ts']) {
    assert.ok(existsSync(join(repo, 'frontend/data', file)), '没写出 frontend/data/' + file)
  }
  assert.ok(existsSync(join(repo, 'frontend/i18n/overrides.ts')), '没写出 frontend/i18n/overrides.ts')
})

test('导出脚本：WORKERS_CI 构建环境下仍会导出项目与友链，且不跑本地 D1 同步', () => {
  const repo = mkdtempSync(join(tmpdir(), 'meovo-export-ci-'))
  cpSync(join(ROOT, 'backend'), join(repo, 'backend'), { recursive: true })
  cpSync(join(ROOT, 'frontend/lib'), join(repo, 'frontend/lib'), { recursive: true })
  mkdirSync(join(repo, 'frontend/i18n'), { recursive: true })
  mkdirSync(join(repo, 'frontend/content/generated'), { recursive: true })
  mkdirSync(join(repo, 'frontend/content/blog'), { recursive: true })
  mkdirSync(join(repo, 'node_modules/.bin'), { recursive: true })

  const wranglerStub = join(repo, 'node_modules/.bin/wrangler')
  writeFileSync(
    wranglerStub,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('--local')) {
  console.error('unexpected --local call in WORKERS_CI')
  process.exit(2)
}
const sql = args[args.indexOf('--command') + 1] ?? ''
let results = []
if (sql.includes('FROM projects')) {
  results = [{
    id: 'proj-1',
    name: 'wofuf-edge',
    description: 'Minecraft server viewer',
    url: 'https://github.com/ikaraseay/Wofuf-edge',
    sort_order: 0,
    created_at: '2026-11-01T00:00:00.000Z',
  }]
} else if (sql.includes('FROM friend_links')) {
  results = [{
    id: 'link-1',
    name: 'Example',
    url: 'https://example.com',
    avatar: '',
    description: 'Friend',
    sort_order: 0,
    created_at: '2026-11-01T00:00:00.000Z',
  }]
}
process.stdout.write(JSON.stringify([{ success: true, results }]))
`,
    'utf8',
  )
  chmodSync(wranglerStub, 0o755)

  execFileSync('node', [join(repo, 'backend/scripts/export-d1-posts.mjs')], {
    cwd: repo,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      WORKERS_CI: '1',
    },
  })

  const projectsSource = readFileSync(join(repo, 'frontend/data/projects.ts'), 'utf8')
  assert.match(projectsSource, /"name": "wofuf-edge"/)
  assert.match(projectsSource, /"url": "https:\/\/github\.com\/ikaraseay\/Wofuf-edge"/)

  const linksSource = readFileSync(join(repo, 'frontend/data/links.ts'), 'utf8')
  assert.match(linksSource, /"name": "Example"/)
})
