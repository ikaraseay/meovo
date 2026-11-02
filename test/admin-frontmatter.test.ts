import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFrontmatter } from '../backend/lib/admin/frontmatter.ts'

const source = [
  '---',
  "title: '你好，世界'",
  "description: '第一篇'",
  'pubDate: 2026-10-31',
  "category: 'announcement'",
  "tags: ['astro', 'css']",
  "license: 'cc-by'",
  'series:',
  "  id: 'getting-started'",
  "  title: '从零搭一个博客'",
  '  order: 1',
  '---',
  '',
  '正文第一段。',
  '',
  '## 小标题',
  '',
  '正文第二段。',
].join('\n')

test('frontmatter：字段与正文分开', () => {
  const parsed = parseFrontmatter(source)
  assert.equal(parsed.fields.title, '你好，世界')
  assert.equal(parsed.fields.description, '第一篇')
  assert.equal(parsed.fields.pubDate, '2026-10-31')
  assert.equal(parsed.fields.category, 'announcement')
  assert.equal(parsed.fields.license, 'cc-by')
  assert.ok(parsed.body.startsWith('正文第一段。'))
  assert.ok(parsed.body.includes('## 小标题'))
})

test('frontmatter：数组与嵌套块', () => {
  const parsed = parseFrontmatter(source)
  assert.deepEqual(parsed.fields.tags, ['astro', 'css'])
  assert.deepEqual(parsed.fields.series, {
    id: 'getting-started',
    title: '从零搭一个博客',
    order: '1',
  })
})

test('frontmatter：没有 frontmatter 就整篇当正文', () => {
  const parsed = parseFrontmatter('就是正文\n\n第二段')
  assert.deepEqual(parsed.fields, {})
  assert.equal(parsed.body, '就是正文\n\n第二段')
})

test('frontmatter：frontmatter 没闭合就当没有', () => {
  const parsed = parseFrontmatter('---\ntitle: x\n\n正文')
  assert.deepEqual(parsed.fields, {})
})
