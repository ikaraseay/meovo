import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs'
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
