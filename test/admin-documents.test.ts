import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkRequired,
  deriveSlug,
  isSlug,
  normalizeDocument,
  parseTags,
  slugify,
  todayDate,
  uniqueSlug,
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

test('文档：标签按逗号拆、空格折连字符、去重', () => {
  // 后台是「一颗颗加」，但接口照样得接得住一串
  const result = normalizeDocument({ ...valid, tags: 'Astro Blog, css，astro blog' })
  assert.deepEqual(result.value?.tags, ['astro-blog', 'css'])
})

test('文档：日期坏了要报错', () => {
  assert.ok(normalizeDocument({ ...valid, pubDate: '不是日期' }).errors.includes('date_invalid'))
})

test('文档：系列 id 由标题派生 —— 作者不用手填', () => {
  // 只有 id 没有标题 = 一半的输入
  assert.ok(normalizeDocument({ ...valid, seriesId: 'x' }).errors.includes('series_invalid'))

  // 英文标题直接取 slug
  assert.equal(
    normalizeDocument({ ...valid, seriesTitle: 'Docker Notes' }).value?.seriesId,
    'docker-notes',
  )

  // 中文标题没有 ASCII 可取 —— 用稳定短码，同一个标题永远同一个 id
  const zh = normalizeDocument({ ...valid, seriesTitle: 'Docker 入门' }).value?.seriesId ?? ''
  assert.match(zh, /^series-[a-z0-9]+$/)
  assert.equal(
    normalizeDocument({ ...valid, seriesTitle: 'Docker 入门' }).value?.seriesId,
    zh,
    '同一个标题派生两次必须一致，否则系列页地址会漂',
  )
  // 中文标题 slugify 后只剩零碎英文 —— 不能让两个不同的系列撞成一个 id
  assert.notEqual(
    normalizeDocument({ ...valid, seriesTitle: 'Docker 进阶' }).value?.seriesId,
    zh,
    '「Docker 入门」与「Docker 进阶」不能派生出同一个 id',
  )

  const ok = normalizeDocument({ ...valid, seriesTitle: 'X', seriesOrder: 2 })
  assert.equal(ok.ok, true)
  assert.equal(ok.value?.seriesOrder, 2)
})

test('文档：slug 可以不给 —— 服务端按标题派生', () => {
  const result = normalizeDocument({ ...valid, slug: '' })
  assert.equal(result.ok, true)
  assert.equal(result.value?.slug, '')
})

test('文档：slug 派生 —— 第一个能变成 ASCII 的标题说了算', () => {
  assert.equal(deriveSlug(['Hello World']), 'hello-world')
  // 中文标题里没有 ASCII，英文标题才有
  assert.equal(deriveSlug(['中文标题', 'Hello World']), 'hello-world')
  assert.equal(deriveSlug(['Hello World', '中文标题']), 'hello-world')
})

test('文档：slug 派生 —— 一个 ASCII 都没有就兜底成日期 + 短码', () => {
  const slug = deriveSlug(['中文标题'], 'ab12')
  assert.match(slug, /^post-\d{8}-ab12$/)
})

test('文档：slug 唯一化 —— 撞了就加数字后缀', () => {
  assert.equal(uniqueSlug('hello-world', []), 'hello-world')
  assert.equal(uniqueSlug('hello-world', ['hello-world']), 'hello-world-2')
  assert.equal(uniqueSlug('hello-world', ['hello-world', 'hello-world-2']), 'hello-world-3')
})

test('文档：必填项 —— 有内容却没标题就是漏填', () => {
  assert.equal(checkRequired({ title: '标题', description: '', body: '' }), null)
  assert.equal(checkRequired({ title: '', description: '摘要', body: '' }), 'title_required')
  assert.equal(checkRequired({ title: '', description: '', body: '正文' }), 'title_required')
  // 整版都空不算漏填 —— 另一种语言还没写，很正常
  assert.equal(checkRequired({ title: '', description: '', body: '' }), null)
})

test('文档：像样的 slug 与今天的日期', () => {
  assert.equal(isSlug('hello-world'), true)
  assert.equal(isSlug('Hello-World'), true)
  // slug 里不许有空格 —— 大写与空格都会在规范化时被改掉
  assert.equal(isSlug('Hello World'), false)
  assert.equal(isSlug('中文'), false)
  assert.match(todayDate(new Date('2026-11-19T12:00:00Z')), /^\d{4}-\d{2}-\d{2}$/)
})


test('文档：系列序号要正整数', () => {
  assert.ok(normalizeDocument({ ...valid, seriesOrder: 0 }).errors.includes('series_order_invalid'))
  assert.ok(normalizeDocument({ ...valid, seriesOrder: 1.5 }).errors.includes('series_order_invalid'))
})
