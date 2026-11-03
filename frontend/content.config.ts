import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { glob } from 'astro/loaders'
import { LICENSE_IDS } from './lib/licenses.ts'
import { SLUG_PATTERN } from './lib/slug.ts'

/**
 * 博客文章集合。
 *
 * 目录即语言：`frontend/content/blog/<locale>/<slug>.md(x)`
 * entry.id 形如 `zh/hello-world`，第一段是语言，其余是 slug。
 *
 * **约定**：同一个翻译组里的不同语言版本，**文件名必须一致**。
 * `zh/hello-world.md` 与 `en/hello-world.md` 互为翻译；
 * 只写 `zh/hello-world.md` 的话，英文站会自动显示中文原文并标注「暂无英文版」。
 */

/** frontmatter —— 手写与后台导出的两个集合共用一份 */
const postSchema = z.object({
  /** 标题（各语言各自写） */
  title: z.string(),
  /** 摘要，用于列表页与 SEO description */
  description: z.string(),
  /** 发布日期 */
  pubDate: z.coerce.date(),
  /** 最后更新日期，有值时文章页会显示「更新于」 */
  updatedDate: z.coerce.date().optional(),
  /** 草稿：生产构建不输出（开发环境可见） */
  draft: z.boolean().default(false),
  /** 分类，一篇只能属于一个 —— ASCII slug（后台同一条规则） */
  category: z
    .string()
    .regex(SLUG_PATTERN, '分类必须是 ASCII slug（小写字母、数字、连字符）')
    .optional(),
  /** 标签，一篇可以有多个 —— 逐项都是 ASCII slug */
  tags: z
    .array(z.string().regex(SLUG_PATTERN, '标签必须是 ASCII slug（小写字母、数字、连字符）'))
    .default([]),
  /** 许可协议 —— 不写就用全站默认（CC BY 4.0）；取值见 frontend/lib/licenses.ts */
  license: z.enum(LICENSE_IDS).default('cc-by'),
  /** 系列文章：同一 id 的文章属于一个系列 */
  series: z
    .object({
      /** 系列标识，ASCII slug，跨语言共用 —— 决定 /<lang>/series/<id>/ 这一页 */
      id: z.string().regex(SLUG_PATTERN, '系列 id 必须是 ASCII slug（小写字母、数字、连字符）'),
      /** 系列标题，每个语言各写各的 */
      title: z.string(),
      /** 在系列里的序号，从 1 开始，不写就排在最后 */
      order: z.number().optional(),
    })
    .optional(),
})

const blog = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './frontend/content/blog',
    // 文章多了以后不必在构建期把所有正文都渲染出来，用到哪篇渲染哪篇
    deferRender: true,
  }),
  schema: postSchema,
})

/**
 * 后台发布的文章 —— 构建期由 backend/scripts/export-d1-posts.mjs 导到这里。
 *
 * 目录跟手写的 blog/ 分开：导出会重建整个目录，绝不碰作者手写的文件。
 * 目录即语言这条约定不变 —— entry.id 仍是 `zh/<slug>` 的形态。
 */
const blogGenerated = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './frontend/content/generated',
    deferRender: true,
  }),
  schema: postSchema,
})

export const collections = { blog, blogGenerated }
