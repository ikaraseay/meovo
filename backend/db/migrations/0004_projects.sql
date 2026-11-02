-- 项目：关于页那张卡片里的项目（名称 / 简介 / 地址）
-- ⚠️ 改了这份文件要再跑一次：wrangler d1 migrations apply meovo-content --remote

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,          -- uuid
  name        TEXT NOT NULL,             -- 项目名
  description TEXT NOT NULL DEFAULT '',  -- 一句话简介
  url         TEXT NOT NULL,             -- 项目地址
  sort_order  INTEGER NOT NULL DEFAULT 0,-- 排序（小在前）
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_projects_order ON projects(sort_order, created_at);
