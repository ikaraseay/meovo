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

/** 一个 token：切出来的词 + 它在原文里的位置 */
interface Token {
  text: string
  start: number
  end: number
}

/**
 * 把文本切成带位置的 token 流。
 *
 * - 中文逐字拆开（"液态玻璃" → "液 态 玻 璃"）
 * - 拉丁词整体保留并转小写（"Cloudflare Workers" → "cloudflare workers"）
 * - 其余字符（标点、空白）当分隔符丢掉
 *
 * 位置是给高亮用的 —— 命中判定知道了 token 落在哪，
 * 把位置换算回字符区间就行，不用再拿原文猜一遍。
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let buffer = ''
  let start = 0

  const flush = () => {
    if (buffer) {
      tokens.push({ text: buffer.toLowerCase(), start, end: start + buffer.length })
      buffer = ''
    }
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (CJK.test(char)) {
      flush()
      tokens.push({ text: char, start: i, end: i + 1 })
    } else if (WORD_CHAR.test(char)) {
      if (!buffer) start = i
      buffer += char
    } else {
      flush()
    }
  }
  flush()

  return tokens
}

/** token 流拼成的字符串（索引与查询共用） */
export function segmentText(text: string): string {
  return tokenize(text)
    .map((token) => token.text)
    .join(' ')
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
  const tokens = tokenize(text).map((token) => token.text)
  return terms.every((term) => containsSequence(tokens, term.tokens))
}

/**
 * 文本里所有命中区间（合并重叠）。
 *
 * 区间从**同一个 token 匹配**推出来 —— 高亮是匹配的结果，不是另一次查找：
 * 按原文 indexOf 找，会把「折-射」里的折射判成没命中，
 * 又把 Cloudflare 里的 Cloud 判成命中。
 */
function findRanges(text: string, terms: SearchTerm[]): [number, number][] {
  const tokens = tokenize(text)
  const ranges: [number, number][] = []

  for (const term of terms) {
    if (term.tokens.length === 0) continue
    for (let i = 0; i + term.tokens.length <= tokens.length; i++) {
      let matched = true
      for (let j = 0; j < term.tokens.length; j++) {
        if (tokens[i + j].text !== term.tokens[j]) {
          matched = false
          break
        }
      }
      if (!matched) continue
      ranges.push([tokens[i].start, tokens[i + term.tokens.length - 1].end])
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
 * 区间来自 token 匹配 —— 跟 matchText 同一套规则：
 * 没在这个字段里命中的词组不会在这里留下高亮。
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
