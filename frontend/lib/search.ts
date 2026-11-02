/**
 * 站内搜索 —— 切分、匹配与高亮。
 *
 * **为什么要自己切分**：连续的汉字在默认分词器里是一个 token，
 * 搜「折射」命中不了「液态玻璃的折射效果」。所以索引与查询用同一套规则：
 * 中文逐字拆开、拉丁词整体保留。
 *
 * 切分规则只有一处（`segmentText`），索引与查询共用 —— 两边不一致就搜不到。
 */

/** CJK 统一表意文字（含扩展 A 与兼容区） */
const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

/** 字母或数字 —— 拉丁词的组成字符 */
const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * 把文本切成「空格分隔的 token 流」。
 *
 * - 中文逐字拆开（"液态玻璃" → "液 态 玻 璃"）
 * - 拉丁词整体保留并转小写（"Cloudflare Workers" → "cloudflare workers"）
 * - 其余字符（标点、空白）当分隔符丢掉
 */
export function segmentText(text: string): string {
  const tokens: string[] = []
  let buffer = ''

  const flush = () => {
    if (buffer) {
      tokens.push(buffer.toLowerCase())
      buffer = ''
    }
  }

  for (const char of text) {
    if (CJK.test(char)) {
      flush()
      tokens.push(char)
    } else if (WORD_CHAR.test(char)) {
      buffer += char
    } else {
      flush()
    }
  }
  flush()

  return tokens.join(' ')
}

/**
 * 把用户输入切成「词组」—— 每组必须作为一个整体匹配。
 *
 * 连续的中文算一组（"液态玻璃"），连续的拉丁字母算一组（"cloudflare"）。
 * 组之间是 AND 关系："液态玻璃 折射" 要两个都命中。
 */
export function segmentQuery(query: string): string[] {
  const groups: string[] = []
  let cjk = ''
  let word = ''

  const flushWord = () => {
    if (word) {
      groups.push(word.toLowerCase())
      word = ''
    }
  }
  const flushCjk = () => {
    if (cjk) {
      groups.push(cjk)
      cjk = ''
    }
  }

  for (const char of query) {
    if (CJK.test(char)) {
      flushWord()
      cjk += char
    } else if (WORD_CHAR.test(char)) {
      flushCjk()
      word += char
    } else {
      // 标点与空白：两种组都断开
      flushWord()
      flushCjk()
    }
  }
  flushWord()
  flushCjk()

  return groups
}

/** 一个查询词组：原文形式（高亮定位）+ 切分后的 token（匹配用） */
export interface SearchTerm {
  /** 原文形式 */
  text: string
  /** 切分后的 token 序列 */
  tokens: string[]
}

/** 把用户输入解析成词组 */
export function parseQuery(query: string): SearchTerm[] {
  return segmentQuery(query).map((text) => ({
    text,
    tokens: segmentText(text).split(' ').filter(Boolean),
  }))
}

/** token 序列里是否包含 needle 这段连续子序列 */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return true
  if (needle.length > haystack.length) return false
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * 文本是否命中所有词组。
 *
 * 词组内要求连续（对应「折射」匹配「液态玻璃的折射效果」），
 * 词组之间是 AND。
 */
export function matchText(text: string, terms: SearchTerm[]): boolean {
  if (terms.length === 0) return true
  const tokens = segmentText(text).split(' ').filter(Boolean)
  return terms.every((term) => containsSequence(tokens, term.tokens))
}

/** 文本里所有命中区间（合并重叠） */
function findRanges(text: string, terms: SearchTerm[]): [number, number][] {
  const lower = text.toLowerCase()
  const ranges: [number, number][] = []

  for (const term of terms) {
    const needle = term.text.toLowerCase()
    if (!needle) continue
    let at = lower.indexOf(needle)
    while (at !== -1) {
      ranges.push([at, at + needle.length])
      at = lower.indexOf(needle, at + needle.length)
    }
  }

  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  return merged
}

/** 高亮的一段文本 */
export interface HighlightPart {
  text: string
  /** 是否命中 */
  hit: boolean
}

/**
 * 把文本切成「命中 / 未命中」的片段，供渲染时包 <mark>。
 *
 * 命中位置按词组的原文形式找（大小写不敏感）——
 * 匹配用切分后的 token，高亮用原文，两边对得上。
 */
export function highlightParts(text: string, terms: SearchTerm[]): HighlightPart[] {
  const ranges = findRanges(text, terms)
  if (ranges.length === 0) return [{ text, hit: false }]

  const parts: HighlightPart[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false })
    parts.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts
}
