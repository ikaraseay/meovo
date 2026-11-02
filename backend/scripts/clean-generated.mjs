#!/usr/bin/env node
/**
 * 清掉生成物 —— 本地不留文章与数据。
 * ---------------------------------------------------------
 * 内容在 D1 里（唯一的真身），本地这些只是构建期导出的副本：
 *   frontend/content/generated/   导出的文章 markdown
 *   frontend/i18n/overrides.ts     后台改过的文案
 *   frontend/data/projects.ts     项目
 * 清掉之后 `pnpm sync` / `pnpm build` 会重新生成。
 */
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const GENERATED = join(ROOT, 'frontend/content/generated')
const FILES = [
  join(ROOT, 'frontend/i18n/overrides.ts'),
  join(ROOT, 'frontend/data/projects.ts'),
]

let removed = 0

if (existsSync(GENERATED)) {
  for (const entry of readdirSync(GENERATED, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue
    rmSync(join(GENERATED, entry.name), { recursive: true, force: true })
    removed++
  }
}

for (const file of FILES) {
  if (!existsSync(file)) continue
  rmSync(file, { force: true })
  removed++
}

console.log(removed === 0 ? '[clean] 本来就是干净的' : '[clean] 清掉 ' + removed + ' 处生成物')
console.log('[clean] 要看内容就 pnpm sync（从 D1 拉），构建会自动重新导出')
