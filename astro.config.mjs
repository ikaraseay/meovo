// @ts-check
import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import preact from '@astrojs/preact'
import cloudflare from '@astrojs/cloudflare'

export default defineConfig({
  // 站点根地址 —— canonical / hreflang / sitemap / RSS / OG 全靠它拼绝对地址
  // 模版里是**占位符** —— 真值在 config.env，构建前由 scripts/apply-config.mjs 填回来
  site: 'https://example.com',

  // 源码分三层：frontend/ 是站点（Astro 的 srcDir），backend/ 是后台逻辑，
  // cloudflare/ 是部署配置（wrangler + 静态资源）。
  srcDir: './frontend',
  publicDir: './cloudflare/public',

  // on-demand 路由（后台接口、图片）要一个服务端运行时；
  // wrangler 配置搬到 cloudflare/ 了，得告诉适配器去哪儿找
  adapter: cloudflare({
    configPath: './cloudflare/wrangler.jsonc',
    // 本地状态跟 wrangler CLI 放一处 —— 否则 dev server 与 CLI 各写一个本地 D1，
    // 后台发的稿子导出时找不到
    persistState: { path: './cloudflare/.wrangler/state' },
  }),

  integrations: [
    // MDX：在 Markdown 之外允许写 JSX 组件
    mdx(),
    // Preact：给 Hero 流体光标这类交互提供岛屿（client:visible）
    preact(),
  ],

  markdown: {
    shikiConfig: {
      // 明暗两套高亮主题。defaultColor: false 让 Shiki 只写 CSS 变量
      // （--shiki-light / --shiki-dark），由 styles/prose.css 决定什么时候切。
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: false,
    },
  },

  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: {
      // 默认语言也带前缀：/zh/ 与 /en/ 对称，hreflang 与 sitemap 规则统一
      prefixDefaultLocale: true,
    },
    // 注意：没有配 i18n.fallback。
    // 「某篇文章只有中文」的情况由 src/lib/posts.ts 自己处理 ——
    // 生成 /en/posts/<slug>/ 路由并渲染中文原文 + 「暂无英文版」标注。
    // 交给 Astro 的 fallback 机制会和动态路由抢路由，反而出告警。
  },
})
