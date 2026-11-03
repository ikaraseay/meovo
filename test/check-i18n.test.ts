/**
 * i18n 闸门 —— 它自己也得有回归测试。
 * ---------------------------------------------------------
 * 曾经的坑：剥注释用的 /\/.*$/ 把 https:// 之后整行吃掉，
 * 于是「带链接的行上的界面文案」一律隐形（备案号就是这么漏过去的）。
 *
 * 做法：在临时目录里摆一个仓库的样子（检查器 + 词典 + 夹具），
 * 跑一遍看它报不报 —— 仓库自己不受影响。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** 临时目录放在 .scratch/ 下（不入库） */
const SCRATCH = join(ROOT, '.scratch')

/** 摆一个临时仓库跑一遍检查器 */
function check(files: Record<string, string>): { status: number | null; output: string } {
  mkdirSync(SCRATCH, { recursive: true })
  const dir = mkdtempSync(join(SCRATCH, 'check-i18n-'))
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    mkdirSync(join(dir, 'frontend/i18n'), { recursive: true })
    mkdirSync(join(dir, 'frontend/components'), { recursive: true })
    mkdirSync(join(dir, 'config'), { recursive: true })
    copyFileSync(join(ROOT, 'scripts/check-i18n.py'), join(dir, 'scripts/check-i18n.py'))
    copyFileSync(join(ROOT, 'frontend/i18n/ui.ts'), join(dir, 'frontend/i18n/ui.ts'))
    copyFileSync(join(ROOT, 'config/site.json'), join(dir, 'config/site.json'))
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, 'frontend/components', name), content)
    }
    const result = spawnSync('python3', [join(dir, 'scripts/check-i18n.py')], { encoding: 'utf8' })
    return { status: result.status, output: (result.stdout ?? '') + (result.stderr ?? '') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('i18n 闸门：带 URL 的行上的中文要报出来', () => {
  const { status, output } = check({
    'fixture.astro':
      '<a href="https://icp.gov.moe/?keyword=12345678" target="_blank">示例ICP备12345678号</a>\n',
  })
  assert.equal(status, 1, output)
  assert.match(output, /fixture\.astro/)
  assert.match(output, /ICP备/)
})

test('i18n 闸门：正常组件不误报', () => {
  const { status, output } = check({
    'fixture.astro': '<a href="https://example.com/docs">Docs</a>\n',
  })
  assert.equal(status, 0, output)
})
