-- 评论：读者留言（昵称 / 邮箱 / 个人网站）+ 后台审核
-- ⚠️ 改了这份文件要再跑一次：wrangler d1 migrations apply meovo-content --remote

CREATE TABLE comments (
  id         TEXT PRIMARY KEY,                -- uuid
  slug       TEXT NOT NULL,                   -- 文章 slug（各语言版本同 slug，评论共用一条线程）
  name       TEXT NOT NULL,                   -- 昵称
  email      TEXT NOT NULL,                   -- 只在后台可见；公开接口只给哈希后的头像地址
  website    TEXT NOT NULL DEFAULT '',        -- 个人网站（可空）
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | approved | spam
  ip_hash    TEXT NOT NULL DEFAULT '',        -- IP 的 SHA-256 —— 只用来限流，不存原始 IP
  created_at TEXT NOT NULL
);

CREATE INDEX idx_comments_slug ON comments(slug, status, created_at);
CREATE INDEX idx_comments_ip ON comments(ip_hash, created_at);
