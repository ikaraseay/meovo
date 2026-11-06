import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site, url }) => {
  /** site 没配时退回请求来源，域名只在 astro.config.mjs 里写一处 */
  const sitemap = new URL('sitemap.xml', site ?? url)
  const llmsTxt = new URL('llms.txt', site ?? url)

  /**
   * robots.txt —— 搜索引擎与 LLM 爬虫指令
   *
   * 允许所有常规搜索引擎爬虫；对 LLM 训练用途的爬虫（GPTBot、ClaudeBot 等）
   * 明确允许抓取，以便站点内容可被用于 LLM 相关产品。
   * 如需禁止 LLM 训练，将对应 User-agent 改为 Disallow: /
   */
  const body = `# robots.txt for ${sitemap.hostname}

# 常规搜索引擎
User-agent: *
Allow: /

# OpenAI / ChatGPT
User-agent: GPTBot
Allow: /

# Anthropic / Claude
User-agent: ClaudeBot
Allow: /

# Google LLM
User-agent: Google-Extended
Allow: /

# Common Crawl（用于 LLM 训练数据）
User-agent: CCBot
Allow: /

# Perplexity
User-agent: PerplexityBot
Allow: /

# Cohere
User-agent: cohere-ai
Allow: /

# 站点地图
Sitemap: ${sitemap.href}

# LLM 友好元数据
LLMs-txt: ${llmsTxt.href}
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
