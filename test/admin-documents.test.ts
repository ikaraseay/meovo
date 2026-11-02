import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeDocument,
  parseTags,
  slugify,
} from '../backend/lib/admin/documents.ts'

const valid = {
  slug: 'hello-world',
  locale: 'zh',
  title: '你好，世界',
  description: '摘要',
  body: '正文',
  pubDate: '2026-11-02',
  category: 'announcement',
  tags: 'astro, css',
  license: 'cc-by',
}

test('文档：slug 规范化', () => {
  assert.equal(slugify('Hello World'), 'hello-world')
  assert.equal(slugify('  A  B  '), 'a-b')
  assert.equal(slugify('Hello, World!'), 'hello-world')
  assert.equal(slugify('中文标题'), '')
})

test('文档：标签解析 —— 逗号分隔、去空、去重、小写', () => {
  assert.deepEqual(parseTags('astro, css'), ['astro', 'css'])
  assert.deepEqual(parseTags('astro，css'), ['astro', 'css'])
  assert.deepEqual(parseTags(['Astro', 'astro']), ['astro'])
  assert.deepEqual(parseTags(''), [])
})

test('文档：合规的文档原样通过', () => {
  const result = normalizeDocument(valid)
  assert.equal(result.ok, true)
  assert.equal(result.value?.slug, 'hello-world')
  assert.equal(result.value?.locale, 'zh')
  assert.deepEqual(result.value?.tags, ['astro', 'css'])
  assert.equal(result.value?.pubDate, '2026-11-02T00:00:00.000Z')
})

test('文档：标题不能空', () => {
  const result = normalizeDocument({ ...valid, title: '  ' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('title_required'))
})

test('文档：slug 必须是 ASCII slug', () => {
  const result = normalizeDocument({ ...valid, slug: 'Hello World' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('slug_invalid'))
})

test('文档：语言只能是 zh / en', () => {
  const result = normalizeDocument({ ...valid, locale: 'fr' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('locale_invalid'))
})

test('文档：协议取值要认识', () => {
  const result = normalizeDocument({ ...valid, license: 'wtf' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('license_invalid'))
})

test('文档：分类与标签都要 ASCII slug', () => {
  assert.ok(normalizeDocument({ ...valid, category: '公告' }).errors.includes('category_invalid'))
  assert.ok(normalizeDocument({ ...valid, tags: '中文' }).errors.includes('tag_invalid'))
})

test('文档：日期坏了要报错', () => {
  assert.ok(normalizeDocument({ ...valid, pubDate: '不是日期' }).errors.includes('date_invalid'))
})

test('文档：系列要同时有 ID 与标题', () => {
  assert.ok(normalizeDocument({ ...valid, seriesId: 'x' }).errors.includes('series_invalid'))
  assert.ok(normalizeDocument({ ...valid, seriesTitle: 'x' }).errors.includes('series_invalid'))
  const ok = normalizeDocument({ ...valid, seriesId: 'x', seriesTitle: 'X', seriesOrder: 2 })
  assert.equal(ok.ok, true)
  assert.equal(ok.value?.seriesOrder, 2)
})

test('文档：系列序号要正整数', () => {
  assert.ok(normalizeDocument({ ...valid, seriesOrder: 0 }).errors.includes('series_order_invalid'))
  assert.ok(normalizeDocument({ ...valid, seriesOrder: 1.5 }).errors.includes('series_order_invalid'))
})
