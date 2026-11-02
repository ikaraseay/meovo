import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fileNameFor,
  formatDate,
  renderMarkdownFile,
  yamlString,
  type DocumentRow,
} from '../backend/lib/admin/post-export.ts'

function row(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    slug: 'hello-world',
    locale: 'zh',
    title: '你好，世界',
    description: '第一篇',
    body: '正文内容',
    pub_date: '2026-11-02T03:04:05.000Z',
    updated_date: null,
    category: 'announcement',
    tags: '["astro","css"]',
    series_id: null,
    series_title: null,
    series_order: null,
    license: 'cc-by',
    created_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

test('导出：文件头是 frontmatter，正文跟在后面', () => {
  const md = renderMarkdownFile(row())
  assert.ok(md.startsWith('---\n'))
  assert.ok(md.includes('\n---\n\n正文内容'))
})

test('导出：字段写全', () => {
  const md = renderMarkdownFile(row())
  assert.ok(md.includes('title: "你好，世界"'))
  assert.ok(md.includes('description: "第一篇"'))
  assert.ok(md.includes('pubDate: 2026-11-02'))
  assert.ok(md.includes('category: "announcement"'))
  assert.ok(md.includes('tags: ["astro","css"]'))
  assert.ok(md.includes('license: "cc-by"'))
})

test('导出：没有的字段不写', () => {
  const md = renderMarkdownFile(row({ category: null, tags: '[]', updated_date: null }))
  assert.ok(!md.includes('category:'))
  assert.ok(!md.includes('tags:'))
  assert.ok(!md.includes('updatedDate:'))
})

test('导出：系列写成嵌套块', () => {
  const md = renderMarkdownFile(
    row({ series_id: 'getting-started', series_title: '从零搭一个博客', series_order: 1 }),
  )
  assert.ok(md.includes('series:\n  id: "getting-started"'))
  assert.ok(md.includes('  title: "从零搭一个博客"'))
  assert.ok(md.includes('  order: 1'))
})

test('导出：字符串里的引号与反斜杠被转义', () => {
  const md = renderMarkdownFile(row({ title: 'a "b" \\ c' }))
  assert.ok(md.includes('title: "a \\"b\\" \\\\ c"'))
})

test('导出：标题里的换行不破坏 YAML', () => {
  assert.equal(yamlString('a\nb'), '"a\\nb"')
})

test('导出：文件名就是 slug，同名不同语言即互为翻译', () => {
  assert.equal(fileNameFor(row()), 'hello-world.md')
  assert.equal(fileNameFor(row({ locale: 'en' })), 'hello-world.md')
})

test('导出：日期取 UTC 的年月日', () => {
  assert.equal(formatDate('2026-11-02T23:59:59.000Z'), '2026-11-02')
  assert.equal(formatDate(null), null)
  assert.equal(formatDate('不是日期'), null)
})

test('导出：没有发布日期就退回创建时间', () => {
  const md = renderMarkdownFile(row({ pub_date: null }))
  assert.ok(md.includes('pubDate: 2026-11-01'))
})
