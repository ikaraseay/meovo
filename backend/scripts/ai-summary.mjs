#!/usr/bin/env node
/**
 * 构建期 AI 摘要生成 —— 用 Cloudflare Workers AI 给每段生成摘要。
 * ---------------------------------------------------------
 * TextFold 的「两句 / 一句」模式用这些摘要替代规则切句。
 * 只生成一次：摘要缓存在 D1 的 ai_summaries 表（构建时读、生成后写回），
 * 文章 updated_at 没变就不重新生成。
 *
 * 缓存为什么放 D1 而不是 git：Workers Builds 每次从干净检出开始，
 * 缓存进 git 等于没有 —— 后台改一篇内容，也会让每次部署重跑全部文章的模型。
 *
 * 凭证走环境变量（与 export-d1-posts.mjs 相同）：
 *   CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
 *
 * 模型选 @cf/meta/llama-3.3-70b-instruct-fp8-fast —— 70B 大模型，
 * 中文能力比 8B 强很多，Cloudflare 免费额度够个人博客用。
 */

import { foldKey } from '../../frontend/lib/text-fold-key.ts'
import { sqlText } from './d1-query.mjs'

/** Cloudflare Workers AI 端点 */
const API_BASE = 'https://api.cloudflare.com/client/v4/accounts'
/** 模型 —— Llama 3.3 70B，比 8B 中文能力强很多 */
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
/** 每段摘要的目标长度（tokens） */
const MAX_TOKENS = 150
/** API 超时（毫秒） */
const TIMEOUT_MS = 30000

/**
 * 调 Cloudflare Workers AI 生成摘要。
 * @param {Array} messages - OpenAI 格式的消息数组
 * @param {object} opts - { token, accountId }
 * @returns {Promise<string|null>} 摘要文本，失败返回 null
 */
async function generateSummary(messages, { token, accountId }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE}/${accountId}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.3, // 低温度，输出更稳定
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const text = await response.text()
      console.warn(`[ai] API 返回 ${response.status}：${text.slice(0, 200)}`)
      return null
    }

    const data = await response.json()
    // Workers AI chat 模型返回 OpenAI 兼容格式：
    // { result: { choices: [{ message: { content: "..." } }] } }
    return data.result?.choices?.[0]?.message?.content?.trim() || null
  } catch (error) {
    clearTimeout(timeout)
    console.warn(`[ai] 请求失败：${error.message}`)
    return null
  }
}

/**
 * 构造摘要消息 —— 锁定输出格式，防止模型跑偏。
 * @param {string} paragraph - 段落原文
 * @param {string} locale - 语言（zh / en）
 * @returns {Array} OpenAI 格式的消息数组
 */
function buildMessages(paragraph, locale) {
  const lang = locale === 'zh' ? '中文' : 'English'
  const maxChars = locale === 'zh' ? 100 : 200

  // 用 JSON 格式锁死输出结构，避免模型加前缀 / 推理过程 / 重复原文
  const systemPrompt = `你是摘要生成 API。只输出合法的 JSON，不加任何解释。

规则：
- 用 1 句话概括段落核心（${lang}，不超过 ${maxChars} 字）
- 用自己的话重述，不要照搬原文
- 不加前缀（如"摘要："、"Summary："、"译："）
- 不加省略号或尾部标记
- 不输出推理过程

输出格式：{"summary": "你的一句话摘要"}`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: paragraph },
  ]
}

/**
 * 清理 AI 输出 —— 去掉常见脏标记。
 * @param {string} raw - AI 原始返回
 * @returns {string} 清理后的文本
 */
