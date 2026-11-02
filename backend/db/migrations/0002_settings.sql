-- 后台改过的默认文字。
--
-- key   —— i18n key（site.name / nav.home / post.publishedOn …）
-- value —— JSON：{"zh":"中文","en":"English"}
--
-- 只存**改过的**：跟默认值一样的条目不落库（重置就是删行）。
-- 构建期由 backend/scripts/export-d1-posts.mjs 导出成
-- frontend/content/generated/i18n-overrides.json，站点构建时叠在词典上。
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
