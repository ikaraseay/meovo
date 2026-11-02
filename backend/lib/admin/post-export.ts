/**
 * D1 行 → markdown 文件（纯函数）。
 * ---------------------------------------------------------
 * 构建期把后台发布的文档导成 md，扔进 frontend/content/generated/，
 * 内容集合照常收 —— 于是 sitemap / RSS / 搜索索引 / SEO 校验全都不用改。
 *
 * frontmatter 用最小安全 YAML：字符串一律双引号并转义，
 * 标签用 JSON 数组（JSON 是合法的 YAML 流式序列），日期写 YYYY-MM-DD。
 */

/** D1 documents 表的一行 */
export interface DocumentRow {
  slug: string
  locale: string
  title: string
  description: string
  body: string
  pub_date: string | null
  updated_date: string | null
  category: string | null
  /** JSON 数组字符串 */
  tags: string
  series_id: string | null
  series_title: string | null
  series_order: number | null
  license: string
  created_at: string
}

/** YAML 双引号字符串 */
export function yamlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
  return '"' + escaped + '"'
}

/** ISO 时间 → YYYY-MM-DD（取 UTC 日期，跟手写文章的写法一致） */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/** 文件名：slug 就是文件名 —— 同名不同语言即互为翻译 */
export function fileNameFor(row: DocumentRow): string {
  return row.slug + '.md'
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** 一行 D1 → 一个 markdown 文件的完整内容 */
export function renderMarkdownFile(row: DocumentRow): string {
  const lines: string[] = ['---']
  lines.push('title: ' + yamlString(row.title))
  lines.push('description: ' + yamlString(row.description ?? ''))

  const pubDate = formatDate(row.pub_date) ?? formatDate(row.created_at)
  if (pubDate) lines.push('pubDate: ' + pubDate)

  const updatedDate = formatDate(row.updated_date)
  if (updatedDate) lines.push('updatedDate: ' + updatedDate)

  if (row.category) lines.push('category: ' + yamlString(row.category))

  const tags = parseTags(row.tags)
  if (tags.length > 0) lines.push('tags: ' + JSON.stringify(tags))

  lines.push('license: ' + yamlString(row.license || 'cc-by'))

  if (row.series_id && row.series_title) {
    lines.push('series:')
    lines.push('  id: ' + yamlString(row.series_id))
    lines.push('  title: ' + yamlString(row.series_title))
    if (row.series_order != null) lines.push('  order: ' + String(row.series_order))
  }

  lines.push('---')
  lines.push('')
  lines.push((row.body ?? '').trim())
  lines.push('')

  return lines.join('\n')
}
