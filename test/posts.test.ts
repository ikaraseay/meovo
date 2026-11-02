import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getPostLocale,
  getPostSlug,
  getTranslationKey,
  isPublished,
  resolveForLocale,
  type Post,
} from '../frontend/lib/post-identity.ts'
import {
  getAllCategories,
  getAllTags,
  getAdjacentPosts,
  getSeriesEntries,
  groupByTranslation,
  resolveItems,
  sortSeriesItems,
  type PostItem,
} from '../frontend/lib/content-queries.ts'
import { readingTime } from '../frontend/lib/reading-time.ts'

interface FakePost {
  id: string
  title?: string
  draft?: boolean
  pubDate?: Date
  tags?: string[]
  category?: string
  series?: { id: string; title: string; order?: number }
}

function makePost(partial: FakePost): Post {
  return {
    id: partial.id,
    collection: 'blog',
    data: {
      title: partial.title ?? partial.id,
      description: '',
      pubDate: partial.pubDate ?? new Date('2026-01-01T00:00:00Z'),
      draft: partial.draft ?? false,
      category: partial.category,
      tags: partial.tags ?? [],
      series: partial.series,
    },
  } as unknown as Post
}

function item(post: Post, href = ''): PostItem {
  return { post, isFallback: false, href }
}

test('身份：id 拆成语言 + slug，翻译键是 slug', () => {
  const post = makePost({ id: 'zh/hello-world' })
  assert.equal(getPostLocale(post), 'zh')
  assert.equal(getPostSlug(post), 'hello-world')
  assert.equal(getTranslationKey(post), 'hello-world')
})

test('isPublished：草稿、未到时间都不发布', () => {
  const now = new Date('2026-06-01T00:00:00Z')
  assert.equal(isPublished(makePost({ id: 'zh/a' }), now), true)
  assert.equal(isPublished(makePost({ id: 'zh/a', draft: true }), now), false)
  assert.equal(isPublished(makePost({ id: 'zh/a', pubDate: new Date('2026-12-01') }), now), false)
})

test('resolveForLocale：本语言 → 默认语言 → 任意版本', () => {
  const zh = makePost({ id: 'zh/a' })
  const en = makePost({ id: 'en/a' })
  assert.equal(resolveForLocale([zh, en], 'en'), en)
  assert.equal(resolveForLocale([zh, en], 'zh'), zh)
  assert.equal(resolveForLocale([en], 'zh'), en) // 只有英文版，中文用英文顶上
  assert.equal(resolveForLocale([], 'zh'), undefined)
})

test('groupByTranslation：同名 slug 归一组', () => {
  const groups = groupByTranslation([
    makePost({ id: 'zh/a' }),
    makePost({ id: 'en/a' }),
    makePost({ id: 'zh/b' }),
  ])
  assert.equal(groups.size, 2)
  assert.equal(groups.get('a')!.length, 2)
  assert.equal(groups.get('b')!.length, 1)
})

test('resolveItems：缺翻译标记 isFallback，href 指向当前语言', () => {
  const items = resolveItems(
    [makePost({ id: 'zh/a' }), makePost({ id: 'en/a' }), makePost({ id: 'en/b' })],
    'zh',
  )
  const bySlug = new Map(items.map((it) => [getPostSlug(it.post), it]))
  assert.equal(bySlug.get('a')!.isFallback, false)
  assert.equal(bySlug.get('a')!.href, '/zh/posts/a/')
  assert.equal(bySlug.get('b')!.isFallback, true)
})

test('getAdjacentPosts：上一篇更早、下一篇更晚', () => {
  const items = [
    item(makePost({ id: 'zh/new', title: 'New', pubDate: new Date('2026-03-01') })),
    item(makePost({ id: 'zh/mid', title: 'Mid', pubDate: new Date('2026-02-01') })),
    item(makePost({ id: 'zh/old', title: 'Old', pubDate: new Date('2026-01-01') })),
  ]
  const { prev, next } = getAdjacentPosts(items, 'mid')
  assert.equal(prev!.title, 'Old')
  assert.equal(next!.title, 'New')
  assert.deepEqual(getAdjacentPosts(items, 'nope'), {})
})

test('getSeriesEntries：按 id 归并，当前语言标题优先', () => {
  const items = [
    item(makePost({ id: 'en/s1', series: { id: 'x', title: 'X (en)', order: 1 } })),
    item(makePost({ id: 'zh/s2', series: { id: 'x', title: 'X (zh)', order: 2 } })),
    item(makePost({ id: 'zh/s3', series: { id: 'y', title: 'Y' } })),
  ]
  const entries = getSeriesEntries(items, 'zh')
  const x = entries.find((e) => e.id === 'x')!
  assert.equal(x.count, 2)
  assert.equal(x.title, 'X (zh)')
})

test('sortSeriesItems：先按 order，没写的排最后', () => {
  const items = [
    item(makePost({ id: 'zh/a', pubDate: new Date('2026-01-01'), series: { id: 'x', title: 'X', order: 2 } })),
    item(makePost({ id: 'zh/b', pubDate: new Date('2026-02-01'), series: { id: 'x', title: 'X', order: 1 } })),
    item(makePost({ id: 'zh/c', pubDate: new Date('2026-03-01'), series: { id: 'x', title: 'X' } })),
  ]
  assert.deepEqual(
    sortSeriesItems(items).map((it) => getPostSlug(it.post)),
    ['b', 'a', 'c'],
  )
})

test('getAllTags / getAllCategories 去重排序', () => {
  const tags = getAllTags([
    makePost({ id: 'zh/a', tags: ['css', 'astro'] }),
    makePost({ id: 'zh/b', tags: ['css'] }),
  ])
  assert.deepEqual(tags.sort(), ['astro', 'css'])

  const cats = getAllCategories([
    makePost({ id: 'zh/a', category: 'design' }),
    makePost({ id: 'zh/b', category: 'design' }),
  ])
  assert.deepEqual(cats, ['design'])
})

test('readingTime：中文按字数、英文按词数，至少 1 分钟', () => {
  assert.equal(readingTime('字'.repeat(400), 'zh'), 1)
  assert.equal(readingTime('字'.repeat(800), 'zh'), 2)
  assert.equal(
    readingTime(Array.from({ length: 200 }, () => 'word').join(' '), 'en'),
    1,
  )
  assert.equal(readingTime('', 'zh'), 1)
})

test('readingTime：代码块不计入正文', () => {
  const withCode = '```js\nconst x = 1\n```\n' + '字'.repeat(400)
  assert.equal(readingTime(withCode, 'zh'), 1)
})
