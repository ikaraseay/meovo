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
 * 模型选 @cf/meta/llama-3.1-8b-instruct —— 免费额度够个人博客用，
 * 中英文都过得去。换模型改 MODEL 常量。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 摘要模型 —— 免费额度每天 10,000 neurons，这个模型约 130K 输出 tokens/天 */
const MODEL = '@cf/meta/llama-3.1-8b-instruct'
/** 每段摘要的目标长度（tokens） */
const MAX_TOKENS = 100
/** API 超时（毫秒） */
const TIMEOUT_MS = 30000

/** Cloudflare Workers AI REST API 端点 */
function aiEndpoint(accountId) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`
}

/**
 * 调 Cloudflare AI 生成摘要。
 * @param {string} prompt - 提示词（含段落内容）
 * @param {object} opts - { token, accountId }
 * @returns {Promise<string|null>} 摘要文本，失败返回 null
 */
async function generateSummary(prompt, { token, accountId }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(aiEndpoint(accountId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        max_tokens: MAX_TOKENS,
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
    // Workers AI 返回格式：{ result: { response: "..." }, success: true }
    return data.result?.response?.trim() || null
  } catch (error) {
    clearTimeout(timeout)
    console.warn(`[ai] 请求失败：${error.message}`)
    return null
  }
}

/**
 * 构造摘要提示词。
 * @param {string} paragraph - 段落原文
 * @param {string} locale - 语言（zh / en）
 * @returns {string}
 */
function buildPrompt(paragraph, locale) {
  const lang = locale === 'zh' ? '中文' : 'English'
  // 提示词用英文（模型训练数据多），但要求输出指定语言
  return `Summarize the following paragraph in 1-2 sentences in ${lang}. Keep the key information and maintain the original tone. Output only the summary, no prefix.

---
${paragraph}
---`
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
    const prompt = buildPrompt(paragraphs[i], post.locale)
    const summary = await generateSummary(prompt, { token, accountId })

    if (!summary) {
      console.warn(`[ai] 第 ${i + 1} 段失败，跳过整篇`)
      return null
    }

    summaries.push(summary)
    // 避免触发速率限制（每分钟 300 请求，但保守点）
    await new Promise((r) => setTimeout(r, 200))
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