function cleanSummaryOutput(raw) {
  if (!raw) return ''

  let text = raw.trim()

  // 尝试解析 JSON（新 prompt 要求的格式）
  const jsonMatch = text.match(/\{[\s\S]*?"summary"[\s\S]*?:[\s\S]*?"([\s\S]*?)"[\s\S]*\}/)
  if (jsonMatch) {
    text = jsonMatch[1]
  } else {
    // 回退：旧格式或模型没按规矩来，直接取文本
    // 去掉可能的 markdown 代码块标记
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }

  // 去掉常见前缀
  text = text.replace(/^(摘要|总结|Summary|译|Translation)[:：]\s*/i, '')

  // 去掉开头的省略号
  text = text.replace(/^[.…。]+\s*/, '')

  // 去掉结尾的省略号
  text = text.replace(/\s*[.…。]+$/, '')

  // 去掉推理过程标记（## Step, 【思考】等）
  text = text.replace(/^(##\s+Step\s+\d+[:：]|【[^】]*】)\s*/gm, '')

  // 去掉多余的引号
  text = text.replace(/^["']|["']$/g, '')

  return text.trim()
}

/**
 * 验证摘要质量 —— 不合格就丢弃。
 * @param {string} summary - 清理后的摘要
 * @param {string} original - 原文
 * @param {string} locale - 语言
 * @returns {boolean} 是否合格
 */
function validateSummary(summary, original, locale) {
  if (!summary || summary.length < 10) return false

  // 长度上限
  const maxLen = locale === 'zh' ? 100 : 200
  if (summary.length > maxLen * 1.5) return false

  // 不能包含明显的 AI 痕迹
  const forbidden = [
    /^(##|Step|【|Think|Reason)/i,
    /译[：:]|Translation:/i,
    /As an AI|作为 AI|我是一个 AI/i,
    /\.{3,}|。{3,}|…{3,}/,
  ]
  if (forbidden.some((re) => re.test(summary))) return false

  // 不能跟原文太像（简单检查：前 20 字的相似度）
  const origStart = original.slice(0, 50).trim()
  const sumStart = summary.slice(0, 50).trim()
  if (origStart && sumStart && origStart === sumStart) return false

  return true
}

/**
 * 缓存格式版本 —— 段落键的算法一改就得 +1。
 * 旧缓存里的旧键跟新键对不上，不换版本就会拿旧摘要当新的用（或者一条都取不到）。
 */
const CACHE_VERSION = 2

/**
 * 读缓存 —— 缓存在 D1 的 ai_summaries 表，不在 git 里。
 * @param {(sql: string) => Promise<any[]>} query - D1 查询函数
 * @returns {Promise<Map<string, {updated_at: string, version: number, summaries: Record<string, string>}>>}
 */
export async function readCache(query) {
  const rows = await query('SELECT key, version, updated_at, summaries FROM ai_summaries')
  const cache = new Map()
  for (const row of rows) {
    try {
      cache.set(row.key, {
        updated_at: row.updated_at,
        version: Number(row.version ?? 0),
        summaries: JSON.parse(row.summaries),
      })
    } catch {
      // 坏行只丢这一行 —— 别让一行脏数据把整份缓存作废
    }
  }
  return cache
}

/**
 * 写回缓存 —— 一篇文章一行。
 * @param {(sql: string) => Promise<any[]>} query - D1 查询函数
 * @param {string} key - locale/slug
 * @param {{updated_at: string, summaries: Record<string, string>}} entry
 */
export async function writeCache(query, key, entry) {
  await query(
    'INSERT OR REPLACE INTO ai_summaries (key, version, updated_at, summaries, created_at) VALUES (' +
      sqlText(key) +
      ', ' +
      CACHE_VERSION +
      ', ' +
      sqlText(entry.updated_at) +
      ', ' +
      sqlText(JSON.stringify(entry.summaries)) +
      ', ' +
      sqlText(new Date().toISOString()) +
      ')',
  )
}

/**
 * 为单篇文章生成摘要。
 *
 * 摘要按「段落键 → 摘要」存，不按数组下标存：构建期与运行时的段落集合并不完全一样
 * （引用块、水平线、含媒体的段落运行时不会折），按下标对齐迟早错位，
 * 错位就是把别的段落的摘要贴到这一段上。键对不上就当这段没有摘要。
 *
 * @param {object} post - { slug, locale, body, updated_at }
 * @param {object} opts - { token, accountId, cache, root }
 * @returns {Promise<Record<string,string>|null>} 段落键 → 摘要，一段都没成功返回 null
 */
export async function summarizePost(post, { token, accountId, cache, query }) {
  const key = `${post.locale}/${post.slug}`
  const paragraphs = extractParagraphs(post.body)
  if (paragraphs.length === 0) return null

  const summaries = {}
  const cached = cache.get(key)
  // 文章没变 —— 已经有的段落摘要直接复用
  if (cached && cached.version === CACHE_VERSION && cached.updated_at === post.updated_at) {
    Object.assign(summaries, cached.summaries)
  }

  const todo = paragraphs.filter((para) => !(para.key in summaries))
  if (todo.length > 0) {
    console.log(`[ai] 生成摘要：${key}（${todo.length}/${paragraphs.length} 段）`)

    for (const para of todo) {
      const messages = buildMessages(para.text, post.locale)
      const raw = await generateSummary(messages, { token, accountId })
      const summary = raw ? cleanSummaryOutput(raw) : ''

      if (summary && validateSummary(summary, para.text, post.locale)) {
        summaries[para.key] = summary
      } else {
        // 一段失败只丢这一段 —— 整篇丢的话，模型抽一次风整篇文章就没摘要了
        console.warn(`[ai] 段落摘要不合格，跳过：${summary.slice(0, 50)}`)
      }

      // 避免触发速率限制
      await new Promise((r) => setTimeout(r, 300))
    }

    // 写回缓存（失败的段不在里面 —— 下次构建会再试一次）
    const entry = { updated_at: post.updated_at, summaries }
    cache.set(key, { ...entry, version: CACHE_VERSION })
    try {
      await writeCache(query, key, entry)
    } catch (error) {
      console.warn('[ai] 摘要缓存写回失败（不影响这次构建）：' + error.message)
    }
  }

  return Object.keys(summaries).length > 0 ? summaries : null
}

/**
 * 从 markdown 正文提取段落（纯文本）。
 *
 * 口径必须跟运行时（frontend/lib/text-fold.ts）对齐：运行时只折 .prose 下的直系 p，
 * 所以标题 / 列表 / 水平线 / 引用块 / 含媒体的段落在这里都要跳过。
 *
 * @param {string} body - markdown 正文
 * @returns {Array<{text: string, key: string}>} 段落原文与它的键
 */
export function extractParagraphs(body) {
  if (!body) return []

  const lines = body.split('\n')
  const paragraphs = []
  let current = []
  let inCodeBlock = false

  /** 收一段：跳过不该折的，剩下的记下原文与键 */
  const flush = () => {
    if (current.length === 0) return
    const raw = current.join('\n').trim()
    current = []
    if (isSkippable(raw)) return
    const text = stripMarkdown(raw).replace(/\s+/g, ' ').trim()
    if (!text) return
    paragraphs.push({ text, key: foldKey(text) })
  }

  for (const line of lines) {
    // 代码块跳过
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      flush()
      continue
    }
    if (inCodeBlock) continue

    // 空行 = 段落分隔
    if (line.trim() === '') {
      flush()
      continue
    }

    current.push(line)
  }

  flush()

  return paragraphs
}

/** 水平线（--- / *** / ___） */
const HR = /^([-*_])(?:\s*\1){2,}\s*$/
/** 引用块 */
const QUOTE = /^>/
/** 含媒体的段落 —— 运行时按媒体跳过，这里也得跳过 */
const MEDIA = /!\[[^\]]*\]\(|<(?:img|video|iframe|audio|canvas|svg|object|embed)[\s>]/i

/**
 * 是否应该跳过这段（标题 / 列表 / 水平线 / 引用 / 含媒体）
 */
function isSkippable(text) {
  const firstLine = text.split('\n')[0]
  // 标题
  if (firstLine.startsWith('#')) return true
  // 列表
  if (/^[\s]*[-*+]\s/.test(firstLine)) return true
  if (/^[\s]*\d+\.\s/.test(firstLine)) return true
  // 水平线
  if (HR.test(text)) return true
  // 引用块
  if (QUOTE.test(firstLine)) return true
  // 图片 / 视频 / iframe（段落里带媒体的，运行时整段不折）
  if (MEDIA.test(text)) return true
  return false
}

/**
 * 去掉 markdown 标记（保留纯文本给 AI）
 */
function stripMarkdown(text) {
  return text
    .replace(/!\[.*?\]\(.+?\)/g, '') // 图片（要先去掉，否则链接规则会把 alt 留下来）
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/~~(.+?)~~/g, '$1') // strikethrough
    .replace(/^>\s*/gm, '') // blockquotes
    .trim()
}

/**
 * 批量为多篇文章生成摘要。
 * @param {Array} posts - 文章列表
 * @param {object} opts - { token, accountId, root }
 * @returns {Promise<Map<string, string[]>>} key -> summaries
 */
export async function summarizeAll(posts, { token, accountId, query }) {
  if (!token || !accountId) {
    console.warn('[ai] 没有 Cloudflare 凭证，跳过摘要生成')
    return new Map()
  }

  let cache = new Map()
  try {
    cache = await readCache(query)
  } catch (error) {
    // 表还没建 / 读不到 —— 只是没有缓存，照样生成，只是慢一点
    console.warn('[ai] 读摘要缓存失败（跑一次 d1 migrations apply 就能用上）：' + error.message)
  }

  const results = new Map()

  for (const post of posts) {
    const summaries = await summarizePost(post, { token, accountId, cache, query })
    if (summaries) {
      results.set(`${post.locale}/${post.slug}`, summaries)
    }
  }

  return results
}
