/**
 * 文章的 Markdown 原文 —— 协议卡上「查看 Markdown 原文」指向的地方。
 * ---------------------------------------------------------
 * 静态输出：每篇可见文章一个 .md 文件，内容是正文原文（不含 frontmatter）。
 * 草稿与定时未到的文章不生成（走 getVisiblePosts 的可见性判定）。
 */
import type { APIRoute } from 'astro'
import { getVisiblePosts } from '../../../lib/content-queries'
import { getPostLocale, getPostSlug } from '../../../lib/post-identity'

export async function getStaticPaths() {
  const posts = await getVisiblePosts()
  return posts.map((post) => ({
    params: { lang: getPostLocale(post), slug: getPostSlug(post) },
    props: { body: post.body ?? '' },
  }))
}

export const GET: APIRoute = ({ props }) =>
  new Response((props as { body: string }).body, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
