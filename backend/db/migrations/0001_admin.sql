-- 后台的数据层：文档草稿 / 图库元数据 / 登录限流
-- ⚠️ 改了这份文件要再跑一次：wrangler d1 migrations apply meovo-content --remote

CREATE TABLE documents (
  id            TEXT PRIMARY KEY,                 -- uuid
  slug          TEXT NOT NULL,                    -- ASCII slug，全语言共用（= 翻译键）
  locale        TEXT NOT NULL,                    -- zh | en
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  pub_date      TEXT,                             -- ISO 8601；未来时间 = 定时发布
  updated_date  TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',    -- draft | published
  category      TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',       -- JSON 数组
  series_id     TEXT,
  series_title  TEXT,
  series_order  INTEGER,
  license       TEXT NOT NULL DEFAULT 'cc-by',     -- 取值同 src/lib/licenses.ts
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  published_at  TEXT,
  UNIQUE (slug, locale)
);

CREATE TABLE media (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,                -- R2 object key
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- 登录尝试限流（按 IP）
CREATE TABLE login_attempts (
  ip        TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  window_at TEXT NOT NULL
);

CREATE INDEX idx_documents_status ON documents(status);
