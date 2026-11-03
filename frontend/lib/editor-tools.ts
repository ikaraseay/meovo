/* =========================================================
   后台编辑器的 markdown 工具栏
   ---------------------------------------------------------
   两块东西：
     · EDITOR_TOOLS —— 按钮表（label + 词典 key + 动作参数）
     · 纯文本改写函数 —— 只吃字符串与选区，返回新文本与新选区

   纯函数单独放这儿，是为了能写单测（test/editor-tools.test.ts）：
   选区算错、光标落错，肉眼很难发现。
   ========================================================= */

export type EditorToolKind = 'link' | 'image' | 'table'

export interface EditorTool {
  /** 按钮上印的字（文字类按钮） */
  label?: string
  /** 内联 SVG（图标类按钮）—— emoji 跟正文排版打架，别用 */
  icon?: string
  /** 词典 key —— 悬停提示与 aria-label 都走它 */
  title: string
  /** 包住选区的前后缀（加粗 / 斜体 / 行内代码 …） */
  before?: string
  after?: string
  /** 给整行加前缀（标题 / 引用 / 列表） */
  prefix?: string
  /** 特殊动作 */
  kind?: EditorToolKind
}

export const EDITOR_TOOLS: EditorTool[] = [
  { label: 'B', title: 'admin.editor.bold', before: '**', after: '**' },
  { label: 'I', title: 'admin.editor.italic', before: '*', after: '*' },
  { label: 'S', title: 'admin.editor.strikethrough', before: '~~', after: '~~' },
  { label: 'U', title: 'admin.editor.underline', before: '<u>', after: '</u>' },
  {
    icon: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.9"/></svg>',
    title: 'admin.editor.hoverReveal',
    before: '<span class="spoiler">',
    after: '</span>',
  },
  { label: '</>', title: 'admin.editor.inlineCode', before: '`', after: '`' },
  { label: '{ }', title: 'admin.editor.codeBlock', before: '```\n', after: '\n```' },
  { icon: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 9.4 9.4 6.6"/><path d="M7.2 4.3 8.3 3.2a2.85 2.85 0 0 1 4 4l-1.5 1.5"/><path d="M8.8 11.7 7.7 12.8a2.85 2.85 0 0 1-4-4l1.5-1.5"/></svg>', title: 'admin.editor.link', kind: 'link' },
  { icon: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.2" width="12" height="9.6" rx="1.6"/><circle cx="5.9" cy="6.6" r="1"/><path d="m2.6 11.4 2.9-2.9 2.4 2.4 2.2-2.2 3.3 3.3"/></svg>', title: 'admin.editor.image', kind: 'image' },
  { label: 'H', title: 'admin.editor.heading', prefix: '## ' },
  { label: '❝', title: 'admin.editor.quote', prefix: '> ' },
  { label: '•', title: 'admin.editor.bulletList', prefix: '- ' },
  { label: '1.', title: 'admin.editor.orderedList', prefix: '1. ' },
  { label: '▦', title: 'admin.editor.table', kind: 'table' },
]

/** 改完之后的正文与新选区 */
export interface EditResult {
  value: string
  start: number
  end: number
}

/** 包住选区；没选中就插空的标记，光标落在中间 */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
): EditResult {
  const selected = value.slice(start, end)
  return {
    value: value.slice(0, start) + before + selected + after + value.slice(end),
    start: start + before.length,
    end: start + before.length + selected.length,
  }
}

/** 给选区所在的那些行加前缀（标题 / 引用 / 列表） */
export function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
): EditResult {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', end)
  const to = lineEnd === -1 ? value.length : lineEnd
  const prefixed = value
    .slice(from, to)
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
  return {
    value: value.slice(0, from) + prefixed + value.slice(to),
    start: from,
    end: from + prefixed.length,
  }
}

/** 链接 / 图片：选区当文字，空选区就留个空壳让人接着填 */
export function insertLink(
  value: string,
  start: number,
  end: number,
  url: string,
  image: boolean,
): EditResult {
  const selected = value.slice(start, end)
  const markdown = image ? `![${selected}](${url})` : `[${selected}](${url})`
  return {
    value: value.slice(0, start) + markdown + value.slice(end),
    start: start + 1,
    end: start + 1 + selected.length,
  }
}

/** 表格：塞一个空模板，光标落在第一格 */
export function insertTable(value: string, start: number): EditResult {
  const template = '|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n'
  return {
    value: value.slice(0, start) + template + value.slice(start),
    start: start + 2,
    end: start + 2,
  }
}