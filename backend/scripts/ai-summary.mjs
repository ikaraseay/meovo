#!/usr/bin/env node
/**
 * 构建期 AI 摘要生成 —— 用 Cloudflare Workers AI 给每段生成摘要。
 * ---------------------------------------------------------
 * TextFold 的「两句 / 一句」模式用这些摘要替代规则切句。
 * 只生成一次：摘要缓存在 frontend/content/generated/.summaries.json，
 * 文章 updated_at 没变就不重新生成。
 *
 * 凭证走环境变量（与 export-d1-posts.mjs 相同）：
 *   CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
 *
 * 模型选 @cf/meta/llama-3.3-70b-instruct-fp8-fast —— 70B 大模型，
 * 中文能力比 8B 强很多，Cloudflare 免费额度够个人博客用。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
 * 缓存文件路径
 */
function cachePath(root) {
  return join(root, 'frontend/content/generated/.summaries.json')
}

/**
 * 读取缓存的摘要。
 * @param {string} root - 仓库根
 * @returns {Map<string, {updated_at: string, summaries: string[]}>}
 */
export function readCache(root) {
  const path = cachePath(root)
  if (!existsSync(path)) return new Map()
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return new Map(Object.entries(data))
  } catch {
    return new Map()
  }
}

/**
 * 写入缓存。
 * @param {string} root - 仓库根
 * @param {Map<string, {updated_at: string, summaries: string[]}>} cache
 */
export function writeCache(root, cache) {
  const path = cachePath(root)
  const obj = Object.fromEntries(cache)
  writeFileSync(path, JSON.stringify(obj, null, 2), 'utf8')
}

/**
 * 为单篇文章生成摘要。
 * @param {object} post - { slug, locale, body, updated_at }
 * @param {object} opts - { token, accountId, cache, root }
 * @returns {Promise<string[]|null>} 每段摘要数组，失败返回 null
 */
export async function summarizePost(post, { token, accountId, cache, root }) {
  const key = `${post.locale}/${post.slug}`
  const cached = cache.get(key)

  // 文章没变 —— 直接用缓存
  if (cached && cached.updated_at === post.updated_at && cached.summaries?.length > 0) {
    return cached.summaries
  }

  // 提取段落（与 text-fold.ts 的规则一致：只取直接子 p，跳过媒体段落）
  const paragraphs = extractParagraphs(post.body)
  if (paragraphs.length === 0) return null

  console.log(`[ai] 生成摘要：${key}（${paragraphs.length} 段）`)

  const summaries = []
  for (let i = 0; i < paragraphs.length; i++) {
    const messages = buildMessages(paragraphs[i], post.locale)
    const raw = await generateSummary(messages, { token, accountId })

    if (!raw) {
      console.warn(`[ai] 第 ${i + 1} 段失败，跳过整篇`)
      return null
    }

    // 清理 + 验证
    const summary = cleanSummaryOutput(raw)
    if (!validateSummary(summary, paragraphs[i], post.locale)) {
      console.warn(`[ai] 第 ${i + 1} 段质量不合格：${summary.slice(0, 50)}...`)
      return null
    }

    summaries.push(summary)
    // 避免触发速率限制
    await new Promise((r) => setTimeout(r, 300))
  }

  // 写入缓存
  cache.set(key, { updated_at: post.updated_at, summaries })
  writeCache(root, cache)

  return summaries
}

/**
 * 从 markdown 正文提取段落（纯文本）。
 * 规则：按空行分段，跳过标题 / 列表 / 代码块 / 含媒体的段落。
 * @param {string} body - markdown 正文
 * @returns {string[]}
 */
function extractParagraphs(body) {
  if (!body) return []

  const lines = body.split('\n')
  const paragraphs = []
  let current = []
  let inCodeBlock = false

  for (const line of lines) {
    // 代码块跳过
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      if (current.length > 0) {
        paragraphs.push(current.join('\n').trim())
        current = []
      }
      continue
    }
    if (inCodeBlock) continue

    // 空行 = 段落分隔
    if (line.trim() === '') {
      if (current.length > 0) {
        const text = current.join('\n').trim()
        // 跳过标题、列表、含媒体标记的段落
        if (!isSkippable(text)) {
          paragraphs.push(stripMarkdown(text))
        }
        current = []
      }
      continue
    }

    current.push(line)
  }

  // 最后一段
  if (current.length > 0) {
    const text = current.join('\n').trim()
    if (!isSkippable(text)) {
      paragraphs.push(stripMarkdown(text))
    }
  }

  return paragraphs
}

/**
 * 是否应该跳过这段（标题 / 列表 / 纯媒体）
 */
function isSkippable(text) {
  const firstLine = text.split('\n')[0]
  // 标题
  if (firstLine.startsWith('#')) return true
  // 列表
  if (/^[\s]*[-*+]\s/.test(firstLine)) return true
  if (/^[\s]*\d+\.\s/.test(firstLine)) return true
  // 纯图片 / 视频 / iframe
  if (/^!\[.*\]\(.*\)$/.test(text.trim())) return true
  if (/^<\s*(img|video|iframe|audio|canvas|svg|object|embed)/.test(text.trim())) return true
  return false
}

/**
 * 去掉 markdown 标记（保留纯文本给 AI）
 */
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/!\[.*?\]\(.+?\)/g, '') // images
    .replace(/^>\s*/gm, '') // blockquotes
    .trim()
}

/**
 * 批量为多篇文章生成摘要。
 * @param {Array} posts - 文章列表
 * @param {object} opts - { token, accountId, root }
 * @returns {Promise<Map<string, string[]>>} key -> summaries
 */
export async function summarizeAll(posts, { token, accountId, root }) {
  if (!token || !accountId) {
    console.warn('[ai] 没有 Cloudflare 凭证，跳过摘要生成')
    return new Map()
  }

  const cache = readCache(root)
  const results = new Map()

  for (const post of posts) {
    const summaries = await summarizePost(post, { token, accountId, cache, root })
    if (summaries) {
      results.set(`${post.locale}/${post.slug}`, summaries)
    }
  }

  return results
}
