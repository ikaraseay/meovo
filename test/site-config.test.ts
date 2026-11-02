/**
 * config/site.json —— 站点常用文字的配置文件。
 *
 * 它是**默认值**的源头：词典 → site.json → 后台改的覆盖值，后者盖前者。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import siteConfig from '../config/site.json' with { type: 'json' }
import { allText } from '../frontend/i18n/ui.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('站点配置：每条都有中英两种文案', () => {
  for (const [key, value] of Object.entries(siteConfig)) {
    assert.ok(value.zh.trim(), `${key} 缺中文`)
    assert.ok(value.en.trim(), `${key} 缺英文`)
  }
})

test('站点配置：条目都在词典里（键名是 i18n key）', () => {
  for (const key of Object.keys(siteConfig)) {
    assert.ok(key in allText, `${key} 不在词典里`)
  }
})

test('站点配置：盖过词典（配置文件是常用文字的源头）', () => {
  for (const [key, value] of Object.entries(siteConfig)) {
    assert.equal(allText[key].zh, value.zh, `${key} 的中文没生效`)
    assert.equal(allText[key].en, value.en, `${key} 的英文没生效`)
  }
})

test('站点配置：文件在仓库里（不是 gitignore 的本地文件）', () => {
  const ignored = readFileSync(join(ROOT, '.gitignore'), 'utf8')
  assert.doesNotMatch(ignored, /^config\/site\.json$/m)
})
