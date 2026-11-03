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
  // 开头那个 BOM 是给静态托管看的：.md 文件多半没有 charset 头，
  // 浏览器会按本地编码猜（中文系统就按 GBK 猜）—— 满屏乱码。
  // BOM 让它一眼认出 UTF-8；带 charset 头的那条路（开发环境的按需响应）也留着。
  new Response('\uFEFF' + (props as { body: string }).body, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
