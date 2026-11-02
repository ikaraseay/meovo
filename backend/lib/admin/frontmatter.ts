/**
 * frontmatter 子集解析 —— 导入 .md 文件时用（纯函数）。
 * ---------------------------------------------------------
 * 只认站点自己那几个字段，不做通用 YAML：
 * 站点里的 frontmatter 长这样（见 frontend/content/blog/*）：
 *
 *   title: '你好，世界'
 *   tags: ['astro']
 *   series:
 *     id: 'getting-started'
 *     title: '从零搭一个博客'
 *     order: 1
 *
 * 通用 YAML 的坑太多（锚点、多行、折叠），自己解析反而稳。
 */

export type FrontmatterValue = string | string[] | Record<string, string>

export interface ParsedMarkdown {
  fields: Record<string, FrontmatterValue>
  body: string
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** '[a, b]' → ['a', 'b']；不是数组就当字符串 */
function parseValue(raw: string): FrontmatterValue {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item))
      .filter((item) => item !== '')
  }
  return unquote(value)
}

/** 解析 .md 文件：frontmatter 字段 + 正文 */
export function parseFrontmatter(text: string): ParsedMarkdown {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  if (lines[0]?.trim() !== '---') {
    return { fields: {}, body: normalized.trim() }
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end === -1) {
    return { fields: {}, body: normalized.trim() }
  }

  const fields: Record<string, FrontmatterValue> = {}
  let currentKey: string | null = null
  let currentNested: Record<string, string> | null = null

  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue

    if (/^\s/.test(line)) {
      // 缩进行属于上一个键（series 这种嵌套块）
      if (currentKey && currentNested) {
        const match = line.trim().match(/^([\w-]+):\s*(.*)$/)
        if (match) currentNested[match[1]] = unquote(match[2])
      }
      continue
    }

    // 新键开始 —— 上一段嵌套块收尾
    if (currentKey && currentNested) {
      fields[currentKey] = currentNested
      currentNested = null
    }

    const match = line.match(/^([\w-]+):\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match

    if (rawValue.trim() === '') {
      currentKey = key
      currentNested = {}
      continue
    }

    fields[key] = parseValue(rawValue)
    currentKey = key
  }

  if (currentKey && currentNested && Object.keys(currentNested).length > 0) {
    fields[currentKey] = currentNested
  }

  return { fields, body: lines.slice(end + 1).join('\n').trim() }
}
