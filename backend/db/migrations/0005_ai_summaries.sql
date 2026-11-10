-- AI 段落摘要的缓存。
--
-- 摘要在构建期生成（backend/scripts/ai-summary.mjs 调 Workers AI），
-- 产物 frontend/data/article-summaries.ts 进站点，但**缓存不进 git**：
-- Workers Builds 每次从干净检出开始，缓存放 git 里等于没有 ——
-- 后台改一篇内容，也会让每次部署把全部文章的摘要重跑一遍。
--
-- 所以缓存放 D1：构建时读，生成后写回。跟 settings 表同构。
--
-- version —— 段落键的算法一改就 +1（ai-summary.mjs 的 CACHE_VERSION）：
-- 旧键跟新键对不上，不认版本就会把旧摘要当成新的用（或者一条都取不到）。
--
-- ⚠️ 改了这份文件要再跑一次：wrangler d1 migrations apply blog-db --remote
CREATE TABLE IF NOT EXISTS ai_summaries (
  key        TEXT PRIMARY KEY,   -- locale/slug
  version    INTEGER NOT NULL,   -- 缓存格式版本
  updated_at TEXT NOT NULL,      -- 文章的 updated_at —— 变了才重算
  summaries  TEXT NOT NULL,      -- JSON：{ 段落键: 摘要 }
  created_at TEXT NOT NULL
);
