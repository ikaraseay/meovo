import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site, url }) => {
  /** site 没配时退回请求来源，域名只在 astro.config.mjs 里写一处 */
  const sitemap = new URL('sitemap.xml', site ?? url)
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
